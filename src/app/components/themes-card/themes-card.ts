import { Component, effect, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ConfigService, TemaEvento } from '../../services/config.service';
import { ChipInput } from '../../shared/chip-input/chip-input';

const MM_DD = /^(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;

const TEMA_VAZIO = (): TemaEvento => ({ nome: '', inicio: '', fim: '', peso: 10, palavras: [] });

// Referência somente-leitura: datas/temas brasileiros que o bot JÁ prioriza
// sozinho (embutidos em roboML/src/sazonalidade.js). Não editável por aqui —
// só para o usuário saber que não precisa cadastrar essas datas de novo.
const TEMAS_EMBUTIDOS = [
  'Verão / Inverno / Outono / Primavera',
  'Volta às aulas',
  'Carnaval',
  'Páscoa',
  'Dia das Mães',
  'Dia dos Namorados',
  'Dia dos Pais',
  'Dia das Crianças',
  'Black Friday',
  'Cyber Monday',
  'Natal e Réveillon',
  'Semana do Brasil / do Consumidor',
];

@Component({
  selector: 'app-themes-card',
  standalone: true,
  imports: [FormsModule, ChipInput],
  templateUrl: './themes-card.html',
})
export class ThemesCard {
  protected configService = inject(ConfigService);

  protected readonly temasEmbutidos = TEMAS_EMBUTIDOS;

  protected readonly ativo = signal(true);
  protected readonly eventos = signal<TemaEvento[]>([]);

  protected readonly salvando = signal(false);
  protected readonly mensagem = signal<{ tipo: 'ok' | 'erro'; texto: string } | null>(null);

  constructor() {
    effect(() => {
      const cfg = this.configService.config();
      if (!cfg) return;
      this.ativo.set(cfg.sazonalidade.ativo);
      this.eventos.set(cfg.sazonalidade.eventos.map((e) => ({ ...e, palavras: [...e.palavras] })));
    });
  }

  adicionarTema(): void {
    this.eventos.update((atuais) => [...atuais, TEMA_VAZIO()]);
  }

  removerTema(idx: number): void {
    this.eventos.update((atuais) => atuais.filter((_, i) => i !== idx));
  }

  atualizarCampo(idx: number, campo: keyof TemaEvento, valor: string | number): void {
    this.eventos.update((atuais) =>
      atuais.map((ev, i) => (i === idx ? { ...ev, [campo]: valor } : ev)),
    );
  }

  atualizarPalavras(idx: number, palavras: string[]): void {
    this.eventos.update((atuais) => atuais.map((ev, i) => (i === idx ? { ...ev, palavras } : ev)));
  }

  dataValida(valor: string): boolean {
    return MM_DD.test(valor);
  }

  async salvar(): Promise<void> {
    this.mensagem.set(null);

    for (const ev of this.eventos()) {
      if (!ev.nome.trim()) {
        this.mensagem.set({ tipo: 'erro', texto: 'Todo tema precisa de um nome.' });
        return;
      }
      if (!this.dataValida(ev.inicio) || !this.dataValida(ev.fim)) {
        this.mensagem.set({ tipo: 'erro', texto: `Tema "${ev.nome}": use o formato MM-DD (ex.: 12-25) nas datas.` });
        return;
      }
    }

    this.salvando.set(true);
    const r = await this.configService.salvar({
      sazonalidade: { ativo: this.ativo(), eventos: this.eventos() },
    });
    this.salvando.set(false);
    this.mensagem.set(r.ok ? { tipo: 'ok', texto: 'Salvo!' } : { tipo: 'erro', texto: r.erro ?? 'Erro ao salvar.' });
    if (r.ok) setTimeout(() => this.mensagem.set(null), 3000);
  }
}
