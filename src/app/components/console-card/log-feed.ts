// -----------------------------------------------------------------------
// Traduz o log tecnico do robo (linhas cruas tipo "[10:29:06] [OK] ...")
// num feed de atividade legivel pra quem nunca programou: agrupa por
// rodada, junta a varredura de produtos numa unica linha com contador,
// troca [TAG] por emoji + frase em portugues simples, e esconde detalhes
// puramente internos (bug workarounds, timestamps ISO duplicados, etc.).
//
// Fica tudo num arquivo sem dependencia de Angular de proposito — e' texto
// entrando, texto (estruturado) saindo, entao da pra testar/ajustar so
// olhando pros regexes, sem precisar rodar o app.
// -----------------------------------------------------------------------

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
// As linhas numeradas que aparecem durante a varredura de ofertas:
// "[12] Titulo do produto — R$ 99,90 (40% OFF, 500 vendidos)"
const RE_CANDIDATO = /^\[\d+\]\s+.+\s—\s*R\$\s*[\d.,]+\s*\(\d+%\s*OFF/;

function explicarMotivo(motivo: string): string {
  const m = motivo.trim();
  if (/produto novo/i.test(m)) return 'nunca publicado antes';
  if (/^preco caiu/i.test(m)) return m.replace(/^preco caiu:/i, 'o preço caiu:').replace(/->/g, '→');
  if (/^desconto subiu/i.test(m)) return m.replace(/^desconto subiu:/i, 'o desconto aumentou:').replace(/->/g, '→');
  if (/repostagem liberada/i.test(m)) return 'pode repetir — já faz tempo desde a última vez';
  if (/^relampago$/i.test(m)) return 'oferta relâmpago';
  return m;
}

// Traduz o TEXTO (ja sem "[HH:MM:SS] [TAG]") de uma linha marcada com uma
// tag conhecida. Retorna null quando a linha deve ficar escondida (ruido
// puramente interno/redundante).
function traduzirPorTag(tag: string, texto: string): { emoji: string; texto: string; tom: Tom } | null {
  switch (tag) {
    case 'PASSO': {
      if (/^Abrindo o navegador/i.test(texto)) return { emoji: '🌐', texto: 'Abrindo o navegador...', tom: 'destaque' };
      if (/^Cupons:\s*https?:\/\//i.test(texto)) return { emoji: '🔎', texto: 'Procurando cupons disponíveis...', tom: 'destaque' };
      if (/^Ofertas:\s*https?:\/\//i.test(texto)) return { emoji: '🔎', texto: 'Procurando promoções novas...', tom: 'destaque' };
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
      if (/^Garimpando produtos novos em SEGUNDO PLANO/i.test(texto)) {
        return { emoji: '🔎', texto: 'Buscando produtos novos ao mesmo tempo, sem parar as postagens...', tom: 'info' };
      }
      m = texto.match(/^Nada pra postar agora — tentando de novo em (\d+)s/i);
      if (m) return { emoji: '⏳', texto: 'Nenhum produto novo por enquanto — tento de novo em instantes.', tom: 'info' };

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
      // Conclusao do "plano B" de conexao (ver bloco AVISO abaixo) — nao e'
      // um evento novo pro usuario, so a confirmacao de que aquele passo
      // extra deu certo.
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
      // A biblioteca do WhatsApp tem uma falha conhecida: o aviso de "tudo
      // pronto" as vezes nunca chega, mesmo com a conexao ja funcionando.
      // O robo detecta isso sozinho e completa a conexao na mao — e' um
      // plano B automatico e ESPERADO (por isso mostrado como "info", nao
      // como um problema de verdade), nao um erro.
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

  // Linha que nao bate com nenhum formato conhecido (ex.: pedaco de stack
  // trace de um erro) — mostra crua mesmo, sem tentar adivinhar.
  return { item: { tipo: 'linha', emoji: '•', texto: bruta, tom: 'neutro' }, ehCandidato: false };
}

export function construirFeed(linhas: string[]): FeedItem[] {
  const tokens = linhas.map(classificarLinha).filter((t): t is Token => t !== null);

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
