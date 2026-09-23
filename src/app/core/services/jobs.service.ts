import { Injectable, effect, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../../environments/environment';
import { AuthService } from './auth.service';

export type JobTipo =
  | 'login-ml'
  | 'trocar-ml'
  | 'desconectar-ml'
  | 'login-amazon'
  | 'trocar-zap'
  | 'grupos'
  | 'ganhos';

export type AlvoGrupos = 'todos' | 'selecionados';

export type Provedor = 'mercadolivre' | 'shopee' | 'amazon';

/** Uma pergunta da plataforma traduzida para uma tela nossa. */
export interface PedidoLogin {
  id: string;
  forma: 'credenciais' | 'senha' | 'codigo' | 'captcha' | 'escolha';
  provedor: Provedor;
  titulo: string;
  texto?: string | null;
  destino?: string | null;
  imagem?: string | null;
  campos: { nome: string; rotulo: string; tipo: 'texto' | 'segredo' | 'codigo'; tamanho?: number }[];
  opcoes?: { valor: string; rotulo: string }[];
  expiraEm?: string;
}

export interface EtapaLogin {
  etapa: string;
  texto: string;
  em?: string;
}

export interface FimLogin {
  ok: boolean;
  motivo: string | null;
  comoResolver: string | null;
  /** Print do que a plataforma mostrou, só quando deu errado. */
  imagem: string | null;
  em?: string;
}

export interface EstadoLogin {
  provedor: Provedor | null;
  etapas: EtapaLogin[];
  pedido: PedidoLogin | null;
  fim: FimLogin | null;
}

const MAX_LINHAS = 500;
const INTERVALO_LOTE_MS = 150;

const JOBS_DE_LOGIN: JobTipo[] = ['login-ml', 'trocar-ml', 'login-amazon'];

const PROVEDOR_DO_JOB: Partial<Record<JobTipo, Provedor>> = {
  'login-ml': 'mercadolivre',
  'trocar-ml': 'mercadolivre',
  'login-amazon': 'amazon',
};

@Injectable({ providedIn: 'root' })
export class JobsService {
  private http = inject(HttpClient);
  private auth = inject(AuthService);

  readonly rodando = signal(false);
  readonly tipo = signal<JobTipo | null>(null);
  readonly codigoSaida = signal<number | null>(null);
  readonly linhas = signal<string[]>([]);
  readonly qrWhatsapp = signal<string | null>(null);
  readonly desafioMl = signal<{ url: string; em: string } | null>(null);

  /** Andamento do login automático — é o que a janela de conexão desenha. */
  readonly login = signal<EstadoLogin | null>(null);
  readonly respondendoLogin = signal(false);

  private eventSource: EventSource | null = null;
  /** Resultado de login que o usuário já fechou — não reabrir. */
  private fimJaFechado: string | null = null;

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
        this.qrWhatsapp.set(s.qrWhatsapp ?? null);
        this.desafioMl.set(s.desafioMl ?? null);
        this.aplicarLogin(s);
      } catch (_) {}
    });

    this.eventSource.onerror = () => {
    };
  }

  /**
   * A janela de conexão abre no clique, antes do robô falar — e não pode piscar
   * quando chega um status ainda sem notícia do login. Também não reabre um
   * resultado que o usuário já fechou (acontece ao recarregar a página).
   */
  private aplicarLogin(s: { tipo?: JobTipo | null; rodando?: boolean; login?: EstadoLogin | null }): void {
    const ehLogin = !!s.tipo && JOBS_DE_LOGIN.includes(s.tipo);

    if (s.login) {
      if (s.login.fim && s.login.fim.em && s.login.fim.em === this.fimJaFechado) return;
      this.login.set(s.login);
      if (s.login.pedido) this.respondendoLogin.set(false);
      return;
    }

    // Sem estado de login: só fecha se não houver login em andamento.
    if (!ehLogin || !s.rodando) this.login.set(null);
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
    this.qrWhatsapp.set(null);
    this.desafioMl.set(null);
    this.login.set(null);
  }

  limparConsole(): void {
    this.pendentes = [];
    this.linhas.set([]);
  }

  async iniciar(tipo: JobTipo): Promise<{ ok: boolean; erro?: string }> {
    const provedor = PROVEDOR_DO_JOB[tipo] ?? null;
    this.fimJaFechado = null;
    // Abre a janela na hora do clique: esperar o robô falar deixaria o botão
    // parecendo morto por alguns segundos.
    this.login.set(provedor ? { provedor, etapas: [{ etapa: 'abrindo', texto: 'Preparando a conexão…' }], pedido: null, fim: null } : null);
    try {
      await firstValueFrom(this.http.post('/api/jobs/start', { tipo }));
      return { ok: true };
    } catch (e: any) {
      this.login.set(null);
      return { ok: false, erro: e?.error?.erro || 'Não foi possível iniciar essa ação.' };
    }
  }

  /** Manda de volta ao robô o que a plataforma pediu (senha, código, captcha). */
  async responderLogin(id: string, valores: Record<string, string>): Promise<{ ok: boolean; erro?: string }> {
    this.respondendoLogin.set(true);
    try {
      await firstValueFrom(this.http.post('/api/jobs/login/responder', { id, valores }));
      return { ok: true };
    } catch (e: any) {
      this.respondendoLogin.set(false);
      return { ok: false, erro: e?.error?.erro || 'Não consegui enviar a resposta.' };
    }
  }

  async cancelarLogin(id: string): Promise<void> {
    try {
      await firstValueFrom(this.http.post('/api/jobs/login/responder', { id, cancelado: true }));
    } catch (_) {
      await this.parar();
    }
    this.respondendoLogin.set(false);
  }

  /** Fecha a janela de conexão depois que o login terminou. */
  limparLogin(): void {
    this.fimJaFechado = this.login()?.fim?.em ?? null;
    this.login.set(null);
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
