import { Injectable, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';

export interface UsuarioLogado {
  id: number;
  email: string;
  nome?: string | null;
  // Dono do sistema: libera o "Painel do dono" no menu. Isso e apenas a CARA
  // da interface — quem protege de verdade e o adminMiddleware no servidor,
  // que confere no banco a cada chamada.
  admin?: boolean;
}

const CHAVE_TOKEN = 'promobot:token';

// Login por e-mail/senha (JWT) — substitui a chave de API compartilhada que
// existia antes. O token fica no localStorage (por aba/navegador, nao
// sincroniza entre dispositivos) e vai em toda chamada /api/* via
// api.interceptor.ts.
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
      // sem persistencia (aba anonima, storage bloqueado) — a sessao ainda
      // funciona nesta navegacao, so nao sobrevive a fechar a aba.
    }
  }

  private limparToken(): void {
    try {
      localStorage.removeItem(CHAVE_TOKEN);
    } catch (_) {}
  }

  // Chamado uma vez ao abrir o app: se ha token salvo, confere que ainda
  // vale antes de liberar o dashboard (evita mostrar dados com um token
  // expirado e so falhar depois, nas outras chamadas).
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
