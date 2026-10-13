/**
 * Foco de teclado das janelas (qualquer `.modal-fundo` do painel), num lugar só:
 *   - ao abrir, o foco entra na janela — o leitor de tela anuncia o nome dela;
 *   - Tab e Shift+Tab ficam dentro da janela de cima, sem escapar pro painel atrás;
 *   - Esc fecha, do mesmo jeito que clicar fora (é o clique no fundo que cada janela já trata);
 *   - ao fechar, o foco volta pro botão que abriu.
 *
 * É só comportamento de tela: não conhece nenhuma janela pelo nome nem mexe em estado.
 */
const FOCAVEIS =
  'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

function janelaDeCima(): HTMLElement | null {
  const fundos = document.querySelectorAll<HTMLElement>('.modal-fundo');
  return fundos.length ? fundos[fundos.length - 1] : null;
}

function focaveis(caixa: HTMLElement): HTMLElement[] {
  return [...caixa.querySelectorAll<HTMLElement>(FOCAVEIS)].filter((el) => el.getClientRects().length > 0);
}

export function iniciarFocoDasJanelas(): void {
  if (typeof document === 'undefined' || typeof MutationObserver === 'undefined') return;

  /** Quem estava com o foco quando cada janela abriu. */
  const origem = new Map<HTMLElement, HTMLElement | null>();

  const aoAbrir = (fundo: HTMLElement) => {
    const caixa = fundo.querySelector<HTMLElement>('.modal-caixa');
    if (!caixa) return;
    origem.set(fundo, document.activeElement instanceof HTMLElement ? document.activeElement : null);
    // A janela de confirmação já põe o foco no botão dela — não disputa.
    if (caixa.contains(document.activeElement)) return;
    if (!caixa.hasAttribute('tabindex')) caixa.setAttribute('tabindex', '-1');
    caixa.focus({ preventScroll: true });
  };

  const aoFechar = (fundo: HTMLElement) => {
    const anterior = origem.get(fundo);
    origem.delete(fundo);
    // Se ainda sobrou janela aberta e o foco já está nela, não mexe.
    const deCima = janelaDeCima();
    if (deCima?.contains(document.activeElement)) return;
    if (anterior?.isConnected) anterior.focus({ preventScroll: true });
    else deCima?.querySelector<HTMLElement>('.modal-caixa')?.focus({ preventScroll: true });
  };

  new MutationObserver((mudancas) => {
    for (const m of mudancas) {
      m.addedNodes.forEach((n) => {
        if (n instanceof HTMLElement && n.classList.contains('modal-fundo')) aoAbrir(n);
      });
      m.removedNodes.forEach((n) => {
        if (n instanceof HTMLElement && n.classList.contains('modal-fundo')) aoFechar(n);
      });
    }
  }).observe(document.body, { childList: true, subtree: true });

  document.addEventListener('keydown', (ev) => {
    // Quem já tratou a tecla (a tela ao vivo da loja repassa Tab e Esc pro site) fica com ela.
    if (ev.defaultPrevented) return;
    const fundo = janelaDeCima();
    const caixa = fundo?.querySelector<HTMLElement>('.modal-caixa');
    if (!fundo || !caixa) return;

    if (ev.key === 'Escape') {
      // Estas duas já fecham com Esc por conta própria.
      if (caixa.getAttribute('role') === 'alertdialog' || caixa.classList.contains('busca-modal')) return;
      fundo.click();
      return;
    }

    if (ev.key !== 'Tab') return;
    const lista = focaveis(caixa);
    if (!lista.length) {
      ev.preventDefault();
      caixa.focus({ preventScroll: true });
      return;
    }
    const primeiro = lista[0];
    const ultimo = lista[lista.length - 1];
    const atual = document.activeElement;
    if (!caixa.contains(atual) || atual === caixa) {
      ev.preventDefault();
      (ev.shiftKey ? ultimo : primeiro).focus();
    } else if (ev.shiftKey && atual === primeiro) {
      ev.preventDefault();
      ultimo.focus();
    } else if (!ev.shiftKey && atual === ultimo) {
      ev.preventDefault();
      primeiro.focus();
    }
  });
}
