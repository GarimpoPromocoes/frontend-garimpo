/**
 * Tema claro/escuro do painel. Sem escolha, vale o que o sistema pede
 * (prefers-color-scheme, direto no CSS). Com escolha, ela fica no <html> como
 * data-theme e é lembrada neste navegador — o index.html a reaplica antes da
 * primeira pintura.
 *
 * Qualquer botão com `data-alternar-tema` troca o tema; o texto dele muda por
 * CSS (.so-no-claro / .so-no-escuro), então aqui não há nada para desenhar.
 */
const CHAVE_TEMA = 'promobot:tema';

type Tema = 'light' | 'dark';

function temaEmUso(): Tema {
  const escolhido = document.documentElement.getAttribute('data-theme');
  if (escolhido === 'dark' || escolhido === 'light') return escolhido;
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

/** A barra do navegador no celular acompanha o fundo do tema em uso. */
function pintarBarraDoNavegador(): void {
  const fundo = getComputedStyle(document.documentElement).getPropertyValue('--bg').trim();
  if (fundo) document.querySelector('meta[name="theme-color"]')?.setAttribute('content', fundo);
}

export function iniciarTema(): void {
  if (typeof document === 'undefined') return;

  pintarBarraDoNavegador();
  window.matchMedia?.('(prefers-color-scheme: dark)').addEventListener?.('change', pintarBarraDoNavegador);

  document.addEventListener('click', (ev) => {
    const alvo = ev.target instanceof Element ? ev.target.closest('[data-alternar-tema]') : null;
    if (!alvo) return;
    const novo: Tema = temaEmUso() === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', novo);
    pintarBarraDoNavegador();
    try {
      localStorage.setItem(CHAVE_TEMA, novo);
    } catch (_) {
    }
  });
}
