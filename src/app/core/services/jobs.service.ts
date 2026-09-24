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
  | 'desconectar-zap'
  | 'grupos'
  | 'ganhos'
  | 'verificar-conexoes';

/** Quadro da tela do desafio de segurança do ML (JPEG em base64, no tamanho real da página). */
export interface QuadroDesafio {
  seq: number;
  w: number;
  h: number;
  img: string;
}

export type EntradaDesafio =
  | { t: 'clique'; x: number; y: number }
  | { t: 'texto'; texto: string }
  | { t: 'tecla'; tecla: string }
  | { t: 'rolar'; dy: number };

export type AlvoGrupos = 'todos' | 'selecionados';

export type Provedor = 'mercadolivre' | 'shopee' | 'amazon';

/**
 * Resultado da verificação ao vivo (bot-ml/src/contas/verificar.js): pergunta
 * de verdade pra cada plataforma se a sessão salva ainda vale, em vez de
 * confiar só no que o banco ou o arquivo local dizem. Uma chave ausente
 * significa "não checada agora" — mantém o valor guardado.
 */
export interface VerificacaoConexoes {
  mercadolivre?: { conectado: boolean };
  amazon?: { conectado: boolean; siteStripe: boolean | null };
  whatsapp?: { conectado: boolean };
  shopee?: { conectado: boolean; motivo: string | null };
  /** Quando a checagem ao vivo rodou — um estado guardado mais novo vence ela. */
  em?: string;
}

/** Uma forma de continuar oferecida pela loja (QR, SMS, e-mail…). */
export interface OpcaoVerificacao {
  valor: string;
  rotulo: string;
  detalhe?: string | null;
  tipo?: 'qrcode' | 'whatsapp' | 'sms' | 'email' | 'senha' | 'biometria' | 'app' | 'outro';
}

/** Uma pergunta da plataforma traduzida para uma tela nossa. */
export interface PedidoLogin {
  id: string;
  forma: 'credenciais' | 'senha' | 'codigo' | 'captcha' | 'escolha' | 'robo' | 'tela' | 'qrcode';
  provedor: Provedor;
  titulo: string;
  texto?: string | null;
  destino?: string | null;
  imagem?: string | null;
  campos: { nome: string; rotulo: string; tipo: 'texto' | 'segredo' | 'codigo'; tamanho?: number }[];
  opcoes?: OpcaoVerificacao[];
  /** Tamanho real da página da loja (forma 'tela'), só para referência. */
  largura?: number;
  altura?: number;
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
  /** Popup da verificação do ML: abre sozinho quando ela aparece; o X só esconde. */
  readonly desafioPopupAberto = signal(false);

  /** Andamento do login automático — é o que a janela de conexão desenha. */
  readonly login = signal<EstadoLogin | null>(null);
  readonly respondendoLogin = signal(false);

  /** Resultado mais recente da verificação ao vivo das conexões. */
  readonly verificacao = signal<VerificacaoConexoes | null>(null);

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
        const desafio = s.desafioMl ?? null;
        // Não abre o popup sozinho: a verificação fica em segundo plano (sino +
        // cartão no canto) enquanto o robô segue pelas outras lojas.
        if (!desafio) this.desafioPopupAberto.set(false);
        this.desafioMl.set(desafio);
        if (s.verificacao) this.verificacao.set(s.verificacao);
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
    this.desafioPopupAberto.set(false);
    this.login.set(null);
    this.verificacao.set(null);
  }

  /** Último quadro da tela do desafio do ML (null = nenhum quadro novo desde `seq`). */
  async quadroDoDesafio(seq: number): Promise<QuadroDesafio | null> {
    const r = await firstValueFrom(
      this.http.get<QuadroDesafio>('/api/jobs/desafio-tela', { params: { seq }, observe: 'response' }),
    );
    return r.status === 200 ? r.body : null;
  }

  /** Clique/tecla/rolagem do usuário no popup, repetido pelo robô na aba do desafio. */
  async entradaNoDesafio(entrada: EntradaDesafio): Promise<void> {
    await firstValueFrom(this.http.post('/api/jobs/desafio-entrada', entrada));
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

  /**
   * Esquece o resultado ao vivo de UMA plataforma. Usado depois de uma ação
   * que já confirma o novo estado por conta própria (login, conectar,
   * desconectar) — sem isso, o resultado de uma checagem antiga (feita antes
   * dessa ação) continuaria "vencendo" pra sempre até a próxima checagem, e a
   * ação que o usuário acabou de fazer pareceria não ter efeito nenhum.
   */
  esquecerVerificacao(chave: keyof VerificacaoConexoes): void {
    const atual = this.verificacao();
    if (!atual || !(chave in atual)) return;
    const resto = { ...atual };
    delete resto[chave];
    this.verificacao.set(Object.keys(resto).length ? resto : null);
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
