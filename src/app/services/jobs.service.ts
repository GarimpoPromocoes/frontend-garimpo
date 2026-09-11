import { Injectable, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../environments/environment';

export type JobTipo = 'login-ml' | 'trocar-ml' | 'trocar-zap' | 'grupos' | 'ofertas' | 'cupons';

export type AlvoGrupos = 'todos' | 'selecionados';

export interface IniciarJobOpts {
  max?: number;
  minVendidos?: number;
  alvo?: AlvoGrupos;
  ids?: string[];
  loop?: boolean;
}

const MAX_LINHAS = 500;

@Injectable({ providedIn: 'root' })
export class JobsService {
  private http = inject(HttpClient);

  readonly rodando = signal(false);
  readonly tipo = signal<JobTipo | null>(null);
  readonly codigoSaida = signal<number | null>(null);
  readonly linhas = signal<string[]>([]);

  private eventSource: EventSource | null = null;

  constructor() {
    this.conectarStream();
  }

  private conectarStream(): void {
    if (typeof EventSource === 'undefined') return; // ambiente sem suporte (ex.: testes)
    // EventSource nativo nao manda headers custom — o token (quando existe)
    // vai por query param mesmo (auth.js do backend aceita os dois jeitos).
    const url =
      `${environment.apiBase}/api/jobs/stream` +
      (environment.apiToken ? `?token=${encodeURIComponent(environment.apiToken)}` : '');
    this.eventSource = new EventSource(url);

    this.eventSource.addEventListener('log', (ev: MessageEvent) => {
      try {
        const { linha } = JSON.parse(ev.data);
        this.linhas.update((atual) => {
          const novo = [...atual, linha as string];
          return novo.length > MAX_LINHAS ? novo.slice(novo.length - MAX_LINHAS) : novo;
        });
      } catch (_) {}
    });

    this.eventSource.addEventListener('status', (ev: MessageEvent) => {
      try {
        const s = JSON.parse(ev.data);
        this.rodando.set(!!s.rodando);
        this.tipo.set(s.tipo ?? null);
        this.codigoSaida.set(s.codigoSaida ?? null);
      } catch (_) {}
    });

    this.eventSource.onerror = () => {
      // o navegador reconecta o EventSource sozinho — nada a fazer aqui.
    };
  }

  limparConsole(): void {
    this.linhas.set([]);
  }

  async iniciar(tipo: JobTipo, opts: IniciarJobOpts = {}): Promise<{ ok: boolean; erro?: string }> {
    try {
      await firstValueFrom(this.http.post('/api/jobs/start', { tipo, ...opts }));
      return { ok: true };
    } catch (e: any) {
      return { ok: false, erro: e?.error?.erro || 'Não foi possível iniciar essa ação.' };
    }
  }

  async confirmarEnter(): Promise<void> {
    await firstValueFrom(this.http.post('/api/jobs/stdin', { text: '\n' }));
  }

  async parar(): Promise<void> {
    await firstValueFrom(this.http.post('/api/jobs/stop', {}));
  }

  // Liga o loop continuo do botao "Executar": posta 1 mensagem por vez, com
  // intervalo aleatorio, ate o "Parar" ser clicado (ver scheduler.js).
  async iniciarContinuo(alvo: AlvoGrupos, ids: string[] = []): Promise<{ ok: boolean; erro?: string }> {
    try {
      await firstValueFrom(this.http.post('/api/jobs/grupos/continuo/iniciar', { alvo, ids }));
      return { ok: true };
    } catch (e: any) {
      return { ok: false, erro: e?.error?.erro || 'Não foi possível iniciar essa ação.' };
    }
  }

  // Botão "Parar" único: derruba o loop manual, o job do jobRunner e, se
  // houver, o processo apontado como "rodando fora do dashboard".
  async pararTudo(): Promise<void> {
    await firstValueFrom(this.http.post('/api/jobs/parar-tudo', {}));
  }
}
