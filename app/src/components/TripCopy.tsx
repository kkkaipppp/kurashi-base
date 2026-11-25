"use client";

import { useState } from "react";
import { Sheet } from "./Sheet";
import { Button, Field, inputCls } from "./ui";
import { useUI } from "./UIContext";
import { useData, useStore } from "@/lib/store";
import { cloneTrip } from "@/lib/tripTemplate";
import { formatDateJa, todayStr } from "@/lib/date";
import type { Trip } from "@/lib/types";

/**
 * 旅行を元に新しい旅行を作る（自分用。NEXT v21 X17）。計画だけを複製し、支出・完了・実績は複製しない。
 * 出発日を選ぶと、旅行と行程の日付を同じだけずらす。
 */
export function TripCopy({ trip, onClose, onCreated }: { trip: Trip; onClose: () => void; onCreated: (id: string) => void }) {
  const data = useData();
  const store = useStore();
  const ui = useUI();
  const [start, setStart] = useState(todayStr());
  const n = data.events.filter((e) => e.tripId === trip.id).length;
  const go = async () => {
    // 作るときに使ったデータ（base）を保存に渡す。保存の時点で最新と違えば、古い内容で上書きしない（o11 A06 点検 中-1）
    const base = store.data ?? data;
    const c = cloneTrip(base, trip.id, start, new Date().toISOString());
    if (!c.ok) return ui.toast(c.error, "error");
    // 取り消しの控えを残して保存する（設定の「直前の操作を取り消す」で戻せる）
    const r = await store.replaceAll(c.next, `旅行「${trip.title}」を元に新しい旅行を作る`, base);
    if (!r.ok) return ui.toast(r.error, "error");
    ui.toast(`「${trip.title}」を元に、行程${c.events}件の新しい旅行を作りました`);
    onCreated(c.tripId);
  };
  return (
    <Sheet
      title="この旅行を元に新しい旅行を作る"
      open
      onRequestClose={onClose}
      footer={
        <div className="grid grid-cols-2 gap-2">
          <Button variant="secondary" onClick={onClose}>
            やめる
          </Button>
          <Button onClick={go} disabled={!start}>
            作る
          </Button>
        </div>
      }
    >
      <p className="mb-3 text-[13px] text-ink-2">
        「{trip.title}」の行き先・予算・メモと、行程の予定{n}件を、新しい旅行にコピーします。日付は、出発日に合わせて同じだけずらします。
      </p>
      <Field label="新しい出発日" htmlFor="trip-copy-start">
        <input id="trip-copy-start" type="date" value={start} onChange={(e) => setStart(e.target.value)} className={inputCls} />
      </Field>
      <ul className="mt-3 list-disc space-y-0.5 pl-5 text-[12px] text-ink-3">
        <li>元の旅行と行程は変わりません</li>
        <li>つないだ支出・持ち物のチェック・完了は、コピーしません（持ち物は未チェックに戻します）</li>
        {start && <li>{formatDateJa(start, true)}出発の旅行になります</li>}
      </ul>
    </Sheet>
  );
}
