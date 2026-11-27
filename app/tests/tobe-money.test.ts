import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { upcomingPayments } from "@/lib/upcoming";
import type { RecurringExpense } from "@/lib/types";

// To-Be 02「家計簿：収支・予算・支払いを主要タブ」（2026-11-28、自分用）。期待値は手で作った
const ts = "2026-11-28T00:00:00.000Z";
const r = (o: Partial<RecurringExpense>): RecurringExpense => ({
  id: "r", name: "家賃", amount: 80000, cycle: "monthly", anchorDay: 27, nextDueDate: "2026-12-27", categoryId: "house", paymentMethod: "", active: true, createdAt: ts, updatedAt: ts, ...o,
});

describe("これからの支払い（30日）", () => {
  it("今日から30日の固定費。過ぎたものは先頭。止めたもの・31日より先は出さない。一部払いは残り、残り0円は出さない", () => {
    const list = upcomingPayments(
      [
        r({ id: "a", name: "家賃", nextDueDate: "2026-12-27", amount: 80000 }),
        r({ id: "b", name: "携帯", nextDueDate: "2026-11-20", amount: 3000 }), // 予定日を過ぎた
        r({ id: "c", name: "電気", nextDueDate: "2026-12-05", amount: 6000, partialPaid: { due: "2026-12-05", paid: 2500 } }),
        r({ id: "d", name: "水道", nextDueDate: "2026-12-10", amount: 4000, partialPaid: { due: "2026-12-10", paid: 4000 } }), // 払い終わった
        r({ id: "e", name: "保険", nextDueDate: "2026-12-29", amount: 5000 }), // 31日後
        r({ id: "f", name: "ジム", nextDueDate: "2026-12-01", amount: 7000, active: false }),
        r({ id: "g", name: "新聞", nextDueDate: "2026-12-28", amount: 4500, partialPaid: { due: "2026-11-28", paid: 1000 } }), // 前の回の一部払い：今回は全額
      ],
      "2026-11-28",
      30,
    );
    expect(list.map((x) => [x.name, x.due, x.amount, x.partial])).toEqual([
      ["携帯", "2026-11-20", 3000, false],
      ["電気", "2026-12-05", 3500, true],
      ["家賃", "2026-12-27", 80000, false],
      ["新聞", "2026-12-28", 4500, false],
    ]);
    expect(upcomingPayments([], "2026-11-28", 30)).toEqual([]);
  });
});

describe("家計簿のタブ（自分用）", () => {
  const s = readFileSync("src/app/report/page.tsx", "utf8");
  it("収支・予算・支払いの3つ。初めは収支（明細）。公開版の画面は今のまま", () => {
    expect(s).toMatch(/\["list", "収支"\],\s*\["stats", "予算"\],\s*\["pay", "支払い"\],/);
    expect(s).toContain('useState<"list" | "stats" | "pay">("list")');
    expect(s).toContain('{PERSONAL_MONEY && view !== "stats" ? null : r.count === 0 ? (');
    expect(s).toContain('{!(PERSONAL_MONEY && view !== "pay") && (');
    expect(s).toContain("{!PERSONAL_MONEY && <CashBalanceCard month={month} />}");
    expect(s).toContain('const UpcomingPayments = PERSONAL_MONEY ? dynamic(');
  });
});
