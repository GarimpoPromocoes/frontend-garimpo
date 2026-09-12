import { Component, inject } from '@angular/core';
import { AlvoGrupos } from '../../services/jobs.service';
import { RunControlService } from '../../services/run-control.service';

@Component({
  selector: 'app-run-card',
  standalone: true,
  templateUrl: './run-card.html',
})
export class RunCard {
  protected runControl = inject(RunControlService);

  formatarData(iso: string | null): string {
    if (!iso) return '—';
    return new Date(iso).toLocaleString('pt-BR');
  }

  escolherAlvo(alvo: AlvoGrupos): void {
    this.runControl.escolherAlvo(alvo);
  }

  toggleSelecionado(id: string, marcado: boolean): void {
    this.runControl.toggleSelecionado(id, marcado);
  }
}
