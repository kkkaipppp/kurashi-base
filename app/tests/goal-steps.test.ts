import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { emptyData } from "@/lib/defaults";
import { MAX_STEPS, MAX_STEP_LEN, parseSteps, stepProgress, stepsToText } from "@/lib/goalSteps";
import { validateAppData } from "@/lib/schema";

// NEXT v21：目標のやること。1行1つ・先頭の✓で完了。任意の項目（古いデータはそのまま読める）
const now = "2026-11-25T00:00:00.000Z";
describe("目標のやること", () => {
  it("1行に1つ。空行は無視。先頭の ✓ ☑ ✔ は完了", () => {
    const s = parseSteps("見積りを取る\n\n✓ 申込書を出す\n☑ 手付金\n  ✔  内見  ");
    expect(s.map((x) => [x.text, x.done])).toEqual([["見積りを取る", false], ["申込書を出す", true], ["手付金", true], ["内見", true]]);
    expect(new Set(s.map((x) => x.id)).size).toBe(4);
  });
  it("書き戻すと、同じ形になる（往復で変わらない）", () => {
    const t = "見積りを取る\n✓ 申込書を出す";
    expect(stepsToText(parseSteps(t))).toBe(t);
    expect(stepsToText(undefined)).toBe("");
  });
  it("長さと数に上限がある（60字・30件）", () => {
    expect(parseSteps("あ".repeat(100))[0].text).toHaveLength(MAX_STEP_LEN);
    expect(parseSteps(Array.from({ length: 50 }, (_, i) => `x${i}`).join("\n"))).toHaveLength(MAX_STEPS);
  });
  it("✓ だけの行は、やることにしない", () => {
    expect(parseSteps("✓\n✓  \n本当のこと")).toHaveLength(1);
  });
  it("進み具合：done/total。なければ null。全部終わっても『達成』は自動では付かない", () => {
    expect(stepProgress({})).toEqual({ total: 0, done: 0, pct: null });
    expect(stepProgress({ steps: parseSteps("a\n✓ b\n✓ c") })).toEqual({ total: 3, done: 2, pct: 67 });
  });
  it("保存の検査：やることがあっても、なくても、読める。壊れた形は拒否する", () => {
    const d = emptyData(now);
    const g = { id: "g", title: "引っ越す", deadline: "", kind: "check" as const, target: null, current: 0, unit: "", done: false, note: "", createdAt: now, updatedAt: now };
    d.goals = [g, { ...g, id: "h", steps: parseSteps("a\n✓ b") }];
    expect(validateAppData(d).ok).toBe(true);
    d.goals = [{ ...g, steps: [{ id: "x", text: 1, done: false }] } as never];
    expect(validateAppData(d).ok).toBe(false);
  });
  it("画面は自分用だけ（公開版の項目に出さない）", () => {
    const page = readFileSync(join(__dirname, "..", "src", "app", "goals", "page.tsx"), "utf8");
    expect(page).toContain("PERSONAL_BUILD ? [");
    expect(page).toContain("parseSteps");
  });
});

describe("目標の達成率の表示", () => {
  const g = { id: "g", title: "引っ越す", deadline: "", kind: "check" as const, target: null, current: 0, unit: "", done: false, note: "", createdAt: now, updatedAt: now };
  it("達成目標でやることがあれば、やることの進み具合。なければ今までどおり。達成済みは100。数字の目標は変えない", async () => {
    const { displayProgress } = await import("@/lib/goalSteps");
    expect(displayProgress({ ...g, steps: parseSteps("a\n✓ b") }, 0)).toBe(50);
    expect(displayProgress(g, 0)).toBe(0);
    expect(displayProgress({ ...g, done: true, steps: parseSteps("a") }, 0)).toBe(100);
    expect(displayProgress({ ...g, kind: "number", target: 100, current: 40, steps: parseSteps("✓ a") }, 40)).toBe(40);
  });
});

describe("節目の日（やることの日付）", () => {
  it("行の終わりの @日付 を節目の日にする。往復で同じ形。実在しない日付は節目にしない", () => {
    const s = parseSteps("見積りを取る @2026-12-20\n✓ 申込書を出す＠2026-12-01\n契約 @2026-02-30");
    expect(s[0]).toMatchObject({ text: "見積りを取る", due: "2026-12-20", done: false });
    expect(s[1]).toMatchObject({ text: "申込書を出す", due: "2026-12-01", done: true });
    expect(s[2].due).toBeUndefined();
    expect(s[2].text).toContain("@2026-02-30"); // 日付として読めないものは、文字のまま残す
    expect(stepsToText(parseSteps("見積りを取る @2026-12-20\n✓ 申込書を出す @2026-12-01"))).toBe("見積りを取る @2026-12-20\n✓ 申込書を出す @2026-12-01");
  });
  it("期限の一覧に、終わっていない節目だけが、その日に出る。達成済みの目標・終わった節目は出ない", async () => {
    const { deadlinesOn } = await import("@/lib/deadlines");
    const d = emptyData(now);
    const g = { id: "g", title: "引っ越す", deadline: "", kind: "check" as const, target: null, current: 0, unit: "", done: false, note: "", createdAt: now, updatedAt: now };
    d.goals = [{ ...g, steps: parseSteps("見積りを取る @2026-12-20\n✓ 申込書 @2026-12-20") }, { ...g, id: "h", done: true, steps: parseSteps("x @2026-12-20") }];
    const items = deadlinesOn(d, "2026-12-20");
    expect(items.map((x) => x.title)).toEqual(["引っ越す：見積りを取る"]);
    expect(deadlinesOn(d, "2026-12-21")).toEqual([]);
  });
  it("保存の検査：節目の日が壊れた形は拒否する", () => {
    const d = emptyData(now);
    const g = { id: "g", title: "t", deadline: "", kind: "check" as const, target: null, current: 0, unit: "", done: false, note: "", createdAt: now, updatedAt: now };
    d.goals = [{ ...g, steps: [{ id: "a", text: "x", done: false, due: "あした" }] }];
    expect(validateAppData(d).ok).toBe(false);
  });
});
