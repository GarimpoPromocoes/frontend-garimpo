import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { AuthService } from '../../services/auth.service';

@Component({
  selector: 'app-login-card',
  standalone: true,
  imports: [FormsModule],
  templateUrl: './login-card.html',
})
export class LoginCard {
  protected auth = inject(AuthService);

  protected readonly modo = signal<'entrar' | 'criar'>('entrar');
  protected email = '';
  protected senha = '';

  alternarModo(): void {
    this.modo.set(this.modo() === 'entrar' ? 'criar' : 'entrar');
    this.auth.erro.set(null);
  }

  async enviar(): Promise<void> {
    const email = this.email.trim();
    const senha = this.senha;
    if (!email || !senha) return;

    const ok =
      this.modo() === 'entrar' ? await this.auth.login(email, senha) : await this.auth.registrar(email, senha);
    if (ok) this.senha = '';
  }
}
