// Dev local / build padrao do Docker: front e api ficam no MESMO dominio
// (nginx proxia /api pra dashboard-api) — apiBase vazio = usa caminhos
// relativos (/api/...), sem token nenhum.
export const environment = {
  apiBase: '',
  apiToken: '',
};
