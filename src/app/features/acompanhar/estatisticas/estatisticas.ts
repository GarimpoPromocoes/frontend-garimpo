import { Component, OnDestroy, OnInit, inject, signal } from '@angular/core';
import { GanhosCard } from '../ganhos-card/ganhos-card';
import { MembrosCard } from './membros-card';
import { VendasCard } from './vendas-card';
import { PostagensCard } from './postagens-card';
import { GanhosService } from '../../../core/services/ganhos.service';
import { EstatisticasService } from '../../../core/services/estatisticas.service';
import { RunControlService } from '../../../core/services/run-control.service';

type Visao = 'postagens' | 'ganhos' | 'membros' | 'vendas';

const VISOES: { id: Visao; label: string }[] = [
  { id: 'postagens', label: 'Postagens' },
  { id: 'ganhos', label: 'Ganhos' },
  { id: 'membros', label: 'Membros dos grupos' },
  { id: 'vendas', label: 'Vendas por grupo' },
];
const PERIODOS = [7, 30, 90];
const CHAVE_VISAO = 'promobot:estatisticas:visao';
const VIGIA_MS = 3000;

function visaoSalva(): Visao {
  try {
    const v = localStorage.getItem(CHAVE_VISAO);
    if (VISOES.some((x) => x.id === v)) return v as Visao;
  } catch {}
  return 'ganhos';
}

@Component({
  selector: 'app-estatisticas',
  standalone: true,
  imports: [GanhosCard, MembrosCard, VendasCard, PostagensCard],
  // As três visões ocupam a altura da janela, sem a página rolar.
  host: { class: 'ganhos-pagina' },
  template: `
    <div class="est-barra">
      <div class="segmented segmented-abas" role="group" aria-label="O que ver">
        @for (v of visoes; track v.id) {
          <button type="button" class="segmented-option" [class.segmented-option-active]="visao() === v.id"
            [attr.aria-pressed]="visao() === v.id" (click)="escolher(v.id)">{{ v.label }}</button>
        }
      </div>
      <div class="est-controles">
        @if (visao() !== 'ganhos') {
          <div class="segmented segmented-abas segmented-abas-periodo" role="group" aria-label="Período">
            @for (p of periodos; track p) {
              <button type="button" class="segmented-option" [class.segmented-option-active]="dias() === p"
                [attr.aria-pressed]="dias() === p" (click)="dias.set(p)">{{ p }} dias</button>
            }
          </div>
        }
        <!-- Vale para as três visões: lê ganhos e vendas de uma vez e recarrega tudo. Só com o robô
             parado: ligado, ele mesmo lê na espera entre uma postagem e outra. -->
        @if (roboRodando()) {
          <span class="est-atualizar-aviso" id="est-atualizar-aviso"><svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 11v5.5"/><path d="M12 7.6v.1"/></svg>Você só pode atualizar quando o bot estiver parado</span>
        }
        <button type="button" class="btn btn-sm ganhos-atualizar" [class.ganhos-atualizar-lendo]="lendo()"
          [disabled]="lendo() || roboRodando()" [attr.aria-describedby]="roboRodando() ? 'est-atualizar-aviso' : null"
          [title]="roboRodando() ? 'Você só pode atualizar quando o bot estiver parado' : 'Ler ganhos e vendas agora'"
          (click)="atualizar()">
          <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M20 11a8 8 0 0 0-14.3-4.9L4 8"/><path d="M4 3.5V8h4.5"/><path d="M4 13a8 8 0 0 0 14.3 4.9L20 16"/><path d="M20 20.5V16h-4.5"/></svg>
          {{ lendo() ? 'Lendo…' : 'Atualizar agora' }}
        </button>
      </div>
    </div>
    @if (erroAcao()) {
      <p class="error-text" role="alert">{{ erroAcao() }}</p>
    }
    @switch (visao()) {
      @case ('postagens') { <app-postagens-card class="ganhos-pagina" [dias]="dias()" /> }
      @case ('ganhos') { <app-ganhos-card /> }
      @case ('membros') { <app-membros-card class="ganhos-pagina" [dias]="dias()" /> }
      @case ('vendas') { <app-vendas-card class="ganhos-pagina" [dias]="dias()" /> }
    }
  `,
})
export class Estatisticas implements OnInit, OnDestroy {
  private ganhos = inject(GanhosService);
  private est = inject(EstatisticasService);
  private runControl = inject(RunControlService);
  protected readonly visoes = VISOES;
  protected readonly periodos = PERIODOS;
  protected readonly visao = signal<Visao>(visaoSalva());
  protected readonly dias = signal(30);
  protected readonly pedindo = signal(false);
  protected readonly erroAcao = signal<string | null>(null);
  private timer: ReturnType<typeof setInterval> | null = null;

  /** O robô de postagem está ligado (no painel ou fora dele): a atualização fica bloqueada. */
  protected roboRodando(): boolean {
    return this.runControl.rodandoContinuo() || this.runControl.postandoAgora() || this.runControl.processoExterno();
  }

  protected lendo(): boolean {
    return this.pedindo() || this.ganhos.lendoAgora();
  }

  ngOnInit(): void {
    // Só enquanto tem leitura em curso: cada loja (e os membros) aparece assim que termina.
    this.timer = setInterval(() => {
      const ganhosPendentes =
        this.ganhos.lendoAgora() ||
        this.ganhos.leituras().some((r) => r.pedidoEm && (!r.lidoEm || r.pedidoEm > r.lidoEm));
      // Membros só são lidos com o robô ligado (WhatsApp aberto): parado, não adianta perguntar.
      const membrosPendentes = this.est.aguardandoMembros() && this.runControl.rodandoContinuo();
      if (ganhosPendentes || membrosPendentes) void this.recarregarTudo();
    }, VIGIA_MS);
  }

  ngOnDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }

  protected escolher(v: Visao): void {
    this.visao.set(v);
    try {
      localStorage.setItem(CHAVE_VISAO, v);
    } catch {}
  }

  protected async atualizar(): Promise<void> {
    if (this.roboRodando()) return;
    this.pedindo.set(true);
    this.erroAcao.set(null);
    const r = await this.est.atualizar();
    await this.recarregarTudo();
    this.pedindo.set(false);
    // Sem mensagem quando dá certo: o botão em "Lendo…" e cada loja aparecendo já contam o que está
    // acontecendo.
    if (!r.ok) this.erroAcao.set(r.erro ?? null);
  }

  private async recarregarTudo(): Promise<void> {
    await Promise.all([
      this.ganhos.carregar(),
      this.est.carregarMembros(this.dias()),
      this.est.carregarVendas(this.dias()),
      this.est.carregarPostagens(this.dias()),
    ]);
  }
}
