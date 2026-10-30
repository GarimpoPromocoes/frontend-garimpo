import { Injectable, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';

export interface TemaEvento {
  nome: string;
  inicio: string;
  fim: string;
  peso: number;
  palavras: string[];
  /** Desligada: fica guardada, mas não vale. Sem o campo = ligada. */
  ativo?: boolean;
  /** Nome da data pronta que esta editou (a pronta deixa de valer). */
  substitui?: string | null;
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
  /** Na clonagem: sem nada que sirva na fila dos concorrentes, garimpa nas lojas (Garimpar + Clonar). */
  garimpoReserva?: boolean;
  /** Na clonagem: de quais grupos dos concorrentes ele clona (pedaços do nome; vazio = todos). */
  gruposClonagem?: string[];
  /**
   * Lojas do grupo: onde ele garimpa (garimpo) ou de quais lojas ele pega os links dos grupos que
   * clona (clonagem). Vazio = todas.
   */
  lojas?: LojaAfiliado[];
}

export type FonteProdutos = 'garimpo' | 'clonagem';

export type LojaAfiliado = 'mercadolivre' | 'amazon' | 'shopee' | 'nike' | 'adidas' | 'centauro';

/** As lojas de afiliado, na ordem de sempre. */
export const LOJAS_AFILIADO: { id: LojaAfiliado; nome: string; logo: string }[] = [
  { id: 'mercadolivre', nome: 'Mercado Livre', logo: 'lojas/mercadolivre.svg' },
  { id: 'amazon', nome: 'Amazon', logo: 'lojas/amazon.svg' },
  { id: 'shopee', nome: 'Shopee', logo: 'lojas/shopee.svg' },
  { id: 'nike', nome: 'Nike', logo: 'lojas/nike.png' },
  { id: 'adidas', nome: 'Adidas', logo: 'lojas/adidas.png' },
  { id: 'centauro', nome: 'Centauro', logo: 'lojas/centauro.png' },
];

export interface Agendamento {
  intervaloMinMinutos: number;
  intervaloMaxMinutos: number;
}

export interface Cupons {
  ativo: boolean;
  /** Antigo: começo dos códigos que o robô criava (hoje o Mercado Livre gera o código). */
  prefixo?: string;
  /** Antigo: % das mensagens que são só um cupom (a lista de cupons tomou o lugar). */
  percentualSozinho?: number;
  /** % das mensagens que são produto com cupom. O resto é produto sem cupom. */
  percentualProduto?: number;
  /** Mensagem "lista de cupons": vezes por dia em cada grupo (0 = desligada) e a imagem (id do upload). */
  lista?: { porDia: number; lojas: Partial<Record<'mercadolivre' | 'shopee' | 'amazon', LojaListaCupons>> };
}

/** Lista de cupons de uma loja: se entra no revezamento, a imagem (id do upload) e o link do fim. */
export interface LojaListaCupons {
  ativa: boolean;
  imagem: string;
  link: string;
  /** Texto da mensagem, com {cupons} (vazio = o padrão do robô). */
  copy: string;
}

/** Cupom que o robô achou nas mensagens dos outros grupos (vai na próxima lista de cupons). */
export interface CupomDeGrupo {
  codigo: string;
  tipo: 'percentual' | 'valorFixo' | 'frete' | null;
  valor: number | null;
  minimo: number | null;
  limite: number | null;
  loja: 'mercadolivre' | 'amazon' | 'shopee' | 'nike' | 'adidas' | 'centauro' | null;
  grupos: string[];
  vistoEm: string;
}

export interface Divulgacao {
  ativo: boolean;
  /** Primeira mensagem (compatibilidade: a mesma que textos[0]). */
  texto: string;
  /** De 1 a 3 mensagens (chamada + "copyright"), aceitam {link}. O robô alterna entre elas. */
  textos?: string[];
  /** Imagem de cada mensagem (id do upload), na mesma posição do texto. '' = sem imagem. */
  imagens?: string[];
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

/** Horário de funcionamento: fora da janela o robô não posta, só garimpa (relógio de São Paulo). */
export interface HorarioFuncionamento {
  ativo: boolean;
  /** 'HH:MM' — hora de ligar. */
  inicio: string;
  /** 'HH:MM' — hora de desligar. Antes do início = a janela passa da meia-noite. */
  fim: string;
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
    /** Datas prontas desligadas (aparecem apagadas) e excluídas (somem), pelo nome. */
    prontasDesligadas?: string[];
    prontasRemovidas?: string[];
  };
  agendamento: Agendamento;
  cupons: Cupons;
  divulgacao: Divulgacao;
  alertaConexao?: AlertaConexao;
  horario?: HorarioFuncionamento;
  /** Modelo do texto da postagem, com {variaveis}. Vazio = o texto padrão do robô. */
  copy?: { modelo: string };
  garimpo?: Garimpo;
  /** Lojas desligadas na tela Conexões: seguem conectadas, mas o robô não usa até religar. */
  lojasDesligadas?: LojaAfiliado[];
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

  /** Marca d'água da conta (PNG), ou null sem nenhuma cadastrada. */
  async marcaDagua(): Promise<Blob | null> {
    try {
      return await firstValueFrom(this.http.get('/api/config/marca-dagua', { responseType: 'blob' }));
    } catch {
      return null;
    }
  }

  async salvarMarcaDagua(arquivo: File): Promise<{ ok: boolean; erro?: string }> {
    try {
      await firstValueFrom(this.http.put('/api/config/marca-dagua', arquivo, { headers: { 'Content-Type': arquivo.type } }));
      return { ok: true };
    } catch (e: any) {
      return { ok: false, erro: e?.error?.erro || 'Não consegui salvar a marca d’água.' };
    }
  }

  /** Imagem de uma mensagem de divulgação (pelo id do upload). */
  async divulgacaoImagem(id: string): Promise<Blob | null> {
    try {
      return await firstValueFrom(this.http.get(`/api/config/divulgacao-imagem/${encodeURIComponent(id)}`, { responseType: 'blob' }));
    } catch {
      return null;
    }
  }

  /** Sobe a imagem de uma mensagem de divulgação e devolve o id dela (vai junto com a mensagem ao salvar). */
  async subirDivulgacaoImagem(arquivo: File): Promise<{ id?: string; erro?: string }> {
    try {
      const r = await firstValueFrom(
        this.http.put<{ id: string }>('/api/config/divulgacao-imagem', arquivo, { headers: { 'Content-Type': arquivo.type } }),
      );
      return { id: r.id };
    } catch (e: any) {
      return { erro: e?.error?.erro || 'Não consegui enviar a imagem.' };
    }
  }

  /** Cupons achados hoje nos outros grupos (null = não consegui ler). */
  async cuponsDosGrupos(): Promise<CupomDeGrupo[] | null> {
    try {
      const r = await firstValueFrom(this.http.get<{ cupons: CupomDeGrupo[] }>('/api/config/cupons-dos-grupos'));
      return r.cupons ?? [];
    } catch {
      return null;
    }
  }

  async removerMarcaDagua(): Promise<{ ok: boolean; erro?: string }> {
    try {
      await firstValueFrom(this.http.delete('/api/config/marca-dagua'));
      return { ok: true };
    } catch (e: any) {
      return { ok: false, erro: e?.error?.erro || 'Não consegui remover a marca d’água.' };
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
