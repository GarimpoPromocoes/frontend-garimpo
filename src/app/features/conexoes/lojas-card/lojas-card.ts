import { Component, OnInit, computed, inject } from '@angular/core';
import { ConexoesService, Provedor } from '../../../core/services/conexoes.service';
import { LojasUiService } from '../../../core/services/lojas-ui.service';
import { VerificacaoService } from '../../../core/services/verificacao.service';
import { ConfirmacaoService } from '../../../core/services/confirmacao.service';

interface Loja {
  provedor: Provedor;
  nome: string;
  logo: string;
  conectada: boolean;
}

/** Loja que aparece na grade mas ainda não tem integração. */
interface LojaEmBreve {
  id: string;
  nome: string;
  logo: string;
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
  private confirmacao = inject(ConfirmacaoService);

  // Ainda em desenvolvimento: ficam visíveis, mas o clique só avisa.
  // Quando uma ficar pronta, ela sai daqui e entra em `lojas` com o provedor.
  protected readonly emBreve: LojaEmBreve[] = [
    { id: 'shein', nome: 'Shein', logo: 'lojas/shein.png' },
    { id: 'aliexpress', nome: 'AliExpress', logo: 'lojas/aliexpress.png' },
    { id: 'nike', nome: 'Nike', logo: 'lojas/nike.png' },
    { id: 'netshoes', nome: 'Netshoes', logo: 'lojas/netshoes.png' },
    { id: 'adidas', nome: 'Adidas', logo: 'lojas/adidas.png' },
    { id: 'centauro', nome: 'Centauro', logo: 'lojas/centauro.png' },
  ];

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

  avisarEmBreve(nome: string): void {
    void this.confirmacao.pedir({
      titulo: `${nome} ainda não está disponível`,
      texto: `A integração com a ${nome} está em desenvolvimento. Assim que ficar pronta, é só voltar aqui e conectar.`,
      confirmar: 'Entendi',
      soAviso: true,
    });
  }

  recarregar(): void {
    this.conexoes.carregar();
  }
}
