import { Component, inject, input } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { AuthService } from '../../../core/services/auth.service';

@Component({
  selector: 'app-login-card',
  standalone: true,
  imports: [FormsModule],
  templateUrl: './login-card.html',
  styles: `
    a.btn {
      text-decoration: none;
    }
    .login-voltar {
      align-self: center;
      padding: 4px;
      font-size: 14px;
      color: var(--text-soft);
      text-underline-offset: 3px;
    }
  `,
})
export class LoginCard {
  protected auth = inject(AuthService);

  /** Quem decide é o endereço (#entrar ou #criar, ver App): assim o voltar do navegador funciona. */
  readonly modo = input<'entrar' | 'criar'>('entrar');
  protected email = '';
  protected senha = '';

  async enviar(): Promise<void> {
    const email = this.email.trim();
    const senha = this.senha;
    if (!email || !senha) return;

    const ok =
      this.modo() === 'entrar' ? await this.auth.login(email, senha) : await this.auth.registrar(email, senha);
    if (ok) this.senha = '';
  }
}
