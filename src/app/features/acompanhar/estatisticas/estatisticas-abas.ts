import { Component, inject } from '@angular/core';
import { EstatisticasVisaoService, VISOES_ESTATISTICAS } from '../../../core/services/estatisticas-visao.service';

/** As abas de Estatísticas (Postagens, Ganhos, Membros, Vendas). Ficam no cabeçalho, só nessa tela. */
@Component({
  selector: 'app-estatisticas-abas',
  standalone: true,
  template: `
    <div class="segmented segmented-abas segmented-abas-sm" role="tablist" aria-label="O que ver em Estatísticas">
      @for (v of visoes; track v.id) {
        <button type="button" role="tab" class="segmented-option" [class.segmented-option-active]="visao.visao() === v.id"
          [attr.aria-selected]="visao.visao() === v.id" (click)="visao.escolher(v.id)">{{ v.label }}</button>
      }
    </div>
  `,
})
export class EstatisticasAbas {
  protected readonly visao = inject(EstatisticasVisaoService);
  protected readonly visoes = VISOES_ESTATISTICAS;
}
