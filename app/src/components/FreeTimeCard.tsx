"use client";

import { ACTIVE_FROM, ACTIVE_TO, freeSlots } from "@/lib/freeTime";
import { useData } from "@/lib/store";

/** 選んだ日の、予定のない時間帯（自分用。NEXT v21 X10）。自由時間と断定しない・無断で何も登録しない */
export function FreeTimeCard({ date }: { date: string }) {
  const data = useData();
  const slots = freeSlots(data, date);
  const fmt = (m: number) => (m >= 60 ? `${Math.floor(m / 60)}時間${m % 60 ? `${m % 60}分` : ""}` : `${m}分`);
  return (
    <section className="rounded-xl bg-surface-2 px-3 py-2" aria-label="予定のない時間帯">
      <h3 className="text-[13px] font-semibold text-ink-2">予定のない時間帯（{ACTIVE_FROM}〜{ACTIVE_TO}の目安）</h3>
      {slots.length === 0 ? (
        <p className="mt-0.5 text-[13px] text-ink-3">30分以上、予定のない時間はありません</p>
      ) : (
        <ul className="num mt-0.5 flex flex-wrap gap-x-4 gap-y-0.5 text-[14px]">
          {slots.map((s) => (
            <li key={s.from}>
              {s.from}〜{s.to}
              <span className="ml-1 text-[12px] text-ink-3">（{fmt(s.minutes)}）</span>
            </li>
          ))}
        </ul>
      )}
      <p className="mt-1 text-[12px] text-ink-3">時刻つきの予定だけを見ています。食事・休息・移動は入っていないので、空き＝自由な時間とは限りません。</p>
    </section>
  );
}
