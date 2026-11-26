"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";
import { useUI } from "./UIContext";
import { IconBook, IconCalendar, IconChart, IconFlag, IconGrid, IconHome, IconList, IconMap, IconNote, IconPlus, IconRepeat, IconSearch, IconWallet } from "./ui";
import { useNavPrefs } from "./useNavPrefs";
import { activeNav, navItem, type NavId } from "@/lib/navPrefs";
import { MENU_RECENT_KEY, parseMenuRecent, pushRecent } from "@/lib/menuPrefs";
import { GROUPS } from "@/lib/menuGroups";
import { LAUNCHED_KEY, START_KEY, parseStart, startRedirect } from "@/lib/startScreen";

/** 自分用の外枠（AppShell から遅れて読む）：起動時の画面へ移る・最近開いた機能を控える・下のメニュー */
export function PersonalShell() {
  return (
    <>
      <StartRedirect />
      <RecentTracker />
      <TabBar />
    </>
  );
}

const MENU_HREFS = GROUPS.flatMap((g) => g.items.filter((i) => !i.soon).map((i) => i.href.split("#")[0]));

/** 自分用：開いた機能を「最近開いた機能」に控える（端末の表示の設定。メニューに無い画面は控えない。o31 F003） */
function RecentTracker() {
  const path = usePathname();
  useEffect(() => {
    const seg = "/" + (path.split("/")[1] ?? "");
    if (seg === "/" || seg === "/menu" || seg === "/settings") return;
    try {
      const next = pushRecent(parseMenuRecent(localStorage.getItem(MENU_RECENT_KEY), [seg, ...MENU_HREFS]), path, MENU_HREFS);
      localStorage.setItem(MENU_RECENT_KEY, JSON.stringify(next));
    } catch {
      /* 控えられない端末では「最近」を出さないだけ */
    }
  }, [path]);
  return null;
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
  const ui = useUI();
  const { nav } = useNavPrefs();
  const current = activeNav(path, nav);
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
                {/* 選んでいるタブは、色に加えて上の線でも示す（色だけで伝えない。点検 指摘10） */}
                <span aria-hidden="true" className={`mb-0.5 h-0.5 w-6 rounded-full ${active ? "bg-brand" : "bg-transparent"}`} />
                <Icon className="size-6" />
                <span className={`max-w-full truncate ${active ? "font-bold" : ""}`}>{n.label}</span>
              </Link>
            );
          })}
          {/* 右端に固定の「追加」（o31 C001。いつも最後の子要素） */}
          <button
            type="button"
            onClick={() => ui.openAdd({ date: path.startsWith("/calendar") ? (ui.calendarDate ?? undefined) : undefined })}
            className="my-1 ml-1 flex min-h-12 min-w-16 flex-col items-center justify-center gap-0.5 rounded-lg bg-brand px-2 text-[12px] font-semibold text-brand-ink"
            data-testid="nav-add"
          >
            <IconPlus className="size-6" />
            追加
          </button>
        </div>
      </nav>
    </>
  );
}
