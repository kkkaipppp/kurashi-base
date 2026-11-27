import { describe, expect, it } from "vitest";
import { emptyData } from "@/lib/defaults";
import { migrate, validateAppData, validateRelationships } from "@/lib/schema";
import { applyRestore, countData } from "@/lib/backup";
import { addCandidate, addPlan, chooseCandidate, deletePlan, linkToPlan, planView, sortPlans } from "@/lib/plan";
import type { AppData, Transaction } from "@/lib/types";

// To-Be（2026-11-27）の計画。期待値は手で決めた（To-Be 03「予算と支払い」「旅行/計画」・04「削除時の孤児防止」）
const ts = "2026-11-27T00:00:00.000Z";
const base = (): AppData => emptyData(ts);
const tx = (o: Partial<Transaction>): Transaction => ({
  id: "t1", type: "expense", date: "2026-12-20", amount: 5000, currency: "JPY", categoryId: "exp-1", merchant: "居酒屋", paymentMethod: "", note: "", source: "manual", createdAt: ts, updatedAt: ts, ...o,
});

describe("古い記録との互換（A06）", () => {
  it("計画の無い古い記録は、空の計画を足して読める。ほかの中身は変えない", () => {
    const old = { ...base() } as Record<string, unknown>;
    delete old.plans;
    const m = migrate(old) as AppData;
    expect(m.plans).toEqual([]);
    expect(validateAppData(old).ok).toBe(true);
  });
  it("形の崩れた計画は読まない（黙って直さない）", () => {
    const bad = { ...base(), plans: [{ id: "p1", type: "party", title: "x", status: "considering", date: "", budget: null, note: "", createdAt: ts, updatedAt: ts }] };
    expect(validateAppData(bad)).toMatchObject({ ok: false });
    const dup = addPlan(addPlan(base(), { type: "free", title: "a", date: "", budget: null, note: "" }, "p1", ts), { type: "free", title: "b", date: "", budget: null, note: "" }, "p1", ts);
    expect(validateAppData(dup)).toMatchObject({ ok: false, error: "計画が二重に入っています" });
  });
});

describe("計画のお金：見込みと使ったお金を分ける（A08）", () => {
  it("予算は見込み。使ったお金は結んだ支出だけを家計簿と同じ数え方で足す（返金・口座間の移動は入らない）", () => {
    let d = addPlan(base(), { type: "gathering", title: "忘年会", date: "2026-12-20", budget: 10000, note: "" }, "p1", ts);
    d = {
      ...d,
      transactions: [
        tx({ id: "t1", amount: 5000, planId: "p1" }),
        tx({ id: "t2", amount: 3000, planId: "p1", countAs: "transfer" }), // 立替の受け渡しなど：数えない
        tx({ id: "t3", amount: 2000 }), // 計画に結んでいない
      ],
    };
    const v = planView(d, d.plans[0]);
    expect(v.spent).toBe(5000);
    expect(v.left).toBe(5000);
    expect(v.transactions.map((t) => t.id)).toEqual(["t1", "t2"]);
  });
  it("予算が無ければ残りは出さない", () => {
    const d = addPlan(base(), { type: "free", title: "x", date: "", budget: null, note: "" }, "p1", ts);
    expect(planView(d, d.plans[0]).left).toBeNull();
  });
});

