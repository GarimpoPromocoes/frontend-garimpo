import { Injectable, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';

export interface TemaEvento {
  nome: string;
  inicio: string;
  fim: string;
  peso: number;
  palavras: string[];
}

export interface GrupoTematico {
  id: string;
  nome: string;
  groupName: string;
  palavras: string[];
  palavrasExcluir: string[];
  coringa: boolean;
  geral: boolean;
  gruposEspelho: string[];
  /** Grupo do Telegram que recebe a mesma postagem (vazio = só WhatsApp). */
  grupoTelegram?: string;
  /** Só aceita o que casa de verdade com o assunto (desliga o "dono do segmento") e barra "de brinquedo"/miniatura. */
  temaEstrito?: boolean;
  /** Trava de gênero do grupo: 'misto' | 'masculino' | 'feminino' | 'infantil'. */
  publico?: string;
  /** De onde vêm os produtos deste grupo: garimpo próprio nas lojas ou clonagem dos concorrentes. */
  fonte?: FonteProdutos;
  /** Na clonagem: de quais grupos dos concorrentes ele clona (pedaços do nome; vazio = todos). */
  gruposClonagem?: string[];
}

export type FonteProdutos = 'garimpo' | 'clonagem';

export interface Agendamento {
  intervaloMinMinutos: number;
  intervaloMaxMinutos: number;
}

export interface Cupons {
  ativo: boolean;
  /** Começo do nome dos códigos que o robô cria nas lojas (vazio = GARIMPO). */
  prefixo?: string;
  /** % das mensagens que são só um cupom. */
  percentualSozinho?: number;
  /** % das mensagens que são produto com cupom. O resto (100 − os dois) é produto sem cupom. */
  percentualProduto?: number;
}

export interface Divulgacao {
  ativo: boolean;
  /** Texto livre do cliente (chamada + "copyright"). Aceita {link} como marcador. */
  texto: string;
  /** Linktree (ou outro link) com os outros grupos do cliente. */
  link: string;
  /** Teto por dia por grupo: 1 ou 2. */
  maxPorDia: number;
}

export interface AlertaConexao {
  ativo: boolean;
  /** Grupo ou número do WhatsApp que recebe o aviso (vazio = a conversa do próprio número). */
  grupo: string;
}

export type FonteGarimpo = 'mercadolivre' | 'grupos';

export interface Garimpo {
  /** De onde vêm os produtos: do site de cada loja ('mercadolivre', nome histórico) ou das mensagens dos grupos dos outros. */
  fonte: FonteGarimpo;
  /**
   * Lista antiga, da conta toda (vazio = todos). Hoje cada grupo tem a sua (gruposClonagem);
   * esta só vale para grupo que ainda não escolheu.
   */
  grupos: string[];
}

export interface DashboardConfig {
  grupos: GrupoTematico[];
  postagem: {
    cooldownHoras: number;
    repostarAposDias: number;
  };
  sazonalidade: {
    ativo: boolean;
    eventos: TemaEvento[];
  };
  agendamento: Agendamento;
  cupons: Cupons;
  divulgacao: Divulgacao;
  alertaConexao?: AlertaConexao;
  garimpo?: Garimpo;
}

@Injectable({ providedIn: 'root' })
export class ConfigService {
  private http = inject(HttpClient);

  readonly config = signal<DashboardConfig | null>(null);
  readonly carregando = signal(false);
  readonly erro = signal<string | null>(null);

  async carregar(): Promise<void> {
    this.carregando.set(true);
    this.erro.set(null);
    try {
      const cfg = await firstValueFrom(this.http.get<DashboardConfig>('/api/config'));
      this.config.set(cfg);
    } catch (e: any) {
      this.erro.set(e?.error?.erro || 'Não foi possível carregar a configuração do bot.');
    } finally {
      this.carregando.set(false);
    }
  }

  async salvar(partial: Record<string, unknown>): Promise<{ ok: boolean; erro?: string }> {
    try {
      const atualizado = await firstValueFrom(this.http.put<DashboardConfig>('/api/config', partial));
      this.config.set(atualizado);
      return { ok: true };
    } catch (e: any) {
      return { ok: false, erro: e?.error?.erro || 'Não foi possível salvar.' };
    }
  }
}
