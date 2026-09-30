'use strict';

const fs = require('fs');
const path = require('path');

const apiBase = process.env.NG_APP_API_BASE || '';

const conteudo = `// GERADO por scripts/set-env.js no build da Vercel — nao editar a mao.
export const environment = {
  apiBase: ${JSON.stringify(apiBase)},
};
`;

const destino = path.join(__dirname, '..', 'src', 'environments', 'environment.prod.ts');
fs.writeFileSync(destino, conteudo);
console.log(
  `[set-env] environment.prod.ts gerado (apiBase=${apiBase || '(vazio)'})`
);
