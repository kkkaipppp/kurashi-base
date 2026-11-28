"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, type ReactNode } from "react";
import { StoreProvider, useStore } from "@/lib/store";
import { isPractice, practiceRepository, reloadHome, setPractice } from "@/lib/practice";
import { todayStr } from "@/lib/date";
import { LOST_STORE_PREFIX, NO_OLD_RECORDS } from "@/lib/lostStore";
import { UIProvider, useUI } from "./UIContext";
import { WidgetSync } from "./WidgetSync";
import { Button, IconCalendar, IconChart, IconGrid, IconHome, IconPlus } from "./ui";
import dynamic from "next/dynamic";

// 自分用の下のメニュー・起動時の画面・最近開いた機能（o31 F001〜F003）は、別のファイルにして遅れて読む。
// 版をこのファイルの中で直接比べるので、公開版の組み立てには入らない（点検 中-2）
const PERSONAL_SHELL = process.env.NEXT_PUBLIC_KB_EDITION === "personal";
const PersonalShell = PERSONAL_SHELL ? dynamic(() => import("./PersonalShell").then((m) => m.PersonalShell), { ssr: false }) : null;

export function AppShell({ children }: { children: ReactNode }) {
  // 日程調整の回答のページ（友達が開く）は、アプリの枠・端末の記録の読み込みを使わない（To-Be 段階4。点検 中5）
  const path = usePathname();
  // 練習中（自分用。決定 Q34 ①）は、保存の先を閉じれば消えるメモリーに替える。本当の記録の入れ物には触れない
  const [practiceRepo] = useState(() => (PERSONAL_SHELL && isPractice() ? practiceRepository(todayStr()) : undefined));
  if (path === "/a" || path.startsWith("/a/")) return <div className="mx-auto min-h-dvh w-full max-w-[480px] px-4 pb-10">{children}</div>;
  return (
    <StoreProvider repo={practiceRepo}>
      {/* 練習かどうかは開いたときに1回だけ決める（描き直しで変わらない。点検 中-1） */}
      <Gate practice={practiceRepo !== undefined}>{children}</Gate>
    </StoreProvider>
  );
}

function Gate({ children, practice }: { children: ReactNode; practice: boolean }) {
  const s = useStore();
  if (s.status === "loading") {
    return (
      <div className="flex min-h-dvh items-center justify-center text-ink-3" role="status">
        読み込み中…
      </div>
    );
  }
  if (s.status === "unavailable") return <StorageProblem title="データを保存できません" body={s.error ?? ""} />;
  if (s.status === "corrupt") return <CorruptScreen />;
  return (
    <UIProvider>
      {/* 練習中は、記録から作る写し（ウィジェット・自動バックアップ・カレンダー・通知）を書かない */}
      {!practice && <WidgetSync />}
      {practice && <PracticeBanner />}
      {/* 上は時計の所の余白（自分用。公開版は 0）、下は下のボタンの並び＋ホームバーの所 */}
      <div className="mx-auto min-h-dvh w-full max-w-[480px] px-4 pt-[var(--sat)] pb-[calc(7rem+var(--sab))]">{children}</div>
      {PersonalShell ? <PersonalShell /> : <BottomNav />}
    </UIProvider>
  );
}

/** 練習中の帯（いつも上に出す）。自分用の版だけ（版を直接比べて、公開版の組み立てに入れない） */
const PracticeBanner = !PERSONAL_SHELL
  ? () => null
  : () => (
    <div role="status" className="sticky top-0 z-40 flex items-center justify-between gap-2 bg-warn-soft px-4 pt-[var(--sat)] text-[13px] font-semibold text-warn">
      <span className="py-2">練習中（本当の記録とは別。保存しません）</span>
      <button
        type="button"
        onClick={() => {
          setPractice(false);
          reloadHome();
        }}
        className="min-h-11 shrink-0 rounded-lg px-2 text-brand underline"
      >
        練習をやめる
      </button>
    </div>
  );

