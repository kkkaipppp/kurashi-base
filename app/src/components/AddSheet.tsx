"use client";

import Link from "next/link";
import { Sheet } from "./Sheet";
import { formatDateJa, todayStr } from "@/lib/date";
import { ADD_KINDS, addOrder, type AddKindId } from "@/lib/navPrefs";

/**
 * 自分用：右端の「追加」から開く種類の一覧（o31 F002・o30 D007）。
 * 今の画面に合う種類とお気に入りを先頭に、残りをその下に出す。選ぶまで何も保存しない。
 * 選んだ日（カレンダー）を入力の初めの値に引き継ぐ。閉じれば元の画面のまま。
 */
export function AddSheet({ path, date, fav, onClose, onPick }: { path: string; date?: string; fav: AddKindId[]; onClose: () => void; onPick: (k: AddKindId) => void }) {
  const { top, rest } = addOrder(path, fav);
  const d = date ?? todayStr();
  const row = (id: AddKindId) => {
    const k = ADD_KINDS.find((x) => x.id === id)!;
    return (
      <li key={id}>
        <button type="button" onClick={() => onPick(id)} className="flex min-h-14 w-full items-center justify-between gap-3 px-1 text-left hover:bg-surface-2">
          <span className="text-[16px] font-semibold">{k.label}</span>
          <span className="text-[14px] text-ink-3">{k.desc}</span>
        </button>
      </li>
    );
  };
  return (
    <Sheet title="追加" open onRequestClose={onClose}>
      <p className="mb-2 text-[14px] text-ink-2">日付：{formatDateJa(d, true)}</p>
      <ul className="divide-y divide-line border-y border-line">{top.map(row)}</ul>
      <h3 className="mt-4 mb-1 text-[14px] font-semibold text-ink-3">ほかの種類</h3>
      <ul className="divide-y divide-line border-y border-line">{rest.map(row)}</ul>
      <p className="mt-3 text-right">
        <Link href="/settings#nav" onClick={onClose} className="inline-flex min-h-11 items-center text-[14px] font-semibold text-brand">
          よく使う種類を変える
        </Link>
      </p>
    </Sheet>
  );
}
