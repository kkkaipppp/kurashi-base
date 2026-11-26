/**
 * 目標の達成条件と階層（o31 P4：F018・F019・F020、o30 D029〜D031）。画面から切り離した純粋な関数。
 * - 条件の結果は「達成・未達・未判定」の3つ。欠けている値（null）は 0 にしない（未判定）
 * - AND：未達が1つでもあれば未達、全部達成なら達成、それ以外は未判定。OR：達成が1つでもあれば達成、全部未達なら未達、それ以外は未判定。空は未判定
 * - 単位が違う値は足さない（o31 C018）
 * - 親子のつながりは循環させない（A→B→A を拒否。C019・o30 C15）。子の進み具合を単純に平均しない
 * - 実績は元の記録の ID で参照する。同じ記録を2つの目標が参照しても、全体の合計は1回（C020）
 */

export type Verdict = "met" | "unmet" | "unknown";

export type Op = ">=" | "<=" | "==" | "range";

export interface GoalCondition {
  id: string;
  label: string;
  unit: string;
  op: Op;
  /** 比べる値（range のときは下限） */
  target: number;
  /** range のときの上限 */
  targetMax?: number;
  /** 今の値。分からないときは null（0 にしない） */
  actual: number | null;
}

export const OP_LABEL: Record<Op, string> = { ">=": "以上", "<=": "以下", "==": "ちょうど", range: "の範囲" };

/**
 * 1つの条件の結果。opts.periodOpen（期限の前）なら、「以下」の条件で今は下回っていても、期限までに超えるかもしれないので未判定にする
 * （上回っていれば、もう未達）。「範囲」の下限側も同じ考えで、期間の途中は上限を超えたときだけ未達
 */
export function judge(c: GoalCondition, opts: { periodOpen?: boolean } = {}): Verdict {
  if (c.actual === null || !Number.isFinite(c.actual)) return "unknown";
  switch (c.op) {
    case ">=":
      return c.actual >= c.target ? "met" : "unmet";
    case "<=":
      if (c.actual > c.target) return "unmet";
      return opts.periodOpen ? "unknown" : "met";
    case "==":
      return c.actual === c.target ? "met" : "unmet";
    case "range":
      return c.targetMax === undefined ? "unknown" : c.actual >= c.target && c.actual <= c.targetMax ? "met" : "unmet";
  }
}

export function combine(mode: "and" | "or", verdicts: Verdict[]): Verdict {
  if (verdicts.length === 0) return "unknown";
  if (mode === "and") {
    if (verdicts.includes("unmet")) return "unmet";
    return verdicts.every((v) => v === "met") ? "met" : "unknown";
  }
  if (verdicts.includes("met")) return "met";
  return verdicts.every((v) => v === "unmet") ? "unmet" : "unknown";
}

/** 同じ単位どうしだけ足す。違う単位が混ざっていれば null（足さない） */
export function sumSameUnit(items: { value: number; unit: string }[]): { value: number; unit: string } | null {
  if (items.length === 0) return null;
  const unit = items[0].unit;
  if (items.some((i) => i.unit !== unit)) return null;
  return { value: items.reduce((s, i) => s + i.value, 0), unit };
}

/** 親子のつながり（子 → 親）を足すと循環するか。自分自身も循環 */
export function wouldCycle(parentOf: Map<string, string | undefined>, child: string, parent: string): boolean {
  if (child === parent) return true;
  let cur: string | undefined = parent;
  const seen = new Set<string>();
  while (cur) {
    if (cur === child) return true;
    if (seen.has(cur)) return true;
    seen.add(cur);
    cur = parentOf.get(cur);
  }
  return false;
}

/**
 * 実績の参照：目標ごとに、元の記録の ID の一覧を持つ。目標ごとの合計と、全体の合計（同じ記録は1回）を返す。
 * 例 30分の勉強を2つの目標が参照 → それぞれ30分、全体も30分
 */
export function linkedTotals(refs: Record<string, string[]>, valueOf: (id: string) => number | null): { perGoal: Record<string, number>; overall: number; missing: string[] } {
  const perGoal: Record<string, number> = {};
  const all = new Set<string>();
  const missing = new Set<string>();
  for (const [g, ids] of Object.entries(refs)) {
    let s = 0;
    for (const id of new Set(ids)) {
      const v = valueOf(id);
      if (v === null) {
        missing.add(id);
        continue;
      }
      s += v;
      all.add(id);
    }
    perGoal[g] = s;
  }
  let overall = 0;
  for (const id of all) overall += valueOf(id) ?? 0;
  return { perGoal, overall, missing: [...missing] };
}

/** 達成の記録：そのときの条件と結果を写して残す（あとで条件を変えても、前の達成は変わらない。T019） */
export interface Achievement {
  at: string;
  verdict: Verdict;
  conditions: GoalCondition[];
}

export function snapshotAchievement(at: string, mode: "and" | "or", conditions: GoalCondition[], opts: { periodOpen?: boolean } = {}): Achievement {
  return { at, verdict: combine(mode, conditions.map((c) => judge(c, opts))), conditions: conditions.map((c) => ({ ...c })) };
}

/** 期限の前か（期限なしは、いつまでも途中として扱う） */
export function periodOpen(deadline: string, today: string): boolean {
  return !deadline || today <= deadline;
}

/** 全角の数字・記号も受け付けて数にする。空・数でないときは null（0 にしない） */
export function toNumber(s: string): number | null {
  const t = s.normalize("NFKC").replace(/,/g, "").trim();
  if (t === "") return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}
