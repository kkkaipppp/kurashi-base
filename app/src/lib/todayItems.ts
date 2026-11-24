import { eventsOnDay } from "./aggregate";
import { daysBetween, formatDateJa } from "./date";
import { formatYen } from "./money";
import type { AppData } from "./types";

/**
 * 「今日のまとめ」に出すものを集める（自分用のホーム）。「確認したいこと」と同じものを二重に出さないため、
 * ここで集めたものの key を、確認したいことから除く（NEXT v21 SCREENS S-01・ホームの二重表示）。
 * key は navi.ts と同じ作り（rc-・task-・ct-・doc-・study-）。予定は ev-、目標は goal-。
 */
export interface TodayItem {
  key: string;
  /** 並べ替え用：0 過ぎたもの、1 終日、2 時刻つき（2HH:mm）、3 今日が期限 */
  sort: string;
  time: string;
  title: string;
  sub?: string;
  warn?: boolean;
  href?: string;
  /** 予定のとき：詳細を開く ID */
  eventId?: string;
}

/** 「今日のまとめ」に出す件数。これを超えた分は、まとめには出さないので、確認したいことからも除かない */
export const TODAY_SHOWN = 8;

/** 一部だけ払った固定費の、残りの額（予定額 − 払った額）。一部払いがなければ予定額 */
const partialLeft = (r: { amount: number; nextDueDate: string; partialPaid?: { due: string; paid: number } }) =>
  r.partialPaid && r.partialPaid.due === r.nextDueDate ? Math.max(0, r.amount - r.partialPaid.paid) : r.amount;
const partialNote = (r: { amount: number; nextDueDate: string; partialPaid?: { due: string; paid: number } }) =>
  r.partialPaid && r.partialPaid.due === r.nextDueDate ? `（一部 ${formatYen(r.partialPaid.paid)} は支払い済み）` : "";

export function buildTodayItems(data: AppData, today: string): TodayItem[] {
  const out: TodayItem[] = [];
  for (const r of data.recurring) {
    if (!r.active || r.nextDueDate > today) continue;
    const late = r.nextDueDate < today;
    out.push({
      key: `rc-${r.id}`,
      sort: late ? `0${r.nextDueDate}` : "1",
      time: late ? "未記録" : "今日",
      title: `固定費 ${r.name} ${formatYen(partialLeft(r))}`,
      sub: late ? `${formatDateJa(r.nextDueDate)}の支払いがまだ記録されていません${partialNote(r)}` : `今日が支払日${partialNote(r)}`,
      warn: late,
      href: `/recurring?open=${r.id}`,
    });
  }
  for (const e of eventsOnDay(data.events, today)) {
    const allDay = e.allDay || (e.startDate < today && e.startDate !== e.endDate);
    out.push({ key: `ev-${e.id}`, sort: allDay ? "1" : `2${e.startTime}`, time: allDay ? "終日" : e.startTime, title: e.title.trim() || "（名前なし）", eventId: e.id });
  }
  for (const t of data.tasks) {
    if (t.done || !t.due || t.due > today) continue;
    const late = t.due < today;
    out.push({ key: `task-${t.id}`, sort: late ? `0${t.due}` : "3", time: late ? "期限切れ" : "期限", title: t.title, sub: late ? `期限を${daysBetween(t.due, today)}日過ぎています` : "今日が期限のタスク", warn: late, href: `/tasks?open=${t.id}` });
  }
  for (const c of data.contracts)
    if (c.status === "active" && c.renewalDate === today) out.push({ key: `ct-${c.id}`, sort: "3", time: "期限", title: `${c.name}の更新日`, sub: "契約", href: `/contracts?open=${c.id}` });
  for (const d of data.documents) if (d.expiry === today) out.push({ key: `doc-${d.id}`, sort: "3", time: "期限", title: `${d.title}の期限`, sub: "書類", href: `/documents?open=${d.id}` });
  for (const g of data.goals) if (!g.done && g.deadline === today) out.push({ key: `goal-${g.id}`, sort: "3", time: "期限", title: g.title, sub: "目標の期限", href: `/goals?open=${g.id}` });
  for (const s of data.studySubjects) if (!s.archived && s.examDate === today) out.push({ key: `study-${s.id}`, sort: "1", time: "試験", title: `${s.name}の試験日`, sub: "資格", href: `/study?open=${s.id}` });
  return out.sort((a, b) => a.sort.localeCompare(b.sort));
}
