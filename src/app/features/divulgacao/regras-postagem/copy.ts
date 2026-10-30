/**
 * Modelo do texto da postagem — mesma regra do robô (bot-ml/src/postagem/copy.js): cada {variavel}
 * vira o valor do produto e a linha que tem variável e ficou com todas elas vazias some.
 */
export const COPY_PADRAO = ['{titulo}', '', '{precos}', '{linha_cupom}', '', '👉{link}'].join('\n');
export const COPY_MAX = 2000;

export interface VariavelCopy {
  nome: string;
  rotulo: string;
  dica: string;
}

export const VARIAVEIS_COPY: VariavelCopy[] = [
  { nome: 'titulo', rotulo: 'Título', dica: 'Nome do produto, já encurtado' },
  { nome: 'precos', rotulo: 'Linha de preço', dica: 'A linha de sempre: 🔥De R$ X por R$ Y' },
  { nome: 'preco_de', rotulo: 'Preço de', dica: 'Preço antes do desconto (vazio se não tiver)' },
  { nome: 'preco_por', rotulo: 'Preço por', dica: 'Preço final, já com o cupom' },
  { nome: 'desconto', rotulo: 'Desconto', dica: 'Ex.: 40% (vazio se não tiver)' },
  { nome: 'cupom', rotulo: 'Cupom', dica: 'Só o código do cupom (vazio se não tiver)' },
  { nome: 'linha_cupom', rotulo: 'Linha do cupom', dica: 'A linha de sempre: 🎟️ Use o cupom X' },
  { nome: 'link', rotulo: 'Link', dica: 'Seu link de afiliado (obrigatório)' },
  { nome: 'loja', rotulo: 'Loja', dica: 'Mercado Livre, Amazon, Shopee, Nike, Adidas ou Centauro' },
];

/** Produto de exemplo da prévia, com e sem cupom (valores no formato que o robô usa). */
export const EXEMPLO_COM_CUPOM: Record<string, string> = {
  titulo: 'Fone de Ouvido Bluetooth JBL Tune 520BT',
  precos: '🔥De _~R$ 299~_ *por R$ 179,10*',
  preco_de: 'R$ 299',
  preco_por: 'R$ 179,10',
  desconto: '40%',
  cupom: '`MELI10`',
  linha_cupom: '🎟️ Use o cupom `MELI10`',
  link: 'https://mercadolivre.com/sec/2xYz9Ab',
  loja: 'Mercado Livre',
};

export const EXEMPLO_SEM_CUPOM: Record<string, string> = {
  ...EXEMPLO_COM_CUPOM,
  precos: '🔥De _R$ 299_ *por R$ 199*',
  preco_por: 'R$ 199',
  desconto: '33%',
  cupom: '',
  linha_cupom: '',
};

const VARIAVEL = /\{([a-z_]+)\}/g;

export function aplicarModelo(modelo: string, valores: Record<string, string>): string {
  const saida: string[] = [];
  for (const linha of String(modelo).replace(/\r\n?/g, '\n').split('\n')) {
    let temVariavel = false;
    let algumaCheia = false;
    const trocada = linha.replace(VARIAVEL, (bruto, nome: string) => {
      if (!Object.prototype.hasOwnProperty.call(valores, nome)) return bruto;
      temVariavel = true;
      const v = valores[nome] ?? '';
      if (v) algumaCheia = true;
      return v;
    });
    if (temVariavel && !algumaCheia) continue;
    saida.push(trocada);
  }
  return saida.join('\n');
}

function escapar(t: string): string {
  return t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/** Como o WhatsApp desenha: *negrito*, _itálico_, ~riscado~ e `código`. */
export function formatarWhatsApp(texto: string): string {
  return escapar(texto)
    .replace(/`([^`\n]+)`/g, '<code>$1</code>')
    .replace(/\*([^*\n]+)\*/g, '<strong>$1</strong>')
    .replace(/(^|[^\w])_([^_\n]+)_(?=[^\w]|$)/g, '$1<em>$2</em>')
    .replace(/~([^~\n]+)~/g, '<del>$1</del>');
}
