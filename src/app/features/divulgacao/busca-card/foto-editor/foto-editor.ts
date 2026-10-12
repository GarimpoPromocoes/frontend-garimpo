import {
  AfterViewInit,
  Component,
  ElementRef,
  OnDestroy,
  computed,
  input,
  output,
  signal,
  viewChild,
} from '@angular/core';

/** Uma foto que o editor oferece (a montada pelo robô, as da galeria do anúncio). */
export interface FonteFoto {
  rotulo: string;
  carregar: () => Promise<Blob>;
}

/** Lado da foto que sai do editor (a miniatura da prévia do WhatsApp é quadrada). */
const SAIDA = 1200;
const QUALIDADE = 0.92;
/** Zoom 1 = a foto cobre o quadrado inteiro; até 5x mais perto. */
const ZOOM_MAX = 5;
const PASSO_ZOOM = 1.2;
const PASSO_TECLA = 12;

interface Ponto {
  x: number;
  y: number;
}

/**
 * Recorte quadrado da foto da postagem, como o de foto de perfil: arrastar pra posicionar, zoom pela
 * roda do mouse, pinça, botões ou barra. Diminuir até a foto caber inteira deixa fundo branco em volta.
 * O estado fica em coordenadas da foto (zoom + ponto da foto no centro do quadrado), então o recorte
 * não muda quando o quadrado muda de tamanho na tela.
 */
@Component({
  selector: 'app-foto-editor',
  standalone: true,
  templateUrl: './foto-editor.html',
  styleUrl: './foto-editor.scss',
})
export class FotoEditor implements AfterViewInit, OnDestroy {
  readonly fontes = input.required<FonteFoto[]>();
  readonly salvando = input(false);
  readonly aplicar = output<Blob>();
  readonly cancelar = output<void>();

  private readonly quadro = viewChild.required<ElementRef<HTMLDivElement>>('quadro');

  /** Endereço local (blob) de cada fonte: undefined = carregando, null = não carregou. */
  protected readonly urls = signal<(string | null | undefined)[]>([]);
  protected readonly atual = signal(-1);
  protected readonly img = signal<HTMLImageElement | null>(null);
  protected readonly lado = signal(360);
  protected readonly zoom = signal(1);
  protected readonly centro = signal<Ponto>({ x: 0, y: 0 });
  protected readonly arrastando = signal(false);
  protected readonly erro = signal<string | null>(null);
  protected readonly gerando = signal(false);

  private readonly escalaCobrir = computed(() => {
    const i = this.img();
    return i ? this.lado() / Math.min(i.naturalWidth, i.naturalHeight) : 1;
  });
  /** Zoom em que a foto inteira cabe no quadrado. */
  protected readonly zoomMin = computed(() => {
    const i = this.img();
    return i ? Math.min(i.naturalWidth, i.naturalHeight) / Math.max(i.naturalWidth, i.naturalHeight) : 1;
  });
  protected readonly zoomMax = ZOOM_MAX;
  private readonly escala = computed(() => this.escalaCobrir() * this.zoom());
  /** Onde a foto fica dentro do quadrado, em px de tela. */
  protected readonly posicao = computed(() => {
    const i = this.img();
    const s = this.escala();
    const c = this.centro();
    const l = this.lado();
    if (!i) return { x: 0, y: 0, w: 0, h: 0 };
    return { x: l / 2 - c.x * s, y: l / 2 - c.y * s, w: i.naturalWidth * s, h: i.naturalHeight * s };
  });
  /** A foto não cobre o quadrado: o que sobrar sai branco. */
  protected readonly sobraFundo = computed(() => {
    const p = this.posicao();
    const l = this.lado();
    return !!this.img() && (p.x > 0.5 || p.y > 0.5 || p.x + p.w < l - 0.5 || p.y + p.h < l - 0.5);
  });
  protected readonly medidas = computed(() => {
    const i = this.img();
    return i ? `${i.naturalWidth}×${i.naturalHeight}` : '';
  });

  private observador: ResizeObserver | null = null;
  private readonly ponteiros = new Map<number, Ponto>();
  private gesto: { inicio: Ponto; centro: Ponto; distancia: number; zoom: number } | null = null;
  private destruido = false;

