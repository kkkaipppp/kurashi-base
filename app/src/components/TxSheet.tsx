"use client";

import { useMemo, useRef, useState } from "react";
import { Sheet } from "./Sheet";
import { Button, Field, IconAlert, inputCls } from "./ui";
import { useUI } from "./UIContext";
import { useData, useStore, type TxInput } from "@/lib/store";
import { validateTx, type FieldErrors, type TxDraft } from "@/lib/validate";
import { findDuplicates, type DupCandidate } from "@/lib/duplicates";
import { formatDateJa, todayStr } from "@/lib/date";
import { formatYen } from "@/lib/money";
import { PAYMENT_METHODS, type TxSource, type TxType } from "@/lib/types";

export type TxSheetRequest =
  | { mode: "edit"; id: string }
  | {
      mode: "new";
      type?: TxType;
      date?: string;
      initial?: Partial<Omit<TxDraft, "type" | "date">>;
      source?: TxSource;
      sourceFingerprint?: string;
      recurringId?: string;
      title?: string;
      previewUrl?: string; // 画像取込時：見ながら入力するためのプレビュー
      onSaved?: () => void;
    };

export function TxSheet({ req, onClose }: { req: TxSheetRequest; onClose: () => void }) {
  const data = useData();
  const store = useStore();
  const ui = useUI();
  const editing = req.mode === "edit" ? data.transactions.find((t) => t.id === req.id) : undefined;

  const initialDraft = useMemo<TxDraft>(() => {
    if (editing)
      return {
        type: editing.type,
        date: editing.date,
        amount: String(editing.amount),
        categoryId: editing.categoryId,
        merchant: editing.merchant,
        paymentMethod: editing.paymentMethod,
        note: editing.note,
      };
    const r = req.mode === "new" ? req : null;
    const type = r?.type ?? "expense";
    const firstCat = data.categories.find((c) => c.kind === type && !c.archived)?.id ?? "";
    return {
      type,
      date: r?.date ?? todayStr(),
      amount: r?.initial?.amount ?? "",
      categoryId: r?.initial?.categoryId ?? firstCat,
      merchant: r?.initial?.merchant ?? "",
      paymentMethod: r?.initial?.paymentMethod ?? "",
      note: r?.initial?.note ?? "",
    };
    // 開いた時点の値で固定する
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const [draft, setDraft] = useState<TxDraft>(initialDraft);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [saveError, setSaveError] = useState<string | null>(null);
  const [dups, setDups] = useState<DupCandidate[] | null>(null);
  const [busy, setBusy] = useState(false);
  const lock = useRef(false); // 連続タップでの二重保存防止
  const saved = useRef(false);

  const dirty = JSON.stringify(draft) !== JSON.stringify(initialDraft);
  const cats = data.categories.filter((c) => c.kind === draft.type && (!c.archived || c.id === draft.categoryId));
  const catName = (id: string) => data.categories.find((c) => c.id === id)?.name ?? "（削除済みカテゴリ）";

  const set = <K extends keyof TxDraft>(k: K, v: TxDraft[K]) => {
    setDraft((d) => ({ ...d, [k]: v }));
    setDups(null);
    if (errors[k]) setErrors((e) => ({ ...e, [k]: "" }));
  };

  const switchType = (type: TxType) => {
    if (type === draft.type) return;
    const first = data.categories.find((c) => c.kind === type && !c.archived)?.id ?? "";
    setDraft((d) => ({ ...d, type, categoryId: first }));
    setDups(null);
  };

  const requestClose = async () => {
    if (busy) return;
    if (dirty && !(await ui.confirm({ title: "入力内容を破棄しますか？", body: "保存していない変更は失われます。", ok: "破棄する", danger: true })))
      return;
    onClose();
  };

  const save = async (force = false) => {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setSaveError(null);
    try {
      const v = validateTx(draft, data.categories);
      if (!v.ok) {
        setErrors(v.errors);
        return;
      }
      const input: TxInput = {
        type: draft.type,
        date: draft.date,
        amount: v.amount,
        categoryId: draft.categoryId,
        merchant: draft.merchant.trim(),
        paymentMethod: draft.paymentMethod,
        note: draft.note.trim(),
        source: editing?.source ?? (req.mode === "new" ? (req.source ?? "manual") : "manual"),
        ...(editing?.sourceFingerprint || (req.mode === "new" && req.sourceFingerprint)
          ? { sourceFingerprint: editing?.sourceFingerprint ?? (req.mode === "new" ? req.sourceFingerprint : undefined) }
          : {}),
        ...(editing?.recurringId || (req.mode === "new" && req.recurringId)
          ? { recurringId: editing?.recurringId ?? (req.mode === "new" ? req.recurringId : undefined) }
          : {}),
      };
      if (!force) {
        const found = findDuplicates({ ...input, excludeId: editing?.id }, data.transactions);
        if (found.length) {
          setDups(found);
          return;
        }
      }
      const r = editing ? store.updateTx(editing.id, input) : store.addTx(input);
      if (!r.ok) {
        setSaveError(r.error); // 入力は保持したまま
        return;
      }
      ui.toast(editing ? "保存しました" : `${draft.type === "expense" ? "支出" : "収入"}を追加しました`);
      saved.current = true; // 保存後はロックを解除しない（閉じる前の連打で2件目を作らない）
      if (req.mode === "new") req.onSaved?.();
      onClose();
    } finally {
      if (!saved.current) {
        lock.current = false;
        setBusy(false);
      }
    }
  };

  const remove = async () => {
    if (!editing) return;
    const ok = await ui.confirm({
      title: `この${editing.type === "expense" ? "支出" : "収入"}を削除しますか？`,
      body: `${formatDateJa(editing.date)} ${formatYen(editing.amount)}（${catName(editing.categoryId)}）\n削除すると元に戻せません。`,
      ok: "削除する",
      danger: true,
    });
    if (!ok) return;
    const r = store.deleteTx(editing.id);
    if (!r.ok) return ui.toast(r.error, "error");
    ui.toast("削除しました");
    onClose();
  };

  if (req.mode === "edit" && !editing) {
    return (
      <Sheet title="取引" open onRequestClose={onClose}>
        <p className="text-ink-2">この記録は見つかりません（削除された可能性があります）。</p>
      </Sheet>
    );
  }

  const title = editing ? `${editing.type === "expense" ? "支出" : "収入"}を編集` : req.mode === "new" && req.title ? req.title : draft.type === "expense" ? "支出を追加" : "収入を追加";

  return (
    <Sheet
      title={title}
      open
      onRequestClose={requestClose}
      footer={
        dups ? null : (
          <div className="flex gap-2">
            {editing && (
              <Button variant="danger" onClick={remove} disabled={busy}>
                削除
              </Button>
            )}
            <Button className="flex-1" onClick={() => save()} disabled={busy} aria-busy={busy}>
              {busy ? "保存中…" : "保存する"}
            </Button>
          </div>
        )
      }
    >
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          save();
        }}
        noValidate
      >
        {req.mode === "new" && req.previewUrl && (
          <a href={req.previewUrl} target="_blank" rel="noreferrer" className="block overflow-hidden rounded-xl border border-line bg-surface-2">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={req.previewUrl} alt="取り込んだ画像" className="mx-auto max-h-56 object-contain" />
            <span className="block py-1 text-center text-[12px] text-ink-3">タップで拡大</span>
          </a>
        )}
        <div role="radiogroup" aria-label="種別" className="grid grid-cols-2 gap-1 rounded-xl bg-surface-2 p-1">
          {(["expense", "income"] as const).map((t) => (
            <button
              key={t}
              type="button"
              role="radio"
              aria-checked={draft.type === t}
              onClick={() => switchType(t)}
              className={`min-h-10 rounded-lg text-[15px] font-semibold transition ${
                draft.type === t ? (t === "expense" ? "bg-surface text-expense shadow-sm" : "bg-surface text-income shadow-sm") : "text-ink-2"
              }`}
            >
              {t === "expense" ? "支出" : "収入"}
            </button>
          ))}
        </div>

        <details className="-mt-1 text-[12px] text-ink-3">
          <summary className="cursor-pointer py-1">返金・振替・分割払いを記録するには</summary>
          <p className="pt-1">
            返金は「収入」として、元の支出と同じカテゴリで登録してください。口座どうしの振替や分割払いの記録には、まだ対応していません。
          </p>
        </details>

        <Field label="金額（円）" htmlFor="tx-amount" error={errors.amount}>
          <div className="relative">
            <span className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-xl font-bold text-ink-3">¥</span>
            <input
              id="tx-amount"
              inputMode="numeric"
              autoComplete="off"
              placeholder="0"
              value={draft.amount}
              onChange={(e) => set("amount", e.target.value)}
              aria-invalid={!!errors.amount}
              aria-describedby={errors.amount ? "tx-amount-error" : undefined}
              className={`${inputCls} num min-h-14 pl-8 text-2xl font-bold`}
            />
          </div>
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label="日付" htmlFor="tx-date" error={errors.date}>
            <input
              id="tx-date"
              type="date"
              value={draft.date}
              onChange={(e) => set("date", e.target.value)}
              aria-invalid={!!errors.date}
              className={inputCls}
            />
          </Field>
          <Field label="カテゴリ" htmlFor="tx-cat" error={errors.categoryId}>
            <select
              id="tx-cat"
              value={draft.categoryId}
              onChange={(e) => set("categoryId", e.target.value)}
              aria-invalid={!!errors.categoryId}
              className={inputCls}
            >
              {cats.length === 0 && <option value="">カテゴリがありません</option>}
              {cats.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </Field>
        </div>

        <Field label={draft.type === "expense" ? "店名" : "相手先"} optional htmlFor="tx-merchant" error={errors.merchant}>
          <input id="tx-merchant" value={draft.merchant} onChange={(e) => set("merchant", e.target.value)} className={inputCls} maxLength={100} />
        </Field>

        <Field label="支払方法" optional htmlFor="tx-pay">
          <select id="tx-pay" value={draft.paymentMethod} onChange={(e) => set("paymentMethod", e.target.value)} className={inputCls}>
            {PAYMENT_METHODS.map((p) => (
              <option key={p.id} value={p.id}>
                {p.label}
              </option>
            ))}
          </select>
        </Field>

        <Field label="メモ" optional htmlFor="tx-note" error={errors.note}>
          <textarea id="tx-note" rows={2} value={draft.note} onChange={(e) => set("note", e.target.value)} className={inputCls} maxLength={500} />
        </Field>

        {saveError && (
          <p role="alert" className="rounded-xl bg-expense-soft px-3 py-2 text-[14px] font-medium text-danger">
            {saveError}（入力した内容は残っています）
          </p>
        )}

        {dups && (
          <div role="alert" className="space-y-3 rounded-2xl border border-warn/40 bg-warn-soft p-3">
            <p className="flex items-center gap-1.5 font-bold text-warn">
              <IconAlert className="size-5" />
              同じ内容の記録がある可能性があります
            </p>
            <ul className="space-y-1.5">
              {dups.slice(0, 3).map((d) => (
                <li key={d.tx.id} className="rounded-lg bg-surface px-3 py-2 text-[13px]">
                  <span className="font-semibold">
                    {formatDateJa(d.tx.date)} {formatYen(d.tx.amount)}
                  </span>{" "}
                  {d.tx.merchant || catName(d.tx.categoryId)}
                  <span className="block text-ink-3">{d.reason}</span>
                </li>
              ))}
            </ul>
            <p className="text-[12px] text-ink-2">別の支出・収入なら、そのまま保存できます。すでにある記録はそのまま残ります。</p>
            <div className="grid grid-cols-2 gap-2">
              <Button variant="secondary" onClick={() => setDups(null)}>
                戻って確認
              </Button>
              <Button onClick={() => save(true)} disabled={busy}>
                それでも保存
              </Button>
            </div>
          </div>
        )}
        <button type="submit" hidden aria-hidden="true" tabIndex={-1} />
      </form>
    </Sheet>
  );
}
