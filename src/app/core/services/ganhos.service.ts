import { Injectable, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';

export type Loja = 'mercadolivre' | 'amazon' | 'shopee';

export interface GanhoMes {
  loja: Loja;
  mes: string;
  estimado: number | null;
  pendente: number | null;
  confirmado: number | null;
  pago: number | null;
  lidoEm: string;
}

export interface LeituraGanhos {
  loja: Loja;
  ok: boolean | null;
  erro: string | null;
  lidoEm: string | null;
  pedidoEm: string | null;
}

export type ModoAtualizacao = 'robo-ligado' | 'leitura-avulsa' | 'na-fila';

@Injectable({ providedIn: 'root' })
export class GanhosService {
  private http = inject(HttpClient);

  readonly meses = signal<GanhoMes[]>([]);
  readonly leituras = signal<LeituraGanhos[]>([]);
  readonly lendoAgora = signal(false);
  readonly carregando = signal(false);
  readonly erro = signal<string | null>(null);

  async carregar(): Promise<void> {
    this.carregando.set(true);
    this.erro.set(null);
    try {
      const r: any = await firstValueFrom(this.http.get('/api/ganhos'));
      this.meses.set(r.meses ?? []);
      this.leituras.set(r.leituras ?? []);
      this.lendoAgora.set(!!r.lendoAgora);
    } catch (e: any) {
      this.erro.set(e?.error?.erro || 'Não consegui carregar os ganhos.');
    } finally {
      this.carregando.set(false);
    }
  }

  async atualizar(): Promise<{ ok: boolean; modo?: ModoAtualizacao; erro?: string }> {
    try {
      const r: any = await firstValueFrom(this.http.post('/api/ganhos/atualizar', {}));
      await this.carregar();
      return { ok: true, modo: r.modo };
    } catch (e: any) {
      return { ok: false, erro: e?.error?.erro || 'Não consegui pedir a atualização.' };
    }
  }
}
