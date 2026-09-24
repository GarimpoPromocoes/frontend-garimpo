import { Component, ElementRef, HostListener, inject, signal } from '@angular/core';
import { Aviso, AvisosService } from '../../core/services/avisos.service';

const LOGO: Partial<Record<Aviso['origem'], string>> = {
  mercadolivre: 'lojas/mercadolivre.svg',
  amazon: 'lojas/amazon.svg',
  shopee: 'lojas/shopee.svg',
  telegram: 'lojas/telegram.png',
};

/** Sino do topo: o que caiu e precisa ser reconectado. */
@Component({
  selector: 'app-sino',
  standalone: true,
  templateUrl: './sino.html',
})
export class Sino {
  protected avisos = inject(AvisosService);
  private host = inject(ElementRef<HTMLElement>);

  protected readonly aberto = signal(false);
  protected readonly logo = LOGO;

  alternar(): void {
    const abrir = !this.aberto();
    this.aberto.set(abrir);
    if (abrir) this.avisos.marcarTodosVistos();
  }

  agir(a: Aviso): void {
    this.aberto.set(false);
    this.avisos.agir(a);
  }

  @HostListener('document:click', ['$event'])
  aoClicarFora(ev: MouseEvent): void {
    if (this.aberto() && !this.host.nativeElement.contains(ev.target as Node)) this.aberto.set(false);
  }

  @HostListener('document:keydown.escape')
  aoEsc(): void {
    this.aberto.set(false);
  }

  protected quando(iso: string | null): string {
    if (!iso) return '';
    const s = Math.max(0, Math.round((Date.now() - Date.parse(iso)) / 1000));
    if (s < 60) return 'agora mesmo';
    const m = Math.round(s / 60);
    if (m < 60) return `há ${m} min`;
    const h = Math.round(m / 60);
    if (h < 24) return `há ${h} h`;
    const d = Math.round(h / 24);
    return d === 1 ? 'ontem' : `há ${d} dias`;
  }
}
