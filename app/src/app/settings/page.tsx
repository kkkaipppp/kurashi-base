"use client";

import { Fragment, useMemo, useRef, useState } from "react";
import { useData, useStore } from "@/lib/store";
import { parseAmount, formatYen } from "@/lib/money";
import { applyRestore, backupFileName, backupSizeNotice, buildBackup, countData, COUNT_LABELS, MAX_BACKUP_BYTES, parseBackup, type RestorePreview } from "@/lib/backup";
import { emptyData } from "@/lib/defaults";
import { formatDateJa, todayStr } from "@/lib/date";
import { buildCalendarItems, CAL_FUTURE_DAYS, CAL_PAST_DAYS } from "@/lib/calendarExport";
import { buildIcs } from "@/lib/ics";
import { csvToIncoming, type CsvResult } from "@/lib/csvImport";
import { newBatchId, recordBatch, stampBatch } from "@/lib/importBatch";
import { genericToIncoming, parseTable, suggestConfig, type GenericConfig, type Table } from "@/lib/csvGeneric";
import { FEATURES, IS_PERSONAL } from "@/lib/edition";
import dynamic from "next/dynamic";
import { figures, sampleRows, similarButDifferentId, type DataFigures } from "@/lib/restoreView";
import type { HomeToggle, TxType } from "@/lib/types";
import { useUI } from "@/components/UIContext";
import { Button, Card, Field, PageHeader, SectionTitle, inputCls } from "@/components/ui";
import { STORAGE_TEXT, useIsNativeApp } from "@/lib/platform";
import { NativeStatusCard } from "@/components/NativeStatusCard";

// 設定を目的ごとのまとまりに分ける見出し（100点化の指示 C。自分用だけ。公開版は友人β中なので今のまま）
const GROUPS = IS_PERSONAL;
// カテゴリの数え方・まとめる（自分用だけ。公開版では読み込まない）
// 組み立てのときに決まる値を、このファイルの中で直接比べる（別ファイルの定数だと、公開版のビルドから自分用の部品の塊が取り除かれない）
const PERSONAL_BUILD = process.env.NEXT_PUBLIC_KB_EDITION === "personal";
// 決まった形ではない CSV の列の対応づけ（自分用だけ。NEXT v21 CSV:C03）
// カレンダーのファイル（.ics）から予定を取り込む（自分用。Q31＝①）
// 2026-11-25 から公開版（友達用）にも出す（FEATURE_EDITIONS.icsImport）
const IcsImportCard = FEATURES.icsImport ? dynamic(() => import("@/components/IcsImportCard").then((m) => m.IcsImportCard)) : null;
const CsvGenericPanel = PERSONAL_BUILD ? dynamic(() => import("@/components/CsvGenericPanel").then((m) => m.CsvGenericPanel)) : null;
const MenuVisibilityCard = PERSONAL_BUILD ? dynamic(() => import("@/components/MenuVisibilityCard").then((m) => m.MenuVisibilityCard)) : null;
// 下のメニュー・追加のよく使う種類・起動時の画面（o31 F001・F002・D006。自分用だけ）
const NavSettingsCard = PERSONAL_BUILD ? dynamic(() => import("@/components/NavSettingsCard").then((m) => m.NavSettingsCard)) : null;
const StartScreenCard = PERSONAL_BUILD ? dynamic(() => import("@/components/StartScreenCard").then((m) => m.StartScreenCard)) : null;
const ImportHistoryCard = PERSONAL_BUILD ? dynamic(() => import("@/components/ImportHistoryCard").then((m) => m.ImportHistoryCard)) : null;
const DataHealthCard = PERSONAL_BUILD ? dynamic(() => import("@/components/DataHealthCard").then((m) => m.DataHealthCard)) : null;
const DiagnosticsCard = PERSONAL_BUILD ? dynamic(() => import("@/components/DiagnosticsCard").then((m) => m.DiagnosticsCard)) : null;
const CategoryTools = PERSONAL_BUILD ? dynamic(() => import("@/components/CategoryTools").then((m) => m.CategoryTools)) : null;
/** 自分用の設定の6つの区切り（o31 01）。中身は今ある設定をそのまま使う（設定を消さない・増やさない） */
const SETTING_GROUPS: [string, string, string][] = [
  ["set-general", "一般", "起動時の画面"],
  ["set-display", "表示", "下のメニュー・メニューに出す機能・ホーム"],
  ["set-money", "家計簿", "予算・カテゴリ"],
  ["set-connect", "外部連携", "カレンダー・CSV の取り込み"],
  ["set-data", "データ管理", "バックアップ・復元・取り込みの履歴・点検・削除"],
  ["set-about", "アプリ情報", "このアプリについて"],
];

