import { Component, computed, inject, viewChild } from '@angular/core';
import { JobsService } from '../../../core/services/jobs.service';
import { TelaAoVivo } from '../../../shared/tela-ao-vivo/tela-ao-vivo';

/**
 * Popup com a tela da verificação de segurança do Mercado Livre. O navegador do robô roda numa VM,
 * então o robô manda quadros da aba do desafio e o painel devolve os cliques/teclas — quem resolve
 * é a pessoa, aqui. Some sozinho quando a verificação passa.
 */
@Component({
  selector: 'app-desafio-ml-dialog',
  standalone: true,
  imports: [TelaAoVivo],
  templateUrl: './desafio-ml-dialog.html',
})
export class DesafioMlDialog {
  protected jobs = inject(JobsService);

  protected readonly aberto = computed(() => !!this.jobs.desafioMl() && this.jobs.desafioPopupAberto());
  private tela = viewChild(TelaAoVivo);

  protected tentarDeNovo(): void {
    this.tela()?.tentarDeNovo();
  }

  protected fechar(): void {
    this.jobs.desafioPopupAberto.set(false);
  }
}
