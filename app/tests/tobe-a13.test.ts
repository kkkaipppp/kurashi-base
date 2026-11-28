import { afterAll, describe, expect, it, vi } from "vitest";

// To-Be 06 A13：未対応の機能は通常の画面に出さない（自分用のメニューから「準備中」を外す。2026-11-28）。公開版は今のまま
describe("A13 準備中の画面", () => {
  afterAll(() => vi.unstubAllEnvs());
  it("自分用のメニューには、準備中の項目が無い", async () => {
    vi.stubEnv("NEXT_PUBLIC_KB_EDITION", "personal");
    vi.resetModules();
    const { GROUPS } = await import("@/lib/menuGroups");
    expect(GROUPS.flatMap((g) => g.items).filter((i) => i.soon)).toEqual([]);
    expect(GROUPS.some((g) => g.title.includes("準備中"))).toBe(false);
  });
  it("公開版は、準備中のまとまりを今までどおり出す", async () => {
    vi.stubEnv("NEXT_PUBLIC_KB_EDITION", "");
    vi.resetModules();
    const { GROUPS } = await import("@/lib/menuGroups");
    expect(GROUPS.flatMap((g) => g.items).filter((i) => i.soon).map((i) => i.href)).toEqual(["/share", "/ai", "/integrations", "/widget"]);
  });
});
