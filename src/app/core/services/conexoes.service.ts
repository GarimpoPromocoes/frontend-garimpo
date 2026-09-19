import { Injectable, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';

export type Provedor = 'mercadolivre' | 'shopee' | 'amazon';
export type StatusConexao = 'desconectado' | 'conectando' | 'conectado' | 'erro';

export interface Conexao {
  provedor: Provedor;
  status: StatusConexao;
  ultimaValidacao: string | null;
  erro: string | null;
}

export interface CampoConexao {
  nome: string;
  rotulo: string;
  tipo: 'texto' | 'segredo' | 'opcoes';
  opcoes?: string[];
}

export interface FormularioProvedor {
  provedor: Provedor;
  rotulo: string;
  campos: CampoConexao[];
}

@Injectable({ providedIn: 'root' })
export class ConexoesService {
  private http = inject(HttpClient);

  readonly conexoes = signal<Conexao[]>([]);
  readonly formularios = signal<FormularioProvedor[]>([]);

  async carregar(): Promise<void> {
    try {
      const [conexoes, formularios] = await Promise.all([
        firstValueFrom(this.http.get<Conexao[]>('/api/conexoes')),
        firstValueFrom(this.http.get<FormularioProvedor[]>('/api/conexoes/campos')),
      ]);
      this.conexoes.set(conexoes);
      this.formularios.set(formularios);
    } catch (_) {
    }
  }

  statusDe(provedor: Provedor): Conexao | null {
    return this.conexoes().find((c) => c.provedor === provedor) ?? null;
  }

  formularioDe(provedor: Provedor): FormularioProvedor | null {
    return this.formularios().find((f) => f.provedor === provedor) ?? null;
  }

  async conectar(provedor: Provedor, valores: Record<string, string>): Promise<{ ok: boolean; erro?: string }> {
    try {
      await firstValueFrom(this.http.post(`/api/conexoes/${provedor}`, valores));
      await this.carregar();
      return { ok: true };
    } catch (e: any) {
      return { ok: false, erro: e?.error?.erro || 'Não foi possível conectar — tente novamente.' };
    }
  }

  async desconectar(provedor: Provedor): Promise<void> {
    try {
      await firstValueFrom(this.http.delete(`/api/conexoes/${provedor}`));
      await this.carregar();
    } catch (_) {
    }
  }
}
