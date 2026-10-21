import { Component, computed, effect, inject, input } from '@angular/core';
import { EstatisticasService } from '../../../core/services/estatisticas.service';
import { BarraDia, GraficoBarras, rotuloDoDia } from '../../../shared/grafico-barras/grafico-barras';

const DIAS_SEMANA = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'];

/** Estatísticas > Postagens: quantas ofertas saíram por dia e em cada grupo, no período escolhido. */
@Component({
  selector: 'app-postagens-card',
  standalone: true,
  imports: [GraficoBarras],
  templateUrl: './postagens-card.html',
})
export class PostagensCard {
  protected est = inject(EstatisticasService);
  readonly dias = input(30);

  constructor() {
    effect(() => void this.est.carregarPostagens(this.dias()));
  }

  protected readonly barras = computed<BarraDia[]>(() =>
    this.est.postagensPorDia().map((d) => ({ chave: d.dia, rotulo: rotuloDoDia(d.dia), n: d.n }))
  );

  protected readonly resumo = computed(() => {
    const dias = this.est.postagensPorDia();
    const total = dias.reduce((a, d) => a + d.n, 0);
    const melhor = dias.reduce<{ dia: string; n: number } | null>((m, d) => (d.n > (m?.n ?? 0) ? d : m), null);
    return {
      total,
      media: dias.length ? total / dias.length : 0,
      melhor,
      grupos: this.est.postagensPorGrupo().filter((g) => g.postagens > 0).length,
    };
  });

  protected inteiro(n: number): string {
    return n.toLocaleString('pt-BR');
  }

  protected decimal(n: number): string {
    return n.toLocaleString('pt-BR', { maximumFractionDigits: 1 });
  }

  protected nomeDoDia(dia: string): string {
    const [a, m, d] = dia.split('-').map(Number);
    return `${DIAS_SEMANA[new Date(a, m - 1, d).getDay()]}, ${rotuloDoDia(dia)}`;
  }

  protected quando(iso: string | null): string {
    if (!iso) return '—';
    const d = new Date(iso);
    const data = d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
    return `${data} ${d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`;
  }

  protected pct(n: number): number {
    const total = this.resumo().total;
    return total ? Math.round((n / total) * 100) : 0;
  }
}
