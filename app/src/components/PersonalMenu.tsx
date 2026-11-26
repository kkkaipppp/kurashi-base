"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useSyncExternalStore } from "react";
import { IconChevronR, PageHeader } from "./ui";
import { useData } from "@/lib/store";
import { GROUPS, type MenuItem } from "@/lib/menuGroups";
import { MENU_FAV_KEY, MENU_RECENT_KEY, parseMenuFav, parseMenuRecent, toggleMenuFav } from "@/lib/menuPrefs";

const EVENT = "kb-menu-prefs";
const read = (k: string) => {
  try {
    return localStorage.getItem(k) ?? "";
  } catch {
    return "";
  }
};
const subscribe = (cb: () => void) => {
  window.addEventListener(EVENT, cb);
  window.addEventListener("storage", cb);
  return () => {
    window.removeEventListener(EVENT, cb);
    window.removeEventListener("storage", cb);
  };
};

/**
 * 自分用の「すべての機能」（o31 F003・o30 02）：検索・お気に入り・最近・すべての機能・設定。
 * お気に入りは星で選ぶ（自動で並べ替えない）。隠した機能は出さない（設定の「メニューに出す機能」で戻せる。記録は消えない）
 */
export function PersonalMenu() {
  const data = useData();
  const router = useRouter();
  const [q, setQ] = useState("");
  const hidden = new Set(data.prefs.menuHidden ?? []);
  const groups = GROUPS.map((g) => ({ ...g, items: g.items.filter((i) => !hidden.has(i.href)) })).filter((g) => g.items.length > 0);
  const usable = groups.flatMap((g) => g.items).filter((i) => !i.soon);
  const known = usable.map((i) => i.href);
  const favRaw = useSyncExternalStore(subscribe, () => read(MENU_FAV_KEY), () => "");
  const recentRaw = useSyncExternalStore(subscribe, () => read(MENU_RECENT_KEY), () => "");
  const fav = parseMenuFav(favRaw, known);
  const recent = parseMenuRecent(recentRaw, known).filter((h) => !fav.includes(h));
  const byHref = (h: string) => usable.find((i) => i.href === h)!;
  const toggle = (href: string) => {
    try {
      localStorage.setItem(MENU_FAV_KEY, JSON.stringify(toggleMenuFav(fav, href)));
      window.dispatchEvent(new Event(EVENT));
    } catch {
      /* 保存できない端末では、お気に入りは使えない（一覧はそのまま使える） */
    }
  };
  const row = (i: MenuItem, star = true) => {
    const n = i.count?.(data);
    const on = fav.includes(i.href);
    return (
      <li key={i.href} className="flex items-center">
        <Link href={i.href} className="flex min-h-12 min-w-0 flex-1 items-center gap-3 py-1 hover:bg-surface-2">
          <span className="min-w-0 flex-1">
            <span className="block text-[16px] font-semibold">
              {i.label}
              {i.soon && <span className="ml-1.5 text-[13px] font-normal text-ink-3">準備中</span>}
            </span>
            <span className="block truncate text-[13px] text-ink-3">{i.desc}</span>
          </span>
          {n !== undefined && n > 0 && <span className="num text-[14px] text-ink-3">{n}件</span>}
          <IconChevronR className="size-4 shrink-0 text-ink-3" />
        </Link>
        {star && !i.soon && (
          <button type="button" onClick={() => toggle(i.href)} aria-pressed={on} aria-label={`${i.label}をお気に入りに${on ? "入れない" : "入れる"}`} className={`inline-flex size-11 shrink-0 items-center justify-center text-[20px] ${on ? "text-brand" : "text-ink-3"}`}>
            {on ? "★" : "☆"}
          </button>
        )}
      </li>
    );
  };
  return (
    <main className="space-y-5">
      <PageHeader title="すべての機能" />
      <form
        role="search"
        onSubmit={(e) => {
          e.preventDefault();
          router.push(q.trim() ? `/search?q=${encodeURIComponent(q.trim())}` : "/search");
        }}
      >
        <label htmlFor="menu-q" className="sr-only">
          記録を検索
        </label>
        <input id="menu-q" type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="記録を検索" className="min-h-12 w-full rounded-lg border border-line bg-surface px-3" enterKeyHint="search" />
      </form>

      {fav.length > 0 && (
        <section aria-labelledby="m-fav">
          <h2 id="m-fav" className="mb-1 text-[14px] font-semibold text-ink-3">
            お気に入り
          </h2>
          <ul className="divide-y divide-line border-y border-line">{fav.map((h) => row(byHref(h)))}</ul>
        </section>
      )}
      {recent.length > 0 && (
        <section aria-labelledby="m-recent">
          <h2 id="m-recent" className="mb-1 text-[14px] font-semibold text-ink-3">
            最近開いた機能
          </h2>
          <ul className="divide-y divide-line border-y border-line">{recent.map((h) => row(byHref(h), false))}</ul>
        </section>
      )}
      {groups.map((g) => {
        const soon = g.items.every((i) => i.soon);
        const list = <ul className="divide-y divide-line border-y border-line">{g.items.map((i) => row(i))}</ul>;
        if (soon)
          return (
            <details key={g.title}>
              <summary className="flex min-h-11 cursor-pointer items-center text-[14px] font-semibold text-ink-3">準備中のもの（{g.items.length}件）</summary>
              {list}
            </details>
          );
        return (
          <section key={g.title} aria-labelledby={`m-${g.title}`}>
            <h2 id={`m-${g.title}`} className="mb-1 text-[14px] font-semibold text-ink-3">
              {g.title}
            </h2>
            {list}
          </section>
        );
      })}
    </main>
  );
}
