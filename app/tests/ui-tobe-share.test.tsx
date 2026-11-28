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
  answer: typeof import("@/app/a/page");
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
    answer: await import("@/app/a/page"),
    repo: await import("@/lib/repository"),
    core: await import("@/lib/storeCore"),
  };
});
afterAll(() => {
  vi.unstubAllEnvs();
});
import type { AppData } from "@/lib/types";

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

describe("日程を聞く（画面・Firebase の設定なし）", () => {
  it("設定が無いことを出し、「リンクを作る」は押せない。候補日と名前を入れて下書きを保存すると、計画に下書きが残る", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    await mount(
      (d) => ({ ...d, plans: [{ id: "pl", type: "gathering", title: "〇〇さんの誕生日会", status: "considering", date: "", budget: null, note: "", createdAt: ts2, updatedAt: ts2 }] }),
      () => <M.plans.PlansScreen />,
    );
    fireEvent.click(await screen.findByText("〇〇さんの誕生日会"));
    expect(await screen.findByText(/共有の設定がまだです/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "候補日を選んで聞く" }));
    const title = (await screen.findByLabelText(/外に出す名前/)) as HTMLInputElement;
    expect(title.value).toBe("〇〇さんの誕生日会");
    fireEvent.change(title, { target: { value: "誕生日会" } });
    fireEvent.change(screen.getByLabelText("候補日"), { target: { value: "2026-12-05" } });
    fireEvent.change(screen.getByLabelText("候補日の補足"), { target: { value: "夜" } });
    fireEvent.click(screen.getByRole("button", { name: "足す" }));
    expect(screen.getByText(/名前：誕生日会/)).toBeTruthy();
    expect((screen.getByRole("button", { name: "リンクを作る" }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "下書きを保存" }));
    await waitFor(() => expect(seen.d!.plans![0].poll?.status).toBe("draft"));
    expect(seen.d!.plans![0].poll).toMatchObject({ title: "誕生日会", options: [{ date: "2026-12-05", label: "夜" }] });
    expect(seen.d!.plans![0].title).toBe("〇〇さんの誕生日会");
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });

  it("回答のページは、設定が無い間は「準備中」だけ", async () => {
    await mount((d) => d, () => <M.answer.default />);
    expect(await screen.findByText("このページは準備中です。")).toBeTruthy();
  });
});
