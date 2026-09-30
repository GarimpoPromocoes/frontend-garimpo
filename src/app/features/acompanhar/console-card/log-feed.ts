export type Tom = 'ok' | 'erro' | 'aviso' | 'info' | 'destaque' | 'neutro';

export interface ItemRodada {
  tipo: 'rodada';
  numero: number;
}
export interface ItemGrupo {
  tipo: 'grupo';
  nome: string;
}
export interface ItemScan {
  tipo: 'scan';
  contagem: number;
  hora?: string;
}
export interface ItemLinha {
  tipo: 'linha';
  emoji: string;
  texto: string;
  tom: Tom;
  hora?: string;
}
export type FeedItem = ItemRodada | ItemGrupo | ItemScan | ItemLinha;

const RE_LINHA_TAG = /^\[(\d{2}:\d{2}:\d{2})\]\s*\[([A-ZÇÃÕÁÉÍÓÚ]+)\]\s*(.*)$/;
const RE_HEADER = /^=+\s*(.+?)\s*=*$/;
const RE_RODADA = /^===+\s*RODADA\s+(\d+):/i;
const RE_GRUPO_HEADER = /^GRUPO\s+"(.+?)"\s*->\s*WhatsApp/i;
const RE_CANDIDATO = /^\[(?:ML |amazon |shopee )?\d+\]\s+.+\s—\s*R\$\s*[\d.,]+/i;

function explicarMotivo(motivo: string): string {
  const m = motivo.trim();
  if (/produto novo/i.test(m)) return 'nunca publicado antes';
  if (/^preco caiu/i.test(m)) return m.replace(/^preco caiu:/i, 'o preço caiu:').replace(/->/g, '→');
  if (/^desconto subiu/i.test(m)) return m.replace(/^desconto subiu:/i, 'o desconto aumentou:').replace(/->/g, '→');
  if (/repostagem liberada/i.test(m)) return 'pode repetir — já faz tempo desde a última vez';
  if (/^relampago$/i.test(m)) return 'oferta relâmpago';
  return m;
}

