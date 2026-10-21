import { Component, computed, effect, inject, signal, untracked } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { ConfigService, FonteProdutos } from '../../../core/services/config.service';
import { JobsService } from '../../../core/services/jobs.service';

const MAX_GRUPOS = 50;
/** Quanto esperar o robô conectar o WhatsApp e anotar a lista de grupos. */
const PRAZO_LISTA_MS = 180000;
const PASSO_ESPERA_MS = 500;
/** Quantos nomes aparecem no resumo "Clona de" antes do "e mais N". */
const MAX_NOMES_RESUMO = 2;
/** Quantos concorrentes aparecem como etiqueta na linha do grupo antes do "+N". */
const MAX_CHIPS = 3;

interface GruposDoWhatsapp {
  em: string | null;
  grupos: { nome: string; canal: boolean; lendo: boolean }[];
  naoEncontrados: string[];
}

const mesmoNome = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();

/**
 * De onde vêm os produtos de cada grupo de destino: do garimpo próprio nas
 * lojas ou da clonagem dos grupos dos concorrentes. Uns grupos podem receber
 * o garimpo e outros a clonagem ao mesmo tempo, e cada grupo de clonagem
 * escolhe de quais grupos dos concorrentes ele clona.
 */
@Component({
  selector: 'app-garimpo-card',
  standalone: true,
  templateUrl: './garimpo-card.html',
  styleUrl: './garimpo-card.scss',
})
export class GarimpoCard {
  protected configService = inject(ConfigService);
  private http = inject(HttpClient);
  private jobs = inject(JobsService);

  protected readonly maxGrupos = MAX_GRUPOS;
  protected readonly maxChips = MAX_CHIPS;
  /** Filtro da lista de grupos e da lista da janela. */
  protected readonly busca = signal('');
  protected readonly buscaJanela = signal('');
  /** Na janela: "Todos os grupos" (lista vazia) ou "Só os que eu escolher". */
  protected readonly modoTodos = signal(true);
  /** Como a lista do grupo estava ao abrir a janela — o "Cancelar" volta pra ela. */
  private antesDaJanela: string[] = [];

  /** Os grupos onde o robô posta (aba Grupos). */
  protected readonly gruposDestino = computed(() => this.configService.config()?.grupos ?? []);

  private readonly salvo = computed(() => {
    const cfg = this.configService.config();
    const padrao: FonteProdutos = cfg?.garimpo?.fonte === 'grupos' ? 'clonagem' : 'garimpo';
    const fontes: Record<string, FonteProdutos> = {};
    const clona: Record<string, string[]> = {};
    for (const grupo of cfg?.grupos ?? []) {
      fontes[grupo.id] = grupo.fonte ?? padrao;
      clona[grupo.id] = [...(grupo.gruposClonagem ?? [])];
    }
    return { fontes, clona };
  });

  protected readonly rFontes = signal<Record<string, FonteProdutos>>({});
  /** De quais grupos dos concorrentes cada grupo clona (vazio = todos). */
  protected readonly rClona = signal<Record<string, string[]>>({});
  /** Grupo com a escolha dos concorrentes aberta (um por vez). */
  protected readonly aberto = signal<string | null>(null);
  protected readonly salvando = signal(false);
  protected readonly erro = signal<string | null>(null);

  /** Grupos em que o WhatsApp está de verdade, anotados pelo robô na última leitura. */
  protected readonly doWhatsapp = signal<GruposDoWhatsapp>({ em: null, grupos: [], naoEncontrados: [] });
  protected readonly atualizandoGrupos = signal(false);
  protected readonly erroGrupos = signal<string | null>(null);

  protected fonteDe(id: string): FonteProdutos {
    return this.rFontes()[id] ?? 'garimpo';
  }

  protected clonaDe(id: string): string[] {
    return this.rClona()[id] ?? [];
  }

  definirFonte(id: string, fonte: FonteProdutos): void {
    this.erro.set(null);
    this.rFontes.set({ ...this.rFontes(), [id]: fonte });
    // Acabou de virar clonagem e ainda clona de todos: já abre a escolha dos grupos.
    if (fonte === 'clonagem' && !this.clonaDe(id).length) this.abrirEscolha(id, true);
  }

  protected inicial(nome: string): string {
    return (nome || '?').trim().charAt(0).toUpperCase() || '?';
  }

  protected readonly contagem = computed(() => {
    const grupos = this.gruposDestino();
    const clonagem = grupos.filter((g) => this.fonteDe(g.id) === 'clonagem').length;
    return {
      garimpo: grupos.length - clonagem,
      clonagem,
      lidos: this.doWhatsapp().grupos.filter((w) => w.lendo).length,
    };
  });

