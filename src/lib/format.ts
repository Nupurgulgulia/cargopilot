import { TIMEZONE } from "./constants";

export const gbp = (n: number) =>
  "£" + n.toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export const gbp0 = (n: number) =>
  "£" + n.toLocaleString("en-GB", { maximumFractionDigits: 2 });

export const num = (n: number, dp = 2) => n.toLocaleString("en-GB", { maximumFractionDigits: dp });

export const kg = (n: number) => `${num(n)} kg`;

export const pct = (n: number, dp = 1) => `${(n * 100).toFixed(dp)}%`;

export const round2 = (n: number) => Math.round(n * 100) / 100;

/** Today's date in the UK as yyyy-mm-dd (R-10 policy: judged on the UK calendar date). */
export function todayISO(now: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const get = (t: string) => parts.find((p) => p.type === t)!.value;
  return `${get("year")}-${get("month")}-${get("day")}`;
}

export function isoToDisplay(iso: string | null | undefined): string {
  if (!iso) return "Not set";
  const [y, m, d] = iso.split("-");
  return `${d}-${m}-${y}`;
}

/** Accepts DD-MM-YYYY, DD/MM/YYYY, DD.MM.YYYY or yyyy-mm-dd. Returns ISO or null if not a real date. */
export function parseDate(input: string): string | null {
  const s = input.trim();
  let d: number, m: number, y: number;
  let match = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$/);
  if (match) {
    d = +match[1];
    m = +match[2];
    y = +match[3];
  } else if ((match = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/))) {
    y = +match[1];
    m = +match[2];
    d = +match[3];
  } else return null;
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return null;
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

export function addDaysISO(iso: string, days: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + days));
  return dt.toISOString().slice(0, 10);
}

export function daysBetweenISO(a: string, b: string): number {
  const toMs = (s: string) => {
    const [y, m, d] = s.split("-").map(Number);
    return Date.UTC(y, m - 1, d);
  };
  return Math.round((toMs(b) - toMs(a)) / 86400000);
}

export const plural = (n: number, one: string, many = one + "s") => `${n} ${n === 1 ? one : many}`;
