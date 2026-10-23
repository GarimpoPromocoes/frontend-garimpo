import { Injectable, computed, inject, signal } from '@angular/core';
import { GanhosService } from './ganhos.service';
import { EstatisticasService } from './estatisticas.service';
import { RunControlService } from './run-control.service';

export type VisaoEstatisticas = 'postagens' | 'ganhos' | 'membros' | 'vendas';

/** "curto" entra no lugar do nome em tela mais estreita, pra caber tudo no topo. */
export const VISOES_ESTATISTICAS: { id: VisaoEstatisticas; label: string; curto: string }[] = [
  { id: 'postagens', label: 'Postagens', curto: 'Postagens' },
  { id: 'ganhos', label: 'Ganhos', curto: 'Ganhos' },
  { id: 'membros', label: 'Membros dos grupos', curto: 'Membros' },
  { id: 'vendas', label: 'Vendas por grupo', curto: 'Vendas' },
];

export const PERIODOS_ESTATISTICAS = [7, 30, 90];

const CHAVE_VISAO = 'promobot:estatisticas:visao';

function visaoSalva(): VisaoEstatisticas {
  try {
    const v = localStorage.getItem(CHAVE_VISAO);
    if (VISOES_ESTATISTICAS.some((x) => x.id === v)) return v as VisaoEstatisticas;
  } catch {}
  return 'ganhos';
}

/**
 * O estado da tela de Estatísticas: a visão aberta, o período e o "Atualizar agora". As abas, o
 * período e o botão de atualizar ficam no cabeçalho (app.html); o conteúdo, na tela (Estatisticas).
 * Os dois leem daqui.
 */
@Injectable({ providedIn: 'root' })
export class EstatisticasVisaoService {
  private ganhos = inject(GanhosService);
  private est = inject(EstatisticasService);
  private runControl = inject(RunControlService);

  readonly visao = signal<VisaoEstatisticas>(visaoSalva());
  readonly dias = signal(30);
  readonly pedindo = signal(false);
  readonly erroAcao = signal<string | null>(null);
  /** Robô ligado: o pedido ficou na fila e ele lê na próxima espera entre postagens. */
  readonly avisoAcao = signal<string | null>(null);

  /** O robô de postagem está ligado (no painel ou fora dele): ele mesmo atende o "Atualizar agora". */
  readonly roboRodando = computed(
    () => this.runControl.rodandoContinuo() || this.runControl.postandoAgora() || this.runControl.processoExterno()
  );

  readonly lendo = computed(() => this.pedindo() || this.ganhos.lendoAgora());

  escolher(v: VisaoEstatisticas): void {
    this.visao.set(v);
    try {
      localStorage.setItem(CHAVE_VISAO, v);
    } catch {}
  }

  /**
   * Lê ganhos, vendas e membros de uma vez e recarrega tudo. Com o robô parado, na hora; ligado, o
   * robô atende na próxima espera entre postagens, sem precisar parar.
   */
  async atualizar(): Promise<void> {
    if (this.lendo()) return;
    this.pedindo.set(true);
    this.erroAcao.set(null);
    this.avisoAcao.set(null);
    const r = await this.est.atualizar();
    await this.recarregarTudo();
    this.pedindo.set(false);
    // Robô parado: sem mensagem quando dá certo — o ícone girando e cada loja aparecendo já contam
    // o que está acontecendo. Ligado, a leitura sai depois: avisa.
    if (!r.ok) this.erroAcao.set(r.erro ?? null);
    else if (r.modo === 'na-fila' && this.roboRodando()) {
      this.avisoAcao.set('Pedido enviado: o robô atualiza na próxima pausa entre uma postagem e outra.');
    }
  }

  async recarregarTudo(): Promise<void> {
    const dias = this.dias();
    await Promise.all([
      this.ganhos.carregar(),
      this.est.carregarMembros(dias),
      this.est.carregarVendas(dias),
      this.est.carregarPostagens(dias),
    ]);
  }
}
