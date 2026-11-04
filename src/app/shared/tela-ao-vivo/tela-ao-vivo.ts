import { Component, ElementRef, OnDestroy, computed, inject, input, signal, viewChild } from '@angular/core';
import { EntradaDesafio, JobsService, QuadroDesafio } from '../../core/services/jobs.service';

const INTERVALO_MS = 800;
/** Sem nenhum quadro depois disso, para de só girar e mostra o conteúdo `[demorou]`. */
const PRAZO_PRIMEIRO_QUADRO_MS = 15000;
/** Andou menos que isso com o botão apertado: é clique, não arraste. */
const LIMIAR_ARRASTE_PX = 5;
/** Caminho do arraste: no máximo 300 pontos, um a cada 10ms no mínimo. */
const MAX_PONTOS_ARRASTE = 300;
const INTERVALO_PONTOS_MS = 10;
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
  /** Rastro do arraste na imagem (frações 0–1), para a pessoa ver o caminho que fez. */
  protected readonly rastro = signal<string | null>(null);

  /**
   * Arraste em curso (quebra-cabeça de arrastar a peça). As fotos chegam a cada ~0,5s, então a
   * peça não anda junto com o mouse aqui: o caminho todo vai ao robô quando a pessoa solta, e ele
   * repete esse mesmo movimento na página, na mesma velocidade.
   */
  private arraste: {
    pontos: { x: number; y: number; ms: number }[];
    fracoes: { x: number; y: number }[];
    ultimo: number;
    x0: number;
    y0: number;
    moveu: boolean;
  } | null = null;
  /** O navegador dispara um "click" depois de soltar o arraste: esse não vira clique na página. */
  private ignorarClique = false;

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

  /** Ponto do mouse na imagem → fração (0–1) e ponto na página do robô, presos à borda. */
  private pontoDe(ev: { clientX: number; clientY: number }) {
    const q = this.quadro();
    const el = this.imagem()?.nativeElement;
    if (!q || !el) return null;
    const r = el.getBoundingClientRect();
    if (!r.width || !r.height) return null;
    const fx = Math.max(0, Math.min(1, (ev.clientX - r.left) / r.width));
    const fy = Math.max(0, Math.min(1, (ev.clientY - r.top) / r.height));
    return { fracao: { x: fx, y: fy }, pagina: { x: Math.round(fx * q.w), y: Math.round(fy * q.h) } };
  }

  protected aoApertar(ev: PointerEvent): void {
    if (ev.button !== 0) return;
    const p = this.pontoDe(ev);
    if (!p) return;
    // Sem isso o navegador começa a selecionar/arrastar a própria imagem.
    ev.preventDefault();
    const el = ev.currentTarget as HTMLElement;
    el.focus();
    el.setPointerCapture?.(ev.pointerId);
    this.arraste = {
      pontos: [{ ...p.pagina, ms: 0 }],
      fracoes: [p.fracao],
      ultimo: ev.timeStamp,
      x0: ev.clientX,
      y0: ev.clientY,
      moveu: false,
    };
  }

  protected aoMover(ev: PointerEvent): void {
    const a = this.arraste;
    if (!a) return;
    if (!a.moveu && Math.hypot(ev.clientX - a.x0, ev.clientY - a.y0) < LIMIAR_ARRASTE_PX) return;
    a.moveu = true;
    if (ev.timeStamp - a.ultimo < INTERVALO_PONTOS_MS || a.pontos.length >= MAX_PONTOS_ARRASTE - 1) return;
    const p = this.pontoDe(ev);
    if (!p) return;
    a.pontos.push({ ...p.pagina, ms: Math.round(ev.timeStamp - a.ultimo) });
    a.fracoes.push(p.fracao);
    a.ultimo = ev.timeStamp;
    this.rastro.set(a.fracoes.map((f) => `${f.x},${f.y}`).join(' '));
  }

  protected aoSoltar(ev: PointerEvent): void {
    const a = this.arraste;
    this.arraste = null;
    if (!a || !a.moveu) return;
    const p = this.pontoDe(ev);
    if (p) {
      a.pontos.push({ ...p.pagina, ms: Math.round(ev.timeStamp - a.ultimo) });
      a.fracoes.push(p.fracao);
    }
    this.ignorarClique = true;
    setTimeout(() => (this.ignorarClique = false), 300);
    this.rastro.set(a.fracoes.map((f) => `${f.x},${f.y}`).join(' '));
    setTimeout(() => this.rastro.set(null), 1500);
    void this.enviar({ t: 'arrastar', pontos: a.pontos });
  }

  protected aoCancelar(): void {
    this.arraste = null;
    this.rastro.set(null);
  }

  /** Clique na imagem → ponto correspondente na página do robô (tamanho real, não o da tela). */
  protected aoClicar(ev: MouseEvent): void {
    if (this.ignorarClique) {
      this.ignorarClique = false;
      return;
    }
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
