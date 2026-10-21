import { Component, DestroyRef, HostListener, computed, effect, inject, output, signal } from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { AcaoPainel, AlvoGrupos, JobsService } from '../../../core/services/jobs.service';
import { RunControlService } from '../../../core/services/run-control.service';
import { StatusService } from '../../../core/services/status.service';
import { PainelService } from '../../../core/services/painel.service';
import { GruposFila } from '../grupos-fila/grupos-fila';
import { duracao } from '../topo-kpis/topo-kpis';

type Icone =
  | 'busca' | 'sacola' | 'doc' | 'envio' | 'check' | 'alerta' | 'relogio' | 'grupos' | 'externo'
  | 'cubo' | 'etiqueta' | 'pessoas' | 'dinheiro' | 'seta' | 'subiu' | 'desceu' | 'chevron';
type Tom = 'ok' | 'andamento' | 'espera' | 'erro' | 'neutro' | 'achado';
/** Abas do app que os cartões do Painel abrem. */
export type DestinoPainel = 'estatisticas' | 'grupos';

interface AcaoVista {
  hora: string;
  icone: Icone;
  texto: string;
  selo: string;
  tom: Tom;
}

interface Barra {
  dia: string;
  rotulo: string;
  n: number;
  altura: number;
  marca: boolean;
}

const NOME_LOJA: Record<string, string> = { mercadolivre: 'Mercado Livre', amazon: 'Amazon', shopee: 'Shopee' };
const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
const MAX_ACOES = 20;
const NUMEROS_A_CADA_MS = 60000;

