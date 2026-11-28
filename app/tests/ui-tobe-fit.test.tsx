// @vitest-environment jsdom
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { readFileSync } from "node:fs";

// 平尾さん 2026-11-28 の写真：入力の画面が保存ボタンごとキーボードで動く・入り切らない／下のボタンの並びが動く／旅行の ?open=new で更新が止まらない。期待値は手で決めた
const nav = vi.hoisted(() => ({ open: "new" as string | null, replace: vi.fn() }));
vi.mock("next/navigation", () => ({
  usePathname: () => "/trips",
  useRouter: () => ({ replace: nav.replace, push: () => {}, back: () => {}, prefetch: () => {} }),
  useSearchParams: () => new URLSearchParams(nav.open ? `open=${nav.open}` : ""),
}));

let M: { sheet: typeof import("@/components/Sheet"); oq: typeof import("@/components/OpenFromQuery") };
beforeAll(async () => {
  vi.stubEnv("NEXT_PUBLIC_KB_EDITION", "personal");
  vi.resetModules();
  M = { sheet: await import("@/components/Sheet"), oq: await import("@/components/OpenFromQuery") };
});
afterAll(() => vi.unstubAllEnvs());
afterEach(() => cleanup());

describe("自分用の入力の画面（シート）", () => {
  it("ボタン（保存など）は見出しのすぐ下、中身より前。画面いっぱいの高さ", () => {
    render(
      <M.sheet.Sheet title="旅行を追加" open onRequestClose={() => {}} footer={<button type="button">保存する</button>}>
        <p>中身</p>
      </M.sheet.Sheet>,
    );
    const dialog = screen.getByRole("dialog");
    const order = [...dialog.querySelectorAll("h2, button, p")].map((e) => e.textContent);
    expect(order.indexOf("保存する")).toBeLessThan(order.indexOf("中身"));
    expect(order.indexOf("旅行を追加")).toBeLessThan(order.indexOf("保存する"));
    expect(dialog.className).toContain("h-[calc(100%-0.5rem-var(--sat))]");
  });
});

describe("?open= は1回だけ開く", () => {
  it("一覧が描き直されても（ids が新しい配列）、同じ open で onOpen を何度も呼ばない", () => {
    const onOpen = vi.fn();
    const { rerender } = render(<M.oq.OpenFromQuery ids={["a"]} onOpen={onOpen} />);
    for (let i = 0; i < 5; i++) rerender(<M.oq.OpenFromQuery ids={["a", `x${i}`]} onOpen={onOpen} />);
    expect(onOpen).toHaveBeenCalledTimes(1);
    expect(onOpen).toHaveBeenCalledWith("new", undefined);
  });
});

describe("下のボタンの並び・画面の引っ張り", () => {
  it("キーボードが出ている間は隠す。画面の端で引っ張っても全体が動かない", () => {
    expect(readFileSync("src/components/PersonalShell.tsx", "utf8")).toContain('<nav aria-label="メイン" hidden={keyboard}');
    expect(readFileSync("src/app/globals.css", "utf8")).toMatch(/html\[data-edition="personal"\] body \{\s*overscroll-behavior: none;/);
  });
});