describe("計画を消しても記録は消さない（04 孤児防止）", () => {
  it("結んだ予定・やること・支出は残り、結び付けだけ外れる", () => {
    let d = addPlan(base(), { type: "gathering", title: "忘年会", date: "", budget: null, note: "" }, "p1", ts);
    d = {
      ...d,
      events: [{ id: "e1", title: "忘年会", startDate: "2026-12-20", endDate: "2026-12-20", allDay: true, startTime: "", endTime: "", note: "", planId: "p1", createdAt: ts, updatedAt: ts }],
      tasks: [{ id: "k1", title: "お店を予約する", due: "", done: false, note: "", planId: "p1", createdAt: ts, updatedAt: ts }],
      transactions: [tx({ planId: "p1" })],
    };
    const after = deletePlan(d, "p1");
    expect(after.plans).toEqual([]);
    expect(after.events).toHaveLength(1);
    expect(after.tasks).toHaveLength(1);
    expect(after.transactions).toHaveLength(1);
    expect([after.events[0].planId, after.tasks[0].planId, after.transactions[0].planId]).toEqual([undefined, undefined, undefined]);
    expect(validateAppData(after).ok).toBe(true);
  });
  it("記録を結ぶ・外す", () => {
    let d = { ...addPlan(base(), { type: "free", title: "x", date: "", budget: null, note: "" }, "p1", ts), tasks: [{ id: "k1", title: "a", due: "", done: false, note: "", createdAt: ts, updatedAt: ts }] };
    d = linkToPlan(d, "task", "k1", "p1", "t2");
    expect(d.tasks[0]).toMatchObject({ planId: "p1", updatedAt: "t2" });
    d = linkToPlan(d, "task", "k1", null, "t3");
    expect("planId" in d.tasks[0]).toBe(false);
  });
});

describe("候補と「これに決める」", () => {
  it("決めるのは1つだけ。もう一度押すと取り消す", () => {
    let d = addPlan(base(), { type: "gathering", title: "忘年会", date: "", budget: null, note: "" }, "p1", ts);
    d = addCandidate(d, "p1", { label: "A店", url: "", price: 4000, note: "" }, "c1", ts);
    d = addCandidate(d, "p1", { label: "B店", url: "https://example.com/b", price: 5000, note: "" }, "c2", ts);
    d = chooseCandidate(d, "p1", "c2", ts);
    expect(d.plans[0].candidates!.map((c) => !!c.chosen)).toEqual([false, true]);
    d = chooseCandidate(d, "p1", "c1", ts);
    expect(d.plans[0].candidates!.map((c) => !!c.chosen)).toEqual([true, false]);
    d = chooseCandidate(d, "p1", "c1", ts);
    expect(d.plans[0].candidates!.map((c) => !!c.chosen)).toEqual([false, false]);
    expect(validateAppData(d).ok).toBe(true);
  });
  it("http/https でない URL の候補は読まない", () => {
    const d = addCandidate(addPlan(base(), { type: "free", title: "x", date: "", budget: null, note: "" }, "p1", ts), "p1", { label: "a", url: "javascript:alert(1)", price: null, note: "" }, "c1", ts);
    expect(validateAppData(d).ok).toBe(false);
  });
});

describe("並びとバックアップ", () => {
  it("進めている計画は日付の近い順（日程未定は後ろ）、完了・中止は過去へ", () => {
    let d = base();
    d = addPlan(d, { type: "free", title: "未定", date: "", budget: null, note: "" }, "a", ts);
    d = addPlan(d, { type: "free", title: "1月", date: "2027-01-10", budget: null, note: "" }, "b", ts);
    d = addPlan(d, { type: "free", title: "12月", date: "2026-12-20", budget: null, note: "" }, "c", ts);
    d = addPlan(d, { type: "free", title: "中止", date: "2026-12-01", budget: null, note: "", status: "canceled" }, "x", ts);
    const s = sortPlans(d.plans);
    expect(s.active.map((p) => p.title)).toEqual(["12月", "1月", "未定"]);
    expect(s.past.map((p) => p.title)).toEqual(["中止"]);
  });
  it("バックアップの件数と、追加の復元に計画が入る", () => {
    const d = addPlan(base(), { type: "free", title: "x", date: "", budget: null, note: "" }, "p1", ts);
    expect(countData(d).plans).toBe(1);
    const r = applyRestore(base(), d, "merge");
    expect(r.ok && r.data.plans.map((p) => p.id)).toEqual(["p1"]);
  });
});