  ngAfterViewInit(): void {
    const el = this.quadro().nativeElement;
    this.lado.set(el.clientWidth || 360);
    this.observador = new ResizeObserver(() => {
      if (el.clientWidth) this.lado.set(el.clientWidth);
    });
    this.observador.observe(el);
    void this.carregarFontes();
  }

  ngOnDestroy(): void {
    this.destruido = true;
    this.observador?.disconnect();
    for (const u of this.urls()) if (u) URL.revokeObjectURL(u);
  }

  private async carregarFonte(i: number): Promise<string | null> {
    let url: string | null = null;
    try {
      url = URL.createObjectURL(await this.fontes()[i].carregar());
    } catch {
      url = null;
    }
    if (this.destruido) {
      if (url) URL.revokeObjectURL(url);
      return null;
    }
    this.urls.update((lista) => lista.map((u, j) => (j === i ? url : u)));
    return url;
  }

  private async carregarFontes(): Promise<void> {
    const fontes = this.fontes();
    if (!fontes.length) return;
    this.urls.set(fontes.map(() => undefined));
    // A primeira (a foto da postagem) abre antes; as da galeria vão chegando nas miniaturas — se a
    // primeira não abrir, vale a primeira da galeria que chegar.
    if (await this.carregarFonte(0)) await this.escolher(0);
    await Promise.all(
      fontes.slice(1).map(async (_, k) => {
        const url = await this.carregarFonte(k + 1);
        if (url && this.atual() < 0) await this.escolher(k + 1);
      }),
    );
    if (this.atual() < 0 && !this.destruido) this.erro.set('Não consegui carregar nenhuma foto do anúncio.');
  }

  protected async escolher(i: number): Promise<void> {
    const url = this.urls()[i];
    if (!url || this.gerando()) return;
    const im = new Image();
    im.decoding = 'async';
    im.src = url;
    try {
      await im.decode();
    } catch {
      this.erro.set('Essa foto não abriu — escolha outra.');
      return;
    }
    this.erro.set(null);
    this.atual.set(i);
    this.img.set(im);
    this.preencher();
  }

  /** Mantém o recorte dentro dos limites: foto maior que o quadrado cobre ele; menor fica dentro dele. */
  private limitar(c: Ponto, zoom = this.zoom()): Ponto {
    const i = this.img();
    if (!i) return c;
    const s = this.escalaCobrir() * zoom;
    const meio = this.lado() / (2 * s);
    const eixo = (v: number, tamanho: number) => {
      const a = meio;
      const b = tamanho - meio;
      return Math.min(Math.max(v, Math.min(a, b)), Math.max(a, b));
    };
    return { x: eixo(c.x, i.naturalWidth), y: eixo(c.y, i.naturalHeight) };
  }

  /** Zoom mantendo parado o ponto `tela` (px dentro do quadrado; sem ele, o centro). */
  private zoomEm(z: number, tela?: Ponto): void {
    if (!this.img()) return;
    const novo = Math.min(Math.max(z, this.zoomMin()), ZOOM_MAX);
    const l = this.lado();
    const p = tela ?? { x: l / 2, y: l / 2 };
    const antes = this.escala();
    const depois = this.escalaCobrir() * novo;
    const c = this.centro();
    const naFoto = { x: c.x + (p.x - l / 2) / antes, y: c.y + (p.y - l / 2) / antes };
    this.zoom.set(novo);
    this.centro.set(this.limitar({ x: naFoto.x - (p.x - l / 2) / depois, y: naFoto.y - (p.y - l / 2) / depois }, novo));
  }

  private centralizar(): void {
    const i = this.img();
    if (i) this.centro.set(this.limitar({ x: i.naturalWidth / 2, y: i.naturalHeight / 2 }));
  }

  protected preencher(): void {
    this.zoom.set(1);
    this.centralizar();
  }

  protected encaixar(): void {
    this.zoom.set(this.zoomMin());
    this.centralizar();
  }

  protected recentralizar(): void {
    this.centralizar();
  }

  protected aproximar(): void {
    this.zoomEm(this.zoom() * PASSO_ZOOM);
  }

  protected afastar(): void {
    this.zoomEm(this.zoom() / PASSO_ZOOM);
  }

