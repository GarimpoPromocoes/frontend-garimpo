import { Component, computed, inject } from '@angular/core';
import { FiltroOrigem, GruposOrigemService } from '../../../core/services/grupos-origem.service';

/** O filtro da tela de Grupos (Todos / Meu garimpo / Clonagem). Fica no cabeçalho, ao lado do título. */
@Component({
  selector: 'app-grupos-filtro',
  standalone: true,
  template: `
    <div class="segmented topbar-seg" role="group" aria-label="Mostrar grupos">
      @for (o of opcoes(); track o.id) {
        <button type="button" class="segmented-option" [class.segmented-option-active]="origem.filtro() === o.id"
          [attr.aria-pressed]="origem.filtro() === o.id" (click)="origem.filtro.set(o.id)">{{ o.label }} · {{ o.n }}</button>
      }
    </div>
  `,
})
export class GruposFiltro {
  protected readonly origem = inject(GruposOrigemService);

  protected readonly opcoes = computed(() => {
    const c = this.origem.contagem();
    const lista: { id: FiltroOrigem; label: string; n: number }[] = [
      { id: 'todos', label: 'Todos', n: c.todos },
      { id: 'garimpo', label: 'Meu garimpo', n: c.garimpo },
      { id: 'clonagem', label: 'Clonagem', n: c.clonagem },
    ];
    return lista;
  });
}

/**
 * Os números da origem no cabeçalho de Grupos, no lugar do tempo ativo e da próxima postagem:
 * no mesmo formato deles (ícone, rótulo e valor, com divisória).
 */
@Component({
  selector: 'app-grupos-numeros',
  standalone: true,
  template: `
    <dl class="tk" aria-label="Origem dos produtos">
      <div class="tk-item">
        <svg data-cor="ouro" aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3.5 9 5 4.5h14L20.5 9"/><path d="M3.5 9h17v9.5a1.5 1.5 0 0 1-1.5 1.5H5a1.5 1.5 0 0 1-1.5-1.5Z"/><path d="M9.5 20v-5.5h5V20"/></svg>
        <div><dt>Com o meu garimpo</dt><dd>{{ texto().garimpo }}</dd></div>
      </div>
      <div class="tk-item">
        <svg data-cor="azul" aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"/></svg>
        <div><dt>Com clonagem</dt><dd>{{ texto().clonagem }}</dd></div>
      </div>
      <div class="tk-item">
        <svg data-cor="verde" aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/></svg>
        <div><dt>Concorrentes lidos</dt><dd>{{ texto().lidos }}</dd></div>
      </div>
    </dl>
  `,
})
export class GruposNumeros {
  private origem = inject(GruposOrigemService);

  protected readonly texto = computed(() => {
    const c = this.origem.contagem();
    const grupos = (n: number) => `${n} ${n === 1 ? 'grupo' : 'grupos'}`;
    return { garimpo: grupos(c.garimpo), clonagem: grupos(c.clonagem), lidos: grupos(c.lidos) };
  });
}
