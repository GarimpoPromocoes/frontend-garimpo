import type { CupomDeGrupo, LojaListaCupons } from '../../../core/services/config.service';
import { aplicarModelo, type VariavelCopy } from './copy';

/** Mesmas regras do robô (bot-ml/src/postagem/listaCupons.js). */
export const LISTA_MAX_POR_DIA = 6;
export const LISTA_MAX_CUPONS = 5;
export const LINK_MAX = 500;
export const LISTA_COPY_MAX = 1000;
export const OPCOES_LISTA_POR_DIA = [
  { vezes: 0, rotulo: 'Desligada' },
  { vezes: 1, rotulo: '1x' },
  { vezes: 2, rotulo: '2x' },
  { vezes: 3, rotulo: '3x' },
  { vezes: 4, rotulo: '4x' },
  { vezes: 6, rotulo: '6x' },
];

export type Loja = 'mercadolivre' | 'shopee' | 'amazon';
export const LOJAS: { id: Loja; nome: string; daLoja: string }[] = [
  { id: 'mercadolivre', nome: 'Mercado Livre', daLoja: 'do Mercado Livre' },
  { id: 'shopee', nome: 'Shopee', daLoja: 'da Shopee' },
  { id: 'amazon', nome: 'Amazon', daLoja: 'da Amazon' },
];
const NA_LOJA: Record<Loja, string> = { mercadolivre: 'NO MERCADO LIVRE', shopee: 'NA SHOPEE', amazon: 'NA AMAZON' };

/** Texto padrão da mensagem de cupons (o robô usa o mesmo: bot-ml/src/postagem/listaCupons.js). */
export const LISTA_COPY_PADRAO = [
  '*🎟️ {titulo}*',
  '',
  '{cupons}',
  '',
  '🛒 Copie o código e cole no fim da compra.',
  '',
  '👉 Mais ofertas na minha loja: {link}',
].join('\n');

export const VARIAVEIS_LISTA: VariavelCopy[] = [
  { nome: 'titulo', rotulo: 'Título', dica: 'NOVO CUPOM NO MERCADO LIVRE (ou CUPONS NO…, com mais de um)' },
  { nome: 'cupons', rotulo: 'Cupons', dica: 'Os códigos com o desconto, um embaixo do outro (obrigatório)' },
  { nome: 'loja', rotulo: 'Loja', dica: 'Mercado Livre, Shopee ou Amazon' },
  { nome: 'link', rotulo: 'Link', dica: 'O link que você pôs para a loja (a linha some sem ele)' },
];

export function lojasPadrao(salvas?: Partial<Record<Loja, LojaListaCupons>>): Record<Loja, LojaListaCupons> {
  const out = {} as Record<Loja, LojaListaCupons>;
  for (const { id } of LOJAS) {
    const x = salvas?.[id];
    out[id] = { ativa: x?.ativa !== false, imagem: x?.imagem ?? '', link: x?.link ?? '', copy: x?.copy || LISTA_COPY_PADRAO };
  }
  return out;
}

/** Cupons de exemplo da prévia, enquanto o robô ainda não achou nenhum da loja nos grupos. */
export const EXEMPLO_CUPONS: Record<Loja, CupomDeGrupo[]> = {
  mercadolivre: [
    { codigo: 'LOJAS2710', tipo: 'percentual', valor: 10, minimo: 79, limite: 30, loja: 'mercadolivre', grupos: [], vistoEm: '' },
    { codigo: 'MELI20', tipo: 'valorFixo', valor: 20, minimo: 150, limite: null, loja: 'mercadolivre', grupos: [], vistoEm: '' },
  ],
  shopee: [
    { codigo: 'SHOPEE15', tipo: 'valorFixo', valor: 15, minimo: 99, limite: null, loja: 'shopee', grupos: [], vistoEm: '' },
  ],
  amazon: [
    { codigo: 'AMZ10', tipo: 'percentual', valor: 10, minimo: null, limite: 50, loja: 'amazon', grupos: [], vistoEm: '' },
  ],
};

function reais(v: number): string {
  return `R$ ${Number.isInteger(v) ? v : v.toFixed(2).replace('.', ',')}`;
}

export function valorCurto(c: CupomDeGrupo): string {
  if (c.tipo === 'frete') return 'Frete grátis';
  if (c.tipo === 'valorFixo' && c.valor != null) return `${reais(c.valor)} OFF`;
  if (c.valor != null) return `${String(c.valor).replace('.', ',')}% OFF`;
  return c.codigo;
}

function blocoDoCupom(c: CupomDeGrupo): string {
  const linhas = [`Cupom: \`${c.codigo}\``];
  if (c.tipo) linhas.push(c.minimo ? `${valorCurto(c)} em compras acima de ${reais(c.minimo)}` : valorCurto(c));
  else if (c.minimo) linhas.push(`Em compras acima de ${reais(c.minimo)}`);
  if (c.limite) linhas.push(`Limite de ${reais(c.limite)}`);
  return linhas.join('\n');
}

/** O texto da mensagem de uma loja, igual ao que o robô manda. */
export function comporLista(loja: Loja, cupons: CupomDeGrupo[], link: string, copy: string): string {
  const lista = cupons.slice(0, LISTA_MAX_CUPONS);
  const texto = aplicarModelo(copy.trim() || LISTA_COPY_PADRAO, {
    titulo: lista.length === 1 ? `NOVO CUPOM ${NA_LOJA[loja]}` : `CUPONS ${NA_LOJA[loja]}`,
    cupons: lista.map(blocoDoCupom).join('\n\n'),
    loja: LOJAS.find((l) => l.id === loja)!.nome,
    link: link.trim(),
  });
  return texto.replace(/\n{3,}/g, '\n\n').trim();
}
