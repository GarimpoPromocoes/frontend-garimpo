import { Component, HostListener, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { AdminService, AssinaturaForm, Cliente, SituacaoPagamento } from '../../../core/services/admin.service';
import { ConfirmacaoService } from '../../../core/services/confirmacao.service';
import { AuthService } from '../../../core/services/auth.service';
import { Info } from '../../../shared/info/info';

const NOME_PLANO: Record<string, string> = {
  teste: 'Teste',
  mensal: 'Mensal',
  anual: 'Anual',
  vitalicio: 'Vitalício',
  cortesia: 'Cortesia',
};

const PAGAMENTO: Record<SituacaoPagamento, { texto: string; classe: string }> = {
  sem_plano: { texto: 'Sem plano', classe: 'badge-off' },
  cortesia: { texto: 'Cortesia', classe: 'badge-off' },
  pago: { texto: 'Pago', classe: 'badge-ok' },
  pendente: { texto: 'Não pago', classe: 'badge-erro' },
  vencido: { texto: 'Vencido', classe: 'badge-erro' },
  teste: { texto: 'Em teste', classe: 'badge-off' },
  teste_vencido: { texto: 'Teste vencido', classe: 'badge-erro' },
};

const ROBO: Record<string, string> = { ligado: 'Ligado', pausado: 'Pausado', tarefa: 'Em tarefa', desligado: 'Desligado' };

const NOME_LOJA: Record<string, string> = {
  mercadolivre: 'Mercado Livre',
  shopee: 'Shopee',
  amazon: 'Amazon',
  nike: 'Nike',
  adidas: 'Adidas',
  centauro: 'Centauro',
};

function dataIso(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

@Component({
  selector: 'app-owner-card',
  imports: [Info, FormsModule],
  standalone: true,
  templateUrl: './owner-card.html',
})
export class OwnerCard implements OnInit {
  protected admin = inject(AdminService);
  private confirmacao = inject(ConfirmacaoService);
  protected auth = inject(AuthService);

  protected readonly alterando = signal<number | null>(null);
  protected readonly erroAcao = signal<string | null>(null);
  protected readonly abertoId = signal<number | null>(null);
  protected readonly salvando = signal(false);
  protected readonly erroForm = signal<string | null>(null);
  protected form: AssinaturaForm = { plano: '', valor: null, pagoAte: null, ultimoPagamento: null, observacao: null };

  protected readonly aberto = computed(() => this.admin.clientes().find((c) => c.id === this.abertoId()) ?? null);

  // O dono nao entra nas contas de cliente nem na receita.
  private readonly pagantes = computed(() => this.admin.clientes().filter((c) => !c.admin));

  protected readonly totais = computed(() => {
    const cs = this.pagantes();
    const emDia = cs.filter((c) => c.ativo && c.assinatura.situacao === 'pago');
    const soma = (f: (c: Cliente) => number) => this.admin.clientes().reduce((s, c) => s + f(c), 0);
    return {
      clientes: cs.length,
      ativos: cs.filter((c) => c.ativo).length,
      emDia: emDia.length,
      emAtraso: cs.filter((c) => ['vencido', 'pendente'].includes(c.assinatura.situacao)).length,
      receitaMensal: emDia.reduce((s, c) => {
        const valor = c.assinatura.valor ?? 0;
        return s + (c.assinatura.plano === 'mensal' ? valor : c.assinatura.plano === 'anual' ? valor / 12 : 0);
      }, 0),
      vitalicio: emDia.reduce((s, c) => s + (c.assinatura.plano === 'vitalicio' ? c.assinatura.valor ?? 0 : 0), 0),
      robos: this.admin.clientes().filter((c) => c.robo.estado === 'ligado').length,
      custoIa: soma((c) => c.ia.custoUsd),
    };
  });

  ngOnInit(): void {
    void this.admin.carregar();
  }

  @HostListener('document:keydown.escape')
  protected fechar(): void {
    this.abertoId.set(null);
  }

  protected quando(iso: string | null): string {
    if (!iso) return 'nunca';
    const d = new Date(iso);
    return Number.isNaN(d.getTime()) ? '—' : d.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
  }

  protected dia(iso: string | null): string {
    if (!iso) return '—';
    const [a, m, d] = iso.split('-');
    return `${d}/${m}/${a}`;
  }

  protected moeda(v: number): string {
    return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  }

  protected dolar(v: number): string {
    return v.toLocaleString('pt-BR', { style: 'currency', currency: 'USD', maximumFractionDigits: v < 1 ? 4 : 2 });
  }

  protected inteiro(v: number): string {
    return v.toLocaleString('pt-BR');
  }

  protected tamanho(mb: number): string {
    if (mb >= 1024) return `${(mb / 1024).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} GB`;
    return `${mb.toLocaleString('pt-BR', { maximumFractionDigits: mb < 10 ? 1 : 0 })} MB`;
  }

  protected nomePlano(c: Cliente): string {
    return c.assinatura.plano ? NOME_PLANO[c.assinatura.plano] : '—';
  }

  protected pagamento(c: Cliente): { texto: string; classe: string } {
    return PAGAMENTO[c.assinatura.situacao];
  }

  protected vencimento(c: Cliente): string {
    const { pagoAte, diasRestantes, situacao } = c.assinatura;
    if (!pagoAte || diasRestantes == null) return '';
    if (situacao === 'vencido' || situacao === 'teste_vencido') return `há ${-diasRestantes} dia(s)`;
    return `até ${this.dia(pagoAte)}`;
  }

  protected nomeRobo(c: Cliente): string {
    return ROBO[c.robo.estado];
  }

  protected nomeLoja(loja: string): string {
    return NOME_LOJA[loja] ?? loja;
  }

  protected lojasConectadas(c: Cliente): number {
    return c.lojas.filter((l) => l.status === 'conectado').length;
  }

  protected souEu(c: Cliente): boolean {
    return c.id === this.auth.usuario()?.id;
  }

  protected abrir(c: Cliente): void {
    const a = c.assinatura;
    this.form = {
      plano: a.plano ?? '',
      valor: a.valor,
      pagoAte: a.pagoAte,
      ultimoPagamento: a.ultimoPagamento,
      observacao: a.observacao,
    };
    this.erroForm.set(null);
    this.abertoId.set(c.id);
  }

  // Marca o pagamento de hoje e empurra o vencimento um periodo, a partir do que ainda restava.
  protected marcarPago(): void {
    const hoje = dataIso(new Date());
    this.form.ultimoPagamento = hoje;
    const meses = this.form.plano === 'mensal' ? 1 : this.form.plano === 'anual' ? 12 : 0;
    if (!meses) return;
    const base = this.form.pagoAte && this.form.pagoAte > hoje ? this.form.pagoAte : hoje;
    const [a, m, d] = base.split('-').map(Number);
    const fim = new Date(a, m - 1 + meses, 1);
    const ultimoDia = new Date(fim.getFullYear(), fim.getMonth() + 1, 0).getDate();
    fim.setDate(Math.min(d, ultimoDia));
    this.form.pagoAte = dataIso(fim);
  }

  protected async salvar(c: Cliente): Promise<void> {
    this.salvando.set(true);
    this.erroForm.set(null);
    const r = await this.admin.salvarAssinatura(c.id, this.form);
    this.salvando.set(false);
    if (r.ok) this.abertoId.set(null);
    else this.erroForm.set(r.erro ?? null);
  }

  protected async alternar(c: Cliente): Promise<void> {
    const ok = await this.confirmacao.pedir({
      titulo: c.ativo ? 'Suspender esta conta?' : 'Reativar esta conta?',
      texto: c.ativo
        ? `${c.email} perde o acesso ao painel e o robô dela para.`
        : `${c.email} volta a ter acesso ao painel.`,
      confirmar: c.ativo ? 'Suspender' : 'Reativar',
      perigo: c.ativo,
    });
    if (!ok) return;
    this.erroAcao.set(null);
    this.alterando.set(c.id);
    const r = await this.admin.definirAtivo(c.id, !c.ativo);
    this.alterando.set(null);
    if (!r.ok) this.erroAcao.set(r.erro ?? null);
  }
}
