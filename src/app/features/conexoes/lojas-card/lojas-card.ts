import { Component, OnInit, computed, inject } from '@angular/core';
import { ConexoesService, Provedor } from '../../../core/services/conexoes.service';
import { LojasUiService } from '../../../core/services/lojas-ui.service';
import { VerificacaoService } from '../../../core/services/verificacao.service';

interface Loja {
  provedor: Provedor;
  nome: string;
  logo: string;
  conectada: boolean;
}

@Component({
  selector: 'app-lojas-card',
  standalone: true,
  templateUrl: './lojas-card.html',
})
export class LojasCard implements OnInit {
  private conexoes = inject(ConexoesService);
  protected verificacao = inject(VerificacaoService);
  protected lojasUi = inject(LojasUiService);

  protected readonly erro = computed(() => this.conexoes.erro());

  protected readonly lojas = computed<Loja[]>(() => {
    const conexao = (p: Provedor) => this.conexoes.statusDe(p);

    return [
      {
        provedor: 'mercadolivre',
        nome: 'Mercado Livre',
        logo: 'lojas/mercadolivre.svg',
        // O ML só tem essa sessão de navegador — sem ela, nada funciona.
        conectada: this.verificacao.mercadoLivreConectado(),
      },
      {
        provedor: 'amazon',
        nome: 'Amazon',
        logo: 'lojas/amazon.svg',
        // Na Amazon quem garante comissão é a tag de associado; o login só
        // acrescenta o link curto. A tag não "cai" — não precisa de checagem
        // ao vivo pra decidir esse badge.
        conectada: conexao('amazon')?.status === 'conectado',
      },
      {
        provedor: 'shopee',
        nome: 'Shopee',
        logo: 'lojas/shopee.svg',
        // Shopee e' 100% API: estar conectada = as chaves ainda serem aceitas.
        conectada: this.verificacao.shopeeConectado(),
      },
    ];
  });

  ngOnInit(): void {
    this.conexoes.carregar();
  }

  abrir(provedor: Provedor): void {
    this.lojasUi.abrir(provedor);
  }

  recarregar(): void {
    this.conexoes.carregar();
  }
}
