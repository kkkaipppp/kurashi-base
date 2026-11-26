"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Sheet } from "./Sheet";
import { Button, Field, IconAlert, inputCls } from "./ui";
import { useUI } from "./UIContext";
import { useData, useStore, type TxInput } from "@/lib/store";
import { validateTx, type FieldErrors, type TxDraft } from "@/lib/validate";
import { findDuplicates, type DupCandidate } from "@/lib/duplicates";
import { addDays, formatDateJa, todayStr } from "@/lib/date";
import { formatYen } from "@/lib/money";
import { clearSheetDraft, draftTimeLabel, loadSheetDraft, saveSheetDraft } from "@/lib/sheetDraft";
import { OrphanDraft } from "./OrphanDraft";
import { categoryIsInvest, fixedCandidates } from "@/lib/classify";
import { PAYMENT_METHODS, type Transaction, type TxSource, type TxType } from "@/lib/types";
import { applyRefund, refundedTotal } from "@/lib/refund";
import { newId } from "@/lib/defaults";
import { parseAmount } from "@/lib/money";
import { categoryForMerchant, recentMerchants } from "@/lib/merchantSuggest";

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

// よく使うカテゴリ・前回の支払方法の候補（100点化の指示 A）。まず自分用だけ。候補は押したときだけ入る（勝手に変えない）
const SUGGEST = process.env.NEXT_PUBLIC_KB_EDITION === "personal";
// この記録の数え方・旅行・固定費の支払いとしてつなぐ（100点化の指示 D・F）。自分用だけ
const EXTRA = SUGGEST;

