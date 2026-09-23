import { Injectable, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';

export type Provedor = 'mercadolivre' | 'shopee' | 'amazon';
export type StatusConexao = 'desconectado' | 'conectando' | 'conectado' | 'erro';

export interface LoginGuardado {
  /** true quando a senha da plataforma esta guardada e o robo pode reconectar sozinho. */
  salvo: boolean;
  status: 'conectado' | 'erro' | 'expirado' | null;
  erro: string | null;
  ultimoLogin: string | null;
}

export interface Conexao {
  provedor: Provedor;
  status: StatusConexao;
  ultimaValidacao: string | null;
  erro: string | null;
  login: LoginGuardado;
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
  /** Falha ao carregar: sem isso um erro da API apagaria os cards em silêncio. */
  readonly erro = signal<string | null>(null);
  readonly carregando = signal(false);

  async carregar(): Promise<void> {
    this.carregando.set(true);
    try {
      const [conexoes, formularios] = await Promise.all([
        firstValueFrom(this.http.get<Conexao[]>('/api/conexoes')),
        firstValueFrom(this.http.get<FormularioProvedor[]>('/api/conexoes/campos')),
      ]);
      this.conexoes.set(conexoes);
      this.formularios.set(formularios);
      this.erro.set(null);
    } catch (e: any) {
      this.erro.set(e?.error?.erro || 'Não consegui carregar suas conexões agora.');
    } finally {
      this.carregando.set(false);
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

  /** Apaga a senha guardada: o robo para de reconectar sozinho nesta loja. */
  async esquecerLogin(provedor: Provedor): Promise<void> {
    try {
      await firstValueFrom(this.http.delete(`/api/conexoes/${provedor}/login`));
      await this.carregar();
    } catch (_) {
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
