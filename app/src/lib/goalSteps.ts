import type { Goal } from "./types";

/**
 * 目標の「やること」（NEXT v21 T06：目標 → やること。自分用の追加項目で、任意）。
 * 入力は、1行に1つ。終わったものは、行の先頭に「✓」を付ける。数字の目標の進み具合は、今までどおり「今の値 ÷ 目標の値」（やることでは変えない）。
 * 「達成」は本人が決める（やることが全部終わっても、勝手に達成にしない）。
 */
export interface GoalStep {
  id: string;
  text: string;
  done: boolean;
  /** 節目の日（任意。行の終わりに「@2026-12-20」と書く）。期限の一覧・提案に出る */
  due?: string;
}

export const MAX_STEPS = 30;
export const MAX_STEP_LEN = 60;

const DONE_MARK = /^[✓✔☑]\s*/;
/** 行の終わりの節目の日（@2026-12-20。全角の＠も可） */
const DUE_TAIL = /\s*[@＠](\d{4}-\d{2}-\d{2})\s*$/;
function isRealDate(s: string): boolean {
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

export function parseSteps(text: string): GoalStep[] {
  const out: GoalStep[] = [];
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    const done = DONE_MARK.test(line);
    let body = line.replace(DONE_MARK, "").trim();
    const m = DUE_TAIL.exec(body);
    const due = m && isRealDate(m[1]) ? m[1] : undefined;
    if (m && due) body = body.slice(0, m.index).trim();
    body = body.slice(0, MAX_STEP_LEN);
    if (!body) continue;
    out.push({ id: `st${out.length + 1}`, text: body, done, ...(due ? { due } : {}) });
    if (out.length >= MAX_STEPS) break;
  }
  return out;
}

export function stepsToText(steps: GoalStep[] | undefined): string {
  return (steps ?? []).map((s) => (s.done ? "✓ " : "") + s.text + (s.due ? ` @${s.due}` : "")).join("\n");
}

export interface StepProgress {
  total: number;
  done: number;
  /** 0〜100（やることがなければ null） */
  pct: number | null;
}

export function stepProgress(g: Pick<Goal, "steps">): StepProgress {
  const total = g.steps?.length ?? 0;
  const done = g.steps?.filter((s) => s.done).length ?? 0;
  return { total, done, pct: total === 0 ? null : Math.round((done / total) * 100) };
}

/** 画面に出す達成率：達成済みは100。達成目標（数字なし）で、やることがあれば、やることの進み具合。それ以外は今までどおり */
export function displayProgress(g: Goal, base: number): number {
  if (g.done) return 100;
  if (g.kind === "check") return stepProgress(g).pct ?? base;
  return base;
}
