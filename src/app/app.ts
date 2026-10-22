import { Component, OnDestroy, OnInit, computed, effect, inject, signal } from '@angular/core';
import { ConfigService } from './core/services/config.service';
import { StatusService } from './core/services/status.service';
import { RunControlService } from './core/services/run-control.service';
import { JobsService } from './core/services/jobs.service';
import { AuthService } from './core/services/auth.service';
import { VerificacaoService } from './core/services/verificacao.service';
import { AvisosService } from './core/services/avisos.service';
import { LojasUiService } from './core/services/lojas-ui.service';
import { WhatsappUiService } from './core/services/whatsapp-ui.service';
import { TelegramUiService } from './core/services/telegram-ui.service';
import { ConfirmacaoService } from './core/services/confirmacao.service';
import { BuscaService } from './core/services/busca.service';
import { LoginCard } from './features/auth/login-card/login-card';
import { WhatsappCard } from './features/conexoes/whatsapp-card/whatsapp-card';
import { LojasCard } from './features/conexoes/lojas-card/lojas-card';
import { RegrasPostagem } from './features/divulgacao/regras-postagem/regras-postagem';
import { GroupsCard } from './features/divulgacao/groups-card/groups-card';
import { GarimpoCard } from './features/divulgacao/garimpo-card/garimpo-card';
import { PainelRobo } from './features/acompanhar/painel-robo/painel-robo';
import { ConsoleCard } from './features/acompanhar/console-card/console-card';
import { ProdutosCard } from './features/divulgacao/produtos-card/produtos-card';
import { BuscaCard } from './features/divulgacao/busca-card/busca-card';
import { OwnerCard } from './features/admin/owner-card/owner-card';
import { Estatisticas } from './features/acompanhar/estatisticas/estatisticas';
import { EstatisticasAbas, EstatisticasControles } from './features/acompanhar/estatisticas/estatisticas-abas';
import { ClonagemNumeros } from './features/divulgacao/garimpo-card/clonagem-numeros';
import { LojaDialog } from './features/conexoes/loja-dialog/loja-dialog';
import { WhatsappDialog } from './features/conexoes/whatsapp-dialog/whatsapp-dialog';
import { TelegramDialog } from './features/conexoes/telegram-dialog/telegram-dialog';
import { TopoKpis } from './features/acompanhar/topo-kpis/topo-kpis';
import { DesafioMlDialog } from './features/acompanhar/desafio-ml-dialog/desafio-ml-dialog';
import { ConfirmacaoDialog } from './shared/confirmacao-dialog/confirmacao-dialog';
import { Sino } from './shared/sino/sino';

export type AbaId =
  | 'painel'
  | 'atividade'
  | 'estatisticas'
  | 'grupos'
  | 'garimpo'
  | 'regras'
  | 'whatsapp'
  | 'lojas'
  | 'dono';

type BadgeId = 'grupos' | 'lojas' | 'alerta' | null;

interface Aba {
  id: AbaId;
  label: string;
  titulo: string;
  descricao: string;
  secao: string;
  badge?: BadgeId;
}

const ABAS: Aba[] = [
  {
    id: 'painel',
    label: 'Painel',
    titulo: 'Painel',
    descricao: 'Visão geral da sua operação de promoções.',
    secao: 'Acompanhar',
  },
  {
    id: 'estatisticas',
    label: 'Estatísticas',
    titulo: 'Estatísticas',
    descricao: 'Acompanhe os ganhos, membros e vendas por grupo das suas promoções.',
    secao: 'Acompanhar',
  },

  {
    id: 'grupos',
    label: 'Grupos',
    titulo: 'Grupos do WhatsApp',
    descricao: 'Escolha para quais grupos as promoções vão e o tema de cada um.',
    secao: 'Divulgação',
    badge: 'grupos',
  },
  {
    id: 'garimpo',
    label: 'Clonagem',
    titulo: 'Clonagem de grupos',
    descricao: 'Quais grupos recebem o seu garimpo nas lojas e quais recebem a clonagem dos concorrentes.',
    secao: 'Divulgação',
  },
  {
    id: 'regras',
    label: 'Regras de postagem',
    titulo: 'Regras de postagem',
    descricao: 'Frequência, repetição de produtos, cupons e datas especiais.',
    secao: 'Divulgação',
  },

  {
    id: 'whatsapp',
    label: 'WhatsApp e Telegram',
    titulo: 'WhatsApp e Telegram',
    descricao: 'Por onde o robô envia as promoções para os grupos.',
    secao: 'Conexões',
  },
  {
    id: 'lojas',
    label: 'Lojas de afiliado',
    titulo: 'Lojas de afiliado',
    descricao: 'As contas que geram os links que dão comissão: Mercado Livre, Amazon e Shopee.',
    secao: 'Conexões',
    badge: 'lojas',
  },

  {
    id: 'dono',
    label: 'Painel do dono',
    titulo: 'Painel do dono',
    descricao: 'Quem usa o sistema e quanto cada um usa.',
    secao: 'Administração',
  },
];

