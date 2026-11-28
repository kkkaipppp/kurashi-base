import { taskIsEvent } from "./taskEvent";
import type { AppData } from "./types";

/**
 * 日程未定（To-Be 02 カレンダー「日程未定」。2026-11-28）。
 * 予定は日付が要るので、日にちの無い「計画（検討中・準備中）」と「やること（期限もやる日も無い・終わっていない）」を出す。
 * 出すだけで、記録は変えない。
 */
export interface UndatedItem {
  key: string;
  kind: "計画" | "やること";
  title: string;
  href: string;
}

export function undatedItems(d: AppData): UndatedItem[] {
  const out: UndatedItem[] = [];
  for (const p of d.plans ?? [])
    if ((p.status === "considering" || p.status === "preparing") && !p.date) out.push({ key: `p-${p.id}`, kind: "計画", title: p.title, href: `/plans?open=${p.id}` });
  for (const t of d.tasks) if (!t.done && !t.due && !t.doDate && !taskIsEvent(d, t)) out.push({ key: `t-${t.id}`, kind: "やること", title: t.title, href: `/tasks?open=${t.id}` });
  return out;
}
