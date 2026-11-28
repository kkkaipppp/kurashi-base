// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { StoreProvider, useStore } from "@/lib/store";
import { UIProvider } from "@/components/UIContext";
import { EventSheet } from "@/components/EventSheet";
import { PersonalAddSheet } from "@/components/AddSheet";
import { LocalStorageRepository } from "@/lib/repository";
import type { KV } from "@/lib/storage";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: () => {}, replace: () => {}, back: () => {}, prefetch: () => {} }), usePathname: () => "/", useSearchParams: () => new URLSearchParams() }));

// 期待値は手で決めた（To-Be 02：解析結果は確認後保存）
const memKV = (): KV => {
  const m = new Map<string, string>();
  return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => void m.set(k, v), removeItem: (k) => void m.delete(k), key: (i) => [...m.keys()][i] ?? null, get length() { return m.size; } } as KV;
};
function Ready({ children }: { children: React.ReactNode }) {
  return useStore().data ? <>{children}</> : <p>読み込み中</p>;
}
const wrap = (kv: KV, ui: React.ReactNode) => (
  <StoreProvider repo={new LocalStorageRepository(kv)}>
    <UIProvider>
      <Ready>{ui}</Ready>
    </UIProvider>
  </StoreProvider>
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

describe("貼り付けから始める（画面）", () => {
  it("読み取ると候補を見せ、「予定として」で名前・日にち・時刻つきの入力を開く。押すまで何も保存しない", async () => {
    const kv = memKV();
    const calls: unknown[][] = [];
    render(wrap(kv, <PersonalAddSheet onClose={() => {}} openTx={(...a) => calls.push(["tx", ...a])} openEvent={(...a) => calls.push(["ev", ...a])} />));
    fireEvent.click(await screen.findByText("文章・URL を貼り付けて始める"));
    fireEvent.change(screen.getByLabelText("文章・URL（LINE やメールの文など）"), { target: { value: "忘年会\n12/5 19:30\n会費4000円\nhttps://example.com/a" } });
    fireEvent.click(screen.getByText("読み取る"));
    expect(screen.getByText("忘年会")).toBeTruthy();
    expect(screen.getByText("https://example.com/a")).toBeTruthy();
    fireEvent.click(screen.getByText("予定として"));
    expect(calls).toEqual([["ev", "2026-12-05", { title: "忘年会", time: "19:30", url: "https://example.com/a" }]]);
    const saved = [...Array(kv.length).keys()].map((i) => kv.key?.(i) ?? null).filter((k) => k && kv.getItem(k)?.includes("忘年会"));
    expect(saved).toEqual([]);
  });

  it("予定の入力は、貼り付けた名前・時刻から1時間で開く（時刻が無ければ終日）", async () => {
    const kv = memKV();
    render(wrap(kv, <EventSheet req={{ mode: "new", date: "2026-12-05", prefill: { title: "忘年会", time: "19:30" } }} onClose={() => {}} />));
    expect(((await screen.findByDisplayValue("忘年会")) as HTMLInputElement).value).toBe("忘年会");
    expect(screen.getByDisplayValue("19:30")).toBeTruthy();
    expect(screen.getByDisplayValue("20:30")).toBeTruthy();
  });
  it("「支出として」は過去の日付・金額・URL をメモに入れ、1回きりの入力として開く（店名は入れない）", async () => {
    const kv = memKV();
    const calls: unknown[][] = [];
    render(wrap(kv, <PersonalAddSheet date="2026-11-28" onClose={() => {}} openTx={(...a) => calls.push(["tx", ...a])} openEvent={(...a) => calls.push(["ev", ...a])} />));
    fireEvent.click(await screen.findByText("文章・URL を貼り付けて始める"));
    fireEvent.change(screen.getByLabelText("文章・URL（LINE やメールの文など）"), { target: { value: "10/15 ランチ\n合計 1,200円\nhttps://example.com/r" } });
    fireEvent.click(screen.getByText("読み取る"));
    expect(screen.getByText("2026年10月15日(木)")).toBeTruthy();
    fireEvent.click(screen.getByText("支出として"));
    expect(calls).toEqual([["tx", "expense", "2026-10-15", { amount: "1200", note: "https://example.com/r" }, true]]);
  });

  it("時刻が無ければ終日・23時台は 23:59 まで・日付が無ければ選んだ日", async () => {
    render(wrap(memKV(), <EventSheet req={{ mode: "new", date: "2026-12-05", prefill: { title: "大掃除" } }} onClose={() => {}} />));
    await screen.findByDisplayValue("大掃除");
    expect((screen.getByRole("checkbox", { name: /終日/ }) as HTMLInputElement).checked).toBe(true);
    expect(screen.getAllByDisplayValue("2026-12-05").length).toBeGreaterThan(0);
    cleanup();
    render(wrap(memKV(), <EventSheet req={{ mode: "new", date: "2026-12-31", prefill: { title: "年越し", time: "23:30" } }} onClose={() => {}} />));
    await screen.findByDisplayValue("年越し");
    expect(screen.getByDisplayValue("23:59")).toBeTruthy();
  });

  it("貼り付けからの予定は、書きかけの控えを読まず、上書きもしない", async () => {
    const kv = memKV();
    const key = "kurashi-base:sheet-draft:v1";
    render(wrap(kv, <EventSheet req={{ mode: "new" }} onClose={() => {}} />));
    const t = (await screen.findAllByRole("textbox"))[0];
    fireEvent.change(t, { target: { value: "書きかけ" } });
    // 書きかけの控えは端末の localStorage に置かれる（lib/sheetDraft.ts）
    const drafts = () => JSON.stringify(Object.keys(localStorage).filter((k) => k.startsWith(key)).sort().map((k) => localStorage.getItem(k)));
    const before = drafts();
    expect(before).toContain("書きかけ");
    cleanup();
    render(wrap(kv, <EventSheet req={{ mode: "new", prefill: { title: "忘年会" } }} onClose={() => {}} />));
    const name = await screen.findByDisplayValue("忘年会");
    expect(screen.queryByText(/続きから/)).toBeNull();
    fireEvent.change(name, { target: { value: "忘年会2" } });
    const after = drafts();
    expect(after).toBe(before);
  });
});