export function TxSheet({ req, onClose }: { req: TxSheetRequest; onClose: () => void }) {
  const data = useData();
  const store = useStore();
  const ui = useUI();
  const liveEditing = req.mode === "edit" ? data.transactions.find((t) => t.id === req.id) : undefined;
  // 編集中に別のタブで消されても入力を消さない。保存すると「削除されています」で止まる（作り直さない）
  const [originalEditing] = useState(liveEditing);
  const editing = liveEditing ?? originalEditing;

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
        countAs: editing.countAs === "transfer" && editing.transferKind === "card" ? "transfer-card" : (editing.countAs ?? ""),
        tripId: editing.tripId ?? "",
        linkRecurringId: "",
        linkPartial: false,
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
      countAs: r?.initial?.countAs ?? "",
      tripId: r?.initial?.tripId ?? "",
      linkRecurringId: "",
      linkPartial: false,
    };
    // 開いた時点の値で固定する
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const [draft, setDraft] = useState<TxDraft>(initialDraft);
  // 「続けて追加」のあとは、その時点の空の入力を基準にする（何も入力していなければ閉じるときに確認しない）
  const [base, setBase] = useState<TxDraft>(initialDraft);
  // 手入力の新規追加のときだけ「続けて追加」を出す（画像・固定費からの記録は1件ずつ）
  const canContinue = req.mode === "new" && !req.previewUrl && !req.recurringId;
  const [errors, setErrors] = useState<FieldErrors>({});
  const [saveError, setSaveError] = useState<string | null>(null);
  const [dups, setDups] = useState<DupCandidate[] | null>(null);
  const [busy, setBusy] = useState(false);
  // 編集を始めたときの記録。保存の直前に今の記録と比べ、別のタブで変わっていたら上書きしない
  const editSnapshot = useRef(editing ? JSON.stringify(editing) : undefined);
  const lock = useRef(false); // 連続タップでの二重保存防止
  const saved = useRef(false);

  const dirty = JSON.stringify(draft) !== JSON.stringify(base);

  // 下書きの控え（100点化の指示 B）。新しい入力は targetId=null、編集は記録の ID。
  // 画像・固定費からの記録は1回きりなので控えない
  const draftTarget = editing?.id ?? null;
  const keepDraft = req.mode === "edit" || (!req.previewUrl && !req.recurringId);
  const [pending] = useState(() => (keepDraft ? loadSheetDraft<TxDraft>("tx", draftTarget) : null));
  const [resumeAsked, setResumeAsked] = useState(false);
  const resumed = useRef(false);
  const [draftSaveFailed, setDraftSaveFailed] = useState(false);
  useEffect(() => {
    if (!keepDraft || saved.current) return;
    // 前の下書きに「続きから／捨てる」を答えるまでは控えない（答える前に打った分で、前の下書きを消さない）
    if (pending && !resumeAsked) return;
     
    if (dirty) setDraftSaveFailed(!saveSheetDraft("tx", draftTarget, draft, undefined, undefined, editSnapshot.current));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft, dirty, resumeAsked]);
  const resume = async () => {
    if (!pending) return setResumeAsked(true);
    // 下書きを始めたあとに、元の記録が変わっていたら（復元・別の画面での変更など）、知らせてから選んでもらう
    if (pending.base && editSnapshot.current && pending.base !== editSnapshot.current) {
      const ok = await ui.confirm({
        title: "元の記録が、下書きのあとに変わっています",
        body: "続きからにすると、今の記録の中身が下書きの中身に置き換わります（保存するまでは変わりません）。今の記録のまま直す場合は「今の記録を使う」を選んでください（下書きは捨てます）。",
        ok: "下書きを使う",
        cancel: "今の記録を使う",
      });
      if (!ok) return discardPending();
    }
    // 答える前に打った分があれば、それに置き換わることを確かめる
    if (dirty && !(await ui.confirm({ title: "下書きに置き換えますか？", body: "今この画面で打った分は消えて、下書きの中身になります。", ok: "置き換える" }))) return;
    setDraft({ ...pending.draft });
    resumed.current = true;
    setResumeAsked(true);
  };
  const discardPending = () => {
    clearSheetDraft("tx", draftTarget);
    setResumeAsked(true);
  };
  const cats = data.categories.filter((c) => c.kind === draft.type && (!c.archived || c.id === draft.categoryId));
  const catName = (id: string) => data.categories.find((c) => c.id === id)?.name ?? "（削除済みカテゴリ）";
  // 直近90日でよく使ったカテゴリ（上位4つ）と、同じ種類の前回の支払方法
  const suggest = useMemo(() => {
    if (!SUGGEST) return { cats: [] as string[], pay: "" };
    const since = addDays(todayStr(), -90);
    const count = new Map<string, number>();
    let lastPay = "";
    let lastAt = "";
    for (const t of data.transactions) {
      if (t.type !== draft.type) continue;
      if (t.date >= since) count.set(t.categoryId, (count.get(t.categoryId) ?? 0) + 1);
      if (t.createdAt > lastAt) {
        lastAt = t.createdAt;
        lastPay = t.paymentMethod;
      }
    }
    const usable = new Set(data.categories.filter((c) => c.kind === draft.type && !c.archived).map((c) => c.id));
    return {
      cats: [...count].filter(([id]) => usable.has(id)).sort((a, b) => b[1] - a[1]).slice(0, 4).map(([id]) => id),
      pay: lastPay,
    };
  }, [data.transactions, data.categories, draft.type]);
  // A2（自分用）：よく使う店名と、その店でいつも使うカテゴリ（押したときだけ入る）
  const merchants = useMemo(() => (SUGGEST ? recentMerchants(data.transactions, draft.type, todayStr()) : []), [data.transactions, draft.type]);
  const merchantCat = useMemo(() => {
    if (!SUGGEST) return null;
    const id = categoryForMerchant(data.transactions, draft.type, draft.merchant);
    return id && id !== draft.categoryId && data.categories.some((c) => c.id === id && c.kind === draft.type && !c.archived) ? id : null;
  }, [data.transactions, data.categories, draft.type, draft.merchant, draft.categoryId]);

  const set = <K extends keyof TxDraft>(k: K, v: TxDraft[K]) => {
    setDraft((d) => ({ ...d, [k]: v }));
    setDups(null);
    if (errors[k]) setErrors((e) => ({ ...e, [k]: "" }));
  };

  const switchType = (type: TxType) => {
    if (type === draft.type) return;
    const first = data.categories.find((c) => c.kind === type && !c.archived)?.id ?? "";
    // 種別を変えたら、固定費のつなぎ・数え方は外す（収入に固定費をつながない。点検役の指摘）
    setDraft((d) => ({ ...d, type, categoryId: first, linkRecurringId: "", countAs: "" }));
    setDups(null);
  };

  const requestClose = async () => {
    if (busy) return;
    if (dirty && !(await ui.confirm({ title: "入力内容を破棄しますか？", body: "保存していない変更は失われます。", ok: "破棄する", danger: true })))
      return;
    // 続きからにしたあと元に戻して閉じたときも、下書きは片付ける（次に開いたときにまた出さない）
    // 前の下書きに答えていないときは、その下書きは消さない（点検役の指摘）
    if ((dirty || resumed.current) && !(pending && !resumeAsked)) clearSheetDraft("tx", draftTarget);
    onClose();
  };

  // 編集の途中で、記録が別の画面で消されたとき（入力は残っている）
  const gone = req.mode === "edit" && !liveEditing && !!originalEditing;
  const saveAsNew = async () => {
    const ok = await ui.confirm({ title: "新しい記録として保存しますか？", body: "消された記録は戻りません。今の入力の中身で、新しい記録を1件追加します。", ok: "新しく保存する" });
    if (ok) save(false, false, true);
  };

  const save = async (force = false, keepOpen = false, asNew = false) => {
    if (lock.current) return;
    // 返金の記録は直せない（元の支出と金額が合わなくなるため）。削除すれば、元の支出が元に戻る
    if (editing?.refundOf && !asNew) {
      setSaveError("返金の記録は、直せません。削除すると、元の支出が元に戻ります。返金し直すときは、元の支出から返金してください");
      return;
    }
    lock.current = true;
    setBusy(true);
    setSaveError(null);
    try {
      const v = validateTx(draft, data.categories);
      if (!v.ok) {
        setErrors(v.errors);
        return;
      }
      // 返金のある支出の金額は直せない（返金の記録から計算し直す仕組みのため）。直すときは、返金の記録を消して（元に戻る）から
      if (editing?.refundGross !== undefined && !asNew) {
        const wasCount = editing.countAs === "transfer" && editing.transferKind === "card" ? "transfer-card" : editing.countAs === "transfer" ? "" : (editing.countAs ?? "");
        const nowCount = draft.countAs === "transfer" && editing.countAs === "transfer" ? "" : (draft.countAs ?? "");
        // 全額返金した支出は、数え方が「収支に数えない」になっている（返金がそうした）。その表示のままなら、変えていない扱い
        const countChanged = editing.countAs === "transfer" ? draft.countAs !== "transfer" : nowCount !== wasCount;
        if (v.amount !== editing.amount || draft.type !== editing.type || countChanged || draft.paymentMethod !== editing.paymentMethod) {
          setSaveError("返金のある支出の、金額・種類・数え方・支払い方法は、直せません。返金の記録を消す（元に戻ります）と、直せるようになります");
          return;
        }
      }
      // 手でつないだ固定費は、保存の直前にも「今も候補か」を確かめる（下書きの再開・金額の変更で古い指定が残らないように）
      const linkOk =
        draft.type === "expense" && draft.linkRecurringId && fixedCandidates({ type: draft.type, categoryId: draft.categoryId, amount: v.amount, merchant: draft.merchant, date: draft.date }, data.recurring).some((r) => r.id === draft.linkRecurringId)
          ? draft.linkRecurringId
          : undefined;
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
        ...(editing?.recurringId || (req.mode === "new" && req.recurringId) || linkOk
          ? { recurringId: editing?.recurringId ?? (req.mode === "new" && req.recurringId ? req.recurringId : linkOk) }
          : {}),
        // 一部だけの支払い（選んだ固定費の予定額より少ないときだけ。残りは、まだ払っていない）
        // 残り（予定額 − すでに払った分）より少ないときだけ（チェック欄の表示条件と同じ）。全部払い終わる額なら、一部の印は付けない
        ...(linkOk && draft.linkPartial && v.amount < remainingOf(data.recurring.find((r) => r.id === linkOk)) ? { recurringPartial: true } : {}),
        // 数え方・旅行は、空なら持たない（編集で外したときは store が消す）
        countAs: draft.type === "expense" && draft.countAs ? (draft.countAs === "transfer-card" ? "transfer" : draft.countAs) : undefined,
        transferKind: draft.type === "expense" && draft.countAs === "transfer-card" ? "card" : undefined,
        tripId: draft.tripId && (data.trips ?? []).some((t) => t.id === draft.tripId) ? draft.tripId : undefined,
      };
      if (input.countAs === undefined && !editing?.countAs) delete input.countAs;
      if (input.transferKind === undefined && !editing?.transferKind) delete input.transferKind;
      if (input.tripId === undefined && !editing?.tripId) delete input.tripId;
      if (input.recurringId === undefined) delete input.recurringId;
      if (!force) {
        const found = findDuplicates({ ...input, excludeId: asNew ? undefined : editing?.id }, data.transactions);
        if (found.length) {
          setDups(found);
          return;
        }
      }
      const r = await (editing && !asNew ? store.updateTx(editing.id, input, editSnapshot.current) : store.addTx(input));
      if (!r.ok) {
        setSaveError(r.error); // 入力は保持したまま
        return;
      }
      // 保存がうまくいったときだけ下書きを消す（前の下書きに答えていないときは、それは残す）
      if (!(pending && !resumeAsked) || asNew) clearSheetDraft("tx", draftTarget);
      ui.toast(asNew ? "新しい記録として保存しました" : editing ? "保存しました" : `${draft.type === "expense" ? "支出" : "収入"}を追加しました`);
      if (keepOpen && canContinue) {
        // 日付・種別・カテゴリ・支払方法はそのまま、金額・店名・メモだけ空にして次の1件へ
        // 固定費のつなぎは1件ごと（次の1件に残すと、同じ固定費の支払日が2回進む。点検役の指摘）
        const next: TxDraft = { ...draft, amount: "", merchant: "", note: "", linkRecurringId: "" };
        setDraft(next);
        setBase(next);
        setErrors({});
        setDups(null);
        requestAnimationFrame(() => document.getElementById("tx-amount")?.focus());
        return;
      }
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
      body: `${formatDateJa(editing.date)} ${formatYen(editing.amount)}（${catName(editing.categoryId)}）\n${refundedTotal(data, editing.id) > 0 ? "この支出の返金の記録も、一緒に削除します。\n" : ""}削除すると元に戻せません。`,
      ok: "削除する",
      danger: true,
    });
    if (!ok) return;
    const r = await store.deleteTx(editing.id);
    if (!r.ok) return ui.toast(r.error, "error");
    ui.toast("削除しました");
    onClose();
  };

  if (req.mode === "edit" && !editing) {
    return (
      <Sheet title="取引" open onRequestClose={onClose}>
        <p className="text-ink-2">この記録は見つかりません（削除された可能性があります）。</p>
        <OrphanDraft kind="tx" id={req.id} onNew={() => ui.openTx({ mode: "new", type: "expense" })} onDone={onClose} />
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
            {canContinue && (
              <Button variant="secondary" onClick={() => save(false, true)} disabled={busy}>
                続けて追加
              </Button>
            )}
            <Button className="flex-1" onClick={() => save()} disabled={busy} aria-busy={busy}>
              {busy ? "保存中…" : "保存する"}
            </Button>
          </div>
        )
      }
    >
      {pending && !resumeAsked && (
        <div className="mb-3 rounded-xl border border-brand/30 bg-brand-soft p-3" role="status">
          <p className="text-[14px] font-semibold">{draftTimeLabel(pending.savedAt)} の下書きがあります</p>
          <p className="num mt-0.5 text-[12px] text-ink-2">
            {pending.draft.amount ? `${pending.draft.amount}円 ` : ""}
            {pending.draft.merchant}
          </p>
          <div className="mt-2 grid grid-cols-2 gap-2">
            <Button variant="secondary" onClick={discardPending}>
              捨てる
            </Button>
            <Button onClick={resume}>続きから</Button>
          </div>
        </div>
      )}
      {draftSaveFailed && <p className="mb-2 text-[12px] text-warn">下書きを保存できませんでした。入力はこの画面に残っています。記録を保存してください。</p>}
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
              className={`min-h-11 rounded-lg text-[15px] font-semibold transition ${
                draft.type === t ? (t === "expense" ? "bg-surface text-expense shadow-sm" : "bg-surface text-income shadow-sm") : "text-ink-2"
              }`}
            >
              {t === "expense" ? "支出" : "収入"}
            </button>
          ))}
        </div>

        <details className="-mt-1 text-[12px] text-ink-3">
          <summary className="cursor-pointer py-1">返金・振替・分割払いについて</summary>
          {EXTRA ? (
            // 自分用：返金・口座間の移動を記録できる（案内を実際の機能に合わせる。磨き込み 2026-11-26）
            <p className="pt-1">
              返金は、元の支出を開いて「返金があった」から記録します。カードの引き落としは、下の「数え方」で「カードの引き落とし」を、口座どうしの移動は「収支に数えない（口座間の移動など）」を選びます。分割払いは、まだ記録できません。
            </p>
          ) : (
            <p className="pt-1">
              返金は「収入」で登録します（元の支出と同じカテゴリで）。口座どうしの振替・分割払いは、まだ記録できません。
            </p>
          )}
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
        {suggest.cats.length > 0 && (
          <div className="-mt-2 flex flex-wrap items-center gap-1.5" role="group" aria-label="よく使うカテゴリ">
            <span className="text-[12px] text-ink-3">よく使う：</span>
            {suggest.cats.map((id) => (
              <button
                key={id}
                type="button"
                onClick={() => set("categoryId", id)}
                aria-pressed={draft.categoryId === id}
                className={`min-h-11 rounded-full border px-3 text-[13px] font-semibold ${draft.categoryId === id ? "border-brand bg-brand-soft text-brand" : "border-line bg-surface text-ink-2"}`}
              >
                {catName(id)}
              </button>
            ))}
          </div>
        )}

        <Field label={draft.type === "expense" ? "店名" : "相手先"} optional htmlFor="tx-merchant" error={errors.merchant}>
          <input id="tx-merchant" value={draft.merchant} onChange={(e) => set("merchant", e.target.value)} className={inputCls} maxLength={100} />
        </Field>
        {!draft.merchant.trim() && merchants.length > 0 && (
          <div className="-mt-2 flex flex-wrap items-center gap-1.5" role="group" aria-label="よく使う店名">
            <span className="text-[12px] text-ink-3">よく使う：</span>
            {merchants.map((name) => (
              <button key={name} type="button" onClick={() => set("merchant", name)} className="min-h-11 max-w-full truncate rounded-full border border-line bg-surface px-3 text-[13px] font-semibold text-ink-2">
                {name}
              </button>
            ))}
          </div>
        )}
        {merchantCat && (
          <button type="button" onClick={() => set("categoryId", merchantCat)} className="-mt-2 min-h-11 rounded-full border border-line bg-surface px-3 text-left text-[13px] font-semibold text-ink-2">
            この店はいつも：{catName(merchantCat)}
          </button>
        )}

        <Field label="支払方法" optional htmlFor="tx-pay">
          <select id="tx-pay" value={draft.paymentMethod} onChange={(e) => set("paymentMethod", e.target.value)} className={inputCls}>
            {PAYMENT_METHODS.map((p) => (
              <option key={p.id} value={p.id}>
                {p.label}
              </option>
            ))}
          </select>
          {suggest.pay && suggest.pay !== draft.paymentMethod && (
            <button type="button" onClick={() => set("paymentMethod", suggest.pay)} className="mt-1 min-h-11 rounded-full border border-line bg-surface px-3 text-[13px] font-semibold text-ink-2">
              前回と同じ：{PAYMENT_METHODS.find((p) => p.id === suggest.pay)?.label ?? "その他"}
            </button>
          )}
        </Field>

        {EXTRA && draft.type === "expense" && (
          <TxExtras draft={draft} set={set} editingRecurringId={editing?.recurringId ?? (req.mode === "new" ? req.recurringId : undefined)} />
        )}

        {EXTRA && editing && editing.type === "expense" && !editing.refundOf && <RefundBox tx={editing} onDone={onClose} />}
        {EXTRA && editing?.refundOf && <p className="rounded-xl bg-surface-2 px-3 py-2 text-[12px] text-ink-2">この記録は返金です。元の支出の額を減らしています（集計では、収入にも支出にも入りません）。削除すると、元の支出が元に戻ります。</p>}

        <Field label="メモ" optional htmlFor="tx-note" error={errors.note}>
          <textarea id="tx-note" rows={2} value={draft.note} onChange={(e) => set("note", e.target.value)} className={inputCls} maxLength={500} />
        </Field>

        {gone && (
          <div className="rounded-xl border border-warn/40 bg-warn-soft p-3" role="alert">
            <p className="text-[13px] font-semibold text-warn">この記録は、別の画面で消されました。</p>
            <p className="mt-0.5 text-[12px] text-ink-2">今の入力は残っています。新しい記録として保存できます。</p>
            <Button variant="secondary" className="mt-2 w-full" onClick={saveAsNew} disabled={busy}>
              新しい記録として保存する
            </Button>
          </div>
        )}
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


