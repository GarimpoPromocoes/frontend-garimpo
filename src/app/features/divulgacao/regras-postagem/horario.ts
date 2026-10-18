import { HorarioFuncionamento } from '../../../core/services/config.service';

/** Mesma regra do backend (shared/horario.js): relógio de São Paulo, janela pode passar da meia-noite. */
export const HORARIO_PADRAO: HorarioFuncionamento = { ativo: false, inicio: '07:00', fim: '21:00' };

const HORA = /^([01]\d|2[0-3]):([0-5]\d)$/;

export function horaValida(h: string): boolean {
  return HORA.test(h || '');
}

function paraMinutos(h: string): number {
  const m = HORA.exec(h);
  return m ? Number(m[1]) * 60 + Number(m[2]) : 0;
}

const formatador = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'America/Sao_Paulo',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});

function minutosEmSaoPaulo(data: Date): number {
  const partes = formatador.formatToParts(data);
  const h = Number(partes.find((p) => p.type === 'hour')?.value);
  const m = Number(partes.find((p) => p.type === 'minute')?.value);
  return h * 60 + m;
}

export function dentroDoHorario(h: HorarioFuncionamento | null | undefined, agora = new Date()): boolean {
  if (!h?.ativo || !horaValida(h.inicio) || !horaValida(h.fim)) return true;
  const ini = paraMinutos(h.inicio);
  const fim = paraMinutos(h.fim);
  if (ini === fim) return true;
  const atual = minutosEmSaoPaulo(agora);
  return ini < fim ? atual >= ini && atual < fim : atual >= ini || atual < fim;
}

/** Quantas horas por dia a janela fica aberta (texto curto). */
export function duracaoJanela(inicio: string, fim: string): string {
  if (!horaValida(inicio) || !horaValida(fim)) return '—';
  const min = (paraMinutos(fim) - paraMinutos(inicio) + 1440) % 1440 || 1440;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m ? `${h}h${String(m).padStart(2, '0')}` : `${h}h`;
}

export function passaDaMeiaNoite(inicio: string, fim: string): boolean {
  return horaValida(inicio) && horaValida(fim) && paraMinutos(fim) < paraMinutos(inicio);
}
