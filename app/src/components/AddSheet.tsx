"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Sheet } from "./Sheet";
import { useNavPrefs } from "./useNavPrefs";
import { formatDateJa, todayStr } from "@/lib/date";
import { ADD_KINDS, addOrder, type AddKindId } from "@/lib/navPrefs";

/** 日付を入力の初めの値に使う種類（ほかは日付を出さない。点検 指摘3） */
const USES_DATE: AddKindId[] = ["expense", "income", "event", "task", "note"];
/** 各画面の新規入力（?open=new）で開く種類 */
const ROUTE: Partial<Record<AddKindId, string>> = { task: "/tasks", study: "/study", goal: "/goals", note: "/notes", trip: "/trips" };

/**
 * 自分用の「追加」の一覧（UIContext から出す。右端の「追加」・カレンダーの「この日に追加」・?add=choose で同じ一覧）。
 * 支出・収入・予定は入力のシートを開き、ほかは各画面の新規入力へ（選んだ日を引き継ぐ）
 */
export function PersonalAddSheet({ date, onClose, openTx, openEvent }: { date?: string; onClose: () => void; openTx: (type: "expense" | "income", date?: string) => void; openEvent: (date?: string) => void }) {
  const path = usePathname();
  const router = useRouter();
  const { fav } = useNavPrefs();
  const pick = (k: AddKindId) => {
    onClose();
    if (k === "expense" || k === "income") return openTx(k, date);
    if (k === "event") return openEvent(date);
    const useDate = USES_DATE.includes(k) && date && date !== todayStr();
    router.push(`${ROUTE[k]}?open=new${useDate ? `&date=${date}` : ""}`);
  };
  return <AddSheet path={path} date={date} fav={fav} onClose={onClose} onPick={pick} />;
}

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
      <p className="mb-2 text-[14px] text-ink-2">支出・収入・予定・やること・メモは {formatDateJa(d, true)} で始めます（入力の中で変えられます）</p>
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
