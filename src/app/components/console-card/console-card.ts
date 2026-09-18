import { Component, ElementRef, computed, effect, inject, input, output, signal, viewChild } from '@angular/core';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { JobsService } from '../../services/jobs.service';
import { environment } from '../../../environments/environment';
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
  private sanitizer = inject(DomSanitizer);

  // ---- VERIFICAÇÃO DE SEGURANÇA DO MERCADO LIVRE ----------------------------
  // Quando o ML exige o desafio humano, NINGUÉM além de uma pessoa resolve —
  // e o robô fica sem abrir página de produto até lá. Antes o aviso só dizia
  // "abra a tela do navegador no painel", mas o job de postagem roda sem tela
  // publicada: não havia o que abrir. Agora o próprio aviso traz o botão, que
  // sobe a tela sob demanda (POST /api/jobs/tela).
  protected readonly desafio = computed(() => this.jobsService.desafioMl());
  protected readonly janelaAberta = signal(false);
  protected readonly abrindoTela = signal(false);
  protected readonly erroTela = signal<string | null>(null);

  protected readonly novncUrl = computed<string | null>(() => {
    const porta = this.jobsService.vncPort();
    if (!porta) return null;
    if (environment.vncBase) return `${environment.vncBase.replace(/\/$/, '')}:${porta}/`;
    return `${window.location.protocol}//${window.location.hostname}:${porta}/`;
  });
  protected readonly novncUrlSegura = computed<SafeResourceUrl | null>(() => {
    const url = this.novncUrl();
    return url ? this.sanitizer.bypassSecurityTrustResourceUrl(url) : null;
  });

  async resolverVerificacao(): Promise<void> {
    this.erroTela.set(null);
    this.abrindoTela.set(true);
    const r = await this.jobsService.abrirTela();
    this.abrindoTela.set(false);
    if (!r.ok) {
      this.erroTela.set(r.erro ?? null);
      return;
    }
    this.janelaAberta.set(true);
  }

  fecharJanela(): void {
    this.janelaAberta.set(false);
  }

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
