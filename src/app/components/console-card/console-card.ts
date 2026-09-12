import { Component, ElementRef, computed, effect, inject, input, output, signal, viewChild } from '@angular/core';
import { JobsService } from '../../services/jobs.service';
import { FeedItem, construirFeed } from './log-feed';

@Component({
  selector: 'app-console-card',
  standalone: true,
  templateUrl: './console-card.html',
})
export class ConsoleCard {
  // No Painel o feed aparece resumido (ultimas linhas, altura menor) com um
  // atalho pra aba "Atividade", que mostra o historico completo.
  compacto = input(false);
  verTudo = output<void>();

  protected jobsService = inject(JobsService);

  // Feed amigavel (emoji + frase em portugues) e' o padrao. O log tecnico
  // cru fica escondido atras de um botao — util pra quem for dar suporte,
  // mas nao deve ser a primeira coisa que a pessoa leiga ve.
  protected readonly modoTecnico = signal(false);

  protected readonly linhasBrutas = computed(() => {
    const todas = this.jobsService.linhas();
    return this.compacto() ? todas.slice(-60) : todas;
  });

  protected readonly feed = computed<FeedItem[]>(() => construirFeed(this.linhasBrutas()));

  private readonly consoleEl = viewChild<ElementRef<HTMLDivElement>>('consoleEl');
  private readonly feedEl = viewChild<ElementRef<HTMLDivElement>>('feedEl');

  constructor() {
    effect(() => {
      this.feed();
      this.linhasBrutas();
      const tecnico = this.modoTecnico();
      queueMicrotask(() => {
        const el = (tecnico ? this.consoleEl() : this.feedEl())?.nativeElement;
        if (el) el.scrollTop = el.scrollHeight;
      });
    });
  }
}
