// ローカル日付ユーティリティ。Date#toISOString() は UTC になり日本時間で前日にずれるため使わない。

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;

const pad = (n: number) => String(n).padStart(2, "0");

/** Date をローカル時刻で "YYYY-MM-DD" にする */
export function toDateStr(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function todayStr(now: Date = new Date()): string {
  return toDateStr(now);
}

/** 実在する日付かを検証（2026-02-30 などは false） */
export function isValidDateStr(s: string): boolean {
  const m = DATE_RE.exec(s);
  if (!m) return false;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  if (y < 1900 || y > 2200 || mo < 1 || mo > 12) return false;
  return d >= 1 && d <= daysInMonth(y, mo);
}

export function isValidTimeStr(s: string): boolean {
  return TIME_RE.test(s);
}

export function parseDateStr(s: string): { y: number; m: number; d: number } {
  const m = DATE_RE.exec(s);
  if (!m) throw new Error(`invalid date: ${s}`);
  return { y: Number(m[1]), m: Number(m[2]), d: Number(m[3]) };
}

export function daysInMonth(y: number, m: number): number {
  return new Date(y, m, 0).getDate();
}

/** "YYYY-MM" */
export function monthKey(dateStr: string): string {
  return dateStr.slice(0, 7);
}

export function monthKeyOf(y: number, m: number): string {
  return `${y}-${pad(m)}`;
}

export function addMonthsToKey(key: string, delta: number): string {
  const [y, m] = key.split("-").map(Number);
  const idx = y * 12 + (m - 1) + delta;
  return monthKeyOf(Math.floor(idx / 12), (idx % 12) + 1);
}

export function addDays(dateStr: string, delta: number): string {
  const { y, m, d } = parseDateStr(dateStr);
  return toDateStr(new Date(y, m - 1, d + delta));
}

/** 指定月の anchorDay（月末超過は月末に丸める） */
export function clampDay(y: number, m: number, day: number): string {
  return `${y}-${pad(m)}-${pad(Math.min(day, daysInMonth(y, m)))}`;
}

/** カレンダー用：日曜始まりの週ごとの日付配列（前後月の日は null） */
export function monthGrid(key: string): (string | null)[][] {
  const [y, m] = key.split("-").map(Number);
  const first = new Date(y, m - 1, 1).getDay();
  const total = daysInMonth(y, m);
  const cells: (string | null)[] = [];
  for (let i = 0; i < first; i++) cells.push(null);
  for (let d = 1; d <= total; d++) cells.push(`${y}-${pad(m)}-${pad(d)}`);
  while (cells.length % 7 !== 0) cells.push(null);
  const weeks: (string | null)[][] = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
  return weeks;
}

const WEEK = ["日", "月", "火", "水", "木", "金", "土"];

export function weekdayOf(dateStr: string): number {
  const { y, m, d } = parseDateStr(dateStr);
  return new Date(y, m - 1, d).getDay();
}

/** "11月21日(土)" */
export function formatDateJa(dateStr: string, withYear = false): string {
  const { y, m, d } = parseDateStr(dateStr);
  const w = WEEK[weekdayOf(dateStr)];
  return `${withYear ? `${y}年` : ""}${m}月${d}日(${w})`;
}

export function formatMonthJa(key: string): string {
  const [y, m] = key.split("-").map(Number);
  return `${y}年${m}月`;
}

export function daysBetween(a: string, b: string): number {
  const pa = parseDateStr(a);
  const pb = parseDateStr(b);
  const ta = Date.UTC(pa.y, pa.m - 1, pa.d);
  const tb = Date.UTC(pb.y, pb.m - 1, pb.d);
  return Math.round((tb - ta) / 86400000);
}
