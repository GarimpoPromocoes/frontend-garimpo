import { Injectable, computed, inject, signal } from '@angular/core';
import { AlvoGrupos, JobsService } from './jobs.service';
import { StatusService } from './status.service';
import { ConfigService } from './config.service';
import { VerificacaoService } from './verificacao.service';
import { ConexoesService } from './conexoes.service';
import { ConfirmacaoService } from './confirmacao.service';

@Injectable({ providedIn: 'root' })
export class RunControlService {
  private jobsService = inject(JobsService);
  private statusService = inject(StatusService);
  private configService = inject(ConfigService);
  private verificacao = inject(VerificacaoService);
  private conexoes = inject(ConexoesService);
  private confirmacao = inject(ConfirmacaoService);

  /** Nenhuma loja é obrigatória: basta uma conectada (ML, Amazon ou Shopee). */
  readonly lojasConectadas = computed(() => {
    const lojas: string[] = [];
    if (this.verificacao.mercadoLivreConectado()) lojas.push('mercadolivre');
    if (this.conexoes.statusDe('amazon')?.status === 'conectado') lojas.push('amazon');
    if (this.verificacao.shopeeConectado()) lojas.push('shopee');
    return lojas;
  });

  /** Canal de envio: basta um conectado (WhatsApp ou Telegram). */
  readonly canalConectado = computed(
    () => this.verificacao.whatsappConectado() || this.verificacao.telegramConectado(),
  );

  readonly alvo = signal<AlvoGrupos>('todos');
  readonly selecionados = signal<Set<string>>(new Set());
  readonly erro = signal<string | null>(null);
  readonly iniciando = signal(false);
  readonly parando = signal(false);

  readonly grupos = computed(() => this.configService.config()?.grupos ?? []);

  readonly rodandoContinuo = computed(
    () => !!this.statusService.status()?.agendamento?.manual?.ativo
  );

  readonly lendoGanhos = computed(() => this.jobsService.rodando() && this.jobsService.tipo() === 'ganhos');

  // Só o job de postagem em si conta como "rodando" pra esse botão. Os outros
  // (verificar conexões, login das lojas, trocar/desconectar WhatsApp…) têm a
  // própria tela e não devem fazer o topo do painel achar que o robô está
  // trabalhando nem oferecer "Parar" pra quem não ligou nada.
  readonly postandoAgora = computed(() => this.jobsService.rodando() && this.jobsService.tipo() === 'grupos');

  readonly processoExterno = computed(
    () => !!this.statusService.status()?.processoExterno?.rodando
  );

  readonly algoRodando = computed(
    () => this.rodandoContinuo() || this.postandoAgora() || this.lendoGanhos() || this.processoExterno()
  );

  readonly ultimaPublicacao = computed(
    () => this.statusService.status()?.agendamento?.manual?.ultimaRodadaEm ?? null
  );

  readonly proximaPublicacao = computed(
    () => this.statusService.status()?.agendamento?.manual?.proximaRodadaEm ?? null
  );

  readonly pendencias = computed<{ texto: string; aba: 'whatsapp' | 'lojas' | 'grupos' }[]>(() => {
    const itens: { texto: string; aba: 'whatsapp' | 'lojas' | 'grupos' }[] = [];
    if (!this.canalConectado()) {
      itens.push({ texto: 'Conectar um canal de envio (WhatsApp ou Telegram)', aba: 'whatsapp' });
    }
    if (!this.lojasConectadas().length) {
      itens.push({ texto: 'Conectar pelo menos uma loja de afiliado (Mercado Livre, Amazon ou Shopee)', aba: 'lojas' });
    }
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

    // Requisitos minimos: pelo menos um e-commerce E pelo menos um canal de
    // envio. Sem isso o robo nao liga — avisa num modal explicando o que falta.
    const temLoja = this.lojasConectadas().length > 0;
    const temCanal = this.canalConectado();
    if (!temLoja && !temCanal) {
      await this.confirmacao.pedir({
        titulo: 'Configuração incompleta',
        texto:
          'Para ligar o robô, conecte pelo menos um e-commerce (Mercado Livre, Amazon ou Shopee) e pelo menos um canal de envio (WhatsApp ou Telegram).',
        confirmar: 'Entendi',
        soAviso: true,
      });
      return;
    }
    if (!temLoja) {
      await this.confirmacao.pedir({
        titulo: 'Nenhum e-commerce conectado',
        texto:
          'Conecte pelo menos um e-commerce (Mercado Livre, Amazon ou Shopee) antes de ligar o robô — é de onde saem as ofertas.',
        confirmar: 'Entendi',
        soAviso: true,
      });
      return;
    }
    if (!temCanal) {
      await this.confirmacao.pedir({
        titulo: 'Nenhum canal de comunicação conectado',
        texto:
          'Conecte pelo menos um canal (WhatsApp ou Telegram) antes de ligar o robô — é por onde as promoções são enviadas.',
        confirmar: 'Entendi',
        soAviso: true,
      });
      return;
    }

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
