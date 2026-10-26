import { Component, computed, effect, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ConfigService, FonteProdutos, GrupoTematico } from '../../../core/services/config.service';
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
});

const copiar = (g: GrupoTematico): GrupoTematico => ({
  ...g,
  palavras: [...g.palavras],
  palavrasExcluir: [...(g.palavrasExcluir ?? [])],
  gruposEspelho: [...(g.gruposEspelho ?? [])],
  gruposClonagem: [...(g.gruposClonagem ?? [])],
});

/** Quantas palavras do assunto aparecem no card antes do "+N". */
const MAX_PALAVRAS_CARD = 5;

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

  async definirFonte(g: GrupoTematico, fonte: FonteProdutos): Promise<void> {
    if (this.fonteDe(g) === fonte || this.trocando()) return;
    this.erroCard.set(null);
    this.trocando.set(g.id);
    const ok = await this.gravar(this.grupos().map((x) => (x.id === g.id ? { ...x, fonte } : x)), this.erroCard);
    this.trocando.set(null);
    // Acabou de virar clonagem e ainda clona de todos: já abre a escolha dos concorrentes.
    if (ok && fonte === 'clonagem' && !(g.gruposClonagem ?? []).length) this.escolherConcorrentes(g, true);
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
    this.rascunho.set({ ...copiar(g), fonte: this.fonteDe(g) });
  }

  criar(): void {
    this.erro.set(null);
    this.novo.set(true);
    this.rascunho.set(GRUPO_VAZIO());
  }

  fechar(): void {
    if (this.salvando()) return;
    this.rascunho.set(null);
    this.erro.set(null);
  }

  atualizar<K extends keyof GrupoTematico>(campo: K, valor: GrupoTematico[K]): void {
    this.rascunho.update((r) => (r ? { ...r, [campo]: valor } : r));
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
