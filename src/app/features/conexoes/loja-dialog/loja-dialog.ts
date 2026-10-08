import { Component, DestroyRef, computed, effect, inject, signal, untracked } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { NgTemplateOutlet } from '@angular/common';
import { ConexoesService, Provedor } from '../../../core/services/conexoes.service';
import { JobsService, JobTipo, PedidoLogin } from '../../../core/services/jobs.service';
import { StatusService } from '../../../core/services/status.service';
import { LojasUiService } from '../../../core/services/lojas-ui.service';
import { ConfirmacaoService } from '../../../core/services/confirmacao.service';
import { VerificacaoService } from '../../../core/services/verificacao.service';

const ROTULO: Record<Provedor, string> = {
  mercadolivre: 'Mercado Livre',
  amazon: 'Amazon',
  shopee: 'Shopee',
};

const LOGO: Record<Provedor, string> = {
  mercadolivre: 'lojas/mercadolivre.svg',
  amazon: 'lojas/amazon.svg',
  shopee: 'lojas/shopee.svg',
};

// "o Mercado Livre" x "a Amazon": o artigo muda por loja.
const ARTIGO: Record<Provedor, 'o' | 'a'> = {
  mercadolivre: 'o',
  amazon: 'a',
  shopee: 'a',
};

// Garimpo e link da Shopee saem da API (App ID/Secret). O login de navegador
// abaixo e' um extra: serve so' pra ler os cliques no dashboard, que a API nao
// entrega. Por isso conectar a Shopee pede as chaves E a conta.
const JOB_DE: Partial<Record<Provedor, JobTipo>> = {
  mercadolivre: 'login-ml',
  amazon: 'login-amazon',
  shopee: 'login-shopee',
};

// Lojas em que o robô também sabe entrar pela conta Google.
const ACEITA_GOOGLE: Provedor[] = ['mercadolivre'];

// Lojas que mostram "escolha como entrar" (senha, SMS, WhatsApp, e-mail,
// Google Authenticator, reconhecimento facial...). Nelas o formulário pede só a
// conta; a senha só aparece se a pessoa escolher entrar com ela.
const ESCOLHE_METODO: Provedor[] = ['mercadolivre'];

// Câmera que vai para a loja no reconhecimento facial: 4:3, como uma webcam.
const CAMERA_LARGURA = 640;
const CAMERA_ALTURA = 480;
const CAMERA_QUALIDADE = 0.7;
const CAMERA_INTERVALO_MS = 100;

const AJUDA: Partial<Record<Provedor, { texto: string; link: string; rotuloLink: string }>> = {
  shopee: {
    texto:
      'A Shopee usa a API (App ID/Secret) para o garimpo e os links. A conta e a senha abaixo servem para o robo abrir o dashboard e ler os cliques (a API nao entrega cliques). As chaves ficam em "Open API", no menu lateral do painel de Afiliados.',
    link: 'https://affiliate.shopee.com.br',
    rotuloLink: 'Abrir painel da Shopee',
  },
  amazon: {
    texto: 'Sua tag de associado aparece no painel da Amazon Associados (termina com -20, por exemplo minhaloja-20).',
    link: 'https://associados.amazon.com.br',
    rotuloLink: 'Abrir Amazon Associados',
  },
};

interface CampoModal {
  nome: string;
  rotulo: string;
  tipo: 'texto' | 'segredo' | 'opcoes';
  opcoes?: string[];
  grupo: 'afiliado' | 'login';
  opcional?: boolean;
}

/**
 * A janela de conexão de uma loja. Pede de uma vez tudo que é preciso para
 * entrar (dados de afiliado + conta e senha) e, daí em diante, mostra o robô
 * entrando: cada coisa que a plataforma pedir vira um campo aqui dentro.
 * Nenhuma tela de navegador aparece.
 */
@Component({
  selector: 'app-loja-dialog',
  standalone: true,
  imports: [FormsModule, NgTemplateOutlet],
  templateUrl: './loja-dialog.html',
})
export class LojaDialog {
  private conexoes = inject(ConexoesService);
  protected jobsService = inject(JobsService);
  protected statusService = inject(StatusService);
  private lojasUi = inject(LojasUiService);
  private confirmacao = inject(ConfirmacaoService);
  protected verificacao = inject(VerificacaoService);

