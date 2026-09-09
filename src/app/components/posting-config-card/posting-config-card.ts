import { Component, effect, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ConfigService } from '../../services/config.service';

@Component({
  selector: 'app-posting-config-card',
  standalone: true,
  imports: [FormsModule],
  templateUrl: './posting-config-card.html',
})
export class PostingConfigCard {
  protected configService = inject(ConfigService);

  protected readonly cooldownHoras = signal(48);
  protected readonly repostarAposDias = signal(14);

  protected readonly salvando = signal(false);
  protected readonly mensagem = signal<{ tipo: 'ok' | 'erro'; texto: string } | null>(null);

  constructor() {
    effect(() => {
      const cfg = this.configService.config();
      if (!cfg) return;
      this.cooldownHoras.set(cfg.postagem.cooldownHoras);
      this.repostarAposDias.set(cfg.postagem.repostarAposDias);
    });
  }

  async salvar(): Promise<void> {
    this.salvando.set(true);
    this.mensagem.set(null);
    const r = await this.configService.salvar({
      postagem: {
        cooldownHoras: this.cooldownHoras(),
        repostarAposDias: this.repostarAposDias(),
      },
    });
    this.salvando.set(false);
    this.mensagem.set(r.ok ? { tipo: 'ok', texto: 'Salvo!' } : { tipo: 'erro', texto: r.erro ?? 'Erro ao salvar.' });
    if (r.ok) setTimeout(() => this.mensagem.set(null), 3000);
  }
}
