// Producao (Vercel): front e api ficam em dominios DIFERENTES
// (ex.: dashboard na Vercel, api em https://api.b2byte.com), entao precisa de
// URL absoluta. A autenticacao e' por login de usuario (JWT obtido em
// /api/auth/login), nao mais por chave fixa embutida no bundle. A tela remota
// do login do ML (noVNC) tambem precisa de URL propria: nao da pra
// simplesmente trocar a porta do host da API (":6080") porque, atras de um
// tunel/proxy com HTTPS, api e noVNC quase sempre saem em dominios ou
// caminhos DIFERENTES, nao na mesma porta.
//
// Esses valores por padrao ficam VAZIOS aqui no repositorio — o script
// scripts/set-env.js reescreve este arquivo em tempo de build, lendo as
// variaveis de ambiente configuradas no projeto da Vercel (NG_APP_API_BASE,
// NG_APP_VNC_BASE). Fora da Vercel (ex.: build de producao local/Docker),
// como o script nao roda, isso fica com os defaults abaixo — equivalente ao
// environment.ts (mesmo dominio), o que e' inofensivo.
export const environment = {
  apiBase: '',
  vncBase: '',
};