  protected readonly estadoLogin = computed(() => this.jobsService.login());
  protected readonly pedido = computed<PedidoLogin | null>(() => this.estadoLogin()?.pedido ?? null);
  protected readonly fim = computed(() => this.estadoLogin()?.fim ?? null);
  protected readonly etapas = computed(() => this.estadoLogin()?.etapas ?? []);

  /** A loja que o usuário abriu — ou a que o robô está reconectando sozinho. */
  protected readonly provedor = computed<Provedor | null>(
    () => this.lojasUi.aberta() ?? this.estadoLogin()?.provedor ?? null,
  );
  protected readonly aberto = computed(() => !!this.provedor());
  protected readonly rotulo = computed(() => {
    const p = this.provedor();
    return p ? ROTULO[p] : '';
  });
  protected readonly artigo = computed(() => {
    const p = this.provedor();
    return p ? ARTIGO[p] : 'a';
  });
  protected readonly artigoM = computed(() => (this.artigo() === 'o' ? 'O' : 'A'));

  /** A Shopee nao abre navegador nenhum: conectar e' so' informar as chaves. */
  protected readonly usaNavegador = computed(() => {
    const p = this.provedor();
    return !!p && !!JOB_DE[p];
  });
  protected readonly aceitaGoogle = computed(() => {
    const p = this.provedor();
    return !!p && ACEITA_GOOGLE.includes(p);
  });
  protected readonly escolheMetodo = computed(() => {
    const p = this.provedor();
    return !!p && ESCOLHE_METODO.includes(p);
  });
  protected readonly ajuda = computed(() => {
    const p = this.provedor();
    return (p && AJUDA[p]) || null;
  });

  protected readonly logo = computed(() => {
    const p = this.provedor();
    return p ? LOGO[p] : '';
  });

  /** Em login quando há um trabalho do robô em curso (ou recém-terminado). */
  protected readonly emLogin = computed(() => !!this.estadoLogin());
  protected readonly trabalhando = computed(() => this.emLogin() && !this.pedido() && !this.fim());

  protected readonly conexao = computed(() => {
    const p = this.provedor();
    return p ? this.conexoes.statusDe(p) : null;
  });
  protected readonly dadosAfiliadoSalvos = computed(() => this.conexao()?.status === 'conectado');

  /**
   * A loja esta valendo pro robo — de verdade, agora, não só o que ficou
   * guardado. No ML e na Shopee isso é a sessão/chave ainda ser aceita (a
   * checagem ao vivo vence quando existe); na Amazon é a tag de associado,
   * que não expira sozinha — sem ela o link não paga comissão, com ou sem
   * sessão de navegador.
   */
  protected readonly conectada = computed(() => {
    switch (this.provedor()) {
      case 'mercadolivre':
        return this.verificacao.mercadoLivreConectado();
      case 'shopee':
        return this.verificacao.shopeeConectado();
      default:
        return this.dadosAfiliadoSalvos();
    }
  });
  protected readonly loginGuardado = computed(() => this.conexao()?.login ?? null);

  protected readonly sessao = computed(() => {
    switch (this.provedor()) {
      case 'mercadolivre':
        return { logado: this.verificacao.mercadoLivreConectado(), detalhe: null as string | null };
      case 'amazon':
        return {
          logado: this.verificacao.amazonLogado(),
          detalhe: this.verificacao.amazonSiteStripe()
            ? 'Os posts da Amazon saem com link curto (link.amazon).'
            : 'Sem a barra de Associados os posts saem com o link longo, que também dá comissão.',
        };
      default:
        return { logado: false, detalhe: null as string | null };
    }
  });

  /** Tudo que a loja precisa, numa lista só: dados de afiliado + conta e senha. */
  protected readonly campos = computed<CampoModal[]>(() => {
    const p = this.provedor();
    if (!p) return [];

    const afiliado: CampoModal[] = this.dadosAfiliadoSalvos()
      ? []
      : (this.conexoes.formularioDe(p)?.campos ?? []).map((c) => ({
          nome: c.nome,
          rotulo: c.rotulo,
          tipo: c.tipo,
          opcoes: c.opcoes,
          grupo: 'afiliado' as const,
        }));

    if (!this.usaNavegador()) return afiliado;

    const login: CampoModal[] = [{ nome: 'usuario', rotulo: this.rotuloUsuario(p), tipo: 'texto', grupo: 'login' }];
    if (!ESCOLHE_METODO.includes(p)) login.push({ nome: 'senha', rotulo: 'Senha', tipo: 'segredo', grupo: 'login' });

    return [...afiliado, ...login];
  });

