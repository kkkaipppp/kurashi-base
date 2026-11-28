import { settleProblems } from "./advance";
import { daysBetween } from "./date";
import { inboxCount } from "./inbox";
import { ledgerEvents, refundConservationErrors } from "./ledgerCore";
import type { AppData } from "./types";

/**
 * データの点検（NEXT v21 Q09・D10：関連の欠け・二重かもしれない記録・古い固定費・バックアップの間隔を、読むだけで調べる）。
 * 何も書き換えない。見つけたものを、理由と、直す場所つきで示す。
 */
export type HealthLevel = "warn" | "info";
export interface HealthFinding {
  id: string;
  level: HealthLevel;
  text: string;
  count: number;
  /** 直せる画面 */
  href?: string;
}

export function dataHealth(d: AppData, today: string): HealthFinding[] {
  const out: HealthFinding[] = [];
  const add = (f: HealthFinding) => f.count > 0 && out.push(f);
  const catIds = new Set(d.categories.map((c) => c.id));
  const tripIds = new Set((d.trips ?? []).map((t) => t.id));
  const recIds = new Set(d.recurring.map((r) => r.id));

  add({ id: "tx-cat", level: "warn", text: "カテゴリが見つからない記録があります（カテゴリが消えた可能性）", count: d.transactions.filter((t) => !catIds.has(t.categoryId)).length, href: "/history" });
  add({ id: "rec-cat", level: "warn", text: "カテゴリが見つからない固定費があります", count: d.recurring.filter((r) => !catIds.has(r.categoryId)).length, href: "/recurring" });
  add({ id: "tx-trip", level: "warn", text: "つなぎ先の旅行が見つからない支出があります", count: d.transactions.filter((t) => t.tripId && !tripIds.has(t.tripId)).length, href: "/history" });
  add({ id: "ev-trip", level: "warn", text: "つなぎ先の旅行が見つからない予定があります", count: d.events.filter((e) => e.tripId && !tripIds.has(e.tripId)).length, href: "/calendar" });
  const goalIds = new Set(d.goals.map((g) => g.id));
  add({ id: "ev-goal", level: "info", text: "つなぎ先の目標がもうない予定があります（目標を消した可能性。予定は残っています）", count: d.events.filter((e) => e.goalId && !goalIds.has(e.goalId)).length, href: "/calendar" });
  add({ id: "refund-sum", level: "warn", text: "返金の合計と、元の支出の額が合わない記録があります（返金の記録を消すか、元の支出を確かめてください。自動では直しません）", count: refundConservationErrors(ledgerEvents(d)).length, href: "/history" });
  {
    const purchaseIds = new Set(d.transactions.map((t) => t.id));
    add({ id: "refund-orphan", level: "warn", text: "元の支出が見つからない返金の記録があります（元の支出が消えた可能性。残高には数えていません）", count: d.transactions.filter((t) => t.refundOf && !purchaseIds.has(t.refundOf)).length, href: "/history" });
    add({ id: "settle-bad", level: "warn", text: "立替が見つからない・数え方が違う・返してもらう分より多い精算の記録があります（残高には、立替の分までしか数えていません）", count: settleProblems(d).length, href: "/history" });
  }
  add({ id: "tx-rec", level: "info", text: "固定費につないだ支出のうち、その固定費がもうないものがあります（固定費を消した可能性。記録は残っています）", count: d.transactions.filter((t) => t.recurringId && !recIds.has(t.recurringId)).length });

  // 二重かもしれない記録：同じ日・種類・金額・店名の記録が2件以上（自動では消さない）
  const seen = new Map<string, number>();
  for (const t of d.transactions) {
    if (!t.merchant.trim()) continue;
    const k = `${t.date}|${t.type}|${t.advanceGross ?? t.amount}|${t.merchant.normalize("NFKC").trim().toLowerCase()}`; // 立替は払った総額で比べる
    seen.set(k, (seen.get(k) ?? 0) + 1);
  }
  const dupGroups = [...seen.values()].filter((n) => n > 1);
  add({ id: "dup", level: "info", text: "同じ日・金額・店名の記録が2件以上あるものがあります（本当に2回買ったのか、二重に入ったのかは、見て確かめてください。自動では消しません）", count: dupGroups.length, href: "/history" });

  const hiddenWithRecords = d.categories.filter((c) => c.archived && d.transactions.some((t) => t.categoryId === c.id));
  add({ id: "hidden-cat", level: "info", text: "非表示のカテゴリに記録が残っています（集計には入ります）", count: hiddenWithRecords.length, href: "/settings#categories" });

  add({ id: "inbox", level: "info", text: "「その他」のままの記録があります（カテゴリを付けると、家計簿の内訳が分かりやすくなります）", count: inboxCount(d), href: "/inbox" });
  add({ id: "rec-old", level: "warn", text: "支払日を2か月以上過ぎたままの固定費があります（払っていない、または記録していない）", count: d.recurring.filter((r) => r.active && daysBetween(r.nextDueDate, today) > 60).length, href: "/recurring" });

  const last = d.meta.lastBackupAt?.slice(0, 10);
  if (d.transactions.length + d.events.length > 0) {
    if (!last) out.push({ id: "backup", level: "warn", text: "まだバックアップを書き出していません", count: 1, href: "/settings#backup" });
    else if (daysBetween(last, today) >= 14) out.push({ id: "backup", level: "warn", text: `最後のバックアップから${daysBetween(last, today)}日たっています`, count: 1, href: "/settings#backup" });
  }
  return out;
}
