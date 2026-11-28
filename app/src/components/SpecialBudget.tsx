"use client";

import { useState } from "react";
import { Button, Card, Field, inputCls } from "./ui";
import { useUI } from "./UIContext";
import { formatDateJa, todayStr } from "@/lib/date";
import { formatYen, parseAmount } from "@/lib/money";
import { paydayBudget } from "@/lib/paydayBudget";
import { yearSpecial } from "@/lib/specialBudget";
import { useData, useStore } from "@/lib/store";

/** 設定の家計簿（自分用）：特別支出の年の予算と、月の予算の履歴 */
export function SpecialBudgetSettings() {
  const data = useData();
  const store = useStore();
  const ui = useUI();
  const [v, setV] = useState(data.budget.yearlySpecial == null ? "" : String(data.budget.yearlySpecial));
  const [err, setErr] = useState<string | undefined>();
  const save = async () => {
    if (v.trim() === "") {
      const r = await store.setYearlySpecial(null);
      return r.ok ? ui.toast("特別支出の年の予算を未設定にしました") : ui.toast(r.error, "error");
    }
    const p = parseAmount(v);
    if (!p.ok) return setErr(p.error);
    setErr(undefined);
    const r = await store.setYearlySpecial(p.value);
    if (r.ok) ui.toast(`特別支出の年の予算を${formatYen(p.value)}にしました`);
    else ui.toast(r.error, "error");
  };
  const history = [...(data.budget.history ?? [])].reverse();
  return (
    <Card>
      <h2 className="text-[15px] font-bold">特別支出の年の予算</h2>
      <p className="mb-3 text-[13px] text-ink-3">帰省・車検・家電の買い替えなど、年に数回の大きな出費の予算です。支出の「詳細」で「特別支出」に印を付けた記録は、毎月の予算と比べず、ここと比べます。</p>
      <div className="flex items-start gap-2">
        <div className="flex-1">
          <Field label="年の予算（円）" htmlFor="special-input" error={err}>
            <input id="special-input" inputMode="numeric" value={v} onChange={(e) => setV(e.target.value)} placeholder="例：300000" className={`${inputCls} num`} aria-invalid={!!err} />
          </Field>
        </div>
        <Button onClick={save} className="mt-6">
          保存する
        </Button>
      </div>
      {history.length > 0 && (
        <details className="mt-3 text-[14px]">
          <summary className="flex min-h-11 cursor-pointer items-center font-semibold text-ink-2">毎月の予算の履歴（{history.length}回）</summary>
          <ul className="divide-y divide-line">
            {history.map((h, i) => (
              <li key={`${h.at}-${i}`} className="flex min-h-10 items-center justify-between gap-2">
                <span>{formatDateJa(h.at, true)}から</span>
                <span className="num font-semibold">{h.monthly === null ? "未設定" : formatYen(h.monthly)}</span>
              </li>
            ))}
          </ul>
        </details>
      )}
    </Card>
  );
}

/** 設定の家計簿（自分用）：給料日。入れると、家計簿で給料日からの予算も出す */
export function PaydaySettings() {
  const data = useData();
  const store = useStore();
  const ui = useUI();
  const [v, setV] = useState(data.budget.payday == null ? "" : String(data.budget.payday));
  const [err, setErr] = useState<string | undefined>();
  const save = async () => {
    const s = v.normalize("NFKC").trim();
    if (s !== "" && !/^\d{1,2}$/.test(s)) return setErr("1〜31 の日を入れてください");
    const n = s === "" ? null : Number(s);
    if (n !== null && (n < 1 || n > 31)) return setErr("1〜31 の日を入れてください");
    setErr(undefined);
    const r = await store.setPayday(n);
    if (!r.ok) return ui.toast(r.error, "error");
    ui.toast(n === null ? "給料日を未設定にしました" : `給料日を毎月${n}日にしました`);
  };
  return (
    <Card>
      <h2 className="text-[15px] font-bold">給料日</h2>
      <p className="mb-3 text-[13px] text-ink-3">入れると、家計簿の予算で「給料日から次の給料日の前日まで」に使った額も出します（予算の額は毎月の予算と同じ）。月末より後の日は、その月の月末として数えます。</p>
      <div className="flex items-start gap-2">
        <div className="flex-1">
          <Field label="毎月の給料日（日）" htmlFor="payday-input" error={err} hint="空にすると出しません">
            <input id="payday-input" inputMode="numeric" value={v} onChange={(e) => setV(e.target.value)} placeholder="例：25" className={`${inputCls} num`} aria-invalid={!!err} />
          </Field>
        </div>
        <Button onClick={save} className="mt-6">
          保存する
        </Button>
      </div>
    </Card>
  );
}

/** 家計簿の「予算」（自分用）：給料日からの予算（今の期間だけ） */
export function PaydayBudgetCard({ month }: { month?: string }) {
  const data = useData();
  const today = todayStr();
  const p = paydayBudget(data, today);
  if (!p) return null;
  // 今の月を見ているときだけ出す（過去の月の数字と取り違えない。点検 低3）
  if (month && month !== today.slice(0, 7)) return null;
  return (
    <Card>
      <h2 className="text-[15px] font-bold">給料日からの予算</h2>
      <p className="text-[12px] text-ink-3">
        {formatDateJa(p.from)}〜{formatDateJa(p.to)}
      </p>
      <p className="num mt-1 text-[22px] font-bold">
        {formatYen(p.spent)}
        <span className="ml-1 text-[14px] font-medium text-ink-3">／予算 {formatYen(p.budget)}</span>
      </p>
      <p className={`num text-[13px] ${p.left < 0 ? "text-danger" : "text-ink-2"}`}>
        {p.left < 0 ? `${formatYen(-p.left)} 超えています` : `残り ${formatYen(p.left)}・次の給料日まで${p.daysLeft}日${p.perDay !== null ? `（1日 ${formatYen(p.perDay)}）` : ""}`}
      </p>
      <p className="mt-1 text-[12px] text-ink-3">予算の額は毎月の予算と同じです。1日あたりは、まだ払っていない固定費を引いていません。</p>
    </Card>
  );
}

/** 家計簿の「予算」（自分用）：今年の特別支出と年の予算 */
export function SpecialBudgetCard({ month }: { month?: string }) {
  const data = useData();
  const year = (month ?? todayStr()).slice(0, 4);
  const used = yearSpecial(data, year);
  const budget = data.budget.yearlySpecial ?? null;
  if (used === 0 && budget === null) return null;
  return (
    <Card>
      <h2 className="text-[15px] font-bold">特別支出（{Number(year)}年）</h2>
      <p className="num mt-1 text-[22px] font-bold">
        {formatYen(used)}
        {budget !== null && <span className="ml-1 text-[14px] font-medium text-ink-3">／年の予算 {formatYen(budget)}</span>}
      </p>
      {budget !== null && <p className={`num text-[13px] ${used > budget ? "text-danger" : "text-ink-2"}`}>{used > budget ? `${formatYen(used - budget)} 超えています` : `残り ${formatYen(budget - used)}`}</p>}
      <p className="mt-1 text-[12px] text-ink-3">特別支出は毎月の予算と比べません（家計簿の支出には入ります）。</p>
    </Card>
  );
}
