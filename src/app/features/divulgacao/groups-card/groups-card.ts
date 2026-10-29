import { Component, computed, effect, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ConfigService, FonteProdutos, GrupoTematico, LOJAS_AFILIADO, LojaAfiliado } from '../../../core/services/config.service';
import { VerificacaoService } from '../../../core/services/verificacao.service';
import { ConexoesService } from '../../../core/services/conexoes.service';
import { ConfirmacaoService } from '../../../core/services/confirmacao.service';
import { GruposWhatsappService } from '../../../core/services/grupos-whatsapp.service';
import { GruposOrigemService } from '../../../core/services/grupos-origem.service';
import { ChipInput } from '../../../shared/chip-input/chip-input';
import { ConcorrentesDialog } from '../concorrentes-dialog/concorrentes-dialog';

const GRUPO_VAZIO = (): GrupoTematico => ({
  id: crypto.randomUUID(),
  nome: '',
  groupName: '',
  palavras: [],
  palavrasExcluir: [],
  coringa: false,
  geral: false,
  temaEstrito: false,
  publico: 'misto',
  gruposEspelho: [],
  grupoTelegram: '',
  fonte: 'garimpo',
  gruposClonagem: [],
  lojas: [],
});

const copiar = (g: GrupoTematico): GrupoTematico => ({
  ...g,
  palavras: [...g.palavras],
  palavrasExcluir: [...(g.palavrasExcluir ?? [])],
  gruposEspelho: [...(g.gruposEspelho ?? [])],
  gruposClonagem: [...(g.gruposClonagem ?? [])],
  lojas: [...(g.lojas ?? [])],
});

/** Quantas palavras do assunto aparecem no card antes do "+N". */
const MAX_PALAVRAS_CARD = 5;

/** Quantas palavras aparecem como chip na janela do grupo antes do "+N outros". */
const MAX_CHIPS_MODAL = 5;

/** Quantos concorrentes aparecem como etiqueta no card antes do "+N". */
const MAX_CONCORRENTES_CARD = 3;

/** Para onde volta a escolha dos concorrentes: o card (grava na hora) ou a janela do grupo (rascunho). */
interface Escolha {
  alvo: 'card' | 'rascunho';
  id: string;
  nome: string;
  grupos: string[];
  escolher: boolean;
}

/** Limite de palavras do assunto "pode entrar" (o mesmo da API). */
const MAX_ASSUNTO = 100;

/** Limite de palavras em "Nunca incluir se aparecer" (o mesmo da API). */
const MAX_EXCLUSOES = 100;

/**
 * Grupos em grade, igual à tela de Lojas: cada grupo é um card com o resumo
 * dele, e o clique abre a janela de edição. Salvar na janela já grava — não
 * existe mais um "Salvar alterações" solto no fim da página.
 *
 * A origem dos produtos (garimpo próprio nas lojas ou clonagem dos concorrentes)
 * também mora aqui: a chave "Garimpar / Clonar" do card grava na hora, e o grupo
 * de clonagem escolhe de quais concorrentes clona na janela de concorrentes.
 */
@Component({
  selector: 'app-groups-card',
  standalone: true,
  imports: [FormsModule, ChipInput, ConcorrentesDialog],
  templateUrl: './groups-card.html',
})
export class GroupsCard {
  protected configService = inject(ConfigService);
  private confirmacao = inject(ConfirmacaoService);
  protected zap = inject(GruposWhatsappService);
  private origem = inject(GruposOrigemService);
  private verificacao = inject(VerificacaoService);
  private conexoes = inject(ConexoesService);

  protected readonly lojasAfiliado = LOJAS_AFILIADO;

  protected readonly grupos = signal<GrupoTematico[]>([]);
  /** Janela de concorrentes aberta (uma por vez). */
  protected readonly escolha = signal<Escolha | null>(null);
  /** Grupo cuja chave de origem está gravando. */
  protected readonly trocando = signal<string | null>(null);
  protected readonly erroCard = signal<string | null>(null);

  protected readonly maxConcorrentes = MAX_CONCORRENTES_CARD;

  protected fonteDe(g: GrupoTematico): FonteProdutos {
    return this.origem.fonteDe(g);
  }

