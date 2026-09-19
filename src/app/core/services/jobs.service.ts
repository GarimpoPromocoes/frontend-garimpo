import { Injectable, effect, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../../environments/environment';
import { AuthService } from './auth.service';

export type JobTipo =
  | 'login-ml'
  | 'trocar-ml'
  | 'login-amazon'
  | 'login-shopee'
  | 'trocar-zap'
  | 'grupos'
  | 'ganhos';

export type AlvoGrupos = 'todos' | 'selecionados';

const MAX_LINHAS = 500;
const INTERVALO_LOTE_MS = 150;

@Injectable({ providedIn: 'root' })
export class JobsService {
  private http = inject(HttpClient);
  private auth = inject(AuthService);

  readonly rodando = signal(false);
  readonly tipo = signal<JobTipo | null>(null);
  readonly codigoSaida = signal<number | null>(null);
  readonly linhas = signal<string[]>([]);
  readonly vncPort = signal<number | null>(null);
  readonly qrWhatsapp = signal<string | null>(null);
  readonly desafioMl = signal<{ url: string; em: string } | null>(null);

  private eventSource: EventSource | null = null;

  private pendentes: string[] = [];
  private loteAgendado: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    effect(() => {
      if (this.auth.usuario()) this.conectarStream();
      else this.desconectarStream();
    });
  }

  private conectarStream(): void {
    if (typeof EventSource === 'undefined') return;
    if (this.eventSource) return;

    const token = this.auth.obterToken();
    if (!token) return;

    const url = `${environment.apiBase}/api/jobs/stream?token=${encodeURIComponent(token)}`;
    this.eventSource = new EventSource(url);

    this.eventSource.addEventListener('log', (ev: MessageEvent) => {
      try {
        const { linha } = JSON.parse(ev.data);
        this.enfileirarLinha(linha as string);
      } catch (_) {}
    });

    this.eventSource.addEventListener('status', (ev: MessageEvent) => {
      try {
        const s = JSON.parse(ev.data);
        this.rodando.set(!!s.rodando);
        this.tipo.set(s.tipo ?? null);
        this.codigoSaida.set(s.codigoSaida ?? null);
        this.vncPort.set(s.vncPort ?? null);
        this.qrWhatsapp.set(s.qrWhatsapp ?? null);
        this.desafioMl.set(s.desafioMl ?? null);
      } catch (_) {}
    });

    this.eventSource.onerror = () => {
    };
  }

  private enfileirarLinha(linha: string): void {
    this.pendentes.push(linha);
    if (this.pendentes.length > MAX_LINHAS) this.pendentes = this.pendentes.slice(-MAX_LINHAS);
    if (this.loteAgendado) return;
    this.loteAgendado = setTimeout(() => this.aplicarLote(), INTERVALO_LOTE_MS);
  }

  private aplicarLote(): void {
    this.loteAgendado = null;
    const novas = this.pendentes;
    this.pendentes = [];
    if (!novas.length) return;
    this.linhas.update((atual) => {
      const junto = atual.concat(novas);
      return junto.length > MAX_LINHAS ? junto.slice(junto.length - MAX_LINHAS) : junto;
    });
  }

  private desconectarStream(): void {
    if (this.eventSource) {
      this.eventSource.close();
      this.eventSource = null;
    }
    if (this.loteAgendado) clearTimeout(this.loteAgendado);
    this.loteAgendado = null;
    this.pendentes = [];
    this.linhas.set([]);
    this.rodando.set(false);
    this.tipo.set(null);
    this.codigoSaida.set(null);
    this.vncPort.set(null);
    this.qrWhatsapp.set(null);
    this.desafioMl.set(null);
  }

  limparConsole(): void {
    this.pendentes = [];
    this.linhas.set([]);
  }

  async iniciar(tipo: JobTipo): Promise<{ ok: boolean; erro?: string }> {
    try {
      await firstValueFrom(this.http.post('/api/jobs/start', { tipo }));
      return { ok: true };
    } catch (e: any) {
      return { ok: false, erro: e?.error?.erro || 'Não foi possível iniciar essa ação.' };
    }
  }

  async confirmarEnter(): Promise<void> {
    await firstValueFrom(this.http.post('/api/jobs/stdin', { text: '\n' }));
  }

  async abrirTela(): Promise<{ ok: boolean; vncPort?: number; erro?: string }> {
    try {
      const r: any = await firstValueFrom(this.http.post('/api/jobs/tela', {}));
      if (r?.vncPort) this.vncPort.set(r.vncPort);
      return { ok: true, vncPort: r?.vncPort };
    } catch (e: any) {
      return { ok: false, erro: e?.error?.erro || 'Não consegui abrir a tela do robô.' };
    }
  }

  async parar(): Promise<void> {
    await firstValueFrom(this.http.post('/api/jobs/stop', {}));
  }

  async iniciarContinuo(alvo: AlvoGrupos, ids: string[] = []): Promise<{ ok: boolean; erro?: string }> {
    try {
      await firstValueFrom(this.http.post('/api/jobs/grupos/continuo/iniciar', { alvo, ids }));
      return { ok: true };
    } catch (e: any) {
      return { ok: false, erro: e?.error?.erro || 'Não foi possível iniciar essa ação.' };
    }
  }

  async pararTudo(): Promise<void> {
    await firstValueFrom(this.http.post('/api/jobs/parar-tudo', {}));
  }
}
