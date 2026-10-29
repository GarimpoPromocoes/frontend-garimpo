import { Component, computed, effect, inject, input } from '@angular/core';
import { EstatisticasService, OrigemVenda, Venda } from '../../../core/services/estatisticas.service';
import { Loja } from '../../../core/services/ganhos.service';

const NOME_LOJA: Record<Loja, string> = { mercadolivre: 'Mercado Livre', amazon: 'Amazon', shopee: 'Shopee' };

@Component({
  selector: 'app-vendas-card',
  standalone: true,
  templateUrl: './vendas-card.html',
})
export class VendasCard {
  protected est = inject(EstatisticasService);
  readonly dias = input(30);

  constructor() {
    effect(() => void this.est.carregarVendas(this.dias()));
  }

  protected readonly resumo = computed(() => {
    const validas = this.est.vendas().filter((v) => !this.cancelada(v));
    const comissoes = validas.map((v) => v.comissao).filter((c): c is number => c != null);
    return {
      total: validas.length,
      comGrupo: validas.filter((v) => v.origens.length).length,
      soUmGrupo: validas.filter((v) => v.origens.length === 1 && v.origens[0].como !== 'tema').length,
      comissao: comissoes.length ? comissoes.reduce((s, c) => s + c, 0) : null,
    };
  });

  /** Parte das vendas do periodo em que o grupo aparece (uma venda pode contar para mais de um grupo). */
  protected pctDoTotal(vendas: number): number {
    const total = this.resumo().total;
    return total ? Math.min(100, Math.round((vendas / total) * 100)) : 0;
  }

  protected rotuloOrigem(v: Venda, o: OrigemVenda, i: number): string {
    if (o.como === 'tema') return 'Provável:';
    if (o.como === 'subid') return 'Confirmado pelo link:';
    if (v.origens.length === 1) return 'Saiu do grupo:';
    return i === 0 ? 'Pode ter saído de:' : 'ou de:';
  }

  protected cancelada(v: Venda): boolean {
    return /cancel|recus|devolv|estorn/i.test(v.status || '');
  }

  protected loja(l: Loja): string {
    return NOME_LOJA[l] || l;
  }

  protected moeda(v: number | null | undefined): string {
    if (v == null) return '—';
    return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  }

  protected data(iso: string | null): string {
    if (!iso) return '—';
    const d = new Date(iso);
    return Number.isNaN(d.getTime()) ? '—' : d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
  }

  protected quando(iso: string | null): string {
    if (!iso) return '—';
    const d = new Date(iso);
    return Number.isNaN(d.getTime())
      ? '—'
      : d.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
  }

  protected extras(o: OrigemVenda): string {
    const partes = [...(o.espelhos || [])];
    if (o.telegram) partes.push(`Telegram: ${o.telegram}`);
    return partes.length ? `Também saiu em: ${partes.join(', ')}` : '';
  }

  protected lidoPorLoja(): string {
    const l = this.est.leiturasVendas();
    return l.length ? l.map((x) => `${this.loja(x.loja)} ${this.quando(x.lidoEm)}`).join(' · ') : 'nunca';
  }
}
