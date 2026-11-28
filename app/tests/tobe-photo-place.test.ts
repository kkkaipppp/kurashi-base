import { describe, expect, it } from "vitest";
import { emptyData } from "@/lib/defaults";
import { validateAppData } from "@/lib/schema";

// 期待値は決めごと（Q33 ①：写真は持たず、保管場所だけ書く。2026-11-28）から手で作った
const ts = "2026-11-28T00:00:00.000Z";

describe("写真の保管場所（メモ・書類）", () => {
  it("保管場所があってもなくても読める。200字を超えるもの・文字でないものは断る", () => {
    const d = emptyData(ts);
    d.notes = [{ id: "n", title: "", body: "領収書", date: "", pinned: false, photoPlace: "iPhone の写真「レシート」", createdAt: ts, updatedAt: ts }, { id: "m", title: "", body: "", date: "", pinned: false, createdAt: ts, updatedAt: ts }];
    d.documents = [{ id: "d", title: "保険証券", category: "保険", expiry: "", place: "引き出し", note: "", photoPlace: "クラウドの「書類」", createdAt: ts, updatedAt: ts }];
    expect(validateAppData(JSON.parse(JSON.stringify(d))).ok).toBe(true);
    for (const v of ["あ".repeat(201), 3]) {
      const bad = JSON.parse(JSON.stringify(d));
      bad.notes[0].photoPlace = v;
      expect(validateAppData(bad).ok).toBe(false);
      const bad2 = JSON.parse(JSON.stringify(d));
      bad2.documents[0].photoPlace = v;
      expect(validateAppData(bad2).ok).toBe(false);
    }
  });
});
