import { Component, OnInit, computed, inject } from '@angular/core';
import { ConexoesService, Provedor } from '../../../core/services/conexoes.service';
import { StatusService } from '../../../core/services/status.service';
import { LojasUiService } from '../../../core/services/lojas-ui.service';

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
  private statusService = inject(StatusService);
  protected lojasUi = inject(LojasUiService);

  protected readonly erro = computed(() => this.conexoes.erro());

  protected readonly lojas = computed<Loja[]>(() => {
    const s = this.statusService.status();
    const conexao = (p: Provedor) => this.conexoes.statusDe(p);

    return [
      {
        provedor: 'mercadolivre',
        nome: 'Mercado Livre',
        logo: 'lojas/mercadolivre.svg',
        conectada: !!s?.mercadoLivre.conectado,
      },
      {
        provedor: 'amazon',
        nome: 'Amazon',
        logo: 'lojas/amazon.svg',
        // Na Amazon quem garante comissão é a tag de associado; o login só
        // acrescenta o link curto.
        conectada: conexao('amazon')?.status === 'conectado',
      },
      {
        provedor: 'shopee',
        nome: 'Shopee',
        logo: 'lojas/shopee.svg',
        // Shopee e' 100% API: estar conectada = ter as chaves validadas.
        conectada: conexao('shopee')?.status === 'conectado',
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
