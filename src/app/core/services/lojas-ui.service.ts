import { Injectable, signal } from '@angular/core';
import { Provedor } from './conexoes.service';

/**
 * Qual loja o usuário abriu na tela de Lojas. Os botões ficam num canto da tela
 * e a janela de conexão é montada no shell (para aparecer também quando o robô
 * pede algo sozinho, no meio do trabalho) — este serviço liga os dois.
 */
@Injectable({ providedIn: 'root' })
export class LojasUiService {
  readonly aberta = signal<Provedor | null>(null);

  abrir(provedor: Provedor): void {
    this.aberta.set(provedor);
  }

  fechar(): void {
    this.aberta.set(null);
  }
}
