/** Format a number with Intl. Returns em-dash for null/NaN. */
export const fmt = (value: number | null | undefined, digits = 0) =>
  value == null || !Number.isFinite(value)
    ? '—'
    : new Intl.NumberFormat('en-GB', {
        maximumFractionDigits: digits,
        minimumFractionDigits: digits,
      }).format(value);

export const parseDate = (value: string) => new Date(`${value}T12:00:00Z`);

export const addDays = (value: string, offset: number) => {
  const date = parseDate(value);
  date.setUTCDate(date.getUTCDate() + offset);
  return date.toISOString().slice(0, 10);
};

export const dateLabel = (
  value: string,
  options: Intl.DateTimeFormatOptions = {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }
) =>
  Number.isNaN(parseDate(value).valueOf())
    ? value
    : new Intl.DateTimeFormat('en-GB', { timeZone: 'UTC', ...options }).format(
        parseDate(value)
      );

export const clockLabel = (value: string | null) =>
  value
    ? new Intl.DateTimeFormat('en-GB', {
        timeZone: 'Europe/London',
        day: '2-digit',
        month: 'short',
        hour: '2-digit',
        minute: '2-digit',
        hourCycle: 'h23',
      }).format(new Date(value)) + ' UK'
    : 'No vintage';

export const levelLabel = (index: number, boundaries: number[]) => {
  if (!boundaries.length) return `Level ${index + 1}`;
  if (index === 0) return `≤ ${fmt(boundaries[0])} MW`;
  if (index >= boundaries.length) return `> ${fmt(boundaries[boundaries.length - 1])} MW`;
  return `${fmt(boundaries[index - 1])}–${fmt(boundaries[index])} MW`;
};

export const rangeDays = (start: string, end: string) => {
  if (!start || !end) return [] as string[];
  const count = Math.max(
    0,
    Math.round(
      (parseDate(end).valueOf() - parseDate(start).valueOf()) / 86400000
    ) + 1
  );
  return Array.from({ length: count }, (_, index) => addDays(start, index));
};

export const fmtCell = (key: string, value: unknown) => {
  if (value == null) return '—';
  if (
    (key.endsWith('_time') || key === 'date') &&
    typeof value === 'string'
  )
    return key === 'date' ? dateLabel(value) : clockLabel(value);
  if (typeof value === 'number')
    return fmt(value, key.includes('h') ? 1 : 0);
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
};

export const monthHeading = (start: string, end: string) => {
  const first = parseDate(start);
  const last = parseDate(end);
  if (Number.isNaN(first.valueOf()) || Number.isNaN(last.valueOf()))
    return 'DATA WINDOW';
  const firstText = new Intl.DateTimeFormat('en-GB', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(first);
  const lastText = new Intl.DateTimeFormat('en-GB', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(last);
  return firstText === lastText
    ? firstText.toUpperCase()
    : `${firstText} – ${lastText}`.toUpperCase();
};
