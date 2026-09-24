import { Injectable, computed, inject, signal } from '@angular/core';
import { ConexoesService } from './conexoes.service';
import { EstadoConexao, ProvedorConexao, StatusService } from './status.service';
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

  // ---- Status "de verdade": vence a informação MAIS RECENTE. ----
  //
  // A checagem ao vivo roda quando o painel abre; depois disso o robô continua
  // registrando quedas e reconexões no estado guardado. Antes a checagem ao vivo
  // vencia pra sempre — e uma queda depois dela nunca aparecia.

  private guardado(p: ProvedorConexao): EstadoConexao | null {
    return this.statusService.status()?.conexoes?.[p] ?? null;
  }

  /** true quando o estado guardado é mais novo que a checagem ao vivo (ou ela não disse nada). */
  private guardadoVence(p: ProvedorConexao): boolean {
    const vivo = this.jobsService.verificacao();
    if (!vivo?.[p]) return true;
    const g = this.guardado(p);
    if (!g) return false;
    return (Date.parse(g.em) || 0) >= (Date.parse(vivo.em ?? '') || 0);
  }

  readonly mercadoLivreConectado = computed(() =>
    this.guardadoVence('mercadolivre')
      ? !!this.statusService.status()?.mercadoLivre?.conectado
      : !!this.jobsService.verificacao()?.mercadolivre?.conectado,
  );

  readonly amazonLogado = computed(() =>
    this.guardadoVence('amazon')
      ? !!this.statusService.status()?.amazon?.logado
      : !!this.jobsService.verificacao()?.amazon?.conectado,
  );

  readonly amazonSiteStripe = computed(() => {
    if (!this.guardadoVence('amazon')) {
      const aoVivo = this.jobsService.verificacao()?.amazon;
      return !!aoVivo?.conectado && !!aoVivo?.siteStripe;
    }
    return !!this.statusService.status()?.amazon?.linkCurto;
  });

  readonly whatsappConectado = computed(() =>
    this.guardadoVence('whatsapp')
      ? !!this.statusService.status()?.whatsapp.conectado
      : !!this.jobsService.verificacao()?.whatsapp?.conectado,
  );

  /** Shopee é 100% API: vale o estado guardado; sem ele, o que o banco de conexões diz. */
  readonly shopeeConectado = computed(() => {
    if (!this.guardadoVence('shopee')) return !!this.jobsService.verificacao()?.shopee?.conectado;
    const g = this.guardado('shopee');
    if (g) return g.conectado && this.conexoes.statusDe('shopee')?.status === 'conectado';
    return this.conexoes.statusDe('shopee')?.status === 'conectado';
  });

  readonly shopeeMotivo = computed(() => {
    if (!this.guardadoVence('shopee')) return this.jobsService.verificacao()?.shopee?.motivo ?? null;
    return this.guardado('shopee')?.motivo ?? null;
  });
}
