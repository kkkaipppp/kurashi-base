// @vitest-environment jsdom
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { validateAppData } from "@/lib/schema";
import { STORAGE_KEY } from "@/lib/storage";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// 期待値は決めごと（決定 Q34 ①：練習は保存しない。本当の記録・控え・書きかけには何も書かない。2026-11-28）から手で作った
let P: typeof import("@/lib/practice");
let pub: typeof import("@/lib/practice");
let draft: typeof import("@/lib/sheetDraft");
beforeAll(async () => {
  vi.stubEnv("NEXT_PUBLIC_KB_EDITION", "public");
  vi.resetModules();
  pub = await import("@/lib/practice");
  vi.stubEnv("NEXT_PUBLIC_KB_EDITION", "personal");
  vi.resetModules();
  P = await import("@/lib/practice");
  draft = await import("@/lib/sheetDraft");
}, 60_000);
afterAll(() => vi.unstubAllEnvs());
afterEach(() => {
  sessionStorage.clear();
  localStorage.clear();
});

describe("保存しない練習", () => {
  it("印はこのタブだけ（sessionStorage）。公開版では練習にならない", () => {
    expect(P.isPractice()).toBe(false);
    expect(P.setPractice(true)).toBe(true);
    expect(P.isPractice()).toBe(true);
    expect(localStorage.length).toBe(0);
    vi.stubEnv("NEXT_PUBLIC_KB_EDITION", "public");
    expect(pub.isPractice()).toBe(false);
    vi.stubEnv("NEXT_PUBLIC_KB_EDITION", "personal");
    P.setPractice(false);
    expect(P.isPractice()).toBe(false);
  });

  it("見本は保存の検査を通る。名前で練習とわかる", () => {
    const d = P.practiceData("2026-11-28", "2026-11-28T00:00:00.000Z");
    expect(validateAppData(JSON.parse(JSON.stringify(d))).ok).toBe(true);
    expect(d.transactions.every((t) => t.merchant.includes("練習"))).toBe(true);
    expect(d.events.every((e) => e.title.includes("練習"))).toBe(true);
  });

  it("練習の保存先に読み書き・取り消し・すべて削除をしても、本当の保存先（localStorage）は1バイトも変わらない", async () => {
    localStorage.setItem(STORAGE_KEY, '{"本当の記録":1}');
    const before = JSON.stringify(Object.entries(localStorage));
    const repo = P.practiceRepository("2026-11-28");
    const r = await repo.load();
    expect(r.status).toBe("ok");
    if (r.status !== "ok") return;
    const next = { ...r.data, tasks: [...r.data.tasks, { id: "x", title: "練習で足した", due: "", done: false, note: "", createdAt: "2026-11-28T00:00:00.000Z", updatedAt: "2026-11-28T00:00:00.000Z" }] };
    const s = await repo.save(next, r.token, "練習の置き換え");
    expect(s.ok).toBe(true);
    const again = await repo.load();
    expect(again.status === "ok" && again.data.tasks.some((t) => t.id === "x")).toBe(true);
    if (s.ok) expect((await repo.undo(s.token)).ok).toBe(true);
    const w = await repo.load();
    if (w.status === "ok") expect((await repo.wipe(w.token)).ok).toBe(true);
    expect(JSON.stringify(Object.entries(localStorage))).toBe(before);
  });

  it("練習中は入力の書きかけを控えない（練習をやめると、また控える）", () => {
    P.setPractice(true);
    expect(draft.saveSheetDraft("tx", null, { amount: "100" })).toBe(false);
    expect(localStorage.length).toBe(0);
    P.setPractice(false);
    expect(draft.saveSheetDraft("tx", null, { amount: "100" })).toBe(true);
  });
});

describe("練習中に止めるもの（画面のつなぎ）", () => {
  const src = (f: string) => readFileSync(join(__dirname, "..", "src", f), "utf8");
  it("練習かどうかは開いたときに1回だけ決め、写し（WidgetSync）を出さない（点検 中-1）", () => {
    const s = src("components/AppShell.tsx");
    expect(s).toContain("<Gate practice={practiceRepo !== undefined}>");
    expect(s).toContain("{!practice && <WidgetSync />}");
  });
  it("書き出し・iPhone の連携・勉強のタイマーは練習中に使わない。お知らせに「練習なので保存しません」（点検 中-2〜4・低-1）", () => {
    const st = src("app/settings/page.tsx");
    expect(st.match(/if \(PERSONAL_BUILD && isPractice\(\)\) return ui\.toast\("練習中は書き出せません/g)?.length).toBe(2);
    expect(st).toContain("練習中は、iPhone のカレンダー・通知の設定を変えられません");
    expect(src("app/study/page.tsx")).toContain('process.env.NEXT_PUBLIC_KB_EDITION === "personal" && isPractice() ? <p');
    expect(src("components/UIContext.tsx")).toContain("（練習なので保存しません）");
  });
  it("印のキーは1か所（点検 低-5）", () => {
    expect(P.PRACTICE_KEY).toBe("kurashi-base:practice:v1");
    expect(src("lib/sheetDraft.ts")).not.toContain("kurashi-base:practice");
  });
});
