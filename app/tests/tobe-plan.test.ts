import { describe, expect, it } from "vitest";
import { emptyData } from "@/lib/defaults";
import { migrate, validateAppData } from "@/lib/schema";
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