function traduzirPorTag(tag: string, texto: string): { emoji: string; texto: string; tom: Tom } | null {
  switch (tag) {
    case 'PASSO': {
      if (/^Abrindo o navegador/i.test(texto)) return { emoji: '🌐', texto: 'Abrindo o navegador...', tom: 'destaque' };
      if (/^Cupons:\s*https?:\/\//i.test(texto)) return { emoji: '🔎', texto: 'Procurando cupons disponíveis...', tom: 'destaque' };
      if (/^Ofertas:\s*https?:\/\//i.test(texto)) return { emoji: '🔎', texto: 'Procurando promoções novas...', tom: 'destaque' };

      if (/^ofertas: ML:/i.test(texto)) return { emoji: '🔎', texto: 'Mercado Livre: procurando ofertas...', tom: 'info' };
      let m = texto.match(/^busca: (.+?): https?:\/\//i);
      if (m) return { emoji: '🔎', texto: `Mercado Livre: buscando "${m[1]}"...`, tom: 'info' };
      if (/^amazon: ofertas:/i.test(texto)) return { emoji: '🔎', texto: 'Amazon: procurando ofertas do dia...', tom: 'info' };
      if (/^amazon: cupons:/i.test(texto)) return { emoji: '🔎', texto: 'Amazon: procurando produtos com cupom...', tom: 'info' };
      m = texto.match(/^amazon: busca: (.+?): https?:\/\//i);
      if (m) return { emoji: '🔎', texto: `Amazon: buscando "${m[1]}"...`, tom: 'info' };

      if (/^shopee: ofertas:/i.test(texto)) return { emoji: '🔎', texto: 'Shopee: procurando ofertas do dia...', tom: 'info' };
      m = texto.match(/^shopee: busca: (.+?):/i);
      if (m) return { emoji: '🔎', texto: `Shopee: buscando "${m[1]}"...`, tom: 'info' };

      m = texto.match(/^Loja sorteada: (.+?) \(/i);
      if (m) return { emoji: '🎲', texto: `Próxima postagem: produto da ${m[1]}.`, tom: 'info' };

      return { emoji: '▶️', texto, tom: 'destaque' };
    }

    case 'INFO': {
      if (/^Modo continuo:/i.test(texto)) return null;
      if (/^Sem anuncios repetidos no catalogo\.?$/i.test(texto)) return null;
      if (/^Mantendo o (navegador do ML|WhatsApp) aberto/i.test(texto)) return null;
      if (/^ {0,2}pagina \d+:/i.test(texto)) return null;
      if (/^ {0,2}\d+ produto\(s\) encontrados no total\.?$/i.test(texto)) return null;
      if (/^IA melhorou o titulo:/i.test(texto)) return null;
      if (/^PROXIMA_POSTAGEM_EM:/i.test(texto)) return null;
      if (/^Mensagem localizada no grupo/i.test(texto)) return null;
      if (/^Catalogo atualizado:/i.test(texto)) return null;
      if (/^Variedade postada:/i.test(texto)) return null;
      if (/^Variedade: no maximo/i.test(texto)) return null;
      if (/^Fechando o (WhatsApp|navegador do ML)/i.test(texto)) return null;

      let m = texto.match(/^ {0,2}(\d+) cupom\(ns\) com codigo encontrados na pagina\.?$/i);
      if (m) return { emoji: '🎟️', texto: `Encontrei ${m[1]} cupom(ns) com código disponível.`, tom: 'ok' };

      if (/^Envio misturado sorteou cupom, mas o catalogo de cupons esta vazio/i.test(texto)) {
        return { emoji: '🎟️', texto: 'Vou buscar cupons novos antes de continuar...', tom: 'info' };
      }
      if (/^Nenhum cupom disponivel/i.test(texto)) {
        return { emoji: '🎟️', texto: 'Não achei cupom dessa vez — seguindo com oferta normal.', tom: 'info' };
      }
      m = texto.match(/^Mercado Livre: (\d+) produto\(s\) examinado\(s\), (\d+) aprovado\(s\)(.*)\.$/i);
      if (m) {
        const motivos = m[3] ? m[3].replace(/^ — motivos:/i, ' Recusados por:') : '';
        return {
          emoji: '⛏️',
          texto: `Mercado Livre: já olhei ${m[1]} produto(s), ${m[2]} aprovado(s).${motivos}`,
          tom: 'info',
        };
      }
      m = texto.match(/^Mercado Livre: (\d+) produto\(s\) novo\(s\) no catalogo \((\d+) examinado\(s\)\)\.$/i);
      if (m) {
        return { emoji: '✅', texto: `Mercado Livre: ${m[1]} produto(s) novo(s) guardado(s).`, tom: 'ok' };
      }
      m = texto.match(/^Shopee: (\d+) produto\(s\) novo\(s\) no catalogo \((\d+) oferta\(s\) vista\(s\)\)\.$/i);
      if (m) {
        return { emoji: '✅', texto: `Shopee: ${m[1]} produto(s) novo(s) guardado(s).`, tom: 'ok' };
      }

      if (/^Garimpando produtos novos em SEGUNDO PLANO/i.test(texto)) {
        return { emoji: '🔎', texto: 'Buscando produtos novos ao mesmo tempo, sem parar as postagens...', tom: 'info' };
      }
      if (/^Nada pra postar agora/i.test(texto)) {
        return { emoji: '⏳', texto: 'Nenhum produto liberado agora — tento de novo em instantes.', tom: 'info' };
      }
      if (/^Catalogo ainda vazio/i.test(texto)) {
        return { emoji: '⏳', texto: 'Ainda sem produtos — garimpando. Posto assim que tiver o primeiro.', tom: 'info' };
      }
      m = texto.match(/^Garimpo ligado: (.+?) \(/i);
      if (m) return { emoji: '🔎', texto: `Garimpo ligado: ${m[1]}, um produto de cada loja por vez.`, tom: 'info' };
      m = texto.match(/^Garimpo pausado: ainda ha (\d+) produtos para postar/i);
      if (m) return { emoji: '⏸️', texto: `Garimpo pausado: ainda há ${m[1]} produtos para postar.`, tom: 'info' };
      if (/^Lote de garimpo:/i.test(texto)) return null;

      m = texto.match(/^Produto pronto — aguardando ate (.+) pra postar\.?$/i);
      if (m) return { emoji: '⏰', texto: `Tudo pronto! Vou postar às ${m[1]}.`, tom: 'destaque' };
      if (/^Produto pronto — busca demorou mais que o intervalo, postando agora\.?$/i.test(texto)) {
        return { emoji: '⏰', texto: 'Tudo pronto! Postando agora.', tom: 'destaque' };
      }
      m = texto.match(/^Proxima postagem prevista: (.+?) \(em ~(.+?)\) — ja buscando o produto\.?$/i);
      if (m) return { emoji: '⏰', texto: `Próxima postagem às ${m[1]} (em ~${m[2]}).`, tom: 'destaque' };

      m = texto.match(/^Temporada de hoje: (.+)$/i);
      if (m) return { emoji: '🎉', texto: `Tema do dia: ${m[1]}`, tom: 'info' };

      return { emoji: 'ℹ️', texto, tom: 'neutro' };
    }

    case 'OK': {
      if (/^Navegador pronto\.?$/i.test(texto)) return null;
      if (/^Navegador do ML ja esta aberto/i.test(texto)) return null;
      if (/^WhatsApp autenticado\.?$/i.test(texto)) return null;
      if (/^Conexao com o WhatsApp pronta\.?$/i.test(texto)) return null;
      if (/^WhatsApp ja esta aberto/i.test(texto)) return null;
      if (/^Grupo ".+" encontrado\.?$/i.test(texto)) return null;
      if (/^Cupons com codigo gravados:/i.test(texto)) return null;
      if (/^\[PRODUTOS\] postado/i.test(texto)) return null;
      if (/^Postagem continua encerrada\.?$/i.test(texto)) return { emoji: '🛑', texto: 'Robô parado.', tom: 'destaque' };
      if (/produtos garimpados — garimpo pausado/i.test(texto)) return { emoji: '⏸️', texto, tom: 'destaque' };
      if (/^Produtos garimpados acabaram/i.test(texto)) return { emoji: '🔎', texto, tom: 'destaque' };
      if (/^Inicializacao completada/i.test(texto)) return { emoji: '✅', texto: 'WhatsApp conectado.', tom: 'ok' };
      return { emoji: '✅', texto, tom: 'ok' };
    }

    case 'APROVADO': {
      let m = texto.match(/^Produto aprovado:\s*\[(\d+)\/(\d+)\]\s*(.+?)\s*—\s*(.+)$/);
      if (m) {
        return { emoji: '🎯', texto: `Encontrei uma promoção boa: ${m[3]} (${explicarMotivo(m[4])})`, tom: 'destaque' };
      }
      m = texto.match(/^Produto aprovado:\s*(.+)$/);
      return { emoji: '🎯', texto: `Encontrei uma promoção boa: ${m ? m[1] : texto}`, tom: 'destaque' };
    }

    case 'IGNORADO': {
      const m = texto.match(/^Produto ignorado:\s*(.+)$/);
      return { emoji: '⏭️', texto: `Pulei um produto: ${m ? m[1] : texto}`, tom: 'aviso' };
    }

    case 'ENVIADO': {
      const m = texto.match(/^Mensagem enviada no WhatsApp:\s*(.+)$/);
      return { emoji: '📤', texto: m ? `Enviado! ${m[1]}` : texto, tom: 'ok' };
    }

    case 'ENCONTRADO': {
      const m = texto.match(/^Produto encontrado:\s*(.+)$/);
      return { emoji: '🔍', texto: m ? m[1] : texto, tom: 'neutro' };
    }

    case 'LINK':
      return null;

    case 'AVISO': {
      if (/^Evento "ready" nao chegou/i.test(texto)) {
        return { emoji: '🔄', texto: 'Conectando ao WhatsApp (passo extra de segurança)...', tom: 'info' };
      }
      if (/^Ainda nao deu para completar:/i.test(texto)) {
        return { emoji: '🔄', texto: 'Continuando a conexão com o WhatsApp...', tom: 'info' };
      }
      if (/^As conversas ainda nao apareceram/i.test(texto)) {
        return { emoji: '🔄', texto: 'Aguardando as conversas do WhatsApp carregarem...', tom: 'info' };
      }
      if (/^A conexao anterior do WhatsApp caiu/i.test(texto)) {
        return { emoji: '🔄', texto: 'A conexão com o WhatsApp caiu — reconectando...', tom: 'aviso' };
      }
      if (/^WhatsApp desconectou/i.test(texto)) {
        return { emoji: '🔌', texto: 'O WhatsApp desconectou — tentando reconectar...', tom: 'aviso' };
      }
      if (/^A sessao foi deslogada/i.test(texto)) {
        return {
          emoji: '📵',
          texto: 'A sessão do WhatsApp foi encerrada — você vai precisar escanear o QR Code de novo.',
          tom: 'aviso',
        };
      }
      if (/^Chrome orfao/i.test(texto)) {
        return { emoji: '🔄', texto: 'Organizando o navegador antes de continuar...', tom: 'info' };
      }
      if (/^Recarregando o WhatsApp Web/i.test(texto)) {
        return { emoji: '🔄', texto: 'Recarregando o WhatsApp para destravar...', tom: 'info' };
      }
      if (/^Mercado Livre pediu um desafio de seguranca/i.test(texto)) {
        return {
          emoji: '🧩',
          texto:
            'O Mercado Livre pediu uma verificação de segurança e está bloqueando as páginas de produto. ' +
            'Use o botão "Resolver verificação agora" no aviso vermelho acima.',
          tom: 'erro',
        };
      }
      if (/^Mercado Livre: a vitrine de ofertas nao devolveu nenhum produto/i.test(texto)) {
        return {
          emoji: '🚧',
          texto: 'Mercado Livre não mostrou nenhuma oferta agora (pode ser bloqueio do site) — tentando outra fonte.',
          tom: 'aviso',
        };
      }
      const semCard = texto.match(/^Amazon: "(.+?)" nao devolveu nenhum card/i);
      if (semCard) {
        return {
          emoji: '🚧',
          texto: 'Amazon não mostrou nenhuma oferta agora (pode ser bloqueio do site) — tentando outra fonte.',
          tom: 'aviso',
        };
      }
      if (/^Shopee: "(.+?)" nao devolveu nenhuma oferta/i.test(texto)) {
        return { emoji: '🚧', texto: 'Shopee não devolveu oferta agora — tentando outra fonte.', tom: 'aviso' };
      }
      if (/^Shopee: a busca de ofertas falhou/i.test(texto)) {
        return {
          emoji: '🚧',
          texto: 'A Shopee não respondeu agora — confira a conexão dela em Conexões se isso se repetir.',
          tom: 'aviso',
        };
      }
      return { emoji: '⚠️', texto, tom: 'aviso' };
    }

    case 'ERRO':
      return { emoji: '❌', texto, tom: 'erro' };

    default:
      return { emoji: '•', texto, tom: 'neutro' };
  }
}

function traduzirHeader(conteudo: string): FeedItem | null {
  if (/^FASE 0/i.test(conteudo)) return null;
  if (/^FASE PRODUTOS/i.test(conteudo)) return null;
  if (/^GRUPOS — rodando/i.test(conteudo)) return null;
  if (/^RESUMO/i.test(conteudo)) return null;

  const grupo = conteudo.match(RE_GRUPO_HEADER);
  if (grupo) return { tipo: 'grupo', nome: grupo[1] };

  return { tipo: 'linha', emoji: '📋', texto: conteudo, tom: 'neutro' };
}

type Token = { item: FeedItem; ehCandidato: boolean };

function classificarLinha(raw: string): Token | null {
  const bruta = raw.trim();
  if (!bruta) return null;

  const semTag = bruta.match(RE_LINHA_TAG);
  if (semTag) {
    const [, hora, tag, texto] = semTag;

    const rodada = texto.match(RE_RODADA);
    if (rodada) return { item: { tipo: 'rodada', numero: Number(rodada[1]) }, ehCandidato: false };

    if (tag === 'OK' && RE_CANDIDATO.test(texto)) {
      return { item: { tipo: 'scan', contagem: 1, hora }, ehCandidato: true };
    }

    const traduzido = traduzirPorTag(tag, texto);
    if (!traduzido) return null;
    return { item: { tipo: 'linha', hora, ...traduzido }, ehCandidato: false };
  }

  const header = bruta.match(RE_HEADER);
  if (header) {
    const item = traduzirHeader(header[1].trim());
    return item ? { item, ehCandidato: false } : null;
  }

  return { item: { tipo: 'linha', emoji: '•', texto: bruta, tom: 'neutro' }, ehCandidato: false };
}

const MAX_CACHE = 2000;
const cacheTokens = new Map<string, Token | null>();
function classificarComCache(raw: string): Token | null {
  const hit = cacheTokens.get(raw);
  if (hit !== undefined) return hit;
  const token = classificarLinha(raw);
  if (cacheTokens.size >= MAX_CACHE) cacheTokens.clear();
  cacheTokens.set(raw, token);
  return token;
}

export function construirFeed(linhas: string[]): FeedItem[] {
  const tokens = linhas.map(classificarComCache).filter((t): t is Token => t !== null);

  const feed: FeedItem[] = [];
  let scanAtual: ItemScan | null = null;

  for (const { item, ehCandidato } of tokens) {
    if (ehCandidato && item.tipo === 'scan') {
      if (scanAtual) {
        scanAtual.contagem += 1;
        scanAtual.hora = item.hora;
      } else {
        scanAtual = { ...item };
        feed.push(scanAtual);
      }
      continue;
    }
    scanAtual = null;
    feed.push(item);
  }

  return feed;
}