  private rotuloUsuario(p: Provedor): string {
    if (p === 'amazon') return 'E-mail ou telefone da conta Amazon';
    if (p === 'shopee') return 'E-mail, telefone ou usuário da Shopee';
    return 'E-mail, telefone ou usuário';
  }

  /**
   * Página traduzida (componente nosso com o que a loja pediu): depois de um
   * clique o pedido some até o robô ler a página de novo. Nesse meio tempo o
   * último componente continua na tela, travado com "Enviando…", em vez de
   * piscar o spinner a cada clique.
   */
  private readonly ultimaPagina = signal<{ pedido: PedidoLogin; etapas: number } | null>(null);
  protected readonly paginaEsperando = computed(() => {
    const t = this.ultimaPagina();
    if (!t || this.pedido() || this.fim() || !this.emLogin()) return null;
    return t.etapas === this.etapas().length ? t.pedido : null;
  });
  protected readonly janelaLarga = computed(() => (this.pedido() ?? this.paginaEsperando())?.forma === 'camera');

  /** Quadros marcados no desafio de imagens (forma 'grade'). */
  protected readonly quadrosMarcados = signal<number[]>([]);

  /**
   * Reconhecimento facial: a câmera deste computador vai, quadro a quadro, para
   * o navegador do robô — é por ela que a loja vê o rosto. Fica ligada enquanto
   * a loja estiver no facial (inclusive no instante entre um clique e a próxima
   * leitura da página).
   */
  protected readonly modoCamera = computed(() => (this.pedido() ?? this.paginaEsperando())?.forma === 'camera');
  protected readonly cameraStream = signal<MediaStream | null>(null);
  protected readonly cameraErro = signal<string | null>(null);
  private cameraLigando = false;
  private cameraVideo: HTMLVideoElement | null = null;
  private cameraTimer: ReturnType<typeof setTimeout> | null = null;
  private cameraFolga: ReturnType<typeof setTimeout> | null = null;
  private readonly cameraCanvas = document.createElement('canvas');

  protected readonly valores = signal<Record<string, string>>({});
  protected readonly erro = signal<string | null>(null);
  protected readonly enviando = signal(false);

  /**
   * O que o usuário já informou no formulário (conta e senha, ou "quero entrar
   * pelo Google"), para o robô não perguntar de novo.
   */
  private credenciaisDigitadas: Record<string, string> | null = null;
  private pedidoJaRespondido = '';
  private ultimoPedido = '';

  constructor() {
    inject(DestroyRef).onDestroy(() => this.desligarCamera());

    // Desliga com folga: entre um clique e a próxima foto a loja pode ficar um
    // instante sem pedido — sem isso a câmera piscaria a cada clique.
    effect(() => {
      const ligar = this.modoCamera();
      const acabou = !this.emLogin() || !!this.fim();
      untracked(() => {
        if (this.cameraFolga) clearTimeout(this.cameraFolga);
        this.cameraFolga = null;
        if (ligar) void this.ligarCamera();
        else if (acabou) this.desligarCamera();
        else this.cameraFolga = setTimeout(() => !this.modoCamera() && this.desligarCamera(), 4000);
      });
    });

    effect(() => {
      const p = this.pedido();
      if (p?.forma === 'pagina' || p?.forma === 'camera') {
        this.ultimaPagina.set({ pedido: p, etapas: this.etapas().length });
      } else if (p || this.fim()) {
        this.ultimaPagina.set(null);
      }
    });

    // Cada pergunta nova do robô começa com os campos limpos.
    effect(() => {
      const p = this.pedido();
      const id = p?.id ?? '';
      if (id === this.ultimoPedido) return;
      this.ultimoPedido = id;
      if (!p) return;

      this.erro.set(null);
      this.quadrosMarcados.set([]);
      this.valores.set(p.opcoes?.length ? { opcao: p.opcoes[0].valor } : {});

      // Conta e senha já vieram no formulário desta janela: responde sozinho em
      // vez de pedir a mesma coisa duas vezes. Se a loja recusar, o robô
      // pergunta de novo e aí sim o campo aparece.
      if (p.forma === 'credenciais' && this.credenciaisDigitadas && this.pedidoJaRespondido !== p.id) {
        this.pedidoJaRespondido = p.id;
        const resposta = this.credenciaisDigitadas;
        this.credenciaisDigitadas = null;
        void this.jobsService.responderLogin(p.id, resposta);
      }
    });

    // Deu certo: atualiza o que está atrás da janela e fecha sozinha depois de
    // um instante — ninguém fica olhando pra ela sem saber se já pode sair.
    effect(() => {
      const f = this.fim();
      if (!f?.ok) return;
      this.conexoes.carregar();
      this.statusService.atualizar();
      if (!this.timerFechar) this.timerFechar = setTimeout(() => this.fechar(), 4000);
    });
  }

