"use client";

import { useState } from "react";
import { Sheet } from "./Sheet";
import { useUI } from "./UIContext";
import { Button, Field, inputCls } from "./ui";
import { useData, useStore } from "@/lib/store";
import { newId } from "@/lib/defaults";
import { OP_LABEL, combine, goalSaveError, judge, liveParentId, periodOpen, snapshotAchievement, toNumber, wouldCycle, type Op, type Verdict } from "@/lib/goalCond";
import { todayStr } from "@/lib/date";
import type { Goal, GoalConditionData } from "@/lib/types";

// 目標そのものの「達成」（done）と区別するため、条件は「満たす・満たさない」と言う（点検 指摘9）
export const VERDICT_LABEL: Record<Verdict, string> = { met: "満たす", unmet: "満たさない", unknown: "未判定" };

/** 目標の条件のまとめた結果（条件が無ければ null） */
export function goalVerdict(g: Goal, today = todayStr()): Verdict | null {
  if (!g.conditions || g.conditions.length === 0) return null;
  const open = periodOpen(g.deadline, today);
  return combine(g.condMode ?? "and", g.conditions.map((c) => judge(c, { periodOpen: open })));
}

/** 一覧の行の「条件」ボタン（自分用。o31 F018・F019） */
export function GoalConditionsButton({ goal }: { goal: Goal }) {
  const [open, setOpen] = useState(false);
  const v = goalVerdict(goal);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} aria-label={`「${goal.title}」の達成条件`} className="min-h-11 shrink-0 rounded-lg px-2 text-[14px] font-semibold text-brand hover:bg-surface-2">
        {v ? `条件：${VERDICT_LABEL[v]}` : "条件"}
      </button>
      {open && <GoalConditionsSheet goal={goal} onClose={() => setOpen(false)} />}
    </>
  );
}

const OPS: Op[] = [">=", "<=", "==", "range"];

