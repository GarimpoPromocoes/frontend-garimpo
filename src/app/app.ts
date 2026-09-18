import { Component, OnDestroy, OnInit, computed, effect, inject, signal } from '@angular/core';
import { ConfigService } from './services/config.service';
import { StatusService } from './services/status.service';
import { RunControlService } from './services/run-control.service';
import { JobsService } from './services/jobs.service';
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

// NAVEGACAO EM SECOES (09/2026). Antes eram 5 itens soltos numa lista; o
// menu crescia sem hierarquia e "Postagens" virava um deposito de quatro
// assuntos diferentes (frequencia, repeticao, cupons, datas).
//
// Agora cada item tem UM assunto e os itens sao agrupados pelo que a pessoa
// esta tentando fazer: acompanhar, divulgar ou conectar. E' o formato que
// sistemas do genero usam, e e' o que deixa o menu crescer sem virar sopa.
//
// REGRA AO ACRESCENTAR ITEM: todo item do menu leva a uma tela que FUNCIONA.
// Nada de item "em breve" — menu com porta que nao abre e' o tipo de coisa
// que queima a confianca de quem esta avaliando o produto.
export type AbaId =
  | 'painel'
  | 'atividade'
  | 'grupos'
  | 'agendamento'
  | 'regras'
  | 'cupons'
  | 'temas'
  | 'whatsapp'
  | 'lojas';

// Qual contador aparece na bolinha ao lado do item (ver badgeDe, no
// componente). 'alerta' nao e' numero: e' o "!" de algo que precisa de gente.
type BadgeId = 'grupos' | 'cupons' | 'lojas' | 'alerta' | null;

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
    id: 'grupos',
    label: 'Grupos',
    titulo: 'Grupos do WhatsApp',
    descricao: 'Escolha para quais grupos as promoções vão e o tema de cada um.',
    secao: 'Divulgação',
    badge: 'grupos',
  },
  {
    id: 'agendamento',
    label: 'Piloto automático',
    titulo: 'Piloto automático',
    descricao: 'Em que horários o robô posta sozinho e com que intervalo entre uma promoção e outra.',
    secao: 'Divulgação',
  },
  {
    id: 'regras',
    label: 'Regras de postagem',
    titulo: 'Regras de postagem',
    descricao: 'Quanto tempo até repetir um produto, variedade e o que nunca pode ser postado.',
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
    id: 'temas',
    label: 'Datas e temas',
    titulo: 'Datas e temas',
    descricao: 'Datas comemorativas e estações que dão prioridade a certos produtos.',
    secao: 'Divulgação',
  },

  {
    id: 'whatsapp',
    label: 'WhatsApp',
    titulo: 'WhatsApp',
    descricao: 'O número que envia as promoções para os grupos.',
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
];

// Ordem das secoes no menu, e quais itens caem em cada uma. Derivado de ABAS
// pra nao existir uma segunda lista pra manter em sincronia.
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
  protected jobsService = inject(JobsService);
  protected auth = inject(AuthService);

  protected readonly abas = ABAS;
  protected readonly secoes = SECOES;
  protected readonly aba = signal<AbaId>('painel');
  protected readonly menuAberto = signal(false);

  // Contador da bolinha ao lado do item. Só mostra quando há algo a mostrar:
  // bolinha com "0" é ruído, não informação.
  //   - grupos/cupons: quantos existem agora;
  //   - lojas: quantas AINDA faltam conectar (é o que exige ação);
  //   - alerta: '!' quando o robô parou esperando uma pessoa (verificação
  //     de segurança do Mercado Livre — ver console-card).
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
        const faltando = [s.mercadoLivre?.conectado, s.amazon?.logado, s.shopee?.logado].filter((c) => !c).length;
        return faltando ? String(faltando) : null;
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

  protected readonly mlConectado = computed(
    () => !!this.statusService.status()?.mercadoLivre?.conectado
  );
  // Enquanto há um QR esperando leitura o WhatsApp NÃO está conectado, mesmo
  // que a pasta de sessão já exista (é só nela que o status do servidor se
  // baseia). Sem isso a barra lateral dizia "Conectado" no exato momento em
  // que o painel pedia pra escanear o código.
  protected readonly zapConectado = computed(
    () => !!this.statusService.status()?.whatsapp?.conectado && !this.jobsService.qrWhatsapp()
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
