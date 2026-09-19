import { Component, computed, effect, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ConfigService } from '../../../core/services/config.service';

@Component({
  selector: 'app-schedule-card',
  standalone: true,
  imports: [FormsModule],
  templateUrl: './schedule-card.html',
})
export class ScheduleCard {
  protected configService = inject(ConfigService);

  protected readonly intervaloMinMinutos = signal(20);
  protected readonly intervaloMaxMinutos = signal(60);
  protected readonly salvando = signal(false);
  protected readonly mensagem = signal<{ tipo: 'ok' | 'erro'; texto: string } | null>(null);

  protected readonly postagensPorDia = computed(() => {
    const min = this.intervaloMinMinutos();
    const max = this.intervaloMaxMinutos();
    if (!min || !max || min > max) return '—';
    const porDiaMax = Math.round((24 * 60) / min);
    const porDiaMin = Math.round((24 * 60) / max);
    if (porDiaMin === porDiaMax) return `${porDiaMin} postagens`;
    return `${porDiaMin} a ${porDiaMax} postagens`;
  });

  constructor() {
    effect(() => {
      const cfg = this.configService.config();
      if (!cfg) return;
      this.intervaloMinMinutos.set(cfg.agendamento.intervaloMinMinutos);
      this.intervaloMaxMinutos.set(cfg.agendamento.intervaloMaxMinutos);
    });
  }

  async salvar(): Promise<void> {
    this.mensagem.set(null);

    if (this.intervaloMinMinutos() > this.intervaloMaxMinutos()) {
      this.mensagem.set({ tipo: 'erro', texto: 'O intervalo mínimo não pode ser maior que o máximo.' });
      return;
    }

    this.salvando.set(true);
    const r = await this.configService.salvar({
      agendamento: {
        intervaloMinMinutos: this.intervaloMinMinutos(),
        intervaloMaxMinutos: this.intervaloMaxMinutos(),
      },
    });
    this.salvando.set(false);
    this.mensagem.set(
      r.ok ? { tipo: 'ok', texto: 'Salvo!' } : { tipo: 'erro', texto: r.erro ?? 'Erro ao salvar.' }
    );
    if (r.ok) setTimeout(() => this.mensagem.set(null), 3000);
  }
}
