import { Component, effect, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ConfigService, GrupoTematico } from '../../services/config.service';
import { ChipInput } from '../../shared/chip-input/chip-input';

const GRUPO_VAZIO = (): GrupoTematico => ({
  id: crypto.randomUUID(),
  nome: '',
  groupName: '',
  palavras: [],
  palavrasExcluir: [],
  coringa: false,
  geral: false,
  gruposEspelho: [],
});

@Component({
  selector: 'app-groups-card',
  standalone: true,
  imports: [FormsModule, ChipInput],
  templateUrl: './groups-card.html',
})
export class GroupsCard {
  protected configService = inject(ConfigService);

  protected readonly grupos = signal<GrupoTematico[]>([]);
  protected readonly salvando = signal(false);
  protected readonly mensagem = signal<{ tipo: 'ok' | 'erro'; texto: string } | null>(null);

  constructor() {
    effect(() => {
      const cfg = this.configService.config();
      if (!cfg) return;
      this.grupos.set(
        cfg.grupos.map((g) => ({
          ...g,
          palavras: [...g.palavras],
          palavrasExcluir: [...(g.palavrasExcluir ?? [])],
          gruposEspelho: [...g.gruposEspelho],
        })),
      );
    });
  }

  adicionarGrupo(): void {
    this.grupos.update((atuais) => [...atuais, GRUPO_VAZIO()]);
  }

  removerGrupo(idx: number): void {
    this.grupos.update((atuais) => atuais.filter((_, i) => i !== idx));
  }

  atualizarCampo(idx: number, campo: 'nome' | 'groupName', valor: string): void {
    this.grupos.update((atuais) => atuais.map((g, i) => (i === idx ? { ...g, [campo]: valor } : g)));
  }

  atualizarPalavras(idx: number, palavras: string[]): void {
    this.grupos.update((atuais) => atuais.map((g, i) => (i === idx ? { ...g, palavras } : g)));
  }

  atualizarPalavrasExcluir(idx: number, palavrasExcluir: string[]): void {
    this.grupos.update((atuais) => atuais.map((g, i) => (i === idx ? { ...g, palavrasExcluir } : g)));
  }

  atualizarEspelho(idx: number, gruposEspelho: string[]): void {
    this.grupos.update((atuais) => atuais.map((g, i) => (i === idx ? { ...g, gruposEspelho } : g)));
  }

  // So um grupo pode ser o coringa: marcar um desmarca todos os outros.
  marcarCoringa(idx: number, valor: boolean): void {
    this.grupos.update((atuais) => atuais.map((g, i) => ({ ...g, coringa: valor && i === idx })));
  }

  // Geral e' independente: pode haver mais de um grupo que recebe tudo.
  marcarGeral(idx: number, valor: boolean): void {
    this.grupos.update((atuais) => atuais.map((g, i) => (i === idx ? { ...g, geral: valor } : g)));
  }

  async salvar(): Promise<void> {
    this.mensagem.set(null);

    for (const g of this.grupos()) {
      if (!g.nome.trim() || !g.groupName.trim()) {
        this.mensagem.set({ tipo: 'erro', texto: 'Todo grupo precisa de um nome e do nome exato no WhatsApp.' });
        return;
      }
      if (!g.coringa && !g.geral && g.palavras.length === 0) {
        this.mensagem.set({
          tipo: 'erro',
          texto: `Grupo "${g.nome}": adicione pelo menos uma palavra-chave de tema (ou marque como coringa/geral).`,
        });
        return;
      }
    }

    this.salvando.set(true);
    const r = await this.configService.salvar({ grupos: this.grupos() });
    this.salvando.set(false);
    this.mensagem.set(r.ok ? { tipo: 'ok', texto: 'Salvo!' } : { tipo: 'erro', texto: r.erro ?? 'Erro ao salvar.' });
    if (r.ok) setTimeout(() => this.mensagem.set(null), 3000);
  }
}