/** 自分用だけ：固定費の支払いとしてつなぐ・この記録の数え方・旅行（100点化の指示 D・F。どれも押したときだけ変わる） */
/** 固定費の、今の支払日の残り（予定額 − すでに払った分） */
const remainingOf = (r: { amount: number; nextDueDate: string; partialPaid?: { due: string; paid: number } } | undefined) =>
  !r ? 0 : r.amount - (r.partialPaid && r.partialPaid.due === r.nextDueDate ? r.partialPaid.paid : 0);

function TxExtras({
  draft,
  set,
  editingRecurringId,
}: {
  draft: TxDraft;
  set: <K extends keyof TxDraft>(k: K, v: TxDraft[K]) => void;
  editingRecurringId?: string;
}) {
  const data = useData();
  const trips = [...(data.trips ?? [])].sort((a, b) => b.startDate.localeCompare(a.startDate));
  const cat = data.categories.find((c) => c.id === draft.categoryId);
  const catInvest = categoryIsInvest(cat);
  const linked = editingRecurringId ? data.recurring.find((r) => r.id === editingRecurringId) : undefined;
  const amount = /^\d+$/.test(draft.amount.replaceAll(",", "")) ? Number(draft.amount.replaceAll(",", "")) : null;
  const cands = editingRecurringId ? [] : fixedCandidates({ type: draft.type, categoryId: draft.categoryId, amount, merchant: draft.merchant, date: draft.date }, data.recurring);
  return (
    <div className="space-y-3 rounded-xl bg-surface-2 p-3">
      {linked ? (
        <p className="text-[13px] text-ink-2">固定費「{linked.name}」の支払いとして記録しています</p>
      ) : (
        cands.length > 0 && (
          <div role="group" aria-label="固定費の支払いとしてつなぐ">
            <p className="text-[13px] font-semibold text-ink-2">固定費の支払いですか？</p>
            <div className="mt-1 flex flex-wrap gap-1.5">
              {cands.map((r) => (
                <button
                  key={r.id}
                  type="button"
                  aria-pressed={draft.linkRecurringId === r.id}
                  onClick={() => {
                    set("linkRecurringId", draft.linkRecurringId === r.id ? "" : r.id);
                    set("linkPartial", false);
                  }}
                  className={`min-h-11 rounded-full border px-3 text-[13px] font-semibold ${draft.linkRecurringId === r.id ? "border-brand bg-brand-soft text-brand" : "border-line bg-surface text-ink-2"}`}
                >
                  {draft.linkRecurringId === r.id ? "✓ " : ""}
                  {r.name}（{formatDateJa(r.nextDueDate)}・{formatYen(r.amount)}）
                </button>
              ))}
            </div>
            {(() => {
              const sel = cands.find((r) => r.id === draft.linkRecurringId);
              const remaining = sel ? sel.amount - (sel.partialPaid && sel.partialPaid.due === sel.nextDueDate ? sel.partialPaid.paid : 0) : 0;
              // 予定額（残り）より少ないときだけ、「一部の支払い」を選べる
              return sel && amount !== null && amount < remaining ? (
                <label className="mt-1 flex min-h-11 cursor-pointer items-center gap-2 text-[13px]">
                  <input type="checkbox" checked={!!draft.linkPartial} onChange={(e) => set("linkPartial", e.target.checked)} className="size-5 accent-[var(--brand)]" />
                  一部だけの支払い（残り{formatYen(remaining - amount)}は、まだ払っていない）
                </label>
              ) : null;
            })()}
            <p className="mt-1 text-[12px] text-ink-3">全額の支払いとして登録すると、次の支払日が更新されます。一部だけ支払った場合は、残額が未払いとして残ります。</p>
          </div>
        )
      )}
      <Field label="この記録の数え方" optional htmlFor="tx-count">
        <select id="tx-count" value={draft.countAs ?? ""} onChange={(e) => set("countAs", e.target.value as TxDraft["countAs"])} className={inputCls}>
          <option value="">カテゴリどおり（{catInvest ? "投資" : "生活費"}）</option>
          <option value="life">生活費として数える</option>
          <option value="invest">投資として数える（予算と比べない）</option>
          <option value="transfer-card">カードの引き落とし（収支に数えない。残高は減る）</option>
          <option value="transfer">収支に数えない（口座間の移動など。残高は変わらない）</option>
        </select>
      </Field>
      {trips.length > 0 && (
        <Field label="旅行" optional htmlFor="tx-trip">
          <select id="tx-trip" value={draft.tripId ?? ""} onChange={(e) => set("tripId", e.target.value)} className={inputCls}>
            <option value="">旅行に入れない</option>
            {trips.map((t) => (
              <option key={t.id} value={t.id}>
                {t.title}（{formatDateJa(t.startDate)}〜）
              </option>
            ))}
          </select>
        </Field>
      )}
    </div>
  );
}

