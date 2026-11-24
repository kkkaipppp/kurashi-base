"use client";

import { useCallback, useEffect, useState } from "react";
import { Button, Card, SectionTitle } from "./ui";
import { isNativeApp } from "@/lib/platform";
import { useUI } from "./UIContext";

/**
 * iPhone アプリの中だけに出す「自動バックアップ」と「iPhone のカレンダーへの反映」の状態（レビュー o1 の P03・P05）。
 * Web 版（Safari・ホーム画面のアイコン）では何も出さない。
 * アプリの部品（ios/App/App/WidgetBridgePlugin.swift）には、パッケージを読み込まずに window.Capacitor から話しかける。
 */
type Bridge = { nativePromise?: (plugin: string, method: string, options?: object) => Promise<Record<string, unknown>> };
const call = (method: string, options: object = {}) => {
  const cap = (window as unknown as { Capacitor?: Bridge }).Capacitor;
  if (!cap?.nativePromise) return Promise.reject(new Error("no native"));
  return cap.nativePromise("WidgetBridge", method, options);
};

interface BackupStatus {
  latestName?: string;
  latestAt?: string;
  kept?: number;
}
interface CalendarStatus {
  access?: "full" | "denied" | "notDetermined" | "writeOnly" | "restricted";
  lastSyncAt?: string;
  calendarExists?: boolean;
}

const fmt = (iso?: string) => (iso ? new Date(iso).toLocaleString("ja-JP", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" }) : "まだありません");

export function NativeStatusCard() {
  const ui = useUI();
  const [native, setNative] = useState(false);
  const [backup, setBackup] = useState<BackupStatus | null>(null);
  const [cal, setCal] = useState<CalendarStatus | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    call("backupStatus").then((r) => setBackup(r as BackupStatus)).catch(() => setBackup(null));
    call("calendarStatus").then((r) => setCal(r as CalendarStatus)).catch(() => setCal(null));
  }, []);

  useEffect(() => {
    const n = isNativeApp();
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setNative(n);
    if (n) load();
  }, [load]);

  if (!native) return null;

  const resync = async () => {
    setBusy(true);
    try {
      await call("requestCalendarResync");
      // 書き直しは WidgetSync が次に記録を見たときに行う。少し待ってから状態を読み直す
      window.dispatchEvent(new Event("kb-calendar-resync"));
      setTimeout(load, 4000);
      ui.toast("カレンダーへの反映をやり直します");
    } catch {
      ui.toast("カレンダーへの反映をやり直せませんでした", "error");
    } finally {
      setBusy(false);
    }
  };

  const accessText =
    cal?.access === "full"
      ? "許可されています"
      : cal?.access === "denied" || cal?.access === "restricted" || cal?.access === "writeOnly"
        ? "許可されていません"
        : "まだ聞いていません";

  return (
    <Card>
      <div id="iphone" className="scroll-mt-20" />
      <SectionTitle>iPhone の連携</SectionTitle>
      <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-[13px]">
        <dt className="text-ink-2">最後の自動バックアップ</dt>
        <dd className="num">{backup ? `${fmt(backup.latestAt)}（${backup.kept ?? 0}日分）` : "読めませんでした"}</dd>
        <dt className="text-ink-2">カレンダーへのアクセス</dt>
        <dd className={cal?.access === "full" ? "" : "font-semibold text-warn"}>{cal ? accessText : "読めませんでした"}</dd>
        <dt className="text-ink-2">カレンダーへの最後の反映</dt>
        <dd className="num">{fmt(cal?.lastSyncAt)}</dd>
      </dl>
      <p className="mt-2 text-[12px] text-ink-3">
        iPhone のカレンダーの「くらしベース」は、このアプリの予定と固定費の支払日を見るためのカレンダーです。くらしベースが入れた予定だけを書き直します。自分の予定は、ほかのカレンダーに入れてください。
      </p>
      {cal && cal.access !== "full" && cal.access !== "notDetermined" && (
        <p className="mt-2 rounded-xl bg-warn-soft px-3 py-2 text-[13px] text-warn">
          iPhone の「設定」→「アプリ」→「くらしベース」→「カレンダー」で「フルアクセス」にすると、反映されます。
        </p>
      )}
      <div className="mt-3 grid grid-cols-2 gap-2">
        {cal && cal.access !== "full" && (
          <Button variant="secondary" onClick={() => call("openAppSettings").catch(() => {})}>
            設定を開く
          </Button>
        )}
        <Button variant="secondary" onClick={resync} disabled={busy} className={cal && cal.access !== "full" ? "" : "col-span-2"}>
          カレンダーに反映し直す
        </Button>
      </div>
    </Card>
  );
}
