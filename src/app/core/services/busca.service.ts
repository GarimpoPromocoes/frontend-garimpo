import { Injectable, computed, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';

export type LojaBusca = 'mercadolivre' | 'amazon' | 'shopee';

/** Uma oferta da lista que a busca devolve (dados da listagem da loja). */
export interface OfertaLista {
  chave: string;
  loja: LojaBusca;
  produtoId: string | null;
  titulo: string;
  preco: number | null;
  precoDe: number | null;
  desconto: number;
  url: string;
  imagem: string | null;
  avaliacao: number | null;
  qtdAvaliacoes: number | null;
  vendidos: number | null;
  lojaOficial: boolean;
  patrocinado: boolean;
  /** Na lista: preço bem abaixo dos outros anúncios do produto — confira. */
  alerta?: string | null;
  /** Nas ignoradas: por que não parece ser o produto buscado. */
  motivo?: string | null;
}

export interface LojaConsultada {
  loja: LojaBusca;
  ok: boolean;
  motivo: string | null;
  /** Anúncios que a busca da loja devolveu. */
  encontradas: number;
  /** Desses, quantos são o produto buscado. */
  doProduto: number;
}

export interface ResultadoBusca {
  /** 2 = lista de ofertas para escolher. Buscas antigas (sem o campo) escolhiam sozinhas. */
  formato?: number;
  termo: string;
  duracaoSeg: number;
  lojas: LojaConsultada[];
  /** 'feita' ou o motivo de a revisão por IA não ter rodado. */
  revisaoIa?: string;
  ofertas: OfertaLista[];
  ignoradas?: OfertaLista[];
  ignoradasTotal?: number;
}

export interface OfertaEscolhida {
  loja: LojaBusca;
  titulo: string;
  preco: number;
  precoDe: number | null;
  desconto: number;
  precoComCupom: number | null;
  cupom: { codigo: string; descricao: string } | null;
  /** Link de afiliado (o que vai na postagem). */
  link: string;
  /** Página do produto na loja. */
  url: string;
  avaliacao: number | null;
  qtdAvaliacoes: number | null;
  vendidos: number | null;
  lojaOficial: boolean;
  foto: {
    origem: 'anuncio' | 'campanha' | 'web' | 'ajustada';
    largura: number | null;
    altura: number | null;
  };
}

/** A oferta que a pessoa escolheu e a postagem montada dela. */
export interface Selecao {
  status: 'pendente' | 'preparando' | 'pronta' | 'falhou';
  pedidaEm: string;
  oferta: OfertaLista;
  etapa: string | null;
  erro: string | null;
  avisos?: string[];
  /** A foto não está no padrão (quadrada, sem borda): só posta depois de recortar no editor. */
  precisaAjuste?: string | null;
  /** Fotos do anúncio que o editor oferece (a API busca cada uma pelo índice). */
  fotos?: { url: string; rotulo: string }[];
  /** Endereço da foto que o robô montou (pra não repetir ela na galeria do editor). */
  fotoUrl?: string | null;
  /** A foto da postagem é um recorte feito no editor. */
  fotoAjustada?: boolean;
  /** Quando a foto da postagem mudou (montagem ou recorte). */
  fotoEm?: string;
  escolhida?: OfertaEscolhida;
  /** A copy pronta, no formato do WhatsApp. */
  legenda?: string;
}

export interface GrupoPublicacao {
  id: string;
  nome: string;
  status: 'pendente' | 'enviando' | 'enviado' | 'falhou';
  motivo: string | null;
  em?: string;
}

export interface Publicacao {
  status: 'pendente' | 'publicando' | 'concluida' | 'falhou';
  pedidaEm: string;
  terminouEm?: string;
  legenda: string | null;
  grupos: GrupoPublicacao[];
}

export interface Busca {
  id: number;
  termo: string;
  status: 'pendente' | 'buscando' | 'pronta' | 'falhou';
  /** O passo que o robô está fazendo agora. */
  etapa: string | null;
  resultado: ResultadoBusca | null;
  selecao: Selecao | null;
  publicacao: Publicacao | null;
  erro: string | null;
  temFoto: boolean;
  criadoEm: string;
  atualizadoEm: string;
}

export interface BuscaRecente {
  id: number;
  termo: string;
  status: Busca['status'];
  erro: string | null;
  criadoEm: string;
  qtdOfertas: number;
  menorPreco: number | null;
  lojaEscolhida: LojaBusca | null;
  precoEscolhida: number | null;
  selecaoStatus: Selecao['status'] | null;
  publicacaoStatus: Publicacao['status'] | null;
}

const INTERVALO_MS = 1500;

/**
 * Aba "Buscar produto": o robô lista as melhores ofertas do produto nas lojas conectadas, a pessoa
 * escolhe uma e ele monta a postagem dela. O estado fica aqui (e não no componente) pra busca seguir
 * sendo acompanhada quando a pessoa troca de aba e volta.
 */
@Injectable({ providedIn: 'root' })
export class BuscaService {
  private http = inject(HttpClient);

  readonly atual = signal<Busca | null>(null);
  readonly fotoUrl = signal<string | null>(null);
  readonly recentes = signal<BuscaRecente[]>([]);
  readonly enviando = signal(false);
  readonly erro = signal<string | null>(null);
  /** A janela da postagem (prévia, editor da foto e postar nos grupos). */
  readonly postagemAberta = signal(false);

  readonly buscando = computed(() => {
    const b = this.atual();
    return !!b && (b.status === 'pendente' || b.status === 'buscando');
  });
  readonly preparando = computed(() => {
    const s = this.atual()?.selecao;
    return !!s && (s.status === 'pendente' || s.status === 'preparando');
  });
  readonly publicando = computed(() => {
    const p = this.atual()?.publicacao;
    return !!p && (p.status === 'pendente' || p.status === 'publicando');
  });
  readonly trabalhando = computed(() => this.buscando() || this.preparando() || this.publicando());

  private timer: ReturnType<typeof setTimeout> | null = null;
  /** De qual postagem montada é a foto carregada (a foto muda quando a pessoa troca de oferta). */
  private fotoDe: string | null = null;

  async buscar(termo: string): Promise<boolean> {
    return this.pedir(() => firstValueFrom(this.http.post<Busca>('/api/busca', { termo })), 'Não consegui começar a busca.');
  }

  async abrir(id: number): Promise<void> {
    this.erro.set(null);
    try {
      this.mostrar(await firstValueFrom(this.http.get<Busca>(`/api/busca/${id}`)));
    } catch (e: any) {
      this.erro.set(e?.error?.erro || 'Não consegui abrir essa busca.');
    }
  }

  /** Escolhe uma oferta da lista: o robô abre a página dela e monta a postagem — a janela já abre. */
  async selecionar(chave: string): Promise<boolean> {
    const b = this.atual();
    if (!b) return false;
    const ok = await this.pedir(
      () => firstValueFrom(this.http.post<Busca>(`/api/busca/${b.id}/selecionar`, { chave })),
      'Não consegui escolher essa oferta.',
    );
    if (ok) this.postagemAberta.set(true);
    return ok;
  }

  /** A foto que o robô montou (ponto de partida do editor). */
  carregarFotoBase(id: number): Promise<Blob> {
    return firstValueFrom(this.http.get(`/api/busca/${id}/foto?base=1`, { responseType: 'blob' }));
  }

  /** Uma foto da galeria do anúncio, pela API (o navegador só recorta imagem do mesmo endereço). */
  carregarFonte(id: number, n: number): Promise<Blob> {
    return firstValueFrom(this.http.get(`/api/busca/${id}/fonte/${n}`, { responseType: 'blob' }));
  }

  /** O recorte feito no editor vira a foto da postagem. */
  async salvarFoto(foto: Blob): Promise<boolean> {
    const b = this.atual();
    if (!b) return false;
    return this.pedir(
      () =>
        firstValueFrom(
          this.http.put<Busca>(`/api/busca/${b.id}/foto`, foto, {
            headers: { 'Content-Type': 'image/jpeg' },
          }),
        ),
      'Não consegui salvar a foto recortada.',
    );
  }

  async publicar(grupos: string[], legenda: string | null): Promise<boolean> {
    const b = this.atual();
    if (!b) return false;
    return this.pedir(
      () => firstValueFrom(this.http.post<Busca>(`/api/busca/${b.id}/publicar`, { grupos, legenda })),
      'Não consegui pedir a postagem.',
    );
  }

  async carregarRecentes(): Promise<void> {
    try {
      const r = await firstValueFrom(this.http.get<{ itens: BuscaRecente[] }>('/api/busca'));
      this.recentes.set(r.itens ?? []);
    } catch {
      // A lista de recentes é só atalho: sem ela, a aba continua funcionando.
    }
  }

  /** Volta pra tela de busca vazia (a busca continua guardada nas recentes). */
  fechar(): void {
    this.pararTimer();
    this.postagemAberta.set(false);
    this.atual.set(null);
    this.erro.set(null);
    this.trocarFoto(null, null);
  }

  private async pedir(fn: () => Promise<Busca>, falha: string): Promise<boolean> {
    this.erro.set(null);
    this.enviando.set(true);
    try {
      this.mostrar(await fn());
      return true;
    } catch (e: any) {
      this.erro.set(e?.error?.erro || falha);
      return false;
    } finally {
      this.enviando.set(false);
    }
  }

  private mostrar(b: Busca): void {
    if (this.atual()?.id !== b.id) this.postagemAberta.set(false);
    this.atual.set(b);
    this.acompanhar();
  }

  private chaveDaFoto(b: Busca): string | null {
    const s = b.selecao;
    return b.temFoto && s?.status === 'pronta' ? `${b.id}:${s.oferta.chave}:${s.pedidaEm}:${s.fotoEm ?? ''}` : null;
  }

  private acompanhar(): void {
    this.pararTimer();
    const b = this.atual();
    if (!b) return;
    const chave = this.chaveDaFoto(b);
    if (chave !== this.fotoDe) {
      if (chave) void this.carregarFoto(b.id, chave);
      else this.trocarFoto(null, null);
    }
    if (this.trabalhando()) {
      this.timer = setTimeout(() => void this.atualizar(b.id), INTERVALO_MS);
      return;
    }
    void this.carregarRecentes();
  }

  private async atualizar(id: number): Promise<void> {
    try {
      const b = await firstValueFrom(this.http.get<Busca>(`/api/busca/${id}`));
      if (this.atual()?.id !== id) return;
      this.atual.set(b);
    } catch {
      // Falha de rede passageira: tenta de novo no próximo ciclo.
    }
    if (this.atual()?.id === id) this.acompanhar();
  }

  private async carregarFoto(id: number, chave: string): Promise<void> {
    this.fotoDe = chave;
    try {
      const blob = await firstValueFrom(this.http.get(`/api/busca/${id}/foto`, { responseType: 'blob' }));
      if (this.fotoDe !== chave) return;
      this.trocarFoto(URL.createObjectURL(blob), chave);
    } catch {
      if (this.fotoDe === chave) this.fotoDe = null;
    }
  }

  private trocarFoto(url: string | null, chave: string | null): void {
    const antiga = this.fotoUrl();
    if (antiga) URL.revokeObjectURL(antiga);
    this.fotoUrl.set(url);
    this.fotoDe = chave;
  }

  private pararTimer(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }
}
