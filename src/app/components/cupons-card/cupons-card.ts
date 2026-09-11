import { Component, effect, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ConfigService } from '../../services/config.service';
import { JobsService } from '../../services/jobs.service';
import { StatusService } from '../../services/status.service';

@Component({
  selector: 'app-cupons-card',
  standalone: true,
  imports: [FormsModule],
  templateUrl: './cupons-card.html',
})
export class CuponsCard {
  protected configService = inject(ConfigService);
  protected jobsService = inject(JobsService);
  protected statusService = inject(StatusService);

  protected readonly ativo = signal(true);
  protected readonly percentualProduto = signal(15);
  protected readonly percentualSozinho = signal(10);

  protected readonly salvando = signal(false);
  protected readonly mensagem = signal<{ tipo: 'ok' | 'erro'; texto: string } | null>(null);

  protected readonly garimpando = signal(false);
  protected readonly erroGarimpo = signal<string | null>(null);

  constructor() {
    effect(() => {
      const cfg = this.configService.config();
      if (!cfg) return;
      this.ativo.set(cfg.cupons.ativo);
      this.percentualProduto.set(cfg.cupons.percentualProduto);
      this.percentualSozinho.set(cfg.cupons.percentualSozinho);
    });
  }

  async salvar(): Promise<void> {
    this.mensagem.set(null);

    if (this.percentualProduto() + this.percentualSozinho() > 50) {
      this.mensagem.set({
        tipo: 'erro',
        texto: 'A soma dos dois percentuais não pode passar de 50% — oferta pura precisa continuar sendo a maioria.',
      });
      return;
    }

    this.salvando.set(true);
    const r = await this.configService.salvar({
      cupons: {
        ativo: this.ativo(),
        percentualProduto: this.percentualProduto(),
        percentualSozinho: this.percentualSozinho(),
      },
    });
    this.salvando.set(false);
    this.mensagem.set(r.ok ? { tipo: 'ok', texto: 'Salvo!' } : { tipo: 'erro', texto: r.erro ?? 'Erro ao salvar.' });
    if (r.ok) setTimeout(() => this.mensagem.set(null), 3000);
  }

  // Garimpa os cupons ativos agora em mercadolivre.com.br/cupons (fica rodando
  // rodada após rodada, igual ao "Garimpar" de ofertas, até "Parar").
  async garimpar(): Promise<void> {
    this.erroGarimpo.set(null);
    this.garimpando.set(true);
    const r = await this.jobsService.iniciar('cupons', { loop: true });
    this.garimpando.set(false);
    if (!r.ok) this.erroGarimpo.set(r.erro ?? null);
    await this.statusService.atualizar();
  }
}
