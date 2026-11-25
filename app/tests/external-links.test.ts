import { describe, expect, it } from "vitest";
import { bookSearch, calendarTemplate, isSavableUrl, mapsDirections, mapsSearch, noteSearch, safeExternalLink, webSearch } from "@/lib/externalLinks";

describe("外部リンク（Googleマップ・Googleカレンダー・Web検索・参考書）", () => {
  it("日本語の目的地をそのまま残す", () => {
    const x = mapsDirections("東京駅 丸の内");
    expect(x).toContain("api=1");
    expect(new URL(x!).searchParams.get("destination")).toBe("東京駅 丸の内");
    expect(new URL(x!).searchParams.get("travelmode")).toBe("transit");
  });

  it("入力した検索語を日本語のまま渡す。空は検索しない", () => {
    expect(new URL(webSearch("京都 紅葉 穴場")!).searchParams.get("q")).toBe("京都 紅葉 穴場");
    expect(webSearch("   ")).toBeNull();
    expect(mapsSearch(" ")).toBeNull();
    expect(mapsDirections("")).toBeNull();
  });

  it("終日の予定は、終了日の翌日を渡す（うるう日も）", () => {
    const u = calendarTemplate({ title: "試験", startDate: "2028-02-29", endDate: "2028-02-29", allDay: true });
    expect(new URL(u!).searchParams.get("dates")).toBe("20280229/20280301");
    const m = calendarTemplate({ title: "旅行", startDate: "2026-12-30", endDate: "2026-12-31", allDay: true });
    expect(new URL(m!).searchParams.get("dates")).toBe("20261230/20270101");
  });

  it("時刻つきの予定は日本時間で渡す", () => {
    const u = calendarTemplate({ title: "予定", startDate: "2026-11-22", endDate: "2026-11-22", allDay: false, startTime: "09:00", endTime: "10:30", location: "東京駅" });
    expect(new URL(u!).searchParams.get("dates")).toBe("20261122T090000/20261122T103000");
    expect(new URL(u!).searchParams.get("ctz")).toBe("Asia/Tokyo");
    expect(new URL(u!).searchParams.get("location")).toBe("東京駅");
  });

  it("おかしな日付・時刻ではリンクを作らない", () => {
    expect(calendarTemplate({ title: "x", startDate: "2026-02-30", endDate: "2026-03-01", allDay: true })).toBeNull();
    expect(calendarTemplate({ title: "x", startDate: "2026-11-22", endDate: "2026-11-22", allDay: false, startTime: "18:00", endTime: "17:00" })).toBeNull();
    expect(calendarTemplate({ title: " ", startDate: "2026-11-22", endDate: "2026-11-22", allDay: true })).toBeNull();
  });

  it("javascript: などのリンクを拒否し、http/https だけ保存できる", () => {
    expect(safeExternalLink("javascript:alert(1)")).toBeNull();
    expect(safeExternalLink("data:text/html,x")).toBeNull();
    expect(safeExternalLink("https://example.com/a?b=1")).toBe("https://example.com/a?b=1");
    expect(isSavableUrl("")).toBe(true);
    expect(isSavableUrl("ftp://x")).toBe(false);
    expect(isSavableUrl("予約サイト")).toBe(false);
  });

  it("参考書の検索にアソシエイトのタグを付けない", () => {
    const u = new URL(bookSearch("日商簿記3級 参考書")!);
    expect(u.hostname).toBe("www.amazon.co.jp");
    expect(u.searchParams.get("k")).toBe("日商簿記3級 参考書");
    expect(u.searchParams.has("tag")).toBe(false);
    expect(bookSearch("")).toBeNull();
  });

  it("note の検索は、資格名＋勉強法で note.com に絞る", () => {
    expect(new URL(noteSearch("宅建 勉強法")!).searchParams.get("q")).toBe("宅建 勉強法 site:note.com");
  });
});

describe("Googleカレンダーへ渡す内容（点検役の指摘：メモを渡さないことの見張り）", () => {
  it("予定の詳細の画面は、メモ（description）を Googleカレンダーに渡さない", async () => {
    const { readFileSync } = await import("node:fs");
    const { join } = await import("node:path");
    const src = readFileSync(join(__dirname, "..", "src", "components", "EventSheet.tsx"), "utf8");
    const call = src.slice(src.indexOf("const gcal = calendarTemplate("), src.indexOf("const gcal = calendarTemplate(") + 120);
    expect(call).not.toMatch(/description|note/);
    const u = new URL(calendarTemplate({ title: "予定", startDate: "2026-11-22", endDate: "2026-11-22", allDay: true, location: "駅" })!);
    expect(u.searchParams.has("details")).toBe(false);
  });
});

it("認証情報付きの外部URLを拒否する", () => {
  expect(safeExternalLink("https://trusted.example@other.example/")).toBeNull();
  expect(safeExternalLink("https://user:pass@example.com/")).toBeNull();
});
