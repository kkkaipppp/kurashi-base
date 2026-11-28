// @vitest-environment jsdom
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useEffect } from "react";
import type { KV } from "@/lib/storage";

// ひな形と達成の記録は自分用だけ（版は読み込みのときに決まる）。環境の値を変えてから、部品を読み込み直す
let M: {
  store: typeof import("@/lib/store");
  ui: typeof import("@/components/UIContext");
  goals: typeof import("@/app/goals/page");
  cond: typeof import("@/components/GoalConditions");
  repo: typeof import("@/lib/repository");
  core: typeof import("@/lib/storeCore");
};
beforeAll(async () => {
  vi.stubEnv("NEXT_PUBLIC_KB_EDITION", "personal");
  vi.resetModules();
  M = {
    store: await import("@/lib/store"),
    ui: await import("@/components/UIContext"),
    goals: await import("@/app/goals/page"),
    cond: await import("@/components/GoalConditions"),
    repo: await import("@/lib/repository"),
    core: await import("@/lib/storeCore"),
  };
});
afterAll(() => {
  vi.unstubAllEnvs();
});
import type { AppData } from "@/lib/types";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: () => {}, replace: () => {}, back: () => {}, prefetch: () => {} }), usePathname: () => "/goals", useSearchParams: () => new URLSearchParams() }));

// 期待値は手で決めた（To-Be 02 目標：種類のひな形・達成履歴）
const ts = "2026-11-28T00:00:00.000Z";
const memKV = (): KV => {
  const m = new Map<string, string>();
  return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => void m.set(k, v), removeItem: (k) => void m.delete(k), key: (i) => [...m.keys()][i] ?? null, get length() { return m.size; } } as KV;
};
// 描いたときの最新のデータを控える（試験で保存の中身を見るため）
const seen: { d: AppData | null } = { d: null };
function Ready({ children }: { children: React.ReactNode }) {
  const s = M.store.useStore();
  useEffect(() => {
    seen.d = s.data;
  });
  return s.data ? <>{children}</> : <p>読み込み中</p>;
}
async function mount(fill: (d: AppData) => AppData, ui: () => React.ReactNode) {
  const kv = memKV();
  const seed = new M.core.StoreCore(new M.repo.LocalStorageRepository(kv));
  await seed.reload();
  expect((await seed.commit(fill)).ok).toBe(true);
  render(
    <M.store.StoreProvider repo={new M.repo.LocalStorageRepository(kv)}>
      <M.ui.UIProvider>
        <Ready>{ui()}</Ready>
      </M.ui.UIProvider>
    </M.store.StoreProvider>,
  );
}
beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-11-28T03:00:00+09:00"));
  seen.d = null;
});
afterEach(() => {
  cleanup();
  localStorage.clear();
});

const goal = { id: "g1", title: "30万円ためる", deadline: "", kind: "number" as const, target: 300000, current: 0, unit: "円", done: false, note: "", createdAt: ts, updatedAt: ts };

describe("目標（段階3）", () => {
  it("新しい目標：開いた直後はどのひな形も押されていない。「読書」で数値・冊、ほかの欄は残る。「資格・勉強」で達成目標（単位は消さない）。押しただけでは保存しない", async () => {
    await mount((d) => d, () => <M.goals.default />);
    fireEvent.click((await screen.findAllByText(/目標を追加/))[0]);
    const btns = () => ["貯金", "読書", "運動", "習慣", "資格・勉強", "キャリア", "自由"].map((n) => screen.getByRole("button", { name: n }).getAttribute("aria-pressed"));
    expect(btns()).toEqual(["false", "false", "false", "false", "false", "false", "false"]);
    fireEvent.change(screen.getByLabelText(/内容/), { target: { value: "年に24冊読む" } });
    fireEvent.click(screen.getByRole("button", { name: "読書" }));
    expect((screen.getByLabelText(/単位/) as HTMLInputElement).value).toBe("冊");
    expect((screen.getByLabelText(/内容/) as HTMLInputElement).value).toBe("年に24冊読む");
    expect(btns()).toEqual(["false", "true", "false", "false", "false", "false", "false"]);
    fireEvent.change(screen.getByLabelText(/単位/), { target: { value: "ページ" } });
    expect(btns()).toEqual(["false", "false", "false", "false", "false", "false", "false"]);
    fireEvent.click(screen.getByRole("button", { name: "資格・勉強" }));
    expect(screen.queryByLabelText(/単位/)).toBeNull();
    expect(btns()).toEqual(["false", "false", "false", "false", "true", "false", "false"]);
    fireEvent.click(screen.getByRole("button", { name: "自由" }));
    expect((screen.getByLabelText(/単位/) as HTMLInputElement).value).toBe("ページ");
    expect(seen.d!.goals.length).toBe(0);
  });

  it("編集のときは、ひな形を出さない", async () => {
    await mount((d) => ({ ...d, goals: [goal] }), () => <M.goals.default />);
    fireEvent.click((await screen.findAllByText("30万円ためる")).at(-1)!);
    await screen.findByDisplayValue("30万円ためる");
    expect(screen.queryByRole("button", { name: "貯金" })).toBeNull();
  });

  it("達成の記録を、新しい順に日付（日本時間。10/1 15:30 UTC は 10/2）と条件つきで出す", async () => {
    const g = { ...goal, achievements: [
      { at: "2026-10-01T15:30:00.000Z", verdict: "met" as const, conditions: [{ id: "c1", label: "貯金", unit: "円", op: ">=" as const, target: 100000, actual: 100000 }] },
      { at: "2026-11-20T01:00:00.000Z", verdict: "met" as const, conditions: [{ id: "c2", label: "体重", unit: "kg", op: "range" as const, target: 60, targetMax: 65, actual: 62 }] },
    ] };
    await mount((d) => ({ ...d, goals: [g] }), () => <M.cond.GoalConditionsButton goal={g} />);
    fireEvent.click(await screen.findByRole("button", { name: /達成条件/ }));
    const items = (await screen.findByText(/達成の記録：2回/)).closest("section")!.querySelectorAll("li");
    expect([...items].map((li) => li.textContent)).toEqual(["2026年11月20日(金)満たす体重 60〜65kgの範囲", "2026年10月2日(金)満たす貯金 100,000円 以上"]);
  });
});
