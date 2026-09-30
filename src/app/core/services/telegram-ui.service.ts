import { Injectable, signal } from '@angular/core';

/**
 * Se a janela de conexão do Telegram está aberta. Mesmo papel do
 * WhatsappUiService: o botão fica na aba, a janela é montada no shell.
 */
@Injectable({ providedIn: 'root' })
export class TelegramUiService {
  readonly aberto = signal(false);

  abrir(): void {
    this.aberto.set(true);
  }

  fechar(): void {
    this.aberto.set(false);
  }
}