function GroupLabel({ id, children }: { id: string; children: string }) {
  if (!GROUPS) return null;
  return (
    // 区切りは見出しにする（読み上げで区切りへ飛べるように。磨き込み 2026-11-26）
    <h2 id={id} className="scroll-mt-20 px-1 pt-2 text-[12px] font-bold tracking-wide text-ink-3">
      {children}
    </h2>
  );
}

export default function SettingsPage() {
  const nativeApp = useIsNativeApp();
  const data = useData();
  const store = useStore();
  const ui = useUI();

  // --- 予算 ---
  const [budget, setBudget] = useState(data.budget.monthly === null ? "" : String(data.budget.monthly));
  const [budgetErr, setBudgetErr] = useState<string | undefined>();
  const saveBudget = async () => {
    if (budget.trim() === "") {
      const r = await store.setBudget(null);
      return r.ok ? ui.toast("予算を未設定にしました") : ui.toast(r.error, "error");
    }
    const p = parseAmount(budget);
    if (!p.ok) return setBudgetErr(p.error);
    setBudgetErr(undefined);
    const r = await store.setBudget(p.value);
    if (r.ok) ui.toast(`毎月の予算を${formatYen(p.value)}にしました`);
    else ui.toast(r.error, "error");
  };

  // --- ホーム表示 ---
  // 自分用のホームは「次の固定費」「確認したいこと」をいつも出し、並びと表示はホームの「編集」で決める（ここの切り替えは効かないので出さない。磨き込み 2026-11-26）
  const toggles: { key: HomeToggle; label: string }[] = PERSONAL_BUILD
    ? [{ key: "todaySpent", label: "今日の支出（予算の残りの横）" }]
    : [
        { key: "todaySpent", label: "今日の支出（予算の残りの横）" },
        { key: "nextRecurring", label: "次の固定費" },
        { key: "needsReview", label: "確認したいこと（支払日・試験日・更新日など）" },
      ];

  // --- カテゴリ ---
  const [catKind, setCatKind] = useState<TxType>("expense");
  const [catName, setCatName] = useState("");
  const [editingCatId, setEditingCatId] = useState<string | null>(null);
  const [editingCatName, setEditingCatName] = useState("");
  const saveCatName = async () => {
    if (!editingCatId) return;
    const r = await store.renameCategory(editingCatId, editingCatName);
    if (!r.ok) return ui.toast(r.error, "error");
    setEditingCatId(null);
    ui.toast("カテゴリ名を変更しました");
  };
  const addCat = async () => {
    const name = catName.trim();
    if (!name) return ui.toast("カテゴリ名を入力してください", "error");
    if (data.categories.some((c) => c.kind === catKind && c.name === name && !c.archived)) return ui.toast("同じ名前のカテゴリがあります", "error");
    const r = await store.addCategory({ name, kind: catKind });
    if (!r.ok) return ui.toast(r.error, "error");
    setCatName("");
    ui.toast(`カテゴリ「${name}」を追加しました`);
  };

  // --- バックアップ ---
  const exportBackup = async () => {
    const now = new Date().toISOString();
    const b = buildBackup({ ...data, meta: { ...data.meta, lastBackupAt: now } }, now);
    const blob = new Blob([JSON.stringify(b, null, 2)], { type: "application/json" });
    const sizeNotice = backupSizeNotice(blob.size); // 戻せる大きさに近い・超えるときは知らせる（ADR-002）
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = backupFileName(now);
    a.click();
    // Safari はクリック直後に URL を無効にすると保存が始まらないことがあるため、少し待ってから片付ける
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
    const r = await store.commit((d) => ({ ...d, meta: { ...d.meta, lastBackupAt: now } }));
    ui.toast(r.ok ? "バックアップの保存を始めました。ファイルが保存されたか確認してください" : `ファイルは書き出しましたが、書き出した日を記録できませんでした。${r.error}`, r.ok ? "ok" : "error");
    if (sizeNotice) ui.toast(sizeNotice, "error");
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
  const [csvStd, setCsv] = useState<{ name: string; result: CsvResult } | null>(null);
  // 決まった形ではない CSV：列の対応づけの状態
  const [gen, setGen] = useState<{ name: string; table: Table; cfg: GenericConfig; encoding: string } | null>(null);
  const genResult = useMemo(() => (gen ? genericToIncoming(gen.table, gen.cfg, data, new Date().toISOString()) : null), [gen, data]);
  const csv = useMemo<{ name: string; result: CsvResult } | null>(() => (gen && genResult ? { name: gen.name, result: genResult } : csvStd), [gen, genResult, csvStd]);
  const csvSimilar = useMemo(() => (csv?.result.ok && csv.result.kind === "transactions" ? similarButDifferentId(data.transactions, csv.result.incoming.transactions) : 0), [csv, data.transactions]);
  const csvPlan = useMemo(() => (csv?.result.ok ? applyRestore(data, csv.result.incoming, "merge") : null), [csv, data]);
  const onCsv = async (f: File | undefined) => {
    if (!f) return;
    if (f.size > 20 * 1024 * 1024) return ui.toast("ファイルが大きすぎます（20MB まで）", "error");
    // 文字コード：UTF-8 のあと Shift_JIS（銀行・カードの CSV に多い）
    const buf = await f.arrayBuffer();
    let text: string;
    let encoding = "UTF-8";
    try {
      text = new TextDecoder("utf-8", { fatal: true }).decode(buf);
    } catch {
      try {
        text = new TextDecoder("shift_jis").decode(buf);
        encoding = "Shift_JIS";
      } catch {
        return ui.toast("この文字の形式は読めません。UTF-8 か Shift_JIS で保存し直してください", "error");
      }
    }
    const std = csvToIncoming(text, data, new Date().toISOString());
    setGen(null);
    // 決まった形ではない CSV は、自分用では列の対応づけへ（公開版は今までどおり、見出しが違うと案内する）
    if (!std.ok && std.error.startsWith("1行目の見出しが違います") && CsvGenericPanel) {
      const t = parseTable(text);
      if (t.ok) return void (setCsv(null), setGen({ name: f.name, table: t.table, cfg: suggestConfig(t.table), encoding }));
      return setCsv({ name: f.name, result: { ok: false, error: t.error } });
    }
    setCsv({ name: f.name, result: std });
  };
  const closeCsv = () => {
    setCsv(null);
    setGen(null);
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
    // 自分用は、この取り込みで足した記録に取り込みの ID を付け、履歴に残す（あとで取り消せる。NEXT v21 CSV:C08）
    const batchId = newBatchId(new Date().toISOString());
    const incoming = IS_PERSONAL && csv.result.kind === "transactions" ? { ...csv.result.incoming, transactions: stampBatch(csv.result.incoming.transactions, batchId) } : csv.result.incoming;
    // 作るときに使ったデータ（base）を保存に渡す（o11 A06 点検 中-1）
    const base = store.data ?? data;
    const res = applyRestore(base, incoming, "merge");
    if (!res.ok) return ui.toast(res.error, "error");
    let next = res.data;
    if (IS_PERSONAL && csv.result.kind === "transactions") {
      const rec = recordBatch(res.data, { id: batchId, at: new Date().toISOString(), source: csv.name, from: csv.result.from, to: csv.result.to });
      // 足した記録が0件の取り込みは、履歴に残さない（取り消すものがないため）
      if (rec.added > 0) next = rec.data;
    }
    const r = await store.replaceAll(next, "家計簿の CSV から追加", base);
    if (!r.ok) return ui.toast(`${r.error}（今のデータは変更していません）`, "error");
    ui.toast(`${res.added}件を追加しました`);
    closeCsv();
  };

  // --- 復元（S09 プレビュー） ---
  const fileRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<RestorePreview | null>(null);
  const [restoreErr, setRestoreErr] = useState<string | null>(null);
  // 復元方法は、ファイルを選ぶたびに「まだ選んでいない」に戻す（置き換えのつもりで追加してしまうのを防ぐ。レビュー o1 の P01）
  const [mode, setMode] = useState<"merge" | "replace" | null>(null);
  const onFile = async (f: File | undefined) => {
    setPreview(null);
    setRestoreErr(null);
    setMode(null);
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
  const plan = preview && mode ? applyRestore(data, preview.data, mode) : null;
  const nowFig = figures(data);
  const afterFig: DataFigures | null = plan?.ok ? figures(plan.data) : null;
  const similar = preview && mode === "merge" ? similarButDifferentId(data.transactions, preview.data.transactions) : 0;

  const doRestore = async () => {
    if (!preview || !plan || !mode) return;
    if (!plan.ok) return ui.toast(plan.error, "error");
    const ok = await ui.confirm({
      title: mode === "replace" ? "すべての記録をバックアップの内容に置き換えますか？" : "バックアップの記録を追加しますか？",
      body:
        mode === "replace"
          ? "今のすべての記録と設定が、バックアップの内容に置き換わります。置き換える前の状態はこの端末に1つだけ控えるので、この画面の「直前の操作を取り消す」で戻せます。"
          : `${plan.added}件を追加します。すでにある記録はそのまま残ります。${similar > 0 ? `日付・金額が同じ記録が${similar}件あり、二重になるかもしれません。` : ""}追加する前の状態は「直前の操作を取り消す」で戻せます。`,
      ok: mode === "replace" ? "すべて置き換える" : `${plan.added}件を追加`,
      danger: mode === "replace",
    });
    if (!ok) return;
    // 確定の直前にもう一度、今のデータから計算し直す（確認中に別のタブで変わった場合に備える）
    // 作るときに使ったデータ（base）を保存に渡す。確認中にほかのタブ・ほかの保存で変わっていたら、保存しない（o11 A06 点検 中-1）
    const base = store.data ?? data;
    const res = applyRestore(base, preview.data, mode);
    if (!res.ok) return ui.toast(res.error, "error");
    // 1回の保存で反映（失敗時は元のまま）。前の状態は控えておく
    const r = await store.replaceAll(res.data, mode === "replace" ? "バックアップから置き換え" : "バックアップから追加", base);
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
    const r = await store.undoLast();
    ui.toast(r.ok ? "直前の操作を取り消しました" : r.error, r.ok ? "ok" : "error");
  };

  // --- 全削除 ---
  // すべて削除は、「削除」と打ち込んでから（レビュー o1 の P04。取り消しの控えも消えるため）
  const [wipeWord, setWipeWord] = useState("");
  const wipe = async () => {
    if (wipeWord.trim() !== "削除") return ui.toast("確認のため「削除」と入力してください", "error");
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
    const r = await store.wipeAll(emptyData());
    setWipeWord("");
    if (r.ok) ui.toast("この端末の記録をすべて削除しました");
    else ui.toast(r.error, "error");
  };

  // 設定の区切り（o31 01・o30 D009：自分用は 一般・表示・家計簿・外部連携・データ管理・アプリ情報 の6つ。公開版は今までの並び）
  const blkBudget = (
    <>
      <Card>
        <div id="budget" className="scroll-mt-20" />
        <SectionTitle>毎月の予算</SectionTitle>
        <p className="mb-3 text-[13px] text-ink-3">{PERSONAL_BUILD ? "予算の残り＝この予算−今月の生活費（投資を除く）。空欄なら未設定。" : "予算の残り＝この予算−今月の支出。空欄なら未設定。"}</p>
        <div className="flex items-start gap-2">
          <div className="flex-1">
            <Field label="予算（円）" htmlFor="budget-input" error={budgetErr}>
              <input id="budget-input" inputMode="numeric" value={budget} onChange={(e) => setBudget(e.target.value)} placeholder="例：100000" className={`${inputCls} num`} aria-invalid={!!budgetErr} />
            </Field>
          </div>
          <Button onClick={saveBudget} className="mt-6">
            保存する
          </Button>
        </div>
      </Card>

    </>
  );
  const blkHome = (
    <>
      <Card>
        <SectionTitle>ホームに表示する項目</SectionTitle>
        <p className="mb-2 text-[13px] text-ink-3">
          {PERSONAL_BUILD
            ? "今月の予算の残りと今日の予定・次の固定費・確認したいことは、いつも表示します。カードの並びと表示は、ホームの「編集」で変えられます。"
            : "今月の予算の残り（予算がなければ今月の支出）と今日の予定は、いつも表示します。下の3つは、オンにすると、内容があるときだけ表示します。"}
        </p>
        <ul className="divide-y divide-line">
          {toggles.map((t) => (
            <li key={t.key}>
              <label className="flex min-h-12 items-center justify-between">
                <span className="text-[15px]">{t.label}</span>
                <input
                  type="checkbox"
                  checked={data.prefs.home[t.key]}
                  onChange={async (e) => {
                    const r = await store.setHomePref(t.key, e.target.checked);
                    if (!r.ok) ui.toast(r.error, "error");
                  }}
                  className="size-5 accent-[var(--brand)]"
                />
              </label>
            </li>
          ))}
        </ul>
      </Card>


    </>
  );
  const blkCategories = (
    <>
      <Card>
        <div id="categories" className="scroll-mt-20" />
        <SectionTitle>カテゴリ</SectionTitle>
        <div className="mb-3 grid grid-cols-2 gap-1 rounded-xl bg-surface-2 p-1" role="radiogroup" aria-label="カテゴリの種類">
          {(["expense", "income"] as const).map((k) => (
            <button key={k} type="button" role="radio" aria-checked={catKind === k} onClick={() => { setCatKind(k); setEditingCatId(null); }} className={`min-h-11 rounded-lg text-[14px] font-semibold ${catKind === k ? "bg-surface shadow-sm" : "text-ink-2"}`}>
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
                          className="min-h-11 rounded-lg px-3 text-[13px] font-semibold text-ink-2 hover:bg-surface-2"
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
                        onClick={async () => {
                          const active = data.categories.filter((x) => x.kind === c.kind && !x.archived);
                          if (!c.archived && active.length <= 1) return ui.toast("最後のカテゴリは非表示にできません", "error");
                          if (c.archived && active.some((x) => x.name === c.name)) return ui.toast("同じ名前のカテゴリが表示中です。先にどちらかの名前を変えてください", "error");
                          const r = await store.setCategoryArchived(c.id, !c.archived);
                          if (!r.ok) ui.toast(r.error, "error");
                        }}
                        className="min-h-11 rounded-lg px-3 text-[13px] font-semibold text-ink-2 hover:bg-surface-2"
                      >
                        {c.archived ? "再表示" : "非表示"}
                      </button>
                    </div>
                  </>
                )}
              </li>
            ))}
        </ul>
        <p className="mt-1 text-[12px] text-ink-3">名前を変えても、今までの記録はそのカテゴリのままです。非表示にしても、記録は残ります。</p>
        {CategoryTools && <CategoryTools kind={catKind} />}
        <div className="mt-3 flex gap-2">
          <input value={catName} onChange={(e) => setCatName(e.target.value)} placeholder="新しいカテゴリ名" aria-label="新しいカテゴリ名" maxLength={20} className={inputCls} />
          <Button variant="secondary" onClick={addCat}>
            追加
          </Button>
        </div>
      </Card>

    </>
  );
  const blkConnect = (
    <>

      {FEATURES.calendarFile && (
        <Card>
          <div id="calendar-file" className="scroll-mt-20" />
          <SectionTitle>iPhone のカレンダーに入れる</SectionTitle>
          <p className="text-[13px] text-ink-2">
            予定と固定費の支払日（{CAL_PAST_DAYS}日前〜{Math.round(CAL_FUTURE_DAYS / 30)}か月先）を、カレンダー用のファイルにします。iPhone でファイルを開いて「すべてを追加」を押すと、カレンダーに入ります。
          </p>
          <ul className="mt-1 mb-3 list-disc space-y-0.5 pl-5 text-[12px] text-ink-3">
            <li>予定のメモは入れません。固定費は名前と金額が入ります</li>
            <li>自動では直りません。予定を変えたら、もう一度書き出して入れてください（同じ予定が2つになったら、古いほうを消してください）</li>
            <li>入れる先は「くらしベース」など新しいカレンダーにすると、あとでまとめて消せます</li>
            <li>時刻つきの予定は、ファイルを書き出した端末の時刻のままで入ります（時差のある国へ行くときは、行った先で見直してください）</li>
          </ul>
          <Button variant="secondary" onClick={exportCalendar}>
            予定をカレンダー用ファイルに書き出す（.ics）
          </Button>
          {IcsImportCard && (
            <div className="mt-3">
              <IcsImportCard />
            </div>
          )}
        </Card>
      )}

      {FEATURES.csvImport && (
        <Card>
          <div id="csv-import" className="scroll-mt-20" />
          <SectionTitle>家計簿の CSV を取り込む</SectionTitle>
          <p className="text-[13px] text-ink-2">
            ほかの家計簿アプリの記録を、表計算などで決まった形の CSV にして、今の記録に追加します。同じ記録は二重に入りません。
          </p>
          <p className="mt-1 mb-3 text-[12px] text-ink-3">
            決まった形：1行目が「日付,種類,金額,カテゴリ,内容,支払い方法,メモ,元ID」（支出・収入）か「名前,金額,周期,支払日,次の支払日,カテゴリ,支払い方法」（固定費）。文字の形式は「UTF-8」と「Shift_JIS」（銀行・カードの CSV に多い形式）のどちらでも読めます。
          </p>
          <Button variant="secondary" onClick={() => csvRef.current?.click()}>
            CSV ファイルを選ぶ…
          </Button>
          <input ref={csvRef} type="file" accept=".csv,text/csv" className="hidden" onChange={(e) => onCsv(e.target.files?.[0])} aria-label="家計簿の CSV ファイルを選ぶ" />
          {csv && (
            <div className="mt-3 space-y-2 rounded-2xl border border-line p-3" aria-label="CSV の取り込みの確認">
              <p className="text-[13px] font-semibold break-all">{csv.name}</p>
              {gen && CsvGenericPanel && <CsvGenericPanel table={gen.table} cfg={gen.cfg} encoding={gen.encoding} onChange={(cfg) => setGen({ ...gen, cfg })} />}
              {!csv.result.ok ? (
                <p role="alert" className="rounded-xl bg-expense-soft px-3 py-2 text-[13px] font-medium whitespace-pre-line text-danger">
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
                  {csv.result.kind === "transactions" && (
                  <li className="num text-ink-2">
                    CSV の合計：支出 {formatYen(csv.result.incoming.transactions.filter((t) => t.type === "expense").reduce((a, t) => a + t.amount, 0))}・収入{" "}
                    {formatYen(csv.result.incoming.transactions.filter((t) => t.type === "income").reduce((a, t) => a + t.amount, 0))}
                  </li>
                )}
                {csv.result.kind === "transactions" && csv.result.incoming.transactions.length > 0 && (
                  <li>
                    <span className="text-ink-2">例（新しい5件）：</span>
                    <ul className="num mt-0.5 space-y-0.5 pl-3 text-[12px] text-ink-2">
                      {sampleRows(csv.result.incoming.transactions).map((t) => (
                        <li key={t.id}>
                          {t.date} {t.type === "expense" ? "支出" : "収入"} {formatYen(t.amount)} {t.merchant}
                        </li>
                      ))}
                    </ul>
                  </li>
                )}
                {csvPlan?.ok && csvPlan.dependentSkipped > 0 && (
                    <li className="text-warn">カテゴリの内容が今と違うため取り込まない記録：{csvPlan.dependentSkipped}件</li>
                  )}
                  {csvPlan?.ok && csvPlan.added === 0 && <li className="text-ink-2">新しく追加する記録はありません（すでに入っています）</li>}
                  {csvPlan && !csvPlan.ok && <li className="text-danger">{csvPlan.error}</li>}
                  {csv.result.newCategories.length > 0 && <li className="text-ink-2">新しく作るカテゴリ：{csv.result.newCategories.join("・")}</li>}
                  {/* 取り込まない行（振替・計算対象外・0円など）と、分類が分からなかったもの（黙って捨てない。NEXT v21 CSV:C04・C06・C07） */}
                  {(() => {
                    const x = csv.result as { held?: { line: number; reason: string }[]; unknownCategories?: { name: string; count: number }[] };
                    return (
                      <>
                        {x.held && x.held.length > 0 && (
                          <li className="text-ink-2">
                            取り込まない行：{x.held.length}行
                            <ul className="mt-0.5 space-y-0.5 pl-3 text-[12px]">
                              {x.held.slice(0, 3).map((h) => (
                                <li key={h.line}>
                                  {h.line}行目：{h.reason}
                                </li>
                              ))}
                              {x.held.length > 3 && <li>ほか{x.held.length - 3}行</li>}
                            </ul>
                          </li>
                        )}
                        {x.unknownCategories && x.unknownCategories.length > 0 && (
                          <li className="text-warn">
                            今のカテゴリにないので「その他」にします：{x.unknownCategories.slice(0, 5).map((c) => `${c.name}（${c.count}件）`).join("・")}
                            {x.unknownCategories.length > 5 ? ` ほか${x.unknownCategories.length - 5}種類` : ""}
                          </li>
                        )}
                      </>
                    );
                  })()}
                  {/* ID が違うのに日付・種類・金額が同じ記録（二重かもしれない）。自動では消さず、数を見せる（NEXT v21 CSV:C03） */}
                  {csv.result.kind === "transactions" && csvSimilar > 0 && (
                    <li className="text-warn">
                      今の記録に、日付・種類・金額が同じで別の記録が{csvSimilar}件あります。同じ明細なら、取り込む前に「やめる」を選んでください（別の記録として追加します）。
                    </li>
                  )}
                  {/* 足さなかった固定費と理由（黙って除かない。NEXT v21 CSV:C05） */}
                  {csv.result.skipped.length > 0 && (
                    <li className="text-ink-2">
                      足さない固定費：{csv.result.skipped.length}件
                      <ul className="mt-0.5 space-y-0.5 pl-3 text-[12px]">
                        {csv.result.skipped.slice(0, 5).map((x, i) => (
                          <li key={`${x.name}-${i}`}>
                            {x.name}（{x.reason}）
                          </li>
                        ))}
                        {csv.result.skipped.length > 5 && <li>ほか{csv.result.skipped.length - 5}件</li>}
                      </ul>
                    </li>
                  )}
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
      )}

      <NativeStatusCard />

    </>
  );
  const blkData = (
    <>
      <Card>
        <div id="backup" className="scroll-mt-20" />
        <SectionTitle>バックアップと復元</SectionTitle>
        <p className="text-[13px] text-ink-2">
          {STORAGE_TEXT[nativeApp ? "app" : "web"].backup}
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
            <fieldset className="space-y-2">
              <legend className="mb-1 text-[13px] font-semibold text-ink-2">復元の方法（選ぶまで復元しません）</legend>
              {(
                [
                  ["merge", "記録を追加する", "今の記録は残したまま、バックアップにしかない記録を足します。同じ記録は二重に入れません。"],
                  ["replace", "バックアップの状態に戻す", "今の記録と設定を消して、バックアップの中身だけにします。バックアップにない記録は消えます。"],
                ] as const
              ).map(([m, title, desc]) => (
                <label
                  key={m}
                  className={`flex cursor-pointer gap-3 rounded-xl border p-3 ${mode === m ? (m === "replace" ? "border-danger bg-expense-soft" : "border-brand bg-brand-soft") : "border-line bg-surface"}`}
                >
                  <input type="radio" name="restore-mode" checked={mode === m} onChange={() => setMode(m)} className="mt-0.5 size-5 shrink-0 accent-[var(--brand)]" />
                  <span>
                    <span className="block text-[15px] font-bold">{title}</span>
                    <span className="block text-[12px] text-ink-2">{desc}</span>
                  </span>
                </label>
              ))}
            </fieldset>
            {afterFig && (
              <table className="num w-full rounded-xl bg-surface text-[13px]" aria-label="今と、実行したあとの件数">
                <thead>
                  <tr className="text-ink-3">
                    <th className="px-2 py-1 text-left font-semibold"> </th>
                    <th className="px-2 py-1 text-right font-semibold">今</th>
                    <th className="px-2 py-1 text-right font-semibold">実行したあと</th>
                  </tr>
                </thead>
                <tbody>
                  {(
                    [
                      ["支出・収入", nowFig.transactions, afterFig.transactions, "件"],
                      ["予定", nowFig.events, afterFig.events, "件"],
                      ["NISA", nowFig.nisa, afterFig.nisa, "件"],
                      ["支出の合計", nowFig.expense, afterFig.expense, "円"],
                      ["収入の合計", nowFig.income, afterFig.income, "円"],
                    ] as const
                  ).map(([label, a, b, unit]) => (
                    <tr key={label} className={b < a ? "text-danger" : ""}>
                      <td className="px-2 py-0.5">{label}</td>
                      <td className="px-2 py-0.5 text-right">{unit === "円" ? formatYen(a) : `${a}件`}</td>
                      <td className="px-2 py-0.5 text-right font-semibold">{unit === "円" ? formatYen(b) : `${b}件`}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            {mode === "merge" && similar > 0 && (
              <p role="alert" className="rounded-xl bg-warn-soft px-3 py-2 text-[13px] font-medium text-warn">
                日付・種類・金額が今の記録と同じものが{similar}件あります。別の家計簿から入れた同じ明細だと、二重になります。前に入れた記録をまとめて入れ替えたいときは「バックアップの状態に戻す」を選べますが、バックアップより後に入れた記録は消えます（「直前の操作を取り消す」で戻せます）。
              </p>
            )}
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
              <Button variant={mode === "replace" ? "danger" : "primary"} onClick={doRestore} disabled={!mode || !plan?.ok}>
                {mode === "replace" ? "すべて置き換える" : mode === "merge" && plan?.ok ? `${plan.added}件を追加` : "方法を選んでください"}
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
            <p className="mt-1 text-[12px] font-semibold text-warn">取り消すと、そのあとに入れた記録も消えます。</p>
            <Button variant="secondary" onClick={doUndo} className="mt-2 w-full">
              取り消して前の状態に戻す
            </Button>
          </div>
        )}
      </Card>

      {ImportHistoryCard && <ImportHistoryCard />}
      {DataHealthCard && <DataHealthCard />}
      {DiagnosticsCard && <DiagnosticsCard />}

      <Card>
        <SectionTitle>データとプライバシー</SectionTitle>
        <ul className="mb-3 list-disc space-y-1 pl-5 text-[13px] text-ink-2">
          <li>{STORAGE_TEXT[nativeApp ? "app" : "web"].privacy}</li>
          <li>端末どうしの同期、アカウント、共有には対応していません。URLを友達に送っても記録は共有されません。</li>
          <li>{STORAGE_TEXT[nativeApp ? "app" : "web"].lost}</li>
          <li>レシートの画像は保存しません。</li>
        </ul>
        <details id="danger" className="scroll-mt-20 rounded-xl border border-danger/30 p-3">
          <summary className="flex min-h-11 cursor-pointer items-center text-[14px] font-semibold text-danger">記録をすべて削除する（危険な操作）</summary>
          <div className="mt-2 space-y-2">
            <p className="text-[13px] text-ink-2">
              今ある記録：支出・収入 {data.transactions.length}件、予定 {data.events.length}件{data.nisa.length > 0 ? `、NISA ${data.nisa.length}件` : ""}
            </p>
            <p className="text-[13px] font-semibold text-danger">削除すると元に戻せません。「直前の操作を取り消す」の控えも消えます。</p>
            <Button variant="secondary" onClick={exportBackup} className="w-full">
              先にバックアップを書き出す
            </Button>
            <Field label="確認のため「削除」と入力" htmlFor="wipe-word">
              <input id="wipe-word" value={wipeWord} onChange={(e) => setWipeWord(e.target.value)} className={inputCls} autoComplete="off" />
            </Field>
            <Button variant="danger" onClick={wipe} className="w-full" disabled={wipeWord.trim() !== "削除"}>
              この端末の記録をすべて削除
            </Button>
          </div>
        </details>
      </Card>

    </>
  );
  const blkAbout = (
    <>
      <Card>
        <SectionTitle>このアプリについて</SectionTitle>
        <p className="text-[13px] text-ink-2">くらしベース（KURASHI BASE）β版（試用版）</p>
        <p className="mt-2 text-[13px] font-semibold text-ink-2">まだ対応していないこと</p>
        {PERSONAL_BUILD ? (
          // 自分用：iPhone アプリでは文字の読み取り・通知・ウィジェットが使えるので、「まだ対応していない」に入れない（磨き込み 2026-11-26）
          <ul className="mt-1 list-disc space-y-1 pl-5 text-[13px] text-ink-3">
            <li>繰り返し予定の1回分だけの変更、分割払いの記録</li>
            <li>端末どうしの同期・共有・AI・ほかのサービスとのつながり（メニューの「準備中」に説明があります）</li>
            <li>iPhone のショートカット</li>
            <li>文字の読み取り・通知・ウィジェットは iPhone アプリの中だけ（パソコンのブラウザでは使えません）</li>
          </ul>
        ) : (
          <ul className="mt-1 list-disc space-y-1 pl-5 text-[13px] text-ink-3">
            <li>レシートの文字の自動読み取り（OCR）— レシートの画像を見ながら手で入力します</li>
            <li>繰り返し予定の1回分だけの変更、振替・分割払いの記録</li>
            <li>通知、ホーム画面のウィジェット、iPhone のショートカット</li>
            <li>端末どうしの同期・共有・AI・ほかのサービスとのつながり（メニューの「準備中」に説明があります）</li>
          </ul>
        )}
      </Card>
    </>
  );

  return (
    <main className="space-y-4">
      <PageHeader title="設定" />
      {PERSONAL_BUILD ? (
        <>
          <nav aria-label="設定の区切り">
            <ul className="divide-y divide-line border-y border-line">
              {SETTING_GROUPS.map(([id, label, desc]) => (
                <li key={id}>
                  <a href={`#${id}`} className="flex min-h-12 items-center justify-between gap-3 py-1 hover:bg-surface-2">
                    <span>
                      <span className="block text-[16px] font-semibold">{label}</span>
                      <span className="block text-[13px] text-ink-3">{desc}</span>
                    </span>
                    <span aria-hidden="true" className="text-ink-3">›</span>
                  </a>
                </li>
              ))}
            </ul>
          </nav>
          <GroupLabel id="set-general">一般</GroupLabel>
          {StartScreenCard && <StartScreenCard />}
          <GroupLabel id="set-display">表示</GroupLabel>
          {NavSettingsCard && <NavSettingsCard />}
          {MenuVisibilityCard && <MenuVisibilityCard />}
          {blkHome}
          <GroupLabel id="set-money">家計簿</GroupLabel>
          {blkBudget}
          {blkCategories}
          <GroupLabel id="set-connect">外部連携</GroupLabel>
          {blkConnect}
          <GroupLabel id="set-data">データ管理</GroupLabel>
          {blkData}
          <GroupLabel id="set-about">アプリ情報</GroupLabel>
          {blkAbout}
        </>
      ) : (
        <>
      {/* 設定の目次（レビュー o1 の P15：長いので、日常の設定とデータの管理を分けて飛べるように） */}
      <nav aria-label="設定の目次" className="-mt-1 flex flex-wrap gap-1.5 text-[13px]">
        {(
          [
            ["#budget", "予算・ホーム"],
            ["#categories", "カテゴリ"],
            ...(FEATURES.calendarFile || FEATURES.csvImport ? ([["#calendar-file", "カレンダー・取り込み"]] as const) : []),
            ...(nativeApp ? ([["#iphone", "iPhone の連携"]] as const) : []),
            ["#backup", "バックアップ・データ"],
            ...(GROUPS ? ([["#danger", "すべて削除"]] as const) : []),
          ] as const
        ).map(([href, label]) => (
          <a key={href} href={href} className="inline-flex min-h-11 items-center rounded-full border border-line bg-surface px-3 font-semibold text-ink-2 hover:bg-surface-2">
            {label}
          </a>
        ))}
      </nav>

      <GroupLabel id="group-daily">ふだんの設定</GroupLabel>
          {blkBudget}
          {blkHome}
          {blkCategories}
          {(FEATURES.calendarFile || FEATURES.csvImport) && <GroupLabel id="group-connect">ほかとつなぐ・取り込む</GroupLabel>}
          {blkConnect}
          <GroupLabel id="group-data">記録を守る</GroupLabel>
          {blkData}
          {blkAbout}
        </>
      )}
    </main>
  );
}
