import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ConfigService } from '../../../core/services/config.service';
import { StatusService } from '../../../core/services/status.service';
import { DatasEspeciais } from '../datas-especiais/datas-especiais';

type Janela = 'frequencia' | 'repeticao' | 'cupons';

interface Ritmo {
  id: string;
  nome: string;
  descricao: string;
  min: number;
  max: number;
}

/** Ritmos prontos: a maioria das pessoas só quer escolher um e seguir. */
const RITMOS: Ritmo[] = [
  { id: 'tranquilo', nome: 'Tranquilo', descricao: 'Poucas mensagens, grupo sem cansar', min: 45, max: 90 },
  { id: 'equilibrado', nome: 'Equilibrado', descricao: 'O ritmo recomendado para a maioria', min: 20, max: 60 },
  { id: 'intenso', nome: 'Intenso', descricao: 'Muitas ofertas, para grupos bem ativos', min: 10, max: 25 },
];

const OPCOES_COOLDOWN = [
  { horas: 12, rotulo: '12 horas' },
  { horas: 24, rotulo: '1 dia' },
  { horas: 48, rotulo: '2 dias' },
  { horas: 72, rotulo: '3 dias' },
  { horas: 168, rotulo: '1 semana' },
];

const OPCOES_REPOSTAR = [
  { dias: 0, rotulo: 'Nunca' },
  { dias: 7, rotulo: '7 dias' },
  { dias: 14, rotulo: '14 dias' },
  { dias: 30, rotulo: '30 dias' },
];

const MAX_CUPONS = 50;

function textoHoras(h: number): string {
  if (!h) return 'sem espera';
  if (h % 24 === 0) {
    const d = h / 24;
    return d === 1 ? '1 dia' : `${d} dias`;
  }
  return h === 1 ? '1 hora' : `${h} horas`;
}

function postsPorDia(min: number, max: number): string {
  if (!min || !max || min > max) return '—';
  const muitos = Math.round((24 * 60) / min);
  const poucos = Math.round((24 * 60) / max);
  return poucos === muitos ? `${poucos}` : `${poucos} a ${muitos}`;
}

/** Teto diário do garimpo por grupo = máximo de postagens/dia (mesma conta do backend: cotaDiaria.js). */
function garimpoMaxPorDia(min: number, max: number): number | null {
  const menor = Math.min(...[min, max].filter((v) => v > 0));
  return Number.isFinite(menor) ? Math.max(1, Math.round((24 * 60) / menor)) : null;
}

/**
 * Regras de postagem em cards, igual às telas de Grupos e Lojas: cada card
 * mostra o que está valendo agora e o clique abre a janela para ajustar.
 * Salvar na janela já grava. Cupons moraram numa aba própria; aqui fazem
 * mais sentido — são mais uma regra de "o que vai para o grupo e com que
 * frequência".
 */
@Component({
  selector: 'app-regras-postagem',
  standalone: true,
  imports: [FormsModule, DatasEspeciais],
  templateUrl: './regras-postagem.html',
})
export class RegrasPostagem {
  protected configService = inject(ConfigService);
  protected statusService = inject(StatusService);

  protected readonly ritmos = RITMOS;
  protected readonly opcoesCooldown = OPCOES_COOLDOWN;
  protected readonly opcoesRepostar = OPCOES_REPOSTAR;
  protected readonly maxCupons = MAX_CUPONS;
  protected readonly textoHoras = textoHoras;
  protected readonly n = (v: unknown): number => Number(v) || 0;

  // ---- o que está salvo (cards) ---------------------------------------------

  private readonly cfg = computed(() => this.configService.config());

  protected readonly frequencia = computed(() => {
    const a = this.cfg()?.agendamento;
    const min = a?.intervaloMinMinutos ?? 20;
    const max = a?.intervaloMaxMinutos ?? 60;
    const ritmo = RITMOS.find((r) => r.min === min && r.max === max);
    return {
      min,
      max,
      porDia: postsPorDia(min, max),
      garimpoMax: garimpoMaxPorDia(min, max),
      ritmo: ritmo?.nome ?? 'Personalizado',
    };
  });

  protected readonly repeticao = computed(() => {
    const p = this.cfg()?.postagem;
    return { cooldownHoras: p?.cooldownHoras ?? 48, repostarAposDias: p?.repostarAposDias ?? 14 };
  });

  protected readonly cupons = computed(() => {
    const c = this.cfg()?.cupons;
    const ativo = c?.ativo ?? true;
    const produto = ativo ? c?.percentualProduto ?? 15 : 0;
    const lista = ativo ? c?.percentualSozinho ?? 10 : 0;
    return { ativo, produto, lista, ofertas: 100 - produto - lista };
  });

  protected readonly cuponsDisponiveis = computed(() => this.statusService.status()?.cuponsAtivos ?? null);

