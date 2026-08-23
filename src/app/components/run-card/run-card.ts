import { Component, ElementRef, computed, effect, inject, signal, viewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { AlvoGrupos, JobsService } from '../../services/jobs.service';
import { StatusService } from '../../services/status.service';
import { ConfigService } from '../../services/config.service';

@Component({
  selector: 'app-run-card',
  standalone: true,
  imports: [FormsModule],
  templateUrl: './run-card.html',
})
export class RunCard {
  protected jobsService = inject(JobsService);
  protected statusService = inject(StatusService);
  protected configService = inject(ConfigService);

  protected readonly grupos = computed(() => this.configService.config()?.grupos ?? []);

  protected readonly alvo = signal<AlvoGrupos>('todos');
  protected readonly selecionados = signal<Set<string>>(new Set());
  protected readonly umGrupoId = signal<string | null>(null);

  protected readonly maxMaisVendidos = signal(20);
  protected readonly erro = signal<string | null>(null);

  private readonly consoleEl = viewChild<ElementRef<HTMLDivElement>>('consoleEl');

  constructor() {
    // Rola o console pro final sempre que uma linha nova chega.
    effect(() => {
      this.jobsService.linhas();
      queueMicrotask(() => {
        const el = this.consoleEl()?.nativeElement;
        if (el) el.scrollTop = el.scrollHeight;
      });
    });
  }

  escolherAlvo(alvo: AlvoGrupos): void {
    this.alvo.set(alvo);
    this.erro.set(null);
  }

  toggleSelecionado(id: string, marcado: boolean): void {
    this.selecionados.update((atual) => {
      const novo = new Set(atual);
      if (marcado) novo.add(id);
      else novo.delete(id);
      return novo;
    });
  }

  escolherUm(id: string): void {
    this.umGrupoId.set(id);
  }

  async executarGrupos(): Promise<void> {
    this.erro.set(null);

    if (this.grupos().length === 0) {
      this.erro.set('Cadastre pelo menos 1 grupo antes de rodar.');
      return;
    }
    let ids: string[] = [];
    if (this.alvo() === 'selecionados') {
      ids = [...this.selecionados()];
      if (!ids.length) {
        this.erro.set('Selecione pelo menos 1 grupo.');
        return;
      }
    } else if (this.alvo() === 'um') {
      if (!this.umGrupoId()) {
        this.erro.set('Escolha o grupo que vai rodar.');
        return;
      }
      ids = [this.umGrupoId()!];
    }

    const ok = window.confirm('Isso vai POSTAR mensagens de verdade nos grupos do WhatsApp escolhidos. Continuar?');
    if (!ok) return;

    const r = await this.jobsService.iniciar('grupos', { alvo: this.alvo(), ids });
    if (!r.ok) this.erro.set(r.erro ?? null);
  }

  async garimparMaisVendidos(): Promise<void> {
    this.erro.set(null);
    const r = await this.jobsService.iniciar('mais-vendidos', { max: this.maxMaisVendidos() });
    if (!r.ok) this.erro.set(r.erro ?? null);
  }

  async parar(): Promise<void> {
    await this.jobsService.parar();
  }
}
