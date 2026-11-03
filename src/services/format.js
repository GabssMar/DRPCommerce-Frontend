// Formatação para a tela. Datas da API vêm em UTC; a loja mostra em Brasília.
export const TIME_ZONE = 'America/Sao_Paulo';

const brlFormatter = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
const numberFormatter = new Intl.NumberFormat('pt-BR');
const compactFormatter = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 1, minimumFractionDigits: 1 });

export const brl = (value) => brlFormatter.format(Number(value) || 0);
export const formatNumber = (value) => numberFormatter.format(Number(value) || 0);

// R$ 195,9 mil · R$ 1,2 mi — para KPIs, sempre acompanhado do valor exato no title.
export const brlCompact = (value) => {
  const n = Number(value) || 0;
  if (Math.abs(n) >= 1e6) return { value: `R$ ${compactFormatter.format(n / 1e6)}`, unit: 'mi' };
  if (Math.abs(n) >= 1e4) return { value: `R$ ${compactFormatter.format(n / 1e3)}`, unit: 'mil' };
  const [int, cents] = brlFormatter.format(n).split(',');
  return { value: int, unit: `,${cents}` };
};

const parts = (options) => new Intl.DateTimeFormat('pt-BR', { timeZone: TIME_ZONE, ...options });
const dateFmt = parts({ day: '2-digit', month: '2-digit' });
const dateYearFmt = parts({ day: '2-digit', month: '2-digit', year: 'numeric' });
const timeFmt = parts({ hour: '2-digit', minute: '2-digit' });
const timeSecFmt = parts({ hour: '2-digit', minute: '2-digit', second: '2-digit' });
const weekdayFmt = parts({ weekday: 'short' });
const monthYearFmt = parts({ month: '2-digit', year: 'numeric' });

const toDate = (value) => (value instanceof Date ? value : new Date(value));
const valid = (value) => value != null && value !== '' && !Number.isNaN(toDate(value).getTime());

export const formatDate = (value) => (valid(value) ? dateFmt.format(toDate(value)) : '—');
export const formatDateYear = (value) => (valid(value) ? dateYearFmt.format(toDate(value)) : '—');
export const formatTime = (value) => (valid(value) ? timeFmt.format(toDate(value)) : '—');
export const formatTimeSec = (value) => (valid(value) ? timeSecFmt.format(toDate(value)) : '—');
export const formatDateTime = (value) => (valid(value) ? `${formatDate(value)} ${formatTime(value)}` : '—');
export const formatMonthYear = (value) => (valid(value) ? monthYearFmt.format(toDate(value)) : '—');
export const formatWeekday = (value) => (valid(value) ? weekdayFmt.format(toDate(value)).replace('.', '') : '');

// Dia local (YYYY-MM-DD) em Brasília: a venda das 22h de 30/09 é de 30/09, não de 01/10.
const dayKeyFmt = new Intl.DateTimeFormat('en-CA', { timeZone: TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit' });
export const localDayKey = (value) => dayKeyFmt.format(toDate(value));

// <input type="datetime-local"> trabalha em hora local do navegador sem fuso.
export const toLocalInput = (value) => {
  if (!valid(value)) return '';
  const d = toDate(value);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};
export const fromLocalInput = (value) => (value ? new Date(value).toISOString() : null);
export const toDateInput = (value) => (valid(value) ? toLocalInput(value).slice(0, 10) : '');
export const fromDateInput = (value, endOfDay = false) =>
  value ? new Date(`${value}T${endOfDay ? '23:59:59' : '00:00:00'}`).toISOString() : null;

// 00:41 · 1:12:40
export const formatDuration = (ms) => {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const pad = (n) => String(n).padStart(2, '0');
  return h ? `${pad(h)}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
};

// "3d 01h 34min" para prazos longos.
export const durationParts = (ms) => {
  const total = Math.max(0, Math.floor(ms / 60000));
  return { days: Math.floor(total / 1440), hours: Math.floor((total % 1440) / 60), minutes: total % 60 };
};

export const initials = (name = '') =>
  name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0].toUpperCase()).join('') || '?';

// "Ana Ribeiro" -> "Ana R."
export const shortName = (name = '') => {
  const [first, ...rest] = name.split(/\s+/).filter(Boolean);
  return rest.length ? `${first} ${rest[rest.length - 1][0]}.` : first ?? '';
};

export const dropOrderCode = (id) => `DRP-${id}`;
export const storeOrderCode = (id) => `STR-${id}`;

export const plural = (n, one, many) => `${formatNumber(n)} ${n === 1 ? one : many}`;

export const percent = (part, whole) => (whole ? Math.round((part / whole) * 100) : 0);