/** 返金を記録する（自分用）。元の支出が、返金の分だけ減る（全額なら収支に数えない）。返金の記録を消すと、元に戻る */
function RefundBox({ tx, onDone }: { tx: Transaction; onDone: () => void }) {
  const data = useData();
  const store = useStore();
  const ui = useUI();
  const [open, setOpen] = useState(false);
  const left = (tx.refundGross ?? tx.amount) - refundedTotal(data, tx.id); // 返金できる残り（元の金額 − これまでの返金）
  const [amt, setAmt] = useState(String(left > 0 ? left : tx.amount));
  // 二重押しで返金が2件にならないように（保存の完了を待つ間は押せない。o11 A06 点検 低-1）
  const lockRef = useRef(false);
  const [date, setDate] = useState(todayStr());
  const already = refundedTotal(data, tx.id);
  if (tx.countAs === "transfer") return already > 0 ? <p className="rounded-xl bg-surface-2 px-3 py-2 text-[12px] text-ink-2">全額が返金されています（{formatYen(already)}）。</p> : null;
  if (!open)
    return (
      <div className="rounded-xl bg-surface-2 px-3 py-2">
        {already > 0 && <p className="mb-1 text-[12px] text-ink-2">これまでの返金：{formatYen(already)}（この支出の額は、返金を引いたあとの額です）</p>}
        <Button variant="secondary" className="w-full" onClick={() => setOpen(true)}>
          返金があった
        </Button>
      </div>
    );
  const parsed = parseAmount(amt);
  const submit = async () => {
    if (lockRef.current) return;
    lockRef.current = true;
    try {
      await submitOnce();
    } finally {
      lockRef.current = false;
    }
  };
  const submitOnce = async () => {
    const n = parsed.ok ? parsed.value : NaN;
    const r = applyRefund(data, tx.id, n, date, newId("tx"), new Date().toISOString());
    if (!r.ok) return ui.toast(r.error, "error");
    const ts = new Date().toISOString();
    const rid = newId("tx");
    const res = await store.commit((d) => {
      const x = applyRefund(d, tx.id, n, date, rid, ts);
      return x.ok ? x.next : d;
    });
    ui.toast(res.ok ? "返金を記録しました" : res.error, res.ok ? "ok" : "error");
    if (res.ok) onDone();
  };
  return (
    <div className="space-y-2 rounded-xl border border-line px-3 py-3">
      <p className="text-[13px] font-semibold">返金の額（返金できる残り {formatYen(left)} まで）</p>
      <input inputMode="numeric" value={amt} onChange={(e) => setAmt(e.target.value)} className={inputCls} aria-label="返金の額" maxLength={14} />
      <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={inputCls} aria-label="返金のあった日" />
      <div className="space-y-0.5 text-[12px] text-ink-3">
        <p>一部の返金：この支出の額が、その分だけ減ります。</p>
        <p>全額の返金：この支出は、集計から外れます。</p>
        <p>返金の記録を消すと、支出の額が元に戻ります。</p>
      </div>
      <div className="flex gap-2">
        <Button variant="secondary" className="flex-1" onClick={() => setOpen(false)}>
          やめる
        </Button>
        <Button className="flex-1" onClick={submit}>
          返金を記録する
        </Button>
      </div>
    </div>
  );
}
