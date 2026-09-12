'use strict';

// Roda ANTES do `ng build` no deploy da Vercel (ver vercel.json). Le as
// variaveis de ambiente do projeto na Vercel (configuradas no painel:
// Settings > Environment Variables) e escreve environment.prod.ts com elas —
// e' assim que um app 100% client-side (sem servidor Node) recebe config de
// ambiente em build time.
const fs = require('fs');
const path = require('path');

const apiBase = process.env.NG_APP_API_BASE || '';
const apiToken = process.env.NG_APP_API_TOKEN || '';
// URL completa da tela remota (noVNC) do login do Mercado Livre. Separado do
// apiBase de proposito: atras de um tunel com HTTPS (Cloudflare Tunnel,
// Tailscale Funnel...) api e noVNC normalmente saem em subdominios ou
// caminhos diferentes, nunca simplesmente "o mesmo host na porta 6080".
const vncBase = process.env.NG_APP_VNC_BASE || '';

const conteudo = `// GERADO por scripts/set-env.js no build da Vercel — nao editar a mao.
export const environment = {
  apiBase: ${JSON.stringify(apiBase)},
  apiToken: ${JSON.stringify(apiToken)},
  vncBase: ${JSON.stringify(vncBase)},
};
`;

const destino = path.join(__dirname, '..', 'src', 'environments', 'environment.prod.ts');
fs.writeFileSync(destino, conteudo);
console.log(
  `[set-env] environment.prod.ts gerado (apiBase=${apiBase || '(vazio)'}, ` +
    `apiToken=${apiToken ? '***' : '(vazio)'}, vncBase=${vncBase || '(vazio)'})`
);
