import { Injectable, computed, inject, signal } from '@angular/core';
import { AlvoGrupos, JobsService } from './jobs.service';
import { StatusService } from './status.service';
import { ConfigService } from './config.service';

// Estado do botao "Executar/Parar" num servico (e nao dentro de um componente)
// porque a MESMA acao aparece em dois lugares: no cartao de controle do Painel
// e no topo do dashboard, visivel em qualquer aba. Os dois precisam enxergar a
// mesma escolha de grupos e o mesmo estado de "iniciando/parando".
@Injectable({ providedIn: 'root' })
export class RunControlService {
  private jobsService = inject(JobsService);
  private statusService = inject(StatusService);
  private configService = inject(ConfigService);

  readonly alvo = signal<AlvoGrupos>('todos');
  readonly selecionados = signal<Set<string>>(new Set());
  readonly erro = signal<string | null>(null);
  readonly iniciando = signal(false);
  readonly parando = signal(false);

  readonly grupos = computed(() => this.configService.config()?.grupos ?? []);

  readonly rodandoContinuo = computed(
    () => !!this.statusService.status()?.agendamento?.manual?.ativo
  );

  readonly postandoAgora = computed(() => this.jobsService.rodando());

  readonly processoExterno = computed(
    () => !!this.statusService.status()?.processoExterno?.rodando
  );

  readonly algoRodando = computed(
    () => this.rodandoContinuo() || this.postandoAgora() || this.processoExterno()
  );

  readonly ultimaPublicacao = computed(
    () => this.statusService.status()?.agendamento?.manual?.ultimaRodadaEm ?? null
  );

  readonly proximaPublicacao = computed(
    () => this.statusService.status()?.agendamento?.manual?.proximaRodadaEm ?? null
  );

  // O que ainda falta configurar pro robo conseguir rodar. Vira tanto o
  // checklist guiado do Painel quanto o motivo de o botao "Ligar" ficar
  // desabilitado — melhor do que deixar clicar e falhar depois.
  readonly pendencias = computed<{ texto: string; aba: 'conexoes' | 'grupos' }[]>(() => {
    const s = this.statusService.status();
    const itens: { texto: string; aba: 'conexoes' | 'grupos' }[] = [];
    if (!s?.whatsapp?.conectado) itens.push({ texto: 'Conectar o WhatsApp', aba: 'conexoes' });
    if (!s?.mercadoLivre?.conectado) itens.push({ texto: 'Conectar o Mercado Livre', aba: 'conexoes' });
    if (this.grupos().length === 0) {
      itens.push({ texto: 'Cadastrar pelo menos um grupo', aba: 'grupos' });
    }
    return itens;
  });

  readonly podeLigar = computed(() => this.pendencias().length === 0);

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
  // encerrar de verdade). Consulta o status a cada 500ms ate algoRodando()
  // virar false, com um teto de 30s pra nunca travar o botao pra sempre.
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
}
