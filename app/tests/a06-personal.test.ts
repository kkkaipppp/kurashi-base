import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { MONTHS, synth } from "./fixtures/synth";

// o11 A06（独立点検 中2・低1）：自分用の版（NEXT_PUBLIC_KB_EDITION=personal）として動かしたときの比べ。
// 版は読み込みのときに決まるので、環境の値を変えてから、部品を読み込み直す
type Mods = {
  nRep: typeof import("@/lib/report");
  oRep: typeof import("./legacy/report");
  ledger: typeof import("@/lib/ledger");
  agg: typeof import("@/lib/aggregate");
  edition: typeof import("@/lib/edition");
};
let m: Mods;
beforeAll(async () => {
  vi.stubEnv("NEXT_PUBLIC_KB_EDITION", "personal");
  vi.resetModules();
  m = {
    nRep: await import("@/lib/report"),
    oRep: await import("./legacy/report"),
    ledger: await import("@/lib/ledger"),
    agg: await import("@/lib/aggregate"),
    edition: await import("@/lib/edition"),
  };
});
afterAll(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

const TODAYS = ["2026-02-28", "2026-10-01", "2026-11-25", "2026-12-31", "2028-02-29"];

describe("自分用の版：切り替えの前と後で同じ・画面どうしで同じ", () => {
  it("自分用として読み込めている", () => {
    expect(m.edition.IS_PERSONAL).toBe(true);
  });
  it("振り返りの気づき（自分用は月末の見込みを使う枝）が、前の実装と同じ（200通り）", () => {
    for (let s = 1; s <= 200; s++) {
      const d = synth(s);
      for (const today of TODAYS) expect(m.nRep.buildInsights(d, today.slice(0, 7), today)).toEqual(m.oRep.buildInsights(d, today.slice(0, 7), today));
    }
  });
  it("予算と比べる額：ホーム（monthLedger の生活費）＝ナビ・振り返り・ウィジェット（budgetSpent）。投資は入らない", () => {
    for (let s = 1; s <= 200; s++) {
      const d = synth(s);
      for (const mo of MONTHS) {
        const today = `${mo}-15`;
        const home = m.ledger.monthLedger(d, mo, today).lifeExpense;
        expect(m.ledger.budgetSpent(d, mo, today)).toBe(home);
        // 公開版の数え方（すべての支出）とは、投資の分だけ違う
        expect(m.ledger.budgetSpent(d, mo, today, false)).toBe(m.agg.summarizeMonth(d.transactions, mo).expense);
        expect(m.ledger.budgetSpent(d, mo, today, false) - home).toBe(m.ledger.monthLedger(d, mo, today).investMove);
      }
    }
  });
  it("ウィジェットの画面は、ホームと同じ budgetSpent で予算と比べる（独立点検 中2）", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const src = fs.readFileSync(path.resolve(import.meta.dirname, "../src/app/widget/page.tsx"), "utf8");
    expect(src).toContain("budgetSpent(data, monthKey(today), today)");
    expect(src).not.toContain("summarizeMonth(");
  });
});
