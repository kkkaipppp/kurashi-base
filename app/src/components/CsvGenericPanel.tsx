"use client";

import { inputCls } from "./ui";
import type { AmountMode, GenericConfig, GenericMap, SignRule, Table } from "@/lib/csvGeneric";

/**
 * 決まった形ではない CSV を取り込むときの、列の対応づけ（自分用。NEXT v21 CSV:C03）。
 * 見出しから出した候補を、本人が直せる。取り込む前の確認は、決まった形のときと同じ画面で行う。
 */
const FIELD_LABEL: { key: keyof GenericMap; label: string; need?: "always" | "amount" | "split" | "kind" }[] = [
  { key: "date", label: "日付", need: "always" },
  { key: "amount", label: "金額", need: "amount" },
  { key: "expense", label: "出金（支出）", need: "split" },
  { key: "income", label: "入金（収入）", need: "split" },
  { key: "kind", label: "種類（支出か収入か）", need: "kind" },
  { key: "category", label: "カテゴリ" },
  { key: "merchant", label: "内容・店名" },
  { key: "pay", label: "支払方法" },
  { key: "memo", label: "メモ" },
  { key: "srcId", label: "元ID（あれば）" },
  { key: "include", label: "計算対象（0は取り込まない）" },
  { key: "transfer", label: "振替（取り込まない）" },
];

const MODES: [AmountMode, string][] = [
  ["signed", "金額の列が1つ（プラス・マイナスで分ける）"],
  ["kind", "金額の列と、種類の列がある"],
  ["split", "出金と入金の列が分かれている"],
];

export function CsvGenericPanel({ table, cfg, encoding, onChange }: { table: Table; cfg: GenericConfig; encoding: string; onChange: (c: GenericConfig) => void }) {
  const setCol = (key: keyof GenericMap, v: number) => onChange({ ...cfg, map: { ...cfg.map, [key]: v } });
  // 金額の書き方に合う列だけ出す
  const shown = FIELD_LABEL.filter((f) => !f.need || f.need === "always" || (f.need === "amount" && cfg.mode !== "split") || (f.need === "split" && cfg.mode === "split") || (f.need === "kind" && cfg.mode === "kind"));
  return (
    <div className="space-y-3 rounded-xl bg-surface-2 p-3" aria-label="CSV の列の対応づけ">
      <p className="text-[13px] font-semibold">決まった形ではない CSV です。列の対応を確かめてください。</p>
      <p className="text-[12px] text-ink-3">
        文字コード：{encoding}・区切り：{table.delim === "\t" ? "タブ" : "カンマ"}・{table.body.length}行。分からない列は「使わない」のままで大丈夫です。
      </p>
      <fieldset>
        <legend className="mb-1 text-[12px] font-semibold text-ink-2">金額の書き方</legend>
        <div className="space-y-1" role="radiogroup" aria-label="金額の書き方">
          {MODES.map(([m, label]) => (
            <label key={m} className="flex min-h-11 cursor-pointer items-center gap-2 text-[13px]">
              <input type="radio" name="csv-mode" checked={cfg.mode === m} onChange={() => onChange({ ...cfg, mode: m })} className="size-4 accent-[var(--brand)]" />
              {label}
            </label>
          ))}
        </div>
      </fieldset>
      {cfg.mode === "signed" && (
        <fieldset>
          <legend className="mb-1 text-[12px] font-semibold text-ink-2">支出はどちらの金額ですか</legend>
          <div className="space-y-1" role="radiogroup" aria-label="支出の符号">
            {(
              [
                ["negativeIsExpense", "マイナスが支出（銀行・家計簿アプリなど）"],
                ["positiveIsExpense", "プラスが支出（カードの利用明細など）"],
              ] as [SignRule, string][]
            ).map(([v, label]) => (
              <label key={v} className="flex min-h-11 cursor-pointer items-center gap-2 text-[13px]">
                <input type="radio" name="csv-sign" checked={cfg.sign === v} onChange={() => onChange({ ...cfg, sign: v })} className="size-4 accent-[var(--brand)]" />
                {label}
              </label>
            ))}
          </div>
        </fieldset>
      )}
      <div className="grid gap-2">
        {shown.map((f) => (
          <label key={f.key} className="block text-[13px]">
            <span className="mb-0.5 block font-semibold text-ink-2">
              {f.label}
              {f.need ? "（必要）" : ""}
            </span>
            <select value={cfg.map[f.key]} onChange={(e) => setCol(f.key, Number(e.target.value))} className={inputCls}>
              <option value={-1}>使わない</option>
              {table.header.map((h, i) => (
                <option key={i} value={i}>
                  {i + 1}列目：{h || "（見出しなし）"}
                </option>
              ))}
            </select>
          </label>
        ))}
      </div>
      <label className="flex min-h-11 cursor-pointer items-center gap-2 text-[13px]">
        <input type="checkbox" checked={cfg.newCategories} onChange={(e) => onChange({ ...cfg, newCategories: e.target.checked })} className="size-5 accent-[var(--brand)]" />
        今のカテゴリにない名前は、新しいカテゴリとして作る（しないときは「その他」にします）
      </label>
      <div>
        <p className="mb-1 text-[12px] font-semibold text-ink-2">はじめの3行（そのまま）</p>
        <div className="overflow-x-auto rounded-lg border border-line bg-surface">
          <table className="num w-max min-w-full text-[11px]">
            <thead>
              <tr className="text-ink-3">
                {table.header.map((h, i) => (
                  <th key={i} className="px-2 py-1 text-left font-semibold whitespace-nowrap">
                    {h || "—"}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {table.body.slice(0, 3).map((r, ri) => (
                <tr key={ri}>
                  {table.header.map((_, ci) => (
                    <td key={ci} className="px-2 py-1 whitespace-nowrap">
                      {r[ci] ?? ""}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