  /** O filtro (Todos / Meu garimpo / Clonagem) fica no cabeçalho. */
  protected readonly visiveis = computed(() => {
    const filtro = this.origem.filtro();
    return this.grupos().filter((g) => filtro === 'todos' || this.fonteDe(g) === filtro);
  });

  protected plural(n: number, um: string, varios: string): string {
    return `${n} ${n === 1 ? um : varios}`;
  }

  /** Rascunho do grupo aberto na janela (cópia — só vale depois de salvar). */
  protected readonly rascunho = signal<GrupoTematico | null>(null);
  protected readonly novo = signal(false);
  protected readonly salvando = signal(false);
  protected readonly erro = signal<string | null>(null);

  /** Nomes do grupo destravados para edição (grupo novo já abre assim). */
  protected readonly editandoBasico = signal(false);
  /** "Nunca incluir" e assunto: chips com × ou o campo de digitar. */
  protected readonly editandoFiltro = signal(false);
  protected readonly editandoAssunto = signal(false);
  protected readonly maxConcorrentesModal = MAX_CHIPS_MODAL - 2;
  protected readonly maxTagsModal = MAX_CHIPS_MODAL;

  protected readonly maxPalavras = MAX_PALAVRAS_CARD;
  protected readonly maxAssunto = MAX_ASSUNTO;
  protected readonly maxExclusoes = MAX_EXCLUSOES;

  constructor() {
    effect(() => {
      const cfg = this.configService.config();
      if (!cfg) return;
      this.grupos.set(cfg.grupos.map(copiar));
    });
    void this.zap.carregar();
  }

  // ---- origem (Garimpar / Clonar) -------------------------------------------

  // Dá pra marcar as duas: Clonar + Garimpar = clona primeiro e, sem nada na fila dos concorrentes,
  // garimpa nas lojas (fonte "clonagem" com garimpoReserva). Pelo menos uma fica marcada.

  protected garimpa(g: GrupoTematico): boolean {
    return this.fonteDe(g) === 'garimpo' || !!g.garimpoReserva;
  }

  protected clona(g: GrupoTematico): boolean {
    return this.fonteDe(g) === 'clonagem';
  }

  /** A origem depois de marcar/desmarcar `qual`; null = ficaria sem nenhuma (não muda). */
  private origemTrocada(g: GrupoTematico, qual: FonteProdutos): Pick<GrupoTematico, 'fonte' | 'garimpoReserva'> | null {
    const garimpa = qual === 'garimpo' ? !this.garimpa(g) : this.garimpa(g);
    const clona = qual === 'clonagem' ? !this.clona(g) : this.clona(g);
    if (!garimpa && !clona) return null;
    return clona ? { fonte: 'clonagem', garimpoReserva: garimpa } : { fonte: 'garimpo', garimpoReserva: false };
  }

  async alternarOrigem(g: GrupoTematico, qual: FonteProdutos): Promise<void> {
    const nova = this.origemTrocada(g, qual);
    if (!nova || this.trocando()) return;
    this.erroCard.set(null);
    this.trocando.set(g.id);
    const ok = await this.gravar(this.grupos().map((x) => (x.id === g.id ? { ...x, ...nova } : x)), this.erroCard);
    this.trocando.set(null);
    // Acabou de virar clonagem e ainda clona de todos: já abre a escolha dos concorrentes.
    if (ok && !this.clona(g) && nova.fonte === 'clonagem' && !(g.gruposClonagem ?? []).length) this.escolherConcorrentes(g, true);
  }

  alternarOrigemRascunho(qual: FonteProdutos): void {
    const r = this.rascunho();
    const nova = r && this.origemTrocada(r, qual);
    if (r && nova) this.rascunho.set({ ...r, ...nova });
  }

  escolherConcorrentes(g: GrupoTematico, escolher = false): void {
    this.escolha.set({ alvo: 'card', id: g.id, nome: g.nome || g.groupName, grupos: [...(g.gruposClonagem ?? [])], escolher });
  }

  /** Da janela do grupo: a escolha volta pro rascunho e grava junto com o "Salvar". */
  escolherNoRascunho(): void {
    const r = this.rascunho();
    if (!r) return;
    this.escolha.set({ alvo: 'rascunho', id: r.id, nome: r.nome.trim() || 'Novo grupo', grupos: [...(r.gruposClonagem ?? [])], escolher: false });
  }

