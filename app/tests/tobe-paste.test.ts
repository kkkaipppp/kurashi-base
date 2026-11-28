import { describe, expect, it } from "vitest";
import { findAnyDate, findMarkedAmount, findTime, findUrl, parsePasted } from "@/lib/pasteParse";
import { readFileSync } from "node:fs";

// 期待値は要件（To-Be 02「文章・URL…解析結果は確認後保存」）から手で作った
describe("貼り付けから読む（To-Be 段階2 ＋）", () => {
  const today = "2026-11-28";
  it("LINE の文：日付・時刻・会費・URL・名前", () => {
    const g = parsePasted("忘年会のお知らせ\n12月5日（金）19時〜\n会費 4,000円\nhttps://example.com/shop?id=12345。", today);
    expect(g.title).toBe("忘年会のお知らせ");
    expect(g.date).toBe("2026-12-05");
    expect(g.time).toBe("19:00");
    expect(g.amount).toBe(4000);
    expect(g.amountConfidence).toBe("high");
    expect(g.url).toBe("https://example.com/shop?id=12345");
  });
  it("年の無い日付：30日より前なら来年、年つきはそのまま、無い日は読まない", () => {
    expect(findAnyDate(["1/10 集合"], today)).toBe("2027-01-10");
    expect(findAnyDate(["11月20日"], today)).toBe("2026-11-20");
    expect(findAnyDate(["2025年3月1日"], today)).toBe("2025-03-01");
    expect(findAnyDate(["2月30日"], today)).toBeNull();
    expect(findAnyDate(["2/29"], "2027-11-28")).toBe("2028-02-29");
  });
  it("時刻：19:30・7時半・24時は読まない", () => {
    expect(findTime(["19:30 集合"])).toBe("19:30");
    expect(findTime(["7時半に駅"])).toBe("07:30");
    expect(findTime(["18時15分"])).toBe("18:15");
    expect(findTime(["24時"])).toBeNull();
  });
  it("金額：円・¥ の付いた数字だけ。日付・時刻・URL の数字は金額にしない", () => {
    expect(findMarkedAmount(["12月5日 19時 集合"]).amount).toBeNull();
    expect(findMarkedAmount(["¥1,200 と 300円"])).toEqual({ amount: 1200, confidence: "low" });
    expect(findMarkedAmount(["お預り 10,000円", "合計 3,280円"])).toEqual({ amount: 3280, confidence: "high" });
    expect(parsePasted("https://example.com/9999円", today).amount).toBeNull();
  });
  it("URL：http(s) だけ。javascript: などは拾わない", () => {
    expect(findUrl("javascript:alert(1)")).toBeNull();
    expect(findUrl("見て→https://a.example/x、よろしく")).toBe("https://a.example/x");
  });
  it("長い文は 2000 字で切る・名前は 100 字まで・空は全部 null", () => {
    const g = parsePasted("あ".repeat(5000), today);
    expect(g.title?.length).toBe(100);
    expect(parsePasted("   \n  ", today)).toMatchObject({ title: null, date: null, amount: null, url: null });
  });
  it("押しただけでは保存しない（入力の画面を開くだけ）・公開版の一覧には出さない", () => {
    const src = readFileSync("src/components/AddSheet.tsx", "utf8");
    const panel = src.slice(src.indexOf("function PastePanel"), src.indexOf("自分用：右端の「追加」から開く種類の一覧"));
    expect(panel).not.toMatch(/store\.|commit\(|fetch\(/);
    const ui = readFileSync("src/components/UIContext.tsx", "utf8");
    expect(ui).toContain('process.env.NEXT_PUBLIC_KB_EDITION === "personal" ? dynamic(() => import("./AddSheet").then((m) => m.PersonalAddSheet)');
  });
  it("点検の直し：支出は過去の日付（来年にしない）・予定は来年。所要時間・分数は読まない", () => {
    const g = parsePasted("10/15 ランチ 1,200円", today);
    expect(g.date).toBe("2027-10-15");
    expect(g.pastDate).toBe("2026-10-15");
    expect(findAnyDate(["11/29"], today, "past")).toBe("2026-11-29");
    expect(findAnyDate(["11/30"], today, "past")).toBe("2025-11-30");
    expect(findAnyDate(["12/31"], "2027-01-03", "past")).toBe("2026-12-31");
    expect(findTime(["所要2時間"])).toBeNull();
    expect(findTime(["12時間営業 18時から"])).toBe("18:00");
    expect(findAnyDate(["砂糖 1/2カップ"], today)).toBeNull();
    expect(findAnyDate(["第1/2回"], today)).toBeNull();
    expect(findAnyDate(["03-1234-5678"], today)).toBeNull();
    expect(findAnyDate(["１２／５　１９：００"], today)).toBe("2026-12-05");
  });
});