function StorageProblem({ title, body, children, browserHint = true }: { title: string; body: string; children?: ReactNode; browserHint?: boolean }) {
  return (
    <main className="mx-auto flex min-h-dvh max-w-[480px] flex-col justify-center gap-3 px-6">
      <h1 className="text-xl font-bold">{title}</h1>
      <p className="text-ink-2">{body}</p>
      {browserHint && (
        <p className="text-[13px] text-ink-3">
          くらしベースはデータをこの端末のブラウザ内に保存します。ブラウザの設定（プライベートブラウズ、サイトデータの保存制限）を確認してから再読み込みしてください。
        </p>
      )}
      {children}
      <Button variant="secondary" onClick={() => location.reload()}>
        再読み込み
      </Button>
    </main>
  );
}

function CorruptScreen() {
  const s = useStore();
  const [msg, setMsg] = useState<string | null>(null);
  const download = () => {
    if (!s.corruptRaw) return;
    const url = URL.createObjectURL(new Blob([s.corruptRaw], { type: "application/json" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `kurashi-base-corrupt-${Date.now()}.json`;
    a.click();
    // Safari ではすぐに無効にすると保存が始まらないことがあるため、少し待つ（設定のバックアップと同じ）
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
  };
  // 保存先が空になっていた場面（lib/lostStore.ts）：壊れたデータではないので、言い方を変える（点検2回目 低-6）
  const lost = !!s.error?.startsWith(LOST_STORE_PREFIX);
  const hasFile = !!s.corruptRaw && s.corruptRaw !== NO_OLD_RECORDS;
  return (
    <StorageProblem title={lost ? "記録の保存先が空になっていました" : "保存データを読み込めません"} body={lost ? `${s.error ?? ""}。` : `${s.error ?? ""}。データは削除していません。`} browserHint={!lost}>
      {hasFile && (
        <Button variant="secondary" onClick={download}>
          {lost ? "古い記録をファイルに保存" : "読み込めないデータをファイルに保存"}
        </Button>
      )}
      <Button
        variant="danger"
        onClick={async () => {
          const ask = lost
            ? "記録がない状態から始めます（古い記録は元の場所に残します）。このあと、設定の「バックアップから復元」で最新の記録を戻してください。実行しますか？"
            : "読み込めないデータを別の場所に移して、記録がない状態から始めます。よろしいですか？";
          if (!confirm(ask)) return;
          const r = await s.resetCorrupt();
          if (!r.ok) setMsg(r.error);
        }}
      >
        {lost ? "記録がない状態から始める" : "別の場所に移して最初から始める"}
      </Button>
      {msg && (
        <p role="alert" className="text-danger">
          {msg}
        </p>
      )}
    </StorageProblem>
  );
}

const NAV = [
  { href: "/", label: "ホーム", Icon: IconHome },
  { href: "/calendar", label: "カレンダー", Icon: IconCalendar },
  { href: "/report", label: "家計簿", Icon: IconChart },
  { href: "/menu", label: "メニュー", Icon: IconGrid },
];
const MAIN = ["/", "/calendar", "/report"];

function BottomNav() {
  const path = usePathname();
  const ui = useUI();
  const item = (n: (typeof NAV)[number]) => {
    // ホーム・カレンダー・取引履歴以外の画面は、すべて「メニュー」の中にある
    const active = n.href === "/menu" ? !MAIN.some((m) => (m === "/" ? path === "/" : path.startsWith(m))) : n.href === "/" ? path === "/" : path.startsWith(n.href);
    return (
      <Link
        key={n.href}
        href={n.href}
        aria-current={active ? "page" : undefined}
        className={`flex min-h-14 flex-1 flex-col items-center justify-center gap-0.5 text-[12px] font-semibold ${active ? "text-brand" : "text-ink-3"}`}
      >
        <n.Icon className="size-6" />
        {n.label}
      </Link>
    );
  };
  return (
    <nav aria-label="メイン" className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-surface/95 pb-[var(--sab)] backdrop-blur">
      <div className="mx-auto flex max-w-[480px] items-stretch px-2">
        {NAV.slice(0, 2).map(item)}
        <div className="flex flex-1 items-center justify-center">
          <button
            type="button"
            onClick={() => ui.openAdd({ date: path.startsWith("/calendar") ? (ui.calendarDate ?? undefined) : undefined })}
            className="-mt-6 inline-flex size-14 items-center justify-center rounded-full bg-brand text-brand-ink shadow-lg ring-4 ring-bg"
            aria-label="追加する（支出・収入・予定・やること）"
          >
            <IconPlus className="size-7" />
          </button>
        </div>
        {NAV.slice(2).map(item)}
      </div>
    </nav>
  );
}
