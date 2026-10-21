import { Component, DestroyRef, ElementRef, HostListener, computed, inject, output, signal } from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import {
  AcaoPainel,
  AlvoGrupos,
  EstadoEtapa,
  EtapaPainelId,
  JobsService,
} from '../../../core/services/jobs.service';
import { RunControlService } from '../../../core/services/run-control.service';
import { StatusService } from '../../../core/services/status.service';
import { VerificacaoService } from '../../../core/services/verificacao.service';
import { GruposFila } from '../grupos-fila/grupos-fila';

type Icone =
  | 'busca' | 'sacola' | 'doc' | 'envio' | 'check' | 'alerta' | 'relogio' | 'play' | 'pausa' | 'parar' | 'grafico'
  | 'grupos' | 'robo' | 'raio' | 'externo';
type Tom = 'ok' | 'andamento' | 'espera' | 'erro' | 'neutro' | 'achado';

interface EtapaVista {
  id: EtapaPainelId;
  numero: number;
  titulo: string;
  sub: string;
  estado: EstadoEtapa;
  selo: string;
  atual: boolean;
  icone: Icone;
  loja: string | null;
}

interface AcaoVista {
  hora: string;
  icone: Icone;
  texto: string;
  selo: string;
  tom: Tom;
}

const NOME_LOJA: Record<string, string> = { mercadolivre: 'Mercado Livre', amazon: 'Amazon', shopee: 'Shopee' };
const ORDEM: EtapaPainelId[] = ['buscando', 'origem', 'preparando', 'postando', 'concluido'];
const MAX_ACOES_COMPACTO = 20;

const BASE: Record<EtapaPainelId, { titulo: string; sub: string; icone: Icone }> = {
  buscando: { titulo: 'Buscando produto', sub: 'Procurando promoções', icone: 'busca' },
  origem: { titulo: 'Origem do produto', sub: 'De qual loja ele vem', icone: 'sacola' },
  preparando: { titulo: 'Preparando conteúdo', sub: 'Gerando link e mensagem', icone: 'doc' },
  postando: { titulo: 'Postando', sub: 'Enviando para os grupos', icone: 'envio' },
  concluido: { titulo: 'Concluído', sub: 'Produto publicado', icone: 'check' },
};

function hhmm(iso: string | null | undefined): string {
  if (!iso) return '';
  return new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

/** "2h 34min", "12min", "45s". */
function duracao(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000));
  if (s < 60) return `${s}s`;
  const min = Math.floor(s / 60);
  if (min < 60) return s % 60 && min < 10 ? `${min}min ${s % 60}s` : `${min}min`;
  return `${Math.floor(min / 60)}h ${min % 60}min`;
}

