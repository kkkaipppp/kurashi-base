import { taskIsEvent } from "./taskEvent";
import { formatYen } from "./money";
import type { AppData } from "./types";

// カレンダーの日ごとに出す「期限」：タスクの期限・固定費の支払日・契約の更新日・書類の期限・目標の期限

export interface DeadlineItem {
  key: string;
  kind: "やること" | "固定費" | "契約" | "書類" | "目標" | "試験";
  title: string;
  sub?: string;
  done?: boolean;
  href: string;
}

export function deadlinesOn(data: AppData, date: string): DeadlineItem[] {
  const out: DeadlineItem[] = [];
  // 予定にしたタスクは、予定として出る（ここでは二重に出さない）
  for (const t of data.tasks) if (t.due === date && !taskIsEvent(data, t)) out.push({ key: `t-${t.id}`, kind: "やること", title: t.title, done: t.done, href: `/tasks?open=${t.id}` });
  for (const r of data.recurring)
    if (r.active && r.nextDueDate === date) out.push({ key: `r-${r.id}`, kind: "固定費", title: `${r.name}の支払い`, sub: formatYen(r.amount), href: `/recurring?open=${r.id}` });
  for (const c of data.contracts)
    if (c.status === "active" && c.renewalDate === date) out.push({ key: `c-${c.id}`, kind: "契約", title: `${c.name}の更新日`, href: `/contracts?open=${c.id}` });
  for (const d of data.documents) if (d.expiry === date) out.push({ key: `d-${d.id}`, kind: "書類", title: `${d.title}の期限`, href: `/documents?open=${d.id}` });
  for (const g of data.goals) if (g.deadline === date) out.push({ key: `g-${g.id}`, kind: "目標", title: `${g.title}の期限`, done: g.done, href: `/goals?open=${g.id}` });
  // 目標の節目（やることの日付）。終わっていないものだけ
  for (const g of data.goals) if (!g.done) for (const st of g.steps ?? []) if (!st.done && st.due === date) out.push({ key: `gs-${g.id}-${st.id}`, kind: "目標", title: `${g.title}：${st.text}`, href: `/goals?open=${g.id}` });
  for (const s of data.studySubjects)
    if (!s.archived && s.examDate === date) out.push({ key: `s-${s.id}`, kind: "試験", title: `${s.name}の試験日`, href: `/study?open=${s.id}` });
  return out;
}

/** 月の中で期限がある日（カレンダーの印用） */
export function deadlineDays(data: AppData, monthKey: string): Set<string> {
  const s = new Set<string>();
  const inMonth = (d: string) => d.startsWith(monthKey);
  for (const t of data.tasks) if (t.due && !t.done && inMonth(t.due)) s.add(t.due);
  for (const r of data.recurring) if (r.active && inMonth(r.nextDueDate)) s.add(r.nextDueDate);
  for (const c of data.contracts) if (c.status === "active" && c.renewalDate && inMonth(c.renewalDate)) s.add(c.renewalDate);
  for (const d of data.documents) if (d.expiry && inMonth(d.expiry)) s.add(d.expiry);
  for (const g of data.goals) if (g.deadline && !g.done && inMonth(g.deadline)) s.add(g.deadline);
  for (const subj of data.studySubjects) if (!subj.archived && subj.examDate && inMonth(subj.examDate)) s.add(subj.examDate);
  return s;
}
