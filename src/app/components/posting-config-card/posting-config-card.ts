import { Component, effect, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ConfigService } from '../../services/config.service';
import { ChipInput } from '../../shared/chip-input/chip-input';

@Component({
  selector: 'app-posting-config-card',
  standalone: true,
  imports: [FormsModule, ChipInput],
  templateUrl: './posting-config-card.html',
})
export class PostingConfigCard {
  protected configService = inject(ConfigService);

  protected readonly gruposGarimpo = signal<string[]>([]);
  protected readonly garimparCanais = signal(true);

  protected readonly produtosPorExecucao = signal(15);
  protected readonly maxMensagensPorExecucao = signal(30);
  protected readonly cooldownHoras = signal(48);
  protected readonly repostarAposDias = signal(14);
  protected readonly maxPorFamilia = signal(2);

  protected readonly salvando = signal(false);
  protected readonly mensagem = signal<{ tipo: 'ok' | 'erro'; texto: string } | null>(null);

  constructor() {
    effect(() => {
      const cfg = this.configService.config();
      if (!cfg) return;
      this.gruposGarimpo.set(cfg.whatsapp.gruposGarimpo);
      this.garimparCanais.set(cfg.whatsapp.garimparCanais);
      this.produtosPorExecucao.set(cfg.postagem.produtosPorExecucao);
      this.maxMensagensPorExecucao.set(cfg.postagem.maxMensagensPorExecucao);
      this.cooldownHoras.set(cfg.postagem.cooldownHoras);
      this.repostarAposDias.set(cfg.postagem.repostarAposDias);
      this.maxPorFamilia.set(cfg.postagem.maxPorFamilia);
    });
  }

  async salvar(): Promise<void> {
    this.salvando.set(true);
    this.mensagem.set(null);
    const r = await this.configService.salvar({
      whatsapp: {
        gruposGarimpo: this.gruposGarimpo(),
        garimparCanais: this.garimparCanais(),
      },
      postagem: {
        produtosPorExecucao: this.produtosPorExecucao(),
        maxMensagensPorExecucao: this.maxMensagensPorExecucao(),
        cooldownHoras: this.cooldownHoras(),
        repostarAposDias: this.repostarAposDias(),
        maxPorFamilia: this.maxPorFamilia(),
      },
    });
    this.salvando.set(false);
    this.mensagem.set(r.ok ? { tipo: 'ok', texto: 'Salvo!' } : { tipo: 'erro', texto: r.erro ?? 'Erro ao salvar.' });
    if (r.ok) setTimeout(() => this.mensagem.set(null), 3000);
  }
}
