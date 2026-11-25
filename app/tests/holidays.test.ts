import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { holidayName, holidaysOfYear } from "@/lib/holidays";

// 内閣府「国民の祝日について」の一覧と照らし合わせる（2025〜2027年）
const list = (y: number) => [...holidaysOfYear(y).keys()].sort();

describe("日本の祝日（2026-11-23 平尾さん：カレンダーで祝日が分かるように）", () => {
  it("2025年：振替休日（2/24・5/6・11/24）を含めて19日", () => {
    expect(list(2025)).toEqual([
      "2025-01-01", "2025-01-13", "2025-02-11", "2025-02-23", "2025-02-24", "2025-03-20", "2025-04-29", "2025-05-03",
      "2025-05-04", "2025-05-05", "2025-05-06", "2025-07-21", "2025-08-11", "2025-09-15", "2025-09-23", "2025-10-13",
      "2025-11-03", "2025-11-23", "2025-11-24",
    ]);
  });
  it("2026年：5/6 の振替休日と 9/22 の国民の休日がある", () => {
    expect(list(2026)).toEqual([
      "2026-01-01", "2026-01-12", "2026-02-11", "2026-02-23", "2026-03-20", "2026-04-29", "2026-05-03", "2026-05-04",
      "2026-05-05", "2026-05-06", "2026-07-20", "2026-08-11", "2026-09-21", "2026-09-22", "2026-09-23", "2026-10-12",
      "2026-11-03", "2026-11-23",
    ]);
    expect(holidayName("2026-09-22")).toBe("国民の休日");
    expect(holidayName("2026-05-06")).toBe("振替休日");
    expect(holidayName("2026-11-23")).toBe("勤労感謝の日");
  });
  it("2027年：春分の日が日曜で 3/22 が振替休日", () => {
    expect(holidayName("2027-03-21")).toBe("春分の日");
    expect(holidayName("2027-03-22")).toBe("振替休日");
    expect(holidayName("2027-01-11")).toBe("成人の日");
    expect(list(2027)).toHaveLength(17);
  });
  it("祝日でない日・対象外の年は null", () => {
    expect(holidayName("2026-11-24")).toBeNull();
    expect(holidayName("2019-01-01")).toBeNull();
    expect(holidayName("")).toBeNull();
  });
  it("カレンダーで祝日を赤くし、収入を青い＋数字で出す", () => {
    const s = readFileSync(join(__dirname, "..", "src", "app", "calendar", "page.tsx"), "utf8");
    expect(s).toContain("holidayName(d)");
    expect(s).toContain("+{shortYen(info.inc)}");
    expect(s).toContain("薄い日付＝日曜と祝日");
  });
});

describe("カレンダーのマスに予定の名前を出す（2026-11-23 平尾さん：点だけでは見にくい）", () => {
  it("名前は2件まで、それより多ければ +n。読み上げにも名前を入れる", () => {
    const s = readFileSync(join(__dirname, "..", "src", "app", "calendar", "page.tsx"), "utf8");
    expect(s).toContain("const EVENT_TITLES_IN_CELL = 2;");
    expect(s).toContain("info.titles.map(");
    expect(s).toContain("+{info.ev - info.titles.length}");
    expect(s).toContain('info.titles.join("、")');
  });
});

describe("カレンダーの色の使い分け（赤は支出、青は収入だけ）", () => {
  const s = readFileSync(join(__dirname, "..", "src", "app", "calendar", "page.tsx"), "utf8");
  it("日付と曜日の見出しは、赤・青にしない（日曜・祝日・土曜は薄い色か、そのまま）", () => {
    expect(s).not.toContain('i === 0 ? "text-expense"');
    expect(s).not.toContain('i === 6 ? "text-income"');
    expect(s).toContain('!isSel && rest ? "text-ink-3"');
  });
  it("まだ来ていない日の金額は、薄い斜めの字（実際に使った額と区別する）", () => {
    expect(s).toContain("const future = d > today");
    expect(s).toContain('future ? "italic opacity-60"');
    expect(s).toContain("薄い斜めの数字＝まだ来ていない日");
  });
});
