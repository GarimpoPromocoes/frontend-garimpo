import { Component, computed, effect, inject, signal, untracked } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { ConfigService, FonteGarimpo } from '../../../core/services/config.service';
import { ChipInput } from '../../../shared/chip-input/chip-input';

const MAX_GRUPOS = 50;

interface GruposDoWhatsapp {
  em: string | null;
  grupos: { nome: string; canal: boolean; lendo: boolean }[];
  naoEncontrados: string[];
}

/**
 * De onde o robô tira os produtos de todas as lojas conectadas: do site de
 * cada uma ou das mensagens dos grupos dos outros.
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

  private readonly salvo = computed(() => {
    const g = this.configService.config()?.garimpo;
    return {
      fonte: (g?.fonte ?? 'mercadolivre') as FonteGarimpo,
      grupos: g?.grupos ?? [],
      descartar: g?.descartarMarcaDagua === true,
    };
  });

  protected readonly rFonte = signal<FonteGarimpo>('mercadolivre');
  protected readonly rGrupos = signal<string[]>([]);
  protected readonly rDescartar = signal(false);
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
      s.fonte !== this.rFonte() ||
      s.descartar !== this.rDescartar() ||
      s.grupos.join('\n') !== this.rGrupos().join('\n')
    );
  });

  constructor() {
    // O rascunho acompanha o que está salvo (ao abrir a tela e depois de cada gravação).
    effect(() => {
      const s = this.salvo();
      untracked(() => {
        this.rFonte.set(s.fonte);
        this.rGrupos.set([...s.grupos]);
        this.rDescartar.set(s.descartar);
      });
    });
    void this.carregarGruposDoWhatsapp();
  }

  escolher(fonte: FonteGarimpo): void {
    this.erro.set(null);
    this.rFonte.set(fonte);
  }

  mudarGrupos(grupos: string[]): void {
    this.erro.set(null);
    this.rGrupos.set(grupos.slice(0, MAX_GRUPOS));
  }

  desfazer(): void {
    const s = this.salvo();
    this.erro.set(null);
    this.rFonte.set(s.fonte);
    this.rGrupos.set([...s.grupos]);
    this.rDescartar.set(s.descartar);
  }

  async salvar(): Promise<void> {
    this.erro.set(null);
    this.salvando.set(true);
    const r = await this.configService.salvar({
      garimpo: { fonte: this.rFonte(), grupos: this.rGrupos(), descartarMarcaDagua: this.rDescartar() },
    });
    this.salvando.set(false);
    if (!r.ok) this.erro.set(r.erro ?? 'Erro ao salvar.');
  }
}
