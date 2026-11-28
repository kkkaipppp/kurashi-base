// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { useEffect } from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { StoreProvider, useStore } from "@/lib/store";
import { LocalStorageRepository } from "@/lib/repository";
import { StoreCore } from "@/lib/storeCore";
import type { KV } from "@/lib/storage";
import type { AppData } from "@/lib/types";

// 期待値は決めごと（2026-11-28：月の予算を変えたら履歴に残す・同じ額なら残さない・特別支出の年の予算は消さない）から手で作った
const memKV = (): KV => {
  const m = new Map<string, string>();
  return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => void m.set(k, v), removeItem: (k) => void m.delete(k), key: (i) => [...m.keys()][i] ?? null, get length() { return m.size; } } as KV;
};
const seen: { d: AppData | null } = { d: null };
function Probe() {
  const s = useStore();
  useEffect(() => {
    seen.d = s.data;
  });
  if (!s.data) return <p>読み込み中</p>;
  return (
    <>
      <button type="button" onClick={() => s.setBudget(100000)}>10万</button>
      <button type="button" onClick={() => s.setBudget(120000)}>12万</button>
      <button type="button" onClick={() => s.setYearlySpecial(300000)}>特別</button>
    </>
  );
}
afterEach(() => cleanup());

describe("予算の履歴（store）", () => {
  it("10万 → 10万（同じ）→ 12万：履歴は2件。特別支出の年の予算はそのまま", async () => {
    const kv = memKV();
    const seed = new StoreCore(new LocalStorageRepository(kv));
    await seed.reload();
    render(
      <StoreProvider repo={new LocalStorageRepository(kv)}>
        <Probe />
      </StoreProvider>,
    );
    fireEvent.click(await screen.findByText("特別"));
    await waitFor(() => expect(seen.d?.budget.yearlySpecial).toBe(300000));
    fireEvent.click(screen.getByText("10万"));
    await waitFor(() => expect(seen.d?.budget.monthly).toBe(100000));
    fireEvent.click(screen.getByText("10万"));
    fireEvent.click(screen.getByText("12万"));
    await waitFor(() => expect(seen.d?.budget.monthly).toBe(120000));
    expect(seen.d!.budget.yearlySpecial).toBe(300000);
    expect(seen.d!.budget.history?.map((h) => h.monthly)).toEqual([100000, 120000]);
  });
});
