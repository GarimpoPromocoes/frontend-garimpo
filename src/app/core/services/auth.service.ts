import { Injectable, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';

export interface UsuarioLogado {
  id: number;
  email: string;
  nome?: string | null;
  admin?: boolean;
}

const CHAVE_TOKEN = 'promobot:token';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private http = inject(HttpClient);

  readonly usuario = signal<UsuarioLogado | null>(null);
  readonly verificandoSessao = signal(true);
  readonly enviando = signal(false);
  readonly erro = signal<string | null>(null);

  obterToken(): string | null {
    try {
      return localStorage.getItem(CHAVE_TOKEN);
    } catch (_) {
      return null;
    }
  }

  private salvarToken(token: string): void {
    try {
      localStorage.setItem(CHAVE_TOKEN, token);
    } catch (_) {
    }
  }

  private limparToken(): void {
    try {
      localStorage.removeItem(CHAVE_TOKEN);
    } catch (_) {}
  }

  async restaurarSessao(): Promise<void> {
    if (!this.obterToken()) {
      this.verificandoSessao.set(false);
      return;
    }
    try {
      const resp = await firstValueFrom(this.http.get<{ usuario: UsuarioLogado }>('/api/auth/eu'));
      this.usuario.set(resp.usuario);
    } catch (_) {
      this.limparToken();
      this.usuario.set(null);
    } finally {
      this.verificandoSessao.set(false);
    }
  }

  async login(email: string, senha: string): Promise<boolean> {
    return this.autenticar('/api/auth/login', email, senha);
  }

  async registrar(email: string, senha: string): Promise<boolean> {
    return this.autenticar('/api/auth/registrar', email, senha);
  }

  private async autenticar(caminho: string, email: string, senha: string): Promise<boolean> {
    this.enviando.set(true);
    this.erro.set(null);
    try {
      const resp = await firstValueFrom(
        this.http.post<{ token: string; usuario: UsuarioLogado }>(caminho, { email, senha })
      );
      this.salvarToken(resp.token);
      this.usuario.set(resp.usuario);
      return true;
    } catch (e: any) {
      this.erro.set(e?.error?.erro || 'Não foi possível completar — tente novamente.');
      return false;
    } finally {
      this.enviando.set(false);
    }
  }

  logout(): void {
    this.limparToken();
    this.usuario.set(null);
  }
}
