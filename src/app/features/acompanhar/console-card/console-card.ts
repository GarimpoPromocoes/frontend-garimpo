import { Component, ElementRef, computed, effect, inject, input, output, viewChild } from '@angular/core';
import { JobsService } from '../../../core/services/jobs.service';
import { FeedItem, construirFeed } from './log-feed';

@Component({
  selector: 'app-console-card',
  standalone: true,
  templateUrl: './console-card.html',
})
export class ConsoleCard {
  compacto = input(false);
  verTudo = output<void>();

  protected jobsService = inject(JobsService);

  protected readonly desafio = computed(() => this.jobsService.desafioMl());

  protected readonly linhasBrutas = computed(() => {
    const todas = this.jobsService.linhas();
    return this.compacto() ? todas.slice(-60) : todas;
  });

  protected readonly feed = computed<FeedItem[]>(() => construirFeed(this.linhasBrutas()));

  private readonly feedEl = viewChild<ElementRef<HTMLDivElement>>('feedEl');

  /** true enquanto o usuário está no fim do feed; se rolou pra cima, não puxamos de volta. */
  private grudadoNoFim = true;

  constructor() {
    effect(() => {
      this.feed();
      queueMicrotask(() => {
        const el = this.feedEl()?.nativeElement;
        if (el && this.grudadoNoFim) el.scrollTop = el.scrollHeight;
      });
    });
  }

  protected aoRolar(): void {
    const el = this.feedEl()?.nativeElement;
    if (!el) return;
    this.grudadoNoFim = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
  }
}
