// 日本の祝日（「国民の祝日に関する法律」の今の決まり）を、ネットを使わずに計算する。
// 対象は 2022〜2099 年。春分の日・秋分の日は計算で出した日で、正式には前の年の2月に国が決める（ずれたらここを直す）。
// 法律が変わったとき（祝日が増える・動く）は、この表を直す。

const FIXED: [number, number, string][] = [
  [1, 1, "元日"],
  [2, 11, "建国記念の日"],
  [2, 23, "天皇誕生日"],
  [4, 29, "昭和の日"],
  [5, 3, "憲法記念日"],
  [5, 4, "みどりの日"],
  [5, 5, "こどもの日"],
  [8, 11, "山の日"],
  [11, 3, "文化の日"],
  [11, 23, "勤労感謝の日"],
];
// [月, 第何, 名前]（その月の第n月曜日）
const HAPPY_MONDAY: [number, number, string][] = [
  [1, 2, "成人の日"],
  [7, 3, "海の日"],
  [9, 3, "敬老の日"],
  [10, 2, "スポーツの日"],
];

export const HOLIDAY_FIRST_YEAR = 2022;
export const HOLIDAY_LAST_YEAR = 2099;

const pad = (n: number) => String(n).padStart(2, "0");
const key = (y: number, m: number, d: number) => `${y}-${pad(m)}-${pad(d)}`;
const weekday = (y: number, m: number, d: number) => new Date(Date.UTC(y, m - 1, d)).getUTCDay();

function equinoxDay(y: number, base: number): number {
  return Math.floor(base + 0.242194 * (y - 1980) - Math.floor((y - 1980) / 4));
}

const cache = new Map<number, Map<string, string>>();

/** その年の祝日（振替休日・国民の休日を含む）。キーは "YYYY-MM-DD" */
export function holidaysOfYear(y: number): Map<string, string> {
  const hit = cache.get(y);
  if (hit) return hit;
  const out = new Map<string, string>();
  if (y < HOLIDAY_FIRST_YEAR || y > HOLIDAY_LAST_YEAR) {
    cache.set(y, out);
    return out;
  }
  for (const [m, d, name] of FIXED) out.set(key(y, m, d), name);
  for (const [m, nth, name] of HAPPY_MONDAY) {
    const first = weekday(y, m, 1);
    const firstMonday = 1 + ((8 - first) % 7);
    out.set(key(y, m, firstMonday + 7 * (nth - 1)), name);
  }
  out.set(key(y, 3, equinoxDay(y, 20.8431)), "春分の日");
  out.set(key(y, 9, equinoxDay(y, 23.2488)), "秋分の日");

  const sorted = [...out.keys()].sort();
  // 国民の休日：前の日と次の日が祝日で、その日が祝日でない日
  for (const k of sorted) {
    const d = new Date(`${k}T00:00:00Z`);
    const next = new Date(d.getTime() + 86_400_000);
    const after = new Date(d.getTime() + 2 * 86_400_000);
    const nk = next.toISOString().slice(0, 10);
    const ak = after.toISOString().slice(0, 10);
    if (!out.has(nk) && out.has(ak) && next.getUTCDay() !== 0) out.set(nk, "国民の休日");
  }
  // 振替休日：祝日が日曜なら、その後のいちばん近い祝日でない日
  for (const k of [...out.keys()].sort()) {
    const d = new Date(`${k}T00:00:00Z`);
    if (d.getUTCDay() !== 0) continue;
    let t = new Date(d.getTime() + 86_400_000);
    while (out.has(t.toISOString().slice(0, 10))) t = new Date(t.getTime() + 86_400_000);
    out.set(t.toISOString().slice(0, 10), "振替休日");
  }
  cache.set(y, out);
  return out;
}

/** その日が祝日なら名前、ちがえば null（"YYYY-MM-DD"） */
export function holidayName(date: string): string | null {
  const y = Number(date.slice(0, 4));
  if (!Number.isInteger(y)) return null;
  return holidaysOfYear(y).get(date) ?? null;
}
