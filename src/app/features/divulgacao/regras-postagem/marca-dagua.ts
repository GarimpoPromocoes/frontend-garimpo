/**
 * Regras da imagem de marca d'água: as mesmas do backend (bot-ml/src/curadoria/regrasMarcaDagua.js),
 * conferidas aqui antes de mandar para a pessoa não esperar o upload para saber que não serve.
 */
export const REGRAS_MARCA = {
  tipos: ['image/png', 'image/jpeg', 'image/webp'],
  maxBytes: 2 * 1024 * 1024,
  minLargura: 300,
  minAltura: 50,
  minProporcao: 2,
  maxProporcao: 10,
};

export interface MarcaConferida {
  erro: string | null;
  largura: number;
  altura: number;
}

function medidas(arquivo: File): Promise<{ largura: number; altura: number } | null> {
  return new Promise((ok) => {
    const url = URL.createObjectURL(arquivo);
    const img = new Image();
    img.onload = () => {
      ok({ largura: img.naturalWidth, altura: img.naturalHeight });
      URL.revokeObjectURL(url);
    };
    img.onerror = () => {
      ok(null);
      URL.revokeObjectURL(url);
    };
    img.src = url;
  });
}

export async function conferirMarca(arquivo: File): Promise<MarcaConferida> {
  const r = (erro: string | null, largura = 0, altura = 0): MarcaConferida => ({ erro, largura, altura });
  if (!REGRAS_MARCA.tipos.includes(arquivo.type)) return r('A imagem precisa ser PNG, JPG ou WebP.');
  if (arquivo.size > REGRAS_MARCA.maxBytes) return r('A imagem pode ter no máximo 2 MB.');
  const m = await medidas(arquivo);
  if (!m) return r('Não consegui abrir essa imagem.');
  const { largura, altura } = m;
  if (largura < REGRAS_MARCA.minLargura || altura < REGRAS_MARCA.minAltura) {
    return r(`A imagem precisa ter pelo menos ${REGRAS_MARCA.minLargura}×${REGRAS_MARCA.minAltura} px (essa tem ${largura}×${altura}).`, largura, altura);
  }
  const p = largura / altura;
  if (p < REGRAS_MARCA.minProporcao) {
    return r(`A imagem precisa ser deitada: pelo menos ${REGRAS_MARCA.minProporcao}x mais larga que alta (essa tem ${largura}×${altura}).`, largura, altura);
  }
  if (p > REGRAS_MARCA.maxProporcao) {
    return r(`A imagem está comprida demais: no máximo ${REGRAS_MARCA.maxProporcao}x mais larga que alta.`, largura, altura);
  }
  return r(null, largura, altura);
}
