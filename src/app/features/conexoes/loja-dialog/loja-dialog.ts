import { Component, computed, effect, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ConexoesService, Provedor } from '../../../core/services/conexoes.service';
import { JobsService, JobTipo, PedidoLogin } from '../../../core/services/jobs.service';
import { StatusService } from '../../../core/services/status.service';
import { LojasUiService } from '../../../core/services/lojas-ui.service';
import { ConfirmacaoService } from '../../../core/services/confirmacao.service';

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

// A Shopee e' 100% API (garimpo e link saem do Open API), entao nao tem login
// por navegador: conectar a Shopee e' so' informar as chaves.
const JOB_DE: Partial<Record<Provedor, JobTipo>> = {
  mercadolivre: 'login-ml',
  amazon: 'login-amazon',
};

const AJUDA: Partial<Record<Provedor, { texto: string; link: string; rotuloLink: string }>> = {
  shopee: {
    texto:
      'A Shopee trabalha pela API: entre no painel de Afiliados, abra "Open API" no menu lateral e copie o App ID e o App Secret.',
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
  imports: [FormsModule],
  templateUrl: './loja-dialog.html',
})
export class LojaDialog {
  private conexoes = inject(ConexoesService);
  protected jobsService = inject(JobsService);
  protected statusService = inject(StatusService);
  private lojasUi = inject(LojasUiService);
  private confirmacao = inject(ConfirmacaoService);

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
   * A loja esta valendo pro robo? No ML e' a sessao do navegador; nas outras sao
   * os dados de afiliado (tag da Amazon, chaves da Shopee) — sem eles o link nao
   * paga comissao, com ou sem sessao.
   */
  protected readonly conectada = computed(() =>
    this.provedor() === 'mercadolivre' ? this.sessao().logado : this.dadosAfiliadoSalvos(),
  );
  protected readonly loginGuardado = computed(() => this.conexao()?.login ?? null);

  protected readonly sessao = computed(() => {
    const s = this.statusService.status();
    switch (this.provedor()) {
      case 'mercadolivre':
        return { logado: !!s?.mercadoLivre.conectado, detalhe: null as string | null };
      case 'amazon':
        return {
          logado: !!s?.amazon?.logado,
          detalhe: s?.amazon?.linkCurto
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

    const login: CampoModal[] = [
      { nome: 'usuario', rotulo: this.rotuloUsuario(p), tipo: 'texto', grupo: 'login' },
      { nome: 'senha', rotulo: 'Senha', tipo: 'segredo', grupo: 'login' },
    ];

    return [...afiliado, ...login];
  });

  private rotuloUsuario(p: Provedor): string {
    if (p === 'amazon') return 'E-mail ou telefone da conta Amazon';
    if (p === 'shopee') return 'E-mail, telefone ou usuário da Shopee';
    return 'E-mail, telefone ou usuário';
  }

  protected readonly valores = signal<Record<string, string>>({});
  protected readonly erro = signal<string | null>(null);
  protected readonly enviando = signal(false);

  /** O que o usuário já digitou, para o robô não perguntar de novo. */
  private credenciaisDigitadas: { usuario: string; senha: string } | null = null;
  private pedidoJaRespondido = '';
  private ultimoPedido = '';

  constructor() {
    // Cada pergunta nova do robô começa com os campos limpos.
    effect(() => {
      const p = this.pedido();
      const id = p?.id ?? '';
      if (id === this.ultimoPedido) return;
      this.ultimoPedido = id;
      if (!p) return;

      this.erro.set(null);
      this.valores.set(p.opcoes?.length ? { opcao: p.opcoes[0].valor } : {});

      // Conta e senha já vieram no formulário desta janela: responde sozinho em
      // vez de pedir a mesma coisa duas vezes. Se a loja recusar, o robô
      // pergunta de novo e aí sim o campo aparece.
      if (p.forma === 'credenciais' && this.credenciaisDigitadas && this.pedidoJaRespondido !== p.id) {
        this.pedidoJaRespondido = p.id;
        const { usuario, senha } = this.credenciaisDigitadas;
        this.credenciaisDigitadas = null;
        void this.jobsService.responderLogin(p.id, { usuario, senha });
      }
    });

    // Deu certo: atualiza o que está atrás da janela.
    effect(() => {
      if (this.fim()?.ok) {
        this.conexoes.carregar();
        this.statusService.atualizar();
      }
    });
  }

  protected valorDe(campo: string): string {
    return this.valores()[campo] ?? '';
  }

  protected definir(campo: string, valor: string): void {
    this.valores.update((v) => ({ ...v, [campo]: valor }));
  }

  private preenchido(nome: string): boolean {
    return (this.valorDe(nome) || '').trim().length > 0;
  }

  protected podeConectar(): boolean {
    if (this.enviando()) return false;
    const obrigatorios = this.campos().filter((c) => !c.opcional);
    return obrigatorios.every((c) => this.preenchido(c.nome) || c.tipo === 'opcoes');
  }

  /** Um clique só: guarda os dados de afiliado e manda o robô entrar. */
  async conectar(): Promise<void> {
    const p = this.provedor();
    if (!p || !this.podeConectar()) return;

    this.erro.set(null);
    this.enviando.set(true);

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

    this.credenciaisDigitadas = {
      usuario: this.valorDe('usuario').trim(),
      senha: this.valorDe('senha'),
    };
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

  async entrarDeNovo(): Promise<void> {
    const p = this.provedor();
    const job = p && JOB_DE[p];
    if (!job) return;
    this.erro.set(null);
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
    await this.conexoes.esquecerLogin(p);
    await this.conexoes.desconectar(p);

    // No ML a "conexao" e' a sessao do navegador: so' o robo consegue apagar.
    if (p === 'mercadolivre') {
      const r = await this.jobsService.iniciar('desconectar-ml');
      if (!r.ok) this.erro.set(r.erro ?? null);
    }
    this.enviando.set(false);
    await this.statusService.atualizar();
  }

  private de(p: Provedor): string {
    return ARTIGO[p] === 'o' ? 'do' : 'da';
  }

  async cancelar(): Promise<void> {
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
    this.credenciaisDigitadas = null;
    this.valores.set({});
    this.erro.set(null);
    this.jobsService.limparLogin();
    this.lojasUi.fechar();
  }
}
