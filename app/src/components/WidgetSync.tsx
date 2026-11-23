"use client";

import { useEffect } from "react";
import { Capacitor, registerPlugin } from "@capacitor/core";
import { useData } from "@/lib/store";
import { todayStr } from "@/lib/date";
import { buildWidgetSummary } from "@/lib/widgetSummary";

/** iPhone アプリの中だけにある、ウィジェットへ要約を渡す部品（ios/App/App/WidgetBridgePlugin.swift） */
interface WidgetBridge {
  setSummary(options: { json: string }): Promise<void>;
}
const WidgetBridge = registerPlugin<WidgetBridge>("WidgetBridge");

/**
 * 記録が変わるたびに、ウィジェット用の要約をアプリに渡す。
 * Web 版（Safari・ホーム画面のアイコン）では何もしない。要約は端末の中（App Group）にだけ置き、外へは送らない。
 */
export function WidgetSync() {
  const data = useData();
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;
    const send = () => {
      const json = JSON.stringify(buildWidgetSummary(data, todayStr(), new Date().toISOString()));
      WidgetBridge.setSummary({ json }).catch(() => {
        // ウィジェットに渡せなくても、記録の保存には影響しない
      });
    };
    send();
    // 日付が変わったとき（アプリに戻ったとき）にも「今日」を更新する
    const onVisible = () => document.visibilityState === "visible" && send();
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [data]);
  return null;
}
