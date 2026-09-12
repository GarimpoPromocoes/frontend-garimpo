// Dev local / build padrao do Docker: front e api ficam no MESMO dominio
// (nginx proxia /api pra dashboard-api) — apiBase vazio = usa caminhos
// relativos (/api/...), sem token nenhum. vncBase vazio = a tela remota do
// login do ML usa o mesmo host da pagina, na porta 6080 (ver connection-card.ts).
export const environment = {
  apiBase: '',
  apiToken: '',
  vncBase: '',
};
