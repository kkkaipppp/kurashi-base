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
  /** 反映のオン・オフ（古いアプリでは来ないので、来なければオン） */
  enabled?: boolean;
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

  // 反映のオン・オフ（100点化の指示 B）。オフにするときは、もう入れた予定を残すか消すかを別に聞く
  const calOn = cal?.enabled !== false;
  const toggleCalendar = async () => {
    if (calOn) {
      const ok = await ui.confirm({
        title: "iPhone のカレンダーへの反映を止めますか？",
        body: "止めると、これからは「くらしベース」カレンダーに書きません。くらしベースの記録はそのままです。",
        ok: "止める",
      });
      if (!ok) return;
      setBusy(true);
      try {
        await call("setCalendarSync", { enabled: false });
        const remove = await ui.confirm({
          title: "もう入れた予定はどうしますか？",
          body: "「くらしベース」カレンダーにある、くらしベースが入れた予定を消せます。自分で入れた予定とカレンダーそのものは消しません。",
          ok: "予定を消す",
          cancel: "残しておく",
          danger: true,
        });
        if (remove) {
          await removeEvents("反映を止めて、");
        } else {
          ui.toast("反映を止めました（入れた予定は残しています）");
        }
      } catch {
        ui.toast("うまくいきませんでした。もう一度試してください", "error");
      } finally {
        setBusy(false);
        load();
      }
      return;
    }
    setBusy(true);
    try {
      await call("setCalendarSync", { enabled: true });
      window.dispatchEvent(new Event("kb-calendar-resync"));
      setTimeout(load, 4000);
      ui.toast("カレンダーへの反映を始めます");
    } catch {
      ui.toast("うまくいきませんでした。もう一度試してください", "error");
    } finally {
      setBusy(false);
      load();
    }
  };

  // くらしベースが入れた予定を消す（止めたあとにもう一度試せるよう、止めているあいだはボタンも出す）
  const removeEvents = async (prefix = "") => {
    try {
      const r = await call("removeCalendarEvents");
      ui.toast(`${prefix}${Number(r.removed ?? 0)}件の予定を消しました`);
    } catch (e) {
      ui.toast(`${prefix ? "反映は止めました。" : ""}予定は消せませんでした${e instanceof Error && e.message ? `（${e.message}）` : ""}。「入れた予定を消す」でもう一度試せます`, "error");
    }
  };
  const removeLater = async () => {
    const ok = await ui.confirm({
      title: "くらしベースが入れた予定を消しますか？",
      body: "「くらしベース」カレンダーにある、くらしベースが入れた予定を消します。自分で入れた予定とカレンダーそのものは消しません。",
      ok: "予定を消す",
      danger: true,
    });
    if (!ok) return;
    setBusy(true);
    await removeEvents();
    setBusy(false);
    load();
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
        <dt className="text-ink-2">カレンダーへの反映</dt>
        <dd className={calOn ? "" : "font-semibold text-warn"}>{cal ? (calOn ? "オン" : "オフ（書いていません）") : "読めませんでした"}</dd>
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
        <Button variant="secondary" onClick={toggleCalendar} disabled={busy || !cal} className="col-span-2">
          {calOn ? "カレンダーへの反映を止める" : "カレンダーへの反映を始める"}
        </Button>
        {calOn && cal && cal.access !== "full" && (
          <Button variant="secondary" onClick={() => call("openAppSettings").catch(() => {})}>
            設定を開く
          </Button>
        )}
        {!calOn && (
          <Button variant="secondary" onClick={removeLater} disabled={busy} className="col-span-2">
            入れた予定を消す
          </Button>
        )}
        {calOn && (
          <Button variant="secondary" onClick={resync} disabled={busy} className={cal && cal.access !== "full" ? "" : "col-span-2"}>
            カレンダーに反映し直す
          </Button>
        )}
      </div>
    </Card>
  );
}
