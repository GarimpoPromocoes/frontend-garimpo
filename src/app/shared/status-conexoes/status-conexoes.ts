import { Component, ElementRef, HostListener, computed, inject, signal } from '@angular/core';
import { StatusService } from '../../core/services/status.service';
import { VerificacaoService } from '../../core/services/verificacao.service';
import { JobsService } from '../../core/services/jobs.service';
import { ConexoesService, Provedor } from '../../core/services/conexoes.service';
import { WhatsappUiService } from '../../core/services/whatsapp-ui.service';
import { TelegramUiService } from '../../core/services/telegram-ui.service';
import { LojasUiService } from '../../core/services/lojas-ui.service';

interface ItemStatus {
  id: 'whatsapp' | 'telegram' | Provedor;
  nome: string;
  logo: string;
  conectado: boolean;
  detalhe: string | null;
}

/**
 * Status das conexões no topo (antes ficava no rodapé da barra lateral):
 * um botão com o resumo e, no clique, a lista de tudo que está ou não
 * conectado. Clicar numa linha abre a janela de conexão dela.
 */
@Component({
  selector: 'app-status-conexoes',
  standalone: true,
  templateUrl: './status-conexoes.html',
})
export class StatusConexoes {
  private statusService = inject(StatusService);
  private verificacao = inject(VerificacaoService);
  private jobs = inject(JobsService);
  private conexoes = inject(ConexoesService);
  private whatsappUi = inject(WhatsappUiService);
  private telegramUi = inject(TelegramUiService);
  private lojasUi = inject(LojasUiService);
  private host = inject(ElementRef<HTMLElement>);

  protected readonly aberto = signal(false);

  protected readonly envio = computed<ItemStatus[]>(() => {
    const s = this.statusService.status();
    const zap = this.verificacao.whatsappConectado() && !this.jobs.qrWhatsapp();
    const tg = this.verificacao.telegramConectado();
    const wpp = s?.whatsapp;
    const tgInfo = s?.telegram;
    return [
      {
        id: 'whatsapp',
        nome: 'WhatsApp',
        logo: 'lojas/whatsapp.svg',
        conectado: zap,
        detalhe: zap ? wpp?.nome || (wpp?.numero ? '+' + wpp.numero : null) : null,
      },
      {
        id: 'telegram',
        nome: 'Telegram',
        logo: 'lojas/telegram.png',
        conectado: tg,
        detalhe: tg ? tgInfo?.nome || (tgInfo?.usuario ? '@' + tgInfo.usuario : null) : null,
      },
    ];
  });

  protected readonly lojas = computed<ItemStatus[]>(() => [
    {
      id: 'mercadolivre',
      nome: 'Mercado Livre',
      logo: 'lojas/mercadolivre.svg',
      conectado: this.verificacao.mercadoLivreConectado(),
      detalhe: this.jobs.desafioMl() ? 'Verificação pendente' : null,
    },
    {
      id: 'amazon',
      nome: 'Amazon',
      logo: 'lojas/amazon.svg',
      conectado: this.conexoes.statusDe('amazon')?.status === 'conectado',
      detalhe:
        this.conexoes.statusDe('amazon')?.status === 'conectado' && !this.verificacao.amazonSiteStripe()
          ? 'Link longo'
          : null,
    },
    {
      id: 'shopee',
      nome: 'Shopee',
      logo: 'lojas/shopee.svg',
      conectado: this.verificacao.shopeeConectado(),
      detalhe: null,
    },
  ]);

  protected readonly totalConectado = computed(
    () => [...this.envio(), ...this.lojas()].filter((i) => i.conectado).length,
  );
  protected readonly total = computed(() => this.envio().length + this.lojas().length);

  /** Pronto pra postar: algum app de envio e pelo menos uma loja. */
  protected readonly tudoPronto = computed(
    () => this.envio().some((i) => i.conectado) && this.lojas().some((i) => i.conectado),
  );

  alternar(): void {
    this.aberto.update((v) => !v);
  }

  abrir(item: ItemStatus): void {
    this.aberto.set(false);
    if (item.id === 'whatsapp') this.whatsappUi.abrir();
    else if (item.id === 'telegram') this.telegramUi.abrir();
    else this.lojasUi.abrir(item.id);
  }

  @HostListener('document:click', ['$event'])
  aoClicarFora(ev: MouseEvent): void {
    if (this.aberto() && !this.host.nativeElement.contains(ev.target as Node)) this.aberto.set(false);
  }

  @HostListener('document:keydown.escape')
  aoEsc(): void {
    this.aberto.set(false);
  }
}
