// @vitest-environment jsdom
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useEffect } from "react";
import type { KV } from "@/lib/storage";

// ひな形と達成の記録は自分用だけ（版は読み込みのときに決まる）。環境の値を変えてから、部品を読み込み直す
let M: {
  store: typeof import("@/lib/store");
  ui: typeof import("@/components/UIContext");
  plans: typeof import("@/components/PlansScreen");
  repo: typeof import("@/lib/repository");
  core: typeof import("@/lib/storeCore");
};
beforeAll(async () => {
  vi.stubEnv("NEXT_PUBLIC_KB_EDITION", "personal");
  vi.resetModules();
  M = {
    store: await import("@/lib/store"),
    ui: await import("@/components/UIContext"),
    plans: await import("@/components/PlansScreen"),
    repo: await import("@/lib/repository"),
    core: await import("@/lib/storeCore"),
  };
});
afterAll(() => {
  vi.unstubAllEnvs();
});
import type { AppData } from "@/lib/types";

// Firebase の部分は置き換える（本物には送らない。設定がある場合の流れだけを確かめる）
const fbm = vi.hoisted(() => ({ closePoll: vi.fn(async () => {}), deletePoll: vi.fn(async () => {}), listAnswers: vi.fn(async () => [{ uid: "u1", name: "たろう", marks: { a: "o" } }]) }));
vi.mock("@/lib/share/firebase", () => ({ isShareConfigured: () => true, answerUrl: (id: string) => `https://example.com/a?p=${id}`, createPoll: vi.fn(), closePoll: fbm.closePoll, deletePoll: fbm.deletePoll, listAnswers: fbm.listAnswers }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: () => {}, replace: () => {}, back: () => {}, prefetch: () => {} }), usePathname: () => "/plans", useSearchParams: () => new URLSearchParams() }));

// 期待値は手で決めた（決定 2026-11-28 S-2〜S-5：設定が無い間は下書きだけ・外へ送らない）
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
const plan = (closesAt: string) => ({
  id: "pl", type: "gathering" as const, title: "忘年会", status: "considering" as const, date: "", budget: null, note: "",
  poll: { id: "P1", ownerKey: "KEY", title: "忘年会", options: [{ id: "a", date: "2026-12-05", label: "夜" }], closesAt, status: "open" as const, createdAt: ts2 },
  createdAt: ts2, updatedAt: ts2,
});

describe("日程を聞く（画面・設定がある場合。Firebase は置き換え）", () => {
  it("締め切り前に決める：締め切りを今日に早める。計画の日にちが入る", async () => {
    await mount((d) => ({ ...d, plans: [plan("2026-12-01")] }), () => <M.plans.PlansScreen />);
    fireEvent.click(await screen.findByText("忘年会"));
    expect((screen.getByLabelText("回答のリンク") as HTMLInputElement).value).toBe("https://example.com/a?p=P1");
    fireEvent.click(screen.getByRole("button", { name: "回答を見る" }));
    fireEvent.click(await screen.findByRole("button", { name: "この日に決める" }));
    // 確かめの画面の「この日に決める」（あとから出るほう）
    await waitFor(() => expect(screen.getAllByRole("button", { name: "この日に決める" }).length).toBe(2));
    fireEvent.click(screen.getAllByRole("button", { name: "この日に決める" }).at(-1)!);
    await waitFor(() => expect(seen.d!.plans![0].date).toBe("2026-12-05"));
    expect(seen.d!.plans![0].poll).toMatchObject({ status: "closed", closesAt: "2026-11-28" });
    expect(fbm.closePoll).toHaveBeenCalledWith("P1", "2026-11-28");
  });

  it("締め切りのあとに決める：外の締め切りは変えない（また開かない。点検 高1）", async () => {
    fbm.closePoll.mockClear();
    await mount((d) => ({ ...d, plans: [plan("2026-11-20")] }), () => <M.plans.PlansScreen />);
    fireEvent.click(await screen.findByText("忘年会"));
    expect(screen.getByText(/締め切り/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "回答を見る" }));
    expect(await screen.findByText(/回答 1人/)).toBeTruthy();
  });

  it("消す：外で消せないときも、確かめてから端末の控えだけ外せる（点検 高2）", async () => {
    fbm.deletePoll.mockRejectedValueOnce(new Error("permission-denied"));
    await mount((d) => ({ ...d, plans: [plan("2026-12-01")] }), () => <M.plans.PlansScreen />);
    fireEvent.click(await screen.findByText("忘年会"));
    fireEvent.click(screen.getByRole("button", { name: "消す" }));
    await waitFor(() => expect(screen.getAllByRole("button", { name: "消す" }).length).toBe(2));
    fireEvent.click(screen.getAllByRole("button", { name: "消す" }).at(-1)!);
    expect(await screen.findByText("外の調整を消せませんでした")).toBeTruthy();
    expect(fbm.deletePoll).toHaveBeenCalledWith("P1", "KEY");
    fireEvent.click(screen.getByRole("button", { name: "端末の控えだけ外す" }));
    await waitFor(() => expect(seen.d!.plans![0].poll).toBeUndefined());
  });
});
