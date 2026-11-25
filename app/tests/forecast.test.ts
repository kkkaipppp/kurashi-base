import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { emptyData } from "@/lib/defaults";
import { forecastMonthEnd, forecastReasonText } from "@/lib/forecast";
import type { AppData, Transaction } from "@/lib/types";

// NEXT v21：月末の見込み。合成データ。予測は確定ではない・不足は理由を返す（X23）
const now = "2026-11-25T00:00:00.000Z";
const tx = (o: Partial<Transaction> & { id: string }): Transaction => ({
  type: "expense", date: "2026-11-10", amount: 1000, currency: "JPY", categoryId: "exp-1", merchant: "", paymentMethod: "", note: "", source: "manual", createdAt: now, updatedAt: now, ...o,
});
const base = (): AppData => {
  const d = emptyData(now);
  d.categories.push({ id: "inv", name: "証券口座へ", kind: "expense", order: 99, archived: false, role: "invest" });
  return d;
};

describe("月末の見込み", () => {
  it("今月の生活費＋まだ来る固定費＋変動費の1日あたり×残りの日数。投資と固定費は変動費に入れない", () => {
    const d = base();
    d.budget.monthly = 100000;
    d.recurring = [{ id: "r", name: "スマホ", amount: 8000, cycle: "monthly", anchorDay: 28, nextDueDate: "2026-11-28", categoryId: "exp-5", paymentMethod: "", active: true, createdAt: now, updatedAt: now }];
    // 10/28〜11/24 の28日に、変動費 2800 円ずつ10日分＝28000円（1日あたり 1000円）。投資 100000 は含めない
    d.transactions = [
      ...Array.from({ length: 10 }, (_, i) => tx({ id: `v${i}`, date: `2026-11-${String(10 + i).padStart(2, "0")}`, amount: 2800 })),
      tx({ id: "inv", categoryId: "inv", amount: 100000, date: "2026-11-05" }),
      tx({ id: "fix", categoryId: "exp-5", amount: 8000, date: "2026-10-28", recurringId: "r" }),
      tx({ id: "old", date: "2026-10-28", amount: 500 }), // 窓の最初の日（記録の始まり）
    ];
    const f = forecastMonthEnd(d, "2026-11-25");
    expect(f.ok).toBe(true);
    if (!f.ok) return;
    expect(f.spent).toBe(28000); // 今月の生活費（投資を除く）
    expect(f.unpaidFixed).toBe(8000);
    expect(f.basisDays).toBe(28); // 10/28〜11/24
    // 窓の変動費：2800×10＋500（固定費の 8000 と投資は除く）＝28500 ÷ 28 日 = 1017
    expect(f.dailyVariable).toBe(1017);
    expect(f.daysAhead).toBe(5); // 11/26〜11/30
    expect(f.projected).toBe(28000 + 8000 + 1017 * 5);
    expect(f.vsBudget).toBe(100000 - f.projected);
  });
  it("記録が少ないときは、0円と出さず理由を返す（記録なし・日数不足・件数不足）", () => {
    expect(forecastMonthEnd(base(), "2026-11-25")).toEqual({ ok: false, reason: "noData" });
    const few = base();
    few.transactions = [tx({ id: "a", date: "2026-11-22" })];
    expect(forecastMonthEnd(few, "2026-11-25")).toEqual({ ok: false, reason: "tooFewDays" });
    const fewTx = base();
    fewTx.transactions = [tx({ id: "a", date: "2026-11-01" }), tx({ id: "b", date: "2026-11-02" })];
    expect(forecastMonthEnd(fewTx, "2026-11-25")).toEqual({ ok: false, reason: "tooFewRecords" });
    expect(forecastReasonText("tooFewDays")).toContain("7日");
  });
  it("記録の始まりより前は、記録がなかっただけかもしれないので日数に数えない", () => {
    const d = base();
    d.transactions = [tx({ id: "a", date: "2026-11-10" }), tx({ id: "b", date: "2026-11-12" }), tx({ id: "c", date: "2026-11-14" })];
    const f = forecastMonthEnd(d, "2026-11-25");
    expect(f.ok && f.basisDays).toBe(15); // 11/10〜11/24
  });
  it("予算がなければ、予算との比較は出さない。月の最後の日は、残りの日数が0", () => {
    const d = base();
    d.transactions = Array.from({ length: 5 }, (_, i) => tx({ id: `t${i}`, date: `2026-11-${String(5 + i).padStart(2, "0")}` }));
    const f = forecastMonthEnd(d, "2026-11-30");
    expect(f.ok && f.vsBudget).toBeNull();
    expect(f.ok && f.daysAhead).toBe(0);
  });
  it("振り返り（今月を見ているとき・自分用）に出す", () => {
    const s = readFileSync(join(__dirname, "..", "src", "app", "report", "page.tsx"), "utf8");
    expect(s).toContain("<ForecastCard month={month} />");
  });
});

