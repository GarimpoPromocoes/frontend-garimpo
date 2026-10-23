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
/** Quanto tempo, no máximo, o ícone gira esperando o robô ligado terminar de atualizar. */
const PRAZO_ROBO_MS = 3 * 60 * 1000;

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
  /** Robô ligado: diz o que ele está fazendo com o pedido (some quando ele termina). */
  readonly avisoAcao = signal<string | null>(null);
  /** Robô ligado largou o que fazia para atualizar: o ícone gira até ele terminar (com prazo). */
  readonly roboAtualizandoAte = signal(0);

  /** O robô de postagem está ligado (no painel ou fora dele): ele mesmo atende o "Atualizar agora". */
  readonly roboRodando = computed(
    () => this.runControl.rodandoContinuo() || this.runControl.postandoAgora() || this.runControl.processoExterno()
  );

  readonly lendo = computed(() => this.pedindo() || this.ganhos.lendoAgora() || this.roboAtualizandoAte() > 0);

  /** O robô terminou (ou passou do prazo): para de girar e tira o aviso. */
  terminouNoRobo(): void {
    this.roboAtualizandoAte.set(0);
    this.avisoAcao.set(null);
  }

  escolher(v: VisaoEstatisticas): void {
    this.visao.set(v);
    try {
      localStorage.setItem(CHAVE_VISAO, v);
    } catch {}
  }

  /**
   * Lê ganhos, vendas e membros de uma vez e recarrega tudo. Com o robô parado, na hora; ligado
   * pelo painel, ele larga o que estava fazendo (busca de produto, espera), atualiza e depois volta.
   */
  async atualizar(): Promise<void> {
    if (this.lendo()) return;
    this.pedindo.set(true);
    this.erroAcao.set(null);
    this.avisoAcao.set(null);
    const r = await this.est.atualizar();
    // Antes de recarregar: os pedidos ainda abertos mantêm o ícone girando até o robô terminar.
    if (r.ok && r.modo === 'robo-ligado') {
      this.roboAtualizandoAte.set(Date.now() + PRAZO_ROBO_MS);
      this.avisoAcao.set('O robô parou o que estava fazendo para atualizar — depois volta a postar.');
    }
    await this.recarregarTudo();
    this.pedindo.set(false);
    // Robô parado: sem mensagem quando dá certo — o ícone girando e cada loja aparecendo já contam
    // o que está acontecendo. Ligado fora do painel (terminal), a leitura sai na próxima espera.
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
