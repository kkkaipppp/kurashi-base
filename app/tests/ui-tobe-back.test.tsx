// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { BackButton } from "@/components/ui";

// 平尾さん 2026-11-28「一個前に行くページの戻るボタンが欲しい」。期待値は手で決めた
const nav = vi.hoisted(() => ({ path: "/goals", back: vi.fn(), push: vi.fn() }));
vi.mock("next/navigation", () => ({ usePathname: () => nav.path, useRouter: () => ({ back: nav.back, push: nav.push, replace: () => {}, prefetch: () => {} }), useSearchParams: () => new URLSearchParams() }));

afterEach(() => {
  cleanup();
  nav.back.mockReset();
  nav.push.mockReset();
});

describe("戻るボタン（自分用の見出し）", () => {
  it("下のボタンで開く画面（ホーム・カレンダー・家計簿・メニュー）には出さない", () => {
    for (const p of ["/", "/calendar", "/report", "/menu"]) {
      nav.path = p;
      render(<BackButton />);
      expect(screen.queryByRole("button", { name: "前の画面に戻る" })).toBeNull();
      cleanup();
    }
  });

  it("ほかの画面では出て、押すと一つ前の画面へ。前が無ければメニューへ", () => {
    nav.path = "/goals";
    window.history.pushState({}, "", "/a");
    window.history.pushState({}, "", "/goals");
    render(<BackButton />);
    fireEvent.click(screen.getByRole("button", { name: "前の画面に戻る" }));
    expect(nav.back).toHaveBeenCalledTimes(1);
    expect(nav.push).not.toHaveBeenCalled();
    const spy = vi.spyOn(window.history, "length", "get").mockReturnValue(1);
    fireEvent.click(screen.getByRole("button", { name: "前の画面に戻る" }));
    expect(nav.push).toHaveBeenCalledWith("/menu");
    spy.mockRestore();
  });

  it("見出しは自分用の版だけ戻るボタンを入れる（公開版の組み立てに入れない）", async () => {
    const src = (await import("node:fs")).readFileSync("src/components/ui.tsx", "utf8");
    expect(src).toContain('process.env.NEXT_PUBLIC_KB_EDITION === "personal" && <BackButton onBack={onBack} />');
  });
});

describe("画面の中で開いた詳細の「戻る」（2026-11-28 洗い出し 1・2）", () => {
  it("onBack を渡すと、下のボタンで開く画面でも出て、押すと onBack（URL は戻さない）", () => {
    nav.path = "/";
    const onBack = vi.fn();
    render(<BackButton onBack={onBack} />);
    fireEvent.click(screen.getByRole("button", { name: "前の画面に戻る" }));
    expect(onBack).toHaveBeenCalledTimes(1);
    expect(nav.back).not.toHaveBeenCalled();
  });
  it("計画・旅行の詳細は見出しの「戻る」で一覧へ（別の「一覧」ボタンは無い）。固定する帯と、たたむ説明", async () => {
    const fs = await import("node:fs");
    const plans = fs.readFileSync("src/components/PlansScreen.tsx", "utf8");
    expect(plans).toContain("onBack={onBack} minimal />");
    expect(plans).not.toContain('aria-label="計画の一覧に戻る"');
    const trips = fs.readFileSync("src/app/trips/page.tsx", "utf8");
    expect(trips).toContain("onBack={onBack}");
    expect(trips).toContain("調べる・この旅行を元に作る");
    expect(fs.readFileSync("src/app/report/page.tsx", "utf8")).toContain('"sticky top-[calc(var(--sat)+3.5rem)] z-[9]');
    expect(fs.readFileSync("src/app/search/page.tsx", "utf8")).toContain('"sticky top-[calc(var(--sat)+3.5rem)] z-[9]');
    expect(fs.readFileSync("src/components/CollectionPage.tsx", "utf8")).toContain("この画面について");
    expect(fs.readFileSync("src/app/calendar/page.tsx", "utf8")).toContain("onClick={() => pickDay(d)}");
  });
});
