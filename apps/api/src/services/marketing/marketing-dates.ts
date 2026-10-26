/**
 * Calendar-date helpers for marketing data. Dates are plain `YYYY-MM-DD`
 * strings in the reporting timezone of each source (広告アカウント / GA4
 * プロパティの時刻帯), so arithmetic is done in UTC to avoid DST drift.
 */

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function isIsoDate(value: string): boolean {
  if (!DATE_RE.test(value)) return false;
  const d = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value;
}

export function addDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Inclusive list of dates between `from` and `to`. */
export function enumerateDates(from: string, to: string, max = 1000): string[] {
  const out: string[] = [];
  let cur = from;
  while (cur <= to && out.length < max) {
    out.push(cur);
    cur = addDays(cur, 1);
  }
  return out;
}

export function daysBetweenInclusive(from: string, to: string): number {
  const a = Date.parse(`${from}T00:00:00Z`);
  const b = Date.parse(`${to}T00:00:00Z`);
  return Math.round((b - a) / 86_400_000) + 1;
}

/** Today's date in the given IANA timezone. Falls back to UTC for unknown zones. */
export function todayInTimezone(timezone: string, now = new Date()): string {
  try {
    return new Intl.DateTimeFormat("en-CA", {
      timeZone: timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(now);
  } catch {
    return now.toISOString().slice(0, 10);
  }
}

export function isValidTimezone(timezone: string): boolean {
  try {
    new Intl.DateTimeFormat("en-CA", { timeZone: timezone });
    return true;
  } catch {
    return false;
  }
}

/** Normalise `YYYY/MM/DD`, `YYYYMMDD` and `YYYY-MM-DD` to `YYYY-MM-DD`. */
export function normalizeDate(raw: string): string | null {
  const value = raw.trim();
  let candidate = value;
  if (/^\d{8}$/.test(value)) {
    candidate = `${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6, 8)}`;
  } else if (/^\d{4}\/\d{1,2}\/\d{1,2}$/.test(value)) {
    const [y, m, d] = value.split("/");
    candidate = `${y}-${m?.padStart(2, "0")}-${d?.padStart(2, "0")}`;
  }
  return isIsoDate(candidate) ? candidate : null;
}

/**
 * Next business day (Mon–Fri) after `from`, at the same wall-clock time.
 * Used for the emergency post-review deadline (翌営業日までに事後レビュー).
 */
export function nextBusinessDay(from: Date): Date {
  const d = new Date(from);
  do {
    d.setUTCDate(d.getUTCDate() + 1);
  } while (d.getUTCDay() === 0 || d.getUTCDay() === 6);
  return d;
}
