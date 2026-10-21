import { Component, computed, input } from '@angular/core';

export interface BarraDia {
  /** Chave única (o dia, 'YYYY-MM-DD'). */
  chave: string;
  /** Rótulo curto do eixo x ("9/out"). */
  rotulo: string;
  n: number;
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

const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

/** "2026-10-09" -> "9/out". */
export function rotuloDoDia(dia: string): string {
  const [, mes, d] = dia.split('-').map(Number);
  return `${d}/${MESES[mes - 1]}`;
}

/**
 * Barras de uma série por dia, no padrão dos gráficos do painel: eixo y à esquerda com 5 linhas
 * de grade fracas, barras douradas finas com o topo arredondado, um rótulo no eixo x a cada
 * poucos dias e a dica com o número ao passar o mouse (ou com o foco do teclado). Os mesmos
 * números vão numa tabela escondida, pra leitor de tela.
 */
@Component({
  selector: 'app-grafico-barras',
  standalone: true,
  template: `
    <div class="gb-plot" role="img" [attr.aria-label]="descricao() + ': ' + total() + ' no total.'">
      <div class="gb-eixo-y" aria-hidden="true">
        @for (v of linhas(); track $index) { <span>{{ v }}</span> }
      </div>
      <div class="gb-area">
        <div class="gb-grade" aria-hidden="true">
          @for (v of linhas(); track $index) { <span></span> }
        </div>
        <div class="gb-barras">
          @for (b of vistas(); track b.chave) {
            <div class="gb-coluna" tabindex="0" [attr.aria-label]="b.rotulo + ': ' + b.n + ' ' + nome(b.n)">
              <span class="gb-barra" [style.height.%]="b.altura">
                <span class="gb-dica" aria-hidden="true"><strong>{{ b.n }}</strong> {{ nome(b.n) }} · {{ b.rotulo }}</span>
              </span>
              <span class="gb-rotulo-x" aria-hidden="true">{{ b.marca ? b.rotulo : '' }}</span>
            </div>
          }
        </div>
      </div>
    </div>
    <table class="sr-only">
      <caption>{{ descricao() }}</caption>
      <tbody>
        @for (b of barras(); track b.chave) { <tr><th scope="row">{{ b.rotulo }}</th><td>{{ b.n }}</td></tr> }
      </tbody>
    </table>
  `,
  host: { class: 'gb' },
})
export class GraficoBarras {
  barras = input.required<BarraDia[]>();
  /** Nome do que é contado: [singular, plural]. */
  unidade = input<[string, string]>(['postagem', 'postagens']);
  descricao = input('Quantidade por dia');

  protected readonly total = computed(() => this.barras().reduce((a, b) => a + b.n, 0));

  private readonly teto = computed(() => tetoDoEixo(Math.max(0, ...this.barras().map((b) => b.n))));

  protected readonly linhas = computed(() => [0, 1, 2, 3, 4].map((k) => (this.teto() / 4) * k).reverse());

  protected readonly vistas = computed(() => {
    const lista = this.barras();
    // Uns 10 rótulos no eixo x, qualquer que seja o período (7, 30, 90 dias).
    const cada = Math.max(1, Math.ceil(lista.length / 10));
    return lista.map((b, i) => ({ ...b, altura: (b.n / this.teto()) * 100, marca: i % cada === 0 }));
  });

  protected nome(n: number): string {
    return n === 1 ? this.unidade()[0] : this.unidade()[1];
  }
}
