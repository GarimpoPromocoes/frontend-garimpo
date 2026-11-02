import { Component, signal } from '@angular/core';
import { Ciclo, PLANOS, Plano } from './planos';

interface Preco {
  reais: string;
  centavos: string;
  detalhe: string;
  economia: string | null;
}

const reais = (valor: number) => valor.toLocaleString('pt-BR', { maximumFractionDigits: 0 });

/** A primeira tela de quem não está logado. Os botões levam a #entrar e #criar (ver App). */
@Component({
  selector: 'app-landing',
  standalone: true,
  templateUrl: './landing.html',
  styleUrl: './landing.scss',
})
export class Landing {
  protected readonly planos = PLANOS;
  protected readonly ciclo = signal<Ciclo>('mensal');

  /** A maior economia entre os pacotes, para o selo da opção anual. */
  protected readonly economiaMaxima = Math.max(
    ...PLANOS.map((p) => Math.round((1 - p.anual / (p.mensal * 12)) * 100)),
  );

  protected readonly lojasDiretas = [
    { nome: 'Mercado Livre', logo: 'lojas/mercadolivre.svg' },
    { nome: 'Amazon', logo: 'lojas/amazon.svg' },
    { nome: 'Shopee', logo: 'lojas/shopee.svg' },
  ];
  protected readonly lojasClonagem = [
    { nome: 'Nike', logo: 'lojas/nike.png' },
    { nome: 'Adidas', logo: 'lojas/adidas.png' },
    { nome: 'Centauro', logo: 'lojas/centauro.png' },
    { nome: 'Netshoes', logo: 'lojas/netshoes.png' },
    { nome: 'Shein', logo: 'lojas/shein.png' },
  ];

  protected preco(plano: Plano): Preco {
    if (this.ciclo() === 'mensal') {
      return { reais: reais(plano.mensal), centavos: '00', detalhe: 'cobrado todo mês', economia: null };
    }
    const porMes = (plano.anual / 12).toFixed(2).split('.');
    return {
      reais: reais(Number(porMes[0])),
      centavos: porMes[1],
      detalhe: `R$ ${reais(plano.anual)} por ano, de uma vez`,
      economia: `Economize R$ ${reais(plano.mensal * 12 - plano.anual)} por ano`,
    };
  }
}
