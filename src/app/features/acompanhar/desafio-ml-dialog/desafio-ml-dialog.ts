import { Component, ElementRef, OnDestroy, computed, effect, inject, signal, viewChild } from '@angular/core';
import { JobsService, QuadroDesafio } from '../../../core/services/jobs.service';

const INTERVALO_MS = 800;
/** Sem nenhum quadro depois disso, o popup para de só girar e explica o que houve. */
const PRAZO_PRIMEIRO_QUADRO_MS = 15000;
const TECLAS = new Set([
  'Enter', 'Tab', 'Backspace', 'Delete', 'Escape',
  'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'PageUp', 'PageDown', 'Home', 'End',
]);

/**
 * Popup com a tela da verificação de segurança do Mercado Livre. O navegador do robô roda numa VM,
 * então o robô manda quadros da aba do desafio e o painel devolve os cliques/teclas — quem resolve
 * é a pessoa, aqui. Some sozinho quando a verificação passa.
 */
@Component({
  selector: 'app-desafio-ml-dialog',
  standalone: true,
  templateUrl: './desafio-ml-dialog.html',
})
export class DesafioMlDialog implements OnDestroy {
  protected jobs = inject(JobsService);

  protected readonly aberto = computed(() => !!this.jobs.desafioMl() && this.jobs.desafioPopupAberto());
  protected readonly quadro = signal<QuadroDesafio | null>(null);
  protected readonly src = computed(() => {
    const q = this.quadro();
    return q ? `data:image/jpeg;base64,${q.img}` : null;
  });
  protected readonly texto = signal('');
  /** O primeiro quadro não chegou a tempo: mostra o que fazer em vez de girar para sempre. */
  protected readonly demorou = signal(false);
  /** Quadro mais velho que isso: a tela do robô parou de mandar imagem. */
  protected readonly atualizando = signal(false);
  private abertoEm = 0;
  private ultimoQuadroEm = 0;

  private imagem = viewChild<ElementRef<HTMLImageElement>>('imagem');
  private relogio: ReturnType<typeof setTimeout> | null = null;
  private seq = 0;
  private buscando = false;

  constructor() {
    effect(() => {
      if (this.aberto()) this.iniciar();
      else this.parar();
    });
  }

  ngOnDestroy(): void {
    this.parar();
  }

  private iniciar(): void {
    if (this.relogio || this.buscando) return;
    this.seq = 0;
    this.demorou.set(false);
    this.abertoEm = Date.now();
    void this.buscar();
  }

  /** "Tentar de novo": recomeça a busca do zero. */
  protected tentarDeNovo(): void {
    if (this.relogio) clearTimeout(this.relogio);
    this.relogio = null;
    this.quadro.set(null);
    this.iniciar();
  }

  private parar(): void {
    if (this.relogio) clearTimeout(this.relogio);
    this.relogio = null;
    this.quadro.set(null);
    this.texto.set('');
  }

  private async buscar(): Promise<void> {
    this.buscando = true;
    try {
      const q = await this.jobs.quadroDoDesafio(this.seq);
      if (q && this.aberto()) {
        this.seq = q.seq;
        this.quadro.set(q);
        this.ultimoQuadroEm = Date.now();
        this.demorou.set(false);
        this.atualizando.set(false);
      }
    } catch (_) {
    } finally {
      if (!this.quadro() && Date.now() - this.abertoEm > PRAZO_PRIMEIRO_QUADRO_MS) this.demorou.set(true);
      this.buscando = false;
      if (this.aberto()) this.relogio = setTimeout(() => ((this.relogio = null), void this.buscar()), INTERVALO_MS);
    }
  }

  private async enviar(entrada: Parameters<JobsService['entradaNoDesafio']>[0]): Promise<void> {
    this.atualizando.set(true);
    try {
      await this.jobs.entradaNoDesafio(entrada);
      // Pede o próximo quadro logo, pra o resultado do clique aparecer sem esperar o intervalo.
      if (this.relogio && !this.buscando) {
        clearTimeout(this.relogio);
        this.relogio = setTimeout(() => ((this.relogio = null), void this.buscar()), 350);
      }
    } catch (_) {
      this.atualizando.set(false);
    }
    // A tela nem sempre muda com uma ação (clique num lugar vazio): não deixa o
    // "Atualizando…" preso.
    setTimeout(() => this.atualizando.set(false), 2500);
  }

  /** Clique na imagem → ponto correspondente na página do robô (tamanho real, não o da tela). */
  protected readonly marca = signal<{ x: number; y: number } | null>(null);

  protected aoClicar(ev: MouseEvent): void {
    const q = this.quadro();
    const el = this.imagem()?.nativeElement;
    if (!q || !el) return;
    const r = el.getBoundingClientRect();
    if (!r.width || !r.height) return;
    this.marca.set({ x: (ev.clientX - r.left) / r.width, y: (ev.clientY - r.top) / r.height });
    setTimeout(() => this.marca.set(null), 900);
    void this.enviar({
      t: 'clique',
      x: Math.round(((ev.clientX - r.left) / r.width) * q.w),
      y: Math.round(((ev.clientY - r.top) / r.height) * q.h),
    });
  }

  protected aoRolar(ev: WheelEvent): void {
    ev.preventDefault();
    void this.enviar({ t: 'rolar', dy: Math.round(ev.deltaY) });
  }

  /** Com o foco na imagem, o que a pessoa digita vai direto pra página. */
  protected aoTeclar(ev: KeyboardEvent): void {
    if (ev.ctrlKey || ev.metaKey || ev.altKey) return;
    if (ev.key.length === 1) {
      ev.preventDefault();
      void this.enviar(ev.key === ' ' ? { t: 'tecla', tecla: 'Space' } : { t: 'texto', texto: ev.key });
    } else if (TECLAS.has(ev.key)) {
      ev.preventDefault();
      void this.enviar({ t: 'tecla', tecla: ev.key });
    }
  }

  protected enviarTexto(): void {
    const t = this.texto().trim();
    if (!t) return;
    this.texto.set('');
    void this.enviar({ t: 'texto', texto: t });
  }

  protected tecla(tecla: string): void {
    void this.enviar({ t: 'tecla', tecla });
  }

  protected fechar(): void {
    this.jobs.desafioPopupAberto.set(false);
  }
}
