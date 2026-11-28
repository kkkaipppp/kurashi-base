"use client";

import Link from "next/link";
import { CollectionPage, numberFromDraft, type CollectionConfig } from "@/components/CollectionPage";
import { Card, IconChevronR } from "@/components/ui";
import { addMonthsToKey, formatDateJa, monthKey, todayStr } from "@/lib/date";
import { numStr, str } from "@/lib/draft";
import { formatYen } from "@/lib/money";
import { summarizeNisa } from "@/lib/nisa";
import { monthlyNet, netWorth, withHistory } from "@/lib/assetTrend";
import type { AssetKind } from "@/lib/types";

const ASSET_KINDS: { value: AssetKind; label: string }[] = [
  { value: "cash", label: "現金・預金" },
  { value: "investment", label: "投資（NISA以外）" },
  { value: "nisa", label: "投資（NISA）" },
  { value: "pension", label: "年金・iDeCo" },
  { value: "insurance", label: "保険" },
  { value: "property", label: "不動産・車" },
  { value: "other", label: "その他" },
];
// 版の値を直接比べる（公開版の組み立てから、自分用の入力を外すため）
const PERSONAL_BUILD = process.env.NEXT_PUBLIC_KB_EDITION === "personal";
// 負債（ローン・借入）は自分用だけ選べる（To-Be 2026-11-28 S3-1）。入力では種類の1つに見せ、保存は kind="other"＋debt=true
const KIND_OPTIONS: { value: string; label: string }[] = PERSONAL_BUILD ? [...ASSET_KINDS, { value: "debt", label: "負債（ローン・借入）" }] : ASSET_KINDS;
const kindLabel = (k: string) => ASSET_KINDS.find((x) => x.value === k)?.label ?? "その他";

