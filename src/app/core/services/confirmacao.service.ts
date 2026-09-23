import { Injectable, signal } from '@angular/core';

export interface PedidoConfirmacao {
  titulo: string;
  /** Uma ou duas linhas explicando o que vai acontecer. */
  texto?: string;
  /** Texto do botão que confirma (o padrão serve para a maioria dos casos). */
  confirmar?: string;
  cancelar?: string;
  /** true quando a ação apaga ou desfaz algo: o botão fica vermelho. */
  perigo?: boolean;
}

/**
 * Confirmação em janela nossa, no lugar do `window.confirm` do navegador — que
 * mostra o endereço do site e não tem nada a ver com o resto do painel.
 *
 *   if (!(await this.confirmacao.pedir({ titulo: '…' }))) return;
 */
@Injectable({ providedIn: 'root' })
export class ConfirmacaoService {
  readonly pedido = signal<PedidoConfirmacao | null>(null);

  private responder: ((ok: boolean) => void) | null = null;

  pedir(pedido: PedidoConfirmacao): Promise<boolean> {
    // Se já havia uma pergunta aberta, ela morre como "não" — nunca como "sim".
    this.responder?.(false);

    this.pedido.set(pedido);
    return new Promise<boolean>((resolve) => {
      this.responder = (ok) => {
        this.responder = null;
        this.pedido.set(null);
        resolve(ok);
      };
    });
  }

  confirmar(): void {
    this.responder?.(true);
  }

  cancelar(): void {
    this.responder?.(false);
  }
}