// 反証（2026-11-27）の指摘の直し。期待値は手で決めた
import { replaceEventEditableFields } from "@/lib/eventMerge";
import { PLAN_EVENT_EXISTS, addPlanEvent, candidateNoun, planEventError, setPlanDate } from "@/lib/plan";
import { applyRefund } from "@/lib/refund";

describe("計画の予定は1件・直してもつながりは残る（A09・反証 高-1・高-2）", () => {
  const withPlan = () => addPlan(base(), { type: "gathering", title: "忘年会", date: "2026-12-20", budget: null, note: "" }, "p1", ts);
  it("予定に入れるを2回しても1件。2回目は理由を返す", () => {
    const d1 = addPlanEvent(withPlan(), { id: "p1", title: "忘年会", date: "2026-12-20" }, "e1", ts);
    expect(planEventError(d1, "p1")).toBe(PLAN_EVENT_EXISTS);
    const d2 = addPlanEvent(d1, { id: "p1", title: "忘年会", date: "2026-12-20" }, "e2", ts);
    expect(d2.events.map((e) => e.id)).toEqual(["e1"]);
  });
  it("カレンダーで予定を直しても planId は残る", () => {
    const d1 = addPlanEvent(withPlan(), { id: "p1", title: "忘年会", date: "2026-12-20" }, "e1", ts);
    const { id: _i, createdAt: _c, updatedAt: _u, planId: _p, ...form } = d1.events[0]; // eslint-disable-line @typescript-eslint/no-unused-vars
    const edited = replaceEventEditableFields(d1.events[0], { ...form, allDay: false, startTime: "19:00", endTime: "21:00" }, "t2");
    expect(edited).toMatchObject({ id: "e1", planId: "p1", startTime: "19:00" });
  });
  it("計画の日にちを変えると、結んだ1日の予定は同じ ID のまま移る（時刻はそのまま）。日にちを消しても予定は消さない", () => {
    let d = addPlanEvent(withPlan(), { id: "p1", title: "忘年会", date: "2026-12-20" }, "e1", ts);
    d = { ...d, events: d.events.map((e) => ({ ...e, allDay: false, startTime: "19:00", endTime: "21:00" })) };
    d = setPlanDate(d, "p1", "2026-12-27", "t3");
    expect(d.events).toHaveLength(1);
    expect(d.events[0]).toMatchObject({ id: "e1", startDate: "2026-12-27", endDate: "2026-12-27", startTime: "19:00" });
    expect(d.plans[0].date).toBe("2026-12-27");
    d = setPlanDate(d, "p1", "", "t4");
    expect(d.events[0].startDate).toBe("2026-12-27");
  });
});

describe("返金があっても、使ったお金は家計簿と同じ（反証 中 F087）", () => {
  it("5,000円の支出に2,000円の返金 → 使ったお金は3,000円", () => {
    let d = addPlan(base(), { type: "gathering", title: "忘年会", date: "", budget: 10000, note: "" }, "p1", ts);
    d = { ...d, transactions: [tx({ id: "t1", amount: 5000, planId: "p1" })] };
    const r = applyRefund(d, "t1", 2000, "2026-12-21", "r1", ts);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(planView(r.next, r.next.plans[0]).spent).toBe(3000);
  });
});

describe("種類ごとの候補の名前（05）", () => {
  it("飲み会はお店・引っ越しは物件・買い物は商品・転職は応募先・出張と旅行はホテル・航空券（05「ホテルを比べる／航空券を比べる」）", () => {
    expect((["gathering", "move", "shopping", "job", "business", "trip", "free"] as const).map(candidateNoun)).toEqual(["お店", "物件", "商品", "応募先", "ホテル・航空券", "ホテル・航空券", "候補"]);
  });
});

// 品質の点検（2026-11-27）の直し。期待値は手で決めた
import { integrity } from "@/lib/idbRepository";
import { readFileSync } from "node:fs";

