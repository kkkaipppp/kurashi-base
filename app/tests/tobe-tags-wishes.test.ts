import { describe, expect, it } from "vitest";
import { emptyData } from "@/lib/defaults";
import { validateAppData } from "@/lib/schema";
import { parseTags } from "@/app/notes/page";
import { COLLECTION_KEYS } from "@/lib/types";

// 期待値は決めごと（2026-11-28：メモのタグ・欲しいもの。古いデータはそのまま読む）から手で作った
const ts = "2026-11-28T00:00:00.000Z";

describe("メモのタグ", () => {
  it("読点・カンマ・空白で区切り、# を外し、重ねない。20字まで・10個まで", () => {
    expect(parseTags("旅行、 #家族,旅行  ＃仕事")).toEqual(["旅行", "家族", "仕事"]);
    expect(parseTags("あ".repeat(25))).toEqual(["あ".repeat(20)]);
    expect(parseTags(Array.from({ length: 12 }, (_, i) => `t${i}`).join(" "))).toHaveLength(10);
    expect(parseTags("  ")).toEqual([]);
  });
});

describe("保存の形：タグ・欲しいもの", () => {
  it("タグ・欲しいもののあるデータも、欲しいものが無い古いデータも読める（無ければ空の一覧）。形の違うものは断る", () => {
    const d = emptyData(ts);
    d.notes = [{ id: "n", title: "t", body: "", date: "", pinned: false, tags: ["旅行"], createdAt: ts, updatedAt: ts }];
    d.wishes = [{ id: "w", name: "靴", price: 12000, url: "https://example.com", priority: "high", status: "want", note: "", createdAt: ts, updatedAt: ts }];
    expect(validateAppData(JSON.parse(JSON.stringify(d))).ok).toBe(true);
    const old = JSON.parse(JSON.stringify(emptyData(ts)));
    delete old.wishes;
    const r = validateAppData(old);
    expect(r.ok && r.data.wishes).toEqual([]);
    for (const [k, v] of [["priority", "urgent"], ["status", "maybe"], ["url", "javascript:alert(1)"]] as const) {
      const bad = JSON.parse(JSON.stringify(d));
      bad.wishes[0][k] = v;
      expect(validateAppData(bad).ok, k).toBe(false);
    }
    const bad = JSON.parse(JSON.stringify(d));
    bad.notes[0].tags = [""];
    expect(validateAppData(bad).ok).toBe(false);
    expect(COLLECTION_KEYS.at(-1)).toBe("wishes");
  });
});
