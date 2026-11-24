"use client";

import { useEffect, useRef } from "react";
import { Capacitor } from "@capacitor/core";
import { useData } from "@/lib/store";
import { todayStr } from "@/lib/date";
import { buildBackup } from "@/lib/backup";
import { buildWidgetSummary } from "@/lib/widgetSummary";
import { buildCalendarItems, calendarWindow } from "@/lib/calendarExport";
import { autoBackupDay, backupRecordCount, NativeBridge } from "@/lib/nativeBridge";

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
    NativeBridge.setSummary({ json }).catch(() => {
      // ウィジェットに渡せなくても、記録の保存には影響しない
    });
  }, [data]);

  // iPhone のカレンダーへの反映（記録が変わって3秒たったら。中身が前と同じなら書かない）
  const lastCalendar = useRef("");
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;
    const t = setTimeout(() => {
      const today = todayStr();
      const json = JSON.stringify(buildCalendarItems(data, today));
      const { from, to } = calendarWindow(today);
      const key = `${from}|${to}|${json}`;
      if (key === lastCalendar.current) return;
      NativeBridge.syncCalendar({ from, to, json })
        .then(() => {
          lastCalendar.current = key;
        })
        .catch(() => {
          // カレンダーへのアクセスを許可していないときなど。記録には影響しない
        });
    }, 3000);
    return () => clearTimeout(t);
  }, [data]);

  // 自動バックアップと、日付が変わったときの要約の更新
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;
    const backup = () => {
      const now = new Date();
      const file = buildBackup(latest.current, now.toISOString());
      const records = backupRecordCount(file.counts);
      // 記録が空のとき（iOS に記録を消された・すべて削除した直後など）は書かない。良いバックアップを空で上書きしないため
      if (records === 0) return;
      NativeBridge.writeBackup({ day: autoBackupDay(todayStr(now)), json: JSON.stringify(file), records }).catch(() => {
        // 書けなくても記録には影響しない（設定の「バックアップを書き出す」は今までどおり使える）
      });
    };
    const onVisibility = () => {
      if (document.visibilityState === "hidden") backup();
      else {
        const json = JSON.stringify(buildWidgetSummary(latest.current, todayStr(), new Date().toISOString()));
        NativeBridge.setSummary({ json }).catch(() => {});
        backup();
      }
    };
    backup();
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, []);

  return null;
}
