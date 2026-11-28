// @vitest-environment jsdom
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useEffect } from "react";
import type { KV } from "@/lib/storage";

// ひな形と達成の記録は自分用だけ（版は読み込みのときに決まる）。環境の値を変えてから、部品を読み込み直す
let M: {
  store: typeof import("@/lib/store");
  ui: typeof import("@/components/UIContext");
  goals: typeof import("@/app/goals/page");
  assets: typeof import("@/app/assets/page");
  contracts: typeof import("@/app/contracts/page");
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
    assets: await import("@/app/assets/page"),
    contracts: await import("@/app/contracts/page"),
    repo: await import("@/lib/repository"),
    core: await import("@/lib/storeCore"),
  };
});
afterAll(() => {
  vi.unstubAllEnvs();
});
import type { AppData } from "@/lib/types";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: () => {}, replace: () => {}, back: () => {}, prefetch: () => {} }), usePathname: () => "/assets", useSearchParams: () => new URLSearchParams() }));

// 期待値は手で決めた（決定 2026-11-28 S3-1〜S3-3）
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

const ts2 = "2026-11-01T00:00:00.000Z";

describe("段階3（画面）", () => {
  it("資産：負債があると純資産（資産 − 負債）を出し、評価額を直すと前の値が推移に残る", async () => {
    await mount(
      (d) => ({ ...d, assets: [
        { id: "a", name: "銀行", kind: "cash", value: 300000, asOf: "2026-10-31", note: "", createdAt: ts2, updatedAt: ts2 },
        { id: "l", name: "奨学金", kind: "other", debt: true, value: 120000, asOf: "2026-10-31", note: "", createdAt: ts2, updatedAt: ts2 },
      ] }),
      () => <M.assets.default />,
    );
    expect(await screen.findByText("純資産（資産 − 負債）")).toBeTruthy();
    expect(screen.getByText("純資産（資産 − 負債）").parentElement!.textContent).toContain("¥180,000資産 ¥300,000・負債 ¥120,000");
    expect(screen.getByText("−¥120,000")).toBeTruthy();
    fireEvent.click(screen.getByText("銀行"));
    fireEvent.change(await screen.findByLabelText(/評価額/), { target: { value: "320000" } });
    fireEvent.change(screen.getByLabelText(/評価日/), { target: { value: "2026-11-28" } });
    fireEvent.click(screen.getByText("保存する"));
    await waitFor(() => expect(seen.d!.assets.find((a) => a.id === "a")!.value).toBe(320000));
    expect(seen.d!.assets.find((a) => a.id === "a")).toMatchObject({ value: 320000, asOf: "2026-11-28", history: [{ asOf: "2026-10-31", value: 300000 }] });
    expect(await screen.findByText(/純資産の推移/)).toBeTruthy();
  });

  it("目標：「休止中」にすると休止した日が入り、一覧に「休止中」。外すと消える", async () => {
    await mount((d) => ({ ...d, goals: [{ id: "g", title: "本を読む", deadline: "", kind: "number", target: 10, current: 1, unit: "冊", done: false, note: "", createdAt: ts2, updatedAt: ts2 }] }), () => <M.goals.default />);
    fireEvent.click((await screen.findAllByText("本を読む")).at(-1)!);
    fireEvent.click(await screen.findByLabelText(/休止中/));
    fireEvent.click(screen.getByText("保存する"));
    expect(await screen.findByText(/休止中（11月28日/)).toBeTruthy();
    await waitFor(() => expect(seen.d!.goals[0].pausedAt).toBe("2026-11-28"));
    fireEvent.click((await screen.findAllByText("本を読む")).at(-1)!);
    fireEvent.click(await screen.findByLabelText(/休止中/));
    fireEvent.click(screen.getByText("保存する"));
    await waitFor(() => expect(seen.d!.goals[0].pausedAt).toBeUndefined());
    expect(screen.queryByText(/休止中（/)).toBeNull();
  });

  it("契約：固定費を選んでつなぐと、金額は固定費の金額。解約してもつないだ固定費が動いていれば知らせる", async () => {
    await mount(
      (d) => ({ ...d,
        recurring: [{ id: "r", name: "スマホ代", amount: 3300, cycle: "monthly", anchorDay: 5, nextDueDate: "2026-12-05", categoryId: "exp-5", paymentMethod: "card", active: true, createdAt: ts2, updatedAt: ts2 }],
        contracts: [{ id: "c", name: "スマホ", provider: "", amount: 2500, cycle: "monthly", renewalDate: "", status: "active", note: "", createdAt: ts2, updatedAt: ts2 }],
      }),
      () => <M.contracts.default />,
    );
    expect(await screen.findByText("¥2,500/月")).toBeTruthy();
    fireEvent.click(screen.getByText("スマホ"));
    fireEvent.change(await screen.findByLabelText(/つなぐ固定費/), { target: { value: "r" } });
    fireEvent.change(screen.getByLabelText(/状態/), { target: { value: "cancelled" } });
    fireEvent.click(screen.getByText("保存する"));
    expect(await screen.findByText("¥3,300/月")).toBeTruthy();
    expect(screen.getByText("固定費が止まっていません")).toBeTruthy();
    expect(screen.getByText(/固定費「スマホ代」とつないでいます/)).toBeTruthy();
    await waitFor(() => expect(seen.d!.contracts[0]).toMatchObject({ recurringId: "r", status: "cancelled", amount: 2500 }));
    expect(seen.d!.recurring[0].active).toBe(true);
  });
});
