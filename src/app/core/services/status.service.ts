import { Injectable, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';

export type ProvedorConexao = 'whatsapp' | 'telegram' | 'mercadolivre' | 'amazon' | 'shopee';

/** Estado real de uma conexão, gravado por quem sabe (o robô, a checagem ao vivo). */
export interface EstadoConexao {
  conectado: boolean;
  motivo: string | null;
  /** Quem desligou foi a pessoa — não é queda. */
  manual: boolean;
  /** Já funcionou alguma vez — falhar na primeira tentativa não é "caiu". */
  jaConectou: boolean;
  em: string;
}

export interface StatusResponse {
  mercadoLivre: { conectado: boolean };
  amazon?: { logado: boolean; linkCurto: boolean; verificadoEm: string | null };
  whatsapp: { conectado: boolean; numero: string | null; nome: string | null };
  telegram?: { conectado: boolean; nome: string | null; usuario: string | null; numero: string | null };
  conexoes?: Partial<Record<ProvedorConexao, EstadoConexao>>;
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
  private emAndamento: Promise<void> | null = null;

  private readonly aoMudarVisibilidade = () => {
    if (!document.hidden) void this.atualizar();
  };

  iniciarPolling(intervaloMs = 5000): void {
    if (this.timer) return;
    void this.atualizar();
    this.timer = setInterval(() => {
      if (typeof document === 'undefined' || !document.hidden) void this.atualizar();
    }, intervaloMs);
    if (typeof document !== 'undefined') document.addEventListener('visibilitychange', this.aoMudarVisibilidade);
  }

  pararPolling(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    if (typeof document !== 'undefined') document.removeEventListener('visibilitychange', this.aoMudarVisibilidade);
  }

  atualizar(): Promise<void> {
    if (this.emAndamento) return this.emAndamento;
    this.emAndamento = (async () => {
      try {
        const s = await firstValueFrom(this.http.get<StatusResponse>('/api/status'));
        this.status.set(s);
      } catch (_) {
      } finally {
        this.emAndamento = null;
      }
    })();
    return this.emAndamento;
  }
}
