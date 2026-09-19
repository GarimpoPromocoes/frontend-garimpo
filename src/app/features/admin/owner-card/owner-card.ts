import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { AdminService, Cliente } from '../../../core/services/admin.service';
import { AuthService } from '../../../core/services/auth.service';

@Component({
  selector: 'app-owner-card',
  standalone: true,
  templateUrl: './owner-card.html',
})
export class OwnerCard implements OnInit {
  protected admin = inject(AdminService);
  protected auth = inject(AuthService);

  protected readonly alterando = signal<number | null>(null);
  protected readonly erroAcao = signal<string | null>(null);

  protected readonly totais = computed(() => {
    const cs = this.admin.clientes();
    return {
      clientes: cs.length,
      ativos: cs.filter((c) => c.ativo).length,
      produtos: cs.reduce((s, c) => s + c.produtos, 0),
      postagens: cs.reduce((s, c) => s + c.postagens, 0),
    };
  });

  ngOnInit(): void {
    void this.admin.carregar();
  }

  protected quando(iso: string | null): string {
    if (!iso) return 'nunca';
    const d = new Date(iso);
    return Number.isNaN(d.getTime()) ? '—' : d.toLocaleString('pt-BR');
  }

  protected souEu(c: Cliente): boolean {
    return c.id === this.auth.usuario()?.id;
  }

  protected async alternar(c: Cliente): Promise<void> {
    const acao = c.ativo ? 'suspender' : 'reativar';
    if (!window.confirm(`Deseja ${acao} a conta ${c.email}?`)) return;
    this.erroAcao.set(null);
    this.alterando.set(c.id);
    const r = await this.admin.definirAtivo(c.id, !c.ativo);
    this.alterando.set(null);
    if (!r.ok) this.erroAcao.set(r.erro ?? null);
  }
}
