"use client";

import { CollectionSection, numberFromDraft, type CollectionConfig } from "@/components/CollectionPage";
import { PageHeader } from "@/components/ui";
import { formatDateJa } from "@/lib/date";
import { bool, numStr, str } from "@/lib/draft";
import { formatMinutes, studyStats } from "@/lib/life";

const subjects: CollectionConfig<"studySubjects"> = {
  key: "studySubjects",
  title: "資格・科目",
  noun: "資格",
  emptyText: "まだ資格・科目が登録されていません。勉強している資格を追加しましょう。",
  fields: [
    { name: "name", label: "資格・科目の名前", type: "text", required: true, placeholder: "例：日商簿記2級" },
    { name: "examDate", label: "試験日（任意）", type: "date", half: true },
    { name: "targetHours", label: "目標の勉強時間（任意）", type: "number", half: true, hint: "時間" },
    { name: "archived", label: "勉強を終えた（一覧の下に移す）", type: "checkbox" },
  ],
  removeBody: "この資格・科目の勉強の記録も、すべて削除されます。元に戻せません。",
  removeFn: (store, id) => store.removeStudySubject(id),
  initial: () => ({ name: "", examDate: "", targetHours: "", archived: false }),
  toDraft: (s) => ({ name: s.name, examDate: s.examDate, targetHours: numStr(s.targetHours), archived: s.archived }),
  fromDraft: (d) => {
    const h = numberFromDraft(str(d, "targetHours"));
    return { name: str(d, "name"), examDate: str(d, "examDate"), targetHours: h && h > 0 ? h : null, archived: bool(d, "archived") };
  },
  sort: (a, b) => Number(a.archived) - Number(b.archived) || (a.examDate || "9999").localeCompare(b.examDate || "9999"),
  row: (s, { data, today }) => {
    const st = studyStats(s, data.studyLogs, today);
    const exam =
      st.daysToExam === null ? "試験日 未定" : st.daysToExam > 0 ? `試験まであと${st.daysToExam}日` : st.daysToExam === 0 ? "今日が試験日" : "試験日を過ぎました";
    return {
      title: s.name,
      sub: `${exam}・この7日間 ${formatMinutes(st.weekMinutes)}${st.targetPct !== null ? `・目標の${st.targetPct}%` : ""}`,
      muted: s.archived,
      badge: s.archived ? { text: "終了", tone: "info" } : st.todayMinutes > 0 ? { text: "今日やった", tone: "ok" } : undefined,
      right: formatMinutes(st.totalMinutes),
    };
  },
};

const logs: CollectionConfig<"studyLogs"> = {
  key: "studyLogs",
  title: "勉強の記録",
  noun: "勉強の記録",
  emptyText: "まだ勉強の記録がありません。",
  addBlocked: (data) => (data.studySubjects.some((s) => !s.archived) ? null : "先に、上で資格・科目を追加してください。"),
  fields: ({ data }) => [
    {
      name: "subjectId",
      label: "資格・科目",
      type: "select",
      options: data.studySubjects.map((s) => ({ value: s.id, label: s.archived ? `${s.name}（終了）` : s.name })),
    },
    { name: "date", label: "日付", type: "date", required: true, half: true },
    { name: "minutes", label: "勉強した時間（分）", type: "number", required: true, half: true, placeholder: "例：60" },
    { name: "note", label: "内容（任意）", type: "textarea", placeholder: "例：過去問 第3問" },
  ],
  initial: ({ today, data }) => ({ subjectId: data.studySubjects.find((s) => !s.archived)?.id ?? "", date: today, minutes: "", note: "" }),
  toDraft: (l) => ({ subjectId: l.subjectId, date: l.date, minutes: String(l.minutes), note: l.note }),
  fromDraft: (d) => ({ subjectId: str(d, "subjectId"), date: str(d, "date"), minutes: numberFromDraft(str(d, "minutes")) ?? 0, note: str(d, "note") }),
  validate: (d) => {
    const m = numberFromDraft(str(d, "minutes"));
    const e: Record<string, string> = {};
    if (!str(d, "subjectId")) e.subjectId = "資格・科目を選んでください";
    if (m === null || !Number.isInteger(m) || m < 1 || m > 1440) e.minutes = "1〜1440分の整数で入力してください";
    return e;
  },
  sort: (a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt),
  groupBy: (l) => l.date,
  groupLabel: (k) => formatDateJa(k, true),
  row: (l, { data }) => ({
    title: data.studySubjects.find((s) => s.id === l.subjectId)?.name ?? "（削除された科目）",
    sub: l.note,
    right: formatMinutes(l.minutes),
  }),
};

export default function StudyPage() {
  return (
    <main className="space-y-6">
      <PageHeader title="資格の勉強" />
      <CollectionSection config={subjects} heading="資格・科目" />
      <CollectionSection config={logs} heading="勉強の記録" />
    </main>
  );
}