  async concluirEscolha(lista: string[]): Promise<void> {
    const e = this.escolha();
    this.escolha.set(null);
    if (!e) return;
    if (e.alvo === 'rascunho') {
      this.atualizar('gruposClonagem', lista);
      return;
    }
    this.erroCard.set(null);
    await this.gravar(this.grupos().map((x) => (x.id === e.id ? { ...x, gruposClonagem: lista } : x)), this.erroCard);
  }

  /** Vazio = clona de todos os grupos deste WhatsApp. */
  protected concorrentesDe(g: GrupoTematico): string[] {
    return g.gruposClonagem ?? [];
  }

  /** "Promo X e Ofertas Y", "Promo X, Ofertas Y e mais 3". */
  protected resumoConcorrentes(lista: string[]): string {
    if (lista.length <= 2) return lista.join(' e ');
    return `${lista.slice(0, 2).join(', ')} e mais ${lista.length - 2}`;
  }

  // ---- janela ---------------------------------------------------------------

  abrir(g: GrupoTematico): void {
    this.erro.set(null);
    this.novo.set(false);
    this.reiniciarEdicao(false);
    this.rascunho.set({ ...copiar(g), fonte: this.fonteDe(g) });
  }

  criar(): void {
    this.erro.set(null);
    this.novo.set(true);
    this.reiniciarEdicao(true);
    this.rascunho.set(GRUPO_VAZIO());
  }

  private reiniciarEdicao(novo: boolean): void {
    this.editandoBasico.set(novo);
    this.editandoFiltro.set(false);
    this.editandoAssunto.set(novo);
  }

  /** O × do chip: tira só aquele concorrente (vazio = volta a clonar de todos). */
  removerConcorrente(nome: string): void {
    const r = this.rascunho();
    if (!r) return;
    this.atualizar('gruposClonagem', (r.gruposClonagem ?? []).filter((n) => n !== nome));
  }

  /** O × do chip: tira só aquela palavra do assunto ou do "Nunca incluir". */
  removerTag(campo: 'palavras' | 'palavrasExcluir', palavra: string): void {
    const r = this.rascunho();
    if (!r) return;
    this.atualizar(campo, r[campo].filter((p) => p !== palavra));
  }

  fechar(): void {
    if (this.salvando()) return;
    this.rascunho.set(null);
    this.erro.set(null);
  }

  atualizar<K extends keyof GrupoTematico>(campo: K, valor: GrupoTematico[K]): void {
    this.rascunho.update((r) => (r ? { ...r, [campo]: valor } : r));
  }

  // ---- lojas do grupo -------------------------------------------------------

  /** Vazio = todas. */
  protected lojasMarcadas(g: GrupoTematico): LojaAfiliado[] {
    const l = g.lojas ?? [];
    return l.length ? l : LOJAS_AFILIADO.map((x) => x.id);
  }

  protected lojaMarcada(g: GrupoTematico, loja: LojaAfiliado): boolean {
    return this.lojasMarcadas(g).includes(loja);
  }

  /** Só as lojas efetivamente conectadas aparecem no seletor. */
  protected readonly lojasVisiveis = computed(() =>
    LOJAS_AFILIADO.filter((l) =>
      l.id === 'mercadolivre'
        ? this.verificacao.mercadoLivreConectado()
        : l.id === 'shopee'
          ? this.verificacao.shopeeConectado()
          : this.conexoes.statusDe(l.id)?.status === 'conectado',
    ),
  );

  /** Marca/desmarca uma loja. A última marcada (entre as conectadas) não sai: grupo sem loja não posta nada. */
  alternarLoja(loja: LojaAfiliado): void {
    const r = this.rascunho();
    if (!r) return;
    const atuais = this.lojasMarcadas(r);
    const visiveisMarcadas = this.lojasVisiveis().filter((l) => atuais.includes(l.id));
    if (atuais.includes(loja) && visiveisMarcadas.length <= 1) return;
    const nova = atuais.includes(loja) ? atuais.filter((l) => l !== loja) : [...atuais, loja];
    const ordenada = LOJAS_AFILIADO.map((x) => x.id).filter((l) => nova.includes(l));
    this.atualizar('lojas', ordenada.length === LOJAS_AFILIADO.length ? [] : ordenada);
  }

