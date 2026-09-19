import { Component, OnInit, computed, inject, input, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { ConexoesService, Provedor } from '../../../core/services/conexoes.service';
import { JobsService } from '../../../core/services/jobs.service';
import { StatusService } from '../../../core/services/status.service';
import { environment } from '../../../../environments/environment';

const AJUDA: Record<string, { texto: string; link: string; rotuloLink: string }> = {
  shopee: {
    texto: 'Entre no painel de Afiliados da Shopee e abra "Open API" no menu lateral — o App ID e o App Secret ficam lá.',
    link: 'https://affiliate.shopee.com.br',
    rotuloLink: 'Abrir painel da Shopee',
  },
  amazon: {
    texto: 'Sua tag de associado aparece no painel da Amazon Associados (termina com -20, por exemplo minhaloja-20).',
    link: 'https://associados.amazon.com.br',
    rotuloLink: 'Abrir Amazon Associados',
  },
};

@Component({
  selector: 'app-marketplace-card',
  standalone: true,
  imports: [FormsModule],
  templateUrl: './marketplace-card.html',
  host: { '[class.card-largo]': 'loginAmazonRodando() || loginShopeeRodando()' },
})
export class MarketplaceCard implements OnInit {
  provedor = input.required<Provedor>();

  protected conexoes = inject(ConexoesService);
  protected jobsService = inject(JobsService);
  private statusService = inject(StatusService);
  private sanitizer = inject(DomSanitizer);

  protected readonly valores = signal<Record<string, string>>({});
  protected readonly enviando = signal(false);
  protected readonly erro = signal<string | null>(null);

  protected readonly formulario = computed(() => this.conexoes.formularioDe(this.provedor()));
  protected readonly conexao = computed(() => this.conexoes.statusDe(this.provedor()));
  protected readonly conectado = computed(() => this.conexao()?.status === 'conectado');
  protected readonly ajuda = computed(() => AJUDA[this.provedor()] ?? null);

  protected readonly sessaoAmazon = computed(() => this.statusService.status()?.amazon ?? null);
  protected readonly loginAmazonRodando = computed(
    () => this.provedor() === 'amazon' && this.jobsService.rodando() && this.jobsService.tipo() === 'login-amazon',
  );
  protected readonly sessaoShopee = computed(() => this.statusService.status()?.shopee ?? null);
  protected readonly loginShopeeRodando = computed(
    () => this.provedor() === 'shopee' && this.jobsService.rodando() && this.jobsService.tipo() === 'login-shopee',
  );
  protected readonly outroJobRodando = computed(
    () => this.jobsService.rodando() && !this.loginAmazonRodando() && !this.loginShopeeRodando(),
  );

  async entrarNaShopee(): Promise<void> {
    this.erro.set(null);
    const r = await this.jobsService.iniciar('login-shopee');
    if (!r.ok) this.erro.set(r.erro ?? null);
  }

  protected readonly novncUrl = computed<string | null>(() => {
    const porta = this.jobsService.vncPort();
    if (!porta) return null;
    if (environment.vncBase) return `${environment.vncBase.replace(/\/$/, '')}:${porta}/`;
    return `${window.location.protocol}//${window.location.hostname}:${porta}/`;
  });
  protected readonly novncUrlSegura = computed<SafeResourceUrl | null>(() => {
    const url = this.novncUrl();
    return url ? this.sanitizer.bypassSecurityTrustResourceUrl(url) : null;
  });

  async entrarNaAmazon(): Promise<void> {
    this.erro.set(null);
    const r = await this.jobsService.iniciar('login-amazon');
    if (!r.ok) this.erro.set(r.erro ?? null);
  }

  async concluirLoginNavegador(): Promise<void> {
    await this.jobsService.confirmarEnter();
  }

  async cancelarLoginNavegador(): Promise<void> {
    await this.jobsService.parar();
  }

  ngOnInit(): void {
    this.conexoes.carregar();
  }

  valorDe(campo: string): string {
    return this.valores()[campo] ?? '';
  }

  definir(campo: string, valor: string): void {
    this.valores.update((v) => ({ ...v, [campo]: valor }));
  }

  async conectar(): Promise<void> {
    const form = this.formulario();
    if (!form) return;

    this.enviando.set(true);
    this.erro.set(null);

    const valores: Record<string, string> = {};
    for (const campo of form.campos) {
      const atual = this.valorDe(campo.nome);
      valores[campo.nome] = atual || (campo.tipo === 'opcoes' ? campo.opcoes?.[0] ?? '' : '');
    }

    const r = await this.conexoes.conectar(this.provedor(), valores);
    this.enviando.set(false);
    if (r.ok) this.valores.set({});
    else this.erro.set(r.erro ?? null);
  }

  async desconectar(): Promise<void> {
    const nome = this.formulario()?.rotulo ?? this.provedor();
    if (!window.confirm(`Isso apaga as credenciais salvas da ${nome}. Continuar?`)) return;
    await this.conexoes.desconectar(this.provedor());
    this.erro.set(null);
  }
}
