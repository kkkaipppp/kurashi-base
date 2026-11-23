"use client";

import { useEffect, useRef } from "react";
import { Capacitor } from "@capacitor/core";
import { useData } from "@/lib/store";
import { todayStr } from "@/lib/date";
import { buildBackup } from "@/lib/backup";
import { buildWidgetSummary } from "@/lib/widgetSummary";
import { autoBackupDay, NativeBridge } from "@/lib/nativeBridge";

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

  // 自動バックアップと、日付が変わったときの要約の更新
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;
    const backup = () => {
      const now = new Date();
      const json = JSON.stringify(buildBackup(latest.current, now.toISOString()));
      NativeBridge.writeBackup({ day: autoBackupDay(todayStr(now)), json }).catch(() => {
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
