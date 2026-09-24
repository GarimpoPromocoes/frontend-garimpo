import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { ConfigService, TemaEvento } from '../../../core/services/config.service';
import { ConfirmacaoService } from '../../../core/services/confirmacao.service';
import { ChipInput } from '../../../shared/chip-input/chip-input';

/** Data que já vem pronta no robô (bot-ml/src/curadoria/sazonalidade.js). */
interface DataPronta {
  nome: string;
  grupo: string;
  inicio: string;
  fim: string;
  peso: number;
  ativa: boolean;
  palavras: string[];
}

interface Rascunho {
  /** Posição na lista salva; null = data nova. */
  indice: number | null;
  nome: string;
  inicioDia: number;
  inicioMes: number;
  fimDia: number;
  fimMes: number;
  peso: number;
  palavras: string[];
}

const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
const MESES_LONGOS = [
  'janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho',
  'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro',
];
const DIAS_NO_MES = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

const NIVEIS = [
  { ate: 8, nome: 'Leve' },
  { ate: 15, nome: 'Média' },
  { ate: 22, nome: 'Forte' },
  { ate: 30, nome: 'Máxima' },
];

function nivel(peso: number): string {
  return (NIVEIS.find((n) => peso <= n.ate) ?? NIVEIS[NIVEIS.length - 1]).nome;
}

function partes(mmdd: string): { mes: number; dia: number } {
  const [m, d] = String(mmdd || '').split('-').map(Number);
  return { mes: m >= 1 && m <= 12 ? m : 1, dia: d >= 1 && d <= 31 ? d : 1 };
}

