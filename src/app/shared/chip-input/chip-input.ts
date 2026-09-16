import { Component, input, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';

@Component({
  selector: 'app-chip-input',
  standalone: true,
  imports: [FormsModule],
  templateUrl: './chip-input.html',
  styleUrl: './chip-input.scss',
})
export class ChipInput {
  items = input<string[]>([]);
  placeholder = input('Digite e aperte Enter');
  // Liga a entrada em lote: "bolsa, sapato, sandália" vira 3 itens de uma vez.
  // Opcional porque nem todo campo que usa este componente quer vírgula como
  // separador.
  separarPorVirgula = input(false);
  itemsChange = output<string[]>();

  readonly novoItem = signal('');

  adicionar(): void {
    const texto = this.novoItem();
    const candidatos = (this.separarPorVirgula() ? texto.split(',') : [texto])
      .map((v) => v.trim())
      .filter(Boolean);
    this.novoItem.set('');
    if (!candidatos.length) return;

    // Ignora repetidos (sem diferenciar maiúscula/minúscula) — tanto os que já
    // estão na lista quanto os repetidos dentro do próprio lote colado.
    const resultado = [...this.items()];
    const vistos = new Set(resultado.map((i) => i.toLowerCase()));
    for (const v of candidatos) {
      if (vistos.has(v.toLowerCase())) continue;
      vistos.add(v.toLowerCase());
      resultado.push(v);
    }
    if (resultado.length !== this.items().length) this.itemsChange.emit(resultado);
  }

  remover(idx: number): void {
    const atuais = this.items().slice();
    atuais.splice(idx, 1);
    this.itemsChange.emit(atuais);
  }

  aoTeclar(ev: KeyboardEvent): void {
    if (ev.key === 'Enter') {
      ev.preventDefault();
      this.adicionar();
    }
  }
}
