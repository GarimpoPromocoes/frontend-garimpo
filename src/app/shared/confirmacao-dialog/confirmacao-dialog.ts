import { AfterViewChecked, Component, ElementRef, computed, inject, viewChild } from '@angular/core';
import { ConfirmacaoService } from '../../core/services/confirmacao.service';

/**
 * A janela de "tem certeza?" do painel. Fica montada uma vez no shell e atende
 * qualquer tela pelo ConfirmacaoService.
 */
@Component({
  selector: 'app-confirmacao-dialog',
  standalone: true,
  templateUrl: './confirmacao-dialog.html',
  host: {
    '(document:keydown.escape)': 'aoEscapar()',
    '(document:keydown.enter)': 'aoConfirmarPorTeclado($event)',
  },
})
export class ConfirmacaoDialog implements AfterViewChecked {
  protected confirmacao = inject(ConfirmacaoService);

  protected readonly pedido = computed(() => this.confirmacao.pedido());

  private readonly botaoConfirmar = viewChild<ElementRef<HTMLButtonElement>>('botaoConfirmar');
  private jaFocou = false;

  ngAfterViewChecked(): void {
    const botao = this.botaoConfirmar()?.nativeElement;
    if (!botao) {
      this.jaFocou = false;
      return;
    }
    if (this.jaFocou) return;
    this.jaFocou = true;
    botao.focus();
  }

  protected aoEscapar(): void {
    if (this.pedido()) this.confirmacao.cancelar();
  }

  protected aoConfirmarPorTeclado(evento: Event): void {
    if (!this.pedido()) return;
    evento.preventDefault();
    this.confirmacao.confirmar();
  }
}
