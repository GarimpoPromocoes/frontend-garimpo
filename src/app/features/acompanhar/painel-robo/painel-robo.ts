import { Component, DestroyRef, HostListener, computed, effect, inject, output, signal } from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { AcaoPainel, AlvoGrupos, EstadoEtapa, EtapaPainelId, JobsService } from '../../../core/services/jobs.service';
import { VerificacaoService } from '../../../core/services/verificacao.service';
import { RunControlService } from '../../../core/services/run-control.service';
import { StatusService } from '../../../core/services/status.service';
import { PainelService } from '../../../core/services/painel.service';
import { GruposFila } from '../grupos-fila/grupos-fila';
import { duracao } from '../topo-kpis/topo-kpis';

type Icone =
  | 'busca' | 'sacola' | 'doc' | 'envio' | 'check' | 'alerta' | 'relogio' | 'grupos' | 'externo'
  | 'cubo' | 'etiqueta' | 'pessoas' | 'dinheiro' | 'seta' | 'subiu' | 'desceu' | 'chevron';
type Tom = 'ok' | 'andamento' | 'espera' | 'erro' | 'neutro' | 'achado';
/** Abas do app que os cartões do Painel abrem. */
export type DestinoPainel = 'estatisticas' | 'grupos';

interface AcaoVista {
  hora: string;
  icone: Icone;
  texto: string;
  selo: string;
  tom: Tom;
}

interface EtapaVista {
  id: EtapaPainelId;
  titulo: string;
  sub: string;
  estado: EstadoEtapa;
  selo: string;
  atual: boolean;
  icone: Icone;
  loja: string | null;
}

const ORDEM: EtapaPainelId[] = ['buscando', 'origem', 'preparando', 'postando', 'concluido'];
const BASE: Record<EtapaPainelId, { titulo: string; sub: string; icone: Icone }> = {
  buscando: { titulo: 'Buscando produto', sub: 'Procurando promoções', icone: 'busca' },
  origem: { titulo: 'Origem do produto', sub: 'De qual loja ele vem', icone: 'sacola' },
  preparando: { titulo: 'Preparando conteúdo', sub: 'Gerando link e mensagem', icone: 'doc' },
  postando: { titulo: 'Postando', sub: 'Enviando para os grupos', icone: 'envio' },
  concluido: { titulo: 'Concluído', sub: 'Produto publicado', icone: 'check' },
};

const NOME_LOJA: Record<string, string> = { mercadolivre: 'Mercado Livre', amazon: 'Amazon', shopee: 'Shopee' };
const MAX_ACOES = 20;
const NUMEROS_A_CADA_MS = 60000;

