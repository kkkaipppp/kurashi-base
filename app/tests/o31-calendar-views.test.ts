import { describe, expect, it } from "vitest";
import { listDays, parseCalView, weekDays } from "@/components/CalendarViews";

// o31 F008（T008・C008）：カレンダーの表示の形。期待値は暦から手で作った
describe("o31 T008 カレンダーの表示の形", () => {
  it("週は選んだ日を含む日曜〜土曜。月・年をまたいでもよい", () => {
    expect(weekDays("2026-11-27")).toEqual(["2026-11-22", "2026-11-23", "2026-11-24", "2026-11-25", "2026-11-26", "2026-11-27", "2026-11-28"]);
    expect(weekDays("2026-01-01")[0]).toBe("2025-12-28");
    // 閏日を含む週（2028-02-29 は火曜）
    expect(weekDays("2028-02-29")).toEqual(["2028-02-27", "2028-02-28", "2028-02-29", "2028-03-01", "2028-03-02", "2028-03-03", "2028-03-04"]);
  });
  it("一覧は見ている月の、何かある日だけ（期間ではなく表示の形）", () => {
    const has = new Set(["2026-11-03", "2026-11-27", "2026-12-01"]);
    expect(listDays("2026-11", (d) => has.has(d))).toEqual(["2026-11-03", "2026-11-27"]);
    expect(listDays("2026-02", () => true)).toHaveLength(28);
  });
  it("覚えた表示の形が壊れていたら月", () => {
    expect([parseCalView("week"), parseCalView("list"), parseCalView("year"), parseCalView(null)]).toEqual(["week", "list", "month", "month"]);
  });
});
