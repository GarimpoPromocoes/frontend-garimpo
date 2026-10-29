import { Component, computed, effect, inject, input, signal } from '@angular/core';
import { EstatisticasService, GrupoMembros } from '../../../core/services/estatisticas.service';

const G = { largura: 720, altura: 280, esq: 44, dir: 8, topo: 14, base: 28 };
const NOME_MES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

interface Barra {
  dia: string;
  rotulo: string | null;
  x: number;
  largura: number;
  entradas: number;
  saidas: number;
  /** Caminho da barra de entradas (sobe da linha do zero), arredondada só na ponta. */
  dEntrada: string | null;
  /** Caminho da barra de saídas (desce da linha do zero). */
  dSaida: string | null;
}

function isoDia(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function ultimosDias(n: number): string[] {
  const hoje = new Date();
  const lista: string[] = [];
  for (let i = n - 1; i >= 0; i--) lista.push(isoDia(new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate() - i)));
  return lista;
}

function tetoRedondo(max: number): number {
  if (max <= 0) return 5;
  const p = Math.pow(10, Math.floor(Math.log10(max)));
  for (const f of [1, 2, 5, 10]) if (f * p >= max) return Math.max(5, f * p);
  return 10 * p;
}

/** Barra com a ponta arredondada (r) do lado oposto à linha do zero. */
function barra(x: number, w: number, y0: number, y1: number): string | null {
  const h = Math.abs(y1 - y0);
  if (h < 0.5) return null;
  const r = Math.min(3, h, w / 2);
  const x2 = x + w;
  if (y1 < y0) {
    return `M${x},${y0} V${y1 + r} Q${x},${y1} ${x + r},${y1} H${x2 - r} Q${x2},${y1} ${x2},${y1 + r} V${y0} Z`;
  }
  return `M${x},${y0} V${y1 - r} Q${x},${y1} ${x + r},${y1} H${x2 - r} Q${x2},${y1} ${x2},${y1 - r} V${y0} Z`;
}

@Component({
  selector: 'app-membros-card',
  standalone: true,
  templateUrl: './membros-card.html',
})
export class MembrosCard {
  protected est = inject(EstatisticasService);
  readonly dias = input(30);
  protected readonly g = G;
  protected readonly grupoFiltro = signal<string>('');
  protected readonly ordem = signal<'entradas' | 'saidas'>('entradas');
  protected readonly barraAtiva = signal<Barra | null>(null);

  constructor() {
    effect(() => void this.est.carregarMembros(this.dias()));
  }

  protected readonly resumo = computed(() => {
    const grupos = this.est.grupos();
    const entradas = grupos.reduce((s, g) => s + g.entradas, 0);
    const saidas = grupos.reduce((s, g) => s + g.saidas, 0);
    const porSaldo = [...grupos].sort((a, b) => b.entradas - b.saidas - (a.entradas - a.saidas));
    return {
      membros: grupos.reduce((s, g) => s + g.total, 0),
      entradas,
      saidas,
      cresceu: porSaldo[0] && porSaldo[0].entradas - porSaldo[0].saidas > 0 ? porSaldo[0] : null,
      encolheu:
        porSaldo.length && porSaldo[porSaldo.length - 1].entradas - porSaldo[porSaldo.length - 1].saidas < 0
          ? porSaldo[porSaldo.length - 1]
          : null,
    };
  });

  protected readonly gruposOrdenados = computed(() => {
    const campo = this.ordem();
    return [...this.est.grupos()].sort((a, b) => b[campo] - a[campo] || b.total - a.total);
  });

  protected readonly grafico = computed(() => {
    const dias = ultimosDias(this.dias());
    const filtro = this.grupoFiltro();
    const porDia = new Map<string, { entradas: number; saidas: number }>();
    for (const m of this.est.movimentos()) {
      if (filtro && m.chatId !== filtro) continue;
      const s = porDia.get(m.dia) || { entradas: 0, saidas: 0 };
      s.entradas += m.entradas;
      s.saidas += m.saidas;
      porDia.set(m.dia, s);
    }
    const maxV = Math.max(0, ...[...porDia.values()].flatMap((v) => [v.entradas, v.saidas]));
    const teto = tetoRedondo(maxV);
    const areaL = G.largura - G.esq - G.dir;
    const meio = G.topo + (G.altura - G.topo - G.base) / 2;
    const meiaAltura = (G.altura - G.topo - G.base) / 2;
    const passo = areaL / dias.length;
    const w = Math.max(2, Math.min(22, passo * 0.7));
    const cadaQuantos = dias.length <= 7 ? 1 : dias.length <= 31 ? 5 : 15;

    const barras: Barra[] = dias.map((dia, i) => {
      const v = porDia.get(dia) || { entradas: 0, saidas: 0 };
      const x = G.esq + passo * i + (passo - w) / 2;
      // 1px de folga entre as duas barras e a linha do zero.
      const yE = meio - 1 - (v.entradas / teto) * (meiaAltura - 1);
      const yS = meio + 1 + (v.saidas / teto) * (meiaAltura - 1);
      const [, m, d] = dia.split('-').map(Number);
      const mostrar = (dias.length - 1 - i) % cadaQuantos === 0;
      return {
        dia,
        rotulo: mostrar ? `${d}/${NOME_MES[m - 1]}` : null,
        x,
        largura: w,
        entradas: v.entradas,
        saidas: v.saidas,
        dEntrada: v.entradas ? barra(x, w, meio - 1, yE) : null,
        dSaida: v.saidas ? barra(x, w, meio + 1, yS) : null,
      };
    });
    const grade = [
      { y: G.topo, rotulo: `${teto}` },
      { y: meio, rotulo: '0' },
      { y: G.altura - G.base, rotulo: `−${teto}` },
    ];
    return { barras, grade, meio, passo, vazio: maxV === 0 };
  });

  protected saldo(g: GrupoMembros): number {
    return g.entradas - g.saidas;
  }

  protected sinal(n: number): string {
    return n > 0 ? `+${n.toLocaleString('pt-BR')}` : n < 0 ? `−${Math.abs(n).toLocaleString('pt-BR')}` : '0';
  }

  protected inteiro(n: number): string {
    return n.toLocaleString('pt-BR');
  }

  protected nomeDia(dia: string): string {
    const [a, m, d] = dia.split('-').map(Number);
    return new Date(a, m - 1, d).toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: 'short' });
  }

  protected quando(iso: string | null): string {
    if (!iso) return '—';
    const d = new Date(iso);
    return Number.isNaN(d.getTime())
      ? '—'
      : d.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
  }

  protected tooltipEsquerda(b: Barra): number {
    return ((b.x + b.largura / 2) / G.largura) * 100;
  }

  protected filtrar(ev: Event): void {
    this.grupoFiltro.set((ev.target as HTMLSelectElement).value);
  }
}
