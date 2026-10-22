import { Injectable, signal } from '@angular/core';

export type VisaoEstatisticas = 'postagens' | 'ganhos' | 'membros' | 'vendas';

export const VISOES_ESTATISTICAS: { id: VisaoEstatisticas; label: string }[] = [
  { id: 'postagens', label: 'Postagens' },
  { id: 'ganhos', label: 'Ganhos' },
  { id: 'membros', label: 'Membros dos grupos' },
  { id: 'vendas', label: 'Vendas por grupo' },
];

const CHAVE_VISAO = 'promobot:estatisticas:visao';

function visaoSalva(): VisaoEstatisticas {
  try {
    const v = localStorage.getItem(CHAVE_VISAO);
    if (VISOES_ESTATISTICAS.some((x) => x.id === v)) return v as VisaoEstatisticas;
  } catch {}
  return 'ganhos';
}

/**
 * Qual visão de Estatísticas está aberta. As abas ficam no cabeçalho (app.html) e o conteúdo na
 * tela (Estatisticas); os dois leem daqui.
 */
@Injectable({ providedIn: 'root' })
export class EstatisticasVisaoService {
  readonly visao = signal<VisaoEstatisticas>(visaoSalva());

  escolher(v: VisaoEstatisticas): void {
    this.visao.set(v);
    try {
      localStorage.setItem(CHAVE_VISAO, v);
    } catch {}
  }
}