function mmdd(mes: number, dia: number): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(mes)}-${p(dia)}`;
}

function periodo(inicio: string, fim: string): string {
  const i = partes(inicio);
  const f = partes(fim);
  return `${i.dia} ${MESES[i.mes - 1]} → ${f.dia} ${MESES[f.mes - 1]}`;
}

/** Está valendo hoje? (janelas que viram o ano, tipo 12-20 → 01-10, também contam) */
function ativaHoje(inicio: string, fim: string, hoje = new Date()): boolean {
  const h = (hoje.getMonth() + 1) * 100 + hoje.getDate();
  const i = partes(inicio);
  const f = partes(fim);
  const a = i.mes * 100 + i.dia;
  const b = f.mes * 100 + f.dia;
  return a <= b ? h >= a && h <= b : h >= a || h <= b;
}

/** Quantos dias faltam pra começar (0 = já está valendo). */
function diasAte(inicio: string, fim: string, hoje = new Date()): number {
  if (ativaHoje(inicio, fim, hoje)) return 0;
  const i = partes(inicio);
  const base = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate());
  let alvo = new Date(hoje.getFullYear(), i.mes - 1, i.dia);
  if (alvo < base) alvo = new Date(hoje.getFullYear() + 1, i.mes - 1, i.dia);
  return Math.round((alvo.getTime() - base.getTime()) / 86400000);
}

/**
 * Datas especiais em cards, igual à tela de Grupos: cada data cadastrada é um
 * card, o clique abre a janela, salvar já grava. O calendário que já vem
 * pronto fica logo abaixo, com o que está valendo hoje em destaque.
 */
@Component({
  selector: 'app-datas-especiais',
  standalone: true,
  imports: [FormsModule, ChipInput],
  templateUrl: './datas-especiais.html',
})
export class DatasEspeciais implements OnInit {
  private http = inject(HttpClient);
  protected configService = inject(ConfigService);
  private confirmacao = inject(ConfirmacaoService);

  protected readonly meses = MESES_LONGOS;
  protected readonly nivel = nivel;
  protected readonly periodo = periodo;

  protected readonly prontas = signal<DataPronta[]>([]);
  protected readonly mostrarCalendario = signal(false);

  protected readonly ativo = computed(() => this.configService.config()?.sazonalidade.ativo ?? true);
  protected readonly eventos = computed(() => this.configService.config()?.sazonalidade.eventos ?? []);

  protected readonly cards = computed(() =>
    this.eventos().map((ev, indice) => {
      const faltam = diasAte(ev.inicio, ev.fim);
      return { ev, indice, faltam, periodo: periodo(ev.inicio, ev.fim), nivel: nivel(Number(ev.peso) || 10) };
    }),
  );

  /** O que está puxando as ofertas hoje: prontas + cadastradas, mais fortes primeiro. */
  protected readonly ativasHoje = computed(() => {
    const suas = this.eventos()
      .filter((ev) => ativaHoje(ev.inicio, ev.fim))
      .map((ev) => ({ nome: ev.nome, peso: Number(ev.peso) || 10, sua: true }));
    const prontas = this.prontas()
      .filter((d) => d.ativa)
      .map((d) => ({ nome: d.nome, peso: d.peso, sua: false }));
    return [...suas, ...prontas].sort((a, b) => b.peso - a.peso);
  });

  /** Calendário pronto agrupado, com as que estão valendo primeiro dentro de cada grupo. */
  protected readonly calendario = computed(() => {
    const grupos = new Map<string, (DataPronta & { periodo: string; faltam: number })[]>();
    for (const d of this.prontas()) {
      const lista = grupos.get(d.grupo) ?? [];
      lista.push({ ...d, periodo: periodo(d.inicio, d.fim), faltam: diasAte(d.inicio, d.fim) });
      grupos.set(d.grupo, lista);
    }
    return [...grupos.entries()].map(([nome, datas]) => ({
      nome,
      datas: datas.sort((a, b) => a.faltam - b.faltam),
    }));
  });

  // ---- janela ----------------------------------------------------------------
  protected readonly rascunho = signal<Rascunho | null>(null);
  protected readonly salvando = signal(false);
  protected readonly erro = signal<string | null>(null);

  protected readonly diasInicio = computed(() => this.listaDias(this.rascunho()?.inicioMes ?? 1));
  protected readonly diasFim = computed(() => this.listaDias(this.rascunho()?.fimMes ?? 1));
  protected readonly previa = computed(() => {
    const r = this.rascunho();
    if (!r) return null;
    const ini = mmdd(r.inicioMes, r.inicioDia);
    const fim = mmdd(r.fimMes, r.fimDia);
    const faltam = diasAte(ini, fim);
    return { periodo: periodo(ini, fim), faltam, viraAno: r.inicioMes * 100 + r.inicioDia > r.fimMes * 100 + r.fimDia };
  });

  async ngOnInit(): Promise<void> {
    try {
      const r = await firstValueFrom(this.http.get<{ datas: DataPronta[] }>('/api/config/datas-especiais'));
      this.prontas.set(r.datas ?? []);
    } catch (_) {
      this.prontas.set([]);
    }
  }

  private listaDias(mes: number): number[] {
    return Array.from({ length: DIAS_NO_MES[(mes || 1) - 1] }, (_, i) => i + 1);
  }

  criar(): void {
    const hoje = new Date();
    const fim = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate() + 14);
    this.erro.set(null);
    this.rascunho.set({
      indice: null,
      nome: '',
      inicioDia: hoje.getDate(),
      inicioMes: hoje.getMonth() + 1,
      fimDia: fim.getDate(),
      fimMes: fim.getMonth() + 1,
      peso: 12,
      palavras: [],
    });
  }

  abrir(ev: TemaEvento, indice: number): void {
    const i = partes(ev.inicio);
    const f = partes(ev.fim);
    this.erro.set(null);
    this.rascunho.set({
      indice,
      nome: ev.nome,
      inicioDia: i.dia,
      inicioMes: i.mes,
      fimDia: f.dia,
      fimMes: f.mes,
      peso: Number(ev.peso) || 10,
      palavras: [...ev.palavras],
    });
  }

  fechar(): void {
    if (this.salvando()) return;
    this.rascunho.set(null);
    this.erro.set(null);
  }

  atualizar<K extends keyof Rascunho>(campo: K, valor: Rascunho[K]): void {
    this.rascunho.update((r) => {
      if (!r) return r;
      const novo = { ...r, [campo]: valor } as Rascunho;
      // Trocou o mês e o dia não existe nele (31 de abril): encosta no último.
      novo.inicioDia = Math.min(Number(novo.inicioDia), DIAS_NO_MES[Number(novo.inicioMes) - 1]);
      novo.fimDia = Math.min(Number(novo.fimDia), DIAS_NO_MES[Number(novo.fimMes) - 1]);
      return novo;
    });
  }

  async alternarAtivo(): Promise<void> {
    await this.gravar(this.eventos(), !this.ativo());
  }

  async salvar(): Promise<void> {
    const r = this.rascunho();
    if (!r) return;
    const nome = r.nome.trim();
    if (!nome) {
      this.erro.set('Dê um nome para a data.');
      return;
    }
    if (!r.palavras.length) {
      this.erro.set('Adicione pelo menos um produto ou palavra que combine com a data.');
      return;
    }
    const ev: TemaEvento = {
      nome,
      inicio: mmdd(Number(r.inicioMes), Number(r.inicioDia)),
      fim: mmdd(Number(r.fimMes), Number(r.fimDia)),
      peso: Math.max(1, Math.min(30, Number(r.peso) || 10)),
      palavras: r.palavras,
    };
    const atuais = this.eventos();
    const lista = r.indice === null ? [...atuais, ev] : atuais.map((x, i) => (i === r.indice ? ev : x));
    if (await this.gravar(lista, this.ativo())) this.rascunho.set(null);
  }

  async remover(): Promise<void> {
    const r = this.rascunho();
    if (!r || r.indice === null) return;
    const ok = await this.confirmacao.pedir({
      titulo: `Remover "${r.nome || 'esta data'}"?`,
      texto: 'O robô deixa de dar preferência aos produtos dela. As datas que já vêm prontas continuam valendo.',
      confirmar: 'Remover',
      perigo: true,
    });
    if (!ok) return;
    if (await this.gravar(this.eventos().filter((_, i) => i !== r.indice), this.ativo())) this.rascunho.set(null);
  }

  private async gravar(eventos: TemaEvento[], ativo: boolean): Promise<boolean> {
    this.erro.set(null);
    this.salvando.set(true);
    const r = await this.configService.salvar({ sazonalidade: { ativo, eventos } });
    this.salvando.set(false);
    if (!r.ok) {
      this.erro.set(r.erro ?? 'Erro ao salvar.');
      return false;
    }
    return true;
  }
}
