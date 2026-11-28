// @vitest-environment jsdom
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { KV } from "@/lib/storage";

// 誕生日のボタンは自分用だけ（版は読み込みのときに決まる）。環境の値を変えてから読み込み直す
let M: {
  store: typeof import("@/lib/store");
  ui: typeof import("@/components/UIContext");
  sheet: typeof import("@/components/EventSheet");
  repo: typeof import("@/lib/repository");
};
beforeAll(async () => {
  vi.stubEnv("NEXT_PUBLIC_KB_EDITION", "personal");
  vi.resetModules();
  M = {
    store: await import("@/lib/store"),
    ui: await import("@/components/UIContext"),
    sheet: await import("@/components/EventSheet"),
    repo: await import("@/lib/repository"),
  };
}, 60_000);
afterAll(() => vi.unstubAllEnvs());

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: () => {}, replace: () => {}, back: () => {}, prefetch: () => {} }), usePathname: () => "/calendar", useSearchParams: () => new URLSearchParams() }));

// 期待値は手で決めた（To-Be 02 カレンダー「誕生日」。2026-11-28 点検 中3：前からある予定は黙って変えない）
const memKV = (): KV => {
  const m = new Map<string, string>();
  return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => void m.set(k, v), removeItem: (k) => void m.delete(k), key: (i) => [...m.keys()][i] ?? null, get length() { return m.size; } } as KV;
};
function Ready({ children }: { children: React.ReactNode }) {
  return M.store.useStore().data ? <>{children}</> : <p>読み込み中</p>;
}
const wrap = (kv: KV, node: React.ReactNode) => (
  <M.store.StoreProvider repo={new M.repo.LocalStorageRepository(kv)}>
    <M.ui.UIProvider>
      <Ready>{node}</Ready>
    </M.ui.UIProvider>
  </M.store.StoreProvider>
);

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-11-28T03:00:00+09:00"));
});
afterEach(() => {
  cleanup();
  localStorage.clear();
  vi.useRealTimers();
});

describe("誕生日・記念日にする（画面）", () => {
  it("新しい予定で押すと、終日・毎年になり、繰り返しの欄が開いて「毎年」が見える。ボタンは消える", async () => {
    render(wrap(memKV(), <M.sheet.EventSheet req={{ mode: "new", date: "2026-12-05" }} onClose={() => {}} />));
    fireEvent.click(await screen.findByText("誕生日・記念日にする（毎年・終日）"));
    expect((screen.getByRole("checkbox", { name: /終日/ }) as HTMLInputElement).checked).toBe(true);
    expect((screen.getByLabelText("繰り返し") as HTMLSelectElement).value).toBe("yearly");
    expect(screen.queryByText("誕生日・記念日にする（毎年・終日）")).toBeNull();
  });
  it("日をまたぐ予定にしたら出さない（黙って1日に縮めない）", async () => {
    render(wrap(memKV(), <M.sheet.EventSheet req={{ mode: "new", date: "2026-12-05" }} onClose={() => {}} />));
    await screen.findByText("誕生日・記念日にする（毎年・終日）");
    fireEvent.change(screen.getByLabelText("終了日"), { target: { value: "2026-12-07" } });
    expect(screen.queryByText("誕生日・記念日にする（毎年・終日）")).toBeNull();
  });
});
