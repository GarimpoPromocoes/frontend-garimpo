import { Injectable, signal } from '@angular/core';

/**
 * Se a janela de conexão do WhatsApp está aberta. Mesmo papel do
 * LojasUiService: o botão fica na aba, a janela é montada no shell — assim
 * ela também aparece sozinha quando o robô está no meio de um QR novo, mesmo
 * que o usuário tenha saído da aba.
 */
@Injectable({ providedIn: 'root' })
export class WhatsappUiService {
  readonly aberto = signal(false);

  abrir(): void {
    this.aberto.set(true);
  }

  fechar(): void {
    this.aberto.set(false);
  }
}
