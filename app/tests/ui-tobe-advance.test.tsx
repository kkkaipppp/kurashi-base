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

describe("立替（画面）", () => {
  it("立替の記録を開くと、金額は払った総額・自分の分は別の欄。「返してもらった」で精算を記録し、収支は変わらない", async () => {
    await mount((d) => ({ ...d, transactions: [tx({ id: "adv", amount: 1000, advanceGross: 4000 })] }), () => <M.sheet.TxSheet req={{ mode: "edit", id: "adv" }} onClose={() => {}} />);
    expect(await screen.findByDisplayValue("4000")).toBeTruthy();
    expect((screen.getByLabelText(/立替/) as HTMLInputElement).value).toBe("1000");
    expect(screen.getByText(/返してもらう分：あと ¥3,000/)).toBeTruthy();
    fireEvent.click(screen.getByText("返してもらった"));
    fireEvent.change(screen.getByLabelText("返してもらった額"), { target: { value: "3000" } });
    fireEvent.click(screen.getByText("記録する"));
    await waitFor(() => expect(seen.d?.transactions.length).toBe(2));
    const s = seen.d!.transactions.find((t) => t.settles === "adv")!;
    expect(s).toMatchObject({ type: "income", amount: 3000, countAs: "transfer", date: "2026-11-28" });
    expect(seen.d!.transactions.find((t) => t.id === "adv")).toMatchObject({ amount: 1000, advanceGross: 4000 });
  });

  it("家計簿の「返してもらう分」：残りがある立替だけ、合計つき", async () => {
    await mount(
      (d) => ({ ...d, transactions: [tx({ id: "a1", amount: 1000, advanceGross: 4000 }), tx({ id: "a2", amount: 500, advanceGross: 1500, merchant: "タクシー" }), tx({ id: "s", type: "income", amount: 1000, countAs: "transfer", settles: "a2", categoryId: "inc-1" }), tx({ id: "p" })] }),
      () => <M.owed.OwedAdvances />,
    );
    expect(await screen.findByText("返してもらう分")).toBeTruthy();
    expect(screen.getAllByText("¥3,000").length).toBe(2);
    expect(screen.queryByText("タクシー")).toBeNull();
  });
  it("新しい支出：総額 4,000円・自分の分 1,000円で保存すると、金額 1,000円・総額 4,000円。自分の分が総額以上なら保存しない", async () => {
    await mount((d) => d, () => <M.sheet.TxSheet req={{ mode: "new", type: "expense", date: "2026-11-28" }} onClose={() => {}} />);
    fireEvent.change(await screen.findByLabelText("金額（円）"), { target: { value: "4000" } });
    // 新しい入力では、立替などは「詳細」にたたんである（2026-11-28）
    expect(screen.queryByLabelText(/立替/)).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /詳細/ }));
    const mine = screen.getByLabelText(/立替/);
    fireEvent.change(mine, { target: { value: "4000" } });
    fireEvent.click(screen.getByText("保存する"));
    expect(await screen.findByText(/払った総額より少なく/)).toBeTruthy();
    expect(seen.d!.transactions.length).toBe(0);
    fireEvent.change(mine, { target: { value: "1000" } });
    fireEvent.click(screen.getByText("保存する"));
    await waitFor(() => expect(seen.d?.transactions.length).toBe(1));
    expect(seen.d!.transactions[0]).toMatchObject({ amount: 1000, advanceGross: 4000, type: "expense" });
  });

  it("返してもらった分がある立替は、立替をやめられない（精算の記録を先に消す）", async () => {
    await mount(
      (d) => ({ ...d, transactions: [tx({ id: "adv", amount: 1000, advanceGross: 4000 }), tx({ id: "s", type: "income", amount: 2000, countAs: "transfer", settles: "adv", categoryId: "inc-1" })] }),
      () => <M.sheet.TxSheet req={{ mode: "edit", id: "adv" }} onClose={() => {}} />,
    );
    fireEvent.change(await screen.findByLabelText(/立替/), { target: { value: "" } });
    fireEvent.click(screen.getByText("保存する"));
    expect(await screen.findByText(/もう ¥2,000 返してもらっています/)).toBeTruthy();
    expect(seen.d!.transactions.find((t) => t.id === "adv")).toMatchObject({ amount: 1000, advanceGross: 4000 });
  });
});

describe("入力の詳細をたたむ（2026-11-28「入力の画面が長い」）", () => {
  it("新しい支出：支払方法・メモは「詳細」の中。押すと出る。直すとき・値が入っているときは初めから開く", async () => {
    await mount((d) => ({ ...d, transactions: [tx({ id: "t1", note: "" })] }), () => <M.sheet.TxSheet req={{ mode: "new", type: "expense" }} onClose={() => {}} />);
    await screen.findByLabelText("金額（円）");
    expect(screen.queryByLabelText(/支払方法/)).toBeNull();
    expect(screen.queryByLabelText(/メモ/)).toBeNull();
    const btn = screen.getByRole("button", { name: /詳細/ });
    expect(btn.getAttribute("aria-expanded")).toBe("false");
    fireEvent.click(btn);
    expect(screen.getByLabelText(/支払方法/)).toBeTruthy();
    expect(screen.getByLabelText(/メモ/)).toBeTruthy();
    cleanup();
    await mount((d) => d, () => <M.sheet.TxSheet req={{ mode: "new", type: "expense", initial: { note: "https://example.com" } }} onClose={() => {}} />);
    expect(((await screen.findByLabelText(/メモ/)) as HTMLTextAreaElement).value).toBe("https://example.com");
    cleanup();
    await mount((d) => ({ ...d, transactions: [tx({ id: "t1" })] }), () => <M.sheet.TxSheet req={{ mode: "edit", id: "t1" }} onClose={() => {}} />);
    expect(await screen.findByLabelText(/支払方法/)).toBeTruthy();
  });
});