  private timerFechar: ReturnType<typeof setTimeout> | null = null;

  protected valorDe(campo: string): string {
    return this.valores()[campo] ?? '';
  }

  protected definir(campo: string, valor: string): void {
    this.valores.update((v) => ({ ...v, [campo]: valor }));
  }

  private preenchido(nome: string): boolean {
    return (this.valorDe(nome) || '').trim().length > 0;
  }

  /** Pelo Google, conta e senha da loja não são necessárias — só os dados de afiliado. */
  protected podeConectar(metodo: 'senha' | 'google' = 'senha'): boolean {
    if (this.enviando()) return false;
    const obrigatorios = this.campos().filter((c) => !c.opcional && (metodo === 'senha' || c.grupo !== 'login'));
    return obrigatorios.every((c) => this.preenchido(c.nome) || c.tipo === 'opcoes');
  }

  /** Um clique só: guarda os dados de afiliado e manda o robô entrar. */
  async conectar(metodo: 'senha' | 'google' = 'senha'): Promise<void> {
    const p = this.provedor();
    if (!p || !this.podeConectar(metodo)) return;

    this.erro.set(null);
    this.enviando.set(true);
    // A partir daqui essa loja tem uma ação em curso que vai confirmar o
    // estado dela por conta própria — uma checagem ao vivo antiga não pode
    // continuar escondendo isso.
    this.jobsService.esquecerVerificacao(p);

    const afiliado = this.campos().filter((c) => c.grupo === 'afiliado');
    const temAfiliado = afiliado.length > 0 && afiliado.some((c) => this.preenchido(c.nome) || c.tipo === 'opcoes');

    if (temAfiliado) {
      const valores: Record<string, string> = {};
      for (const campo of afiliado) {
        valores[campo.nome] = this.valorDe(campo.nome) || (campo.tipo === 'opcoes' ? campo.opcoes?.[0] ?? '' : '');
      }
      const r = await this.conexoes.conectar(p, valores);
      if (!r.ok) {
        this.enviando.set(false);
        this.erro.set(r.erro ?? null);
        return;
      }
    }

    const job = JOB_DE[p];
    if (!job) {
      // Shopee: salvou as chaves, acabou. Nao ha login de navegador pra fazer.
      this.enviando.set(false);
      this.valores.set({});
      await this.conexoes.carregar();
      this.fechar();
      return;
    }

    this.credenciaisDigitadas =
      metodo === 'google'
        ? { metodo: 'google' }
        : { usuario: this.valorDe('usuario').trim(), senha: this.valorDe('senha') };
    this.valores.set({});

    const r = await this.jobsService.iniciar(job);
    this.enviando.set(false);
    if (!r.ok) {
      this.credenciaisDigitadas = null;
      this.erro.set(r.erro ?? null);
    }
  }

  /** Responde ao que a plataforma pediu no meio do login. */
  protected podeResponder(): boolean {
    const p = this.pedido();
    if (!p || this.jobsService.respondendoLogin()) return false;
    if (p.opcoes?.length) return !!this.valorDe('opcao');
    return p.campos.every((c) => this.preenchido(c.nome));
  }

  async responder(): Promise<void> {
    const p = this.pedido();
    if (!p || !this.podeResponder()) return;
    this.erro.set(null);
    const r = await this.jobsService.responderLogin(p.id, this.valores());
    if (!r.ok) this.erro.set(r.erro ?? null);
    else this.valores.set({});
  }

  // ---- verificações interativas (QR, "não sou um robô", tela da loja) -------

  private async responderCom(valores: Record<string, string>): Promise<void> {
    const p = this.pedido();
    if (!p || this.jobsService.respondendoLogin()) return;
    this.erro.set(null);
    const r = await this.jobsService.responderLogin(p.id, valores);
    if (!r.ok) this.erro.set(r.erro ?? null);
  }

