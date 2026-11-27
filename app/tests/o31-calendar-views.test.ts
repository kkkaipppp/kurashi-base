import { describe, expect, it } from "vitest";
import { CAL_VIEWS, listDays, parseCalView, weekDays, yearMonths } from "@/components/CalendarViews";
import { readFileSync } from "node:fs";

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
    expect([parseCalView("week"), parseCalView("list"), parseCalView("year"), parseCalView("day"), parseCalView("decade"), parseCalView(null)]).toEqual(["week", "list", "year", "day", "month", "month"]);
  });
});

// To-Be 02「月/週/日/年、今日へ、年月指定」（2026-11-28）
describe("To-Be カレンダーの日・年・年月の指定（自分用）", () => {
  it("表示の形は 日・週・月・年・一覧 の順", () => {
    expect(CAL_VIEWS.map(([, l]) => l)).toEqual(["日", "週", "月", "年", "一覧"]);
  });
  it("年は1月〜12月", () => {
    expect(yearMonths("2027")).toEqual(["2027-01", "2027-02", "2027-03", "2027-04", "2027-05", "2027-06", "2027-07", "2027-08", "2027-09", "2027-10", "2027-11", "2027-12"]);
  });
  it("前後のボタンは、日は1日・週は7日・年は12か月ずらす。年月の入力と年の月は、自分用だけで、形の崩れた値では動かない", () => {
    const s = readFileSync("src/app/calendar/page.tsx", "utf8");
    expect(s).toContain('const d = addDays(selected, (view === "week" ? 7 : 1) * delta);');
    expect(s).toContain('addMonthsToKey(month, view === "year" ? 12 * delta : delta)');
    expect(s).toContain("-(0[1-9]|1[0-2])$/.test(m)) return;");
    expect(s).toMatch(/\{PERSONAL_BUILD && view !== "day" && \(\s*<input type="month" aria-label="年月を選ぶ"/);
    expect(s).toContain('const YearView = PERSONAL_BUILD ? dynamic(');
  });
});
