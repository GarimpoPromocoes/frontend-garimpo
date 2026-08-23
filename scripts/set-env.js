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

const conteudo = `// GERADO por scripts/set-env.js no build da Vercel — nao editar a mao.
export const environment = {
  apiBase: ${JSON.stringify(apiBase)},
  apiToken: ${JSON.stringify(apiToken)},
};
`;

const destino = path.join(__dirname, '..', 'src', 'environments', 'environment.prod.ts');
fs.writeFileSync(destino, conteudo);
console.log(`[set-env] environment.prod.ts gerado (apiBase=${apiBase || '(vazio)'}, apiToken=${apiToken ? '***' : '(vazio)'})`);
