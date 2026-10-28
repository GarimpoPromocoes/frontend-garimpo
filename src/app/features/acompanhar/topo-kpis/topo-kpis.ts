import { Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { JobsService } from '../../../core/services/jobs.service';
import { RunControlService } from '../../../core/services/run-control.service';
import { StatusService } from '../../../core/services/status.service';

/** "2h 34min", "12min", "45s". */
export function duracao(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000));
  if (s < 60) return `${s}s`;
  const min = Math.floor(s / 60);
  if (min < 60) return s % 60 && min < 10 ? `${min}min ${s % 60}s` : `${min}min`;
  return `${Math.floor(min / 60)}h ${min % 60}min`;
}

/** Os números do momento no cabeçalho: tempo ativo e a próxima postagem. */
@Component({
  selector: 'app-topo-kpis',
  standalone: true,
  template: `
    <dl class="tk tk-mini">
      <div class="tk-item" [title]="'Tempo ativo: ' + tempoAtivo()">
        <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="8.5" /><path d="M12 7.5V12l3 2" /></svg>
        <div><dt>Tempo ativo</dt><dd>{{ tempoAtivo() }}</dd></div>
      </div>
      <div class="tk-item" [title]="proxima().rotulo + ': ' + proxima().valor">
        <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M13 2.5 4.5 13.5H12l-1 8 8.5-11H12Z" /></svg>
        <div><dt>{{ proxima().rotulo }}</dt><dd>{{ proxima().valor }}</dd></div>
      </div>
    </dl>
  `,
})
export class TopoKpis {
  private runControl = inject(RunControlService);
  private jobs = inject(JobsService);
  private statusService = inject(StatusService);

  private readonly agora = signal(Date.now());

  constructor() {
    const t = setInterval(() => this.agora.set(Date.now()), 1000);
    inject(DestroyRef).onDestroy(() => clearInterval(t));
  }

  protected readonly tempoAtivo = computed(() => {
    const ini = this.statusService.status()?.job?.iniciadoEm;
    if (!this.runControl.postandoAgora() || !ini) return '—';
    return duracao(this.agora() - new Date(ini).getTime());
  });

  /** A próxima coisa com hora marcada: a postagem agendada ou a nova busca. */
  protected readonly proxima = computed<{ rotulo: string; valor: string }>(() => {
    const p = this.jobs.painel();
    if (!this.runControl.postandoAgora()) return { rotulo: 'Próxima postagem', valor: '—' };
    if (this.runControl.pausado()) return { rotulo: 'Próxima postagem', valor: 'Pausado' };
    const falta = (iso: string) => duracao(new Date(iso).getTime() - this.agora());
    const postar = p?.etapas.postando;
    if (postar?.estado === 'espera' && postar.ate && new Date(postar.ate).getTime() > this.agora()) {
      return { rotulo: 'Próxima postagem em', valor: falta(postar.ate) };
    }
    const buscar = p?.etapas.buscando;
    if (p?.atual === 'buscando' && buscar?.estado === 'espera' && buscar.ate && new Date(buscar.ate).getTime() > this.agora()) {
      return { rotulo: 'Nova busca em', valor: falta(buscar.ate) };
    }
    const prevista = this.runControl.proximaPublicacao();
    if (prevista && new Date(prevista).getTime() > this.agora()) {
      return { rotulo: 'Próxima postagem em', valor: falta(prevista) };
    }
    return { rotulo: 'Próxima postagem', valor: 'Agora' };
  });
}