const SECOES: { nome: string; itens: Aba[] }[] = [];
for (const aba of ABAS) {
  const atual = SECOES.find((s) => s.nome === aba.secao);
  if (atual) atual.itens.push(aba);
  else SECOES.push({ nome: aba.secao, itens: [aba] });
}

const CHAVE_ABA = 'promobot:aba';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [
    LoginCard,
    WhatsappCard,
    LojasCard,
    RegrasPostagem,
    GroupsCard,
    GarimpoCard,
    PainelRobo,
    ConsoleCard,
    ProdutosCard,
    BuscaCard,
    OwnerCard,
    Estatisticas,
    LojaDialog,
    WhatsappDialog,
    TelegramDialog,
    TopoKpis,
    EstatisticasAbas,
    EstatisticasControles,
    ClonagemNumeros,
    DesafioMlDialog,
    ConfirmacaoDialog,
    Sino,
  ],
  templateUrl: './app.html',
  styleUrl: './app.scss',
})
export class App implements OnInit, OnDestroy {
  protected statusService = inject(StatusService);
  protected configService = inject(ConfigService);
  protected runControl = inject(RunControlService);
  protected jobsService = inject(JobsService);
  protected auth = inject(AuthService);
  protected verificacao = inject(VerificacaoService);
  protected avisos = inject(AvisosService);
  private lojasUi = inject(LojasUiService);
  private whatsappUi = inject(WhatsappUiService);
  private telegramUi = inject(TelegramUiService);
  private confirmacaoService = inject(ConfirmacaoService);
  private buscaService = inject(BuscaService);

  protected readonly secoes = computed(() =>
    SECOES.map((s) => ({
      nome: s.nome,
      itens: s.itens.filter((i) => i.id !== 'dono' || !!this.auth.usuario()?.admin),
    })).filter((s) => s.itens.length),
  );
  protected readonly aba = signal<AbaId>('painel');
  protected readonly menuAberto = signal(false);
  /** Modal grandão da atividade — abre pelo "Ver tudo" do painel, no lugar de trocar de aba. */
  protected readonly atividadeModalAberta = signal(false);
  /** Produtos garimpados — abre pelo "Ver produtos" do painel, no lugar de ser uma aba. */
  protected readonly produtosModalAberto = signal(false);
  /** Oferta personalizada (buscar ofertas de um produto) — abre pelo botão do topo, no lugar de ser uma aba. */
  protected readonly buscaModalAberta = signal(false);

  protected readonly algumModalAberto = computed(() =>
    !!this.lojasUi.aberta() ||
    !!this.jobsService.login() ||
    this.whatsappUi.aberto() ||
    this.telegramUi.aberto() ||
    this.jobsService.desafioPopupAberto() ||
    !!this.confirmacaoService.pedido() ||
    this.buscaService.postagemAberta() ||
    this.atividadeModalAberta() ||
    this.produtosModalAberto() ||
    this.buscaModalAberta(),
  );

