// @vitest-environment jsdom
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useEffect } from "react";
import type { KV } from "@/lib/storage";

// 公開版として読み込む（立替の欄は無い）。復元で入った立替・精算の記録を、公開版で壊さない
let M: {
  store: typeof import("@/lib/store");
  ui: typeof import("@/components/UIContext");
  sheet: typeof import("@/components/TxSheet");
  owed: typeof import("@/components/OwedAdvances");
  repo: typeof import("@/lib/repository");
  core: typeof import("@/lib/storeCore");
};
beforeAll(async () => {
  vi.stubEnv("NEXT_PUBLIC_KB_EDITION", "public");
  vi.resetModules();
  M = {
    store: await import("@/lib/store"),
    ui: await import("@/components/UIContext"),
    sheet: await import("@/components/TxSheet"),
    owed: await import("@/components/OwedAdvances"),
    repo: await import("@/lib/repository"),
    core: await import("@/lib/storeCore"),
  };
});
afterAll(() => {
  vi.unstubAllEnvs();
});
import type { AppData, Transaction } from "@/lib/types";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: () => {}, replace: () => {}, back: () => {}, prefetch: () => {} }), usePathname: () => "/report", useSearchParams: () => new URLSearchParams() }));

// 期待値は手で決めた（決定 2026-11-28：金額は自分の分・総額を控える）
const ts = "2026-11-28T00:00:00.000Z";
const memKV = (): KV => {
  const m = new Map<string, string>();
  return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => void m.set(k, v), removeItem: (k) => void m.delete(k), key: (i) => [...m.keys()][i] ?? null, get length() { return m.size; } } as KV;
};
const tx = (o: Partial<Transaction>): Transaction => ({ id: "t", type: "expense", date: "2026-11-10", amount: 1000, currency: "JPY", categoryId: "exp-1", merchant: "居酒屋", paymentMethod: "cash", note: "", source: "manual", createdAt: ts, updatedAt: ts, ...o });
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

describe("立替（公開版）", () => {
  it("公開版で立替の記録を開いて保存しても、総額に戻さない（直せないと出す）", async () => {
    await mount((d) => ({ ...d, transactions: [tx({ id: "adv", amount: 1000, advanceGross: 4000 })] }), () => <M.sheet.TxSheet req={{ mode: "edit", id: "adv" }} onClose={() => {}} />);
    const amount = await screen.findByDisplayValue("4000");
    expect(screen.queryByLabelText(/立替/)).toBeNull();
    fireEvent.change(amount, { target: { value: "4500" } });
    fireEvent.click(screen.getByText("保存する"));
    expect(await screen.findByText(/この記録は、この画面では直せません/)).toBeTruthy();
    expect(seen.d!.transactions[0]).toMatchObject({ amount: 1000, advanceGross: 4000 });
  });
});
