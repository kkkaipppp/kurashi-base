// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { StoreProvider, useStore } from "@/lib/store";
import { UIProvider } from "@/components/UIContext";
import { YearView } from "@/components/CalendarViews";
import { UpcomingPayments } from "@/components/MoneyMonth";
import { LocalStorageRepository } from "@/lib/repository";
import { StoreCore } from "@/lib/storeCore";
import type { KV } from "@/lib/storage";
import type { AppData, Transaction } from "@/lib/types";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: () => {}, replace: () => {}, back: () => {}, prefetch: () => {} }), usePathname: () => "/calendar", useSearchParams: () => new URLSearchParams() }));

// 画面の試験（To-Be 点検 中-4：文字を探すだけでなく、描いて確かめる）。期待値は手で決めた
const ts = "2026-11-28T00:00:00.000Z";
const memKV = (): KV => {
  const m = new Map<string, string>();
  return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => void m.set(k, v), removeItem: (k) => void m.delete(k), key: (i) => [...m.keys()][i] ?? null, get length() { return m.size; } } as KV;
};
const tx = (o: Partial<Transaction>): Transaction => ({ id: "t", type: "expense", date: "2026-03-05", amount: 1000, currency: "JPY", categoryId: "exp-1", merchant: "", paymentMethod: "", note: "", source: "manual", createdAt: ts, updatedAt: ts, ...o });

function Ready({ children }: { children: React.ReactNode }) {
  return useStore().data ? <>{children}</> : <p>読み込み中</p>;
}

async function mount(fill: (d: AppData) => AppData, ui: React.ReactNode) {
  const kv = memKV();
  const seed = new StoreCore(new LocalStorageRepository(kv));
  await seed.reload();
  expect((await seed.commit(fill)).ok).toBe(true);
  render(
    <StoreProvider repo={new LocalStorageRepository(kv)}>
      <UIProvider>
        <Ready>{ui}</Ready>
      </UIProvider>
    </StoreProvider>,
  );
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-11-28T03:00:00+09:00"));
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("カレンダーの年の表示（画面）", () => {
  it("月ごとの支出・収入（口座間の移動は入らない）と予定のある日。月を押すとその月", async () => {
    const picked: string[] = [];
    await mount(
      (d) => ({
        ...d,
        transactions: [tx({ id: "a", amount: 1200 }), tx({ id: "b", date: "2026-03-20", amount: 800 }), tx({ id: "c", date: "2026-03-21", amount: 5000, countAs: "transfer" }), tx({ id: "d", date: "2026-07-25", type: "income", categoryId: "inc-1", amount: 250000 })],
        events: [{ id: "e1", title: "歯医者", startDate: "2026-03-10", endDate: "2026-03-11", allDay: true, startTime: "", endTime: "", note: "", createdAt: ts, updatedAt: ts }],
      }),
      <YearView year="2026" month="2026-11" today="2026-11-28" showEv showMoney onPickMonth={(m) => picked.push(m)} />,
    );
    const mar = await screen.findByRole("button", { name: /^3月/ });
    expect(mar.textContent).toContain("予定 2日");
    expect(mar.textContent).toContain("−¥2,000");
    expect(screen.getByRole("button", { name: /^7月/ }).textContent).toContain("+¥250,000");
    expect(screen.getByRole("button", { name: /^1月/ }).textContent).toBe("1月予定なし");
    fireEvent.click(mar);
    expect(picked).toEqual(["2026-03"]);
  });
});

describe("家計簿の支払いのタブ（画面）", () => {
  it("これからの支払いを日付の順に、合計と一緒に。予定日を過ぎたものは何日過ぎたか", async () => {
    const r = { cycle: "monthly" as const, anchorDay: 1, categoryId: "exp-1", paymentMethod: "", active: true, createdAt: ts, updatedAt: ts };
    await mount(
      (d) => ({
        ...d,
        recurring: [
          { ...r, id: "r1", name: "家賃", amount: 80000, nextDueDate: "2026-12-27" },
          { ...r, id: "r2", name: "携帯", amount: 3000, nextDueDate: "2026-11-25" },
        ],
      }),
      <UpcomingPayments />,
    );
    const items = await screen.findAllByRole("listitem");
    expect(items.map((li) => li.textContent)).toEqual(["携帯予定日（11月25日(水)）を3日過ぎています¥3,000", "家賃12月27日(日)¥80,000"]);
    expect(screen.getByText("¥83,000")).toBeTruthy();
  });
});