function hhmm(iso: string | null | undefined): string {
  if (!iso) return '';
  return new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

/**
 * O Painel: os números do dia em quatro cartões, a pipeline do produto da vez, as últimas ações
 * e os grupos marcados para postar. O gráfico das postagens por dia fica em Estatísticas. O tempo ativo e a próxima postagem ficam no cabeçalho
 * (topo-kpis); ligar, pausar e parar, no botão flutuante.
 */
@Component({
  selector: 'app-painel-robo',
  standalone: true,
  imports: [NgTemplateOutlet, GruposFila],
  templateUrl: './painel-robo.html',
})
export class PainelRobo {
  verProdutos = output<void>();
  verLogs = output<void>();
  irPara = output<DestinoPainel>();

  protected runControl = inject(RunControlService);
  protected jobs = inject(JobsService);
  protected statusService = inject(StatusService);
  private painelService = inject(PainelService);
  private verificacao = inject(VerificacaoService);

  protected readonly escolhendoGrupos = signal(false);
  protected readonly statsAbertas = signal(false);

  constructor() {
    void this.painelService.carregar();
    const t = setInterval(() => document.visibilityState === 'visible' && void this.painelService.carregar(), NUMEROS_A_CADA_MS);
    inject(DestroyRef).onDestroy(() => clearInterval(t));
    // Postou: os cartões e os grupos atualizam na hora, sem esperar a próxima leitura.
    let concluidos: number | null = null;
    effect(() => {
      const n = this.jobs.painel()?.hoje?.concluidos ?? null;
      if (concluidos !== null && n !== null && n !== concluidos) void this.painelService.carregar();
      concluidos = n;
    });
  }

  @HostListener('document:keydown.escape')
  protected fecharComEsc(): void {
    this.escolhendoGrupos.set(false);
    this.statsAbertas.set(false);
  }

  private readonly painel = computed(() => this.jobs.painel());
  private readonly numeros = computed(() => this.painelService.numeros());

  // ---- Pipeline do produto da vez ----

  /** A pipeline só vale com o robô de postagem rodando agora; parado, tudo volta a "pendente". */
  protected readonly aoVivo = computed(() => this.runControl.postandoAgora() && !!this.painel()?.atual);

  protected readonly etapas = computed<EtapaVista[]>(() => {
    const p = this.painel();
    const vivo = this.aoVivo();
    const pausado = this.runControl.pausado();
    return ORDEM.map((id) => {
      const base = BASE[id];
      const e = vivo && p ? p.etapas[id] : { estado: 'pendente' as EstadoEtapa, ate: null, motivo: null };
      const atual = vivo && p?.atual === id;
      const v: EtapaVista = { id, titulo: base.titulo, sub: base.sub, estado: e.estado, selo: '', atual, icone: base.icone, loja: null };
      v.selo = { pendente: 'Aguardando', andamento: 'Em andamento…', espera: 'Aguardando', ok: 'Concluído', erro: 'Erro' }[e.estado];

      if (id === 'buscando') {
        if (e.estado === 'espera') {
          v.sub = {
            catalogoVazio: 'Buscando as primeiras ofertas',
            nenhumLiberado: 'Nada liberado agora',
            cedeu: 'Passando a vez pro próximo grupo',
            repetido: 'Só assunto repetido neste grupo',
            foraDoHorario: 'Fora do horário',
          }[e.motivo ?? ''] ?? 'Esperando novidade';
          if (e.ate) v.selo = e.motivo === 'foraDoHorario' ? `Posta de novo às ${hhmm(e.ate)}` : `Nova busca às ${hhmm(e.ate)}`;
        } else if (e.estado === 'ok') v.sub = 'Promoção escolhida';
        else if (e.estado === 'erro') v.sub = 'Falhou — tenta de novo sozinho';
        else if (atual && p?.grupo?.nome) v.sub = `Para "${p.grupo.nome}"`;
      }
      if (id === 'origem' && e.estado === 'ok' && p?.produto) {
        v.loja = p.produto.loja;
        v.sub = p.produto.grupoOrigem ? `Clonado de "${p.produto.grupoOrigem}"` : p.produto.tipo === 'cupom' ? 'Cupom da loja' : 'Garimpado na loja';
        v.selo = NOME_LOJA[p.produto.loja ?? ''] ?? 'Loja';
      }
      if (id === 'preparando' && e.estado === 'ok') v.sub = 'Link e mensagem prontos';
      if (id === 'postando') {
        if (e.estado === 'espera') {
          v.sub = 'Esperando o horário sorteado';
          v.selo = e.ate ? `Agendado ${hhmm(e.ate)}` : 'Agendado';
        } else if (e.estado === 'andamento') v.selo = 'Enviando…';
        else if (e.estado === 'ok') v.sub = this.canaisTexto(p?.canais ?? []);
        else if (e.estado === 'erro') v.sub = e.motivo ? this.curto(e.motivo) : 'A mensagem não saiu';
      }
      if (id === 'concluido' && e.estado === 'ok') v.selo = 'Sucesso';
      if (atual && pausado) v.selo = 'Pausado';
      return v;
    });
  });

  /** Destino no Postando: WhatsApp e Telegram dos grupos marcados. */
  protected readonly destino = computed(() => {
    const alvo = this.gruposAlvo();
    return {
      whatsapp: alvo.length,
      whatsappConectado: this.verificacao.whatsappConectado(),
      telegram: alvo.filter((g) => !!g.grupoTelegram).length,
      telegramConectado: this.verificacao.telegramConectado(),
    };
  });

  protected readonly tituloWhatsapp = computed(() => {
    const d = this.destino();
    if (!d.whatsappConectado) return 'WhatsApp não conectado';
    return `WhatsApp: ${d.whatsapp} ${d.whatsapp === 1 ? 'grupo ativo' : 'grupos ativos'}`;
  });

  protected readonly tituloTelegram = computed(() => {
    const d = this.destino();
    if (!d.telegramConectado) return 'Telegram não conectado';
    if (!d.telegram) return 'Telegram: nenhum canal ligado';
    return `Telegram: ${d.telegram} ${d.telegram === 1 ? 'canal ativo' : 'canais ativos'}`;
  });

  protected logoDaLoja(loja: string | null): string {
    return `lojas/${loja && NOME_LOJA[loja] ? loja : 'mercadolivre'}.svg`;
  }

  private canaisTexto(canais: string[]): string {
    if (canais.includes('whatsapp') && canais.includes('telegram')) return 'Enviado no WhatsApp e no Telegram';
    if (canais.includes('telegram')) return 'Enviado no Telegram';
    return 'Enviado no WhatsApp';
  }

  // ---- Grupos marcados para postar ----

  private readonly gruposAlvo = computed(() => {
    const todos = this.runControl.grupos();
    const manual = this.statusService.status()?.agendamento?.manual;
    const ligado = this.runControl.algoRodando();
    const alvo = ligado ? manual?.alvo : this.runControl.alvo();
    if (alvo !== 'selecionados') return todos;
    const ids = new Set(ligado ? manual?.ids ?? [] : [...this.runControl.selecionados()]);
    return todos.filter((g) => ids.has(g.id));
  });

  protected readonly grupoDaVez = computed(() =>
    this.runControl.postandoAgora() && this.painel()?.atual ? this.painel()?.grupo?.nome ?? null : null
  );

  protected readonly numerosDosGrupos = computed(() => {
    const m: Record<string, { membros: number | null; postadosHoje: number }> = {};
    for (const g of this.numeros()?.grupos ?? []) m[g.id] = { membros: g.membros, postadosHoje: g.postadosHoje };
    return m;
  });

  // ---- Os quatro cartões ----

  protected readonly gruposAtivos = computed(() => this.gruposAlvo().length);

  protected readonly postadosHoje = computed(() => this.statusService.status()?.hoje?.postados ?? null);

  /** Variação contra ontem: só com ontem > 0 (de zero não dá porcentagem). */
  protected readonly variacao = computed<{ texto: string; subiu: boolean } | null>(() => {
    const h = this.statusService.status()?.hoje;
    if (!h || !h.postadosOntem) return null;
    const pct = Math.round(((h.postados - h.postadosOntem) / h.postadosOntem) * 100);
    return { texto: `${Math.abs(pct)}%`, subiu: pct >= 0 };
  });

  protected readonly membrosTotais = computed<number | null>(() => {
    const m = this.numerosDosGrupos();
    const lidos = this.gruposAlvo().map((g) => m[g.id]?.membros).filter((n): n is number => n != null);
    return lidos.length ? lidos.reduce((a, b) => a + b, 0) : null;
  });

  protected readonly receitaHoje = computed(() => {
    const v = this.numeros()?.receitaHoje;
    return v == null ? '—' : v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  });

  protected numero(n: number | null): string {
    return n == null ? '—' : n.toLocaleString('pt-BR');
  }

  // ---- Últimas ações ----

  protected readonly acoes = computed<AcaoVista[]>(() => {
    const lista = this.painel()?.acoes ?? [];
    const out: AcaoVista[] = [];
    lista.forEach((a, i) => {
      const ultima = i === lista.length - 1 && this.runControl.postandoAgora();
      out.push(...this.traduzir(a, ultima));
    });
    return out.reverse().slice(0, MAX_ACOES);
  });

  private traduzir(a: AcaoPainel, ultima: boolean): AcaoVista[] {
    const hora = hhmm(a.em);
    const linha = (icone: Icone, texto: string, selo: string, tom: Tom): AcaoVista => ({ hora, icone, texto, selo, tom });
    const grupoNome = typeof a.grupo === 'string' ? a.grupo : a.grupo?.nome;
    switch (a.tipo) {
      case 'rodada':
        return [linha('busca', grupoNome ? `Buscando produto para "${grupoNome}"` : 'Buscando produto…', ultima ? 'Em andamento' : 'Feito', ultima ? 'andamento' : 'neutro')];
      case 'produto': {
        const loja = NOME_LOJA[a.loja ?? ''] ?? 'loja';
        return [
          linha('cubo', `${a.produto ? 'Produto encontrado: ' + this.curto(a.produto) : 'Produto encontrado'} (${loja})`, 'Encontrado', 'achado'),
          linha('doc', 'Link e mensagem prontos', 'Concluído', 'ok'),
        ];
      }
      case 'semProduto': {
        const txt = {
          catalogoVazio: 'Ainda sem produtos — buscando as primeiras ofertas',
          nenhumLiberado: 'Nenhum produto liberado agora',
          cedeu: grupoNome ? `"${grupoNome}" sem produto agora — vez do próximo grupo` : 'Vez do próximo grupo',
          repetido: grupoNome ? `"${grupoNome}" só tem assunto repetido agora` : 'Só assunto repetido agora',
        }[a.motivo ?? ''] ?? 'Nada para postar agora';
        if (a.motivo === 'foraDoHorario') {
          return [linha('relogio', `Fora do horário${a.ate ? ` — posta de novo às ${hhmm(a.ate)}` : ''}`, 'Fora do horário', 'espera')];
        }
        return [linha('relogio', a.ate ? `${txt} — nova busca às ${hhmm(a.ate)}` : txt, 'Aguardando', 'espera')];
      }
      case 'aguardando':
        return [linha('relogio', `Postagem agendada para ${hhmm(a.ate)}`, 'Agendado', 'espera')];
      case 'postando':
        return [linha('grupos', 'Postando produto nos grupos…', ultima ? 'Em andamento' : 'Feito', ultima ? 'andamento' : 'neutro')];
      case 'enviado': {
        const canal = a.canal === 'telegram' ? ' (Telegram)' : '';
        return [linha('envio', `Enviado para ${a.destino ? `"${a.destino}"` : 'o grupo'}${canal}`, 'Concluído', 'ok')];
      }
      case 'concluido':
        return [linha('check', a.produto ? `Publicado: ${this.curto(a.produto)}` : 'Produto publicado', 'Sucesso', 'ok')];
      case 'falhou': {
        const onde = a.etapa === 'telegram' ? 'Não saiu no Telegram' : a.etapa === 'postando' ? 'A postagem não saiu' : 'A busca falhou';
        return [linha('alerta', a.motivo ? `${onde}: ${this.curto(a.motivo)}` : onde, 'Erro', 'erro')];
      }
      default:
        return [];
    }
  }

  // ---- Estatísticas de hoje (cartão "Postados hoje") ----

  protected readonly stats = computed(() => {
    const h = this.statusService.status()?.hoje ?? null;
    const p = this.painel()?.hoje;
    const tentativas = (p?.concluidos ?? 0) + (p?.falhas ?? 0);
    return {
      postados: h?.postados ?? null,
      postadosOntem: h?.postadosOntem ?? null,
      encontrados: h?.encontrados ?? null,
      encontradosOntem: h?.encontradosOntem ?? null,
      tempoMedio: p && p.medidos ? duracao(p.somaMs / p.medidos) : '—',
      taxa: tentativas ? `${Math.round(((p?.concluidos ?? 0) / tentativas) * 100)}%` : '—',
      taxaDetalhe: tentativas ? `${p?.concluidos} de ${tentativas} envios` : 'sem envios ainda',
    };
  });

  // ---- Ações ----

  escolherAlvo(alvo: AlvoGrupos): void {
    this.runControl.escolherAlvo(alvo);
  }

  toggleSelecionado(id: string, marcado: boolean): void {
    this.runControl.toggleSelecionado(id, marcado);
  }

  abrirProdutos(): void {
    this.statsAbertas.set(false);
    this.verProdutos.emit();
  }

  private curto(texto: string, max = 70): string {
    return texto.length > max ? texto.slice(0, max - 1) + '…' : texto;
  }
}
