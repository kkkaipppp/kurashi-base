"use client";

import { useEffect, useRef, useState } from "react";
import { Capacitor } from "@capacitor/core";
import { useData } from "@/lib/store";
import { todayStr } from "@/lib/date";
import { buildBackup } from "@/lib/backup";
import { buildWidgetSummary } from "@/lib/widgetSummary";
import { buildCalendarItems, calendarWindow } from "@/lib/calendarExport";
import { autoBackupDay, backupRecordCount, NativeBridge } from "@/lib/nativeBridge";
import { buildReminders } from "@/lib/reminders";
import { loadReminderSettings } from "@/lib/reminderStore";
import { errorText, recordSync } from "@/lib/nativeSyncStatus";
import { calendarOutcome, reminderOutcome, shouldSyncCalendar, shouldSyncReminders, shouldWriteBackup } from "@/lib/nativeSyncPlan";

/**
 * iPhone アプリの中だけで動く部品（Web 版では何もしない）。
 * - 記録が変わるたびに、ウィジェット用の要約を渡す
 * - その日の自動バックアップを書く（アプリを開いたとき・閉じるとき。1日1ファイル、14日分）
 * どちらも端末の中にだけ置き、外へは送らない。
 */
export function WidgetSync() {
  const data = useData();
  const latest = useRef(data);
  useEffect(() => {
    latest.current = data;
  }, [data]);

  // ウィジェットの要約
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;
    const json = JSON.stringify(buildWidgetSummary(data, todayStr(), new Date().toISOString()));
    NativeBridge.setSummary({ json })
      .then(() => recordSync("summary", true))
      .catch((e) => {
        // ウィジェットに渡せなくても、記録の保存には影響しない（失敗は設定の「iPhone の連携」に出す）
        recordSync("summary", false, errorText(e));
      });
  }, [data]);

  // iPhone のカレンダーへの反映（記録が変わって3秒たったら。中身が前と同じなら書かない）
  const lastCalendar = useRef("");
  const calendarBusy = useRef(false);
  /** 書き込みの最中に記録が変わった（終わったら、もう一度見る。点検 中-2） */
  const calendarAgain = useRef(false);
  const lastReminders = useRef("");
  // 設定の「カレンダーに反映し直す」（components/NativeStatusCard.tsx）
  const [resync, setResync] = useState(0);
  const immediate = useRef(false);
  useEffect(() => {
    const on = () => {
      lastCalendar.current = "";
      immediate.current = true;
      setResync((n) => n + 1);
      // 書き込みの最中だったら、この合図は捨てられるので、少しあとにもう一度だけやる
      if (calendarBusy.current) {
        setTimeout(() => {
          lastCalendar.current = "";
          immediate.current = true;
          setResync((n) => n + 1);
        }, 5000);
      }
    };
    window.addEventListener("kb-calendar-resync", on);
    return () => window.removeEventListener("kb-calendar-resync", on);
  }, []);
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;
    // 記録が0件のときは、もう書いた予定を消さない（消すのは設定の「入れた予定を消す」。lib/nativeSyncPlan.ts）
    if (!shouldSyncCalendar(data)) return;
    const t = setTimeout(() => {
      const today = todayStr();
      const json = JSON.stringify(buildCalendarItems(data, today));
      const { from, to } = calendarWindow(today);
      const key = `${from}|${to}|${json}`;
      if (key === lastCalendar.current) return;
      if (calendarBusy.current) {
        calendarAgain.current = true;
        return;
      }
      calendarBusy.current = true;
      NativeBridge.syncCalendar({ from, to, json })
        .then((r) => {
          lastCalendar.current = key;
          const o = calendarOutcome(r);
          recordSync("calendar", o.ok, o.detail);
        })
        .catch((e) => {
          // カレンダーへのアクセスを許可していないときなど。記録には影響しない（失敗は設定に出す）
          recordSync("calendar", false, errorText(e));
        })
        .finally(() => {
          calendarBusy.current = false;
          // 書いているあいだに記録が変わっていたら、もう一度見る（同じ中身なら書かない）
          if (calendarAgain.current) {
            calendarAgain.current = false;
            setResync((n) => n + 1);
          }
        });
    }, immediate.current ? 0 : 3000);
    immediate.current = false;
    return () => clearTimeout(t);
  }, [data, resync]);

  // 通知（記録か設定が変わって3秒たったら、いま必要なものに入れ替える。完了・変更・削除は、この入れ替えで取り消される。NEXT v21 X13）
  const [remindTick, setRemindTick] = useState(0);
  useEffect(() => {
    const on = () => setRemindTick((n) => n + 1);
    // 設定アプリで許可を変えて戻ってきたときも、入れ替える
    const onVisible = () => {
      if (document.visibilityState !== "visible") return;
      lastReminders.current = "";
      on();
    };
    window.addEventListener("kb-reminders-changed", on);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.removeEventListener("kb-reminders-changed", on);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;
    // 記録が0件でも入れ替える（消した予定・タスクの通知を残さない。lib/nativeSyncPlan.ts）
    if (!shouldSyncReminders()) return;
    const t = setTimeout(() => {
      const settings = loadReminderSettings();
      const now = new Date();
      const p = (n: number) => String(n).padStart(2, "0");
      const nowIso = `${todayStr(now)}T${p(now.getHours())}:${p(now.getMinutes())}:00`;
      const list = buildReminders(data, nowIso, settings);
      const json = JSON.stringify(list);
      // オフで、前もオフだったときは、何も呼ばない（許可を聞かないため）
      if (!settings.on && lastReminders.current === "off") return;
      if (json === lastReminders.current) return;
      NativeBridge.scheduleReminders({ json })
        .then((r) => {
          // 拒否・一部の失敗のときは「登録した」とせず、次の機会（許可されたあと・前面に戻ったとき）にもう一度入れ替える
          const o = reminderOutcome(r, settings.on, list.length);
          if (o.done) lastReminders.current = settings.on ? json : "off";
          recordSync("reminders", o.ok, o.detail);
        })
        .catch((e) => {
          // 通知を登録できなくても、記録には影響しない（失敗は設定に出す。消した予定の通知が残っていることがある）
          recordSync("reminders", false, `${errorText(e)}。消した予定の通知が残っていることがあります`);
        });
    }, 3000);
    return () => clearTimeout(t);
  }, [data, remindTick]);

  // 自動バックアップと、日付が変わったときの要約の更新
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;
    // 前に書いたときのデータと日付（同じなら、もう一度書かない）
    let last: { data: typeof latest.current; day: string } | null = null;
    const backup = () => {
      const now = new Date();
      const data = latest.current;
      const day = autoBackupDay(todayStr(now));
      // 記録が空のとき（iOS に記録を消された・すべて削除した直後など）は書かない。良いバックアップを空で上書きしないため。
      // 前に書いたときから中身も日付も変わっていなければ、書かない（lib/nativeSyncPlan.ts）
      if (!shouldWriteBackup(last, data, day)) return;
      const file = buildBackup(data, now.toISOString());
      const records = backupRecordCount(file.counts);
      if (records === 0) return;
      NativeBridge.writeBackup({ day, json: JSON.stringify(file), records })
        .then(() => {
          last = { data, day };
          recordSync("backup", true);
        })
        .catch((e) => {
          // 書けなくても記録には影響しない（設定の「バックアップを書き出す」は今までどおり使える。失敗は設定に出す）
          recordSync("backup", false, errorText(e));
        });
    };
    const onVisibility = () => {
      if (document.visibilityState === "hidden") backup();
      else {
        const json = JSON.stringify(buildWidgetSummary(latest.current, todayStr(), new Date().toISOString()));
        NativeBridge.setSummary({ json })
          .then(() => recordSync("summary", true))
          .catch((e) => recordSync("summary", false, errorText(e)));
        backup();
        // 前面に戻ったら、カレンダーも見直す（日付が変わった・書き込みの途中で閉じた。同じ中身なら書かない。点検 中-2）
        setResync((n) => n + 1);
      }
    };
    backup();
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, []);

  return null;
}
