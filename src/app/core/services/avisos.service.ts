import { Injectable, computed, effect, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { AuthService } from './auth.service';
import { ProvedorConexao, StatusService } from './status.service';
import { JobsService } from './jobs.service';
import { VerificacaoService } from './verificacao.service';
import { WhatsappUiService } from './whatsapp-ui.service';
import { TelegramUiService } from './telegram-ui.service';
import { LojasUiService } from './lojas-ui.service';

export type OrigemAviso = ProvedorConexao | 'desafio' | 'banco';

interface UsoBanco {
  usadoMb: number;
  limiteMb: number;
  pct: number;
}

// A partir de quanto o sino do dono avisa que o banco esta enchendo.
const BANCO_ATENCAO = 80;
const BANCO_CRITICO = 90;
const BANCO_CONSULTA_MS = 10 * 60 * 1000;

export interface Aviso {
  /** Muda a cada nova queda — é o que decide se o aviso já foi visto. */
  id: string;
  origem: OrigemAviso;
  titulo: string;
  texto: string;
  em: string | null;
  gravidade: 'erro' | 'aviso';
  acao: string;
}

const NOME: Record<ProvedorConexao, string> = {
  whatsapp: 'WhatsApp',
  telegram: 'Telegram',
  mercadolivre: 'Mercado Livre',
  amazon: 'Amazon',
  shopee: 'Shopee',
};

const TITULO: Record<ProvedorConexao, string> = {
  whatsapp: 'O WhatsApp caiu',
  telegram: 'O Telegram caiu',
  mercadolivre: 'O Mercado Livre desconectou',
  amazon: 'A sessão da Amazon caiu',
  shopee: 'A Shopee desconectou',
};

const PADRAO: Record<ProvedorConexao, string> = {
  whatsapp: 'O robô não consegue postar nos grupos até você conectar de novo.',
  telegram: 'As promoções param de sair nos grupos do Telegram até você conectar de novo.',
  mercadolivre: 'Sem a sessão, os links do Mercado Livre não geram comissão. Conecte de novo.',
  amazon: 'Os posts da Amazon continuam com a sua tag, mas saem com o link longo.',
  shopee: 'O robô não consegue garimpar nem gerar links da Shopee até você conectar de novo.',
};

const ORDEM: ProvedorConexao[] = ['whatsapp', 'telegram', 'mercadolivre', 'shopee', 'amazon'];
const CHAVE_VISTOS = 'promobot:avisos-vistos';

/**
 * O sino do topo: tudo que caiu e precisa de você. Só entra aqui o que já
 * funcionou e parou sozinho — "Desconectar" clicado por você não é aviso, e
 * uma conexão que nunca foi feita já aparece no "Falta pouco" do Painel.
 * Cada aviso some sozinho quando a conexão volta.
 */
@Injectable({ providedIn: 'root' })
export class AvisosService {
  private statusService = inject(StatusService);
  private jobsService = inject(JobsService);
  private verificacao = inject(VerificacaoService);
  private whatsappUi = inject(WhatsappUiService);
  private telegramUi = inject(TelegramUiService);
  private lojasUi = inject(LojasUiService);
  private http = inject(HttpClient);
  private auth = inject(AuthService);

  private readonly usoBanco = signal<UsoBanco | null>(null);
  private consultaBanco: ReturnType<typeof setInterval> | null = null;

  private conectadoAgora(p: ProvedorConexao): boolean {
    switch (p) {
      case 'whatsapp':
        return this.verificacao.whatsappConectado();
      case 'telegram':
        return this.verificacao.telegramConectado();
      case 'mercadolivre':
        return this.verificacao.mercadoLivreConectado();
      case 'amazon':
        return this.verificacao.amazonLogado();
      case 'shopee':
        return this.verificacao.shopeeConectado();
    }
  }

  readonly avisos = computed<Aviso[]>(() => {
    const lista: Aviso[] = [];
    const conexoes = this.statusService.status()?.conexoes ?? {};

    for (const p of ORDEM) {
      const e = conexoes[p];
      if (!e || e.conectado || e.manual || !e.jaConectou) continue;
      // Uma checagem ao vivo mais nova pode já ter confirmado que voltou.
      if (this.conectadoAgora(p)) continue;
      lista.push({
        id: `${p}:${e.em}`,
        origem: p,
        titulo: TITULO[p],
        texto: e.motivo || PADRAO[p],
        em: e.em,
        gravidade: p === 'amazon' ? 'aviso' : 'erro',
        acao: p === 'whatsapp' || p === 'telegram' ? 'Conectar de novo' : `Reconectar ${NOME[p]}`,
      });
    }

    const desafio = this.jobsService.desafioMl();
    if (desafio) {
      lista.unshift({
        id: `desafio:${desafio.em}`,
        origem: 'desafio',
        titulo: 'Mercado Livre em espera',
        texto:
          'O Mercado Livre pediu uma verificação de segurança. Enquanto ela não for resolvida, o robô segue postando pelas outras lojas.',
        em: desafio.em,
        gravidade: 'aviso',
        acao: 'Resolver agora',
      });
    }

    const banco = this.usoBanco();
    if (banco && banco.pct >= BANCO_ATENCAO) {
      const critico = banco.pct >= BANCO_CRITICO;
      lista.unshift({
        // Muda de faixa, avisa de novo; dentro da mesma faixa, nao repete.
        id: `banco:${critico ? BANCO_CRITICO : BANCO_ATENCAO}`,
        origem: 'banco',
        titulo: critico ? 'O banco de dados está quase cheio' : 'O banco de dados está enchendo',
        texto: `${banco.usadoMb} MB de ${banco.limiteMb} MB usados (${banco.pct}%). Libere espaço ou aumente o plano do Supabase antes que ele lote.`,
        em: null,
        gravidade: critico ? 'erro' : 'aviso',
        acao: 'Abrir o Supabase',
      });
    }

    return lista;
  });

  private readonly vistos = signal<string[]>(this.lerVistos());

  readonly naoLidos = computed(() => {
    const vistos = new Set(this.vistos());
    return this.avisos().filter((a) => !vistos.has(a.id)).length;
  });

  constructor() {
    // So o dono ve o espaco do banco: a consulta comeca quando ele entra e para quando sai.
    effect(() => {
      const dono = !!this.auth.usuario()?.admin;
      if (this.consultaBanco) clearInterval(this.consultaBanco);
      this.consultaBanco = null;
      if (!dono) {
        this.usoBanco.set(null);
        return;
      }
      void this.lerBanco();
      this.consultaBanco = setInterval(() => void this.lerBanco(), BANCO_CONSULTA_MS);
    });

    // Não deixa a lista de vistos crescer pra sempre: só guarda os ativos.
    effect(() => {
      const ativos = new Set(this.avisos().map((a) => a.id));
      const vistos = this.vistos();
      if (!this.statusService.status()) return;
      const limpos = vistos.filter((id) => ativos.has(id));
      if (limpos.length !== vistos.length) this.gravarVistos(limpos);
    });
  }

  marcarTodosVistos(): void {
    const ids = this.avisos().map((a) => a.id);
    const atuais = new Set(this.vistos());
    if (ids.every((id) => atuais.has(id))) return;
    this.gravarVistos([...new Set([...this.vistos(), ...ids])]);
  }

  agir(aviso: Aviso): void {
    switch (aviso.origem) {
      case 'whatsapp':
        this.whatsappUi.abrir();
        return;
      case 'telegram':
        this.telegramUi.abrir();
        return;
      case 'desafio':
        this.jobsService.desafioPopupAberto.set(true);
        return;
      case 'banco':
        window.open('https://supabase.com/dashboard', '_blank', 'noopener');
        return;
      default:
        this.lojasUi.abrir(aviso.origem);
    }
  }

  private async lerBanco(): Promise<void> {
    try {
      this.usoBanco.set(await firstValueFrom(this.http.get<UsoBanco>('/api/admin/banco')));
    } catch (_) {
      // Sem resposta agora: fica o ultimo valor lido e tenta de novo na proxima.
    }
  }

  private lerVistos(): string[] {
    try {
      const v = JSON.parse(localStorage.getItem(CHAVE_VISTOS) || '[]');
      return Array.isArray(v) ? v.filter((x) => typeof x === 'string') : [];
    } catch (_) {
      return [];
    }
  }

  private gravarVistos(ids: string[]): void {
    this.vistos.set(ids);
    try {
      localStorage.setItem(CHAVE_VISTOS, JSON.stringify(ids));
    } catch (_) {}
  }
}
