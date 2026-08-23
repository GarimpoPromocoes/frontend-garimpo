import { Component, effect, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ConfigService } from '../../services/config.service';
import { StatusService } from '../../services/status.service';

@Component({
  selector: 'app-schedule-card',
  standalone: true,
  imports: [FormsModule],
  templateUrl: './schedule-card.html',
})
export class ScheduleCard {
  protected configService = inject(ConfigService);
  protected statusService = inject(StatusService);

  protected readonly ativo = signal(false);
  protected readonly horaInicio = signal('08:00');
  protected readonly horaFim = signal('22:00');
  protected readonly intervaloMinMinutos = signal(20);
  protected readonly intervaloMaxMinutos = signal(60);

  protected readonly salvando = signal(false);
  protected readonly mensagem = signal<{ tipo: 'ok' | 'erro'; texto: string } | null>(null);

  constructor() {
    effect(() => {
      const cfg = this.configService.config();
      if (!cfg) return;
      this.ativo.set(cfg.agendamento.ativo);
      this.horaInicio.set(cfg.agendamento.horaInicio);
      this.horaFim.set(cfg.agendamento.horaFim);
      this.intervaloMinMinutos.set(cfg.agendamento.intervaloMinMinutos);
      this.intervaloMaxMinutos.set(cfg.agendamento.intervaloMaxMinutos);
    });
  }

  formatarData(iso: string | null): string {
    if (!iso) return '—';
    return new Date(iso).toLocaleString('pt-BR');
  }

  async salvar(): Promise<void> {
    this.mensagem.set(null);

    if (this.horaInicio() === this.horaFim()) {
      this.mensagem.set({ tipo: 'erro', texto: 'Hora de início e hora de fim precisam ser diferentes.' });
      return;
    }
    if (this.intervaloMinMinutos() > this.intervaloMaxMinutos()) {
      this.mensagem.set({ tipo: 'erro', texto: 'O intervalo mínimo não pode ser maior que o máximo.' });
      return;
    }

    this.salvando.set(true);
    const r = await this.configService.salvar({
      agendamento: {
        ativo: this.ativo(),
        horaInicio: this.horaInicio(),
        horaFim: this.horaFim(),
        intervaloMinMinutos: this.intervaloMinMinutos(),
        intervaloMaxMinutos: this.intervaloMaxMinutos(),
      },
    });
    this.salvando.set(false);
    this.mensagem.set(r.ok ? { tipo: 'ok', texto: 'Salvo!' } : { tipo: 'erro', texto: r.erro ?? 'Erro ao salvar.' });
    if (r.ok) setTimeout(() => this.mensagem.set(null), 3000);
  }
}
