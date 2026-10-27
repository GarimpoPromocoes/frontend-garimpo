import { Injectable, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';

/** Status de cada produto na lista de um grupo (api-bot/src/modules/filas). */
export type StatusFila = 'fila' | 'pronto' | 'espera' | 'postado' | 'recusado' | 'vencido';

export type ContagemFila = Record<StatusFila, number>;

export interface ResumoFila {
  id: string;
  nome: string;
  fonte: 'clonagem' | 'garimpo';
  origens: string[];
  contagens: ContagemFila;
  maisAntigoNaFila: string | null;
  ultimaPostagemEm: string | null;
  /** Mensagens que de fato saíram no grupo (postagens_grupo), hoje e desde sempre. */
  postadosHoje: number;
  postadosTotal: number;
  filaLidaEm: string | null;
}

export interface ItemFila {
  chave: string;
  titulo: string;
  loja: string;
  /** Grupo do concorrente (clonagem) ou de onde veio no garimpo ("busca: x", "ofertas: ML"). */
  origem: string;
  postadoNaOrigemEm: string | null;
  status: StatusFila;
  motivo: string | null;
  aviso: string | null;
  avisoAte: string | null;
  atualizadoEm: string | null;
  link: string | null;
  precoPor: number | null;
  posicao: number | null;
}

export interface FilaDoGrupo {
  grupo: ResumoFila;
  itens: ItemFila[];
  total: number;
  /** A aba que veio: 'todos' ou um status. */
  status?: StatusFila | 'todos';
}

@Injectable({ providedIn: 'root' })
export class FilasService {
  private http = inject(HttpClient);

  readonly resumo = signal<ResumoFila[]>([]);
  readonly erroResumo = signal<string | null>(null);

  async carregarResumo(): Promise<void> {
    try {
      const r = await firstValueFrom(this.http.get<{ grupos: ResumoFila[] }>('/api/filas'));
      this.resumo.set(r.grupos ?? []);
      this.erroResumo.set(null);
    } catch (e: any) {
      this.erroResumo.set(e?.error?.erro || 'Não consegui carregar as listas dos grupos.');
    }
  }

  /** A lista do grupo já filtrada pela aba (a api filtra antes do corte de 400 itens). */
  async doGrupo(id: string, status: StatusFila | 'todos' = 'todos'): Promise<FilaDoGrupo> {
    return firstValueFrom(
      this.http.get<FilaDoGrupo>(`/api/filas/${encodeURIComponent(id)}`, { params: { status } }),
    );
  }
}
