import { Injectable, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { Loja } from './ganhos.service';

export interface GrupoMembros {
  chatId: string;
  nome: string;
  total: number;
  entradas: number;
  saidas: number;
  lidoEm: string;
}

export interface MovimentoDia {
  chatId: string;
  dia: string;
  entradas: number;
  saidas: number;
  total: number | null;
}

export interface OrigemVenda {
  grupoId: string;
  grupoNome: string;
  /** null quando a venda veio com o grupo no link mas a postagem já saiu do histórico. */
  enviadoEm: string | null;
  /**
   * 'subid' = o link da venda trazia o grupo (certeza); 'id' = o mesmo anúncio foi postado no grupo;
   * 'titulo' = produto com o mesmo nome.
   */
  como: 'subid' | 'id' | 'titulo';
  espelhos: string[];
  telegram: string | null;
}

export interface Venda {
  id: number;
  loja: Loja;
  pedido: string | null;
  produtoId: string | null;
  titulo: string | null;
  quantidade: number | null;
  valor: number | null;
  comissao: number | null;
  status: string | null;
  vendidoEm: string | null;
  lidoEm: string;
  origens: OrigemVenda[];
}

export interface RankingVendas {
  grupoId: string;
  grupoNome: string;
  /** Vendas em que o grupo aparece como possível origem. */
  vendas: number;
  /** Vendas em que ele foi o único grupo que postou o produto. */
  unicas: number;
}

@Injectable({ providedIn: 'root' })
export class EstatisticasService {
  private http = inject(HttpClient);

  readonly grupos = signal<GrupoMembros[]>([]);
  readonly movimentos = signal<MovimentoDia[]>([]);
  readonly carregandoMembros = signal(false);
  readonly erroMembros = signal<string | null>(null);

  readonly vendas = signal<Venda[]>([]);
  readonly ranking = signal<RankingVendas[]>([]);
  readonly leiturasVendas = signal<{ loja: Loja; lidoEm: string }[]>([]);
  readonly carregandoVendas = signal(false);
  readonly erroVendas = signal<string | null>(null);

  async carregarMembros(dias: number): Promise<void> {
    this.carregandoMembros.set(true);
    this.erroMembros.set(null);
    try {
      const r: any = await firstValueFrom(this.http.get('/api/estatisticas/membros', { params: { dias } }));
      this.grupos.set(r.grupos ?? []);
      this.movimentos.set(r.movimentos ?? []);
    } catch (e: any) {
      this.erroMembros.set(e?.error?.erro || 'Não consegui carregar os membros dos grupos.');
    } finally {
      this.carregandoMembros.set(false);
    }
  }

  async carregarVendas(dias: number): Promise<void> {
    this.carregandoVendas.set(true);
    this.erroVendas.set(null);
    try {
      const r: any = await firstValueFrom(this.http.get('/api/estatisticas/vendas', { params: { dias } }));
      this.vendas.set(r.vendas ?? []);
      this.ranking.set(r.ranking ?? []);
      this.leiturasVendas.set(r.leituras ?? []);
    } catch (e: any) {
      this.erroVendas.set(e?.error?.erro || 'Não consegui carregar as vendas.');
    } finally {
      this.carregandoVendas.set(false);
    }
  }
}
