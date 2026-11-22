import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// go-data-deletion.test.ts は関数を単体で確かめる。こちらは、画面とストアが実際にその関数を通っているかを見張る。

const src = (p: string) => readFileSync(join(__dirname, "..", "src", p), "utf8");
const store = src("lib/store.tsx");
// 型の宣言ではなく、useMemo<Store> の中の実装の部分を見る
const impl = store.slice(store.indexOf("useMemo<Store>"));
const fnBody = (name: string, next: string) => impl.slice(impl.indexOf(`${name}: (`), impl.indexOf(`${next}: (`, impl.indexOf(`${name}: (`)));

describe("すべて削除は、控え・退避データまで消して確かめる道を通る（B07・B08）", () => {
  it("store.wipeAll が wipeAllAppData を使い、本体を空で上書きして控えを消すだけの古い道を使わない", () => {
    const body = fnBody("wipeAll", "undoInfo");
    expect(body).toContain("wipeAllAppData");
    expect(body).not.toContain("clearUndo()");
  });
});

describe("同じ記録を2つのタブで編集しても、古い入力で黙って上書きしない（B09）", () => {
  it.each([
    ["updateEvent", "deleteEvent"],
    ["updateTx", "deleteTx"],
    ["updateTrip", "deleteTrip"],
    ["updateRecurring", "deleteRecurring"],
    ["updateItem", "replaceItem"],
    ["replaceItem", "removeItem"],
  ])("store.%s は、編集を始めたときの内容と今の内容を比べてから保存する", (name, next) => {
    const body = fnBody(name, next);
    expect(body).toMatch(/staleCheck\(dataRef\.current/);
  });

  it("その確かめ（staleCheck）は staleRecordError で今の記録と比べる", () => {
    const body = store.slice(store.indexOf("const staleCheck"), store.indexOf("const staleCheck") + 400);
    expect(body).toContain("staleRecordError(list, id, snapshot)");
  });

  it("staleRecordError：同じなら保存してよい、変わっていれば・消えていれば保存しない", async () => {
    const { staleRecordError, RECORD_CONFLICT_ERROR } = await import("@/lib/eventConcurrency");
    const tx = { id: "tx1", amount: 1000, merchant: "スーパー" };
    const snap = JSON.stringify(tx);
    const changed = [{ ...tx, amount: 1200 }];
    expect(staleRecordError([tx], "tx1", snap)).toBeNull();
    expect(staleRecordError(changed, "tx1", snap)).toBe(RECORD_CONFLICT_ERROR);
    expect(staleRecordError([], "tx1", snap)).toContain("削除されています");
    expect(staleRecordError(changed, "tx1", undefined)).toBeNull(); // 新規・古い呼び出しは確かめない
  });

  it.each([
    ["components/EventSheet.tsx", "updateEvent("],
    ["components/TxSheet.tsx", "updateTx("],
    ["app/trips/page.tsx", "updateTrip("],
    ["app/recurring/page.tsx", "updateRecurring("],
    ["components/CollectionPage.tsx", "updateItem("],
    ["app/study/page.tsx", "replaceItem("],
  ])("%s は、編集を始めたときの内容（スナップショット）を保存に渡す", (file, call) => {
    const s = src(file);
    expect(s).toMatch(/Snapshot = useRef\(/);
    const i = s.indexOf(call);
    expect(i).toBeGreaterThan(-1);
    expect(s.slice(i, i + 160)).toMatch(/Snapshot\.current/);
  });
});

describe("編集中に別のタブで記録が消されても、「追加」に化けて作り直さない（点検役の指摘）", () => {
  it.each([
    ["app/recurring/page.tsx", "updateRecurring(editId.current"],
    ["app/trips/page.tsx", "updateTrip(editId.current"],
    ["app/study/page.tsx", "replaceItem(\"studySubjects\", editId.current"],
  ])("%s は、編集を始めた ID で保存を呼ぶ（今のデータから探し直した記録の有無で、追加と編集を分けない）", (file, call) => {
    const s = src(file);
    expect(s).toMatch(/editId = useRef\(/);
    expect(s).toContain(call);
  });

  it("資格の編集は store.commit で直接書き換えない（競合の確かめを通らないため）", () => {
    expect(src("app/study/page.tsx")).not.toMatch(/store\.commit\(/);
  });

  it("容量不足の案内は、サイトデータを消すよう誘わず、次にすることを言う", () => {
    const s = src("lib/storage.ts");
    expect(s).not.toContain("サイトのデータを消してください");
    expect(s).toContain("サイトデータは削除しないでください");
    expect(s).toContain("もう一度保存してください");
  });

  it("壊れたデータの書き出しも、URL をすぐに無効にしない（Safari）", () => {
    const s = src("components/AppShell.tsx");
    expect(s).toContain("setTimeout(() => URL.revokeObjectURL(url)");
  });
});
