"use client";

import { useCallback, useEffect, useState } from "react";
import { Card, SectionTitle } from "./ui";
import { useUI } from "./UIContext";
import { loadReminderSettings, saveReminderSettings } from "@/lib/reminderStore";
import { DEFAULT_REMINDERS, type ReminderSettings } from "@/lib/reminders";

/**
 * 通知の設定（iPhone アプリの中だけ。NEXT v21 X13）。通知は、本人が決めた設定の通りだけ。
 * 予定・固定費・タスク・契約の項目に従属し、直す・消す・完了にすると取り消される。拒否されても、アプリの基本は使える。
 */
type Bridge = { nativePromise?: (plugin: string, method: string, options?: object) => Promise<Record<string, unknown>> };
const call = (method: string, options: object = {}) => {
  const cap = (window as unknown as { Capacitor?: Bridge }).Capacitor;
  if (!cap?.nativePromise) return Promise.reject(new Error("no native"));
  return cap.nativePromise("WidgetBridge", method, options);
};

const sel = "min-h-11 w-full rounded-xl border border-line bg-surface px-3 text-[15px]";

export function NotifyCard() {
  const ui = useUI();
  const [s, setS] = useState<ReminderSettings>(DEFAULT_REMINDERS);
  const [access, setAccess] = useState<"granted" | "denied" | "notDetermined" | null>(null);
  const [pending, setPending] = useState(0);

  const refresh = useCallback(() => {
    call("reminderStatus")
      .then((r) => {
        setAccess(r.access as "granted" | "denied" | "notDetermined");
        setPending(Number(r.pending ?? 0));
      })
      .catch(() => setAccess(null));
  }, []);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- 開いたあとに、保存してある設定と、通知の許可を読む
    setS(loadReminderSettings());
    refresh();
  }, [refresh]);

  const update = (next: ReminderSettings) => {
    setS(next);
    if (!saveReminderSettings(next)) ui.toast("設定を保存できませんでした", "error");
    window.dispatchEvent(new Event("kb-reminders-changed"));
    setTimeout(refresh, 4500);
  };
  const toggle = async (on: boolean) => {
    if (on) {
      // オンにしたときだけ、許可を聞く
      try {
        const r = await call("requestReminderPermission");
        if (r.granted !== true) ui.toast("通知が許可されていません。iPhone の「設定」→「くらしベース」→「通知」で許可すると、使えます", "error");
      } catch {
        /* 聞けなくても、設定は保存する */
      }
    }
    update({ ...s, on });
  };

  return (
    <Card>
      <SectionTitle>通知</SectionTitle>
      <p className="text-[13px] text-ink-2">予定・固定費の支払日・タスクの期限・契約の更新日を、iPhone の通知で知らせます。端末の中だけで動き、外へは送りません。予定などを直す・消す・完了にすると、通知も取り消されます。</p>
      <label className="mt-2 flex min-h-12 cursor-pointer items-center justify-between">
        <span className="text-[15px] font-semibold">通知を使う</span>
        <input type="checkbox" checked={s.on} onChange={(e) => toggle(e.target.checked)} className="size-5 accent-[var(--brand)]" aria-label="通知を使う" />
      </label>
      {s.on && access === "denied" && <p className="mt-1 rounded-xl bg-warn-soft px-3 py-2 text-[13px] text-warn">iPhone の「設定」→「くらしベース」→「通知」で許可すると、通知が届きます。</p>}
      {s.on && (
        <div className="mt-2 space-y-3">
          <label className="block text-[13px]">
            <span className="mb-0.5 block font-semibold text-ink-2">予定の知らせ</span>
            <select value={s.eventLead} onChange={(e) => update({ ...s, eventLead: Number(e.target.value) })} className={sel}>
              <option value={0}>知らせない</option>
              <option value={10}>10分前</option>
              <option value={30}>30分前</option>
              <option value={60}>1時間前</option>
            </select>
          </label>
          <label className="flex min-h-11 cursor-pointer items-center justify-between text-[14px]">
            固定費の支払日の朝
            <input type="checkbox" checked={s.fixedMorning} onChange={(e) => update({ ...s, fixedMorning: e.target.checked })} className="size-5 accent-[var(--brand)]" />
          </label>
          <label className="flex min-h-11 cursor-pointer items-center justify-between text-[14px]">
            タスクの期限の日の朝
            <input type="checkbox" checked={s.taskMorning} onChange={(e) => update({ ...s, taskMorning: e.target.checked })} className="size-5 accent-[var(--brand)]" />
          </label>
          <label className="block text-[13px]">
            <span className="mb-0.5 block font-semibold text-ink-2">契約の更新日の前</span>
            <select value={s.contractDays} onChange={(e) => update({ ...s, contractDays: Number(e.target.value) })} className={sel}>
              <option value={0}>知らせない</option>
              <option value={3}>3日前の朝</option>
              <option value={7}>7日前の朝</option>
              <option value={14}>14日前の朝</option>
            </select>
          </label>
          <div className="grid grid-cols-3 gap-2 text-[13px]">
            <label className="block">
              <span className="mb-0.5 block font-semibold text-ink-2">朝の時刻</span>
              <select value={s.morning} onChange={(e) => update({ ...s, morning: e.target.value })} className={sel}>
                {["07:00", "08:00", "09:00"].map((t) => (
                  <option key={t}>{t}</option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="mb-0.5 block font-semibold text-ink-2">静かな時間（から）</span>
              <select value={s.quietFrom} onChange={(e) => update({ ...s, quietFrom: e.target.value })} className={sel}>
                {["21:00", "22:00", "23:00"].map((t) => (
                  <option key={t}>{t}</option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="mb-0.5 block font-semibold text-ink-2">（まで）</span>
              <select value={s.quietTo} onChange={(e) => update({ ...s, quietTo: e.target.value })} className={sel}>
                {["06:00", "07:00", "08:00"].map((t) => (
                  <option key={t}>{t}</option>
                ))}
              </select>
            </label>
          </div>
          <p className="text-[12px] text-ink-3">静かな時間に入る通知は、その時間が終わる時刻にずらします（なくしません）。</p>
          <label className="flex min-h-11 cursor-pointer items-center justify-between text-[14px]">
            <span>ロック画面に内容を出さない</span>
            <input type="checkbox" checked={s.hideDetail} onChange={(e) => update({ ...s, hideDetail: e.target.checked })} className="size-5 accent-[var(--brand)]" />
          </label>
          <p className="num text-[12px] text-ink-3">登録している通知：{pending}件（近い2週間の分。入れ替えのたびに更新します）</p>
        </div>
      )}
    </Card>
  );
}
