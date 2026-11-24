"use client";

import { Fragment, useMemo, useRef, useState } from "react";
import { useData, useStore } from "@/lib/store";
import { parseAmount, formatYen } from "@/lib/money";
import { applyRestore, backupFileName, buildBackup, countData, COUNT_LABELS, parseBackup, type RestorePreview } from "@/lib/backup";
import { emptyData } from "@/lib/defaults";
import { formatDateJa, todayStr } from "@/lib/date";
import { buildCalendarItems, CAL_FUTURE_DAYS, CAL_PAST_DAYS } from "@/lib/calendarExport";
import { buildIcs } from "@/lib/ics";
import { csvToIncoming, type CsvResult } from "@/lib/csvImport";
import type { HomePrefs, TxType } from "@/lib/types";
import { useUI } from "@/components/UIContext";
import { Button, Card, Field, PageHeader, SectionTitle, inputCls } from "@/components/ui";

const MAX_BACKUP_BYTES = 20 * 1024 * 1024;

export default function SettingsPage() {
  const data = useData();
  const store = useStore();
  const ui = useUI();

  // --- 予算 ---
  const [budget, setBudget] = useState(data.budget.monthly === null ? "" : String(data.budget.monthly));
  const [budgetErr, setBudgetErr] = useState<string | undefined>();
  const saveBudget = () => {
    if (budget.trim() === "") {
      const r = store.setBudget(null);
      return r.ok ? ui.toast("予算を未設定にしました") : ui.toast(r.error, "error");
    }
    const p = parseAmount(budget);
    if (!p.ok) return setBudgetErr(p.error);
    setBudgetErr(undefined);
    const r = store.setBudget(p.value);
    if (r.ok) ui.toast(`毎月の予算を${formatYen(p.value)}にしました`);
    else ui.toast(r.error, "error");
  };

  // --- ホーム表示 ---
  const toggles: { key: keyof HomePrefs; label: string }[] = [
    { key: "todaySpent", label: "今日の支出（今月の残り予算の横）" },
    { key: "nextRecurring", label: "次の固定費" },
    { key: "needsReview", label: "確認したいこと（支払日・試験日・更新日など）" },
  ];

  // --- カテゴリ ---
  const [catKind, setCatKind] = useState<TxType>("expense");
  const [catName, setCatName] = useState("");
  const [editingCatId, setEditingCatId] = useState<string | null>(null);
  const [editingCatName, setEditingCatName] = useState("");
  const saveCatName = () => {
    if (!editingCatId) return;
    const r = store.renameCategory(editingCatId, editingCatName);
    if (!r.ok) return ui.toast(r.error, "error");
    setEditingCatId(null);
    ui.toast("カテゴリ名を変更しました");
  };
  const addCat = () => {
    const name = catName.trim();
    if (!name) return ui.toast("カテゴリ名を入力してください", "error");
    if (data.categories.some((c) => c.kind === catKind && c.name === name && !c.archived)) return ui.toast("同じ名前のカテゴリがあります", "error");
    const r = store.addCategory({ name, kind: catKind });
    if (!r.ok) return ui.toast(r.error, "error");
    setCatName("");
    ui.toast(`カテゴリ「${name}」を追加しました`);
  };

  // --- バックアップ ---
  const exportBackup = () => {
    const now = new Date().toISOString();
    const b = buildBackup({ ...data, meta: { ...data.meta, lastBackupAt: now } }, now);
    const url = URL.createObjectURL(new Blob([JSON.stringify(b, null, 2)], { type: "application/json" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = backupFileName(now);
    a.click();
    // Safari はクリック直後に URL を無効にすると保存が始まらないことがあるため、少し待ってから片付ける
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
    const r = store.commit((d) => ({ ...d, meta: { ...d.meta, lastBackupAt: now } }));
    ui.toast(r.ok ? "バックアップの保存を始めました。ファイルが保存されたか確認してください" : `ファイルは書き出しましたが、書き出した日を記録できませんでした。${r.error}`, r.ok ? "ok" : "error");
  };

  // --- カレンダー用ファイル（.ics） ---
  const exportCalendar = () => {
    const today = todayStr();
    const items = buildCalendarItems(data, today);
    if (items.length === 0) return ui.toast("書き出す予定・固定費がありません", "error");
    const ics = buildIcs(buildCalendarItems(data, today), new Date().toISOString());
    const url = URL.createObjectURL(new Blob([ics], { type: "text/calendar;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `kurashi-base_calendar_${today.replaceAll("-", "")}.ics`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
    ui.toast(`${items.length}件をカレンダー用ファイルにしました。ファイルを開いて「すべてを追加」を押してください`);
  };

  // --- 家計簿の CSV の取り込み（追加だけ。同じ記録は二重に入れない） ---
  const csvRef = useRef<HTMLInputElement>(null);
  const [csv, setCsv] = useState<{ name: string; result: CsvResult } | null>(null);
  const csvPlan = useMemo(() => (csv?.result.ok ? applyRestore(data, csv.result.incoming, "merge") : null), [csv, data]);
  const onCsv = async (f: File | undefined) => {
    if (!f) return;
    if (f.size > 20 * 1024 * 1024) return ui.toast("ファイルが大きすぎます（20MB まで）", "error");
    const text = await f.text();
    setCsv({ name: f.name, result: csvToIncoming(text, data, new Date().toISOString()) });
  };
  const closeCsv = () => {
    setCsv(null);
    if (csvRef.current) csvRef.current.value = "";
  };
  const doCsv = async () => {
    if (!csv?.result.ok || !csvPlan?.ok) return;
    const ok = await ui.confirm({
      title: "CSV の記録を追加しますか？",
      body: `${csvPlan.added}件を追加します。すでにある記録はそのまま残ります。追加する前の状態は、設定の「直前の操作を取り消す」で戻せます。`,
      ok: "追加する",
    });
    if (!ok) return;
    const res = applyRestore(store.data ?? data, csv.result.incoming, "merge");
    if (!res.ok) return ui.toast(res.error, "error");
    const r = store.replaceAll(res.data, "家計簿の CSV から追加");
    if (!r.ok) return ui.toast(`${r.error}（今のデータは変更していません）`, "error");
    ui.toast(`${res.added}件を追加しました`);
    closeCsv();
  };

  // --- 復元（S09 プレビュー） ---
  const fileRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<RestorePreview | null>(null);
  const [restoreErr, setRestoreErr] = useState<string | null>(null);
  const [mode, setMode] = useState<"merge" | "replace">("merge");
  const onFile = async (f: File | undefined) => {
    setPreview(null);
    setRestoreErr(null);
    if (!f) return;
    if (f.size > MAX_BACKUP_BYTES) return setRestoreErr("ファイルが大きすぎます（20MBまで）");
    let text: string;
    try {
      text = await f.text();
    } catch {
      return setRestoreErr("ファイルを読み込めませんでした");
    }
    const r = parseBackup(text);
    if (!r.ok) return setRestoreErr(`${r.error}。今のデータは変更していません。`);
    setPreview(r.preview);
  };
  // 確定前に、合成した結果（何件入る・入らない）を計算して見せる。ここではまだ保存しない
  const plan = preview ? applyRestore(data, preview.data, mode) : null;

  const doRestore = async () => {
    if (!preview || !plan) return;
    if (!plan.ok) return ui.toast(plan.error, "error");
    const ok = await ui.confirm({
      title: mode === "replace" ? "すべての記録をバックアップの内容に置き換えますか？" : "バックアップの記録を追加しますか？",
      body:
        mode === "replace"
          ? "今のすべての記録と設定が、バックアップの内容に置き換わります。置き換える前の状態はこの端末に1つだけ控えるので、この画面の「直前の操作を取り消す」で戻せます。"
          : `${plan.added}件を追加します。すでにある記録はそのまま残ります。追加する前の状態は「直前の操作を取り消す」で戻せます。`,
      ok: mode === "replace" ? "置き換える" : "追加する",
      danger: mode === "replace",
    });
    if (!ok) return;
    // 確定の直前にもう一度、今のデータから計算し直す（確認中に別のタブで変わった場合に備える）
    const res = applyRestore(store.data ?? data, preview.data, mode);
    if (!res.ok) return ui.toast(res.error, "error");
    // 1回の保存で反映（失敗時は元のまま）。前の状態は控えておく
    const r = store.replaceAll(res.data, mode === "replace" ? "バックアップから置き換え" : "バックアップから追加");
    if (!r.ok) return ui.toast(`${r.error.replace("保存できませんでした", "復元できませんでした")}（今のデータは変更していません）`, "error");
    ui.toast(mode === "replace" ? "バックアップから復元しました" : `${res.added}件を追加しました`);
    setPreview(null);
    if (fileRef.current) fileRef.current.value = "";
  };

  // --- 直前の操作の取り消し ---
  // data が変わるたびに読み直す（復元・取り消しのあとに表示を更新するため）
  const undo = useMemo(() => (data ? store.undoInfo() : null), [data, store]);
  const doUndo = async () => {
    if (!undo) return;
    const ok = await ui.confirm({
      title: "直前の操作を取り消しますか？",
      body: `「${undo.reason}」（${new Date(undo.savedAt).toLocaleString("ja-JP")}）の前の状態に戻します。そのあとに追加・変更した記録は、戻した状態には含まれません（今の状態は控えるので、もう一度取り消せば戻せます）。`,
      ok: "取り消す",
    });
    if (!ok) return;
    const r = store.undoLast();
    ui.toast(r.ok ? "直前の操作を取り消しました" : r.error, r.ok ? "ok" : "error");
  };

  // --- 全削除 ---
  const wipe = async () => {
    const ok = await ui.confirm({
      title: "この端末の記録をすべて削除しますか？",
      body: `${Object.entries(countData(data))
        .filter(([k, n]) => k !== "categories" && n > 0)
        .map(([k, n]) => `${COUNT_LABELS[k as keyof typeof COUNT_LABELS]}${n}件`)
        .join("・") || "記録"}と設定を、この端末から削除します。「直前の操作を取り消す」の控えも消えるので、元に戻せません。
残しておきたい記録があれば、先に「バックアップを書き出す」でファイルに保存してください。`,
      ok: "すべて削除する",
      danger: true,
    });
    if (!ok) return;
    const r = store.wipeAll(emptyData());
    if (r.ok) ui.toast("この端末の記録をすべて削除しました");
    else ui.toast(r.error, "error");
  };

  return (
    <main className="space-y-4">
      <PageHeader title="設定" />

      <Card>
        <div id="budget" className="scroll-mt-20" />
        <SectionTitle>毎月の予算</SectionTitle>
        <p className="mb-3 text-[13px] text-ink-3">残り予算＝この予算−今月の支出。空欄なら未設定。</p>
        <div className="flex items-start gap-2">
          <div className="flex-1">
            <Field label="予算（円）" htmlFor="budget-input" error={budgetErr}>
              <input id="budget-input" inputMode="numeric" value={budget} onChange={(e) => setBudget(e.target.value)} placeholder="例：100000" className={`${inputCls} num`} aria-invalid={!!budgetErr} />
            </Field>
          </div>
          <Button onClick={saveBudget} className="mt-6">
            保存
          </Button>
        </div>
      </Card>

      <Card>
        <SectionTitle>ホームに表示する項目</SectionTitle>
        <p className="mb-2 text-[13px] text-ink-3">今月の残り予算（予算がなければ今月の支出）と今日の予定は、いつも表示します。下の3つは、オンにすると、内容があるときだけ表示します。</p>
        <ul className="divide-y divide-line">
          {toggles.map((t) => (
            <li key={t.key}>
              <label className="flex min-h-12 items-center justify-between">
                <span className="text-[15px]">{t.label}</span>
                <input
                  type="checkbox"
                  checked={data.prefs.home[t.key]}
                  onChange={(e) => {
                    const r = store.setHomePref(t.key, e.target.checked);
                    if (!r.ok) ui.toast(r.error, "error");
                  }}
                  className="size-5 accent-[var(--brand)]"
                />
              </label>
            </li>
          ))}
        </ul>
      </Card>


      <Card>
        <SectionTitle>カテゴリ</SectionTitle>
        <div className="mb-3 grid grid-cols-2 gap-1 rounded-xl bg-surface-2 p-1" role="radiogroup" aria-label="カテゴリの種別">
          {(["expense", "income"] as const).map((k) => (
            <button key={k} type="button" role="radio" aria-checked={catKind === k} onClick={() => { setCatKind(k); setEditingCatId(null); }} className={`min-h-10 rounded-lg text-[14px] font-semibold ${catKind === k ? "bg-surface shadow-sm" : "text-ink-2"}`}>
              {k === "expense" ? "支出" : "収入"}
            </button>
          ))}
        </div>
        <ul className="divide-y divide-line">
          {data.categories
            .filter((c) => c.kind === catKind)
            .map((c) => (
              <li key={c.id} className="flex min-h-12 items-center justify-between">
                {editingCatId === c.id ? (
                  <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2 py-2">
                    <input
                      aria-label="変更後のカテゴリ名"
                      className={`${inputCls} min-w-0 flex-1`}
                      maxLength={20}
                      value={editingCatName}
                      onChange={(e) => setEditingCatName(e.target.value)}
                      onKeyDown={(e) => {
                        // 日本語の変換を確定する Enter では保存しない（Safari は keyCode 229 で来る）
                        if (e.key === "Enter" && !e.nativeEvent.isComposing && e.keyCode !== 229) saveCatName();
                        if (e.key === "Escape") setEditingCatId(null);
                      }}
                    />
                    <button type="button" className="min-h-11 rounded-lg px-3 font-semibold text-brand" onClick={saveCatName}>
                      保存
                    </button>
                    <button type="button" className="min-h-11 rounded-lg px-3 text-ink-2" onClick={() => setEditingCatId(null)}>
                      やめる
                    </button>
                  </div>
                ) : (
                  <>
                    <span className={c.archived ? "text-ink-3 line-through" : ""}>{c.name}</span>
                    <div className="flex items-center gap-1">
                      {!c.archived && (
                        <button
                          type="button"
                          className="min-h-10 rounded-lg px-3 text-[13px] font-semibold text-ink-2 hover:bg-surface-2"
                          onClick={() => {
                            setEditingCatId(c.id);
                            setEditingCatName(c.name);
                          }}
                        >
                          名前を変える
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => {
                          const active = data.categories.filter((x) => x.kind === c.kind && !x.archived);
                          if (!c.archived && active.length <= 1) return ui.toast("最後のカテゴリは非表示にできません", "error");
                          if (c.archived && active.some((x) => x.name === c.name)) return ui.toast("同じ名前のカテゴリが表示中です。先にどちらかの名前を変えてください", "error");
                          const r = store.setCategoryArchived(c.id, !c.archived);
                          if (!r.ok) ui.toast(r.error, "error");
                        }}
                        className="min-h-10 rounded-lg px-3 text-[13px] font-semibold text-ink-2 hover:bg-surface-2"
                      >
                        {c.archived ? "再表示" : "非表示"}
                      </button>
                    </div>
                  </>
                )}
              </li>
            ))}
        </ul>
        <p className="mt-1 text-[12px] text-ink-3">名前を変えても、今までの取引はそのカテゴリのままです。非表示にしても、登録済みの取引は残ります。</p>
        <div className="mt-3 flex gap-2">
          <input value={catName} onChange={(e) => setCatName(e.target.value)} placeholder="新しいカテゴリ名" aria-label="新しいカテゴリ名" maxLength={20} className={inputCls} />
          <Button variant="secondary" onClick={addCat}>
            追加
          </Button>
        </div>
      </Card>

      <Card>
        <div id="calendar-file" className="scroll-mt-20" />
        <SectionTitle>iPhone のカレンダーに入れる</SectionTitle>
        <p className="text-[13px] text-ink-2">
          予定と固定費の支払日（{CAL_PAST_DAYS}日前〜{Math.round(CAL_FUTURE_DAYS / 30)}か月先）を、カレンダー用のファイルにします。iPhone でファイルを開いて「すべてを追加」を押すと、カレンダーに入ります。
        </p>
        <ul className="mt-1 mb-3 list-disc space-y-0.5 pl-5 text-[12px] text-ink-3">
          <li>予定のメモは入れません。固定費は名前と金額が入ります</li>
          <li>自動では直りません。予定を変えたら、もう一度書き出して入れてください（同じ予定が2つになったら、古いほうを消してください）</li>
          <li>入れる先のカレンダーは「くらしベース」など、新しく作ると、まとめて消せて便利です</li>
        </ul>
        <Button variant="secondary" onClick={exportCalendar}>
          カレンダー用ファイルを書き出す
        </Button>
      </Card>

      <Card>
        <div id="csv-import" className="scroll-mt-20" />
        <SectionTitle>家計簿の CSV を取り込む</SectionTitle>
        <p className="text-[13px] text-ink-2">
          ほかの家計簿アプリの記録を、表計算などで決まった形の CSV にして、今の記録に追加します。同じ記録は二重に入りません。
        </p>
        <p className="mt-1 mb-3 text-[12px] text-ink-3">
          決まった形：1行目が「日付,種類,金額,カテゴリ,内容,支払い方法,メモ,元ID」（支出・収入）か「名前,金額,周期,支払日,次の支払日,カテゴリ,支払い方法」（固定費）。保存するときの文字の形式は「UTF-8」にしてください。
        </p>
        <Button variant="secondary" onClick={() => csvRef.current?.click()}>
          CSV ファイルを選ぶ…
        </Button>
        <input ref={csvRef} type="file" accept=".csv,text/csv" className="hidden" onChange={(e) => onCsv(e.target.files?.[0])} aria-label="家計簿の CSV ファイルを選ぶ" />
        {csv && (
          <div className="mt-3 space-y-2 rounded-2xl border border-line p-3" aria-label="CSV の取り込みの確認">
            <p className="text-[13px] font-semibold break-all">{csv.name}</p>
            {!csv.result.ok ? (
              <p role="alert" className="rounded-xl bg-expense-soft px-3 py-2 text-[13px] font-medium text-danger">
                {csv.result.error}
              </p>
            ) : (
              <ul className="space-y-0.5 text-[13px]">
                <li>{csv.result.kind === "transactions" ? "支出・収入" : "固定費"}：{csv.result.rows}件{csv.result.from && `（${formatDateJa(csv.result.from, true)}〜${formatDateJa(csv.result.to ?? csv.result.from, true)}）`}</li>
                {csvPlan?.ok && (
                  <>
                    <li>
                      追加する記録：<strong className="num">{csvPlan.added}件</strong>
                    </li>
                    {csvPlan.duplicates > 0 && <li className="text-ink-2">すでにある記録：{csvPlan.duplicates}件（取り込みません）</li>}
                    {csvPlan.conflicts > 0 && <li className="text-warn">同じ記録なのに内容が違うもの：{csvPlan.conflicts}件（今の内容を残します）</li>}
                  </>
                )}
                {csvPlan?.ok && csvPlan.dependentSkipped > 0 && (
                  <li className="text-warn">カテゴリの内容が今と違うため取り込まない記録：{csvPlan.dependentSkipped}件</li>
                )}
                {csvPlan?.ok && csvPlan.added === 0 && <li className="text-ink-2">新しく追加する記録はありません（すでに入っています）</li>}
                {csvPlan && !csvPlan.ok && <li className="text-danger">{csvPlan.error}</li>}
                {csv.result.newCategories.length > 0 && <li className="text-ink-2">新しく作るカテゴリ：{csv.result.newCategories.join("・")}</li>}
              </ul>
            )}
            <div className="grid grid-cols-2 gap-2">
              <Button variant="secondary" onClick={closeCsv}>
                やめる
              </Button>
              <Button onClick={doCsv} disabled={!csv.result.ok || !csvPlan?.ok || csvPlan.added === 0}>
                追加する
              </Button>
            </div>
          </div>
        )}
      </Card>

      <Card>
        <div id="backup" className="scroll-mt-20" />
        <SectionTitle>バックアップと復元</SectionTitle>
        <p className="text-[13px] text-ink-2">
          記録は、この端末のブラウザの中だけに保存されています。ブラウザのデータを消すと記録も消えるので、週に1回ほどファイルに書き出してください。
        </p>
        <p className="mt-1 mb-3 text-[13px] font-semibold text-ink-2">
          {data.meta.lastBackupAt ? `前回の書き出し：${formatDateJa(data.meta.lastBackupAt.slice(0, 10), true)}` : "まだ書き出していません"}
        </p>
        <div className="grid gap-2">
          <Button onClick={exportBackup}>バックアップを書き出す</Button>
          <Button variant="secondary" onClick={() => fileRef.current?.click()}>
            バックアップから復元…
          </Button>
          <input ref={fileRef} type="file" accept="application/json,.json" className="hidden" onChange={(e) => onFile(e.target.files?.[0])} aria-label="バックアップファイルを選ぶ" />
        </div>
        {restoreErr && (
          <p role="alert" className="mt-3 rounded-xl bg-expense-soft px-3 py-2 text-[14px] font-medium text-danger">
            {restoreErr}
          </p>
        )}
        {preview && (
          <div className="mt-3 space-y-3 rounded-2xl border border-line bg-surface-2 p-3" aria-label="復元プレビュー">
            <h3 className="font-bold">復元の前に確認してください</h3>
            <dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-[14px]">
              <dt className="text-ink-2">書き出し日時</dt>
              <dd>{preview.exportedAt ? new Date(preview.exportedAt).toLocaleString("ja-JP") : "不明"}</dd>
              {(Object.keys(COUNT_LABELS) as (keyof typeof COUNT_LABELS)[])
                .filter((k) => k !== "categories" && (preview.counts[k] > 0 || ["transactions", "events"].includes(k)))
                .map((k) => (
                  <Fragment key={k}>
                    <dt className="text-ink-2">{COUNT_LABELS[k]}</dt>
                    <dd>{preview.counts[k]}件</dd>
                  </Fragment>
                ))}
              <dt className="text-ink-2">期間</dt>
              <dd>{preview.period ? `${preview.period.from} 〜 ${preview.period.to}` : "なし"}</dd>
            </dl>
            {preview.warnings.map((w) => (
              <p key={w} className="text-[13px] font-medium text-warn">
                ⚠ {w}
              </p>
            ))}
            <fieldset className="space-y-1">
              <legend className="text-[13px] font-semibold text-ink-2">復元方法を選ぶ</legend>
              <label className="flex min-h-11 items-center gap-2">
                <input type="radio" name="restore-mode" checked={mode === "merge"} onChange={() => setMode("merge")} className="size-5 accent-[var(--brand)]" />
                今のデータに追加する（同じデータは二重に入れない）
              </label>
              <label className="flex min-h-11 items-center gap-2">
                <input type="radio" name="restore-mode" checked={mode === "replace"} onChange={() => setMode("replace")} className="size-5 accent-[var(--brand)]" />
                今のデータをすべて置き換える
              </label>
            </fieldset>
            {plan && !plan.ok && (
              <p role="alert" className="rounded-xl bg-expense-soft px-3 py-2 text-[13px] font-medium text-danger">
                {plan.error}
              </p>
            )}
            {plan && plan.ok && mode === "merge" && (
              <ul className="space-y-0.5 rounded-xl bg-surface px-3 py-2 text-[13px]" aria-label="追加したときの結果">
                <li>
                  追加する記録：<strong className="num">{plan.added}件</strong>
                </li>
                {plan.duplicates > 0 && <li className="text-ink-2">すでに同じものがある記録：{plan.duplicates}件（取り込みません）</li>}
                {plan.conflicts > 0 && (
                  <li className="text-warn">同じ記録なのに内容が違うもの：{plan.conflicts}件（今の内容を残します）</li>
                )}
                {plan.dependentSkipped > 0 && (
                  <li className="text-warn">カテゴリや資格の内容が今と違うため取り込まない記録：{plan.dependentSkipped}件</li>
                )}
              </ul>
            )}
            {mode === "replace" && (
              <p role="alert" className="rounded-xl bg-expense-soft px-3 py-3 text-[14px] font-semibold text-danger">
                今の記録を消して、バックアップの内容に置き換えます。バックアップにない記録は残りません。
              </p>
            )}
            <div className="grid grid-cols-2 gap-2">
              <Button
                variant="secondary"
                onClick={() => {
                  setPreview(null);
                  if (fileRef.current) fileRef.current.value = "";
                }}
              >
                やめる
              </Button>
              <Button variant={mode === "replace" ? "danger" : "primary"} onClick={doRestore} disabled={!plan?.ok}>
                {mode === "replace" ? "今の記録を置き換える" : "復元する"}
              </Button>
            </div>
          </div>
        )}
        {undo && (
          <div className="mt-3 rounded-2xl border border-line p-3">
            <h3 className="text-[14px] font-bold">直前の操作を取り消す</h3>
            <p className="mt-1 text-[13px] text-ink-2">
              「{undo.reason}」（{new Date(undo.savedAt).toLocaleString("ja-JP")}）の前の状態に戻せます。
            </p>
            <Button variant="secondary" onClick={doUndo} className="mt-2 w-full">
              取り消して前の状態に戻す
            </Button>
          </div>
        )}
      </Card>

      <Card>
        <SectionTitle>データとプライバシー</SectionTitle>
        <ul className="mb-3 list-disc space-y-1 pl-5 text-[13px] text-ink-2">
          <li>記録は、この端末のブラウザの中にだけ保存します。外部のサーバーへは送りません。</li>
          <li>端末どうしの同期、アカウント、共有には対応していません。URLを友達に送っても記録は共有されません。</li>
          <li>ブラウザの履歴・Webサイトデータを消したときや、機種変更したときに、記録が消えることがあります。定期的にバックアップしてください。</li>
          <li>レシートの画像は保存しません。</li>
        </ul>
        <p className="mb-2 text-[13px] font-semibold text-danger">削除すると元に戻せません。残したい記録は先にバックアップしてください。</p>
        <Button variant="danger" onClick={wipe} className="w-full">
          この端末の記録をすべて削除
        </Button>
      </Card>

      <Card>
        <SectionTitle>このアプリについて</SectionTitle>
        <p className="text-[13px] text-ink-2">くらしベース（KURASHI BASE）β版（試用版）</p>
        <p className="mt-2 text-[13px] font-semibold text-ink-2">まだ対応していないこと</p>
        <ul className="mt-1 list-disc space-y-1 pl-5 text-[13px] text-ink-3">
          <li>レシートの文字の自動読み取り（OCR）— レシートの画像を見ながら手で入力します</li>
          <li>繰り返し予定の1回分だけの変更、振替・分割払いの記録</li>
          <li>通知、ホーム画面のウィジェット、iPhone のショートカット</li>
          <li>端末どうしの同期・共有・AI・ほかのサービスとのつながり（メニューの「準備中」に説明があります）</li>
        </ul>
      </Card>
    </main>
  );
}