  // ---- janela de edição -------------------------------------------------------

  protected readonly janela = signal<Janela | null>(null);
  protected readonly salvando = signal(false);
  protected readonly erro = signal<string | null>(null);

  // rascunhos
  protected readonly rMin = signal(20);
  protected readonly rMax = signal(60);
  protected readonly rCooldown = signal(48);
  protected readonly rRepostar = signal(14);
  protected readonly rCupomAtivo = signal(true);
  protected readonly rCupomProduto = signal(15);
  protected readonly rCupomLista = signal(10);

  protected readonly rPorDia = computed(() => postsPorDia(Number(this.rMin()), Number(this.rMax())));
  protected readonly rGarimpoMax = computed(() => garimpoMaxPorDia(Number(this.rMin()), Number(this.rMax())));
  protected readonly rRitmo = computed(
    () => RITMOS.find((r) => r.min === Number(this.rMin()) && r.max === Number(this.rMax()))?.id ?? 'personalizado',
  );
  protected readonly rOfertas = computed(
    () => 100 - (this.rCupomAtivo() ? Number(this.rCupomProduto()) + Number(this.rCupomLista()) : 0),
  );
  protected readonly rSomaCupons = computed(() => Number(this.rCupomProduto()) + Number(this.rCupomLista()));
  /** O tempo mínimo vence a "repetição liberada": avisa quando um anula o outro. */
  protected readonly rConflitoRepeticao = computed(() => {
    const d = Number(this.rRepostar());
    return d > 0 && d * 24 < Number(this.rCooldown());
  });

  abrir(j: Janela): void {
    this.erro.set(null);
    const f = this.frequencia();
    const r = this.repeticao();
    const c = this.cfg()?.cupons;
    this.rMin.set(f.min);
    this.rMax.set(f.max);
    this.rCooldown.set(r.cooldownHoras);
    this.rRepostar.set(r.repostarAposDias);
    this.rCupomAtivo.set(c?.ativo ?? true);
    this.rCupomProduto.set(c?.percentualProduto ?? 15);
    this.rCupomLista.set(c?.percentualSozinho ?? 10);
    this.janela.set(j);
  }

  fechar(): void {
    if (this.salvando()) return;
    this.janela.set(null);
    this.erro.set(null);
  }

  /** Os dois sliders dividem os mesmos 50%: um nunca empurra a soma pra cima do teto. */
  mudarCupomProduto(v: number): void {
    this.rCupomProduto.set(Math.max(0, Math.min(Number(v) || 0, MAX_CUPONS - Number(this.rCupomLista()))));
  }

  mudarCupomLista(v: number): void {
    this.rCupomLista.set(Math.max(0, Math.min(Number(v) || 0, MAX_CUPONS - Number(this.rCupomProduto()))));
  }

  escolherRitmo(r: Ritmo): void {
    this.rMin.set(r.min);
    this.rMax.set(r.max);
  }

  async salvar(): Promise<void> {
    const j = this.janela();
    if (!j) return;
    this.erro.set(null);

    let partial: Record<string, unknown>;
    if (j === 'frequencia') {
      const min = Number(this.rMin());
      const max = Number(this.rMax());
      if (!(min >= 1 && max >= 1 && min <= 720 && max <= 720)) {
        this.erro.set('Use valores entre 1 e 720 minutos.');
        return;
      }
      if (min > max) {
        this.erro.set('O tempo mínimo não pode ser maior que o máximo.');
        return;
      }
      partial = { agendamento: { intervaloMinMinutos: min, intervaloMaxMinutos: max } };
    } else if (j === 'repeticao') {
      const cooldown = Number(this.rCooldown());
      const repostar = Number(this.rRepostar());
      if (!(cooldown >= 0 && cooldown <= 720)) {
        this.erro.set('O tempo mínimo vai de 0 a 720 horas (30 dias).');
        return;
      }
      if (!(repostar >= 0 && repostar <= 90)) {
        this.erro.set('A repetição liberada vai de 0 a 90 dias.');
        return;
      }
      partial = { postagem: { cooldownHoras: cooldown, repostarAposDias: repostar } };
    } else {
      if (this.rSomaCupons() > MAX_CUPONS) {
        this.erro.set(`Os dois tipos de cupom juntos não podem passar de ${MAX_CUPONS}% das mensagens.`);
        return;
      }
      partial = {
        cupons: {
          ativo: this.rCupomAtivo(),
          percentualProduto: Number(this.rCupomProduto()),
          percentualSozinho: Number(this.rCupomLista()),
        },
      };
    }

    this.salvando.set(true);
    const r = await this.configService.salvar(partial);
    this.salvando.set(false);
    if (!r.ok) {
      this.erro.set(r.erro ?? 'Erro ao salvar.');
      return;
    }
    this.janela.set(null);
  }
}
