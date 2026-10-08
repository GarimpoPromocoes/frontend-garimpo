import { Component, computed, effect, inject, signal, untracked } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { ConfigService, FonteProdutos } from '../../../core/services/config.service';
import { ChipInput } from '../../../shared/chip-input/chip-input';

const MAX_GRUPOS = 50;

interface GruposDoWhatsapp {
  em: string | null;
  grupos: { nome: string; canal: boolean; lendo: boolean }[];
  naoEncontrados: string[];
}

/**
 * De onde vêm os produtos de cada grupo de destino: do garimpo próprio nas
 * lojas ou da clonagem dos grupos dos concorrentes. Uns grupos podem receber
 * o garimpo e outros a clonagem ao mesmo tempo.
 */
@Component({
  selector: 'app-garimpo-card',
  standalone: true,
  imports: [ChipInput],
  templateUrl: './garimpo-card.html',
  styleUrl: './garimpo-card.scss',
})
export class GarimpoCard {
  protected configService = inject(ConfigService);
  private http = inject(HttpClient);

  protected readonly maxGrupos = MAX_GRUPOS;

  /** Os grupos onde o robô posta (aba Grupos). */
  protected readonly gruposDestino = computed(() => this.configService.config()?.grupos ?? []);

  private readonly salvo = computed(() => {
    const cfg = this.configService.config();
    const g = cfg?.garimpo;
    const padrao: FonteProdutos = g?.fonte === 'grupos' ? 'clonagem' : 'garimpo';
    const fontes: Record<string, FonteProdutos> = {};
    for (const grupo of cfg?.grupos ?? []) fontes[grupo.id] = grupo.fonte ?? padrao;
    return {
      fontes,
      grupos: g?.grupos ?? [],
    };
  });

  protected readonly rFontes = signal<Record<string, FonteProdutos>>({});
  protected readonly rGrupos = signal<string[]>([]);
  protected readonly salvando = signal(false);
  protected readonly erro = signal<string | null>(null);

  /** Grupos em que o WhatsApp está de verdade, anotados pelo robô na última leitura. */
  protected readonly doWhatsapp = signal<GruposDoWhatsapp>({ em: null, grupos: [], naoEncontrados: [] });

  /** Nomes cadastrados que o robô não achou no WhatsApp (e que ainda estão na lista). */
  protected readonly naoEncontrados = computed(() => {
    const atuais = new Set(this.rGrupos().map((g) => g.toLowerCase()));
    return this.doWhatsapp().naoEncontrados.filter((n) => atuais.has(n.toLowerCase()));
  });

  protected readonly lidoEm = computed(() => {
    const em = this.doWhatsapp().em;
    return em ? new Date(em).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : null;
  });

  /** Algum grupo recebe a clonagem: só aí os grupos dos concorrentes importam. */
  protected readonly algumClona = computed(() => Object.values(this.rFontes()).includes('clonagem'));

  protected fonteDe(id: string): FonteProdutos {
    return this.rFontes()[id] ?? 'garimpo';
  }

  definirFonte(id: string, fonte: FonteProdutos): void {
    this.erro.set(null);
    this.rFontes.set({ ...this.rFontes(), [id]: fonte });
  }

  protected naLista(nome: string): boolean {
    return this.rGrupos().some((g) => g.toLowerCase() === nome.toLowerCase());
  }

  alternarGrupo(nome: string): void {
    const atuais = this.rGrupos();
    this.mudarGrupos(this.naLista(nome) ? atuais.filter((g) => g.toLowerCase() !== nome.toLowerCase()) : [...atuais, nome]);
  }

  async carregarGruposDoWhatsapp(): Promise<void> {
    try {
      this.doWhatsapp.set(await firstValueFrom(this.http.get<GruposDoWhatsapp>('/api/config/grupos-whatsapp')));
    } catch (_) {
      // sem a lista, a tela segue funcionando só com os nomes digitados
    }
  }

  protected readonly alterado = computed(() => {
    const s = this.salvo();
    return (
      Object.keys(s.fontes).some((id) => s.fontes[id] !== this.fonteDe(id)) ||
      s.grupos.join('\n') !== this.rGrupos().join('\n')
    );
  });

  constructor() {
    // O rascunho acompanha o que está salvo (ao abrir a tela e depois de cada gravação).
    effect(() => {
      const s = this.salvo();
      untracked(() => {
        this.rFontes.set({ ...s.fontes });
        this.rGrupos.set([...s.grupos]);
      });
    });
    void this.carregarGruposDoWhatsapp();
  }

  mudarGrupos(grupos: string[]): void {
    this.erro.set(null);
    this.rGrupos.set(grupos.slice(0, MAX_GRUPOS));
  }

  desfazer(): void {
    const s = this.salvo();
    this.erro.set(null);
    this.rFontes.set({ ...s.fontes });
    this.rGrupos.set([...s.grupos]);
  }

  async salvar(): Promise<void> {
    this.erro.set(null);
    this.salvando.set(true);
    // A origem fica gravada em cada grupo; a escolha antiga da conta ('fonte') volta para o
    // garimpo, que é o padrão de um grupo novo cadastrado depois.
    const r = await this.configService.salvar({
      grupos: this.gruposDestino().map((g) => ({ ...g, fonte: this.fonteDe(g.id) })),
      garimpo: { fonte: 'mercadolivre', grupos: this.rGrupos() },
    });
    this.salvando.set(false);
    if (!r.ok) this.erro.set(r.erro ?? 'Erro ao salvar.');
  }
}
