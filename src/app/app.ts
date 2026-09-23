import { Component, OnDestroy, OnInit, computed, effect, inject, signal } from '@angular/core';
import { ConfigService } from './core/services/config.service';
import { StatusService } from './core/services/status.service';
import { RunControlService } from './core/services/run-control.service';
import { JobsService } from './core/services/jobs.service';
import { AuthService } from './core/services/auth.service';
import { VerificacaoService } from './core/services/verificacao.service';
import { LoginCard } from './features/auth/login-card/login-card';
import { WhatsappCard } from './features/conexoes/whatsapp-card/whatsapp-card';
import { LojasCard } from './features/conexoes/lojas-card/lojas-card';
import { PostingConfigCard } from './features/divulgacao/posting-config-card/posting-config-card';
import { ThemesCard } from './features/divulgacao/themes-card/themes-card';
import { GroupsCard } from './features/divulgacao/groups-card/groups-card';
import { RunCard } from './features/acompanhar/run-card/run-card';
import { StatsCard } from './features/acompanhar/stats-card/stats-card';
import { CuponsCard } from './features/divulgacao/cupons-card/cupons-card';
import { ConsoleCard } from './features/acompanhar/console-card/console-card';
import { ProdutosCard } from './features/divulgacao/produtos-card/produtos-card';
import { OwnerCard } from './features/admin/owner-card/owner-card';
import { GanhosCard } from './features/acompanhar/ganhos-card/ganhos-card';
import { LojaDialog } from './features/conexoes/loja-dialog/loja-dialog';
import { WhatsappDialog } from './features/conexoes/whatsapp-dialog/whatsapp-dialog';
import { ConfirmacaoDialog } from './shared/confirmacao-dialog/confirmacao-dialog';

export type AbaId =
  | 'painel'
  | 'atividade'
  | 'ganhos'
  | 'grupos'
  | 'regras'
  | 'cupons'
  | 'produtos'
  | 'whatsapp'
  | 'lojas'
  | 'dono';

type BadgeId = 'grupos' | 'cupons' | 'lojas' | 'produtos' | 'alerta' | null;

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
    descricao: 'Ligue o robô e acompanhe o que está acontecendo agora.',
    secao: 'Acompanhar',
  },
  {
    id: 'atividade',
    label: 'Atividade',
    titulo: 'Atividade',
    descricao: 'Acompanhe em tempo real tudo que o robô está fazendo.',
    secao: 'Acompanhar',
    badge: 'alerta',
  },
  {
    id: 'ganhos',
    label: 'Ganhos',
    titulo: 'Ganhos',
    descricao: 'Quanto as promoções renderam em comissão em cada loja, mês a mês.',
    secao: 'Acompanhar',
  },

  {
    id: 'produtos',
    label: 'Produtos',
    titulo: 'Produtos garimpados',
    descricao: 'Tudo que o robô encontrou e ainda pode virar promoção.',
    secao: 'Divulgação',
    badge: 'produtos',
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
    id: 'regras',
    label: 'Regras de postagem',
    titulo: 'Regras de postagem',
    descricao: 'Com que frequência o robô posta, quando um produto pode repetir e as datas especiais.',
    secao: 'Divulgação',
  },
  {
    id: 'cupons',
    label: 'Cupons',
    titulo: 'Cupons',
    descricao: 'Com que frequência saem mensagens de cupom e quais estão valendo agora.',
    secao: 'Divulgação',
    badge: 'cupons',
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
    PostingConfigCard,
    ThemesCard,
    GroupsCard,
    RunCard,
    StatsCard,
    CuponsCard,
    ConsoleCard,
    ProdutosCard,
    OwnerCard,
    GanhosCard,
    LojaDialog,
    WhatsappDialog,
    ConfirmacaoDialog,
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

  protected readonly secoes = computed(() =>
    SECOES.map((s) => ({
      nome: s.nome,
      itens: s.itens.filter((i) => i.id !== 'dono' || !!this.auth.usuario()?.admin),
    })).filter((s) => s.itens.length),
  );
  protected readonly aba = signal<AbaId>('painel');
  protected readonly menuAberto = signal(false);

  protected badgeDe(id: AbaId): string | null {
    const s = this.statusService.status();
    switch (id) {
      case 'grupos': {
        const n = this.configService.config()?.grupos?.length ?? 0;
        return n ? String(n) : null;
      }
      case 'cupons': {
        const n = s?.cuponsAtivos ?? 0;
        return n ? String(n) : null;
      }
      case 'lojas': {
        if (!s) return null;
        // A resposta ao vivo (quando existe) vence a guardada — é o que evita
        // o badge dizer "tudo certo" com uma sessão que já caiu por fora.
        const faltando = [
          this.verificacao.mercadoLivreConectado(),
          this.verificacao.amazonLogado(),
          this.verificacao.shopeeConectado(),
        ].filter((c) => !c).length;
        return faltando ? String(faltando) : null;
      }
      case 'produtos': {
        const n = s?.produtosCatalogo ?? 0;
        return n ? String(n) : null;
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

  protected readonly mlConectado = computed(() => this.verificacao.mercadoLivreConectado());
  protected readonly zapConectado = computed(
    () => this.verificacao.whatsappConectado() && !this.jobsService.qrWhatsapp()
  );

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
      void import('./features/acompanhar/ganhos-card/ganhos-card');
      void import('./features/divulgacao/produtos-card/produtos-card');
      void import('./features/conexoes/whatsapp-card/whatsapp-card');
      void import('./features/conexoes/lojas-card/lojas-card');
      void import('./features/divulgacao/posting-config-card/posting-config-card');
      void import('./features/divulgacao/cupons-card/cupons-card');
      void import('./features/divulgacao/themes-card/themes-card');
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
