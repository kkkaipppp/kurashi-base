import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { SHEET_DRAFT_KEY, clearSheetDraft, draftTimeLabel, loadSheetDraft, moveSheetDraftToNew, saveSheetDraft, sheetDraftKey } from "@/lib/sheetDraft";

// 2026-11-24 ChatGPT「100点化 開発指示 v1」（kurashi-base_100point_plan_209b0cd）のうち、保存の形を変えない分
const src = (p: string) => readFileSync(join(__dirname, "..", "src", p), "utf8");
const mem = () => {
  const m = new Map<string, string>();
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), removeItem: (k: string) => void m.delete(k), m };
};

describe("B 入力の下書き（端末の中の別のキー。記録の保存の形は変えない）", () => {
  it("新規と編集を取り違えず、種類も分ける。入力ごとに別のキーなので、ほかの入力で上書きしない", () => {
    const kv = mem();
    expect(SHEET_DRAFT_KEY.startsWith("kurashi-base:")).toBe(true); // すべて削除で一緒に消える
    expect(sheetDraftKey("tx", null).startsWith("kurashi-base:sheet-draft:")).toBe(true);
    expect(saveSheetDraft("tx", null, { amount: "1200" }, new Date("2026-11-24T12:05:00Z"), kv)).toBe(true);
    // 予定の入力・別の記録の編集を始めても、支出の書きかけは残る
    saveSheetDraft("event", null, { title: "歯医者" }, new Date(), kv);
    saveSheetDraft("tx", "id-2", { amount: "50" }, new Date(), kv, '{"id":"id-2"}');
    expect(loadSheetDraft<{ amount: string }>("tx", null, kv)?.draft.amount).toBe("1200");
    expect(loadSheetDraft("tx", "id-1", kv)).toBeNull(); // 編集の下書きではない
    expect(loadSheetDraft<{ title: string }>("event", null, kv)?.draft.title).toBe("歯医者");
    expect(loadSheetDraft("tx", "id-2", kv)?.base).toBe('{"id":"id-2"}'); // 編集は元の記録も控える
    clearSheetDraft("event", null, kv); // 消すのはその入力の下書きだけ
    expect(loadSheetDraft("tx", null, kv)).not.toBeNull();
    clearSheetDraft("tx", null, kv);
    expect(kv.m.has(sheetDraftKey("tx", null))).toBe(false);
    expect(kv.m.has(sheetDraftKey("tx", "id-2"))).toBe(true);
  });
  it("前の版（キーが1つ）の書きかけは、同じ入力を開いたときに引き継ぐ", () => {
    const kv = mem();
    kv.setItem(SHEET_DRAFT_KEY, JSON.stringify({ kind: "tx", targetId: null, draft: { amount: "300" }, savedAt: "2026-11-24T00:00:00Z" }));
    expect(loadSheetDraft("event", null, kv)).toBeNull();
    expect(kv.m.has(SHEET_DRAFT_KEY)).toBe(true);
    expect(loadSheetDraft<{ amount: string }>("tx", null, kv)?.draft.amount).toBe("300");
    expect(kv.m.has(SHEET_DRAFT_KEY)).toBe(false);
    expect(kv.m.has(sheetDraftKey("tx", null))).toBe(true);
  });
  it("編集元が消えたときは、書きかけを新しい入力へ移せる。新しい入力に別の書きかけがあれば上書きしない", () => {
    const kv = mem();
    saveSheetDraft("tx", "gone", { amount: "980" }, new Date("2026-11-24T00:00:00Z"), kv, "{}");
    saveSheetDraft("tx", null, { amount: "1" }, new Date(), kv);
    expect(moveSheetDraftToNew("tx", "gone", kv)).toBe("busy");
    expect(loadSheetDraft<{ amount: string }>("tx", null, kv)?.draft.amount).toBe("1");
    clearSheetDraft("tx", null, kv);
    expect(moveSheetDraftToNew("tx", "gone", kv)).toBe("ok");
    expect(loadSheetDraft<{ amount: string }>("tx", null, kv)?.draft.amount).toBe("980");
    expect(loadSheetDraft("tx", null, kv)?.base).toBeUndefined();
    expect(loadSheetDraft("tx", "gone", kv)).toBeNull();
  });
  it("壊れた下書きは捨てる。保存できない端末では false", () => {
    const kv = mem();
    kv.setItem(sheetDraftKey("tx", null), "{壊れた");
    expect(loadSheetDraft("tx", null, kv)).toBeNull();
    expect(kv.m.has(sheetDraftKey("tx", null))).toBe(false);
    const bad = { getItem: () => null, setItem: () => { throw new Error("full"); }, removeItem: () => {} };
    expect(saveSheetDraft("tx", null, {}, new Date(), bad)).toBe(false);
    expect(draftTimeLabel("x")).toBe("前回");
  });
  it("前の書きかけに答えるまでは控えない。元の記録が変わっていたら知らせる", () => {
    for (const f of ["components/TxSheet.tsx", "components/EventSheet.tsx"]) {
      const s = src(f);
      expect(s).toContain("if (pending && !resumeAsked) return;");
      expect(s).toContain("書きかけのあとに変わっています");
      expect(s).toContain("<OrphanDraft");
    }
  });
  it("支出・収入と予定の入力で、書きかけを控え、保存がうまくいったときだけ消す", () => {
    for (const f of ["components/TxSheet.tsx", "components/EventSheet.tsx"]) {
      const s = src(f);
      expect(s).toContain("saveSheetDraft");
      expect(s).toContain("の書きかけがあります");
      expect(s).toContain("続きから");
      expect(s).toContain("// 保存がうまくいったときだけ下書きを消す");
    }
  });
});