/**
 * O Painel para quem não quer ler log, cabendo numa tela só: estado do robô e
 * controles numa linha, a pipeline do produto da vez (Buscando → Origem →
 * Preparando → Postando → Concluído, com a loja na Origem e os canais no
 * Postando) e as últimas ações em frases curtas. Os números do dia ficam num
 * modal. Tudo sai do estado estruturado que o robô manda (evento "painel"); o
 * log cru continua no "Ver logs detalhados".
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

  protected runControl = inject(RunControlService);
  protected jobs = inject(JobsService);
  protected statusService = inject(StatusService);
  private verificacao = inject(VerificacaoService);

  /** Relógio de 1s pras contagens (tempo ativo, próxima ação). */
  protected readonly agora = signal(Date.now());
  protected readonly escolhendoGrupos = signal(false);
  protected readonly statsAbertas = signal(false);

  private host = inject(ElementRef<HTMLElement>);

  constructor() {
    const t = setInterval(() => this.agora.set(Date.now()), 1000);
    inject(DestroyRef).onDestroy(() => clearInterval(t));
  }

  /** Clique fora do "Escolher grupos" fecha a caixinha. */
  @HostListener('document:click', ['$event'])
  protected fecharGruposFora(ev: MouseEvent): void {
    if (!this.escolhendoGrupos()) return;
    const ancora = (this.host.nativeElement as HTMLElement).querySelector('.pv-grupos-ancora');
    if (ancora && !ancora.contains(ev.target as Node)) this.escolhendoGrupos.set(false);
  }

  @HostListener('document:keydown.escape')
  protected fecharComEsc(): void {
    this.escolhendoGrupos.set(false);
    this.statsAbertas.set(false);
  }

  private readonly painel = computed(() => this.jobs.painel());

  /** A pipeline só vale com o robô de postagem rodando agora; parado, tudo volta a "pendente". */
  protected readonly aoVivo = computed(() => this.runControl.postandoAgora() && !!this.painel()?.atual);

  // ---- Cabeçalho ----

  protected readonly estado = computed<'online' | 'pausado' | 'religando' | 'externo' | 'ganhos' | 'desligado'>(() => {
    if (this.runControl.pausado()) return 'pausado';
    if (this.runControl.postandoAgora()) return 'online';
    if (this.runControl.rodandoContinuo()) return 'religando';
    if (this.runControl.processoExterno()) return 'externo';
    if (this.runControl.lendoGanhos()) return 'ganhos';
    return 'desligado';
  });

  protected readonly rotuloEstado = computed(() => {
    switch (this.estado()) {
      case 'online': return 'Online';
      case 'pausado': return 'Pausado';
      case 'religando': return 'Ligando';
      case 'externo': return 'Fora do painel';
      case 'ganhos': return 'Lendo ganhos';
      default: return 'Desligado';
    }
  });

  protected readonly frase = computed(() => {
    switch (this.estado()) {
      case 'online':
        if (this.jobs.desafioMl()) return 'Funcionando — Mercado Livre em espera, as outras lojas seguem postando';
        if (this.painel()?.etapas.buscando.estado === 'erro') return 'Funcionando — a última busca falhou, tentando de novo';
        return 'Funcionando normalmente';
      case 'pausado': return 'Pausado — WhatsApp e navegador abertos, nada é postado até retomar';
      case 'religando': return 'Abrindo o navegador e o WhatsApp…';
      case 'externo': return 'Rodando fora do painel (pelo terminal)';
      case 'ganhos': return 'Lendo os ganhos nas lojas — dá para ligar a postagem em seguida';
      default: return 'Ligue para ele procurar ofertas e postar nos grupos sozinho';
    }
  });

  protected readonly tempoAtivo = computed(() => {
    const ini = this.statusService.status()?.job?.iniciadoEm;
    if (!this.runControl.postandoAgora() || !ini) return '—';
    return duracao(this.agora() - new Date(ini).getTime());
  });

  protected readonly postadosHoje = computed(() => this.statusService.status()?.hoje?.postados ?? null);

  /** Próxima coisa com hora marcada: a postagem agendada ou a nova busca. */
  protected readonly proxima = computed<{ rotulo: string; valor: string }>(() => {
    const p = this.painel();
    if (!this.runControl.postandoAgora()) return { rotulo: 'Próxima postagem', valor: '—' };
    if (this.runControl.pausado()) return { rotulo: 'Próxima ação', valor: 'Pausado' };
    const conta = (iso: string) => duracao(new Date(iso).getTime() - this.agora());
    const postar = p?.etapas.postando;
    if (postar?.estado === 'espera' && postar.ate && new Date(postar.ate).getTime() > this.agora()) {
      return { rotulo: 'Próxima postagem em', valor: conta(postar.ate) };
    }
    const buscar = p?.etapas.buscando;
    if (p?.atual === 'buscando' && buscar?.estado === 'espera' && buscar.ate && new Date(buscar.ate).getTime() > this.agora()) {
      return { rotulo: 'Nova busca em', valor: conta(buscar.ate) };
    }
    const prevista = this.runControl.proximaPublicacao();
    if (prevista && new Date(prevista).getTime() > this.agora()) {
      return { rotulo: 'Próxima postagem em', valor: conta(prevista) };
    }
    return { rotulo: 'Próxima ação', valor: 'Agora' };
  });

  // ---- Pipeline ----

  protected readonly etapas = computed<EtapaVista[]>(() => {
    const p = this.painel();
    const vivo = this.aoVivo();
    const pausado = this.runControl.pausado();
    return ORDEM.map((id, i) => {
      const base = BASE[id];
      const e = vivo && p ? p.etapas[id] : { estado: 'pendente' as EstadoEtapa, ate: null, motivo: null };
      const atual = vivo && p?.atual === id;
      const v: EtapaVista = {
        id,
        numero: i + 1,
        titulo: base.titulo,
        sub: base.sub,
        estado: e.estado,
        selo: '',
        atual,
        icone: base.icone,
        loja: null,
      };
      v.selo = { pendente: 'Aguardando', andamento: 'Em andamento…', espera: 'Aguardando', ok: 'Concluído', erro: 'Erro' }[e.estado];

      if (id === 'buscando') {
        if (e.estado === 'espera') {
          v.sub = {
            catalogoVazio: 'Garimpando as primeiras ofertas',
            nenhumLiberado: 'Nada liberado agora',
            cedeu: 'Passando a vez pro próximo grupo',
            repetido: 'Só assunto repetido neste grupo',
            foraDoHorario: 'Fora do horário — garimpando',
          }[e.motivo ?? ''] ?? 'Esperando novidade';
          if (e.ate) v.selo = e.motivo === 'foraDoHorario' ? `Posta de novo às ${hhmm(e.ate)}` : `Nova busca às ${hhmm(e.ate)}`;
        } else if (e.estado === 'ok') v.sub = 'Promoção escolhida';
        else if (e.estado === 'erro') v.sub = 'Falhou — tenta de novo sozinho';
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

  // ---- Grupos e canais de destino ----

  private readonly gruposAlvo = computed(() => {
    const todos = this.runControl.grupos();
    const manual = this.statusService.status()?.agendamento?.manual;
    const ligado = this.runControl.algoRodando();
    const alvo = ligado ? manual?.alvo : this.runControl.alvo();
    if (alvo !== 'selecionados') return todos;
    const ids = new Set(ligado ? manual?.ids ?? [] : [...this.runControl.selecionados()]);
    return todos.filter((g) => ids.has(g.id));
  });

  protected readonly grupoDaVez = computed(() => (this.aoVivo() ? this.painel()?.grupo?.nome ?? null : null));

  protected readonly produtoDaVez = computed(() => (this.aoVivo() ? this.painel()?.produto?.nome ?? null : null));

  protected readonly rotuloAlvo = computed(() => {
    const total = this.runControl.grupos().length;
    const n = this.gruposAlvo().length;
    return n === total ? 'todos' : `${n} de ${total}`;
  });

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

  // ---- Últimas ações ----

  protected readonly acoes = computed<AcaoVista[]>(() => {
    const lista = this.painel()?.acoes ?? [];
    const out: AcaoVista[] = [];
    lista.forEach((a, i) => {
      const ultima = i === lista.length - 1 && this.runControl.postandoAgora();
      out.push(...this.traduzir(a, ultima));
    });
    return out.reverse().slice(0, MAX_ACOES_COMPACTO);
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
          linha('sacola', `${a.produto ? 'Produto encontrado: ' + this.curto(a.produto) : 'Produto encontrado'} (${loja})`, 'Encontrado', 'achado'),
          linha('doc', 'Link e mensagem prontos', 'Concluído', 'ok'),
        ];
      }
      case 'semProduto': {
        const txt = {
          catalogoVazio: 'Ainda sem produtos — garimpando as primeiras ofertas',
          nenhumLiberado: 'Nenhum produto liberado agora',
          cedeu: grupoNome ? `"${grupoNome}" sem produto agora — vez do próximo grupo` : 'Vez do próximo grupo',
          repetido: grupoNome ? `"${grupoNome}" só tem assunto repetido agora` : 'Só assunto repetido agora',
        }[a.motivo ?? ''] ?? 'Nada para postar agora';
        if (a.motivo === 'foraDoHorario') {
          return [linha('relogio', `Fora do horário — garimpando${a.ate ? `, posta de novo às ${hhmm(a.ate)}` : ''}`, 'Fora do horário', 'espera')];
        }
        return [linha('relogio', a.ate ? `${txt} — nova busca às ${hhmm(a.ate)}` : txt, 'Aguardando', 'espera')];
      }
      case 'aguardando':
        return [linha('relogio', `Postagem agendada para ${hhmm(a.ate)}`, 'Agendado', 'espera')];
      case 'postando':
        return [linha('grupos', 'Postando produto nos grupos…', ultima ? 'Em andamento' : 'Feito', ultima ? 'andamento' : 'neutro')];
      case 'enviado': {
        const canal = a.canal === 'telegram' ? 'Telegram' : 'WhatsApp';
        return [linha('envio', `Enviado para ${a.destino ? `"${a.destino}"` : 'o grupo'} (${canal})`, 'Concluído', 'ok')];
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

  // ---- Estatísticas de hoje ----

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
    if (alvo === 'selecionados') this.escolhendoGrupos.set(true);
  }

  abrirProdutos(): void {
    this.statsAbertas.set(false);
    this.verProdutos.emit();
  }

  toggleSelecionado(id: string, marcado: boolean): void {
    this.runControl.toggleSelecionado(id, marcado);
  }

  protected logoDaLoja(loja: string | null): string {
    return `lojas/${loja && NOME_LOJA[loja] ? loja : 'mercadolivre'}.svg`;
  }

  private canaisTexto(canais: string[]): string {
    if (canais.includes('whatsapp') && canais.includes('telegram')) return 'Enviado no WhatsApp e no Telegram';
    if (canais.includes('telegram')) return 'Enviado no Telegram';
    return 'Enviado no WhatsApp';
  }

  private curto(texto: string, max = 70): string {
    return texto.length > max ? texto.slice(0, max - 1) + '…' : texto;
  }
}