  protected readonly gruposVisiveis = computed(() => {
    const termo = this.busca().trim().toLowerCase();
    const grupos = this.gruposDestino();
    if (!termo) return grupos;
    return grupos.filter((g) => `${g.nome} ${g.groupName}`.toLowerCase().includes(termo));
  });

  /** O nome escolhido não está entre os grupos que o robô achou no WhatsApp. */
  protected naoEncontrado(nome: string): boolean {
    return this.doWhatsapp().naoEncontrados.some((n) => mesmoNome(n, nome));
  }

  // ---- janela "Escolher concorrentes" ----

  protected readonly grupoAberto = computed(() => {
    const id = this.aberto();
    return id ? this.gruposDestino().find((g) => g.id === id) ?? null : null;
  });

  /** `escolher`: abre já em "Só os que eu escolher" (o grupo acabou de virar clonagem). */
  abrirEscolha(id: string, escolher = false): void {
    this.antesDaJanela = [...this.clonaDe(id)];
    this.modoTodos.set(!this.antesDaJanela.length && !escolher);
    this.buscaJanela.set('');
    this.aberto.set(id);
  }

  cancelarEscolha(): void {
    const id = this.aberto();
    if (id) this.definirClonagem(id, this.antesDaJanela);
    this.aberto.set(null);
  }

  concluirEscolha(): void {
    const id = this.aberto();
    if (id && this.modoTodos()) this.definirClonagem(id, []);
    this.aberto.set(null);
  }

  escolherTodos(id: string): void {
    this.modoTodos.set(true);
    this.definirClonagem(id, []);
  }

  /** O que foi digitado na busca e não está na lista: dá pra adicionar pelo nome. */
  protected podeAdicionarDigitado(id: string): boolean {
    const nome = this.buscaJanela().trim();
    if (!nome || this.clonaDe(id).length >= MAX_GRUPOS) return false;
    return !this.doWhatsapp().grupos.some((w) => mesmoNome(w.nome, nome)) && !this.naLista(id, nome);
  }

  adicionarDigitado(id: string): void {
    if (!this.podeAdicionarDigitado(id)) return;
    this.definirClonagem(id, [...this.clonaDe(id), this.buscaJanela().trim()]);
    this.buscaJanela.set('');
  }

  /** Lista da janela: os grupos do WhatsApp mais os nomes digitados, marcados primeiro. */
  protected readonly opcoesJanela = computed(() => {
    const id = this.aberto();
    if (!id) return [];
    const termo = this.buscaJanela().trim().toLowerCase();
    const doZap = this.doWhatsapp().grupos.map((w) => ({
      nome: w.nome,
      marcado: this.naLista(id, w.nome),
      lendo: w.lendo,
      faltando: false,
      detalhe: w.canal ? 'Canal' : 'Grupo',
    }));
    const digitados = this.clonaDe(id)
      .filter((n) => !doZap.some((w) => mesmoNome(w.nome, n)))
      .map((nome) => ({ nome, marcado: true, lendo: false, faltando: this.naoEncontrado(nome), detalhe: 'Digitado pelo nome' }));
    return [...digitados, ...doZap]
      .filter((o) => !termo || o.nome.toLowerCase().includes(termo))
      .sort((a, b) => Number(b.marcado) - Number(a.marcado));
  });

  protected horaDaLista(): string {
    const em = this.doWhatsapp().em;
    const d = em ? new Date(em) : null;
    if (!d || Number.isNaN(d.getTime())) return '';
    const hora = d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    return d.toDateString() === new Date().toDateString() ? `hoje, ${hora}` : `${d.toLocaleDateString('pt-BR')}, ${hora}`;
  }

  /** Quantos grupos têm alguma mudança ainda não salva. */
  protected readonly alteracoes = computed(() => {
    const s = this.salvo();
    return Object.keys(s.fontes).filter(
      (id) => s.fontes[id] !== this.fonteDe(id) || s.clona[id].join('|') !== this.clonaDe(id).join('|')
    ).length;
  });

  definirClonagem(id: string, grupos: string[]): void {
    this.erro.set(null);
    this.rClona.set({ ...this.rClona(), [id]: grupos.slice(0, MAX_GRUPOS) });
  }

  alternarAberto(id: string): void {
    this.aberto.set(this.aberto() === id ? null : id);
  }

  protected naLista(id: string, nome: string): boolean {
    return this.clonaDe(id).some((g) => mesmoNome(g, nome));
  }

  alternarGrupo(id: string, nome: string): void {
    const atuais = this.clonaDe(id);
    this.definirClonagem(id, this.naLista(id, nome) ? atuais.filter((g) => !mesmoNome(g, nome)) : [...atuais, nome]);
  }