  protected badgeDe(id: AbaId): string | null {
    const s = this.statusService.status();
    switch (id) {
      case 'grupos': {
        const n = this.configService.config()?.grupos?.length ?? 0;
        return n ? String(n) : null;
      }
      case 'lojas': {
        if (!s) return null;
        // Nenhuma loja é obrigatória: o badge só aparece quando não há nenhuma
        // conectada, ou quando uma que funcionava caiu.
        if (!this.runControl.lojasConectadas().length) return '!';
        const caidas = this.avisos.avisos().filter((a) => ['mercadolivre', 'amazon', 'shopee'].includes(a.origem)).length;
        return caidas ? String(caidas) : null;
      }
      case 'atividade':
        return this.jobsService.desafioMl() ? '!' : null;
      default:
        return null;
    }
  }

  protected badgeUrgente(id: AbaId): boolean {
    return (id === 'atividade' && !!this.jobsService.desafioMl()) || id === 'lojas';
  }

  protected readonly abaAtual = computed(
    () => ABAS.find((a) => a.id === this.aba()) ?? ABAS[0]
  );

  /** Cartão do canto "Mercado Livre em espera": o X esconde só esta verificação. */
  private readonly esperaFechadaEm = signal<string | null>(null);
  protected readonly mostrarEsperaMl = computed(() => {
    const d = this.jobsService.desafioMl();
    return !!d && !this.jobsService.desafioPopupAberto() && this.esperaFechadaEm() !== d.em;
  });
  protected esconderEsperaMl(): void {
    this.esperaFechadaEm.set(this.jobsService.desafioMl()?.em ?? null);
  }

  private dashboardIniciado = false;

  constructor() {
    effect(() => {
      const logado = !!this.auth.usuario();
      if (logado && !this.dashboardIniciado) {
        this.dashboardIniciado = true;
        this.configService.carregar();
        // A dupla checagem (banco + ao vivo) já carrega conexões e status —
        // é ela quem decide quando a tela de carregamento libera o painel.
        void this.verificacao.executar();
        this.statusService.iniciarPolling();
        this.preCarregarAbas();
      } else if (!logado && this.dashboardIniciado) {
        this.dashboardIniciado = false;
        this.statusService.pararPolling();
      }
    });
  }

  ngOnInit(): void {
    try {
      let salva = localStorage.getItem(CHAVE_ABA) as AbaId | null;
      // "Datas e temas" virou parte de Regras de postagem.
      if ((salva as string) === 'temas') salva = 'regras';
      // Cupons viraram um card dentro de Regras de postagem.
      if ((salva as string) === 'cupons') salva = 'regras';
      // Atividade deixou de ser aba — agora é um modal aberto pelo painel.
      if ((salva as string) === 'atividade') salva = 'painel';
      // Produtos também: agora é um modal aberto pelo painel.
      if ((salva as string) === 'produtos') salva = 'painel';
      // Ganhos virou parte de Estatísticas.
      if ((salva as string) === 'ganhos') salva = 'estatisticas';
      // Oferta personalizada também: agora é um modal aberto pelo topo.
      if ((salva as string) === 'busca') salva = 'painel';
      if (salva && ABAS.some((a) => a.id === salva)) this.aba.set(salva);
    } catch (_) {
    }
    this.auth.restaurarSessao();
  }

  ngOnDestroy(): void {
    this.statusService.pararPolling();
  }

  private preCarregarAbas(): void {
    const carregar = () => {
      void import('./features/divulgacao/groups-card/groups-card');
      void import('./features/divulgacao/garimpo-card/garimpo-card');
      void import('./features/acompanhar/estatisticas/estatisticas');
      void import('./features/divulgacao/produtos-card/produtos-card');
      void import('./features/divulgacao/busca-card/busca-card');
      void import('./features/conexoes/whatsapp-card/whatsapp-card');
      void import('./features/conexoes/lojas-card/lojas-card');
      void import('./features/divulgacao/regras-postagem/regras-postagem');
      if (this.auth.usuario()?.admin) void import('./features/admin/owner-card/owner-card');
    };
    if (typeof requestIdleCallback === 'function') requestIdleCallback(carregar, { timeout: 5000 });
    else setTimeout(carregar, 2000);
  }

  irPara(aba: AbaId): void {
    this.aba.set(aba);
    this.menuAberto.set(false);
    try {
      localStorage.setItem(CHAVE_ABA, aba);
    } catch (_) {
    }
  }

  sair(): void {
    this.auth.logout();
  }
}