describe("見込みのグラフ（実線と破線）", () => {
  it("実績は今日までの累計、見込みは今日から月末まで。終わりは月末の見込みと同じ", async () => {
    const { forecastCurve } = await import("@/lib/forecast");
    const d = base();
    d.recurring = [{ id: "r", name: "スマホ", amount: 8000, cycle: "monthly", anchorDay: 28, nextDueDate: "2026-11-28", categoryId: "exp-5", paymentMethod: "", active: true, createdAt: now, updatedAt: now }];
    d.transactions = Array.from({ length: 10 }, (_, i) => tx({ id: `a${i}`, date: `2026-11-${String(i + 5).padStart(2, "0")}`, amount: 2800 }));
    const c = forecastCurve(d, "2026-11-20")!;
    const f = forecastMonthEnd(d, "2026-11-20");
    expect(c.daysInMonth).toBe(30);
    expect(c.actual).toHaveLength(20);
    expect(c.actual[19]).toBe(28000);
    expect(c.actual[3]).toBe(0); // 4日はまだ記録がない
    expect(c.projected).toHaveLength(11); // 20日〜30日
    expect(c.projected[0]).toBe(c.actual[19]);
    if (!f.ok) throw new Error("見込みが出ない");
    expect(c.projected[10]).toBe(f.projected);
  });
  it("固定費は払う日に載る（28日に8,000円の段差）。過ぎた分は明日にまとめる", async () => {
    const { forecastCurve } = await import("@/lib/forecast");
    const d = base();
    d.recurring = [{ id: "r", name: "スマホ", amount: 8000, cycle: "monthly", anchorDay: 28, nextDueDate: "2026-11-28", categoryId: "exp-5", paymentMethod: "", active: true, createdAt: now, updatedAt: now }];
    d.transactions = Array.from({ length: 10 }, (_, i) => tx({ id: `a${i}`, date: `2026-11-${String(i + 5).padStart(2, "0")}`, amount: 2800 }));
    const c = forecastCurve(d, "2026-11-20")!;
    const step = (i: number) => c.projected[i] - c.projected[i - 1];
    // 変動費：記録のある 5日〜19日の15日間に 28,000円 → 1日 1,866円（切り捨て）
    expect(step(8)).toBe(1866 + 8000); // 28日（20日が index 0）
    expect(step(7)).toBe(1866);
  });
  it("見込みが出せないとき（記録が足りない）は null", async () => {
    const { forecastCurve } = await import("@/lib/forecast");
    expect(forecastCurve(base(), "2026-11-20")).toBeNull();
  });
});

describe("ホームの『月末の見込み』と振り返りの数字（自分用）", () => {
  const seed = (): AppData => {
    const d = base();
    d.budget.monthly = 60000;
    d.recurring = [{ id: "r", name: "スマホ", amount: 8000, cycle: "monthly", anchorDay: 28, nextDueDate: "2026-11-28", categoryId: "exp-5", paymentMethod: "", active: true, createdAt: now, updatedAt: now }];
    d.transactions = Array.from({ length: 12 }, (_, i) => tx({ id: `p${i}`, date: `2026-11-${String(i + 3).padStart(2, "0")}`, amount: 2000 }));
    return d;
  };
  it("自分用では、ホームの一文が forecastMonthEnd と同じ額（100円単位）になる", async () => {
    const { vi } = await import("vitest");
    vi.resetModules();
    vi.stubEnv("NEXT_PUBLIC_KB_EDITION", "personal");
    const { buildInsights } = await import("@/lib/report");
    const { forecastMonthEnd: fm } = await import("@/lib/forecast");
    const d = seed();
    const f = fm(d, "2026-11-25");
    if (!f.ok) throw new Error("見込みが出ない");
    const pace = buildInsights(d, "2026-11", "2026-11-25").find((x) => x.key === "pace");
    expect(pace?.text).toContain(`約¥${(Math.round(f.projected / 100) * 100).toLocaleString("ja-JP")}`);
    vi.unstubAllEnvs();
    vi.resetModules();
  });
});

describe("磨き込み 2026-11-26：公開版でも、月末の見込みの一文はカードと同じ", () => {
  it("カードが出せるときは同じ額、出せないとき（記録が少ない）は一文も出さない", async () => {
    const { buildInsights } = await import("@/lib/report");
    const { forecastMonthEnd: fm } = await import("@/lib/forecast");
    const { emptyData } = await import("@/lib/defaults");
    const now = "2026-11-25T00:00:00.000Z";
    const base = emptyData(now);
    base.budget.monthly = 100000;
    const mk = (n: number) => ({ ...base, transactions: Array.from({ length: n }, (_, i) => ({ id: `p${i}`, type: "expense" as const, date: `2026-11-${String(i + 3).padStart(2, "0")}`, amount: 2000, currency: "JPY" as const, categoryId: "exp-1", merchant: "", paymentMethod: "", note: "", source: "manual" as const, createdAt: now, updatedAt: now })) });
    const many = mk(12);
    const f = fm(many, "2026-11-25");
    expect(f.ok).toBe(true);
    if (f.ok) expect(buildInsights(many, "2026-11", "2026-11-25").find((x) => x.key === "pace")?.text).toContain(`約¥${(Math.round(f.projected / 100) * 100).toLocaleString("ja-JP")}`);
    // 記録が1件だけ（7日目以降でも）：カードは出さないので、一文も出さない
    const few = mk(1);
    expect(fm(few, "2026-11-25").ok).toBe(false);
    expect(buildInsights(few, "2026-11", "2026-11-25").find((x) => x.key === "pace")).toBeUndefined();
  });
});
