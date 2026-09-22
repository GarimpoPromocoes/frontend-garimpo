import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ProdutosService, OrdemProduto, SituacaoProduto } from '../../../core/services/produtos.service';
import { ConfigService } from '../../../core/services/config.service';

const NOME_LOJA: Record<string, string> = {
  mercadolivre: 'Mercado Livre',
  amazon: 'Amazon',
  shopee: 'Shopee',
};

@Component({
  selector: 'app-produtos-card',
  standalone: true,
  imports: [FormsModule],
  templateUrl: './produtos-card.html',
})
export class ProdutosCard implements OnInit {
  protected produtos = inject(ProdutosService);
  private configService = inject(ConfigService);
  protected readonly grupos = computed(() => this.configService.config()?.grupos ?? []);
  protected readonly removendo = signal<number | null>(null);
  protected readonly erroAcao = signal<string | null>(null);

  protected readonly paginas = computed(() =>
    Math.max(1, Math.ceil(this.produtos.total() / this.produtos.porPagina))
  );
  protected readonly naFila = computed(() => this.produtos.total() - this.produtos.postados());

  ngOnInit(): void {
    void this.produtos.carregar();
  }

  protected nomeLoja(loja: string): string {
    return NOME_LOJA[loja] ?? loja;
  }

  protected preco(v: number | null): string {
    if (v == null) return '—';
    return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  }

  protected quando(iso: string | null): string {
    if (!iso) return '—';
    const d = new Date(iso);
    return Number.isNaN(d.getTime()) ? '—' : d.toLocaleDateString('pt-BR');
  }

  protected buscar(q: string): void {
    this.produtos.atualizarFiltro({ q });
  }
  protected mudarLoja(loja: string): void {
    this.produtos.atualizarFiltro({ loja });
  }
  protected mudarGrupo(grupo: string): void {
    this.produtos.atualizarFiltro({ grupo });
  }
  protected mudarSituacao(situacao: string): void {
    this.produtos.atualizarFiltro({ situacao: situacao as SituacaoProduto });
  }
  protected mudarOrdem(ordem: string): void {
    this.produtos.atualizarFiltro({ ordem: ordem as OrdemProduto });
  }
  protected irParaPagina(p: number): void {
    if (p < 1 || p > this.paginas()) return;
    this.produtos.atualizarFiltro({ pagina: p });
  }

  protected async remover(id: number, titulo: string): Promise<void> {
    if (!window.confirm(`Tirar "${titulo.slice(0, 60)}" do catálogo? O robô não vai mais postar este item.`)) {
      return;
    }
    this.erroAcao.set(null);
    this.removendo.set(id);
    const r = await this.produtos.remover(id);
    this.removendo.set(null);
    if (!r.ok) this.erroAcao.set(r.erro ?? null);
  }
}
