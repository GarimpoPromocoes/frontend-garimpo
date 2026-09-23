import { Injectable, computed, inject, signal } from '@angular/core';
import { ConexoesService } from './conexoes.service';
import { StatusService } from './status.service';
import { JobsService } from './jobs.service';

/**
 * Toda vez que o painel carrega, existem duas perguntas diferentes:
 *   1. O que está guardado? (o banco: credenciais salvas, arquivo de sessão)
 *   2. Isso ainda vale de verdade? (a plataforma, agora)
 *
 * O caso clássico que só a segunda pergunta pega: o usuário loga na mesma
 * conta em outro computador, a plataforma derruba a sessão daqui, mas o
 * arquivo local continua no disco dizendo "conectado" — só aparece quando o
 * robô tenta trabalhar de verdade e não consegue.
 *
 * Este serviço faz as duas: carrega o estado guardado e, quando dá (o robô
 * precisa estar livre — não dá pra abrir a mesma sessão duas vezes), pede uma
 * checagem ao vivo (`bot-ml/src/contas/verificar.js`). Os cards perguntam a
 * ESTE serviço se está conectado, não direto ao status guardado — assim a
 * resposta ao vivo, quando existe, sempre vence.
 */
const PRAZO_MAXIMO_MS = 35000;
const INTERVALO_ESPERA_MS = 300;

@Injectable({ providedIn: 'root' })
export class VerificacaoService {
  private conexoes = inject(ConexoesService);
  private statusService = inject(StatusService);
  private jobsService = inject(JobsService);

  /** true assim que a checagem (ao vivo ou não) termina — libera a tela. */
  readonly pronto = signal(false);
  /**
   * Só é true quando a checagem ao vivo realmente rodou (não foi pulada por
   * o robô estar ocupado). Os cards podem usar isso pra decidir se mostram
   * "confirmado agora" ou só o status guardado.
   */
  readonly confirmadoAoVivo = signal(false);

  private emAndamento: Promise<void> | null = null;

  /** Roda a dupla checagem. Chamar de novo enquanto uma já está em curso reaproveita ela. */
  async executar(): Promise<void> {
    if (this.emAndamento) return this.emAndamento;
    this.emAndamento = this.rodar().finally(() => {
      this.emAndamento = null;
    });
    return this.emAndamento;
  }

  private async rodar(): Promise<void> {
    this.pronto.set(false);
    this.confirmadoAoVivo.set(false);

    // 1) O que está guardado — banco (conexões) e status (sessões salvas).
    await Promise.all([this.conexoes.carregar(), this.statusService.atualizar()]);

    // 2) Isso ainda vale de verdade? Só dá pra perguntar se o robô estiver
    // livre — ML/Amazon (mesmo perfil) e WhatsApp só abrem uma sessão de cada
    // vez. Se o robô já está trabalhando, ele mesmo já é a prova de que está
    // conectado (ou já estaria avisando o contrário no log).
    if (this.jobsService.rodando()) {
      this.pronto.set(true);
      return;
    }

    const r = await this.jobsService.iniciar('verificar-conexoes');
    if (!r.ok) {
      // Servidor ocupado com outro cliente, por exemplo — segue com o que o
      // banco disse. Não vale travar a tela esperando um slot livre.
      this.pronto.set(true);
      return;
    }

    await this.esperarResultado();
    this.pronto.set(true);
  }

  private async esperarResultado(): Promise<void> {
    const limite = Date.now() + PRAZO_MAXIMO_MS;
    while (Date.now() < limite) {
      if (this.jobsService.verificacao()) this.confirmadoAoVivo.set(true);
      // Espera o job encerrar de vez (não só o resultado chegar) — enquanto o
      // processo ainda está de pé fechando o navegador, o resto do painel
      // (o botão "Parar", por exemplo) ainda acha que tem algo rodando. Sem
      // esperar isso, a tela de carregamento some e descobre esse instante.
      if (!this.jobsService.rodando()) return;
      await new Promise((resolve) => setTimeout(resolve, INTERVALO_ESPERA_MS));
    }
  }

  // ---- Status "de verdade": a resposta ao vivo vence quando existe. ----

  readonly mercadoLivreConectado = computed(
    () => this.jobsService.verificacao()?.mercadolivre?.conectado ?? !!this.statusService.status()?.mercadoLivre?.conectado,
  );

  readonly amazonLogado = computed(
    () => this.jobsService.verificacao()?.amazon?.conectado ?? !!this.statusService.status()?.amazon?.logado,
  );

  readonly amazonSiteStripe = computed(() => {
    const aoVivo = this.jobsService.verificacao()?.amazon;
    if (aoVivo) return aoVivo.conectado && !!aoVivo.siteStripe;
    return !!this.statusService.status()?.amazon?.linkCurto;
  });

  readonly whatsappConectado = computed(
    () => this.jobsService.verificacao()?.whatsapp?.conectado ?? !!this.statusService.status()?.whatsapp.conectado,
  );

  /** Shopee é 100% API: "conectada" já vem do banco (chaves validadas ao salvar). */
  readonly shopeeConectado = computed(() => {
    const aoVivo = this.jobsService.verificacao()?.shopee;
    if (aoVivo) return aoVivo.conectado;
    return this.conexoes.statusDe('shopee')?.status === 'conectado';
  });

  readonly shopeeMotivo = computed(() => this.jobsService.verificacao()?.shopee?.motivo ?? null);
}
