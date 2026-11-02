// VALORES PROVISÓRIOS: preços e limites de grupos abaixo são exemplos, ainda não definidos.
// É só editar aqui: a landing calcula sozinha o valor por mês no anual, a economia e o selo.
// 'mensal' e 'anual' são os mesmos nomes de plano do Painel do dono (adminRepo.PLANOS).

export type Ciclo = 'mensal' | 'anual';

export interface Plano {
  id: string;
  nome: string;
  paraQuem: string;
  /** Preço de um mês no plano mensal, em reais. */
  mensal: number;
  /** Preço do ano inteiro no plano anual, em reais. */
  anual: number;
  /** O pacote de melhor custo-benefício, em destaque. */
  destaque?: boolean;
  recursos: string[];
}

export const PLANOS: Plano[] = [
  {
    id: 'bateia',
    nome: 'Bateia',
    paraQuem: 'Para começar com poucos grupos.',
    mensal: 97,
    anual: 970,
    recursos: [
      'Até 3 grupos',
      'Garimpo no Mercado Livre, na Amazon e na Shopee',
      'Postagem no WhatsApp e no Telegram',
      'Cupons e datas especiais',
      'Estatísticas de ganhos e membros',
    ],
  },
  {
    id: 'garimpeiro',
    nome: 'Garimpeiro',
    paraQuem: 'Para quem vive de promoção.',
    mensal: 197,
    anual: 1970,
    destaque: true,
    recursos: [
      'Até 10 grupos',
      'Clonagem de grupos concorrentes',
      'As 8 lojas, com Nike, Adidas, Centauro, Netshoes e Shein',
      'Oferta personalizada: busque um produto e escolha o que postar',
      'Tudo o que vem no Bateia',
    ],
  },
  {
    id: 'jazida',
    nome: 'Jazida',
    paraQuem: 'Para quem cuida de muitas comunidades.',
    mensal: 397,
    anual: 3970,
    recursos: ['Até 30 grupos', 'Tudo o que vem no Garimpeiro'],
  },
];
