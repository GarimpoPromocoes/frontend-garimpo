import { Injectable, computed, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { JobsService } from './jobs.service';

/** Quanto esperar o robô conectar o WhatsApp e anotar a lista de grupos. */
const PRAZO_LISTA_MS = 180000;
const PASSO_ESPERA_MS = 500;

export interface GruposDoWhatsapp {
  em: string | null;
  /** lidoPor: os grupos de clonagem da conta que leem dele (pelo nome). */
  grupos: { nome: string; canal: boolean; lendo: boolean; lidoPor?: string[] }[];
  naoEncontrados: string[];
}

export const mesmoNome = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();

/**
 * Os grupos em que o WhatsApp está de verdade, anotados pelo robô na última leitura —
 * de onde a clonagem escolhe os concorrentes.
 */
@Injectable({ providedIn: 'root' })
export class GruposWhatsappService {
  private http = inject(HttpClient);
  private jobs = inject(JobsService);

  readonly lista = signal<GruposDoWhatsapp>({ em: null, grupos: [], naoEncontrados: [] });
  readonly atualizando = signal(false);
  readonly erro = signal<string | null>(null);

  /** Concorrentes que o robô está lendo agora. */
  readonly lidos = computed(() => this.lista().grupos.filter((w) => w.lendo).length);

  /** O nome escolhido não está entre os grupos que o robô achou no WhatsApp. */
  naoEncontrado(nome: string): boolean {
    return this.lista().naoEncontrados.some((n) => mesmoNome(n, nome));
  }

  horaDaLista(): string {
    const em = this.lista().em;
    const d = em ? new Date(em) : null;
    if (!d || Number.isNaN(d.getTime())) return '';
    const hora = d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    return d.toDateString() === new Date().toDateString() ? `hoje, ${hora}` : `${d.toLocaleDateString('pt-BR')}, ${hora}`;
  }

  async carregar(): Promise<void> {
    try {
      this.lista.set(await firstValueFrom(this.http.get<GruposDoWhatsapp>('/api/config/grupos-whatsapp')));
    } catch (_) {
      // sem a lista, a clonagem segue funcionando só com os nomes digitados
    }
  }

  /**
   * Botão "Atualizar grupos": com o robô desligado, sobe um processo só para conectar o WhatsApp
   * e anotar a lista. Com o robô ligado o WhatsApp já está aberto nele — aí só relê o que ele anotou.
   */
  async atualizar(): Promise<void> {
    if (this.atualizando()) return;
    this.erro.set(null);
    this.atualizando.set(true);
    try {
      if (!this.jobs.rodando()) {
        const r = await this.jobs.iniciar('listar-grupos-zap');
        if (!r.ok) {
          this.erro.set(r.erro ?? 'Não consegui ler os grupos agora.');
          return;
        }
        await this.esperarJob();
      }
      const antes = this.lista().em;
      await this.carregar();
      if (!this.jobs.rodando() && this.lista().em === antes) {
        this.erro.set('O WhatsApp não respondeu. Confira se ele está conectado na aba Conexões.');
      }
    } finally {
      this.atualizando.set(false);
    }
  }

  /** Espera o processo subir e encerrar (conectar o WhatsApp pode levar um ou dois minutos). */
  private async esperarJob(): Promise<void> {
    const dormir = () => new Promise((r) => setTimeout(r, PASSO_ESPERA_MS));
    const subiuAte = Date.now() + 5000;
    while (!this.jobs.rodando() && Date.now() < subiuAte) await dormir();
    const limite = Date.now() + PRAZO_LISTA_MS;
    while (this.jobs.rodando() && this.jobs.tipo() === 'listar-grupos-zap' && Date.now() < limite) await dormir();
  }
}