describe("旅行の計画のお金・つながりの照合・旅行を消したとき（点検 M3・M4）", () => {
  it("旅行の計画は、旅行につないだ支出も数える。同じ支出は1回だけ", () => {
    let d = addPlan(base(), { type: "trip", title: "京都", date: "", budget: 50000, note: "", tripId: "tr1" }, "p1", ts);
    d = { ...d, transactions: [tx({ id: "a", amount: 10000, tripId: "tr1" }), tx({ id: "b", amount: 3000, tripId: "tr1", planId: "p1" }), tx({ id: "c", amount: 999 })] };
    const v = planView(d, d.plans[0]);
    expect(v.spent).toBe(13000);
    expect(v.transactions.map((t) => t.id)).toEqual(["a", "b"]);
  });
  it("IndexedDB へ移すときの照合に、計画とのつながりの数が入る", () => {
    let d = addPlan(base(), { type: "trip", title: "x", date: "", budget: null, note: "", tripId: "tr1" }, "p1", ts);
    d = { ...d, transactions: [tx({ planId: "p1" })] };
    expect(integrity(d, "").links.planId).toBe(2);
  });
  it("旅行を消すと、計画の tripId も外す", () => {
    const src = readFileSync("src/lib/store.tsx", "utf8");
    expect(src).toMatch(/deleteTrip:[\s\S]{0,400}plans: \(d\.plans \?\? \[\]\)\.map\(\(p\) => \{\s*if \(p\.tripId !== id\) return p;/);
  });
  it("計画の検索の処理は、公開版の組み立てで消える形（環境の値を直接比べる。点検 L1）", () => {
    expect(readFileSync("src/lib/search.ts", "utf8")).toContain('if (process.env.NEXT_PUBLIC_KB_EDITION === "personal") for (const p of data.plans ?? [])');
  });
});

describe("点検の残り（2026-11-27）", () => {
  it("投資のカテゴリの支出は、かかったお金に数えない（家計簿の生活費と同じ）。数えない記録とつながりの元が分かる", () => {
    let d = addPlan(base(), { type: "trip", title: "京都", date: "", budget: 20000, note: "", tripId: "tr1" }, "p1", ts);
    const exp = d.categories.find((c) => c.kind === "expense")!;
    d = { ...d, categories: [...d.categories, { ...exp, id: "inv", name: "投資", role: "invest" }] };
    d = {
      ...d,
      transactions: [
        tx({ id: "a", amount: 4000, planId: "p1" }),
        tx({ id: "b", amount: 10000, planId: "p1", categoryId: "inv" }),
        tx({ id: "c", amount: 1000, planId: "p1", countAs: "transfer" }),
        tx({ id: "d", amount: 2500, tripId: "tr1" }),
      ],
    };
    const v = planView(d, d.plans[0]);
    expect(v.spent).toBe(6500);
    expect(v.left).toBe(13500);
    expect([...v.uncounted].sort()).toEqual(["b", "c"]);
    expect([...v.viaTrip]).toEqual(["d"]);
  });
  it("計画を指す番号の指し先が無いときは、断らずに、つながりだけ外して戻す（記録は残す。点検 高-1：端末で切れたつながりがあっても、どのバックアップも戻せる）", () => {
    const withPlan = addPlan(base(), { type: "free", title: "x", date: "", budget: null, note: "" }, "p1", ts);
    const okData = { ...withPlan, transactions: [tx({ id: "a", planId: "p1" })] };
    const ok = applyRestore(base(), okData, "replace");
    expect(ok.ok && ok.data.transactions[0].planId).toBe("p1");
    // 置き換え：切れた planId・tripId は外れ、記録は残る
    const orphan = { ...addPlan(base(), { type: "trip", title: "京都", date: "", budget: null, note: "", tripId: "nope" }, "p1", ts), transactions: [tx({ id: "a", planId: "gone" })] };
    const r1 = applyRestore(base(), orphan, "replace");
    expect(r1.ok).toBe(true);
    if (r1.ok) {
      expect(r1.data.transactions).toHaveLength(1);
      expect(r1.data.transactions[0]).not.toHaveProperty("planId");
      expect(r1.data.plans[0]).not.toHaveProperty("tripId");
    }
    // 追加：端末の今のデータに切れたつながりがあっても、ほかのバックアップを追加できる
    const broken = { ...base(), tasks: [{ id: "k", title: "予約", due: "", done: false, note: "", planId: "gone", createdAt: ts, updatedAt: ts }] };
    const r2 = applyRestore(broken, okData, "merge");
    expect(r2.ok).toBe(true);
    if (r2.ok) {
      expect(r2.data.tasks[0]).not.toHaveProperty("planId");
      expect(r2.data.transactions.find((t) => t.id === "a")?.planId).toBe("p1");
    }
    // 書き出し → 読み込み（parseBackup）でも断らない
    expect(validateRelationships(broken).ok).toBe(true);
  });
  it("追加の復元：中身の違う同じ ID の旅行を指す計画は、旅行とのつながりを外して入れる（点検 低-1）", () => {
    const cur = { ...base(), trips: [{ id: "tr1", title: "大阪", destination: "", startDate: "2026-12-01", endDate: "2026-12-02", budget: null, note: "", createdAt: ts, updatedAt: ts }] };
    const inc = { ...addPlan(base(), { type: "trip", title: "京都", date: "", budget: null, note: "", tripId: "tr1" }, "p9", ts), trips: [{ id: "tr1", title: "京都", destination: "", startDate: "2027-01-01", endDate: "2027-01-02", budget: null, note: "", createdAt: ts, updatedAt: ts }] };
    const r = applyRestore(cur as AppData, inc as AppData, "merge");
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.data.plans.find((p) => p.id === "p9")).not.toHaveProperty("tripId");
  });
  it("計画の画面から旅行を開くと、その旅行が開く（?open=）。つなぐ候補に投資は出さない", () => {
    const s = readFileSync("src/components/PlansScreen.tsx", "utf8");
    expect(s).not.toContain('href="/trips"');
    expect(s.match(/href=\{`\/trips\?open=\$\{(t|trip)\.id\}`\}/g)?.length).toBe(2);
    expect(s).toContain("!txIsInvest(t, cats)");
  });
});

describe("計画の名前を変える（2026-11-28）", () => {
  it("つないだ予定は、名前が前の計画の名前のままのものだけ変わる。ID は同じ。空の名前では変えない", async () => {
    const { renamePlan } = await import("@/lib/plan");
    let d = addPlan(base(), { type: "gathering", title: "忘年会", date: "2026-12-20", budget: null, note: "" }, "p1", ts);
    d = addPlanEvent(d, d.plans[0], "e1", ts);
    d = { ...d, events: [...d.events, { ...d.events[0], id: "e2", title: "二次会（自分で名前を変えた）" }] };
    const r = renamePlan(d, "p1", "  部署の忘年会 ", "2026-11-28T00:00:00.000Z");
    expect(r.plans[0].title).toBe("部署の忘年会");
    expect(r.events.map((e) => [e.id, e.title])).toEqual([["e1", "部署の忘年会"], ["e2", "二次会（自分で名前を変えた）"]]);
    expect(renamePlan(d, "p1", "   ", ts)).toBe(d);
    expect(renamePlan(d, "nope", "x", ts)).toBe(d);
  });
});

describe("公開版の組み立てに計画の言葉を入れない", () => {
  it("復元（backup.ts）は、計画の画面の言葉を持つ plan.ts を読み込まない", () => {
    const b = readFileSync("src/lib/backup.ts", "utf8");
    expect(b).not.toMatch(/from "\.\/plan"/);
    expect(readFileSync("src/lib/planLinks.ts", "utf8")).not.toMatch(/from "\.\/plan"|飲み会/);
  });
});
