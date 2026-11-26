import { FEATURES, IS_PERSONAL } from "./edition";
import { todayStr } from "./date";
import { inboxCount } from "./inbox";
import type { AppData } from "./types";

// 「すべての機能」の一覧（menu の画面から移した。公開版の「メニュー」と自分用の「その他」で同じ一覧を使う。o31 F003）
export type MenuItem = { href: string; label: string; desc: string; count?: (d: AppData) => number; soon?: boolean };

// よく使うものを先頭に、残りは中身の種類で分ける。使えないもの（準備中）はいちばん下にまとめ、各項目にも印を付ける。
export const GROUPS: { title: string; items: MenuItem[] }[] = [
  {
    title: "よく使う",
    items: [
      // さがす・買い物の判断・未整理の記録は、2026-11-25 から公開版（友達用）にも出す。生活の変化は自分用だけ
      ...(FEATURES.search ? [{ href: "/search", label: "検索", desc: "記録・予定・メモ・契約などを、1つの言葉で探す" }] : []),
      ...(FEATURES.decide ? [{ href: "/decide", label: "買い物の判断", desc: "買う前に、今月と来月の予算がどうなるか見る" }] : []),
      ...(IS_PERSONAL ? [{ href: "/life", label: "生活の変化", desc: "引っ越し・転職で変わる固定費や予算を、いつからかを決めて計画する" }] : []),
      ...(FEATURES.inbox ? [{ href: "/inbox", label: "未分類の記録", desc: "「その他」の記録を、店名ごとにまとめて整理", count: (d: AppData) => inboxCount(d) }] : []),
      { href: "/history", label: "取引履歴", desc: "月ごとの支出・収入と検索", count: (d) => d.transactions.length },
      { href: "/recurring", label: "固定費", desc: "家賃・通信費などの決まった支払い", count: (d) => d.recurring.filter((r) => r.active).length },
      { href: "/tasks", label: "やること", desc: "期限のある用事", count: (d) => d.tasks.filter((t) => !t.done).length },
      { href: "/trips", label: "旅行", desc: "日程・行程・行き方を調べる", count: (d) => (d.trips ?? []).filter((t) => t.endDate >= todayStr()).length },
      // 自分用の iPhone アプリでは、文字の読み取りとウィジェットが使える（磨き込み 2026-11-26。公開版の説明は変えない）
      IS_PERSONAL
        ? { href: "/import", label: "レシートを見て入力", desc: "レシートの写真から、日付・金額・店名の候補を読み取る（iPhone アプリ）" }
        : { href: "/import", label: "レシートを見て入力", desc: "レシートの画像を見ながら支出を入力（自動読み取りはまだ）" },
      ...(IS_PERSONAL ? [{ href: "/widget", label: "ウィジェット", desc: "iPhone のホーム画面に置くウィジェットの中身を確かめる" }] : []),
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
      { href: "/study", label: "勉強", desc: "資格・試験の勉強時間と教材", count: (d) => d.studySubjects.filter((s) => !s.archived).length },
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
      { href: "/ai", label: "AIに相談", desc: "記録をもとに相談する", soon: true },
      { href: "/integrations", label: "外部サービス連携", desc: "銀行・カレンダーなどとつなぐ", soon: true },
      ...(IS_PERSONAL ? [] : [{ href: "/widget", label: "ウィジェット", desc: "ホーム画面に置く場合の表示を確認", soon: true }]),
    ],
  },
];
