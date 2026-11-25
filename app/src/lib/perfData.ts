import { emptyData } from "./defaults";
import { addDays, daysInMonth } from "./date";
import type { AppData, CalendarEvent, Note, RecurringExpense, Task, Transaction } from "./types";

/**
 * 性能の測定に使う合成データ（o11 A08）。本物の記録とは関係がない。保存はしない（測る画面も試験も、メモリの中だけで使う）。
 * 同じ年数なら、いつも同じ中身になる（乱数の種を決めている）。
 *
 * 1年あたりの量は、かなり多めの使い方にしている：
 * - 支出 1日4件（1,460件）・給料と賞与（14件）・カードの引き落とし（月1件、収支に数えない）・一部返金（月1件）
 * - 予定 1日1件くらい（365件）と、毎週くり返す予定（全体で10件）
 * - タスク 60件・メモ 30件。固定費 30件（全体で）
 */
export const PERF_YEARS = [1, 5, 10, 30] as const;

export function perfData(years: number, today = "2026-11-25", nowIso = "2026-11-25T00:00:00.000Z"): AppData {
  const d = emptyData(nowIso);
  d.budget.monthly = 300000;
  let seed = 20261125 + years;
  const r = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
  const days = Math.round(years * 365.25);
  const start = addDays(today, -days + 1);
  const expCats = d.categories.filter((c) => c.kind === "expense").map((c) => c.id);
  const incCat = d.categories.find((c) => c.kind === "income")?.id ?? "inc-1";
  const tx = (p: Partial<Transaction> & Pick<Transaction, "id" | "date" | "amount">): Transaction => ({
    type: "expense",
    currency: "JPY",
    categoryId: expCats[0],
    merchant: "",
    paymentMethod: "",
    note: "",
    source: "manual",
    createdAt: nowIso,
    updatedAt: nowIso,
    ...p,
  });
  const txs: Transaction[] = [];
  const events: CalendarEvent[] = [];
  let n = 0;
  for (let i = 0; i < days; i++) {
    const date = addDays(start, i);
    for (let k = 0; k < 4; k++) {
      txs.push(tx({ id: `p${n++}`, date, amount: 100 + Math.floor(r() * 8000), categoryId: expCats[Math.floor(r() * expCats.length)], merchant: `店${Math.floor(r() * 300)}`, paymentMethod: r() < 0.6 ? "カード" : "現金", note: r() < 0.1 ? "メモ" : "" }));
    }
    {
      const allDay = r() < 0.3;
      const h = 8 + Math.floor(r() * 12);
      events.push({ id: `e${i}`, title: `予定${i}`, startDate: date, endDate: date, allDay, startTime: allDay ? "" : `${String(h).padStart(2, "0")}:00`, endTime: allDay ? "" : `${String(h + 1).padStart(2, "0")}:00`, location: r() < 0.3 ? "駅前" : "", note: "", createdAt: nowIso, updatedAt: nowIso });
    }
    const [y, m, dd] = date.split("-").map(Number);
    // 給料（25日）・賞与（6月・12月の10日）・カードの引き落とし（27日・収支に数えない）・一部返金（15日）
    if (dd === 25) txs.push(tx({ id: `s${n++}`, type: "income", date, amount: 300000, categoryId: incCat, merchant: "給料" }));
    if (dd === 10 && (m === 6 || m === 12)) txs.push(tx({ id: `b${n++}`, type: "income", date, amount: 500000, categoryId: incCat, merchant: "賞与" }));
    if (dd === Math.min(27, daysInMonth(y, m))) txs.push(tx({ id: `c${n++}`, date, amount: 150000, countAs: "transfer", transferKind: "card", merchant: "カードの引き落とし" }));
    if (dd === 15) {
      const gross = 10000;
      const back = 3000;
      const pid = `rp${n++}`;
      txs.push(tx({ id: pid, date, amount: gross - back, refundGross: gross, merchant: "返品した店" }));
      txs.push(tx({ id: `rr${n++}`, type: "income", date: addDays(date, 2) > today ? date : addDays(date, 2), amount: back, categoryId: incCat, countAs: "transfer", refundOf: pid, note: "返金" }));
    }
  }
  for (let i = 0; i < 10; i++) {
    const date = addDays(start, i);
    events.push({ id: `w${i}`, title: `毎週${i}`, startDate: date, endDate: date, allDay: false, startTime: "19:00", endTime: "20:00", repeat: "weekly", note: "", createdAt: nowIso, updatedAt: nowIso });
  }
  const recurring: RecurringExpense[] = Array.from({ length: 30 }, (_, i) => ({
    id: `rc${i}`,
    name: `固定費${i}`,
    amount: 1000 + i * 500,
    cycle: i % 10 === 9 ? ("yearly" as const) : ("monthly" as const),
    anchorDay: 1 + (i % 28),
    nextDueDate: addDays(today, 1 + (i % 28)),
    categoryId: expCats[i % expCats.length],
    paymentMethod: "カード",
    active: i % 7 !== 6,
    createdAt: nowIso,
    updatedAt: nowIso,
  }));
  const tasks: Task[] = Array.from({ length: Math.round(years * 60) }, (_, i) => ({ id: `k${i}`, title: `タスク${i}`, due: addDays(start, Math.floor((i / (years * 60)) * days)), done: i % 3 !== 0, note: "", createdAt: nowIso, updatedAt: nowIso }));
  const notes: Note[] = Array.from({ length: Math.round(years * 30) }, (_, i) => ({ id: `n${i}`, title: `メモ${i}`, body: "買うもの・覚えておくこと", date: addDays(start, Math.floor((i / (years * 30)) * days)), pinned: i === 0, createdAt: nowIso, updatedAt: nowIso }));
  d.transactions = txs;
  d.events = events;
  d.recurring = recurring;
  d.tasks = tasks;
  d.notes = notes;
  return d;
}
