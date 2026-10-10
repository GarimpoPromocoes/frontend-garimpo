import { Component, computed, effect, inject, signal, untracked } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { ConfigService, FonteProdutos } from '../../../core/services/config.service';
import { ChipInput } from '../../../shared/chip-input/chip-input';

const MAX_GRUPOS = 50;
/** Quantos nomes aparecem no resumo "Clona de" antes do "e mais N". */
const MAX_NOMES_RESUMO = 2;

interface GruposDoWhatsapp {
  em: string | null;
  grupos: { nome: string; canal: boolean; lendo: boolean }[];
  naoEncontrados: string[];
}

const mesmoNome = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();

/**
 * De onde vêm os produtos de cada grupo de destino: do garimpo próprio nas
 * lojas ou da clonagem dos grupos dos concorrentes. Uns grupos podem receber
 * o garimpo e outros a clonagem ao mesmo tempo, e cada grupo de clonagem
 * escolhe de quais grupos dos concorrentes ele clona.
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
    const padrao: FonteProdutos = cfg?.garimpo?.fonte === 'grupos' ? 'clonagem' : 'garimpo';
    const fontes: Record<string, FonteProdutos> = {};
    const clona: Record<string, string[]> = {};
    for (const grupo of cfg?.grupos ?? []) {
      fontes[grupo.id] = grupo.fonte ?? padrao;
      clona[grupo.id] = [...(grupo.gruposClonagem ?? [])];
    }
    return { fontes, clona };
  });

  protected readonly rFontes = signal<Record<string, FonteProdutos>>({});
  /** De quais grupos dos concorrentes cada grupo clona (vazio = todos). */
  protected readonly rClona = signal<Record<string, string[]>>({});
  /** Grupo com a escolha dos concorrentes aberta (um por vez). */
  protected readonly aberto = signal<string | null>(null);
  protected readonly salvando = signal(false);
  protected readonly erro = signal<string | null>(null);

  /** Grupos em que o WhatsApp está de verdade, anotados pelo robô na última leitura. */
  protected readonly doWhatsapp = signal<GruposDoWhatsapp>({ em: null, grupos: [], naoEncontrados: [] });

  protected fonteDe(id: string): FonteProdutos {
    return this.rFontes()[id] ?? 'garimpo';
  }

  protected clonaDe(id: string): string[] {
    return this.rClona()[id] ?? [];
  }

  definirFonte(id: string, fonte: FonteProdutos): void {
    this.erro.set(null);
    this.rFontes.set({ ...this.rFontes(), [id]: fonte });
    // Acabou de virar clonagem e ainda clona de todos: já abre a escolha dos grupos.
    if (fonte === 'clonagem' && !this.clonaDe(id).length) this.aberto.set(id);
  }

  definirClonagem(id: string, grupos: string[]): void {
    this.erro.set(null);
    this.rClona.set({ ...this.rClona(), [id]: grupos.slice(0, MAX_GRUPOS) });
  }

  alternarAberto(id: string): void {
    this.aberto.set(this.aberto() === id ? null : id);
  }

  protected naLista(id: string, nome: string): boolean {
    return this.clonaDe(id).some((g) => mesmoNome(g, nome));
  }

  alternarGrupo(id: string, nome: string): void {
    const atuais = this.clonaDe(id);
    this.definirClonagem(id, this.naLista(id, nome) ? atuais.filter((g) => !mesmoNome(g, nome)) : [...atuais, nome]);
  }

  /** "todos os grupos", "Promo X e Ofertas Y", "Promo X, Ofertas Y e mais 3". */
  protected resumo(id: string): string {
    const lista = this.clonaDe(id);
    if (!lista.length) return 'todos os grupos deste WhatsApp';
    if (lista.length <= MAX_NOMES_RESUMO) return lista.join(' e ');
    return `${lista.slice(0, MAX_NOMES_RESUMO).join(', ')} e mais ${lista.length - MAX_NOMES_RESUMO}`;
  }

  /** Nomes escolhidos para o grupo que o robô não achou no WhatsApp. */
  protected naoEncontradosDe(id: string): string[] {
    const faltam = this.doWhatsapp().naoEncontrados;
    return this.clonaDe(id).filter((g) => faltam.some((n) => mesmoNome(n, g)));
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
    return Object.keys(s.fontes).some(
      (id) => s.fontes[id] !== this.fonteDe(id) || s.clona[id].join('\n') !== this.clonaDe(id).join('\n')
    );
  });

  constructor() {
    // O rascunho acompanha o que está salvo (ao abrir a tela e depois de cada gravação).
    effect(() => {
      const s = this.salvo();
      untracked(() => {
        this.rFontes.set({ ...s.fontes });
        this.rClona.set(Object.fromEntries(Object.entries(s.clona).map(([id, l]) => [id, [...l]])));
      });
    });
    void this.carregarGruposDoWhatsapp();
  }

  desfazer(): void {
    const s = this.salvo();
    this.erro.set(null);
    this.aberto.set(null);
    this.rFontes.set({ ...s.fontes });
    this.rClona.set(Object.fromEntries(Object.entries(s.clona).map(([id, l]) => [id, [...l]])));
  }

  async salvar(): Promise<void> {
    this.erro.set(null);
    this.salvando.set(true);
    // A origem e os grupos que ele clona ficam gravados em cada grupo; a escolha antiga da conta
    // ('fonte') volta para o garimpo, que é o padrão de um grupo novo cadastrado depois.
    const r = await this.configService.salvar({
      grupos: this.gruposDestino().map((g) => ({ ...g, fonte: this.fonteDe(g.id), gruposClonagem: this.clonaDe(g.id) })),
      garimpo: { fonte: 'mercadolivre' },
    });
    this.salvando.set(false);
    if (!r.ok) this.erro.set(r.erro ?? 'Erro ao salvar.');
    else this.aberto.set(null);
  }
}
