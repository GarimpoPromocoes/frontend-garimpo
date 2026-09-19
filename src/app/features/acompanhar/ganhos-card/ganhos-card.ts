import { Component, OnDestroy, OnInit, computed, inject, signal } from '@angular/core';
import { GanhosService, GanhoMes, Loja } from '../../../core/services/ganhos.service';

const LOJAS: { id: Loja; nome: string; cor: string }[] = [
  { id: 'mercadolivre', nome: 'Mercado Livre', cor: 'var(--serie-1)' },
  { id: 'amazon', nome: 'Amazon', cor: 'var(--serie-2)' },
  { id: 'shopee', nome: 'Shopee', cor: 'var(--serie-3)' },
];

const NOME_MES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
const MESES_NO_GRAFICO = 12;

const G = { largura: 720, altura: 220, esq: 56, dir: 8, topo: 22, base: 26 };

interface Segmento {
  loja: Loja;
  cor: string;
  y: number;
  altura: number;
  d: string | null;
}

interface Coluna {
  mes: string;
  rotulo: string;
  x: number;
  largura: number;
  total: number | null;
  segmentos: Segmento[];
  porLoja: { nome: string; cor: string; valor: number | null }[];
}

function mesAtual(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function mesesAte(fim: string, n: number): string[] {
  const [a, m] = fim.split('-').map(Number);
  const lista: string[] = [];
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(a, m - 1 - i, 1);
    lista.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
  }
  return lista;
}

function totalDe(g: GanhoMes | undefined): number | null {
  if (!g) return null;
  if (g.estimado != null) return g.estimado;
  const partes = [g.pendente, g.confirmado, g.pago].filter((v): v is number => v != null);
  return partes.length ? partes.reduce((s, v) => s + v, 0) : null;
}

function somar(valores: (number | null)[]): number | null {
  const v = valores.filter((x): x is number => x != null);
  return v.length ? v.reduce((s, x) => s + x, 0) : null;
}

function tetoRedondo(max: number): number {
  if (max <= 0) return 100;
  const p = Math.pow(10, Math.floor(Math.log10(max)));
  for (const f of [1, 2, 5, 10]) if (f * p >= max) return f * p;
  return 10 * p;
}

@Component({
  selector: 'app-ganhos-card',
  standalone: true,
  templateUrl: './ganhos-card.html',
  host: { class: 'ganhos-pagina' },
})
export class GanhosCard implements OnInit, OnDestroy {
  protected ganhos = inject(GanhosService);
  protected readonly lojas = LOJAS;
  protected readonly g = G;
  protected readonly pedindo = signal(false);
  protected readonly aviso = signal<string | null>(null);
  protected readonly erroAcao = signal<string | null>(null);
  protected readonly colunaAtiva = signal<Coluna | null>(null);
  private timer: ReturnType<typeof setInterval> | null = null;

  private porChave = computed(() => {
    const m = new Map<string, GanhoMes>();
    for (const g of this.ganhos.meses()) m.set(`${g.mes}|${g.loja}`, g);
    return m;
  });

  private valorDe(mes: string, loja: Loja): GanhoMes | undefined {
    return this.porChave().get(`${mes}|${loja}`);
  }

  protected readonly resumo = computed(() => {
    const mes = mesAtual();
    const doMes = LOJAS.map((l) => this.valorDe(mes, l.id));
    return {
      total: somar(doMes.map(totalDe)),
      pendente: somar(doMes.map((g) => g?.pendente ?? null)),
      confirmado: somar(doMes.map((g) => g?.confirmado ?? null)),
      pago: somar(doMes.map((g) => g?.pago ?? null)),
    };
  });

  protected readonly temDados = computed(() => this.ganhos.meses().length > 0);

  protected readonly estadoLojas = computed(() =>
    LOJAS.map((l) => {
      const r = this.ganhos.leituras().find((x) => x.loja === l.id);
      return {
        ...l,
        ok: r?.ok ?? null,
        erro: r?.erro ?? null,
        lidoEm: r?.lidoEm ?? null,
        aguardando: !!(r?.pedidoEm && (!r.lidoEm || r.pedidoEm > r.lidoEm)),
      };
    })
  );

