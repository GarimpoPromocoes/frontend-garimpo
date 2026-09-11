import { Injectable, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';

export interface StatusResponse {
  mercadoLivre: { conectado: boolean };
  whatsapp: { conectado: boolean };
  produtosPublicados: number;
  produtosCatalogo: number;
  cuponsAtivos: number;
  processoExterno: { rodando: boolean };
  job: { rodando: boolean; tipo: string | null; iniciadoEm: string | null; codigoSaida?: number | null };
  agendamento: {
    manual: {
      ativo: boolean;
      alvo: string;
      ids: string[];
      ultimaRodadaEm: string | null;
      proximaRodadaEm: string | null;
    };
  };
}

@Injectable({ providedIn: 'root' })
export class StatusService {
  private http = inject(HttpClient);

  readonly status = signal<StatusResponse | null>(null);
  private timer: ReturnType<typeof setInterval> | null = null;

  iniciarPolling(intervaloMs = 5000): void {
    if (this.timer) return;
    this.atualizar();
    this.timer = setInterval(() => this.atualizar(), intervaloMs);
  }

  pararPolling(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  async atualizar(): Promise<void> {
    try {
      const s = await firstValueFrom(this.http.get<StatusResponse>('/api/status'));
      this.status.set(s);
    } catch (_) {
      // silencioso — tenta de novo no proximo ciclo de polling
    }
  }
}
