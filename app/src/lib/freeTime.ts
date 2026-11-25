import { eventsOnDay } from "./aggregate";
import type { AppData } from "./types";

/**
 * 予定のない時間帯（NEXT v21 X10：空白＝自由時間とは限らない。無断で登録しない。本人設定の活動できる時間の中だけを見る）。
 * - 見るのは、時刻つきの予定だけ（終日の予定は、時間を決めていないので、ふさがっているとは数えない）
 * - 予定の前後に移動時間（travelMinutes）があれば、その分も、ふさがっているとする
 * - 活動できる時間は、はじめは 8:00〜22:00（本人が変えられる前提の仮の値。休息・食事・睡眠は入れていない）
 * - 短い間（30分未満）は出さない。重なる予定は、まとめて1つのふさがった時間にする
 */
export const ACTIVE_FROM = "08:00";
export const ACTIVE_TO = "22:00";
export const MIN_FREE_MINUTES = 30;

export interface Slot {
  from: string;
  to: string;
  minutes: number;
}

const toMin = (t: string) => {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
};
const toStr = (n: number) => `${String(Math.floor(n / 60)).padStart(2, "0")}:${String(n % 60).padStart(2, "0")}`;

export function freeSlots(d: AppData, date: string, from: string = ACTIVE_FROM, to: string = ACTIVE_TO): Slot[] {
  const lo = toMin(from);
  const hi = toMin(to);
  const busy: [number, number][] = [];
  for (const e of eventsOnDay(d.events, date)) {
    if (e.allDay || !/^\d{2}:\d{2}$/.test(e.startTime) || !/^\d{2}:\d{2}$/.test(e.endTime)) continue;
    // 何日かにまたがる予定の、2日目以降の日は、時間を決められないので数えない（その日の全体をふさぐとはしない）
    if (e.startDate !== e.endDate && e.startDate !== date && e.endDate !== date) continue;
    // 1日の予定（繰り返しの回も、これ）は、その時刻のとおり。何日かにまたがる予定は、開始の日は夜まで、最後の日は終わりまで
    const single = e.startDate === e.endDate;
    let s = single || e.startDate === date ? toMin(e.startTime) : lo;
    let t = single || e.endDate === date ? toMin(e.endTime) : hi;
    if (!single && e.startDate === date) t = hi;
    s -= e.travelMinutes ?? 0;
    t += e.travelMinutes ?? 0;
    busy.push([Math.max(lo, s), Math.min(hi, t)]);
  }
  busy.sort((a, b) => a[0] - b[0]);
  const merged: [number, number][] = [];
  for (const b of busy) {
    if (b[1] <= b[0]) continue;
    const last = merged[merged.length - 1];
    if (last && b[0] <= last[1]) last[1] = Math.max(last[1], b[1]);
    else merged.push([b[0], b[1]]);
  }
  const out: Slot[] = [];
  let cur = lo;
  for (const [s, t] of merged) {
    if (s - cur >= MIN_FREE_MINUTES) out.push({ from: toStr(cur), to: toStr(s), minutes: s - cur });
    cur = Math.max(cur, t);
  }
  if (hi - cur >= MIN_FREE_MINUTES) out.push({ from: toStr(cur), to: toStr(hi), minutes: hi - cur });
  return out;
}
