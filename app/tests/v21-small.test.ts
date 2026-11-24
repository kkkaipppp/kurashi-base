import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { emptyData } from "@/lib/defaults";
import { buildNavi } from "@/lib/navi";
import { buildTodayItems } from "@/lib/todayItems";

// NEXT v21（2026-11-25）の小さな単位。保存の形は変えない
const now = "2026-11-25T00:00:00.000Z";
const src = (p: string) => readFileSync(join(__dirname, "..", "src", p), "utf8");

describe("ホーム：「今日のまとめ」と「確認したいこと」で同じものを二重に出さない", () => {
  it("今日のまとめに出るもの（過ぎた固定費・期限切れのタスク・今日の更新日）は、確認したいことから除ける", () => {
    const d = emptyData(now);
    d.recurring = [{ id: "r", name: "スマホ", amount: 8000, cycle: "monthly", anchorDay: 20, nextDueDate: "2026-11-20", categoryId: "exp-5", paymentMethod: "", active: true, createdAt: now, updatedAt: now }];
    d.tasks = [{ id: "t", title: "書類", due: "2026-11-24", done: false, note: "", createdAt: now, updatedAt: now }];
    d.contracts = [{ id: "c", name: "保険", provider: "", amount: null, cycle: "yearly", renewalDate: "2026-11-25", status: "active", note: "", createdAt: now, updatedAt: now }];
    const today = buildTodayItems(d, "2026-11-25");
    const keys = new Set(today.map((i) => i.key));
    expect([...keys].sort()).toEqual(["ct-c", "rc-r", "task-t"]);
    // 過ぎたものが先
    expect(today[0].warn).toBe(true);
    const navi = buildNavi(d, "2026-11-25").filter((n) => !keys.has(n.key));
    expect(navi.map((n) => n.key)).not.toContain("rc-r");
    expect(navi.map((n) => n.key)).not.toContain("ct-c");
    // 元のナビには出ている（除くのは「今日のまとめ」を出しているときだけ）
    expect(buildNavi(d, "2026-11-25").map((n) => n.key)).toContain("rc-r");
  });
  it("ホームは、自分用で今日のまとめを出しているときだけ除く（公開版は今のまま）", () => {
    const s = src("app/page.tsx");
    expect(s).toContain('const todayShown = PERSONAL && layoutFor(prefs, editLayout).includes("todayAll");');
    expect(s).toContain("!dup?.has(n.key)");
  });
});
