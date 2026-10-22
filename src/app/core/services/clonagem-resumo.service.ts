import { Injectable, signal } from '@angular/core';

export interface ContagemClonagem {
  garimpo: number;
  clonagem: number;
  lidos: number;
}

/**
 * Os números da tela de Clonagem (grupos com o meu garimpo, com clonagem e concorrentes lidos).
 * A tela calcula (com as mudanças ainda não salvas) e o cabeçalho mostra.
 */
@Injectable({ providedIn: 'root' })
export class ClonagemResumoService {
  readonly contagem = signal<ContagemClonagem | null>(null);
}
