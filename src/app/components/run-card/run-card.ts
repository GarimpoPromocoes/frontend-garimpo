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

  protected readonly erro = signal<string | null>(null);
  protected readonly iniciando = signal(false);
  protected readonly parando = signal(false);

  // Intervalo entre postagens do loop do botão "Executar".
  protected readonly intervaloMinMinutos = signal(20);
  protected readonly intervaloMaxMinutos = signal(60);
  protected readonly salvandoAgendamento = signal(false);
  protected readonly mensagemAgendamento = signal<{ tipo: 'ok' | 'erro'; texto: string } | null>(null);

  protected readonly rodandoContinuo = computed(() => !!this.statusService.status()?.agendamento?.manual?.ativo);

  // "Parar" precisa estar disponível sempre que QUALQUER coisa estiver
  // rodando: o loop manual, o garimpo continuo, um job avulso ou até um
  // processo detectado como rodando fora do dashboard.
  protected readonly algoRodando = computed(
    () =>
      this.rodandoContinuo() ||
      this.jobsService.rodando() ||
      !!this.statusService.status()?.processoExterno?.rodando
  );

  // Última/próxima publicação REAL (confirmada no WhatsApp) do loop manual.
  protected readonly ultimaPublicacao = computed(
    () => this.statusService.status()?.agendamento?.manual?.ultimaRodadaEm ?? null
  );

  protected readonly proximaPublicacao = computed(
    () => this.statusService.status()?.agendamento?.manual?.proximaRodadaEm ?? null
  );

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

    effect(() => {
      const cfg = this.configService.config();
      if (!cfg) return;
      this.intervaloMinMinutos.set(cfg.agendamento.intervaloMinMinutos);
      this.intervaloMaxMinutos.set(cfg.agendamento.intervaloMaxMinutos);
    });
  }

  formatarData(iso: string | null): string {
    if (!iso) return '—';
    return new Date(iso).toLocaleString('pt-BR');
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

  // Liga o loop continuo: posta 1 mensagem por vez (com intervalo aleatorio)
  // nos grupos escolhidos ate o "Parar" ser clicado.
  async executar(): Promise<void> {
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
    }

    this.iniciando.set(true);
    const r = await this.jobsService.iniciarContinuo(this.alvo(), ids);
    this.iniciando.set(false);
    if (!r.ok) this.erro.set(r.erro ?? null);
    await this.statusService.atualizar();
  }

  // Fica em "loading" ate CONFIRMAR que tudo realmente parou (o pedido de
  // parar volta na hora, mas o job em si pode levar alguns segundos pra
  // encerrar de verdade — ex.: o garimpo termina o produto atual antes de
  // sair). Consulta o status a cada 500ms ate algoRodando() virar false, com
  // um teto de 30s pra nunca travar o botão pra sempre.
  async parar(): Promise<void> {
    this.parando.set(true);
    try {
      await this.jobsService.pararTudo();
      const prazoFinal = Date.now() + 30000;
      while (this.algoRodando() && Date.now() < prazoFinal) {
        await new Promise((r) => setTimeout(r, 500));
        await this.statusService.atualizar();
      }
    } finally {
      this.parando.set(false);
    }
  }

  async salvarAgendamento(): Promise<void> {
    this.mensagemAgendamento.set(null);

    if (this.intervaloMinMinutos() > this.intervaloMaxMinutos()) {
      this.mensagemAgendamento.set({ tipo: 'erro', texto: 'O intervalo mínimo não pode ser maior que o máximo.' });
      return;
    }

    this.salvandoAgendamento.set(true);
    const r = await this.configService.salvar({
      agendamento: {
        intervaloMinMinutos: this.intervaloMinMinutos(),
        intervaloMaxMinutos: this.intervaloMaxMinutos(),
      },
    });
    this.salvandoAgendamento.set(false);
    this.mensagemAgendamento.set(
      r.ok ? { tipo: 'ok', texto: 'Salvo!' } : { tipo: 'erro', texto: r.erro ?? 'Erro ao salvar.' }
    );
    if (r.ok) setTimeout(() => this.mensagemAgendamento.set(null), 3000);
  }
}
