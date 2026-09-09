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

  protected readonly erro = signal<string | null>(null);
  protected readonly iniciando = signal(false);
  protected readonly parando = signal(false);

  // Agendamento (janela + intervalo): liga o loop AUTOMATICO sozinho, dentro
  // da janela. O intervalo tambem pauta o loop MANUAL do botao "Executar".
  protected readonly agendamentoAtivo = signal(false);
  protected readonly horaInicio = signal('08:00');
  protected readonly horaFim = signal('22:00');
  protected readonly intervaloMinMinutos = signal(20);
  protected readonly intervaloMaxMinutos = signal(60);
  protected readonly salvandoAgendamento = signal(false);
  protected readonly mensagemAgendamento = signal<{ tipo: 'ok' | 'erro'; texto: string } | null>(null);

  protected readonly rodandoContinuo = computed(() => !!this.statusService.status()?.agendamento?.manual?.ativo);

  // Garimpo continuo: um unico job de longa duracao (sem passar pelo
  // agendamento) — ver comandos/garimpar-ofertas.js --loop.
  protected readonly garimpoRodando = computed(
    () => this.jobsService.tipo() === 'ofertas' && this.jobsService.rodando()
  );

  // "Parar" precisa estar disponível sempre que QUALQUER coisa estiver
  // rodando: o loop manual, o garimpo continuo, um job avulso ou até um
  // processo detectado como rodando fora do dashboard.
  protected readonly algoRodando = computed(
    () =>
      this.rodandoContinuo() ||
      this.jobsService.rodando() ||
      !!this.statusService.status()?.processoExterno?.rodando
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
      this.agendamentoAtivo.set(cfg.agendamento.ativo);
      this.horaInicio.set(cfg.agendamento.horaInicio);
      this.horaFim.set(cfg.agendamento.horaFim);
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

  escolherUm(id: string): void {
    this.umGrupoId.set(id);
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
    } else if (this.alvo() === 'um') {
      if (!this.umGrupoId()) {
        this.erro.set('Escolha o grupo que vai rodar.');
        return;
      }
      ids = [this.umGrupoId()!];
    }

    const ok = window.confirm(
      'Isso vai POSTAR mensagens de verdade nos grupos do WhatsApp escolhidos, uma de cada vez, até você clicar em "Parar". Continuar?'
    );
    if (!ok) return;

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

  // Liga o garimpo continuo: fica coletando ofertas reais do Mercado Livre
  // rodada após rodada (sem postar nada) até você clicar em "Parar".
  async garimpar(): Promise<void> {
    this.erro.set(null);
    this.iniciando.set(true);
    const r = await this.jobsService.iniciar('ofertas', { loop: true });
    this.iniciando.set(false);
    if (!r.ok) this.erro.set(r.erro ?? null);
    await this.statusService.atualizar();
  }

  async salvarAgendamento(): Promise<void> {
    this.mensagemAgendamento.set(null);

    if (this.horaInicio() === this.horaFim()) {
      this.mensagemAgendamento.set({ tipo: 'erro', texto: 'Hora de início e hora de fim precisam ser diferentes.' });
      return;
    }
    if (this.intervaloMinMinutos() > this.intervaloMaxMinutos()) {
      this.mensagemAgendamento.set({ tipo: 'erro', texto: 'O intervalo mínimo não pode ser maior que o máximo.' });
      return;
    }

    this.salvandoAgendamento.set(true);
    const r = await this.configService.salvar({
      agendamento: {
        ativo: this.agendamentoAtivo(),
        horaInicio: this.horaInicio(),
        horaFim: this.horaFim(),
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
