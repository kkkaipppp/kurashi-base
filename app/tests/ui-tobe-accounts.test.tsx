// @vitest-environment jsdom
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useEffect } from "react";
import type { KV } from "@/lib/storage";

// 立替の欄は自分用だけ（版は読み込みのときに決まる）。環境の値を変えてから、部品を読み込み直す
let M: {
  store: typeof import("@/lib/store");
  ui: typeof import("@/components/UIContext");
  sheet: typeof import("@/components/TxSheet");
  owed: typeof import("@/components/OwedAdvances");
  accounts: typeof import("@/app/accounts/page");
  repo: typeof import("@/lib/repository");
  core: typeof import("@/lib/storeCore");
};
beforeAll(async () => {
  vi.stubEnv("NEXT_PUBLIC_KB_EDITION", "personal");
  vi.resetModules();
  M = {
    store: await import("@/lib/store"),
    ui: await import("@/components/UIContext"),
    sheet: await import("@/components/TxSheet"),
    owed: await import("@/components/OwedAdvances"),
    accounts: await import("@/app/accounts/page"),
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

const bank = { id: "bank", name: "〇〇銀行", kind: "bank" as const, closingDay: null, payDay: null, baseBalance: 100000, baseDate: "2026-11-01", note: "", archived: false, createdAt: ts, updatedAt: ts };

describe("口座・カード（画面）", () => {
  it("支出の詳細で口座を選んで保存すると、記録に口座が入り、口座の画面の残高の目安が減る", async () => {
    await mount((d) => ({ ...d, accounts: [bank] }), () => <M.sheet.TxSheet req={{ mode: "new", type: "expense", date: "2026-11-20" }} onClose={() => {}} />);
    fireEvent.change(await screen.findByLabelText("金額（円）"), { target: { value: "3000" } });
    fireEvent.click(screen.getByRole("button", { name: /詳細/ }));
    fireEvent.change(screen.getByLabelText(/払った口座・カード/), { target: { value: "bank" } });
    fireEvent.click(screen.getByText("保存する"));
    await waitFor(() => expect(seen.d?.transactions.length).toBe(1));
    expect(seen.d!.transactions[0]).toMatchObject({ amount: 3000, accountId: "bank" });
    cleanup();
    await mount((d) => ({ ...d, accounts: [bank], transactions: [tx({ id: "t", date: "2026-11-20", amount: 3000, accountId: "bank" })] }), () => <M.accounts.default />);
    expect((await screen.findAllByText("¥97,000")).length).toBe(2); // 上の合計と、口座の行
  });

  it("「合わせる」で今の残高を入れると、照合した残高と日が入る", async () => {
    await mount((d) => ({ ...d, accounts: [bank] }), () => <M.accounts.default />);
    fireEvent.click(await screen.findByRole("button", { name: "合わせる" }));
    fireEvent.change(await screen.findByLabelText(/今日の実際の残高/), { target: { value: "98500" } });
    fireEvent.click(screen.getAllByRole("button", { name: "合わせる" }).at(-1)!);
    await waitFor(() => expect(seen.d?.accounts[0].baseBalance).toBe(98500));
    expect(seen.d!.accounts[0].baseDate).toBe("2026-11-28");
  });
});
