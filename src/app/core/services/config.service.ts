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
}

export interface Agendamento {
  intervaloMinMinutos: number;
  intervaloMaxMinutos: number;
}

export interface Cupons {
  ativo: boolean;
  percentualProduto: number;
  percentualSozinho: number;
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
