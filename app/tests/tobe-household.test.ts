import { afterEach, describe, expect, it, vi } from "vitest";
import { emptyData } from "@/lib/defaults";
import { cancelDaysLeft, cancelText, choreNext, garbageLabel, garbageOn, parseWeekdays, parseWeeks } from "@/lib/household";
import { buildNavi } from "@/lib/navi";
import { validateAppData } from "@/lib/schema";
import { dropDanglingPlanLinks } from "@/lib/planLinks";
import { COLLECTION_KEYS, type Chore, type GarbageDay, type Reservation } from "@/lib/types";

// 期待値は決めごと（2026-11-28：予約・無料キャンセルの期限・家事分担・買い足すもの・ゴミ出し）とカレンダー（2026年11月）から手で作った
const ts = "2026-11-28T00:00:00.000Z";
const rsv = (o: Partial<Reservation> & { id: string }): Reservation => ({ name: "〇〇ホテル", kind: "hotel", date: "2026-12-20", status: "booked", ref: "", cancelBy: "", amount: null, url: "", note: "", createdAt: ts, updatedAt: ts, ...o });
const chore = (o: Partial<Chore>): Chore => ({ id: "c", name: "そうじ", who: "", cycle: "weekly", lastDone: "", note: "", createdAt: ts, updatedAt: ts, ...o });
const gbg = (o: Partial<GarbageDay> & { id: string }): GarbageDay => ({ name: "燃えるゴミ", weekdays: [], weeks: [], note: "", createdAt: ts, updatedAt: ts, ...o });

describe("曜日・第何週の読み取り", () => {
  it("「木・月」→ 月木、全角・重なり・知らない字は捨てる", () => {
    expect(parseWeekdays("木・月")).toEqual([1, 4]);
    expect(parseWeekdays("月月,火曜")).toEqual([1, 2]);
    expect(parseWeekdays("abc")).toEqual([]);
    expect(parseWeeks("第２・第４")).toEqual([2, 4]);
    expect(parseWeeks("6, 0")).toEqual([]);
  });
  it("「曜日」の「日」を日曜にしない。範囲・平日・土日・毎日を読む。読めない字があれば断る（点検 高-1・中-1）", () => {
    expect(parseWeekdays("月曜日・木曜日")).toEqual([1, 4]);
    expect(parseWeekdays("金曜日")).toEqual([5]);
    expect(parseWeekdays("日曜日")).toEqual([0]);
    expect(parseWeekdays("毎週日曜")).toEqual([0]);
    expect(parseWeekdays("月〜金")).toEqual([1, 2, 3, 4, 5]);
    expect(parseWeekdays("月-金")).toEqual([1, 2, 3, 4, 5]);
    expect(parseWeekdays("金〜月")).toEqual([0, 1, 5, 6]);
    expect(parseWeekdays("平日")).toEqual([1, 2, 3, 4, 5]);
    expect(parseWeekdays("土日")).toEqual([0, 6]);
    expect(parseWeekdays("毎日")).toEqual([0, 1, 2, 3, 4, 5, 6]);
    expect(parseWeekdays("月と木")).toEqual([1, 4]);
    expect(parseWeekdays("月・祝")).toEqual([]);
    expect(parseWeeks("1〜3")).toEqual([1, 2, 3]);
    expect(parseWeeks("10")).toEqual([]);
    expect(parseWeeks("2・x")).toEqual([]);
    expect(parseWeeks("第2週・第4週")).toEqual([2, 4]);
  });
});

describe("ゴミ出しの日", () => {
  // 2026年11月：1日は日曜。月曜は 2・9・16・23・30日、水曜は 4・11・18・25日
  it("毎週月・木：11/30（月）は出す、12/1（火）は出さない", () => {
    const g = gbg({ id: "a", weekdays: [1, 4] });
    expect(garbageOn(g, "2026-11-30")).toBe(true);
    expect(garbageOn(g, "2026-12-01")).toBe(false);
    expect(garbageLabel(g)).toBe("毎週月・木曜日");
  });
  it("第2・第4水曜：11/11 と 11/25 だけ（11/4・11/18 は出さない）", () => {
    const g = gbg({ id: "b", weekdays: [3], weeks: [2, 4] });
    expect(["2026-11-04", "2026-11-11", "2026-11-18", "2026-11-25"].map((d) => garbageOn(g, d))).toEqual([false, true, false, true]);
    expect(garbageLabel(g)).toBe("第2・4水曜日");
  });
  it("第5月曜：11/30 は5回目の月曜", () => {
    expect(garbageOn(gbg({ id: "c", weekdays: [1], weeks: [5] }), "2026-11-30")).toBe(true);
    expect(garbageOn(gbg({ id: "c", weekdays: [1], weeks: [5] }), "2026-11-23")).toBe(false);
  });
});

describe("家事の次の目安", () => {
  it.each([
    ["daily", "2026-11-28", "2026-11-29"],
    ["weekly", "2026-11-28", "2026-12-05"],
    ["monthly", "2026-01-31", "2026-02-28"], // 月末を超えたら月末
    ["monthly", "2026-12-15", "2027-01-15"], // 年またぎ
    ["none", "2026-11-28", ""],
  ] as const)("%s・%s にやった → %s", (cycle, lastDone, next) => {
    expect(choreNext(chore({ cycle, lastDone }))).toBe(next);
  });
  it("まだやっていなければ目安なし", () => {
    expect(choreNext(chore({ cycle: "daily" }))).toBe("");
  });
});