describe("D 家計の計算をひとつに（指示書の検証データ）", () => {
  it("予算 120,000・生活費 96,420・投資 100,000・未記録の固定費 8,000・残り7日 → 生活予算の残り 23,580・自由に使える残り 15,580・1日あたり 2,225", async () => {
    const { monthLedger } = await import("@/lib/ledger");
    const { emptyData } = await import("@/lib/defaults");
    const now = "2026-11-24T00:00:00.000Z";
    const d = emptyData(now);
    d.budget.monthly = 120000;
    d.categories.push({ id: "inv", name: "投資", kind: "expense", order: 99, archived: false });
    const tx = (id: string, amount: number, categoryId: string) => ({ id, type: "expense" as const, date: "2026-11-10", amount, currency: "JPY" as const, categoryId, merchant: "", paymentMethod: "", note: "", source: "manual" as const, createdAt: now, updatedAt: now });
    d.transactions = [tx("a", 96420, "exp-1"), tx("b", 100000, "inv")];
    d.recurring = [{ id: "r", name: "スマホ", amount: 8000, cycle: "monthly", anchorDay: 28, nextDueDate: "2026-11-28", categoryId: "exp-5", paymentMethod: "", active: true, createdAt: now, updatedAt: now }];
    const l = monthLedger(d, "2026-11", "2026-11-24");
    expect([l.lifeExpense, l.investMove, l.lifeBudgetLeft, l.unpaidFixed, l.freeLeft, l.perDay, l.daysLeft]).toEqual([96420, 100000, 23580, 8000, 15580, 2225, 7]);
    // 支払いを記録すると、未記録の固定費が減り、生活費が増え、自由に使える残りは変わらない
    d.transactions.push(tx("c", 8000, "exp-5"));
    d.recurring[0].nextDueDate = "2026-12-28";
    const after = monthLedger(d, "2026-11", "2026-11-24");
    expect([after.unpaidFixed, after.lifeExpense, after.freeLeft]).toEqual([0, 104420, 15580]);
  });
  it("予算と比べる額は、自分用は投資を除いた生活費、公開版はすべての支出（ホーム・ナビ・振り返り・ウィジェットで同じ）", async () => {
    const { budgetSpent } = await import("@/lib/ledger");
    const { emptyData } = await import("@/lib/defaults");
    const now = "2026-11-24T00:00:00.000Z";
    const d = emptyData(now);
    d.categories.push({ id: "inv", name: "投資", kind: "expense", order: 99, archived: false });
    const tx = (id: string, amount: number, categoryId: string) => ({ id, type: "expense" as const, date: "2026-11-10", amount, currency: "JPY" as const, categoryId, merchant: "", paymentMethod: "", note: "", source: "manual" as const, createdAt: now, updatedAt: now });
    d.transactions = [tx("a", 96420, "exp-1"), tx("b", 100000, "inv")];
    expect(budgetSpent(d, "2026-11", "2026-11-24", true)).toBe(96420);
    expect(budgetSpent(d, "2026-11", "2026-11-24", false)).toBe(196420);
    expect(src("lib/navi.ts")).toContain("budgetSpent(data, monthKey(today), today)");
    expect(src("app/report/page.tsx")).toContain("budgetSpent(data, month, today)");
    expect(src("app/page.tsx")).toContain("足りません");
  });
  it("ホームは自分用で ledger を使い、月の比べ方は増えた・減った・差の合計", () => {
    expect(src("app/page.tsx")).toContain("const ledger = PERSONAL ? monthLedger(data, month, today) : null;");
    expect(src("components/MonthBreakdownCard.tsx")).toContain("生活費の差");
    expect(src("components/MonthBreakdownCard.tsx")).toContain("投資として数えているカテゴリ");
  });
});

describe("A 入力とカレンダー", () => {
  it("よく使うカテゴリ・前回の支払方法は、押したときだけ入る候補（自分用だけ）", () => {
    const s = src("components/TxSheet.tsx");
    expect(s).toContain('const SUGGEST = process.env.NEXT_PUBLIC_KB_EDITION === "personal";');
    expect(s).toContain('aria-label="よく使うカテゴリ"');
    expect(s).toContain("前回と同じ：");
  });
  it("カレンダーの選んだ日に、固定費の支払い予定を実績と分けて出す", () => {
    expect(src("app/calendar/page.tsx")).toContain("固定費の支払い予定");
  });
});

