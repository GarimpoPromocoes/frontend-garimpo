import { Component, input, model } from '@angular/core';

/**
 * O "i" ao lado do título: mostra/esconde a explicação de como funciona. Quem usa
 * guarda uma referência (#info) e desenha a explicação com `@if (info.aberto())`.
 */
@Component({
  selector: 'app-info',
  standalone: true,
  template: `
    <button type="button" class="btn-info" [class.btn-info-on]="aberto()"
      [attr.aria-expanded]="aberto()" [attr.aria-controls]="controla() || null"
      aria-label="Como funciona" title="Como funciona" (click)="aberto.set(!aberto())">i</button>
  `,
  host: { style: 'display: inline-flex' },
})
export class Info {
  readonly aberto = model(false);
  /** id do bloco com a explicação. */
  readonly controla = input<string>();
}
