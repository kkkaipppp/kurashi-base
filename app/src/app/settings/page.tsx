"use client";

import { Fragment, useMemo, useRef, useState } from "react";
import { useData, useStore } from "@/lib/store";
import { parseAmount, formatYen } from "@/lib/money";
import { applyRestore, backupFileName, buildBackup, countData, COUNT_LABELS, parseBackup, type RestorePreview } from "@/lib/backup";
import { emptyData } from "@/lib/defaults";
import { formatDateJa } from "@/lib/date";
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
      ok: "すべて削除",
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
        <p className="mb-2 text-[13px] text-ink-3">下の項目は、内容があるときだけ表示します。</p>
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
            <button key={k} type="button" role="radio" aria-checked={catKind === k} onClick={() => setCatKind(k)} className={`min-h-10 rounded-lg text-[14px] font-semibold ${catKind === k ? "bg-surface shadow-sm" : "text-ink-2"}`}>
              {k === "expense" ? "支出" : "収入"}
            </button>
          ))}
        </div>
        <ul className="divide-y divide-line">
          {data.categories
            .filter((c) => c.kind === catKind)
            .map((c) => (
              <li key={c.id} className="flex min-h-12 items-center justify-between">
                <span className={c.archived ? "text-ink-3 line-through" : ""}>{c.name}</span>
                <button
                  type="button"
                  onClick={() => {
                    const active = data.categories.filter((x) => x.kind === c.kind && !x.archived);
                    if (!c.archived && active.length <= 1) return ui.toast("最後のカテゴリは非表示にできません", "error");
                    const r = store.setCategoryArchived(c.id, !c.archived);
                    if (!r.ok) ui.toast(r.error, "error");
                  }}
                  className="min-h-10 rounded-lg px-3 text-[13px] font-semibold text-ink-2 hover:bg-surface-2"
                >
                  {c.archived ? "再表示" : "非表示"}
                </button>
              </li>
            ))}
        </ul>
        <p className="mt-1 text-[12px] text-ink-3">非表示にしても、登録済みの取引のカテゴリはそのまま残ります。</p>
        <div className="mt-3 flex gap-2">
          <input value={catName} onChange={(e) => setCatName(e.target.value)} placeholder="新しいカテゴリ名" aria-label="新しいカテゴリ名" maxLength={20} className={inputCls} />
          <Button variant="secondary" onClick={addCat}>
            追加
          </Button>
        </div>
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
                復元する
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