describe("C グラフの単位と設定のまとまり", () => {
  it("週・年のグラフに、単位（円）と左右の目盛りの読み方を書く", () => {
    const s = src("components/TrendChart.tsx");
    expect(s).toContain("単位は円。収支の累計は、下の「数字で見る」にあります"); // 紫の折れ線をやめた（平尾さん 2026-11-25）
  });
  it("設定は目的ごとの見出しで分ける（自分用だけ）。今までのアンカーは残す", () => {
    const s = src("app/settings/page.tsx");
    expect(s).toContain("const GROUPS = IS_PERSONAL;");
    for (const id of ['id="budget"', 'id="categories"', 'id="calendar-file"', 'id="csv-import"', 'id="backup"', 'id="danger"']) expect(s).toContain(id);
    for (const g of ["ふだんの設定", "ほかとつなぐ・取り込む", "記録を守る"]) expect(s).toContain(g);
  });
});

describe("B iPhone のカレンダーへの反映のオン・オフ（アプリだけ）", () => {
  const swift = () => readFileSync(join(__dirname, "..", "ios", "App", "App", "WidgetBridgePlugin.swift"), "utf8");
  it("オフのあいだは書かない（アクセスを待つあいだにオフにされても書かない）", () => {
    const s = swift();
    expect(s).toContain('CAPPluginMethod(name: "setCalendarSync"');
    expect(s.match(/guard Self\.calendarEnabled else/g)?.length).toBe(2);
    expect(s).toContain('"enabled": Self.calendarEnabled');
  });
  it("消すのは、くらしベースが入れた印つきの予定だけ。カレンダーそのものは消さない", () => {
    const s = swift();
    const body = s.slice(s.indexOf("func removeCalendarEvents"), s.indexOf("func openAppSettings"));
    expect(body).toContain("where ev.url == Self.ownedMark");
    expect(body).not.toContain("removeCalendar(");
  });
  it("オフにするときは、入れた予定を残すか消すかを別に聞く（閉じたら残す）", () => {
    const s = src("components/NativeStatusCard.tsx");
    expect(s).toContain('call("setCalendarSync", { enabled: false })');
    expect(s).toContain('cancel: "残しておく"');
    expect(s.indexOf('call("setCalendarSync", { enabled: false })')).toBeLessThan(s.indexOf('call("removeCalendarEvents")'));
  });
});

describe("点検の直し（アプリ）：カレンダーの削除とウィジェットの予算", () => {
  const swift = () => readFileSync(join(__dirname, "..", "ios", "App", "App", "WidgetBridgePlugin.swift"), "utf8");
  it("予定を読めないときは、消せたことにしない。同じ予定は1回だけ消す", () => {
    const body = swift().slice(swift().indexOf("func removeCalendarEvents"), swift().indexOf("func openAppSettings"));
    expect(body.indexOf("guard canRead else")).toBeLessThan(body.indexOf("store.remove("));
    expect(body).toContain("seen.insert(ev.calendarItemIdentifier).inserted");
  });
  it("止めているあいだも「入れた予定を消す」でやり直せる", () => {
    expect(src("components/NativeStatusCard.tsx")).toContain("入れた予定を消す");
  });
  it("ウィジェットの予算の残りは、ホームと同じ額と比べる", () => {
    expect(src("lib/widgetSummary.ts")).toContain("const spent = budgetSpent(data, monthKey(today), today);");
    expect(readFileSync(join(__dirname, "..", "ios", "App", "KurashiWidget", "KurashiWidget.swift"), "utf8")).toContain(String.raw`生活費 \(yen(s.budgetSpent ?? s.monthExpense))`);
  });
});

describe("再点検の直し：書きかけ", () => {
  it("前の書きかけに答えていないときは、閉じても別の1件を保存しても、その書きかけは消さない", () => {
    for (const f of ["components/TxSheet.tsx", "components/EventSheet.tsx"]) {
      const s = src(f);
      // 前の書きかけに答えていないあいだは消さない（予定は、さらに「複製のとき」も消さない条件が加わった。v21 第2回の点検）
      expect(s).toContain("!(pending && !resumeAsked)");
      expect(s).toMatch(/\(dirty \|\| resumed\.current\) && !\(pending && !resumeAsked\)/);
      expect(s).toMatch(/!\(pending && !resumeAsked\) \|\| asNew\)/);
    }
  });
  it("編集の途中で記録が消されたら、その場で新しい記録として保存できる", () => {
    expect(src("components/TxSheet.tsx")).toContain("新しい記録として保存する");
    expect(src("components/TxSheet.tsx")).toContain("editing && !asNew ? store.updateTx");
    expect(src("components/EventSheet.tsx")).toContain("新しい予定として保存する");
    expect(src("components/EventSheet.tsx")).toContain("editing && !asNew ? store.updateEvent");
    expect(src("components/EventSheet.tsx")).not.toContain("onClick={save}");
  });
});
