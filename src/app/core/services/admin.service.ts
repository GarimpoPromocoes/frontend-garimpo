import { Injectable, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';

export type Plano = 'teste' | 'mensal' | 'anual' | 'vitalicio' | 'cortesia';
export type SituacaoPagamento = 'sem_plano' | 'cortesia' | 'pago' | 'pendente' | 'vencido' | 'teste' | 'teste_vencido';

export interface Assinatura {
  plano: Plano | null;
  valor: number | null;
  pagoAte: string | null;
  ultimoPagamento: string | null;
  observacao: string | null;
  diasRestantes: number | null;
  situacao: SituacaoPagamento;
}

export interface LojaDoCliente {
  loja: string;
  status: string;
  desligada: boolean;
  validadaEm: string | null;
  erro: string | null;
  lidaEm: string | null;
}

export interface Cliente {
  id: number;
  email: string;
  nome: string | null;
  admin: boolean;
  ativo: boolean;
  criadoEm: string;
  ultimoAcesso: string | null;
  assinatura: Assinatura;
  whatsapp: { conectado: boolean; numero: string | null; nome: string | null };
  lojas: LojaDoCliente[];
  grupos: number;
  gruposTelegram: number;
  membros: number;
  produtos: number;
  cupons: number;
  envios: { total: number; hoje: number; dias30: number; ultimo: string | null };
  buscas30: number;
  ganhosMes: { gerado: number; confirmado: number; cliques: number; pedidos: number };
  ia: { chamadas: number; tokensEntrada: number; tokensSaida: number; custoUsd: number };
  robo: { estado: 'ligado' | 'pausado' | 'tarefa' | 'desligado'; tarefa: string | null; desde: string | null; ultimaRodada: string | null };
  consumo: { bancoMb: number; discoMb: number; memoriaMb: number | null; cpuPct: number | null };
}

export interface UsoBancoTotal {
  usadoMb: number;
  limiteMb: number;
  pct: number;
}

export interface AssinaturaForm {
  plano: Plano | '';
  valor: number | null;
  pagoAte: string | null;
  ultimoPagamento: string | null;
  observacao: string | null;
}

@Injectable({ providedIn: 'root' })
export class AdminService {
  private http = inject(HttpClient);

  readonly clientes = signal<Cliente[]>([]);
  readonly banco = signal<UsoBancoTotal | null>(null);
  readonly carregando = signal(false);
  readonly erro = signal<string | null>(null);

  async carregar(): Promise<void> {
    this.carregando.set(true);
    this.erro.set(null);
    try {
      const r: any = await firstValueFrom(this.http.get('/api/admin/clientes'));
      this.clientes.set(r.clientes ?? []);
      this.banco.set(r.banco ?? null);
    } catch (e: any) {
      this.erro.set(e?.error?.erro || 'Não consegui carregar os clientes.');
    } finally {
      this.carregando.set(false);
    }
  }

  async definirAtivo(id: number, ativo: boolean): Promise<{ ok: boolean; erro?: string }> {
    try {
      await firstValueFrom(this.http.post(`/api/admin/clientes/${id}/ativo`, { ativo }));
      this.clientes.update((lista) => lista.map((c) => (c.id === id ? { ...c, ativo } : c)));
      return { ok: true };
    } catch (e: any) {
      return { ok: false, erro: e?.error?.erro || 'Não consegui alterar essa conta.' };
    }
  }

  async salvarAssinatura(id: number, form: AssinaturaForm): Promise<{ ok: boolean; erro?: string }> {
    try {
      await firstValueFrom(this.http.put(`/api/admin/clientes/${id}/assinatura`, form));
      await this.carregar();
      return { ok: true };
    } catch (e: any) {
      return { ok: false, erro: e?.error?.erro || 'Não consegui salvar o plano.' };
    }
  }
}
