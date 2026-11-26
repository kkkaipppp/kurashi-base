"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import { OpenFromQuery } from "@/components/OpenFromQuery";
import { useData, useStore, type RecurringInput } from "@/lib/store";
import { clampDay, formatDateJa, isValidDateStr, parseDateStr, todayStr } from "@/lib/date";
import { formatYen, parseAmount } from "@/lib/money";
import { cycleLabel } from "@/lib/recurring";
import { PAYMENT_METHODS, type RecurringCycle, type RecurringExpense } from "@/lib/types";
import { useUI } from "@/components/UIContext";
import { Sheet } from "@/components/Sheet";
import { Button, Card, Empty, Field, PageHeader, focusFirstInvalid, inputCls } from "@/components/ui";

export default function RecurringPage() {
  const data = useData();
  const ui = useUI();
  const [editing, setEditing] = useState<{ id?: string; key: number } | null>(null);
  const ids = useMemo(() => data.recurring.map((r) => r.id), [data.recurring]);
  const openById = useCallback((id: string) => setEditing({ id, key: Date.now() }), [setEditing]);
  const today = todayStr();
  const list = [...data.recurring].sort((a, b) => Number(b.active) - Number(a.active) || a.nextDueDate.localeCompare(b.nextDueDate));
  // 月あたりの目安：毎週は ×52÷12、毎年は ÷12
  const monthlyTotal = Math.round(
    data.recurring.filter((r) => r.active).reduce((s, r) => s + (r.cycle === "weekly" ? (r.amount * 52) / 12 : r.cycle === "yearly" ? r.amount / 12 : r.amount), 0),
  );

  const record = (r: RecurringExpense) =>
    ui.openTx({
      mode: "new",
      type: "expense",
      date: r.nextDueDate <= today ? r.nextDueDate : today,
      title: `${r.name}の支払いを記録`,
      initial: { amount: String(r.amount), categoryId: r.categoryId, merchant: r.name, paymentMethod: r.paymentMethod },
      source: "recurring",
      recurringId: r.id,
    });

  return (
    <main>
      <PageHeader
        title="固定費"
        right={
          <Button onClick={() => setEditing({ key: Date.now() })} className="min-h-11 px-3 text-[14px]">
            ＋ 追加
          </Button>
        }
      />
      <p className="mb-3 text-[13px] text-ink-3">
        固定費は支払いの「予定」なので、支出の合計には入れません。支払ったら「支払いを記録」で支出にすると、次の支払日が進みます。
      </p>
      {data.recurring.some((r) => r.active) && (
        <Card className="mb-3 flex items-center justify-between py-3">
          <span className="text-[14px] font-semibold text-ink-2">固定費（月あたりの目安）</span>
          <span className="num text-lg font-bold">{formatYen(monthlyTotal)}</span>
        </Card>
      )}
      {list.length === 0 ? (
        <Empty action={<Button onClick={() => setEditing({ key: Date.now() })}>固定費を追加</Button>}>固定費はまだありません。家賃・通信費・サブスクなどを追加できます。</Empty>
      ) : (
        <ul className="space-y-2">
          {list.map((r) => {
            const overdue = r.active && r.nextDueDate < today;
            return (
              <li key={r.id}>
                <Card className={`py-3 ${r.active ? "" : "bg-surface-2"}`}>
                  <div className="flex items-start justify-between gap-2">
                    <button type="button" onClick={() => setEditing({ id: r.id, key: Date.now() })} className="min-w-0 flex-1 text-left">
                      <p className="truncate text-[15px] font-bold">{r.name}</p>
                      <p className={`text-[12px] ${r.active ? "text-ink-3" : "text-ink-2"}`}>
                        {cycleLabel(r.cycle)}{r.cycle === "weekly" ? "" : ` ${r.anchorDay}日`} ・ {data.categories.find((c) => c.id === r.categoryId)?.name ?? "（不明）"}
                        {!r.active && "・停止中"}
                      </p>
                      {r.active && (
                        <p className={`mt-1 text-[13px] font-semibold ${overdue ? "text-warn" : "text-ink-2"}`}>
                          次回 {formatDateJa(r.nextDueDate)}
                          {overdue && "（予定日を過ぎています）"}
                        </p>
                      )}
                    </button>
                    <p className="num shrink-0 text-[16px] font-bold">{formatYen(r.amount)}</p>
                  </div>
                  {r.active && (
                    <Button variant="secondary" onClick={() => record(r)} className="mt-2 w-full min-h-11 text-[14px]">
                      支払いを記録
                    </Button>
                  )}
                </Card>
              </li>
            );
          })}
        </ul>
      )}
      <OpenFromQuery ids={ids} onOpen={openById} />
      {editing && <RecurringSheet key={editing.key} id={editing.id} onClose={() => setEditing(null)} />}
    </main>
  );
}

