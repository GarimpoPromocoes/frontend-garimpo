import { Component, computed, effect, inject, signal } from '@angular/core';
import * as QRCode from 'qrcode';
import { StatusService } from '../../../core/services/status.service';
import { JobsService } from '../../../core/services/jobs.service';
import { ConfirmacaoService } from '../../../core/services/confirmacao.service';

@Component({
  selector: 'app-whatsapp-card',
  standalone: true,
  templateUrl: './whatsapp-card.html',
})
export class WhatsappCard {
  protected statusService = inject(StatusService);
  protected jobsService = inject(JobsService);
  private confirmacao = inject(ConfirmacaoService);

  protected readonly conectado = computed(() => !!this.statusService.status()?.whatsapp.conectado);

  protected readonly conectando = computed(
    () => this.jobsService.rodando() && this.jobsService.tipo() === 'trocar-zap',
  );
  protected readonly outroJobRodando = computed(() => this.jobsService.rodando() && !this.conectando());

  protected readonly qrImagem = signal<string | null>(null);
  protected readonly erro = signal<string | null>(null);

  protected readonly conta = computed(() => {
    if (!this.conectado()) return null;
    const wpp = this.statusService.status()?.whatsapp;
    if (!wpp?.numero) return null;
    return { numero: this.formatarNumero(wpp.numero), nome: wpp.nome };
  });

  private formatarNumero(bruto: string): string {
    const d = bruto.replace(/\D/g, '');
    const m = d.match(/^(\d{2})(\d{2})(\d{4,5})(\d{4})$/);
    return m ? `+${m[1]} (${m[2]}) ${m[3]}-${m[4]}` : bruto;
  }

  constructor() {
    effect(() => {
      const conteudo = this.jobsService.qrWhatsapp();
      if (!conteudo) {
        this.qrImagem.set(null);
        return;
      }
      QRCode.toDataURL(conteudo, { margin: 2, width: 300 })
        .then((dataUrl) => this.qrImagem.set(dataUrl))
        .catch(() => this.qrImagem.set(null));
    });
  }

  async conectar(): Promise<void> {
    this.erro.set(null);
    if (this.conectado()) {
      const ok = await this.confirmacao.pedir({
        titulo: 'Trocar o número do WhatsApp?',
        texto:
          'O número conectado agora vai ser desligado e um novo QR Code aparece para você ler com o outro celular.',
        confirmar: 'Trocar número',
        perigo: true,
      });
      if (!ok) return;
    }
    const r = await this.jobsService.iniciar('trocar-zap');
    if (!r.ok) this.erro.set(r.erro ?? null);
  }

  async cancelar(): Promise<void> {
    await this.jobsService.parar();
  }
}
