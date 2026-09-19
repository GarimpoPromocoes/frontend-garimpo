import { Component, computed, effect, inject, input, signal } from '@angular/core';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import * as QRCode from 'qrcode';
import { StatusService } from '../../../core/services/status.service';
import { JobsService, JobTipo } from '../../../core/services/jobs.service';
import { environment } from '../../../../environments/environment';

type Servico = 'ml' | 'whatsapp';

@Component({
  selector: 'app-connection-card',
  standalone: true,
  templateUrl: './connection-card.html',
  host: { '[class.card-largo]': 'servico() === "ml" && esteCardEstaRodando()' },
})
export class ConnectionCard {
  servico = input.required<Servico>();

  protected statusService = inject(StatusService);
  protected jobsService = inject(JobsService);
  private sanitizer = inject(DomSanitizer);

  protected readonly conectado = computed(() => {
    const s = this.statusService.status();
    if (!s) return false;
    return this.servico() === 'ml' ? s.mercadoLivre.conectado : s.whatsapp.conectado;
  });

  private readonly tiposDoCard = computed<JobTipo[]>(() =>
    this.servico() === 'ml' ? ['login-ml', 'trocar-ml'] : ['trocar-zap'],
  );

  protected readonly esteCardEstaRodando = computed(() => {
    const tipo = this.jobsService.tipo();
    return this.jobsService.rodando() && tipo !== null && this.tiposDoCard().includes(tipo);
  });

  protected readonly outroJobRodando = computed(
    () => this.jobsService.rodando() && !this.esteCardEstaRodando(),
  );

  protected readonly titulo = computed(() => (this.servico() === 'ml' ? 'Mercado Livre' : 'WhatsApp'));

  protected readonly contaWhatsapp = computed(() => {
    if (this.servico() !== 'whatsapp' || !this.conectado()) return null;
    const wpp = this.statusService.status()?.whatsapp;
    if (!wpp?.numero) return null;
    return { numero: this.formatarNumero(wpp.numero), nome: wpp.nome };
  });

  private formatarNumero(bruto: string): string {
    const d = bruto.replace(/\D/g, '');
    const m = d.match(/^(\d{2})(\d{2})(\d{4,5})(\d{4})$/);
    return m ? `+${m[1]} (${m[2]}) ${m[3]}-${m[4]}` : bruto;
  }
  protected readonly erro = signal<string | null>(null);

  protected readonly novncUrl = computed<string | null>(() => {
    const porta = this.jobsService.vncPort();
    if (!porta) return null;
    if (environment.vncBase) return `${environment.vncBase.replace(/\/$/, '')}:${porta}/`;
    return `${window.location.protocol}//${window.location.hostname}:${porta}/`;
  });
  protected readonly novncQrCode = signal<string | null>(null);

  protected readonly qrWhatsappImagem = signal<string | null>(null);

  protected readonly aguardandoPareamento = computed(
    () => this.servico() === 'whatsapp' && this.esteCardEstaRodando() && !!this.jobsService.qrWhatsapp(),
  );

  protected readonly novncUrlSegura = computed<SafeResourceUrl | null>(() => {
    const url = this.novncUrl();
    return url ? this.sanitizer.bypassSecurityTrustResourceUrl(url) : null;
  });

  constructor() {
    effect(() => {
      const precisaQr = this.servico() === 'ml' && this.esteCardEstaRodando();
      if (!precisaQr) {
        this.novncQrCode.set(null);
        return;
      }
      const url = this.novncUrl();
      if (!url) {
        this.novncQrCode.set(null);
        return;
      }
      QRCode.toDataURL(url, { margin: 1, width: 220 })
        .then((dataUrl) => this.novncQrCode.set(dataUrl))
        .catch(() => this.novncQrCode.set(null));
    });

    effect(() => {
      const conteudo = this.jobsService.qrWhatsapp();
      if (this.servico() !== 'whatsapp' || !conteudo) {
        this.qrWhatsappImagem.set(null);
        return;
      }
      QRCode.toDataURL(conteudo, { margin: 2, width: 300 })
        .then((dataUrl) => this.qrWhatsappImagem.set(dataUrl))
        .catch(() => this.qrWhatsappImagem.set(null));
    });
  }

  async conectar(): Promise<void> {
    this.erro.set(null);
    if (this.servico() === 'ml') {
      const r = await this.jobsService.iniciar('login-ml');
      if (!r.ok) this.erro.set(r.erro ?? null);
    } else {
      if (this.conectado()) {
        const ok = window.confirm(
          'Isso vai desconectar o WhatsApp atual e pedir um novo QR Code. Continuar?',
        );
        if (!ok) return;
      }
      const r = await this.jobsService.iniciar('trocar-zap');
      if (!r.ok) this.erro.set(r.erro ?? null);
    }
  }

  async trocarContaMl(): Promise<void> {
    this.erro.set(null);
    const ok = window.confirm('Isso apaga a sessão atual do Mercado Livre e pede um novo login. Continuar?');
    if (!ok) return;
    const r = await this.jobsService.iniciar('trocar-ml');
    if (!r.ok) this.erro.set(r.erro ?? null);
  }

  async concluirLogin(): Promise<void> {
    await this.jobsService.confirmarEnter();
  }

  async cancelar(): Promise<void> {
    await this.jobsService.parar();
  }
}
