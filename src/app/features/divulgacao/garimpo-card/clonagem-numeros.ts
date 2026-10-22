import { Component, computed, inject } from '@angular/core';
import { ClonagemResumoService } from '../../../core/services/clonagem-resumo.service';

/**
 * Os números da Clonagem no cabeçalho (só nessa tela), no lugar do tempo ativo e da próxima
 * postagem: no mesmo formato deles (ícone, rótulo e valor, com divisória).
 */
@Component({
  selector: 'app-clonagem-numeros',
  standalone: true,
  template: `
    <dl class="tk" aria-label="Resumo da clonagem">
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
export class ClonagemNumeros {
  private resumo = inject(ClonagemResumoService);

  protected readonly texto = computed(() => {
    const c = this.resumo.contagem();
    const grupos = (n: number | undefined) => (n == null ? '—' : `${n} ${n === 1 ? 'grupo' : 'grupos'}`);
    return { garimpo: grupos(c?.garimpo), clonagem: grupos(c?.clonagem), lidos: grupos(c?.lidos) };
  });
}
