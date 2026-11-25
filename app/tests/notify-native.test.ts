import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { REMINDER_KEY, loadReminderSettings, saveReminderSettings } from "@/lib/reminderStore";
import { DEFAULT_REMINDERS } from "@/lib/reminders";

// NEXT v21 X13（iPhone アプリ側）：通知の登録は、くらしベースの通知だけを入れ替える。許可はオンにしたときだけ聞く。実機は未確認
const swift = readFileSync(join(__dirname, "..", "ios", "App", "App", "WidgetBridgePlugin.swift"), "utf8");
const src = (p: string) => readFileSync(join(__dirname, "..", "src", p), "utf8");

describe("通知（iPhone アプリ）", () => {
  it("入れ替えるのは、くらしベースの通知（ID が kb| で始まるもの）だけ。ほかの通知・ほかのアプリには触れない", () => {
    expect(swift).toContain('reminderPrefix = "kb|"');
    expect(swift).toContain("hasPrefix(Self.reminderPrefix)");
    expect(swift).toContain("removePendingNotificationRequests(withIdentifiers: mine)");
    expect(swift).not.toContain("removeAllPendingNotificationRequests"); // 全部は消さない
    expect(swift).not.toContain("removeAllDeliveredNotifications");
  });
  it("許可は、通知が1件以上あるとき（オンにしたとき）だけ聞く。拒否されていたら登録せず、残っていた分は消す", () => {
    expect(swift).toContain("if items.isEmpty {");
    expect(swift).toContain('call.resolve(["scheduled": 0, "denied": true])');
    expect(src("components/NotifyCard.tsx")).toContain('call("requestReminderPermission")');
    expect(src("components/WidgetSync.tsx")).toContain('if (!settings.on && lastReminders.current === "off") return;');
  });
  it("通知は1件ずつ、同じ ID・日付で1回だけ。上限は60件（iPhone の予約の上限64件の内側）", () => {
    expect(swift).toContain("items.prefix(60)");
    expect(swift).toContain("UNCalendarNotificationTrigger(dateMatching: c, repeats: false)");
  });
  it("設定は端末の中の別のキー。壊れていてもオフのまま動く。外へは送らない", () => {
    expect(REMINDER_KEY).toBe("kurashi-base:notify:v1");
    expect(loadReminderSettings()).toEqual(DEFAULT_REMINDERS); // この環境では localStorage がなくても、既定値（オフ）
    expect(saveReminderSettings(DEFAULT_REMINDERS)).toBe(false);
    expect(src("lib/reminderStore.ts") + src("components/NotifyCard.tsx")).not.toMatch(/fetch\(|XMLHttpRequest|sendBeacon/);
  });
  it("画面は iPhone アプリの中だけ（設定の「iPhone の連携」の下）。登録は記録・設定が変わるたびに入れ替える", () => {
    expect(src("components/NativeStatusCard.tsx")).toContain("<NotifyCard />");
    expect(src("components/WidgetSync.tsx")).toContain("NativeBridge.scheduleReminders({ json })");
    expect(src("components/WidgetSync.tsx")).toContain('"kb-reminders-changed"');
  });
});