function RecurringSheet({ id, onClose }: { id?: string; onClose: () => void }) {
  const data = useData();
  const store = useStore();
  const ui = useUI();
  const cur = id ? data.recurring.find((r) => r.id === id) : undefined;
  const expenseCats = data.categories.filter((c) => c.kind === "expense" && (!c.archived || c.id === cur?.categoryId));
  const [name, setName] = useState(cur?.name ?? "");
  const [amount, setAmount] = useState(cur ? String(cur.amount) : "");
  const [cycle, setCycle] = useState<RecurringCycle>(cur?.cycle ?? "monthly");
  const [nextDue, setNextDue] = useState(cur?.nextDueDate ?? todayStr());
  const [categoryId, setCategoryId] = useState(cur?.categoryId ?? expenseCats[0]?.id ?? "");
  const [pay, setPay] = useState(cur?.paymentMethod ?? "");
  const [active, setActive] = useState(cur?.active ?? true);
  const [errors, setErrors] = useState<Record<string, string>>({});
  // 編集を始めたときの記録。保存の直前に今の記録と比べ、別のタブで変わっていたら上書きしない
  const editSnapshot = useRef(cur ? JSON.stringify(cur) : undefined);
  // 編集を始めた記録の ID。別のタブで消されても「追加」に化けず、削除されたと知らせる
  const editId = useRef(cur?.id);
  const [wasEditing] = useState(Boolean(cur)); // 見出し用（消されても「編集」のまま）
  const lock = useRef(false);
  // 書きかけで閉じるときは確かめる（ほかの入力シートと同じ。磨き込み 2026-11-26）
  const [initial] = useState(() => JSON.stringify([name, amount, cycle, nextDue, categoryId, pay, active]));
  const dirty = JSON.stringify([name, amount, cycle, nextDue, categoryId, pay, active]) !== initial;
  const requestClose = async () => {
    if (dirty && !(await ui.confirm({ title: "入力内容を破棄しますか？", body: "保存していない変更は失われます。", ok: "破棄する", danger: true }))) return;
    onClose();
  };

  const save = async () => {
    if (lock.current) return;
    const e: Record<string, string> = {};
    if (!name.trim()) e.name = "名前を入力してください";
    const a = parseAmount(amount);
    if (!a.ok) e.amount = a.error;
    if (!isValidDateStr(nextDue)) e.nextDue = "正しい日付を入力してください";
    if (!expenseCats.some((c) => c.id === categoryId)) e.categoryId = "カテゴリを選んでください";
    setErrors(e);
    if (Object.keys(e).length || !a.ok) return focusFirstInvalid();
    lock.current = true;
    const { y, m, d } = parseDateStr(nextDue);
    const input: RecurringInput = {
      name: name.trim(),
      amount: a.value,
      cycle,
      anchorDay: d,
      nextDueDate: clampDay(y, m, d),
      categoryId,
      paymentMethod: pay,
      active,
    };
    const r = await (editId.current ? store.updateRecurring(editId.current, input, editSnapshot.current) : store.addRecurring(input));
    if (!r.ok) {
      lock.current = false;
      return ui.toast(r.error, "error");
    }
    ui.toast(cur ? "保存しました" : "固定費を追加しました");
    onClose();
  };

  const remove = async () => {
    if (!cur) return;
    if (!(await ui.confirm({ title: `「${cur.name}」を削除しますか？`, body: "これまでに記録した支出は残ります。", ok: "削除する", danger: true }))) return;
    const r = await store.deleteRecurring(cur.id);
    if (!r.ok) return ui.toast(r.error, "error");
    ui.toast("削除しました");
    onClose();
  };

  return (
    <Sheet
      title={wasEditing ? "固定費を編集" : "固定費を追加"}
      open
      onRequestClose={requestClose}
      footer={
        <div className="flex gap-2">
          {cur && (
            <Button variant="danger" onClick={remove}>
              削除
            </Button>
          )}
          <Button className="flex-1" onClick={save}>
            保存する
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        <Field label="名前" htmlFor="rc-name" error={errors.name}>
          <input id="rc-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="例：家賃" className={inputCls} aria-invalid={!!errors.name} maxLength={50} />
        </Field>
        <Field label="金額（円）" htmlFor="rc-amount" error={errors.amount}>
          <input id="rc-amount" inputMode="numeric" value={amount} onChange={(e) => setAmount(e.target.value)} className={`${inputCls} num`} aria-invalid={!!errors.amount} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="支払い" htmlFor="rc-cycle">
            <select id="rc-cycle" value={cycle} onChange={(e) => setCycle(e.target.value as RecurringCycle)} className={inputCls}>
              <option value="weekly">毎週</option>
              <option value="monthly">毎月</option>
              <option value="yearly">毎年</option>
            </select>
          </Field>
          <Field label="次の支払日" htmlFor="rc-next" error={errors.nextDue} hint={cycle === "weekly" ? "この日から7日ごとに支払日になります" : "この日付の「日」が毎回の支払日になります（月末を超える月は月末）"}>
            <input id="rc-next" type="date" value={nextDue} onChange={(e) => setNextDue(e.target.value)} className={inputCls} aria-invalid={!!errors.nextDue} />
          </Field>
        </div>
        <Field label="カテゴリ" htmlFor="rc-cat" error={errors.categoryId}>
          <select id="rc-cat" value={categoryId} onChange={(e) => setCategoryId(e.target.value)} className={inputCls}>
            {expenseCats.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="支払方法" optional htmlFor="rc-pay">
          <select id="rc-pay" value={pay} onChange={(e) => setPay(e.target.value)} className={inputCls}>
            {PAYMENT_METHODS.map((p) => (
              <option key={p.id} value={p.id}>
                {p.label}
              </option>
            ))}
          </select>
        </Field>
        <label className="flex min-h-11 items-center justify-between rounded-xl border border-line bg-surface px-3">
          <span className="text-[15px] font-medium">有効（オフの間はホームに出しません）</span>
          <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} className="size-5 accent-[var(--brand)]" />
        </label>
      </div>
    </Sheet>
  );
}
