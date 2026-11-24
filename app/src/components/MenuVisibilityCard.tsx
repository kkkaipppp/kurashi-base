"use client";

import { Card, SectionTitle } from "./ui";
import { useUI } from "./UIContext";
import { useData, useStore } from "@/lib/store";
import { HIDEABLE_MENU, cleanMenuHidden } from "@/lib/menuHidden";

/** メニューに出す機能を選ぶ（自分用。NEXT v21 X16・D11）。隠しても、記録は消えない */
export function MenuVisibilityCard() {
  const data = useData();
  const store = useStore();
  const ui = useUI();
  const hidden = new Set(cleanMenuHidden(data.prefs.menuHidden));
  const toggle = (href: string) => {
    const next = new Set(hidden);
    if (next.has(href)) next.delete(href);
    else next.add(href);
    const r = store.setMenuHidden([...next]);
    if (!r.ok) ui.toast(r.error, "error");
  };
  return (
    <Card>
      <SectionTitle>メニューに出す機能</SectionTitle>
      <p className="mb-2 text-[13px] text-ink-3">使わない機能は、メニューから隠せます。隠しても、記録は消えません（検索・バックアップ・集計にも残ります）。</p>
      <ul className="divide-y divide-line">
        {HIDEABLE_MENU.map((m) => (
          <li key={m.href}>
            <label className="flex min-h-12 cursor-pointer items-center justify-between">
              <span className="text-[15px]">{m.label}</span>
              <input type="checkbox" checked={!hidden.has(m.href)} onChange={() => toggle(m.href)} aria-label={`${m.label}をメニューに出す`} className="size-5 accent-[var(--brand)]" />
            </label>
          </li>
        ))}
      </ul>
    </Card>
  );
}
