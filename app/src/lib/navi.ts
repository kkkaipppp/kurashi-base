import { remainingBudget } from "./aggregate";
import { IS_PERSONAL } from "./edition";
import { budgetSpent } from "./ledger";
import { daysBetween, formatDateJa, monthKey } from "./date";
import { formatYen } from "./money";
import { daysLeft, dueLabel, formatMinutes, goalProgress, studyStats } from "./life";
import { COLLECTION_KEYS, type AppData } from "./types";

// 「今日のナビ」：今日やること・気にしておくことを、記録されたデータからだけ集める（推測で作らない）

/** バックアップを案内するまでの日数 */
export const BACKUP_REMIND_DAYS = 7;

export interface NaviItem {
  key: string;
  tone: "warn" | "today" | "info";
  title: string;
  sub?: string;
  href: string;
}

const WITHIN_DAYS = 30;

export function buildNavi(data: AppData, today: string): NaviItem[] {
  const items: NaviItem[] = [];

  for (const t of data.tasks) {
    if (t.done || !t.due) continue;
    const d = daysBetween(today, t.due);
    if (d < 0) items.push({ key: `task-${t.id}`, tone: "warn", title: t.title, sub: `タスク・${dueLabel(d)}`, href: `/tasks?open=${t.id}` });
    else if (d === 0) items.push({ key: `task-${t.id}`, tone: "today", title: t.title, sub: "タスク・今日が期限", href: `/tasks?open=${t.id}` });
  }

  for (const r of data.recurring) {
    if (!r.active) continue;
    if (r.nextDueDate < today)
      items.push({ key: `rc-${r.id}`, tone: "warn", title: `${r.name}の支払い`, sub: `固定費・予定日（${formatDateJa(r.nextDueDate)}）を過ぎています`, href: `/recurring?open=${r.id}` });
    else if (r.nextDueDate === today)
      items.push({ key: `rc-${r.id}`, tone: "today", title: `${r.name}の支払い`, sub: `固定費・今日 ${formatYen(r.amount)}`, href: `/recurring?open=${r.id}` });
  }

  for (const s of data.studySubjects) {
    if (s.archived) continue;
    const st = studyStats(s, data.studyLogs, today);
    // 試験は30日以内だけ（先の試験で、期限切れなどの大事な通知が埋もれないように）
    if (st.daysToExam === null || st.daysToExam < 0 || st.daysToExam > 30) continue;
    items.push({
      key: `study-${s.id}`,
      tone: st.daysToExam <= 7 ? "today" : "info",
      title: st.daysToExam === 0 ? `${s.name}の試験日です` : `${s.name}の試験まであと${st.daysToExam}日`,
      sub: st.todayMinutes > 0 ? `今日の勉強 ${formatMinutes(st.todayMinutes)}` : "今日の勉強記録はありません",
      href: `/study?open=${s.id}`,
    });
  }

  for (const g of data.goals) {
    if (g.done) continue;
    const d = daysLeft(g.deadline, today);
    if (d === null || d > 7) continue;
    items.push({ key: `goal-${g.id}`, tone: d < 0 ? "warn" : "today", title: g.title, sub: `目標・${dueLabel(d)}・達成率${goalProgress(g)}%`, href: `/goals?open=${g.id}` });
  }

  for (const c of data.contracts) {
    if (c.status !== "active" || !c.renewalDate) continue;
    const d = daysBetween(today, c.renewalDate);
    if (d < 0) items.push({ key: `ct-${c.id}`, tone: "warn", title: `${c.name}の更新日を過ぎています`, sub: "契約・更新するか確認してください", href: `/contracts?open=${c.id}` });
    else if (d <= WITHIN_DAYS) items.push({ key: `ct-${c.id}`, tone: d <= 7 ? "today" : "info", title: `${c.name}の更新まであと${d}日`, sub: `契約・${formatDateJa(c.renewalDate)}`, href: `/contracts?open=${c.id}` });
  }

  for (const doc of data.documents) {
    if (!doc.expiry) continue;
    const d = daysBetween(today, doc.expiry);
    if (d < 0) items.push({ key: `doc-${doc.id}`, tone: "warn", title: `${doc.title}の期限が切れています`, sub: "書類", href: `/documents?open=${doc.id}` });
    else if (d <= WITHIN_DAYS) items.push({ key: `doc-${doc.id}`, tone: d <= 7 ? "today" : "info", title: `${doc.title}の期限まであと${d}日`, sub: `書類・${formatDateJa(doc.expiry)}`, href: `/documents?open=${doc.id}` });
  }

  // 予算と比べるのは、ホームの予算カードと同じ額（自分用は投資を除いた生活費）
  const remaining = remainingBudget(data.budget.monthly, budgetSpent(data, monthKey(today), today));
  if (remaining !== null && remaining < 0)
    items.push({ key: "budget", tone: "warn", title: "今月の予算を超えています", sub: `${formatYen(-remaining)}超過${IS_PERSONAL ? "（投資を除く）" : ""}`, href: "/history" });

  // 何か1つでも記録があれば対象（取引・予定だけでなく、タスクや資格だけ使う人も）
  const hasData =
    data.transactions.length + data.events.length + data.recurring.length + COLLECTION_KEYS.reduce((s, k) => s + data[k].length, 0) > 0;
  const base = data.meta.lastBackupAt ?? data.meta.createdAt;
  // Web 版はファイルへ自動で書き出せないので、週に1回を目安に案内する（2026-11-24 平尾さん：Web 版でできる限界まで）
  if (hasData && daysBetween(base.slice(0, 10), today) >= BACKUP_REMIND_DAYS)
    items.push({ key: "backup", tone: "info", title: `${BACKUP_REMIND_DAYS}日以上バックアップしていません`, sub: "設定から書き出せます", href: "/settings#backup" });

  const order = { warn: 0, today: 1, info: 2 } as const;
  return items.sort((a, b) => order[a.tone] - order[b.tone]);
}