  protected escolher(valor: string): void {
    void this.responderCom({ opcao: valor });
  }

  /** No meio do login: troca conta e senha da loja pela conta Google. */
  protected entrarComGoogle(): void {
    void this.responderCom({ metodo: 'google' });
  }

  protected marcarRobo(): void {
    void this.responderCom({ acao: 'marcar' });
  }

  protected outraForma(): void {
    void this.responderCom({ acao: 'voltar' });
  }

  protected reenviarCodigo(): void {
    void this.responderCom({ acao: 'reenviar' });
  }

  // ---- câmera do reconhecimento facial ---------------------------------------

  protected async ligarCamera(): Promise<void> {
    if (this.cameraStream() || this.cameraLigando) return;
    if (!navigator.mediaDevices?.getUserMedia) {
      this.cameraErro.set(
        'Este navegador não libera a câmera nesta página. Abra o painel pelo endereço com https (ou em localhost) e tente de novo.',
      );
      return;
    }
    this.cameraLigando = true;
    this.cameraErro.set(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: CAMERA_LARGURA }, height: { ideal: CAMERA_ALTURA }, facingMode: 'user' },
        audio: false,
      });
      // A loja saiu do facial enquanto a pessoa liberava a câmera.
      if (!this.modoCamera()) {
        stream.getTracks().forEach((t) => t.stop());
        return;
      }
      const video = document.createElement('video');
      video.muted = true;
      video.playsInline = true;
      video.srcObject = stream;
      await video.play().catch(() => {});
      this.cameraVideo = video;
      this.cameraStream.set(stream);
      void this.mandarQuadros();
    } catch (e: any) {
      const nome = e?.name;
      this.cameraErro.set(
        nome === 'NotAllowedError'
          ? 'A câmera foi bloqueada. Clique no cadeado ao lado do endereço do site, permita a câmera e depois em "Ligar câmera".'
          : nome === 'NotFoundError' || nome === 'OverconstrainedError'
            ? 'Não encontrei nenhuma câmera neste computador. Use outra forma de entrar.'
            : nome === 'NotReadableError'
              ? 'A câmera está em uso por outro programa. Feche-o e clique em "Ligar câmera".'
              : 'Não consegui abrir a câmera.',
      );
    } finally {
      this.cameraLigando = false;
    }
  }

  private desligarCamera(): void {
    if (this.cameraFolga) clearTimeout(this.cameraFolga);
    this.cameraFolga = null;
    if (this.cameraTimer) clearTimeout(this.cameraTimer);
    this.cameraTimer = null;
    this.cameraStream()?.getTracks().forEach((t) => t.stop());
    this.cameraStream.set(null);
    this.cameraVideo = null;
  }

  /** Um quadro por vez: o próximo só sai quando o anterior chegou. */
  private async mandarQuadros(): Promise<void> {
    const video = this.cameraVideo;
    if (!video || !this.cameraStream()) return;
    if (video.readyState >= 2 && video.videoWidth && video.videoHeight) {
      // Recorta o meio em 4:3 — webcam 16:9 esticada deixaria o rosto deformado.
      const alvo = CAMERA_LARGURA / CAMERA_ALTURA;
      let sw = video.videoWidth;
      let sh = video.videoHeight;
      if (sw / sh > alvo) sw = Math.round(sh * alvo);
      else sh = Math.round(sw / alvo);
      const sx = Math.round((video.videoWidth - sw) / 2);
      const sy = Math.round((video.videoHeight - sh) / 2);
      const c = this.cameraCanvas;
      c.width = CAMERA_LARGURA;
      c.height = CAMERA_ALTURA;
      c.getContext('2d')?.drawImage(video, sx, sy, sw, sh, 0, 0, c.width, c.height);
      await this.jobsService.enviarQuadroCamera(c.toDataURL('image/jpeg', CAMERA_QUALIDADE));
    }
    if (this.cameraVideo !== video) return;
    this.cameraTimer = setTimeout(() => void this.mandarQuadros(), CAMERA_INTERVALO_MS);
  }

  // ---- página traduzida (o que a loja pediu, em componente nosso) ------------

  /** Um botão/opção da página: vai junto com o que já foi preenchido nos campos. */
  protected acionar(valor: string): void {
    void this.responderCom({ ...this.valores(), acao: valor });
  }

  /** Enter num campo: aperta o botão principal da página (ou só Enter, se não houver). */
  protected enviarPagina(p: PedidoLogin): void {
    const principal = p.acoes?.find((a) => a.tipo === 'principal' && !a.desativado);
    void this.responderCom(principal ? { ...this.valores(), acao: principal.valor } : this.valores());
  }

  protected alternarCaixa(campo: string): void {
    this.definir(campo, this.valorDe(campo) === '1' ? '0' : '1');
  }

  // ---- desafio de imagens -----------------------------------------------------

  protected alternarQuadro(i: number): void {
    this.quadrosMarcados.update((q) => (q.includes(i) ? q.filter((x) => x !== i) : [...q, i]));
  }

  protected confirmarGrade(): void {
    const quadros = [...this.quadrosMarcados()].sort((a, b) => a - b).join(',');
    void this.responderCom({ quadros });
  }

  protected outraImagem(): void {
    void this.responderCom({ acao: 'outra' });
  }

  protected indices(n: number): number[] {
    return Array.from({ length: n }, (_, i) => i);
  }

  async entrarDeNovo(): Promise<void> {
    const p = this.provedor();
    const job = p && JOB_DE[p];
    if (!job) return;
    this.erro.set(null);
    this.jobsService.esquecerVerificacao(p);
    const r = await this.jobsService.iniciar(job);
    if (!r.ok) this.erro.set(r.erro ?? null);
  }

  async desconectar(): Promise<void> {
    const p = this.provedor();
    if (!p) return;

    const ok = await this.confirmacao.pedir({
      titulo: `Desconectar ${this.de(p)} ${ROTULO[p]}?`,
      texto:
        p === 'mercadolivre'
          ? 'A sessão do robô no Mercado Livre é encerrada e a senha guardada é apagada. Como o navegador do robô é o mesmo, a sessão da Amazon também cai — a tag de associado dela continua salva.'
          : 'Os dados que fazem o link dar comissão são apagados e o robô para de postar ofertas desta loja.',
      confirmar: 'Desconectar',
      perigo: true,
    });
    if (!ok) return;

    this.erro.set(null);
    this.enviando.set(true);
    this.jobsService.esquecerVerificacao(p);
    await this.conexoes.esquecerLogin(p);
    await this.conexoes.desconectar(p);

    // No ML a "conexao" e' a sessao do navegador: so' o robo consegue apagar.
    if (p === 'mercadolivre') {
      // Mesmo perfil de navegador: desconectar o ML derruba a sessão da
      // Amazon junto (a tag de associado dela continua salva à parte).
      this.jobsService.esquecerVerificacao('amazon');
      const r = await this.jobsService.iniciar('desconectar-ml');
      if (!r.ok) this.erro.set(r.erro ?? null);
    }
    if (p === 'shopee') {
      // Encerra a sessão de navegador do dashboard (a que lê os cliques).
      const r = await this.jobsService.iniciar('desconectar-shopee');
      if (!r.ok) this.erro.set(r.erro ?? null);
    }
    this.enviando.set(false);
    await this.statusService.atualizar();
  }

  private de(p: Provedor): string {
    return ARTIGO[p] === 'o' ? 'do' : 'da';
  }

  // Não fica exposto no template: com o modal fechável por X e por clique
  // fora, o único jeito de chegar aqui é através do aoFechar() no meio de
  // um login em andamento.
  private async cancelar(): Promise<void> {
    const p = this.pedido();
    if (p) await this.jobsService.cancelarLogin(p.id);
    else if (this.emLogin() && this.jobsService.rodando()) await this.jobsService.parar();
    this.fechar();
  }

  /**
   * O X do canto. Com o login em andamento ele vale por "Cancelar": só esconder
   * a janela não adiantaria nada — o robô continuaria esperando uma resposta que
   * ninguém pode dar, e a janela voltaria no próximo evento dele.
   */
  async aoFechar(): Promise<void> {
    if (this.emLogin() && !this.fim()) {
      await this.cancelar();
      return;
    }
    this.fechar();
  }

  fechar(): void {
    if (this.timerFechar) clearTimeout(this.timerFechar);
    this.timerFechar = null;
    this.desligarCamera();
    this.credenciaisDigitadas = null;
    this.valores.set({});
    this.erro.set(null);
    this.jobsService.limparLogin();
    this.lojasUi.fechar();
  }
}
