import { Component, computed, effect, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ConfigService, GrupoTematico } from '../../../core/services/config.service';
import { ConfirmacaoService } from '../../../core/services/confirmacao.service';
import { ChipInput } from '../../../shared/chip-input/chip-input';

const GRUPO_VAZIO = (): GrupoTematico => ({
  id: crypto.randomUUID(),
  nome: '',
  groupName: '',
  palavras: [],
  palavrasExcluir: [],
  coringa: false,
  geral: false,
  gruposEspelho: [],
});

const copiar = (g: GrupoTematico): GrupoTematico => ({
  ...g,
  palavras: [...g.palavras],
  palavrasExcluir: [...(g.palavrasExcluir ?? [])],
  gruposEspelho: [...(g.gruposEspelho ?? [])],
});

/** Quantas palavras do assunto aparecem no card antes do "+N". */
const MAX_PALAVRAS_CARD = 5;

/**
 * Grupos em grade, igual à tela de Lojas: cada grupo é um card com o resumo
 * dele, e o clique abre a janela de edição. Salvar na janela já grava — não
 * existe mais um "Salvar alterações" solto no fim da página.
 */
@Component({
  selector: 'app-groups-card',
  standalone: true,
  imports: [FormsModule, ChipInput],
  templateUrl: './groups-card.html',
})
export class GroupsCard {
  protected configService = inject(ConfigService);
  private confirmacao = inject(ConfirmacaoService);

  protected readonly grupos = signal<GrupoTematico[]>([]);

  /** Rascunho do grupo aberto na janela (cópia — só vale depois de salvar). */
  protected readonly rascunho = signal<GrupoTematico | null>(null);
  protected readonly novo = signal(false);
  protected readonly salvando = signal(false);
  protected readonly erro = signal<string | null>(null);

  protected readonly maxPalavras = MAX_PALAVRAS_CARD;

  /** Outro grupo já é o de sobras? Mostra no aviso da janela. */
  protected readonly coringaAtual = computed(() => {
    const r = this.rascunho();
    return this.grupos().find((g) => g.coringa && g.id !== r?.id) ?? null;
  });

  constructor() {
    effect(() => {
      const cfg = this.configService.config();
      if (!cfg) return;
      this.grupos.set(cfg.grupos.map(copiar));
    });
  }

  // ---- janela ---------------------------------------------------------------

  abrir(g: GrupoTematico): void {
    this.erro.set(null);
    this.novo.set(false);
    this.rascunho.set(copiar(g));
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

  // ---- gravação -------------------------------------------------------------

  async salvar(): Promise<void> {
    const r = this.rascunho();
    if (!r) return;

    const g: GrupoTematico = { ...r, nome: r.nome.trim(), groupName: r.groupName.trim() };
    if (!g.nome || !g.groupName) {
      this.erro.set('Preencha o apelido e o nome exato do grupo no WhatsApp.');
      return;
    }
    if (!g.coringa && !g.geral && g.palavras.length === 0) {
      this.erro.set('Adicione pelo menos uma palavra no assunto — ou marque "Recebe tudo" ou "Sobras".');
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

  private async gravar(lista: GrupoTematico[]): Promise<boolean> {
    this.erro.set(null);
    this.salvando.set(true);
    const r = await this.configService.salvar({ grupos: lista });
    this.salvando.set(false);
    if (!r.ok) {
      this.erro.set(r.erro ?? 'Erro ao salvar.');
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
