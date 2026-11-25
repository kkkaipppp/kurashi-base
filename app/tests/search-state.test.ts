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
    expect(s).toContain("searchWithQuery");
  });
});
