import { Component, OnDestroy, OnInit, computed, effect, inject, signal } from '@angular/core';
import { ConfigService } from './services/config.service';
import { StatusService } from './services/status.service';
import { RunControlService } from './services/run-control.service';
import { AuthService } from './services/auth.service';
import { LoginCard } from './components/login-card/login-card';
import { ConnectionCard } from './components/connection-card/connection-card';
import { MarketplaceCard } from './components/marketplace-card/marketplace-card';
import { PostingConfigCard } from './components/posting-config-card/posting-config-card';
import { ThemesCard } from './components/themes-card/themes-card';
import { GroupsCard } from './components/groups-card/groups-card';
import { RunCard } from './components/run-card/run-card';
import { ScheduleCard } from './components/schedule-card/schedule-card';
import { StatsCard } from './components/stats-card/stats-card';
import { CuponsCard } from './components/cupons-card/cupons-card';
import { ConsoleCard } from './components/console-card/console-card';

export type AbaId = 'painel' | 'grupos' | 'conexoes' | 'postagens' | 'atividade';

interface Aba {
  id: AbaId;
  label: string;
  titulo: string;
  descricao: string;
}

const ABAS: Aba[] = [
  {
    id: 'painel',
    label: 'Painel',
    titulo: 'Painel',
    descricao: 'Ligue o robô e acompanhe o que está acontecendo agora.',
  },
  {
    id: 'grupos',
    label: 'Grupos',
    titulo: 'Grupos do WhatsApp',
    descricao: 'Escolha para quais grupos as promoções vão e o tema de cada um.',
  },
  {
    id: 'conexoes',
    label: 'Conexões',
    titulo: 'Conexões',
    descricao: 'Conecte o WhatsApp que envia e as lojas de afiliado que geram os links.',
  },
  {
    id: 'postagens',
    label: 'Postagens',
    titulo: 'Regras de postagem',
    descricao: 'Frequência, repetição de produtos, cupons e datas especiais.',
  },
  {
    id: 'atividade',
    label: 'Atividade',
    titulo: 'Atividade',
    descricao: 'Acompanhe em tempo real tudo que o robô está fazendo.',
  },
];

const CHAVE_ABA = 'promobot:aba';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [
    LoginCard,
    ConnectionCard,
    MarketplaceCard,
    PostingConfigCard,
    ThemesCard,
    GroupsCard,
    RunCard,
    ScheduleCard,
    StatsCard,
    CuponsCard,
    ConsoleCard,
  ],
  templateUrl: './app.html',
  styleUrl: './app.scss',
})
export class App implements OnInit, OnDestroy {
  protected statusService = inject(StatusService);
  protected configService = inject(ConfigService);
  protected runControl = inject(RunControlService);
  protected auth = inject(AuthService);

  protected readonly abas = ABAS;
  protected readonly aba = signal<AbaId>('painel');
  protected readonly menuAberto = signal(false);

  protected readonly abaAtual = computed(
    () => ABAS.find((a) => a.id === this.aba()) ?? ABAS[0]
  );

  protected readonly mlConectado = computed(
    () => !!this.statusService.status()?.mercadoLivre?.conectado
  );
  protected readonly zapConectado = computed(
    () => !!this.statusService.status()?.whatsapp?.conectado
  );

  private dashboardIniciado = false;

  constructor() {
    // So carrega config/status DEPOIS de saber quem esta logado — evita
    // bater no /api/config com um token velho/ausente antes da hora, e
    // desliga o polling de novo se o usuario sair.
    effect(() => {
      const logado = !!this.auth.usuario();
      if (logado && !this.dashboardIniciado) {
        this.dashboardIniciado = true;
        this.configService.carregar();
        this.statusService.iniciarPolling();
      } else if (!logado && this.dashboardIniciado) {
        this.dashboardIniciado = false;
        this.statusService.pararPolling();
      }
    });
  }

  ngOnInit(): void {
    try {
      const salva = localStorage.getItem(CHAVE_ABA) as AbaId | null;
      if (salva && ABAS.some((a) => a.id === salva)) this.aba.set(salva);
    } catch (_) {
      // localStorage bloqueado (aba anonima etc.) — segue com a aba padrao.
    }
    this.auth.restaurarSessao();
  }

  ngOnDestroy(): void {
    this.statusService.pararPolling();
  }

  irPara(aba: AbaId): void {
    this.aba.set(aba);
    this.menuAberto.set(false);
    try {
      localStorage.setItem(CHAVE_ABA, aba);
    } catch (_) {
      // sem persistencia — nao impede a navegacao.
    }
  }

  sair(): void {
    this.auth.logout();
  }
}
