import { Injectable, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';

export interface Cliente {
  id: number;
  email: string;
  nome: string | null;
  admin: boolean;
  ativo: boolean;
  criadoEm: string;
  produtos: number;
  postagens: number;
  ultimaPostagem: string | null;
  lojasConectadas: number;
}

@Injectable({ providedIn: 'root' })
export class AdminService {
  private http = inject(HttpClient);

  readonly clientes = signal<Cliente[]>([]);
  readonly carregando = signal(false);
  readonly erro = signal<string | null>(null);

  async carregar(): Promise<void> {
    this.carregando.set(true);
    this.erro.set(null);
    try {
      const r: any = await firstValueFrom(this.http.get('/api/admin/clientes'));
      this.clientes.set(r.clientes ?? []);
    } catch (e: any) {
      this.erro.set(e?.error?.erro || 'Não consegui carregar os clientes.');
    } finally {
      this.carregando.set(false);
    }
  }

  async definirAtivo(id: number, ativo: boolean): Promise<{ ok: boolean; erro?: string }> {
    try {
      await firstValueFrom(this.http.post(`/api/admin/clientes/${id}/ativo`, { ativo }));
      this.clientes.update((lista) => lista.map((c) => (c.id === id ? { ...c, ativo } : c)));
      return { ok: true };
    } catch (e: any) {
      return { ok: false, erro: e?.error?.erro || 'Não consegui alterar essa conta.' };
    }
  }
}
