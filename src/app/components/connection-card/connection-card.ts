import { Component, computed, effect, inject, input, signal } from '@angular/core';
import * as QRCode from 'qrcode';
import { StatusService } from '../../services/status.service';
import { JobsService, JobTipo } from '../../services/jobs.service';

type Servico = 'ml' | 'whatsapp';

@Component({
  selector: 'app-connection-card',
  standalone: true,
  templateUrl: './connection-card.html',
})
export class ConnectionCard {
  servico = input.required<Servico>();

  protected statusService = inject(StatusService);
  protected jobsService = inject(JobsService);

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

  protected readonly ehLoginMl = computed(() => this.jobsService.tipo() === 'login-ml' || this.jobsService.tipo() === 'trocar-ml');

  protected readonly titulo = computed(() => (this.servico() === 'ml' ? 'Mercado Livre' : 'WhatsApp'));
  protected readonly icone = computed(() => (this.servico() === 'ml' ? '🛒' : '💬'));
  protected readonly erro = signal<string | null>(null);

  // O login do ML abre um navegador DENTRO do container — só dá pra ver/usar
  // pela tela remota (noVNC), que fica num endereço/porta diferente do
  // dashboard. QR Code (e o link) evitam ter que descobrir/digitar essa URL
  // na mão — abre "/" que já auto-conecta na tela remota (ver novnc-index.html).
  protected readonly novncUrl = computed(
    () => `${window.location.protocol}//${window.location.hostname}:6080/`,
  );
  protected readonly novncQrCode = signal<string | null>(null);

  constructor() {
    effect(() => {
      const precisaQr = this.servico() === 'ml' && this.esteCardEstaRodando();
      if (!precisaQr) {
        this.novncQrCode.set(null);
        return;
      }
      QRCode.toDataURL(this.novncUrl(), { margin: 1, width: 220 })
        .then((url) => this.novncQrCode.set(url))
        .catch(() => this.novncQrCode.set(null));
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
