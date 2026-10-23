import { Component, OnDestroy, OnInit, inject } from '@angular/core';
import { GanhosCard } from '../ganhos-card/ganhos-card';
import { MembrosCard } from './membros-card';
import { VendasCard } from './vendas-card';
import { PostagensCard } from './postagens-card';
import { GanhosService } from '../../../core/services/ganhos.service';
import { EstatisticasService } from '../../../core/services/estatisticas.service';
import { RunControlService } from '../../../core/services/run-control.service';
import { EstatisticasVisaoService } from '../../../core/services/estatisticas-visao.service';

const VIGIA_MS = 3000;

@Component({
  selector: 'app-estatisticas',
  standalone: true,
  imports: [GanhosCard, MembrosCard, VendasCard, PostagensCard],
  // As visões ocupam a altura da janela, sem a página rolar. As abas, o período e o "Atualizar
  // agora" ficam no cabeçalho (estatisticas-abas.ts); o estado, em EstatisticasVisaoService.
  host: { class: 'ganhos-pagina' },
  template: `
    <!-- Bot ligado: o "Atualizar agora" fica na fila e o aviso diz quando sai. -->
    @if (tela.avisoAcao() || tela.erroAcao()) {
      <div class="est-barra">
        @if (tela.avisoAcao()) {
          <span class="est-atualizar-aviso" role="status"><svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 11v5.5"/><path d="M12 7.6v.1"/></svg>{{ tela.avisoAcao() }}</span>
        }
        @if (tela.erroAcao()) {
          <p class="error-text" role="alert">{{ tela.erroAcao() }}</p>
        }
      </div>
    }
    @switch (tela.visao()) {
      @case ('postagens') { <app-postagens-card class="ganhos-pagina" [dias]="tela.dias()" /> }
      @case ('ganhos') { <app-ganhos-card /> }
      @case ('membros') { <app-membros-card class="ganhos-pagina" [dias]="tela.dias()" /> }
      @case ('vendas') { <app-vendas-card class="ganhos-pagina" [dias]="tela.dias()" /> }
    }
  `,
})
export class Estatisticas implements OnInit, OnDestroy {
  private ganhos = inject(GanhosService);
  private est = inject(EstatisticasService);
  private runControl = inject(RunControlService);
  protected readonly tela = inject(EstatisticasVisaoService);
  private timer: ReturnType<typeof setInterval> | null = null;

  ngOnInit(): void {
    // Só enquanto tem leitura em curso: cada loja (e os membros) aparece assim que termina.
    this.timer = setInterval(() => {
      const ganhosPendentes =
        this.ganhos.lendoAgora() ||
        this.ganhos.leituras().some((r) => r.pedidoEm && (!r.lidoEm || r.pedidoEm > r.lidoEm));
      // Membros só são lidos com o robô ligado (WhatsApp aberto): parado, não adianta perguntar.
      const membrosPendentes = this.est.aguardandoMembros() && this.runControl.rodandoContinuo();
      const passouDoPrazo = this.tela.roboAtualizandoAte() > 0 && Date.now() > this.tela.roboAtualizandoAte();
      if ((ganhosPendentes || membrosPendentes) && !passouDoPrazo) void this.tela.recarregarTudo();
      // O robô já atendeu o pedido (ou demorou demais): para de girar e o aviso sai.
      else if (this.tela.avisoAcao() || this.tela.roboAtualizandoAte()) this.tela.terminouNoRobo();
    }, VIGIA_MS);
  }

  ngOnDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }
}
