import { Component, inject } from '@angular/core';
import {
  EstatisticasVisaoService,
  PERIODOS_ESTATISTICAS,
  VISOES_ESTATISTICAS,
} from '../../../core/services/estatisticas-visao.service';

/** As abas de Estatísticas (Postagens, Ganhos, Membros, Vendas). Ficam no cabeçalho, ao lado do título. */
@Component({
  selector: 'app-estatisticas-abas',
  standalone: true,
  template: `
    <div class="segmented topbar-seg" role="tablist" aria-label="O que ver em Estatísticas">
      @for (v of visoes; track v.id) {
        <button type="button" role="tab" class="segmented-option" [class.segmented-option-active]="tela.visao() === v.id"
          [attr.aria-selected]="tela.visao() === v.id" [attr.aria-label]="v.label" (click)="tela.escolher(v.id)"><span class="rotulo-longo">{{ v.label }}</span><span class="rotulo-curto">{{ v.curto }}</span></button>
      }
    </div>
  `,
})
export class EstatisticasAbas {
  protected readonly tela = inject(EstatisticasVisaoService);
  protected readonly visoes = VISOES_ESTATISTICAS;
}

/**
 * O período (7/30/90 dias, fora de Ganhos) e o "Atualizar agora" (só o ícone) de Estatísticas.
 * Ficam no cabeçalho, no lugar do tempo ativo, da oferta personalizada e dos logs.
 */
@Component({
  selector: 'app-estatisticas-controles',
  standalone: true,
  template: `
    @if (tela.visao() !== 'ganhos') {
      <div class="segmented topbar-seg topbar-seg-claro" role="group" aria-label="Período">
        @for (p of periodos; track p) {
          <button type="button" class="segmented-option" [class.segmented-option-active]="tela.dias() === p"
            [attr.aria-pressed]="tela.dias() === p" [attr.aria-label]="p + ' dias'" (click)="tela.dias.set(p)">{{ p }}<span class="rotulo-dias"> dias</span><span class="rotulo-d">d</span></button>
        }
      </div>
    }
    <!-- Vale para todas as visões: lê ganhos, vendas e membros de uma vez e recarrega tudo. Com o
         robô ligado também funciona: ele lê na espera entre uma postagem e outra, sem parar. -->
    <button type="button" class="topbar-icone" [class.topbar-icone-girando]="tela.lendo()"
      [disabled]="tela.lendo()"
      [attr.aria-label]="tela.lendo() ? 'Lendo ganhos e vendas…' : 'Atualizar agora'"
      [title]="dica()"
      (click)="tela.atualizar()">
      <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M20 11a8 8 0 0 0-14.3-4.9L4 8"/><path d="M4 3.5V8h4.5"/><path d="M4 13a8 8 0 0 0 14.3 4.9L20 16"/><path d="M20 20.5V16h-4.5"/></svg>
    </button>
  `,
})
export class EstatisticasControles {
  protected readonly tela = inject(EstatisticasVisaoService);
  protected readonly periodos = PERIODOS_ESTATISTICAS;

  protected dica(): string {
    if (this.tela.lendo()) return 'Lendo ganhos e vendas…';
    if (this.tela.roboRodando()) return 'Atualizar agora: o robô lê ganhos, vendas e membros na próxima pausa entre postagens';
    return 'Atualizar agora: ler ganhos, vendas e membros';
  }
}
