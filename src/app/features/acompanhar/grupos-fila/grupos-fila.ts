import { Component, DestroyRef, HostListener, computed, effect, inject, input, signal } from '@angular/core';
import { FilaDoGrupo, FilasService, ItemFila, ResumoFila, StatusFila } from '../../../core/services/filas.service';
import { RunControlService } from '../../../core/services/run-control.service';
import { StatusService } from '../../../core/services/status.service';
import { JobsService } from '../../../core/services/jobs.service';

type Filtro = 'todos' | StatusFila;

const NOME_LOJA: Record<string, string> = { mercadolivre: 'Mercado Livre', amazon: 'Amazon', shopee: 'Shopee', nike: 'Nike', adidas: 'Adidas', centauro: 'Centauro' };
const RESUMO_A_CADA_MS = 20000;
const LISTA_A_CADA_MS = 10000;

const STATUS: Record<StatusFila, { rotulo: string; tom: string }> = {
  fila: { rotulo: 'Na fila', tom: 'espera' },
  pronto: { rotulo: 'Pronto', tom: 'achado' },
  espera: { rotulo: 'Em espera', tom: 'espera' },
  postado: { rotulo: 'Postado', tom: 'ok' },
  recusado: { rotulo: 'Recusado', tom: 'erro' },
  vencido: { rotulo: 'Vencido', tom: 'neutro' },
};

const FILTROS: { id: Filtro; rotulo: string }[] = [
  { id: 'todos', rotulo: 'Todos' },
  { id: 'fila', rotulo: 'Na fila' },
  { id: 'pronto', rotulo: 'Prontos' },
  { id: 'espera', rotulo: 'Em espera' },
  { id: 'postado', rotulo: 'Postados' },
  { id: 'recusado', rotulo: 'Recusados' },
  { id: 'vencido', rotulo: 'Vencidos' },
];

function hora(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  const hoje = new Date().toDateString() === d.toDateString();
  return hoje
    ? d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
    : d.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
}

/**
 * Os grupos marcados para postar, cada um num cartão com o tamanho da lista dele. Clicar abre a
 * lista do grupo: a fila na ordem em que vai sair e o que já aconteceu com cada produto (postado,
 * recusado e por quê, em espera, vencido).
 */
@Component({
  selector: 'app-grupos-fila',
  standalone: true,
  templateUrl: './grupos-fila.html',
})
export class GruposFila {
  /** Nome do grupo da rodada atual (destaca o cartão dele). */
  grupoDaVez = input<string | null>(null);

  private filas = inject(FilasService);
  private runControl = inject(RunControlService);
  private statusService = inject(StatusService);
  private jobs = inject(JobsService);

  protected readonly filtros = FILTROS;
  protected readonly aberto = signal<string | null>(null);
  protected readonly lista = signal<FilaDoGrupo | null>(null);
  protected readonly carregandoLista = signal(false);
  protected readonly erroLista = signal<string | null>(null);
  protected readonly filtro = signal<Filtro>('todos');

  constructor() {
    void this.filas.carregarResumo();
    const visivel = () => document.visibilityState === 'visible';
    const resumo = setInterval(() => visivel() && void this.filas.carregarResumo(), RESUMO_A_CADA_MS);
    const lista = setInterval(() => visivel() && this.aberto() && void this.recarregarLista(), LISTA_A_CADA_MS);
    inject(DestroyRef).onDestroy(() => {
      clearInterval(resumo);
      clearInterval(lista);
    });
    // Saiu uma postagem: os cartões (postados, último post) e a lista aberta atualizam na hora.
    let concluidos: number | null = null;
    effect(() => {
      const n = this.jobs.painel()?.hoje?.concluidos ?? null;
      if (concluidos !== null && n !== null && n !== concluidos) {
        void this.filas.carregarResumo();
        if (this.aberto()) void this.recarregarLista();
      }
      concluidos = n;
    });
  }

  @HostListener('document:keydown.escape')
  protected fecharComEsc(): void {
    this.fechar();
  }

  /** Os mesmos grupos que o robô usa: os escolhidos ao ligar, ou todos. */
  private readonly idsAlvo = computed(() => {
    const todos = this.runControl.grupos();
    const manual = this.statusService.status()?.agendamento?.manual;
    const ligado = this.runControl.algoRodando();
    const alvo = ligado ? manual?.alvo : this.runControl.alvo();
    if (alvo !== 'selecionados') return todos.map((g) => g.id);
    const ids = new Set(ligado ? manual?.ids ?? [] : [...this.runControl.selecionados()]);
    return todos.filter((g) => ids.has(g.id)).map((g) => g.id);
  });

  protected readonly cartoes = computed(() => {
    const porId = new Map(this.filas.resumo().map((r) => [r.id, r]));
    return this.idsAlvo()
      .map((id) => porId.get(id))
      .filter((r): r is ResumoFila => !!r);
  });

  protected readonly erroResumo = this.filas.erroResumo;

