"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { StoreProvider, useStore } from "@/lib/store";
import { LOST_STORE_PREFIX, NO_OLD_RECORDS } from "@/lib/lostStore";
import { UIProvider, useUI } from "./UIContext";
import { Button, IconBook, IconCalendar, IconChart, IconFlag, IconGrid, IconHome, IconList, IconMap, IconNote, IconPlus, IconRepeat, IconSearch, IconWallet } from "./ui";
import { AddSheet } from "./AddSheet";
import { useNavPrefs } from "./useNavPrefs";
import { activeNav, navItem, type AddKindId, type NavId } from "@/lib/navPrefs";
import { IS_PERSONAL } from "@/lib/edition";
import { LAUNCHED_KEY, START_KEY, parseStart, startRedirect } from "@/lib/startScreen";
import { todayStr } from "@/lib/date";

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <StoreProvider>
      <Gate>{children}</Gate>
    </StoreProvider>
  );
}

function Gate({ children }: { children: ReactNode }) {
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
      <div className="mx-auto min-h-dvh w-full max-w-[480px] px-4 pb-28">{children}</div>
      {IS_PERSONAL ? (
        <>
          <StartRedirect />
          <TabBar />
        </>
      ) : (
        <BottomNav />
      )}
    </UIProvider>
  );
}

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
            : "読み込めないデータを退避し、記録がない状態から始めます。実行しますか？";
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
  { href: "/report", label: "振り返り", Icon: IconChart },
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
    <nav aria-label="メイン" className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-surface/95 pb-[env(safe-area-inset-bottom)] backdrop-blur">
      <div className="mx-auto flex max-w-[480px] items-stretch px-2">
        {NAV.slice(0, 2).map(item)}
        <div className="flex flex-1 items-center justify-center">
          <button
            type="button"
            onClick={() => ui.openAdd({ date: path.startsWith("/calendar") ? (ui.calendarDate ?? undefined) : undefined })}
            className="-mt-6 inline-flex size-14 items-center justify-center rounded-full bg-brand text-brand-ink shadow-lg ring-4 ring-bg"
            aria-label="追加する（支出・収入・予定・タスク）"
          >
            <IconPlus className="size-7" />
          </button>
        </div>
        {NAV.slice(2).map(item)}
      </div>
    </nav>
  );
}

/** 自分用：起動したとき、設定で選んだ画面へ移る（o29 起動設定。このタブで最初に "/" を開いたときだけ） */
function StartRedirect() {
  const router = useRouter();
  const path = usePathname();
  useEffect(() => {
    let launched = true;
    let start = parseStart(null);
    try {
      launched = sessionStorage.getItem(LAUNCHED_KEY) === "1";
      sessionStorage.setItem(LAUNCHED_KEY, "1");
      start = parseStart(localStorage.getItem(START_KEY));
    } catch {
      /* 読めないときは移らない（ホームのまま） */
      return;
    }
    const to = startRedirect(path, location.search, start, launched);
    if (to) router.replace(to);
    // 起動のときの1回だけ見る
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return null;
}

const NAV_ICON: Record<NavId, typeof IconHome> = {
  calendar: IconCalendar,
  money: IconChart,
  tasks: IconList,
  more: IconGrid,
  study: IconBook,
  goals: IconFlag,
  trips: IconMap,
  search: IconSearch,
  notes: IconNote,
  home: IconHome,
  recurring: IconRepeat,
  assets: IconWallet,
};

/**
 * 自分用の下のメニュー（o31 F001・F002）：利用者が選んだ 1〜4 個の画面と、右端に固定の「追加」。
 * 「追加」は種類の一覧を開く（今の画面の種類とお気に入りが先頭）。画面の中の直接の追加（「この日に追加」など）は今までどおり
 */
function TabBar() {
  const path = usePathname();
  const router = useRouter();
  const ui = useUI();
  const { nav, fav } = useNavPrefs();
  const [adding, setAdding] = useState<{ date?: string; key: number } | null>(null);
  const current = activeNav(path, nav);
  const onPick = (k: AddKindId) => {
    const date = adding?.date;
    setAdding(null);
    if (k === "expense" || k === "income") ui.openTx({ mode: "new", type: k, date });
    else if (k === "event") ui.openEvent({ mode: "new", date });
    else if (k === "task") router.push(date && date !== todayStr() ? `/tasks?open=new&date=${date}` : "/tasks?open=new");
    else router.push(`${ADD_ROUTE[k]}?open=new`);
  };
  return (
    <>
      <nav aria-label="メイン" className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-surface pb-[env(safe-area-inset-bottom)]">
        <div className="mx-auto flex max-w-[480px] items-stretch px-1">
          {nav.map((id) => {
            const n = navItem(id);
            const Icon = NAV_ICON[id];
            const active = current === id;
            return (
              <Link
                key={id}
                href={n.href}
                aria-current={active ? "page" : undefined}
                className={`flex min-h-14 min-w-0 flex-1 flex-col items-center justify-center gap-0.5 text-[12px] font-semibold ${active ? "text-brand" : "text-ink-3"}`}
              >
                <Icon className="size-6" />
                <span className="max-w-full truncate">{n.label}</span>
              </Link>
            );
          })}
          {/* 右端に固定の「追加」（o31 C001。いつも最後の子要素） */}
          <button
            type="button"
            onClick={() => setAdding({ date: path.startsWith("/calendar") ? (ui.calendarDate ?? undefined) : undefined, key: Date.now() })}
            className="my-1 ml-1 flex min-h-12 min-w-16 flex-col items-center justify-center gap-0.5 rounded-lg bg-brand px-2 text-[12px] font-semibold text-brand-ink"
            data-testid="nav-add"
          >
            <IconPlus className="size-6" />
            追加
          </button>
        </div>
      </nav>
      {adding && <AddSheet key={adding.key} path={path} date={adding.date} fav={fav} onClose={() => setAdding(null)} onPick={onPick} />}
    </>
  );
}

/** 一覧の種類のうち、各画面の新規入力（?open=new）で開くもの */
const ADD_ROUTE: Record<Exclude<AddKindId, "expense" | "income" | "event" | "task">, string> = {
  study: "/study",
  goal: "/goals",
  note: "/notes",
  trip: "/trips",
};