function hhmm(iso: string | null | undefined): string {
  if (!iso) return '';
  return new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

/** Teto do eixo: um número redondo acima do maior valor, dividido em 4 faixas. */
function tetoDoEixo(max: number): number {
  if (max <= 4) return 4;
  const passo = Math.pow(10, Math.floor(Math.log10(max / 4)));
  for (const m of [1, 2, 2.5, 5, 10]) {
    const faixa = m * passo;
    if (faixa * 4 >= max) return faixa * 4;
  }
  return Math.ceil(max / 4) * 4;
}

/**
 * O Painel: os números do dia em quatro cartões, as postagens dos últimos 30 dias, as últimas
 * ações e os grupos marcados para postar. O tempo ativo e a próxima postagem ficam no cabeçalho
 * (topo-kpis); ligar, pausar e parar, no botão flutuante.
 */
@Component({
  selector: 'app-painel-robo',
  standalone: true,
  imports: [NgTemplateOutlet, GruposFila],
  templateUrl: './painel-robo.html',
})
export class PainelRobo {
  verProdutos = output<void>();
  verLogs = output<void>();
  irPara = output<DestinoPainel>();

  protected runControl = inject(RunControlService);
  protected jobs = inject(JobsService);
  protected statusService = inject(StatusService);
  private painelService = inject(PainelService);

  protected readonly escolhendoGrupos = signal(false);
  protected readonly statsAbertas = signal(false);

  constructor() {
    void this.painelService.carregar();
    const t = setInterval(() => document.visibilityState === 'visible' && void this.painelService.carregar(), NUMEROS_A_CADA_MS);
    inject(DestroyRef).onDestroy(() => clearInterval(t));
    // Postou: o gráfico e os grupos atualizam na hora, sem esperar a próxima leitura.
    let concluidos: number | null = null;
    effect(() => {
      const n = this.jobs.painel()?.hoje?.concluidos ?? null;
      if (concluidos !== null && n !== null && n !== concluidos) void this.painelService.carregar();
      concluidos = n;
    });
  }

  @HostListener('document:keydown.escape')
  protected fecharComEsc(): void {
    this.escolhendoGrupos.set(false);
    this.statsAbertas.set(false);
  }

  private readonly painel = computed(() => this.jobs.painel());
  private readonly numeros = computed(() => this.painelService.numeros());

  // ---- Grupos marcados para postar ----

  private readonly gruposAlvo = computed(() => {
    const todos = this.runControl.grupos();
    const manual = this.statusService.status()?.agendamento?.manual;
    const ligado = this.runControl.algoRodando();
    const alvo = ligado ? manual?.alvo : this.runControl.alvo();
    if (alvo !== 'selecionados') return todos;
    const ids = new Set(ligado ? manual?.ids ?? [] : [...this.runControl.selecionados()]);
    return todos.filter((g) => ids.has(g.id));
  });

  protected readonly grupoDaVez = computed(() =>
    this.runControl.postandoAgora() && this.painel()?.atual ? this.painel()?.grupo?.nome ?? null : null
  );

  protected readonly numerosDosGrupos = computed(() => {
    const m: Record<string, { membros: number | null; postadosHoje: number }> = {};
    for (const g of this.numeros()?.grupos ?? []) m[g.id] = { membros: g.membros, postadosHoje: g.postadosHoje };
    return m;
  });

  // ---- Os quatro cartões ----

  protected readonly gruposAtivos = computed(() => this.gruposAlvo().length);

  protected readonly postadosHoje = computed(() => this.statusService.status()?.hoje?.postados ?? null);

  /** Variação contra ontem: só com ontem > 0 (de zero não dá porcentagem). */
  protected readonly variacao = computed<{ texto: string; subiu: boolean } | null>(() => {
    const h = this.statusService.status()?.hoje;
    if (!h || !h.postadosOntem) return null;
    const pct = Math.round(((h.postados - h.postadosOntem) / h.postadosOntem) * 100);
    return { texto: `${Math.abs(pct)}%`, subiu: pct >= 0 };
  });

  protected readonly membrosTotais = computed<number | null>(() => {
    const m = this.numerosDosGrupos();
    const lidos = this.gruposAlvo().map((g) => m[g.id]?.membros).filter((n): n is number => n != null);
    return lidos.length ? lidos.reduce((a, b) => a + b, 0) : null;
  });

  protected readonly receitaHoje = computed(() => {
    const v = this.numeros()?.receitaHoje;
    return v == null ? '—' : v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  });

  protected numero(n: number | null): string {
    return n == null ? '—' : n.toLocaleString('pt-BR');
  }

  // ---- Postagens dos últimos 30 dias ----

  protected readonly grafico = computed(() => {
    const dias = this.numeros()?.postagensPorDia ?? [];
    const max = Math.max(0, ...dias.map((d) => d.n));
    const teto = tetoDoEixo(max);
    const barras: Barra[] = dias.map((d, i) => {
      const [, mes, dia] = d.dia.split('-').map(Number);
      return {
        dia: d.dia,
        rotulo: `${dia}/${MESES[mes - 1]}`,
        n: d.n,
        altura: teto ? (d.n / teto) * 100 : 0,
        // Um rótulo a cada 3 dias, como no eixo de calendário.
        marca: i % 3 === 0,
      };
    });
    const linhas = [0, 1, 2, 3, 4].map((k) => (teto / 4) * k).reverse();
    const total = dias.reduce((a, d) => a + d.n, 0);
    return { barras, linhas, total, vazio: !dias.length };
  });

  // ---- Últimas ações ----

  protected readonly acoes = computed<AcaoVista[]>(() => {
    const lista = this.painel()?.acoes ?? [];
    const out: AcaoVista[] = [];
    lista.forEach((a, i) => {
      const ultima = i === lista.length - 1 && this.runControl.postandoAgora();
      out.push(...this.traduzir(a, ultima));
    });
    return out.reverse().slice(0, MAX_ACOES);
  });

  private traduzir(a: AcaoPainel, ultima: boolean): AcaoVista[] {
    const hora = hhmm(a.em);
    const linha = (icone: Icone, texto: string, selo: string, tom: Tom): AcaoVista => ({ hora, icone, texto, selo, tom });
    const grupoNome = typeof a.grupo === 'string' ? a.grupo : a.grupo?.nome;
    switch (a.tipo) {
      case 'rodada':
        return [linha('busca', grupoNome ? `Buscando produto para "${grupoNome}"` : 'Buscando produto…', ultima ? 'Em andamento' : 'Feito', ultima ? 'andamento' : 'neutro')];
      case 'produto': {
        const loja = NOME_LOJA[a.loja ?? ''] ?? 'loja';
        return [
          linha('cubo', `${a.produto ? 'Produto encontrado: ' + this.curto(a.produto) : 'Produto encontrado'} (${loja})`, 'Encontrado', 'achado'),
          linha('doc', 'Link e mensagem prontos', 'Concluído', 'ok'),
        ];
      }
      case 'semProduto': {
        const txt = {
          catalogoVazio: 'Ainda sem produtos — buscando as primeiras ofertas',
          nenhumLiberado: 'Nenhum produto liberado agora',
          cedeu: grupoNome ? `"${grupoNome}" sem produto agora — vez do próximo grupo` : 'Vez do próximo grupo',
          repetido: grupoNome ? `"${grupoNome}" só tem assunto repetido agora` : 'Só assunto repetido agora',
        }[a.motivo ?? ''] ?? 'Nada para postar agora';
        if (a.motivo === 'foraDoHorario') {
          return [linha('relogio', `Fora do horário${a.ate ? ` — posta de novo às ${hhmm(a.ate)}` : ''}`, 'Fora do horário', 'espera')];
        }
        return [linha('relogio', a.ate ? `${txt} — nova busca às ${hhmm(a.ate)}` : txt, 'Aguardando', 'espera')];
      }
      case 'aguardando':
        return [linha('relogio', `Postagem agendada para ${hhmm(a.ate)}`, 'Agendado', 'espera')];
      case 'postando':
        return [linha('grupos', 'Postando produto nos grupos…', ultima ? 'Em andamento' : 'Feito', ultima ? 'andamento' : 'neutro')];
      case 'enviado': {
        const canal = a.canal === 'telegram' ? ' (Telegram)' : '';
        return [linha('envio', `Enviado para ${a.destino ? `"${a.destino}"` : 'o grupo'}${canal}`, 'Concluído', 'ok')];
      }
      case 'concluido':
        return [linha('check', a.produto ? `Publicado: ${this.curto(a.produto)}` : 'Produto publicado', 'Sucesso', 'ok')];
      case 'falhou': {
        const onde = a.etapa === 'telegram' ? 'Não saiu no Telegram' : a.etapa === 'postando' ? 'A postagem não saiu' : 'A busca falhou';
        return [linha('alerta', a.motivo ? `${onde}: ${this.curto(a.motivo)}` : onde, 'Erro', 'erro')];
      }
      default:
        return [];
    }
  }

  // ---- Estatísticas de hoje (cartão "Postados hoje") ----

  protected readonly stats = computed(() => {
    const h = this.statusService.status()?.hoje ?? null;
    const p = this.painel()?.hoje;
    const tentativas = (p?.concluidos ?? 0) + (p?.falhas ?? 0);
    return {
      postados: h?.postados ?? null,
      postadosOntem: h?.postadosOntem ?? null,
      encontrados: h?.encontrados ?? null,
      encontradosOntem: h?.encontradosOntem ?? null,
      tempoMedio: p && p.medidos ? duracao(p.somaMs / p.medidos) : '—',
      taxa: tentativas ? `${Math.round(((p?.concluidos ?? 0) / tentativas) * 100)}%` : '—',
      taxaDetalhe: tentativas ? `${p?.concluidos} de ${tentativas} envios` : 'sem envios ainda',
    };
  });

  // ---- Ações ----

  escolherAlvo(alvo: AlvoGrupos): void {
    this.runControl.escolherAlvo(alvo);
  }

  toggleSelecionado(id: string, marcado: boolean): void {
    this.runControl.toggleSelecionado(id, marcado);
  }

  abrirProdutos(): void {
    this.statsAbertas.set(false);
    this.verProdutos.emit();
  }

  private curto(texto: string, max = 70): string {
    return texto.length > max ? texto.slice(0, max - 1) + '…' : texto;
  }
}