function GoalConditionsSheet({ goal, onClose }: { goal: Goal; onClose: () => void }) {
  const data = useData();
  const store = useStore();
  const ui = useUI();
  const [conds, setConds] = useState<GoalConditionData[]>(goal.conditions ?? []);
  const [mode, setMode] = useState<"and" | "or">(goal.condMode ?? "and");
  // 消えた親は「なし」として始める（保存し直したときに、消えた目標へのつながりを残さない。再点検 L-2）
  const liveParent = liveParentId(data.goals, goal.id, goal.parentId);
  const [parentId, setParentId] = useState(liveParent);
  // 開いたときの目標の更新時刻。保存のときに、ほかのタブで変わっていないかを比べる（反証 2）
  const [openedAt] = useState(goal.updatedAt);
  // 「今の値」に数でないものを入れた条件（保存しない。空欄は「分からない」として保存できる）
  const [badActual, setBadActual] = useState<Record<string, boolean>>({});
  const [error, setError] = useState<string | null>(null);
  const open = periodOpen(goal.deadline, todayStr());
  const verdict = conds.length ? combine(mode, conds.map((c) => judge(c, { periodOpen: open }))) : null;
  const dirty = JSON.stringify([conds, mode, parentId]) !== JSON.stringify([goal.conditions ?? [], goal.condMode ?? "and", liveParent]);
  const requestClose = async () => {
    if (dirty && !(await ui.confirm({ title: "入力内容を破棄しますか？", body: "保存していない変更は失われます。", ok: "破棄する", danger: true }))) return;
    onClose();
  };
  const others = data.goals.filter((g) => g.id !== goal.id);

  const set = (i: number, patch: Partial<GoalConditionData>) => setConds((c) => c.map((x, j) => (j === i ? { ...x, ...patch } : x)));
  const num = toNumber;

  const save = async () => {
    for (const c of conds) {
      if (!c.label.trim()) return setError("条件の名前を入れてください");
      if (!Number.isFinite(c.target)) return setError(`「${c.label}」の目標の値を入れてください`);
      if (badActual[c.id]) return setError(`「${c.label}」の今の値を数で入れてください（分からなければ空欄）`);
      if (c.op === "range" && (c.targetMax === undefined || c.targetMax < c.target)) return setError(`「${c.label}」の範囲は「下限 ≦ 上限」で入れてください`);
    }
    const parentOf = new Map(data.goals.map((g) => [g.id, g.parentId] as [string, string | undefined]));
    if (parentId && wouldCycle(parentOf, goal.id, parentId)) return setError("その目標を親にすると、つながりが輪になります");
    const ts = new Date().toISOString();
    const next = combine(mode, conds.map((c) => judge(c, { periodOpen: open })));
    const r = await store.commit(
      (d) => ({
      ...d,
      goals: d.goals.map((g) => {
        if (g.id !== goal.id) return g;
        // 達成になったときだけ、そのときの条件を写して残す（前の達成の記録は消さない）
        const prev = goalVerdict(g);
        const achievements = next === "met" && prev !== "met" ? [...(g.achievements ?? []), snapshotAchievement(ts, mode, conds, { periodOpen: open })] : g.achievements;
        const { parentId: _p, ...rest } = g; // eslint-disable-line @typescript-eslint/no-unused-vars
        return { ...rest, ...(parentId ? { parentId } : {}), conditions: conds, condMode: mode, ...(achievements ? { achievements } : {}), updatedAt: ts };
      }),
      }),
      { check: (cur) => goalSaveError(cur.goals, goal.id, openedAt, parentId) },
    );
    if (!r.ok) return setError(`保存できませんでした（${r.error}）`);
    ui.toast("保存しました");
    onClose();
  };

  return (
    <Sheet title="達成条件" open onRequestClose={requestClose}>
      <div className="space-y-3">
        <p className="text-[14px] text-ink-2">
          {goal.title}
          {verdict && <span className="ml-2 font-semibold text-ink">今：{VERDICT_LABEL[verdict]}</span>}
        </p>
        <div className="grid grid-cols-2 gap-1 rounded-lg bg-surface-2 p-1" role="radiogroup" aria-label="条件のまとめ方">
          {(
            [
              ["and", "すべて満たす"],
              ["or", "どれか1つ"],
            ] as const
          ).map(([k, label]) => (
            <button key={k} type="button" role="radio" aria-checked={mode === k} onClick={() => setMode(k)} className={`min-h-11 rounded-md text-[14px] font-semibold ${mode === k ? "bg-surface shadow-sm" : "text-ink-2"}`}>
              {label}
            </button>
          ))}
        </div>
        <ul className="space-y-3">
          {conds.map((c, i) => (
            <li key={c.id} className="space-y-2 border-b border-line pb-3">
              <div className="flex items-center gap-2">
                <input aria-label="条件の名前" value={c.label} onChange={(e) => set(i, { label: e.target.value })} placeholder="例：売上" className={inputCls} />
                <span className="shrink-0 text-[14px] font-semibold">{VERDICT_LABEL[judge(c, { periodOpen: open })]}</span>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <input aria-label="目標の値" inputMode="decimal" defaultValue={String(c.target)} onChange={(e) => set(i, { target: num(e.target.value) ?? NaN })} className={`${inputCls} w-28`} />
                {c.op === "range" && (
                  <>
                    <span>〜</span>
                    <input aria-label="上限" inputMode="decimal" defaultValue={c.targetMax === undefined ? "" : String(c.targetMax)} onChange={(e) => set(i, { targetMax: num(e.target.value) ?? undefined })} className={`${inputCls} w-28`} />
                  </>
                )}
                <input aria-label="単位" value={c.unit} onChange={(e) => set(i, { unit: e.target.value })} placeholder="単位" className={`${inputCls} w-20`} />
                <select aria-label="比べ方" value={c.op} onChange={(e) => set(i, { op: e.target.value as Op })} className={`${inputCls} w-28`}>
                  {OPS.map((o) => (
                    <option key={o} value={o}>
                      {OP_LABEL[o]}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex items-center gap-2">
                <label className="text-[14px] text-ink-2" htmlFor={`act-${c.id}`}>
                  今の値
                </label>
                <input
                  id={`act-${c.id}`}
                  inputMode="decimal"
                  defaultValue={c.actual === null ? "" : String(c.actual)}
                  onChange={(e) => {
                    const v = e.target.value;
                    set(i, { actual: num(v) });
                    setBadActual((x) => ({ ...x, [c.id]: v.trim() !== "" && num(v) === null }));
                  }}
                  placeholder="分からなければ空欄"
                  aria-invalid={!!badActual[c.id]}
                  className={`${inputCls} w-36`}
                />
                <button type="button" aria-label={`条件「${c.label || "名前なし"}」を削除`} onClick={() => setConds((x) => x.filter((_, j) => j !== i))} className="ml-auto min-h-11 px-2 text-[14px] font-semibold text-danger">
                  削除
                </button>
              </div>
            </li>
          ))}
        </ul>
        <Button variant="secondary" onClick={() => setConds((x) => [...x, { id: newId("gc"), label: "", unit: goal.unit || "", op: ">=", target: 0, actual: null }])}>
          ＋ 条件を追加
        </Button>
        <Field label="親の目標" htmlFor="goal-parent" optional>
          <select id="goal-parent" value={others.some((g) => g.id === parentId) ? parentId : ""} onChange={(e) => setParentId(e.target.value)} className={inputCls}>
            <option value="">なし</option>
            {others.map((g) => (
              <option key={g.id} value={g.id}>
                {g.title}
              </option>
            ))}
          </select>
        </Field>
        {open && conds.some((c) => c.op === "<=" || c.op === "range") && <p className="text-[14px] text-ink-3">「以下」と「範囲」の条件は、期限の日が終わるまで未判定です（上限を超えたときは、その時点で満たしません）。</p>}
        {(goal.achievements?.length ?? 0) > 0 && <p className="text-[14px] text-ink-3">達成の記録：{goal.achievements!.length}回（そのときの条件のまま残ります）</p>}
        {error && (
          <p role="alert" className="text-[14px] font-medium text-danger">
            {error}
          </p>
        )}
        <Button onClick={save} className="w-full">
          保存
        </Button>
      </div>
    </Sheet>
  );
}
