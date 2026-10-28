import { Component, ElementRef, OnDestroy, computed, inject, input, signal, viewChild } from '@angular/core';
import { EntradaDesafio, JobsService, QuadroDesafio } from '../../core/services/jobs.service';

const INTERVALO_MS = 800;
/** Sem nenhum quadro depois disso, para de só girar e mostra o conteúdo `[demorou]`. */
const PRAZO_PRIMEIRO_QUADRO_MS = 15000;
const TECLAS = new Set([
  'Enter', 'Tab', 'Backspace', 'Delete', 'Escape',
  'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'PageUp', 'PageDown', 'Home', 'End',
]);

/**
 * Tela ao vivo do navegador do robô. Ele roda numa VM, então manda "fotos" da aba e o painel
 * devolve os cliques/teclas — quem mexe é a pessoa, aqui. Usada no desafio de segurança do ML e
 * quando a pessoa assume o navegador no login de uma loja.
 */
@Component({
  selector: 'app-tela-ao-vivo',
  standalone: true,
  templateUrl: './tela-ao-vivo.html',
})
export class TelaAoVivo implements OnDestroy {
  private jobs = inject(JobsService);

  /** Nome da loja, na barra da tela e nos textos de acessibilidade. */
  readonly rotulo = input.required<string>();
  /** Texto enquanto o primeiro quadro não chega. */
  readonly carregando = input('Abrindo a tela…');

  protected readonly quadro = signal<QuadroDesafio | null>(null);
  protected readonly src = computed(() => {
    const q = this.quadro();
    return q ? `data:image/jpeg;base64,${q.img}` : null;
  });
  protected readonly texto = signal('');
  /** O primeiro quadro não chegou a tempo: mostra o conteúdo `[demorou]` em vez de girar para sempre. */
  protected readonly demorou = signal(false);
  protected readonly atualizando = signal(false);
  /** O clique/tecla não chegou ao robô (a tela ao vivo já fechou, por exemplo). */
  protected readonly erro = signal<string | null>(null);
  protected readonly marca = signal<{ x: number; y: number } | null>(null);

  private imagem = viewChild<ElementRef<HTMLImageElement>>('imagem');
  private relogio: ReturnType<typeof setTimeout> | null = null;
  private seq = 0;
  private buscando = false;
  private ligada = false;
  private destruida = false;
  private abertaEm = 0;

  constructor() {
    this.iniciar();
  }

  ngOnDestroy(): void {
    this.destruida = true;
    this.ligada = false;
    if (this.relogio) clearTimeout(this.relogio);
    this.relogio = null;
  }

  private iniciar(): void {
    if (this.ligada || this.destruida) return;
    this.ligada = true;
    this.seq = 0;
    this.demorou.set(false);
    this.abertaEm = Date.now();
    void this.buscar();
  }

  /** "Tentar de novo": recomeça a busca do zero. */
  tentarDeNovo(): void {
    if (this.relogio) clearTimeout(this.relogio);
    this.relogio = null;
    this.quadro.set(null);
    this.ligada = false;
    if (!this.buscando) this.iniciar();
  }

  private async buscar(): Promise<void> {
    this.buscando = true;
    try {
      const q = await this.jobs.quadroDoDesafio(this.seq);
      if (q && this.ligada) {
        this.seq = q.seq;
        this.quadro.set(q);
        this.demorou.set(false);
        this.atualizando.set(false);
      }
    } catch (_) {
    } finally {
      if (!this.quadro() && Date.now() - this.abertaEm > PRAZO_PRIMEIRO_QUADRO_MS) this.demorou.set(true);
      this.buscando = false;
      if (this.ligada) this.relogio = setTimeout(() => ((this.relogio = null), void this.buscar()), INTERVALO_MS);
      else this.iniciar();
    }
  }

  private async enviar(entrada: EntradaDesafio): Promise<void> {
    this.atualizando.set(true);
    try {
      await this.jobs.entradaNoDesafio(entrada);
      this.erro.set(null);
      // Pede o próximo quadro logo, pra o resultado do clique aparecer sem esperar o intervalo.
      if (this.relogio && !this.buscando) {
        clearTimeout(this.relogio);
        this.relogio = setTimeout(() => ((this.relogio = null), void this.buscar()), 350);
      }
    } catch (e: any) {
      this.atualizando.set(false);
      this.erro.set(e?.error?.erro ? `Não chegou ao robô: ${e.error.erro}` : 'Não chegou ao robô. Tente de novo.');
    }
    // A tela nem sempre muda com uma ação (clique num lugar vazio): não deixa o
    // "Atualizando…" preso.
    setTimeout(() => this.atualizando.set(false), 2500);
  }

  /** Clique na imagem → ponto correspondente na página do robô (tamanho real, não o da tela). */
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
    const t = this.texto();
    if (!t) return;
    this.texto.set('');
    void this.enviar({ t: 'texto', texto: t });
  }

  protected tecla(tecla: string): void {
    void this.enviar({ t: 'tecla', tecla });
  }
}