const config: CollectionConfig<"assets"> = {
  key: "assets",
  title: "資産・NISA",
  noun: "資産",
  intro: "口座や保有しているものの評価額を、手で記録します。銀行や証券会社とはつながっていないため、金額は自動では更新されません。",
  emptyText: "資産はまだありません。",
  fields: [
    { name: "name", label: "名前", type: "text", required: true, placeholder: "例：〇〇銀行 普通預金" },
    { name: "kind", label: "種類", type: "select", options: KIND_OPTIONS },
    { name: "value", label: "評価額（円）", optional: true, type: "number", half: true, hint: "分からなければ空欄のままで大丈夫です" },
    { name: "asOf", label: "評価日", optional: true, type: "date", half: true },
    // 種類が「現金・預金」のとき、評価日の時点のカードの未払い（自分用。残高の目安で「引き落とし前のカード払い」に足す）
    ...(PERSONAL_BUILD ? [{ name: "cardDebt", label: "この日付時点で、カードの引き落とし待ち（円）", optional: true, type: "number" as const, hint: "例：先月分のカード利用で、まだ口座から引かれていない金額。現金・預金の残高の目安に使います。分からなければ空欄（不明として扱い、引き落とし待ちは「少なくとも」の額で出します）" }] : []),
    { name: "note", label: "メモ", optional: true, type: "textarea" },
  ],
  initial: ({ today }) => ({ name: "", kind: "cash", value: "", asOf: today, note: "" }),
  toDraft: (a) => ({ name: a.name, kind: PERSONAL_BUILD && a.debt ? "debt" : a.kind, value: numStr(a.value), asOf: a.asOf, cardDebt: a.cardDebt === undefined ? "" : String(a.cardDebt), note: a.note }),
  fromDraft: (d) => ({ name: str(d, "name"), kind: (str(d, "kind") === "debt" ? "other" : str(d, "kind")) as AssetKind, ...(PERSONAL_BUILD ? { debt: str(d, "kind") === "debt" ? (true as const) : undefined } : {}), value: numberFromDraft(str(d, "value")), asOf: str(d, "asOf"), note: str(d, "note"), ...(PERSONAL_BUILD ? { cardDebt: numberFromDraft(str(d, "cardDebt")) ?? undefined } : {}) }),
  // 評価額か評価日を直したら、前の値を推移に残す（評価額が空欄なら残さない）
  beforeSave: (prev, next) => {
    const history = withHistory(prev, next);
    return history && history.length > 0 ? { ...next, history } : next;
  },
  sort: (a, b) => (b.value ?? -1) - (a.value ?? -1),
  row: (a) => ({
    title: a.name,
    sub: `${PERSONAL_BUILD && a.debt ? "負債（ローン・借入）" : kindLabel(a.kind)}${a.asOf ? `・${formatDateJa(a.asOf, true)}時点` : ""}`,
    right: a.value === null ? <span className="text-[13px] font-medium text-ink-3">未入力</span> : PERSONAL_BUILD && a.debt ? `−${formatYen(a.value)}` : formatYen(a.value),
  }),
  header: ({ list, data }) => {
    // 負債は資産の合計に入れない（自分用では純資産で引く）
    const w = netWorth(list);
    const known = list.filter((a) => a.value !== null && !a.debt);
    const total = w.assets;
    const debtCount = list.filter((a) => a.debt && a.value !== null).length;
    const thisMonth = monthKey(todayStr());
    const trend = PERSONAL_BUILD ? monthlyNet(list, Array.from({ length: 12 }, (_, i) => addMonthsToKey(thisMonth, i - 11))).filter((p) => p.counted > 0) : [];
    const nisa = summarizeNisa(data.nisa, Number(todayStr().slice(0, 4)));
    return (
      <>
        {list.length > 0 && (
          <Card className="py-3">
            {PERSONAL_BUILD && debtCount > 0 ? (
              <>
                <p className="text-[13px] font-semibold text-ink-2">純資産（資産 − 負債）</p>
                <p className="num text-2xl font-bold">{w.net < 0 ? `−${formatYen(-w.net)}` : formatYen(w.net)}</p>
                <p className="num text-[13px] text-ink-3">
                  資産 {formatYen(w.assets)}・負債 {formatYen(w.debts)}
                </p>
              </>
            ) : (
              <>
                <p className="text-[13px] font-semibold text-ink-2">評価額の合計</p>
                <p className="num text-2xl font-bold">{formatYen(total)}</p>
              </>
            )}
            {w.unknown > 0 && <p className="text-[12px] text-ink-3">評価額が未入力の{w.unknown}件は含めていません</p>}
            {!PERSONAL_BUILD && known.length + w.unknown < list.length && <p className="text-[12px] text-ink-3">合計に含めていない記録が{list.length - known.length - w.unknown}件あります</p>}
          </Card>
        )}
        {PERSONAL_BUILD && trend.length >= 2 && (
          <Card className="py-3">
            <h2 className="text-[13px] font-semibold text-ink-2">純資産の推移（月末。評価額を直したときの記録から）</h2>
            <ul className="mt-1 divide-y divide-line text-[14px]">
              {trend.map((p, i) => {
                const diff = i > 0 ? p.net - trend[i - 1].net : null;
                return (
                  <li key={p.month} className="flex min-h-10 items-center justify-between gap-3">
                    <span>{Number(p.month.slice(5))}月</span>
                    <span className="num font-semibold">
                      {p.net < 0 ? `−${formatYen(-p.net)}` : formatYen(p.net)}
                      {diff !== null && diff !== 0 && <span className={`ml-2 text-[12px] ${diff > 0 ? "text-income" : "text-expense"}`}>{diff > 0 ? `+${formatYen(diff)}` : `−${formatYen(-diff)}`}</span>}
                    </span>
                  </li>
                );
              })}
            </ul>
            <p className="mt-1 text-[12px] text-ink-3">その月末に評価額が分かる記録だけで計算しています（評価額を直すたびに、前の値が残ります）。</p>
          </Card>
        )}
        <Link href="/nisa" className="block">
          <Card className="flex items-center justify-between py-3 hover:bg-surface-2">
            <div>
              <p className="text-[15px] font-bold">NISA</p>
              <p className="num text-[12px] text-ink-3">
                {nisa.year}年の投資枠の残り：つみたて {formatYen(nisa.annualLeft.tsumitate)}・成長 {formatYen(nisa.annualLeft.growth)}
              </p>
            </div>
            <IconChevronR className="size-5 text-ink-3" />
          </Card>
        </Link>
      </>
    );
  },
};

export default function AssetsPage() {
  return <CollectionPage config={config} />;
}
