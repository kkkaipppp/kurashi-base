"use client";

import Link from "next/link";
import { CollectionPage, numberFromDraft, type CollectionConfig } from "@/components/CollectionPage";
import { Card, IconChevronR } from "@/components/ui";
import { formatDateJa, todayStr } from "@/lib/date";
import { numStr, str } from "@/lib/draft";
import { formatYen } from "@/lib/money";
import { summarizeNisa } from "@/lib/nisa";
import type { AssetKind } from "@/lib/types";

const ASSET_KINDS: { value: AssetKind; label: string }[] = [
  { value: "cash", label: "預金・現金" },
  { value: "investment", label: "投資（課税口座）" },
  { value: "nisa", label: "NISA口座" },
  { value: "pension", label: "年金・iDeCo" },
  { value: "insurance", label: "保険（解約返戻金など）" },
  { value: "property", label: "不動産・車など" },
  { value: "other", label: "その他" },
];
const kindLabel = (k: string) => ASSET_KINDS.find((x) => x.value === k)?.label ?? "その他";

const config: CollectionConfig<"assets"> = {
  key: "assets",
  title: "資産",
  noun: "資産",
  intro: "口座や保有しているものの評価額を、手で記録します。銀行や証券会社とはつながっていないため、金額は自動では更新されません。",
  emptyText: "まだ資産が登録されていません。預金口座などを追加しましょう。",
  fields: [
    { name: "name", label: "名前", type: "text", required: true, placeholder: "例：〇〇銀行 普通預金" },
    { name: "kind", label: "種類", type: "select", options: ASSET_KINDS },
    { name: "value", label: "評価額（円・任意）", type: "number", half: true, hint: "分からなければ空欄のままで大丈夫です" },
    { name: "asOf", label: "評価した日（任意）", type: "date", half: true },
    { name: "note", label: "メモ（任意）", type: "textarea" },
  ],
  initial: ({ today }) => ({ name: "", kind: "cash", value: "", asOf: today, note: "" }),
  toDraft: (a) => ({ name: a.name, kind: a.kind, value: numStr(a.value), asOf: a.asOf, note: a.note }),
  fromDraft: (d) => ({ name: str(d, "name"), kind: str(d, "kind") as AssetKind, value: numberFromDraft(str(d, "value")), asOf: str(d, "asOf"), note: str(d, "note") }),
  sort: (a, b) => (b.value ?? -1) - (a.value ?? -1),
  row: (a) => ({
    title: a.name,
    sub: `${kindLabel(a.kind)}${a.asOf ? `・${formatDateJa(a.asOf, true)}時点` : ""}`,
    right: a.value === null ? <span className="text-[13px] font-medium text-ink-3">未入力</span> : formatYen(a.value),
  }),
  header: ({ list, data }) => {
    const known = list.filter((a) => a.value !== null);
    const total = known.reduce((s, a) => s + (a.value ?? 0), 0);
    const nisa = summarizeNisa(data.nisa, Number(todayStr().slice(0, 4)));
    return (
      <>
        {list.length > 0 && (
          <Card className="py-3">
            <p className="text-[13px] font-semibold text-ink-2">評価額の合計</p>
            <p className="num text-2xl font-bold">{formatYen(total)}</p>
            {known.length < list.length && <p className="text-[12px] text-ink-3">評価額が未入力の{list.length - known.length}件は含めていません</p>}
          </Card>
        )}
        <Link href="/nisa" className="block">
          <Card className="flex items-center justify-between py-3 hover:bg-surface-2">
            <div>
              <p className="text-[15px] font-bold">NISAの枠</p>
              <p className="num text-[12px] text-ink-3">
                {nisa.year}年の残り：つみたて {formatYen(nisa.annualLeft.tsumitate)}・成長 {formatYen(nisa.annualLeft.growth)}
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
