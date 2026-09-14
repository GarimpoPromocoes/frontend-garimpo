// Dev local / build padrao do Docker: front e api ficam no MESMO dominio
// (nginx proxia /api pra dashboard-api) — apiBase vazio = usa caminhos
// relativos (/api/...). A autenticacao e' por login de usuario (JWT), nao
// por chave de build — ver services/auth.service.ts. vncBase vazio = a tela
// remota do login do ML usa o mesmo host da pagina, na porta 6080 (ver
// connection-card.ts).
export const environment = {
  apiBase: '',
  vncBase: '',
};
