import { Component, signal } from '@angular/core';
import { GanhosCard } from '../ganhos-card/ganhos-card';
import { MembrosCard } from './membros-card';
import { VendasCard } from './vendas-card';
import { PostagensCard } from './postagens-card';

type Visao = 'postagens' | 'ganhos' | 'membros' | 'vendas';

const VISOES: { id: Visao; label: string }[] = [
  { id: 'postagens', label: 'Postagens' },
  { id: 'ganhos', label: 'Ganhos' },
  { id: 'membros', label: 'Membros dos grupos' },
  { id: 'vendas', label: 'Vendas por grupo' },
];
const PERIODOS = [7, 30, 90];
const CHAVE_VISAO = 'promobot:estatisticas:visao';

function visaoSalva(): Visao {
  try {
    const v = localStorage.getItem(CHAVE_VISAO);
    if (VISOES.some((x) => x.id === v)) return v as Visao;
  } catch {}
  return 'ganhos';
}

@Component({
  selector: 'app-estatisticas',
  standalone: true,
  imports: [GanhosCard, MembrosCard, VendasCard, PostagensCard],
  // As três visões ocupam a altura da janela, sem a página rolar.
  host: { class: 'ganhos-pagina' },
  template: `
    <div class="est-barra">
      <div class="segmented segmented-abas" role="group" aria-label="O que ver">
        @for (v of visoes; track v.id) {
          <button type="button" class="segmented-option" [class.segmented-option-active]="visao() === v.id"
            [attr.aria-pressed]="visao() === v.id" (click)="escolher(v.id)">{{ v.label }}</button>
        }
      </div>
      @if (visao() !== 'ganhos') {
        <div class="segmented segmented-abas segmented-abas-periodo" role="group" aria-label="Período">
          @for (p of periodos; track p) {
            <button type="button" class="segmented-option" [class.segmented-option-active]="dias() === p"
              [attr.aria-pressed]="dias() === p" (click)="dias.set(p)">{{ p }} dias</button>
          }
        </div>
      }
    </div>
    @switch (visao()) {
      @case ('postagens') { <app-postagens-card class="ganhos-pagina" [dias]="dias()" /> }
      @case ('ganhos') { <app-ganhos-card /> }
      @case ('membros') { <app-membros-card class="ganhos-pagina" [dias]="dias()" /> }
      @case ('vendas') { <app-vendas-card class="ganhos-pagina" [dias]="dias()" /> }
    }
  `,
})
export class Estatisticas {
  protected readonly visoes = VISOES;
  protected readonly periodos = PERIODOS;
  protected readonly visao = signal<Visao>(visaoSalva());
  protected readonly dias = signal(30);

  protected escolher(v: Visao): void {
    this.visao.set(v);
    try {
      localStorage.setItem(CHAVE_VISAO, v);
    } catch {}
  }
}
