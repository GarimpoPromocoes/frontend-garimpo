import { Component, OnInit, computed, inject, input, output, signal } from '@angular/core';
import { GruposWhatsappService, mesmoNome } from '../../../core/services/grupos-whatsapp.service';

const MAX_GRUPOS = 50;

/**
 * Janela "De quais grupos o X clona?": mexe numa cópia da lista e só devolve
 * no "Usar" — o "Cancelar" (ou Esc, ou clicar fora) deixa como estava.
 */
@Component({
  selector: 'app-concorrentes-dialog',
  standalone: true,
  templateUrl: './concorrentes-dialog.html',
  styleUrl: './concorrentes-dialog.scss',
})
export class ConcorrentesDialog implements OnInit {
  protected zap = inject(GruposWhatsappService);

  /** Apelido do grupo de destino, para o título. */
  readonly nome = input.required<string>();
  /** De quais concorrentes ele clona hoje (vazio = todos). */
  readonly grupos = input.required<string[]>();
  /** Abre já em "Só os que eu escolher" (o grupo acabou de virar clonagem). */
  readonly escolher = input(false);

  readonly concluir = output<string[]>();
  readonly cancelar = output<void>();

  protected readonly maxGrupos = MAX_GRUPOS;
  protected readonly lista = signal<string[]>([]);
  /** "Todos os grupos" (lista vazia) ou "Só os que eu escolher". */
  protected readonly modoTodos = signal(true);
  protected readonly busca = signal('');

  ngOnInit(): void {
    this.lista.set([...this.grupos()]);
    this.modoTodos.set(!this.grupos().length && !this.escolher());
  }

  protected naLista(nome: string): boolean {
    return this.lista().some((g) => mesmoNome(g, nome));
  }

  alternar(nome: string): void {
    const atuais = this.lista();
    this.lista.set(this.naLista(nome) ? atuais.filter((g) => !mesmoNome(g, nome)) : [...atuais, nome].slice(0, MAX_GRUPOS));
  }

  escolherTodos(): void {
    this.modoTodos.set(true);
  }

  /** O que foi digitado na busca e não está na lista: dá pra adicionar pelo nome. */
  protected podeAdicionarDigitado(): boolean {
    const nome = this.busca().trim();
    if (!nome || this.lista().length >= MAX_GRUPOS) return false;
    return !this.zap.lista().grupos.some((w) => mesmoNome(w.nome, nome)) && !this.naLista(nome);
  }

  adicionarDigitado(): void {
    if (!this.podeAdicionarDigitado()) return;
    this.lista.set([...this.lista(), this.busca().trim()]);
    this.busca.set('');
  }

  /** Os grupos do WhatsApp mais os nomes digitados, marcados primeiro. */
  protected readonly opcoes = computed(() => {
    const termo = this.busca().trim().toLowerCase();
    const doZap = this.zap.lista().grupos.map((w) => ({
      nome: w.nome,
      marcado: this.naLista(w.nome),
      lendo: w.lendo,
      faltando: false,
      detalhe: w.canal ? 'Canal' : 'Grupo',
    }));
    const digitados = this.lista()
      .filter((n) => !doZap.some((w) => mesmoNome(w.nome, n)))
      .map((nome) => ({ nome, marcado: true, lendo: false, faltando: this.zap.naoEncontrado(nome), detalhe: 'Digitado pelo nome' }));
    return [...digitados, ...doZap]
      .filter((o) => !termo || o.nome.toLowerCase().includes(termo))
      .sort((a, b) => Number(b.marcado) - Number(a.marcado));
  });

  usar(): void {
    this.concluir.emit(this.modoTodos() ? [] : this.lista());
  }
}
