import { Injectable, computed, inject, signal } from '@angular/core';
import { ConfigService, FonteProdutos, GrupoTematico } from './config.service';
import { GruposWhatsappService } from './grupos-whatsapp.service';

export type FiltroOrigem = 'todos' | FonteProdutos;

/**
 * De onde vêm os produtos de cada grupo (garimpo próprio ou clonagem). A tela de Grupos mostra os
 * cards; o cabeçalho mostra o filtro (Todos / Meu garimpo / Clonagem) e os números.
 */
@Injectable({ providedIn: 'root' })
export class GruposOrigemService {
  private configService = inject(ConfigService);
  private zap = inject(GruposWhatsappService);

  readonly filtro = signal<FiltroOrigem>('todos');

  /** Grupo sem origem gravada segue a escolha antiga da conta toda. */
  readonly fontePadrao = computed<FonteProdutos>(() =>
    this.configService.config()?.garimpo?.fonte === 'grupos' ? 'clonagem' : 'garimpo',
  );

  fonteDe(g: GrupoTematico): FonteProdutos {
    return g.fonte ?? this.fontePadrao();
  }

  readonly contagem = computed(() => {
    const grupos = this.configService.config()?.grupos ?? [];
    const clonagem = grupos.filter((g) => this.fonteDe(g) === 'clonagem').length;
    return { todos: grupos.length, garimpo: grupos.length - clonagem, clonagem, lidos: this.zap.lidos() };
  });
}
