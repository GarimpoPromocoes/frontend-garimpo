import { Component, computed, effect, inject, signal } from '@angular/core';
import * as QRCode from 'qrcode';
import { StatusService } from '../../../core/services/status.service';
import { JobsService } from '../../../core/services/jobs.service';
import { ConfirmacaoService } from '../../../core/services/confirmacao.service';
import { VerificacaoService } from '../../../core/services/verificacao.service';
import { WhatsappUiService } from '../../../core/services/whatsapp-ui.service';

/**
 * A janela de conexão do WhatsApp — mesmo formato das lojas (X no canto,
 * fecha clicando fora, sem botão de "Cancelar" avulso).
 */
@Component({
  selector: 'app-whatsapp-dialog',
  standalone: true,
  templateUrl: './whatsapp-dialog.html',
})
export class WhatsappDialog {
  protected statusService = inject(StatusService);
  protected jobsService = inject(JobsService);
  protected verificacao = inject(VerificacaoService);
  private confirmacao = inject(ConfirmacaoService);
  private ui = inject(WhatsappUiService);

  protected readonly conectando = computed(
    () => this.jobsService.rodando() && this.jobsService.tipo() === 'trocar-zap',
  );
  protected readonly desconectando = computed(
    () => this.jobsService.rodando() && this.jobsService.tipo() === 'desconectar-zap',
  );

  // Aberta pelo clique no botão OU sozinha enquanto o robô está pedindo um QR
  // novo / desconectando — do mesmo jeito que a janela das lojas reaparece
  // enquanto o robô está no meio de um login.
  protected readonly aberto = computed(() => this.ui.aberto() || this.conectando() || this.desconectando());

  protected readonly conectado = computed(() => this.verificacao.whatsappConectado());

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
    // Uma ação em curso vai confirmar o estado sozinha — uma checagem ao vivo
    // antiga não pode continuar escondendo isso.
    this.jobsService.esquecerVerificacao('whatsapp');
    const r = await this.jobsService.iniciar('trocar-zap');
    if (!r.ok) this.erro.set(r.erro ?? null);
  }

  /** Conectado: um caminho só. Trocar de número = desconectar e conectar de novo. */
  async desconectar(): Promise<void> {
    const ok = await this.confirmacao.pedir({
      titulo: 'Desconectar o WhatsApp?',
      texto: 'O robô para de enviar promoções até você conectar outro número aqui.',
      confirmar: 'Desconectar',
      perigo: true,
    });
    if (!ok) return;

    this.erro.set(null);
    this.jobsService.esquecerVerificacao('whatsapp');
    const r = await this.jobsService.iniciar('desconectar-zap');
    if (!r.ok) this.erro.set(r.erro ?? null);
  }

  /**
   * O X do canto (e o clique fora). No meio de uma conexão/desconexão ele
   * vale por cancelar: só esconder a janela não pararia o robô, que
   * continuaria esperando o QR ser lido.
   */
  async aoFechar(): Promise<void> {
    if ((this.conectando() || this.desconectando()) && this.jobsService.rodando()) {
      await this.jobsService.parar();
    }
    this.erro.set(null);
    this.ui.fechar();
  }
}
