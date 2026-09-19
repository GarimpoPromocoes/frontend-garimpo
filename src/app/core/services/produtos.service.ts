import { Injectable, inject, signal } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';

export interface Produto {
  id: number;
  produtoId: string;
  titulo: string;
  precoDe: number | null;
  precoPor: number | null;
  desconto: number;
  vendidos: number | null;
  categoria: string;
  link: string;
  loja: string;
  origem: string;
  data: string | null;
  criadoEm: string;
  postado: boolean;
}

export type OrdemProduto = 'recentes' | 'desconto' | 'baratos' | 'caros' | 'vendidos';
export type SituacaoProduto = 'todos' | 'fila' | 'postado';

export interface FiltroProdutos {
  q: string;
  loja: string;
  situacao: SituacaoProduto;
  ordem: OrdemProduto;
  pagina: number;
}

const POR_PAGINA = 25;

@Injectable({ providedIn: 'root' })
export class ProdutosService {
  private http = inject(HttpClient);

  readonly itens = signal<Produto[]>([]);
  readonly total = signal(0);
  readonly postados = signal(0);
  readonly carregando = signal(false);
  readonly erro = signal<string | null>(null);

  readonly filtro = signal<FiltroProdutos>({
    q: '',
    loja: 'todas',
    situacao: 'todos',
    ordem: 'recentes',
    pagina: 1,
  });

  readonly porPagina = POR_PAGINA;

  private requisicao = 0;

  async carregar(): Promise<void> {
    const f = this.filtro();
    const meu = ++this.requisicao;
    this.carregando.set(true);
    this.erro.set(null);

    let params = new HttpParams()
      .set('pagina', String(f.pagina))
      .set('porPagina', String(POR_PAGINA))
      .set('ordem', f.ordem);
    if (f.q.trim()) params = params.set('q', f.q.trim());
    if (f.loja !== 'todas') params = params.set('loja', f.loja);
    if (f.situacao !== 'todos') params = params.set('situacao', f.situacao);

    try {
      const r: any = await firstValueFrom(this.http.get('/api/produtos', { params }));
      if (meu !== this.requisicao) return;
      this.itens.set(r.itens ?? []);
      this.total.set(r.total ?? 0);
      this.postados.set(r.postados ?? 0);
    } catch (e: any) {
      if (meu !== this.requisicao) return;
      this.erro.set(e?.error?.erro || 'Não consegui carregar os produtos.');
    } finally {
      if (meu === this.requisicao) this.carregando.set(false);
    }
  }

  atualizarFiltro(mudanca: Partial<FiltroProdutos>): void {
    const voltaPagina = 'pagina' in mudanca ? {} : { pagina: 1 };
    this.filtro.update((f) => ({ ...f, ...mudanca, ...voltaPagina }));
    void this.carregar();
  }

  async remover(id: number): Promise<{ ok: boolean; erro?: string }> {
    try {
      await firstValueFrom(this.http.delete(`/api/produtos/${id}`));
      await this.carregar();
      return { ok: true };
    } catch (e: any) {
      return { ok: false, erro: e?.error?.erro || 'Não consegui remover esse produto.' };
    }
  }
}
