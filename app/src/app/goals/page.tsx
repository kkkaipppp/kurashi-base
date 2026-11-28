"use client";

import { CollectionPage, numberFromDraft, type CollectionConfig } from "@/components/CollectionPage";
import { formatDateJa, todayStr } from "@/lib/date";
import { bool, numStr, str } from "@/lib/draft";
import { daysLeft, dueLabel, goalProgress } from "@/lib/life";
import { goalPace, goalPaceText } from "@/lib/goalPlan";
import { goalActions } from "@/lib/goalLinks";
import { displayProgress, parseSteps, stepProgress, stepsToText } from "@/lib/goalSteps";
import { IS_PERSONAL } from "@/lib/edition";
import { Card } from "@/components/ui";
import { GoalConditionsButton, VERDICT_LABEL, goalVerdict } from "@/components/GoalConditions";

// 版の値を、このファイルの中で直接比べる（公開版の組み立てから、自分用の入力を外すため）
const PERSONAL_BUILD = process.env.NEXT_PUBLIC_KB_EDITION === "personal";
/** 数値目標か（数の欄を出すかどうか） */
const isNumberGoal = (d: Parameters<typeof str>[0]) => str(d, "kind") === "number";

const config: CollectionConfig<"goals"> = {
  key: "goals",
  title: "目標",
  noun: "目標",
  intro: "数値目標（例：100万円ためる）と、達成目標（例：引っ越す）を追加できます。進み具合は自分で更新します。",
  emptyText: "まだ目標がありません。",
  fields: [
    { name: "title", label: "内容", type: "text", required: true, placeholder: "例：旅行のために30万円ためる" },
    { name: "kind", label: "種類", type: "select", options: [{ value: "number", label: "数値目標（例：30万円ためる）" }, { value: "check", label: "達成目標（例：引っ越す）" }] },
    // 数の欄は、数値目標のときだけ出す（2026-11-26 承認5の8）
    { name: "current", label: "今の数", type: "number", decimal: true, half: true, hint: "例：30万円のうち12万円ためたなら 120000", showWhen: isNumberGoal },
    { name: "target", label: "目標の数", type: "number", decimal: true, half: true, hint: "例：30万円なら 300000", showWhen: isNumberGoal },
    { name: "unit", label: "単位", optional: true, type: "text", half: true, placeholder: "例：円、冊、kg", showWhen: isNumberGoal },
    { name: "deadline", label: "期限", optional: true, type: "date", half: true },
    { name: "note", label: "メモ", optional: true, type: "textarea" },
    // やること（自分用）。1行に1つ。終わったものは、行の先頭に ✓
    ...(PERSONAL_BUILD ? [{ name: "steps", label: "やること", optional: true, type: "textarea" as const, hint: "1行に1つずつ書きます。終わったら、行の頭に ✓ を付けます。いつまでかを決めるなら、行の終わりに @2026-12-20 のように書きます" }] : []),
    { name: "done", label: "達成", type: "checkbox" },
    // 休止（自分用。To-Be 2026-11-28 S3-2）：休止中はホームの確認・期限・必要なペースに出さない。外すと再開
    ...(PERSONAL_BUILD ? [{ name: "paused", label: "休止中（しばらく休む）", type: "checkbox" as const }] : []),
  ],
  initial: () => ({ title: "", kind: "number", current: "0", target: "", unit: "", deadline: "", note: "", done: false }),
  // 種類のひな形（To-Be 02 目標：資格/勉強・貯金・習慣・運動・読書・キャリア・自由作成。自分用）。種類と単位を入れるだけで、保存の形は今のまま
  ...(PERSONAL_BUILD
    ? {
        presets: [
          { id: "saving", label: "貯金", draft: { kind: "number", unit: "円" } },
          { id: "reading", label: "読書", draft: { kind: "number", unit: "冊" } },
          { id: "exercise", label: "運動", draft: { kind: "number", unit: "回" } },
          { id: "habit", label: "習慣", draft: { kind: "number", unit: "日" } },
          // 達成目標・自由は単位に触らない（手で入れた単位を消さない。点検 低1）
          { id: "study", label: "資格・勉強", draft: { kind: "check" } },
          { id: "career", label: "キャリア", draft: { kind: "check" } },
          { id: "free", label: "自由", draft: { kind: "number" } },
        ],
      }
    : {}),
  toDraft: (g) => ({ title: g.title, kind: g.kind, current: String(g.current), target: numStr(g.target), unit: g.unit, deadline: g.deadline, note: g.note, steps: stepsToText(g.steps), done: g.done, paused: !!g.pausedAt, pausedAt: g.pausedAt ?? "" }),
  fromDraft: (d) => ({
    title: str(d, "title"),
    kind: str(d, "kind") as "number" | "check",
    current: numberFromDraft(str(d, "current")) ?? 0,
    target: numberFromDraft(str(d, "target")),
    unit: str(d, "unit"),
    deadline: str(d, "deadline"),
    note: str(d, "note"),
    // 自分用だけ。空なら、やることなし（公開版は、この項目を触らない＝あるものはそのまま残る）
    ...(PERSONAL_BUILD ? { steps: parseSteps(str(d, "steps")).length > 0 ? parseSteps(str(d, "steps")) : undefined } : {}),
    done: bool(d, "done"),
    // 休止は自分用だけ触る（公開版は項目を触らない＝あるものはそのまま残る）。休止した日は、前から休止中ならその日のまま
    ...(PERSONAL_BUILD ? { pausedAt: bool(d, "paused") ? str(d, "pausedAt") || todayStr() : undefined } : {}),
  }),
  validate: (d) => {
    if (str(d, "kind") !== "number") return {} as Record<string, string>;
    const t = numberFromDraft(str(d, "target"));
    return t === null || t <= 0 ? { target: "数値目標では、目標の数（0より大きい数）を入力してください" } : ({} as Record<string, string>);
  },
  // 数値目標の必要なペース（自分用。NEXT v21 GOAL_PLANNING。目安で、達成を保証する数字ではない）
  header: ({ list, today }) => {
    if (!IS_PERSONAL) return null;
    const items = list
      .map((g) => ({ g, text: goalPaceText(goalPace(g, today), g.unit, (n) => n.toLocaleString("ja-JP")) }))
      .filter((x) => x.text && !x.g.done && !x.g.pausedAt);
    if (items.length === 0) return null;
    return (
      <Card className="py-3">
        <h2 className="mb-1 text-[17px] font-bold">必要なペース</h2>
        <ul className="space-y-1.5">
          {items.map(({ g, text }) => (
            <li key={g.id} className="text-[13px]">
              <span className="block truncate font-semibold">{g.title}</span>
              <span className="num block text-[12px] text-ink-2">{text}</span>
            </li>
          ))}
        </ul>
        <p className="mt-2 text-[12px] text-ink-3">目標の数・今の数・期限から計算した目安です（残り ÷ 期限までの日数 × 30日、切り上げ）。</p>
      </Card>
    );
  },
  sort: (a, b) => Number(a.done) - Number(b.done) || (a.deadline || "9999").localeCompare(b.deadline || "9999"),
  row: (g, { today, data }) => {
    // 自分用：達成目標でやることがあれば、その進み具合を出す
    const p = PERSONAL_BUILD ? displayProgress(g, goalProgress(g)) : goalProgress(g);
    // 自分用：この目標につないだ予定（行動）の数。完了した回の数も出す（予定の完了と目標の達成は別）
    const act = IS_PERSONAL ? goalActions(data, g.id, today) : null;
    const d = daysLeft(g.deadline, today);
    const fmt = (n: number) => n.toLocaleString("ja-JP");
    return {
      title: g.title,
      sub:
        (g.kind === "number" && g.target !== null ? `${fmt(g.current)} / ${fmt(g.target)}${g.unit}・` : "") +
        (g.deadline ? `${formatDateJa(g.deadline, true)}まで` : "期限なし") +
        (stepProgress(g).total > 0 && IS_PERSONAL ? `・やること${stepProgress(g).done}/${stepProgress(g).total}` : "") +
        (act && act.events > 0 ? `・予定${act.events}件（完了${act.doneCount}回）` : "") +
        // 自分用：達成条件のまとめた結果（o31 F018。条件が無ければ出さない）
        (PERSONAL_BUILD && goalVerdict(g, today) ? `・条件：${VERDICT_LABEL[goalVerdict(g, today)!]}` : "") +
        (PERSONAL_BUILD && g.parentId && data.goals.some((x) => x.id === g.parentId) ? `・親：${data.goals.find((x) => x.id === g.parentId)!.title}` : ""),
      muted: g.done || (PERSONAL_BUILD && !!g.pausedAt),
      badge: g.done ? { text: "達成", tone: "ok" } : PERSONAL_BUILD && g.pausedAt ? { text: `休止中（${formatDateJa(g.pausedAt)}から）`, tone: "info" } : d !== null && d < 0 ? { text: dueLabel(d), tone: "warn" } : undefined,
      right: (
        <span className="flex items-center gap-2">
          <span className="h-1.5 w-14 overflow-hidden rounded-full bg-surface-2" aria-hidden="true">
            <span className="block h-full rounded-full bg-brand" style={{ width: `${p}%` }} />
          </span>
          {PERSONAL_BUILD ? "" : "達成率"}
          {p}%
        </span>
      ),
    };
  },
};

// 自分用：一覧の行に「条件」（達成条件・まとめ方・親の目標。o31 F018・F019）
if (PERSONAL_BUILD) config.rowAction = (g) => <GoalConditionsButton goal={g} />;

export default function GoalsPage() {
  return <CollectionPage config={config} />;
}
