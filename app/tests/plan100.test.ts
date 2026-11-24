import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { SHEET_DRAFT_KEY, clearSheetDraft, draftTimeLabel, loadSheetDraft, saveSheetDraft } from "@/lib/sheetDraft";

// 2026-11-24 ChatGPT「100点化 開発指示 v1」（kurashi-base_100point_plan_209b0cd）のうち、保存の形を変えない分
const src = (p: string) => readFileSync(join(__dirname, "..", "src", p), "utf8");
const mem = () => {
  const m = new Map<string, string>();
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), removeItem: (k: string) => void m.delete(k), m };
};

describe("B 入力の下書き（端末の中の別のキー。記録の保存の形は変えない）", () => {
  it("新規と編集を取り違えず、種類も分ける。消すのは同じ入力の下書きだけ", () => {
    const kv = mem();
    expect(SHEET_DRAFT_KEY.startsWith("kurashi-base:")).toBe(true); // すべて削除で一緒に消える
    expect(saveSheetDraft("tx", null, { amount: "1200" }, new Date("2026-11-24T12:05:00Z"), kv)).toBe(true);
    expect(loadSheetDraft<{ amount: string }>("tx", null, kv)?.draft.amount).toBe("1200");
    expect(loadSheetDraft("tx", "id-1", kv)).toBeNull(); // 編集の下書きではない
    expect(loadSheetDraft("event", null, kv)).toBeNull(); // 予定の下書きではない
    clearSheetDraft("event", null, kv); // 別の入力なので消さない
    expect(kv.m.has(SHEET_DRAFT_KEY)).toBe(true);
    clearSheetDraft("tx", null, kv);
    expect(kv.m.has(SHEET_DRAFT_KEY)).toBe(false);
  });
  it("壊れた下書きは捨てる。保存できない端末では false", () => {
    const kv = mem();
    kv.setItem(SHEET_DRAFT_KEY, "{壊れた");
    expect(loadSheetDraft("tx", null, kv)).toBeNull();
    expect(kv.m.has(SHEET_DRAFT_KEY)).toBe(false);
    const bad = { getItem: () => null, setItem: () => { throw new Error("full"); }, removeItem: () => {} };
    expect(saveSheetDraft("tx", null, {}, new Date(), bad)).toBe(false);
    expect(draftTimeLabel("x")).toBe("前回");
  });
  it("支出・収入と予定の入力で、書きかけを控え、保存がうまくいったときだけ消す", () => {
    for (const f of ["components/TxSheet.tsx", "components/EventSheet.tsx"]) {
      const s = src(f);
      expect(s).toContain("saveSheetDraft");
      expect(s).toContain("の書きかけがあります");
      expect(s).toContain("続きから");
      expect(s).toContain("// 保存がうまくいったときだけ下書きを消す");
    }
  });
});

describe("D 家計の計算をひとつに（指示書の検証データ）", () => {
  it("予算 120,000・生活費 96,420・投資 100,000・未記録の固定費 8,000・残り7日 → 生活予算の残り 23,580・自由に使える残り 15,580・1日あたり 2,225", async () => {
    const { monthLedger } = await import("@/lib/ledger");
    const { emptyData } = await import("@/lib/defaults");
    const now = "2026-11-24T00:00:00.000Z";
    const d = emptyData(now);
    d.budget.monthly = 120000;
    d.categories.push({ id: "inv", name: "投資", kind: "expense", order: 99, archived: false });
    const tx = (id: string, amount: number, categoryId: string) => ({ id, type: "expense" as const, date: "2026-11-10", amount, currency: "JPY" as const, categoryId, merchant: "", paymentMethod: "", note: "", source: "manual" as const, createdAt: now, updatedAt: now });
    d.transactions = [tx("a", 96420, "exp-1"), tx("b", 100000, "inv")];
    d.recurring = [{ id: "r", name: "スマホ", amount: 8000, cycle: "monthly", anchorDay: 28, nextDueDate: "2026-11-28", categoryId: "exp-5", paymentMethod: "", active: true, createdAt: now, updatedAt: now }];
    const l = monthLedger(d, "2026-11", "2026-11-24");
    expect([l.lifeExpense, l.investMove, l.lifeBudgetLeft, l.unpaidFixed, l.freeLeft, l.perDay, l.daysLeft]).toEqual([96420, 100000, 23580, 8000, 15580, 2225, 7]);
    // 支払いを記録すると、未記録の固定費が減り、生活費が増え、自由に使える残りは変わらない
    d.transactions.push(tx("c", 8000, "exp-5"));
    d.recurring[0].nextDueDate = "2026-12-28";
    const after = monthLedger(d, "2026-11", "2026-11-24");
    expect([after.unpaidFixed, after.lifeExpense, after.freeLeft]).toEqual([0, 104420, 15580]);
  });
  it("ホームは自分用で ledger を使い、月の比べ方は増えた・減った・差の合計", () => {
    expect(src("app/page.tsx")).toContain("const ledger = PERSONAL ? monthLedger(data, month, today) : null;");
    expect(src("components/MonthBreakdownCard.tsx")).toContain("生活費の差");
    expect(src("components/MonthBreakdownCard.tsx")).toContain("投資として数えているカテゴリ");
  });
});

describe("A 入力とカレンダー", () => {
  it("よく使うカテゴリ・前回の支払方法は、押したときだけ入る候補（自分用だけ）", () => {
    const s = src("components/TxSheet.tsx");
    expect(s).toContain('const SUGGEST = process.env.NEXT_PUBLIC_KB_EDITION === "personal";');
    expect(s).toContain('aria-label="よく使うカテゴリ"');
    expect(s).toContain("前回と同じ：");
  });
  it("カレンダーの選んだ日に、固定費の支払い予定を実績と分けて出す", () => {
    expect(src("app/calendar/page.tsx")).toContain("固定費の支払い予定");
  });
});