  /** A lista já vem filtrada da api; o filtro aqui só garante que nada de outra aba apareça. */
  protected readonly itensVisiveis = computed<ItemFila[]>(() => {
    const l = this.lista();
    if (!l) return [];
    const f = this.filtro();
    return f === 'todos' ? l.itens : l.itens.filter((it) => it.status === f);
  });

  /** Aba trocada e a lista dela ainda não chegou. */
  protected readonly trocandoAba = signal(false);

  protected fonteTexto(g: ResumoFila): string {
    if (g.fonte === 'garimpo') return 'Garimpo nas lojas';
    if (!g.origens.length) return 'Clonagem de todos os grupos';
    const nomes = g.origens.slice(0, 2).join(', ');
    return `Clonagem de ${nomes}${g.origens.length > 2 ? ` e mais ${g.origens.length - 2}` : ''}`;
  }

  protected ehDaVez(g: ResumoFila): boolean {
    return !!this.grupoDaVez() && this.grupoDaVez() === g.nome;
  }

  protected contagem(id: Filtro): number {
    const c = this.lista()?.grupo.contagens;
    if (!c) return 0;
    if (id === 'todos') return Object.values(c).reduce((soma, n) => soma + (n ?? 0), 0);
    return c[id] ?? 0;
  }

  /** Postados, recusados e vencidos ficam 3 dias na lista (como na fila do robô). */
  protected ehDosUltimosDias(): boolean {
    return ['postado', 'recusado', 'vencido'].includes(this.filtro());
  }

  async escolherFiltro(f: Filtro): Promise<void> {
    if (f === this.filtro()) return;
    this.filtro.set(f);
    this.trocandoAba.set(true);
    await this.recarregarLista();
    if (this.filtro() === f) this.trocandoAba.set(false);
  }

  protected status(it: ItemFila) {
    return STATUS[it.status];
  }

  protected loja(it: ItemFila): string {
    return NOME_LOJA[it.loja] ?? it.loja;
  }

  protected logo(it: ItemFila): string {
    return `lojas/${NOME_LOJA[it.loja] ? it.loja : 'mercadolivre'}.svg`;
  }

  protected preco(v: number | null): string {
    return v == null ? '' : v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  }

  protected detalhe(it: ItemFila): string {
    switch (it.status) {
      case 'postado':
        return it.atualizadoEm ? `Postado às ${hora(it.atualizadoEm)}` : 'Postado';
      case 'recusado':
        return it.motivo ? `Motivo: ${it.motivo}` : 'Recusado';
      case 'espera':
        return `${it.aviso ?? 'Recusado há pouco'}${it.avisoAte ? ` — tento de novo às ${hora(it.avisoAte)}` : ''}`;
      case 'vencido':
        return it.motivo ?? 'Ficou tempo demais na fila';
      case 'pronto':
        return 'Link de afiliado gerado — sai na próxima vez do grupo';
      default:
        return it.posicao ? `${it.posicao}º da fila` : 'Esperando a vez';
    }
  }

  protected origemTexto(it: ItemFila): string {
    if (!it.origem) return '';
    const quando = it.postadoNaOrigemEm ? ` às ${hora(it.postadoNaOrigemEm)}` : '';
    if (it.postadoNaOrigemEm) return `Postado em "${it.origem}"${quando}`;
    const busca = it.origem.match(/^busca:\s*(.+)$/);
    if (busca) return `Garimpado na busca "${busca[1]}"`;
    if (/ofertas/.test(it.origem)) return 'Garimpado na página de ofertas';
    const grupo = it.origem.match(/^garimpo:\s*(.+)$/);
    return grupo ? `Clonado de "${grupo[1]}"` : it.origem;
  }

  protected numero(n: number | null | undefined): string {
    return (n ?? 0).toLocaleString('pt-BR');
  }

  protected horaDe(iso: string | null): string {
    return hora(iso);
  }

  async abrir(g: ResumoFila): Promise<void> {
    this.aberto.set(g.id);
    this.filtro.set('todos');
    this.lista.set(null);
    this.carregandoLista.set(true);
    await this.recarregarLista();
    this.carregandoLista.set(false);
  }

  fechar(): void {
    this.aberto.set(null);
    this.lista.set(null);
    this.trocandoAba.set(false);
  }

  private async recarregarLista(): Promise<void> {
    const id = this.aberto();
    const filtro = this.filtro();
    if (!id) return;
    // Resposta que chega depois de trocar de grupo ou de aba é descartada.
    const valeAinda = () => this.aberto() === id && this.filtro() === filtro;
    try {
      const r = await this.filas.doGrupo(id, filtro);
      if (valeAinda()) {
        this.lista.set(r);
        this.erroLista.set(null);
      }
    } catch (e: any) {
      if (valeAinda()) this.erroLista.set(e?.error?.erro || 'Não consegui carregar a lista deste grupo.');
    }
  }
}
