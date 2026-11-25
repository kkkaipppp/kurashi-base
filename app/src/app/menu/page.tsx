"use client";

import Link from "next/link";
import { Card, IconChevronR, PageHeader } from "@/components/ui";
import { useData } from "@/lib/store";
import { todayStr } from "@/lib/date";
import { IS_PERSONAL } from "@/lib/edition";
import { inboxCount } from "@/lib/inbox";
import type { AppData } from "@/lib/types";

type Item = { href: string; label: string; desc: string; count?: (d: AppData) => number; soon?: boolean };

// よく使うものを先頭に、残りは中身の種類で分ける。使えないもの（準備中）はいちばん下にまとめ、各項目にも印を付ける。
const GROUPS: { title: string; items: Item[] }[] = [
  {
    title: "よく使う",
    items: [
      ...(IS_PERSONAL
        ? [
            { href: "/search", label: "さがす", desc: "記録・予定・メモ・契約などを、1つの言葉で探す" },
            { href: "/decide", label: "買い物の判断", desc: "買う前に、今月と来月の予算がどうなるか見る" },
            { href: "/life", label: "生活の変化", desc: "引っ越し・転職で変わる固定費や予算を、いつからかを決めて計画する" },
            { href: "/inbox", label: "未整理の記録", desc: "「その他」の記録を、店名ごとにまとめて整理", count: (d: AppData) => inboxCount(d) },
          ]
        : []),
      { href: "/history", label: "取引履歴", desc: "月ごとの支出・収入と検索", count: (d) => d.transactions.length },
      { href: "/recurring", label: "固定費", desc: "家賃・通信費などの決まった支払い", count: (d) => d.recurring.filter((r) => r.active).length },
      { href: "/tasks", label: "タスク", desc: "やることと期限", count: (d) => d.tasks.filter((t) => !t.done).length },
      { href: "/trips", label: "旅行", desc: "日程・行程・行き方を調べる", count: (d) => (d.trips ?? []).filter((t) => t.endDate >= todayStr()).length },
      { href: "/import", label: "レシートを見て入力", desc: "レシートの画像を見ながら支出を入力（自動読み取りはまだ）" },
      { href: "/settings#backup", label: "バックアップと復元", desc: "記録をファイルに保存・ファイルから戻す" },
    ],
  },
  {
    title: "お金",
    items: [
      { href: "/assets", label: "資産・NISA", desc: "預金・投資の評価額とNISAの投資枠", count: (d) => d.assets.length + d.nisa.length },
      { href: "/contracts", label: "契約", desc: "スマホ・保険・サブスクと更新日", count: (d) => d.contracts.filter((c) => c.status === "active").length },
    ],
  },
  {
    title: "目標・学び",
    items: [
      { href: "/goals", label: "目標", desc: "目標と達成率", count: (d) => d.goals.filter((g) => !g.done).length },
      { href: "/study", label: "資格の学習", desc: "資格を探す・勉強時間の目安・参考書", count: (d) => d.studySubjects.filter((s) => !s.archived).length },
    ],
  },
  {
    title: "記録",
    items: [
      { href: "/notes", label: "生活記録・メモ", desc: "日々の記録とメモ", count: (d) => d.notes.length },
      { href: "/health", label: "健康記録", desc: "体重・睡眠・通院など", count: (d) => d.health.length },
      { href: "/documents", label: "生活書類", desc: "書類の期限と保管場所", count: (d) => d.documents.length },
    ],
  },
  {
    title: "アプリ",
    items: [
      { href: "/guide", label: "使い方", desc: "はじめての方へ・記録の保存場所とバックアップ" },
      { href: "/settings", label: "設定", desc: "予算・表示・カテゴリ・データの削除" },
    ],
  },
  {
    title: "準備中（まだ使えません）",
    items: [
      { href: "/share", label: "共有", desc: "家族と一緒に使う", soon: true },
      { href: "/ai", label: "AI生活サポート", desc: "記録をもとに相談する", soon: true },
      { href: "/integrations", label: "外部サービス連携", desc: "銀行・カレンダーなどとつなぐ", soon: true },
      { href: "/widget", label: "ウィジェット", desc: "ホーム画面に置く場合の表示を確認", soon: true },
    ],
  },
];

export default function MenuPage() {
  const data = useData();
  return (
    <main className="space-y-4">
      <PageHeader title="すべての機能" />
      {GROUPS.map((g) => {
        // 自分用：本人が隠した機能は出さない（記録は消えていない。設定の「メニューに出す機能」でいつでも戻せる）
        const hidden = IS_PERSONAL ? new Set(data.prefs.menuHidden ?? []) : null;
        const items = hidden ? g.items.filter((i) => !hidden.has(i.href)) : g.items;
        if (items.length === 0) return null;
        const soon = items.every((i) => i.soon);
        const list = (
          <Card className="p-0">
            <ul className="divide-y divide-line">
              {items.map((i) => {
                const n = i.count?.(data);
                return (
                  <li key={i.href}>
                    <Link href={i.href} className="flex min-h-14 items-center gap-3 px-4 py-2 hover:bg-surface-2">
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center gap-1.5 text-[15px] font-semibold">
                          {i.label}
                          {i.soon && <span className="rounded-full bg-warn-soft px-1.5 py-0.5 text-[10px] font-semibold text-warn">準備中</span>}
                        </span>
                        <span className="block truncate text-[12px] text-ink-3">{i.desc}</span>
                      </span>
                      {n !== undefined && n > 0 && <span className="num text-[13px] text-ink-3">{n}件</span>}
                      <IconChevronR className="size-4 shrink-0 text-ink-3" />
                    </Link>
                  </li>
                );
              })}
            </ul>
          </Card>
        );
        // 自分用は、まだ使えないもの（準備中）をふだんのメニューに出さない（100点化の指示 F。開けば見られる）
        if (IS_PERSONAL && soon)
          return (
            <details key={g.title} className="rounded-xl">
              <summary className="flex min-h-11 cursor-pointer items-center px-1 text-[13px] font-semibold text-ink-3">準備中のもの（{items.length}件）を見る</summary>
              {list}
            </details>
          );
        return (
          <section key={g.title}>
            <h2 className="mb-1.5 px-1 text-[13px] font-semibold text-ink-3">{g.title}</h2>
            {list}
          </section>
        );
      })}
    </main>
  );
}
