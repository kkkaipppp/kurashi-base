import { addDays, clampDay, daysBetween, parseDateStr, weekdayOf } from "./date";
import type { Chore, GarbageDay, Reservation } from "./types";

/**
 * 暮らしのこと（To-Be 2026-11-28：予約情報・キャンセル期限・家事分担・買い足すもの・ゴミ出し。自分用）。
 * どれも本人が入れた記録だけから出す（お店・自治体・予約サイトとはつながっていない。予約済みも本人が付ける）。
 */

export const WEEKDAYS = ["日", "月", "火", "水", "木", "金", "土"];

const RANGE = /[〜~\-ー－–―から]+/;

/**
 * 「月・木」「月曜日、木曜日」「月〜金」「平日」「土日」「毎日」→ 曜日の番号（0=日〜6=土）。重ねない・並べる。
 * 「曜日」「曜」の「日」を日曜と取り違えない（点検 高-1）。範囲は前から後ろへ（「金〜月」は 金土日月）。
 * 曜日として読めない字が残ったら、空を返す（入力の誤りとして断る。点検 中-1）
 */
export function parseWeekdays(s: string): number[] {
  let t = s.normalize("NFKC").replace(/曜日|曜/g, "").replace(/毎日/g, "日月火水木金土").replace(/平日/g, "月〜金").replace(/週末/g, "土日").replace(/毎週/g, "");
  const out = new Set<number>();
  // 範囲（月〜金）
  t = t.replace(new RegExp(`([日月火水木金土])${RANGE.source}([日月火水木金土])`, "g"), (_m, a: string, b: string) => {
    const i = WEEKDAYS.indexOf(a);
    const j = WEEKDAYS.indexOf(b);
    for (let k = 0; k <= (j - i + 7) % 7; k++) out.add((i + k) % 7);
    return "";
  });
  for (const ch of t) {
    const i = WEEKDAYS.indexOf(ch);
    if (i >= 0) out.add(i);
    else if (!/[\s・、,，/と及びおよび]/.test(ch)) return [];
  }
  return [...out].sort((a, b) => a - b);
}

/** 「2・4」「第1,第3」「1〜3」→ 週の番号（1〜5）。1〜5 でない数や読めない字があれば空（断る。点検 中-1） */
export function parseWeeks(s: string): number[] {
  let t = s.normalize("NFKC").replace(/第|週|回目|目/g, "");
  const out = new Set<number>();
  let bad = false;
  t = t.replace(new RegExp(`(\\d+)${RANGE.source}(\\d+)`, "g"), (_m, a: string, b: string) => {
    const i = Number(a);
    const j = Number(b);
    if (i < 1 || j > 5 || i > j) bad = true;
    else for (let k = i; k <= j; k++) out.add(k);
    return "";
  });
  for (const m of t.matchAll(/\d+/g)) {
    const n = Number(m[0]);
    if (n < 1 || n > 5) bad = true;
    else out.add(n);
  }
  if (bad || /[^\d\s・、,，/と]/.test(t)) return [];
  return [...out].sort((a, b) => a - b);
}

/** その日がゴミの日か（第何週は、その月の何回目のその曜日か＝日にちを7で割って切り上げ） */
export function garbageOn(g: GarbageDay, date: string): boolean {
  if (!g.weekdays.includes(weekdayOf(date))) return false;
  if (g.weeks.length === 0) return true;
  return g.weeks.includes(Math.ceil(parseDateStr(date).d / 7));
}

export function garbageLabel(g: GarbageDay): string {
  const days = g.weekdays.map((w) => WEEKDAYS[w]).join("・");
  return g.weeks.length ? `第${g.weeks.join("・")}${days}曜日` : `毎週${days}曜日`;
}

/** 家事の次の日（やった日から。毎月は月末を超えたら月末。「決めない」や、まだやっていないものは ""） */
export function choreNext(c: Chore): string {
  if (!c.lastDone || c.cycle === "none") return "";
  if (c.cycle === "daily") return addDays(c.lastDone, 1);
  if (c.cycle === "weekly") return addDays(c.lastDone, 7);
  const p = parseDateStr(c.lastDone);
  return p.m === 12 ? clampDay(p.y + 1, 1, p.d) : clampDay(p.y, p.m + 1, p.d);
}

/** 無料キャンセルの期限まであと何日か（予約済みで期限があるものだけ。過ぎたら null） */
export function cancelDaysLeft(r: Reservation, today: string): number | null {
  if (r.status !== "booked" || !r.cancelBy) return null;
  const d = daysBetween(today, r.cancelBy);
  return d >= 0 ? d : null;
}

/** 「今日まで」「明日まで」「あと3日」（ホームと一覧で同じ言い方。点検 低-3） */
export function cancelWhen(d: number): string {
  return d === 0 ? "今日まで" : d === 1 ? "明日まで" : `あと${d}日`;
}

export function cancelText(name: string, d: number): string {
  return `${name}の無料キャンセルは${cancelWhen(d)}`;
}