  /** O que aparece ao lado da loja na janela: desligada no painel ou não conectada. */
  protected avisoDaLoja(loja: LojaAfiliado): string {
    if ((this.configService.config()?.lojasDesligadas ?? []).includes(loja)) return 'desligada em Conexões';
    const conectada =
      loja === 'mercadolivre'
        ? this.verificacao.mercadoLivreConectado()
        : loja === 'shopee'
          ? this.verificacao.shopeeConectado()
          : this.conexoes.statusDe(loja)?.status === 'conectado';
    return conectada ? '' : 'não conectada';
  }

  /** "só Mercado Livre", "só Amazon e Shopee" — no rodapé do card. Vazio quando usa todas. */
  protected resumoLojas(g: GrupoTematico): string {
    const l = g.lojas ?? [];
    if (!l.length || l.length === LOJAS_AFILIADO.length) return '';
    const nomes = LOJAS_AFILIADO.filter((x) => l.includes(x.id)).map((x) => x.nome);
    return `só ${nomes.join(' e ')}`;
  }

  /** Apaga de uma vez todas as tags de um dos campos do grupo (pode/não pode entrar). */
  limparTags(campo: 'palavras' | 'palavrasExcluir'): void {
    this.rascunho.update((r) => (r ? { ...r, [campo]: [] } : r));
  }

  // ---- gravação -------------------------------------------------------------

  async salvar(): Promise<void> {
    const r = this.rascunho();
    if (!r) return;

    const g: GrupoTematico = {
      ...r,
      nome: r.nome.trim(),
      groupName: r.groupName.trim(),
      grupoTelegram: (r.grupoTelegram ?? '').trim(),
    };
    if (!g.nome || !g.groupName) {
      this.erro.set('Preencha o apelido e o nome exato do grupo no WhatsApp.');
      return;
    }
    if (g.palavras.length > MAX_ASSUNTO) {
      this.erro.set(`No máximo ${MAX_ASSUNTO} palavras no assunto do grupo.`);
      return;
    }
    if (g.palavrasExcluir.length > MAX_EXCLUSOES) {
      this.erro.set(`No máximo ${MAX_EXCLUSOES} palavras em "Nunca incluir se aparecer".`);
      return;
    }
    if (!g.coringa && !g.geral && g.palavras.length === 0) {
      this.erro.set('Adicione pelo menos uma palavra no assunto — ou marque "Recebe tudo".');
      return;
    }

    const existe = this.grupos().some((x) => x.id === g.id);
    let lista = existe ? this.grupos().map((x) => (x.id === g.id ? g : x)) : [...this.grupos(), g];
    // Só um grupo pode ser o de sobras.
    if (g.coringa) lista = lista.map((x) => ({ ...x, coringa: x.id === g.id }));

    const ok = await this.gravar(lista);
    if (ok) this.rascunho.set(null);
  }

  async remover(g: GrupoTematico): Promise<void> {
    const ok = await this.confirmacao.pedir({
      titulo: `Remover o grupo "${g.nome || g.groupName}"?`,
      texto: 'O robô para de publicar promoções neste grupo. O grupo no WhatsApp continua lá, intacto.',
      confirmar: 'Remover',
      perigo: true,
    });
    if (!ok) return;

    if (await this.gravar(this.grupos().filter((x) => x.id !== g.id))) this.rascunho.set(null);
  }

  private async gravar(lista: GrupoTematico[], erro = this.erro): Promise<boolean> {
    erro.set(null);
    this.salvando.set(true);
    // A origem vai gravada em cada grupo; a escolha antiga da conta ('grupos') volta para o
    // garimpo, que é o padrão de um grupo novo — senão um grupo sem origem mudaria junto.
    lista = lista.map((g) => ({ ...g, fonte: this.fonteDe(g) }));
    const legado = this.origem.fontePadrao() === 'clonagem' ? { garimpo: { fonte: 'mercadolivre' } } : {};
    const r = await this.configService.salvar({ grupos: lista, ...legado });
    this.salvando.set(false);
    if (!r.ok) {
      erro.set(r.erro ?? 'Erro ao salvar.');
      return false;
    }
    this.grupos.set(lista.map(copiar));
    return true;
  }

  // ---- card -----------------------------------------------------------------

  protected inicial(g: GrupoTematico): string {
    const base = (g.nome || g.groupName || '?').trim();
    return [...base][0]?.toUpperCase() ?? '?';
  }
}