  protected readonly grafico = computed(() => {
    const meses = mesesAte(mesAtual(), MESES_NO_GRAFICO);
    const totais = meses.map((mes) => somar(LOJAS.map((l) => totalDe(this.valorDe(mes, l.id)))));
    const teto = tetoRedondo(Math.max(0, ...totais.map((t) => t ?? 0)));

    const areaL = G.largura - G.esq - G.dir;
    const areaA = G.altura - G.topo - G.base;
    const passo = areaL / meses.length;
    const larguraBarra = Math.min(36, passo * 0.62);
    const yDe = (v: number) => G.topo + areaA - (v / teto) * areaA;

    const colunas: Coluna[] = meses.map((mes, i) => {
      const x = G.esq + passo * i + (passo - larguraBarra) / 2;
      let acumulado = 0;
      const segmentos: Segmento[] = [];
      const porLoja = LOJAS.map((l) => ({ nome: l.nome, cor: l.cor, valor: totalDe(this.valorDe(mes, l.id)) }));
      LOJAS.forEach((l, k) => {
        const v = porLoja[k].valor;
        if (!v || v <= 0) return;
        const yBase = yDe(acumulado);
        acumulado += v;
        const yTopo = yDe(acumulado);
        const altura = Math.max(1, yBase - yTopo - (segmentos.length ? 2 : 0));
        segmentos.push({ loja: l.id, cor: l.cor, y: yBase - (segmentos.length ? 2 : 0) - altura, altura, d: null });
      });
      const topo = segmentos[segmentos.length - 1];
      if (topo) {
        const r = Math.min(4, topo.altura / 2, larguraBarra / 2);
        const { y, altura } = topo;
        const x2 = x + larguraBarra;
        topo.d =
          `M${x},${y + altura} V${y + r} Q${x},${y} ${x + r},${y} ` +
          `H${x2 - r} Q${x2},${y} ${x2},${y + r} V${y + altura} Z`;
      }
      const [a, m] = mes.split('-').map(Number);
      const rotulo = m === 1 || i === 0 ? `${NOME_MES[m - 1]}/${String(a).slice(2)}` : NOME_MES[m - 1];
      return { mes, rotulo, x, largura: larguraBarra, total: totais[i], segmentos, porLoja };
    });

    const linhasGrade = [0, 0.5, 1].map((f) => ({ y: yDe(teto * f), rotulo: this.moedaCurta(teto * f) }));
    return { colunas, linhasGrade, passo };
  });

  protected readonly linhasTabela = computed(() =>
    [...new Set(this.ganhos.meses().map((g) => g.mes))]
      .sort()
      .reverse()
      .flatMap((mes) =>
        LOJAS.map((l) => ({ mes, loja: l, g: this.valorDe(mes, l.id) }))
          .filter((x) => x.g)
          .map((x) => ({ ...x, total: totalDe(x.g) }))
      )
  );

  ngOnInit(): void {
    void this.ganhos.carregar();
    this.timer = setInterval(() => {
      if (this.ganhos.lendoAgora() || this.estadoLojas().some((l) => l.aguardando)) void this.ganhos.carregar();
    }, 15000);
  }

  ngOnDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }

  protected async atualizar(): Promise<void> {
    this.pedindo.set(true);
    this.aviso.set(null);
    this.erroAcao.set(null);
    const r = await this.ganhos.atualizar();
    this.pedindo.set(false);
    if (!r.ok) {
      this.erroAcao.set(r.erro ?? null);
      return;
    }
    this.aviso.set(
      r.modo === 'robo-ligado'
        ? 'Pedido feito. O robô lê os painéis em segundo plano, sem parar de postar. Leva alguns minutos.'
        : r.modo === 'na-fila'
          ? 'Pedido registrado. A leitura acontece assim que o robô for ligado.'
          : 'Lendo os painéis das lojas agora. Leva de 1 a 3 minutos.'
    );
  }

  protected moeda(v: number | null | undefined): string {
    if (v == null) return '—';
    return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  }

  protected moedaCurta(v: number): string {
    if (v >= 1000) return `R$ ${(v / 1000).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} mil`;
    return `R$ ${Math.round(v)}`;
  }

  protected nomeMes(mes: string): string {
    const [a, m] = mes.split('-').map(Number);
    return `${NOME_MES[m - 1]}/${a}`;
  }

  protected quando(iso: string | null): string {
    if (!iso) return 'nunca';
    const d = new Date(iso);
    return Number.isNaN(d.getTime())
      ? '—'
      : d.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
  }

  protected tooltipEsquerda(c: Coluna): number {
    return ((c.x + c.largura / 2) / G.largura) * 100;
  }
}
