import { Component, OnInit, computed, inject, input, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ConexoesService, Provedor } from '../../services/conexoes.service';

// Onde o usuário encontra cada credencial. Sem isso, "App ID" é só um campo
// vazio pra quem nunca abriu o painel de afiliados da Shopee.
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
})
export class MarketplaceCard implements OnInit {
  provedor = input.required<Provedor>();

  protected conexoes = inject(ConexoesService);

  protected readonly valores = signal<Record<string, string>>({});
  protected readonly enviando = signal(false);
  protected readonly erro = signal<string | null>(null);

  protected readonly formulario = computed(() => this.conexoes.formularioDe(this.provedor()));
  protected readonly conexao = computed(() => this.conexoes.statusDe(this.provedor()));
  protected readonly conectado = computed(() => this.conexao()?.status === 'conectado');
  protected readonly ajuda = computed(() => AJUDA[this.provedor()] ?? null);

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

    // Campos de lista (ex.: loja da Amazon) começam sem nada escolhido —
    // assume a primeira opção pra não obrigar um clique que só tem um caminho.
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
