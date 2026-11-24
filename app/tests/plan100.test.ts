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
