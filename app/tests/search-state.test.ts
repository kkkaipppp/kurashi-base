import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { MAX_QUERY_LEN, queryFromSearch, searchWithQuery } from "@/lib/searchState";

// v22 UI13：検索語の復元。検索→別の画面→戻る、で検索語が残る。URL だけに持つ（保存データには入れない）
describe("検索語の復元", () => {
  it("?q= から検索語を取り出す。なければ空。日本語・空白・記号もそのまま", () => {
    expect(queryFromSearch("")).toBe("");
    expect(queryFromSearch("?q=" + encodeURIComponent("スーパー 1000"))).toBe("スーパー 1000");
    expect(queryFromSearch("?x=1")).toBe("");
    expect(queryFromSearch("?q=" + encodeURIComponent("a&b=c"))).toBe("a&b=c");
  });
  it("検索語を書き込むと、往復で同じ。空にすると q を外す。ほかの項目は残す", () => {
    const s = searchWithQuery("", "歯医者");
    expect(queryFromSearch(s)).toBe("歯医者");
    expect(searchWithQuery(s, "")).toBe("");
    expect(searchWithQuery(s, "   ")).toBe("");
    expect(searchWithQuery("?from=menu", "あ")).toContain("from=menu");
    expect(searchWithQuery("?from=menu&q=x", "")).toBe("?from=menu");
  });
  it("長すぎる検索語は切る（100字）", () => {
    expect(queryFromSearch("?q=" + "あ".repeat(500)).length).toBe(MAX_QUERY_LEN);
    expect(queryFromSearch(searchWithQuery("", "あ".repeat(500))).length).toBe(MAX_QUERY_LEN);
  });
  it("さがす画面は、起動時に ?q= を読み（Suspense の中で useSearchParams）、入力のたびに URL を書き換える（履歴は増やさない）", () => {
    const s = readFileSync(join(__dirname, "..", "src", "app", "search", "page.tsx"), "utf8");
    expect(s).toContain("queryFromSearch(params.toString())");
    expect(s).toContain("<Suspense");
    expect(s).toContain("history.replaceState");
    expect(s).toContain("searchWithState"); // 検索語と種類の絞り込みを、一緒に URL に残す（2026-11-25）
  });
});

import { dayFromSearch, kindFromSearch, searchWithDay, searchWithState } from "@/lib/searchState";
import { filterGroups, type SearchGroup } from "@/lib/search";

describe("種類の絞り込みと、カレンダーの選んだ日の復元（v22 UI13）", () => {
  const KINDS = ["tx", "event", "task"];
  it("?k= は、許す種類のときだけ読む。それ以外は空（すべて）", () => {
    expect(kindFromSearch("?k=event", KINDS)).toBe("event");
    expect(kindFromSearch("?k=zzz", KINDS)).toBe("");
    expect(kindFromSearch("", KINDS)).toBe("");
  });
  it("検索語と種類を、往復で同じに書き込む。どちらも空なら外す。ほかの項目は残す", () => {
    const s = searchWithState("?from=menu", "歯医者", "event");
    expect(queryFromSearch(s)).toBe("歯医者");
    expect(kindFromSearch(s, KINDS)).toBe("event");
    expect(s).toContain("from=menu");
    expect(searchWithState(s, "", "")).toBe("?from=menu");
  });
  it("種類で絞り込む。空ならすべて", () => {
    const g = [{ kind: "tx" }, { kind: "event" }] as unknown as SearchGroup[];
    expect(filterGroups(g, "").length).toBe(2);
    expect(filterGroups(g, "event").map((x) => x.kind)).toEqual(["event"]);
    expect(filterGroups(g, "task")).toEqual([]);
  });
  it("選んだ日（?d=）は、実在する日付のときだけ読む（2026-02-30・文字・桁違いは無視）", () => {
    expect(dayFromSearch("?d=2026-12-05")).toBe("2026-12-05");
    expect(dayFromSearch("?d=2026-02-30")).toBe("");
    expect(dayFromSearch("?d=あした")).toBe("");
    expect(dayFromSearch("?d=2026-1-5")).toBe("");
    expect(dayFromSearch("")).toBe("");
  });
  it("選んだ日を書き込む。今日は外す（アドレスを汚さない）。ほかの項目は残す", () => {
    expect(searchWithDay("", "2026-12-05", "2026-11-25")).toBe("?d=2026-12-05");
    expect(searchWithDay("?d=2026-12-05", "2026-11-25", "2026-11-25")).toBe("");
    expect(searchWithDay("?x=1", "2026-12-05", "2026-11-25")).toContain("x=1");
  });
  it("カレンダーは、起動時に ?d= を読み（Suspense の中で useSearchParams）、選ぶたびに URL を書き換える", () => {
    const s = readFileSync(join(__dirname, "..", "src", "app", "calendar", "page.tsx"), "utf8");
    expect(s).toContain("dayFromSearch(params.toString())");
    expect(s).toContain("<Suspense");
    expect(s).toContain("searchWithDay");
    expect(s).toContain("history.replaceState");
  });
});
