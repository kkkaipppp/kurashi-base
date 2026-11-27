// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { StoreProvider, useStore } from "@/lib/store";
import { UIProvider } from "@/components/UIContext";
import { StudyShelf } from "@/components/StudyShelf";
import { LocalStorageRepository } from "@/lib/repository";
import { StoreCore } from "@/lib/storeCore";
import type { KV } from "@/lib/storage";
import type { StudySubject } from "@/lib/types";

// 画面の部品は Next のルーターを使う。試験では動かない入れ物に差し替える
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: () => {}, replace: () => {}, back: () => {}, prefetch: () => {} }), usePathname: () => "/study", useSearchParams: () => new URLSearchParams() }));

// 画面の試験（再点検 M-4）：教材の1日の量と復習の日数が、画面で計算・保存される。期待値は手で決めた
// 今日 2026-11-27・試験 2026-12-27 → 30日。300ページ・0ページ済み → 1日10ページ。復習10日 → 20日で1日15ページ
const ts = "2026-11-27T00:00:00.000Z";
const memKV = (): KV => {
  const m = new Map<string, string>();
  return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => void m.set(k, v), removeItem: (k) => void m.delete(k), key: (i) => [...m.keys()][i] ?? null, get length() { return m.size; } } as KV;
};
const subject: StudySubject = {
  id: "s1", name: "簿記", examDate: "2026-12-27", targetHours: null, archived: false, createdAt: ts, updatedAt: ts,
  books: [{ id: "b1", title: "テキスト", url: "", note: "", status: "studying", total: 300 }],
};

// 計画の行は数が太字の別の要素なので、行（p）の文字全体で探す
const planLine = (re: RegExp) => (_: string, el: Element | null) => el?.tagName === "P" && re.test(el.textContent ?? "");

function Shelf() {
  const d = useStore().data; // 読み込みが終わるまでは null
  const s = d?.studySubjects[0];
  return s ? <StudyShelf s={s} /> : <p>読み込み中</p>;
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-11-27T03:00:00+09:00"));
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("本棚の計画の行（画面）", () => {
  it("1日の量を出し、復習の日数（全角でも）を入れると計算し直して保存する", async () => {
    const kv = memKV();
    const seed = new StoreCore(new LocalStorageRepository(kv));
    await seed.reload();
    expect((await seed.commit((d) => ({ ...d, studySubjects: [subject] }))).ok).toBe(true);
    render(
      <StoreProvider repo={new LocalStorageRepository(kv)}>
        <UIProvider>
          <Shelf />
        </UIProvider>
      </StoreProvider>,
    );
    expect(await screen.findByText(planLine(/1日 10ページ（残り 300ページ・30日）/))).toBeTruthy();
    const input = screen.getByLabelText("試験の前の復習の日数") as HTMLInputElement;
    await act(async () => {
      fireEvent.change(input, { target: { value: "１０" } });
      fireEvent.blur(input);
    });
    expect(await screen.findByText(planLine(/1日 15ページ（残り 300ページ・20日。復習の10日を除く）/))).toBeTruthy();
    expect(input.value).toBe("10");
    await waitFor(async () => {
      const check = new StoreCore(new LocalStorageRepository(kv));
      await check.reload();
      expect(check.snapshot.data!.studySubjects[0].reviewDays).toBe(10);
    });
  });
});