  protected aoMudarZoom(valor: string): void {
    this.zoomEm(Number(valor));
  }

  private pontoNoQuadro(e: { clientX: number; clientY: number }): Ponto {
    const r = this.quadro().nativeElement.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }

  private recomecarGesto(): void {
    const pts = [...this.ponteiros.values()];
    if (!pts.length) {
      this.gesto = null;
      return;
    }
    const inicio = pts.length > 1 ? { x: (pts[0].x + pts[1].x) / 2, y: (pts[0].y + pts[1].y) / 2 } : pts[0];
    const distancia = pts.length > 1 ? Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y) : 0;
    this.gesto = { inicio, centro: this.centro(), distancia, zoom: this.zoom() };
  }

  protected aoApertar(e: PointerEvent): void {
    if (!this.img()) return;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    this.ponteiros.set(e.pointerId, this.pontoNoQuadro(e));
    this.arrastando.set(true);
    this.recomecarGesto();
  }

  protected aoMover(e: PointerEvent): void {
    if (!this.ponteiros.has(e.pointerId) || !this.gesto) return;
    this.ponteiros.set(e.pointerId, this.pontoNoQuadro(e));
    const pts = [...this.ponteiros.values()];
    const g = this.gesto;
    if (pts.length > 1 && g.distancia > 0) {
      // Pinça: zoom pela distância entre os dedos, em volta do ponto entre eles.
      const meio = { x: (pts[0].x + pts[1].x) / 2, y: (pts[0].y + pts[1].y) / 2 };
      this.centro.set(g.centro);
      this.zoom.set(g.zoom);
      this.zoomEm(g.zoom * (Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y) / g.distancia), meio);
      return;
    }
    const s = this.escala();
    const p = pts[0];
    this.centro.set(this.limitar({ x: g.centro.x - (p.x - g.inicio.x) / s, y: g.centro.y - (p.y - g.inicio.y) / s }));
  }

  protected aoSoltar(e: PointerEvent): void {
    this.ponteiros.delete(e.pointerId);
    this.recomecarGesto();
    if (!this.ponteiros.size) this.arrastando.set(false);
  }

  protected aoRolar(e: WheelEvent): void {
    if (!this.img()) return;
    e.preventDefault();
    this.zoomEm(this.zoom() * Math.exp(-e.deltaY * 0.0015), this.pontoNoQuadro(e));
  }

  protected aoTeclar(e: KeyboardEvent): void {
    if (!this.img()) return;
    const s = this.escala();
    const c = this.centro();
    const mover: Record<string, Ponto> = {
      ArrowLeft: { x: -PASSO_TECLA, y: 0 },
      ArrowRight: { x: PASSO_TECLA, y: 0 },
      ArrowUp: { x: 0, y: -PASSO_TECLA },
      ArrowDown: { x: 0, y: PASSO_TECLA },
    };
    if (mover[e.key]) {
      // A seta move a foto (como arrastar): seta pra direita leva a foto pra direita.
      this.centro.set(this.limitar({ x: c.x - mover[e.key].x / s, y: c.y - mover[e.key].y / s }));
    } else if (e.key === '+' || e.key === '=') this.aproximar();
    else if (e.key === '-') this.afastar();
    else return;
    e.preventDefault();
  }

  /** Desenha o recorte em 1200×1200 (fundo branco) e entrega o JPEG. */
  protected async confirmar(): Promise<void> {
    const i = this.img();
    if (!i || this.gerando() || this.salvando()) return;
    this.gerando.set(true);
    try {
      const canvas = document.createElement('canvas');
      canvas.width = SAIDA;
      canvas.height = SAIDA;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('sem canvas');
      const k = SAIDA / this.lado();
      const p = this.posicao();
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, SAIDA, SAIDA);
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(i, p.x * k, p.y * k, p.w * k, p.h * k);
      const blob = await new Promise<Blob | null>((ok) => canvas.toBlob(ok, 'image/jpeg', QUALIDADE));
      if (!blob) throw new Error('sem imagem');
      this.aplicar.emit(blob);
    } catch {
      this.erro.set('Não consegui gerar a foto recortada neste navegador.');
    } finally {
      this.gerando.set(false);
    }
  }
}
