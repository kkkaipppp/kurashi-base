"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useSyncExternalStore } from "react";
import { IconChevronR, IconCoins, IconFile, IconFolder, IconHeart, IconLayers, IconNote, IconSearch, IconSettings, IconTarget, IconBook, PageHeader } from "./ui";
import { useData } from "@/lib/store";
import { MENU_ORDER_KEY, hubCategories, moveCategory, orderCategories, visibleItems, type HubCategory, type HubIcon } from "@/lib/menuHub";
import { cleanMenuHidden } from "@/lib/menuHidden";

const EVENT = "kb-menu-order";
const readOrder = () => {
  try {
    return localStorage.getItem(MENU_ORDER_KEY) ?? "";
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

const ICON: Record<HubIcon, typeof IconLayers> = { plan: IconLayers, goal: IconTarget, asset: IconCoins, contract: IconFile, health: IconHeart, memo: IconNote, document: IconFolder };

/**
 * 自分用のメニュー（To-Be 2026-11-27 02「メニュー: 計画、目標、資産、契約・固定費、健康、メモ、書類。3列アイコン、短い名称、編集、検索、設定、使い方」）。
 * - 分類を押すと、中に画面が1つならその画面へ、2つ以上なら分類の中の一覧を出す
 * - 「編集」で並び替え（端末ごとの表示の設定）。隠すのは設定の「メニューに出す機能」（記録は消えない）
 * - お気に入り・最近の一覧は、分類と重なるのでやめた（02「重複したお気に入り/最近の一覧は不要」）
 */
export function PersonalMenu() {
  const data = useData();
  const router = useRouter();
  const [q, setQ] = useState("");
  const [open, setOpen] = useState<HubCategory | null>(null);
  const [editing, setEditing] = useState(false);
  const hidden = new Set(cleanMenuHidden(data.prefs.menuHidden));
  const raw = useSyncExternalStore(subscribe, readOrder, () => "");
  const cats = orderCategories(hubCategories(), raw)
    .map((c) => ({ ...c, items: visibleItems(c, hidden) }))
    .filter((c) => c.items.length > 0);

  const saveOrder = (keys: string[]) => {
    try {
      localStorage.setItem(MENU_ORDER_KEY, JSON.stringify(keys));
      window.dispatchEvent(new Event(EVENT));
    } catch {
      /* 保存できない端末では、並びは元のまま */
    }
  };

  if (open) {
    return (
      <main className="space-y-3">
        <PageHeader
          title={open.label}
          right={
            <button type="button" onClick={() => setOpen(null)} className="min-h-11 px-2 text-[15px] font-semibold text-brand">
              メニュー
            </button>
          }
        />
        <ul className="divide-y divide-line border-y border-line">
          {open.items.map((i) => {
            const n = i.count?.(data);
            return (
              <li key={i.href}>
                <Link href={i.href} className="flex min-h-14 items-center gap-3 py-2">
                  <span className="min-w-0 flex-1 text-[16px] font-semibold">{i.label}</span>
                  {n !== undefined && n > 0 && <span className="num text-[14px] text-ink-3">{n}件</span>}
                  <IconChevronR className="size-4 shrink-0 text-ink-3" />
                </Link>
              </li>
            );
          })}
        </ul>
      </main>
    );
  }

  return (
    <main className="space-y-5">
      <PageHeader
        title="メニュー"
        right={
          <button type="button" onClick={() => setEditing((e) => !e)} aria-pressed={editing} className="min-h-11 px-2 text-[15px] font-semibold text-brand">
            {editing ? "完了" : "編集"}
          </button>
        }
      />
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

      {editing ? (
        <section aria-labelledby="m-edit">
          <h2 id="m-edit" className="mb-1 text-[14px] font-semibold text-ink-3">
            並び替え
          </h2>
          <ol className="divide-y divide-line border-y border-line">
            {cats.map((c, i) => (
              <li key={c.key} className="flex min-h-12 items-center gap-2">
                <span className="min-w-0 flex-1 text-[16px] font-semibold">{c.label}</span>
                <button type="button" disabled={i === 0} onClick={() => saveOrder(moveCategory(cats.map((x) => x.key), c.key, -1))} aria-label={`${c.label}を上へ`} className="size-11 text-[18px] text-ink-2 disabled:opacity-30">
                  ↑
                </button>
                <button type="button" disabled={i === cats.length - 1} onClick={() => saveOrder(moveCategory(cats.map((x) => x.key), c.key, 1))} aria-label={`${c.label}を下へ`} className="size-11 text-[18px] text-ink-2 disabled:opacity-30">
                  ↓
                </button>
              </li>
            ))}
          </ol>
          <p className="mt-2 text-[13px] text-ink-3">
            出す機能は<Link href="/settings#menu" className="underline">設定の「メニューに出す機能」</Link>で選びます。隠しても記録は消えません。
          </p>
        </section>
      ) : (
        <nav aria-label="機能">
          <ul className="grid grid-cols-3 gap-2">
            {cats.map((c) => {
              const Icon = ICON[c.icon];
              const one = c.items.length === 1 ? c.items[0] : null;
              const inner = (
                <>
                  <Icon className="size-7 text-brand" />
                  <span className="text-[14px] font-semibold leading-tight">{c.label}</span>
                </>
              );
              const cls = "flex min-h-24 w-full flex-col items-center justify-center gap-1.5 rounded-lg px-1 text-center hover:bg-surface-2";
              return (
                <li key={c.key}>
                  {one ? (
                    <Link href={one.href} className={cls}>
                      {inner}
                    </Link>
                  ) : (
                    <button type="button" onClick={() => setOpen(c)} className={cls}>
                      {inner}
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        </nav>
      )}

      <ul className="divide-y divide-line border-y border-line">
        {[
          { href: "/search", label: "検索", Icon: IconSearch },
          { href: "/settings", label: "設定", Icon: IconSettings },
          { href: "/guide", label: "使い方", Icon: IconBook },
        ].map((x) => (
          <li key={x.href}>
            <Link href={x.href} className="flex min-h-12 items-center gap-3">
              <x.Icon className="size-5 text-ink-3" />
              <span className="flex-1 text-[16px]">{x.label}</span>
              <IconChevronR className="size-4 text-ink-3" />
            </Link>
          </li>
        ))}
      </ul>
    </main>
  );
}