  /** "todos os grupos", "Promo X e Ofertas Y", "Promo X, Ofertas Y e mais 3". */
  protected resumo(id: string): string {
    const lista = this.clonaDe(id);
    if (!lista.length) return 'todos os grupos deste WhatsApp';
    if (lista.length <= MAX_NOMES_RESUMO) return lista.join(' e ');
    return `${lista.slice(0, MAX_NOMES_RESUMO).join(', ')} e mais ${lista.length - MAX_NOMES_RESUMO}`;
  }

  /** Nomes escolhidos para o grupo que o robô não achou no WhatsApp. */
  protected naoEncontradosDe(id: string): string[] {
    const faltam = this.doWhatsapp().naoEncontrados;
    return this.clonaDe(id).filter((g) => faltam.some((n) => mesmoNome(n, g)));
  }

  async carregarGruposDoWhatsapp(): Promise<void> {
    try {
      this.doWhatsapp.set(await firstValueFrom(this.http.get<GruposDoWhatsapp>('/api/config/grupos-whatsapp')));
    } catch (_) {
      // sem a lista, a tela segue funcionando só com os nomes digitados
    }
  }

  /**
   * Botão "Atualizar grupos": com o robô desligado, sobe um processo só para conectar o WhatsApp
   * e anotar a lista. Com o robô ligado o WhatsApp já está aberto nele — aí só relê o que ele anotou.
   */
  async atualizarGrupos(): Promise<void> {
    if (this.atualizandoGrupos()) return;
    this.erroGrupos.set(null);
    this.atualizandoGrupos.set(true);
    try {
      if (!this.jobs.rodando()) {
        const r = await this.jobs.iniciar('listar-grupos-zap');
        if (!r.ok) {
          this.erroGrupos.set(r.erro ?? 'Não consegui ler os grupos agora.');
          return;
        }
        await this.esperarJob();
      }
      const antes = this.doWhatsapp().em;
      await this.carregarGruposDoWhatsapp();
      if (!this.jobs.rodando() && this.doWhatsapp().em === antes) {
        this.erroGrupos.set('O WhatsApp não respondeu. Confira se ele está conectado na aba Conexões.');
      }
    } finally {
      this.atualizandoGrupos.set(false);
    }
  }

  /** Espera o processo subir e encerrar (conectar o WhatsApp pode levar um ou dois minutos). */
  private async esperarJob(): Promise<void> {
    const dormir = () => new Promise((r) => setTimeout(r, PASSO_ESPERA_MS));
    const subiuAte = Date.now() + 5000;
    while (!this.jobs.rodando() && Date.now() < subiuAte) await dormir();
    const limite = Date.now() + PRAZO_LISTA_MS;
    while (this.jobs.rodando() && this.jobs.tipo() === 'listar-grupos-zap' && Date.now() < limite) await dormir();
  }

  protected readonly alterado = computed(() => {
    const s = this.salvo();
    return Object.keys(s.fontes).some(
      (id) => s.fontes[id] !== this.fonteDe(id) || s.clona[id].join('\n') !== this.clonaDe(id).join('\n')
    );
  });

  constructor() {
    // O rascunho acompanha o que está salvo (ao abrir a tela e depois de cada gravação).
    effect(() => {
      const s = this.salvo();
      untracked(() => {
        this.rFontes.set({ ...s.fontes });
        this.rClona.set(Object.fromEntries(Object.entries(s.clona).map(([id, l]) => [id, [...l]])));
      });
    });
    void this.carregarGruposDoWhatsapp();
  }

  desfazer(): void {
    const s = this.salvo();
    this.erro.set(null);
    this.aberto.set(null);
    this.rFontes.set({ ...s.fontes });
    this.rClona.set(Object.fromEntries(Object.entries(s.clona).map(([id, l]) => [id, [...l]])));
  }

  async salvar(): Promise<void> {
    this.erro.set(null);
    this.salvando.set(true);
    // A origem e os grupos que ele clona ficam gravados em cada grupo; a escolha antiga da conta
    // ('fonte') volta para o garimpo, que é o padrão de um grupo novo cadastrado depois.
    const r = await this.configService.salvar({
      grupos: this.gruposDestino().map((g) => ({ ...g, fonte: this.fonteDe(g.id), gruposClonagem: this.clonaDe(g.id) })),
      garimpo: { fonte: 'mercadolivre' },
    });
    this.salvando.set(false);
    if (!r.ok) this.erro.set(r.erro ?? 'Erro ao salvar.');
    else this.aberto.set(null);
  }
}
