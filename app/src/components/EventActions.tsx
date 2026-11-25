"use client";

import { useRef } from "react";
import { Button } from "./ui";
import { useUI } from "./UIContext";
import { useStore } from "@/lib/store";
import { occursOn } from "@/lib/aggregate";
import { formatDateJa, todayStr } from "@/lib/date";
import { canShift, isDoneOn, occurrenceKey, shiftEvent, toggleDoneOn } from "@/lib/eventOps";
import type { CalendarEvent } from "@/lib/types";

/**
 * 予定の完了・延期（自分用。NEXT v21 X06：予定にも完了と延期。ID は変えない）。
 * - 完了は、その回の日付ごと（繰り返す予定は、1回だけ完了できる）。完了だけでは、支出・学習時間・成果は作らない（X08）
 * - 延期は、繰り返さない予定だけ。日付をずらすだけで、ほかは変えない
 */
export function EventActions({ ev, day, onClose }: { ev: CalendarEvent; day?: string; onClose: () => void }) {
  const store = useStore();
  const ui = useUI();
  const today = todayStr();
  // どの回か：開いた日 → 今日にある回 → 開始日
  const date = occurrenceKey(ev, day ?? (occursOn(ev, today) ? today : ev.startDate));
  const done = isDoneOn(ev, date);
  const repeating = !canShift(ev);
  // 二重押しで2日分ずれないように（保存の完了を待つ間は押せない。o11 A06 点検 低-1）
  const lockRef = useRef(false);
  const apply = async (fn: (e: CalendarEvent, ts: string) => CalendarEvent | null, msg: string) => {
    if (lockRef.current) return false;
    lockRef.current = true;
    try {
      return await applyOnce(fn, msg);
    } finally {
      lockRef.current = false;
    }
  };
  const applyOnce = async (fn: (e: CalendarEvent, ts: string) => CalendarEvent | null, msg: string) => {
    const ts = new Date().toISOString();
    const r = await store.commit((d) => ({ ...d, events: d.events.map((e) => (e.id === ev.id ? (fn(e, ts) ?? e) : e)) }));
    ui.toast(r.ok ? msg : r.error, r.ok ? "ok" : "error");
    return r.ok;
  };
  return (
    <div className="space-y-2 rounded-xl bg-surface-2 p-3">
      <Button variant={done ? "secondary" : "primary"} className="w-full" onClick={() => apply((e, ts) => toggleDoneOn(e, date, ts), done ? "完了を取り消しました" : "完了にしました")}>
        {done ? "完了を取り消す" : `完了にする${repeating ? `（${formatDateJa(date)}の分）` : ""}`}
      </Button>
      {!repeating && (
        <div className="grid grid-cols-2 gap-2">
          <Button
            variant="secondary"
            onClick={async () => {
              if (await apply((e, ts) => shiftEvent(e, 1, ts), "1日あとにしました")) onClose();
            }}
          >
            明日へ延期
          </Button>
          <Button
            variant="secondary"
            onClick={async () => {
              if (await apply((e, ts) => shiftEvent(e, 7, ts), "1週間あとにしました")) onClose();
            }}
          >
            来週へ延期
          </Button>
        </div>
      )}
      {repeating && <p className="text-[12px] text-ink-3">繰り返す予定は、その回の完了だけできます（延期は、編集で日付を変えてください）。</p>}
    </div>
  );
}
