import { Component, HostListener, OnDestroy, OnInit, computed, effect, inject, signal } from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { BuscaService, GrupoPublicacao, LojaBusca, OfertaLista } from '../../../core/services/busca.service';
import { ConfigService } from '../../../core/services/config.service';
import { RunControlService } from '../../../core/services/run-control.service';
import { FonteFoto, FotoEditor } from './foto-editor/foto-editor';
import { Info } from '../../../shared/info/info';

const NOME_LOJA: Record<string, string> = {
  mercadolivre: 'Mercado Livre',
  amazon: 'Amazon',
  shopee: 'Shopee',
};

const LOGO_LOJA: Record<string, string> = {
  mercadolivre: 'lojas/mercadolivre.svg',
  amazon: 'lojas/amazon.svg',
  shopee: 'lojas/shopee.svg',
};

const ORIGEM_FOTO: Record<string, string> = {
  anuncio: 'a do anúncio',
  campanha: 'foto de campanha da galeria do anúncio',
  web: 'versão maior da mesma foto, achada na web',
  ajustada: 'recortada por você no editor',
};

function escapar(texto: string): string {
  return texto.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/** A copy como o WhatsApp mostra: *negrito*, _itálico_, ~riscado~, `código` e link clicável. */
export function formatarWhatsapp(texto: string): string {
  const antes = '(^|[\\s(>_*~])';
  const depois = '(?=$|[\\s).,!?:;<_*~])';
  let h = escapar(texto);
  h = h.replace(/`([^`\n]+)`/g, '<code>$1</code>');
  h = h.replace(new RegExp(`${antes}\\*([^*\\n]+)\\*${depois}`, 'gm'), '$1<strong>$2</strong>');
  h = h.replace(new RegExp(`${antes}_([^_\\n]+)_${depois}`, 'gm'), '$1<em>$2</em>');
  h = h.replace(new RegExp(`${antes}~([^~\\n]+)~${depois}`, 'gm'), '$1<s>$2</s>');
  h = h.replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1" target="_blank" rel="noopener">$1</a>');
  return h.replace(/\n/g, '<br>');
}

@Component({
  selector: 'app-busca-card',
  standalone: true,
  imports: [Info, FormsModule, NgTemplateOutlet, FotoEditor],
  templateUrl: './busca-card.html',
  styleUrl: './busca-card.scss',
})
export class BuscaCard implements OnInit, OnDestroy {
  protected busca = inject(BuscaService);
  private configService = inject(ConfigService);
  private runControl = inject(RunControlService);

  protected termo = '';
  protected readonly grupos = computed(() => this.configService.config()?.grupos ?? []);
  protected readonly lojas = computed(() => this.runControl.lojasConectadas() as LojaBusca[]);

  protected readonly resultado = computed(() => this.busca.atual()?.resultado ?? null);
  /** Busca de antes da lista de ofertas (o robô escolhia sozinho): só dá pra buscar de novo. */
  protected readonly formatoAntigo = computed(() => {
    const r = this.resultado();
    return !!r && r.formato !== 2;
  });
  protected readonly selecao = computed(() => this.busca.atual()?.selecao ?? null);
  protected readonly escolhida = computed(() => {
    const s = this.selecao();
    return s?.status === 'pronta' ? (s.escolhida ?? null) : null;
  });

  /** Texto editado pela pessoa (null = a copy que o robô montou). */
  protected readonly textoEditado = signal<string | null>(null);
  protected readonly editandoTexto = signal(false);
  /** O editor de foto aberto na janela da postagem (no lugar da prévia). */
  protected readonly editandoFoto = signal(false);
  protected readonly copiado = signal(false);
  protected readonly comecando = signal(false);
  protected readonly selecionados = signal<Set<string>>(new Set());
  protected readonly agora = signal(Date.now());
  protected readonly verIgnoradas = signal(false);

  protected readonly legenda = computed(() => this.textoEditado() ?? this.selecao()?.legenda ?? '');
  protected readonly legendaHtml = computed(() => formatarWhatsapp(this.legenda()));

  protected readonly todosMarcados = computed(
    () => this.grupos().length > 0 && this.grupos().every((g) => this.selecionados().has(g.id)),
  );
  protected readonly podePostar = computed(
    () =>
      !!this.escolhida() &&
      !this.selecao()?.precisaAjuste &&
      !this.editandoFoto() &&
      this.selecionados().size > 0 &&
      !this.busca.trabalhando() &&
      !this.busca.enviando(),
  );
  protected readonly gruposDaPostagem = computed<GrupoPublicacao[]>(() => this.busca.atual()?.publicacao?.grupos ?? []);

  /**
   * O que o editor oferece: a foto que o robô montou e as fotos da galeria do anúncio (sem repetir a
   * montada). Tudo pela API — o navegador só recorta imagem do mesmo endereço do painel.
   */
  protected readonly fontesFoto = computed<FonteFoto[]>(() => {
    const b = this.busca.atual();
    const s = b?.selecao;
    if (!b || s?.status !== 'pronta') return [];
    const fontes: FonteFoto[] = [
      {
        rotulo: s.escolhida?.foto.origem === 'anuncio' || s.escolhida?.foto.origem === 'ajustada' ? 'Foto do anúncio' : 'Foto escolhida pelo robô',
        carregar: () => this.busca.carregarFotoBase(b.id),
      },
    ];
    (s.fotos ?? []).forEach((f, n) => {
      if (f.url !== s.fotoUrl) fontes.push({ rotulo: f.rotulo, carregar: () => this.busca.carregarFonte(b.id, n) });
    });
    return fontes;
  });

  private relogio: ReturnType<typeof setInterval> | null = null;
  private postagemMostrada: string | null = null;
  private ultimaPronta: string | null = null;

  constructor() {
    // Outra postagem na tela (outra busca ou outra oferta): o texto editado era da anterior.
    effect(() => {
      const b = this.busca.atual();
      const s = b?.selecao;
      const chave = b ? `${b.id}:${s?.oferta?.chave ?? ''}:${s?.pedidaEm ?? ''}` : null;
      if (chave === this.postagemMostrada) return;
      const outraBusca = !this.postagemMostrada || !chave || this.postagemMostrada.split(':')[0] !== chave.split(':')[0];
      this.postagemMostrada = chave;
      this.textoEditado.set(null);
      this.editandoTexto.set(false);
      this.editandoFoto.set(false);
      if (outraBusca) {
        this.selecionados.set(new Set());
        this.verIgnoradas.set(false);
      }
    });

    // Postagem acabou de ficar pronta com a foto fora do quadrado: a janela já abre no editor.
    effect(() => {
      const b = this.busca.atual();
      const s = b?.selecao;
      if (!b || s?.status !== 'pronta') return;
      const chave = `${b.id}:${s.oferta.chave}:${s.pedidaEm}`;
      if (chave === this.ultimaPronta) return;
      this.ultimaPronta = chave;
      if (s.precisaAjuste) this.editandoFoto.set(true);
    });
  }

  async ngOnInit(): Promise<void> {
    this.relogio = setInterval(() => this.agora.set(Date.now()), 1000);
    await this.busca.carregarRecentes();
    // Voltou pra aba (ou recarregou a página) com algo rodando: retoma o acompanhamento.
    if (!this.busca.atual()) {
      const r = this.busca.recentes()[0];
      const rodando =
        r &&
        (r.status === 'pendente' ||
          r.status === 'buscando' ||
          r.selecaoStatus === 'pendente' ||
          r.selecaoStatus === 'preparando' ||
          r.publicacaoStatus === 'pendente' ||
          r.publicacaoStatus === 'publicando');
      if (rodando) await this.busca.abrir(r.id);
    }
  }

  ngOnDestroy(): void {
    if (this.relogio) clearInterval(this.relogio);
  }

  protected podeBuscar(): boolean {
    return this.termo.trim().length >= 3 && !this.busca.trabalhando() && !this.busca.enviando() && this.lojas().length > 0;
  }

  protected async buscar(ev?: Event): Promise<void> {
    ev?.preventDefault();
    if (!this.podeBuscar()) return;
    await this.comecar(this.termo.trim());
  }

  protected async buscarDeNovo(termo: string): Promise<void> {
    this.termo = termo;
    await this.comecar(termo);
  }

  private async comecar(termo: string): Promise<void> {
    this.comecando.set(true);
    try {
      await this.busca.buscar(termo);
    } finally {
      this.comecando.set(false);
    }
  }

  protected novaBusca(): void {
    this.busca.fechar();
  }

  protected podeEscolher(): boolean {
    return !this.busca.trabalhando() && !this.busca.enviando();
  }

  protected ehEscolhida(o: OfertaLista): boolean {
    return this.selecao()?.oferta?.chave === o.chave;
  }

  /** Escolher abre a janela da postagem (o robô monta enquanto ela mostra o andamento). */
  protected async escolher(o: OfertaLista): Promise<void> {
    if (!this.podeEscolher()) return;
    await this.busca.selecionar(o.chave);
  }

  @HostListener('document:keydown.escape')
  protected fecharPostagem(): void {
    if (!this.busca.postagemAberta()) return;
    this.busca.postagemAberta.set(false);
    this.editandoFoto.set(false);
    this.busca.erro.set(null);
  }

  protected editarFoto(): void {
    this.editandoTexto.set(false);
    this.editandoFoto.set(true);
  }

  protected cancelarEdicaoFoto(): void {
    this.editandoFoto.set(false);
  }

  protected async salvarRecorte(foto: Blob): Promise<void> {
    if (await this.busca.salvarFoto(foto)) this.editandoFoto.set(false);
  }

  protected nomeLoja(loja: string | null | undefined): string {
    return loja ? (NOME_LOJA[loja] ?? loja) : '';
  }

  protected logo(loja: string | null | undefined): string {
    return loja ? (LOGO_LOJA[loja] ?? '') : '';
  }

  protected preco(v: number | null | undefined): string {
    if (v == null) return '—';
    return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  }

  protected numero(v: number | null | undefined): string {
    if (v == null) return '—';
    if (v >= 1000) return `${(v / 1000).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} mil`;
    return v.toLocaleString('pt-BR');
  }

  protected quando(iso: string): string {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '';
    const hoje = new Date();
    const mesmoDia = d.toDateString() === hoje.toDateString();
    const hora = d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    return mesmoDia ? `hoje, ${hora}` : `${d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })}, ${hora}`;
  }

  protected decorrido(iso: string | null | undefined): string {
    if (!iso) return '';
    const s = Math.max(0, Math.round((this.agora() - new Date(iso).getTime()) / 1000));
    return s < 60 ? `${s} s` : `${Math.floor(s / 60)} min ${String(s % 60).padStart(2, '0')} s`;
  }

  protected origemFoto(origem: string): string {
    return ORIGEM_FOTO[origem] ?? origem;
  }

  protected esconderImagem(ev: Event): void {
    (ev.target as HTMLElement).style.visibility = 'hidden';
  }

  protected alternarEdicao(): void {
    if (!this.editandoTexto() && this.textoEditado() == null) this.textoEditado.set(this.selecao()?.legenda ?? '');
    this.editandoTexto.update((v) => !v);
  }

  protected desfazerEdicao(): void {
    this.textoEditado.set(null);
    this.editandoTexto.set(false);
  }

  protected async copiar(): Promise<void> {
    try {
      await navigator.clipboard.writeText(this.legenda());
      this.copiado.set(true);
      setTimeout(() => this.copiado.set(false), 2000);
    } catch {
      this.copiado.set(false);
    }
  }

  protected nomeArquivo(): string {
    const termo = (this.busca.atual()?.termo ?? 'produto').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    return `${termo || 'produto'}.jpg`;
  }

  protected marcar(id: string, marcado: boolean): void {
    this.selecionados.update((atual) => {
      const novo = new Set(atual);
      if (marcado) novo.add(id);
      else novo.delete(id);
      return novo;
    });
  }

  protected marcarTodos(marcado: boolean): void {
    this.selecionados.set(marcado ? new Set(this.grupos().map((g) => g.id)) : new Set());
  }

  protected async postar(): Promise<void> {
    if (!this.podePostar()) return;
    const ok = await this.busca.publicar([...this.selecionados()], this.textoEditado());
    if (ok) this.editandoTexto.set(false);
  }

  protected statusDoGrupo(id: string): GrupoPublicacao | null {
    return this.gruposDaPostagem().find((g) => g.id === id) ?? null;
  }
}