describe("無料キャンセルの期限", () => {
  it("予約済みで期限があるものだけ。過ぎたら出さない。未予約・キャンセル済みは出さない", () => {
    expect(cancelDaysLeft(rsv({ id: "a", cancelBy: "2026-11-29" }), "2026-11-28")).toBe(1);
    expect(cancelDaysLeft(rsv({ id: "a", cancelBy: "2026-11-28" }), "2026-11-28")).toBe(0);
    expect(cancelDaysLeft(rsv({ id: "a", cancelBy: "2026-11-27" }), "2026-11-28")).toBeNull();
    expect(cancelDaysLeft(rsv({ id: "a", cancelBy: "2026-11-29", status: "none" }), "2026-11-28")).toBeNull();
    expect(cancelDaysLeft(rsv({ id: "a", cancelBy: "2026-11-29", status: "canceled" }), "2026-11-28")).toBeNull();
    expect(cancelDaysLeft(rsv({ id: "a" }), "2026-11-28")).toBeNull();
    expect(cancelText("〇〇ホテル", 1)).toBe("〇〇ホテルの無料キャンセルは明日まで");
  });
});

describe("ホームの確認（自分用）", () => {
  afterEach(() => vi.unstubAllEnvs());
  const data = () => {
    const d = emptyData(ts);
    d.reservations = [rsv({ id: "soon", cancelBy: "2026-11-29" }), rsv({ id: "edge", name: "B旅館", cancelBy: "2026-12-01" }), rsv({ id: "far", cancelBy: "2026-12-02" })];
    // 11/28 は土曜、11/29 は日曜
    d.garbage = [gbg({ id: "sat", name: "資源ゴミ", weekdays: [6] }), gbg({ id: "sun", name: "燃えるゴミ", weekdays: [0] }), gbg({ id: "mon", name: "びん", weekdays: [1] })];
    return d;
  };
  it("キャンセルは3日前から（あと4日は出さない）。ゴミは今日と明日だけ", () => {
    vi.stubEnv("NEXT_PUBLIC_KB_EDITION", "personal");
    const items = buildNavi(data(), "2026-11-28");
    expect(items.filter((i) => i.key.startsWith("rsv-")).map((i) => i.title)).toEqual(["〇〇ホテルの無料キャンセルは明日まで", "B旅館の無料キャンセルはあと3日"]);
    expect(items.filter((i) => i.key.startsWith("gbg-")).map((i) => i.title)).toEqual(["今日は資源ゴミの日", "明日は燃えるゴミの日"]);
  });
  it("同じ種類が今日も明日もあれば両方。年またぎも数える", () => {
    vi.stubEnv("NEXT_PUBLIC_KB_EDITION", "personal");
    const d = emptyData(ts);
    d.garbage = [gbg({ id: "w", name: "資源ゴミ", weekdays: [6, 0] })];
    expect(buildNavi(d, "2026-11-28").filter((i) => i.key.startsWith("gbg-")).map((i) => i.title)).toEqual(["今日は資源ゴミの日", "明日は資源ゴミの日"]);
    // 2027-01-01 は金曜
    d.garbage = [gbg({ id: "f", name: "燃えるゴミ", weekdays: [5] })];
    expect(buildNavi(d, "2026-12-31").filter((i) => i.key.startsWith("gbg-")).map((i) => i.title)).toEqual(["明日は燃えるゴミの日"]);
  });
  it("公開版では出さない", () => {
    vi.stubEnv("NEXT_PUBLIC_KB_EDITION", "public");
    expect(buildNavi(data(), "2026-11-28").some((i) => i.key.startsWith("rsv-") || i.key.startsWith("gbg-"))).toBe(false);
  });
});

describe("保存の形", () => {
  it("4つの一覧があるデータも、無い古いデータも読める（無ければ空で足す）。形の違うものは断る", () => {
    const d = emptyData(ts);
    d.reservations = [rsv({ id: "r", ref: "AB12", cancelBy: "2026-12-01", amount: 12000, url: "https://example.com" })];
    d.chores = [chore({ lastDone: "2026-11-27" })];
    d.stock = [{ id: "s", name: "洗剤", need: true, note: "", createdAt: ts, updatedAt: ts }];
    d.garbage = [gbg({ id: "g", weekdays: [1, 4], weeks: [2] })];
    expect(validateAppData(JSON.parse(JSON.stringify(d))).ok).toBe(true);
    const old = JSON.parse(JSON.stringify(emptyData(ts)));
    for (const k of ["reservations", "chores", "stock", "garbage"]) delete old[k];
    const r = validateAppData(old);
    expect(r.ok && [r.data.reservations, r.data.chores, r.data.stock, r.data.garbage]).toEqual([[], [], [], []]);
    const bads: [string, string, unknown][] = [
      ["reservations", "status", "maybe"],
      ["reservations", "amount", -1],
      ["reservations", "url", "javascript:alert(1)"],
      ["chores", "cycle", "yearly"],
      ["garbage", "weekdays", [7]],
      ["garbage", "weekdays", [1, 1]],
      ["garbage", "weeks", [0]],
    ];
    for (const [k, f, v] of bads) {
      const bad = JSON.parse(JSON.stringify(d));
      bad[k][0][f] = v;
      expect(validateAppData(bad).ok, `${k}.${f}`).toBe(false);
    }
    for (const k of ["reservations", "chores", "stock", "garbage"] as const) expect(COLLECTION_KEYS).toContain(k);
  });
});

describe("復元のあと、指し先の無い計画のつながりを外す", () => {
  it("予約の planId も外す（予約そのものは残す）", () => {
    const d = emptyData(ts);
    d.reservations = [rsv({ id: "a", planId: "gone" })];
    const r = dropDanglingPlanLinks(d);
    expect(r.dropped).toBe(1);
    expect(r.data.reservations[0].planId).toBeUndefined();
    expect(r.data.reservations).toHaveLength(1);
  });
});
