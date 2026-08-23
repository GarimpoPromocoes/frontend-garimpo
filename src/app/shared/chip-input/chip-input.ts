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
  itemsChange = output<string[]>();

  readonly novoItem = signal('');

  adicionar(): void {
    const v = this.novoItem().trim();
    if (!v) return;
    const atuais = this.items();
    if (atuais.some((i) => i.toLowerCase() === v.toLowerCase())) {
      this.novoItem.set('');
      return;
    }
    this.itemsChange.emit([...atuais, v]);
    this.novoItem.set('');
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
