import { Component, computed, inject } from '@angular/core';
import { StatusService } from '../../../core/services/status.service';
import { VerificacaoService } from '../../../core/services/verificacao.service';
import { WhatsappUiService } from '../../../core/services/whatsapp-ui.service';
import { ConfirmacaoService } from '../../../core/services/confirmacao.service';

/**
 * O botão que abre a janela de conexão do WhatsApp — mesmo tratamento visual
 * do botão de cada loja (logo oficial + estado). A conexão em si acontece no
 * modal (`app-whatsapp-dialog`, montado no shell).
 */
@Component({
  selector: 'app-whatsapp-card',
  standalone: true,
  templateUrl: './whatsapp-card.html',
})
export class WhatsappCard {
  private statusService = inject(StatusService);
  private verificacao = inject(VerificacaoService);
  private ui = inject(WhatsappUiService);
  private confirmacao = inject(ConfirmacaoService);

  protected readonly conectado = computed(() => this.verificacao.whatsappConectado());

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

  abrir(): void {
    this.ui.abrir();
  }

  avisarTelegram(): void {
    void this.confirmacao.pedir({
      titulo: 'Telegram ainda não está disponível',
      texto:
        'O envio das promoções pelo Telegram está em desenvolvimento. Assim que ficar pronto, é só voltar aqui e conectar.',
      confirmar: 'Entendi',
      soAviso: true,
    });
  }
}
