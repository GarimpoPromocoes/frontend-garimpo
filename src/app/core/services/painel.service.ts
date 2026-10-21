import { Injectable, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';

export interface PostagensDia {
  /** 'YYYY-MM-DD', no fuso de São Paulo. */
  dia: string;
  n: number;
}

export interface NumerosGrupo {
  id: string;
  /** null = o robô ainda não leu os membros deste grupo. */
  membros: number | null;
  postadosHoje: number;
}

export interface NumerosPainel {
  postagensPorDia: PostagensDia[];
  receitaHoje: number | null;
  receitaOntem: number | null;
  grupos: NumerosGrupo[];
}

/** Números da tela Painel (api-bot/src/modules/painel): gráfico de 30 dias, receita e grupos. */
@Injectable({ providedIn: 'root' })
export class PainelService {
  private http = inject(HttpClient);

  readonly numeros = signal<NumerosPainel | null>(null);

  async carregar(): Promise<void> {
    try {
      this.numeros.set(await firstValueFrom(this.http.get<NumerosPainel>('/api/painel')));
    } catch (_) {
      // Sem os números, os cartões mostram "—"; a próxima leitura tenta de novo.
    }
  }
}
