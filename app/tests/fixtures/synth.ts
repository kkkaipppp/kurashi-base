import { emptyData } from "@/lib/defaults";
import { applyRefund, undoRefund } from "@/lib/refund";
import { daysInMonth } from "@/lib/date";
import type { AppData, Transaction } from "@/lib/types";

// 合成データ（A06 の並行比較・復元の往復で使う）。種（seed）つきの乱数で、毎回同じものができる
export const now = "2026-11-25T00:00:00.000Z";
const rng = (seed: number) => () => {
  seed = (seed * 1103515245 + 12345) % 2147483648;
  return seed / 2147483648;
};
export const tx = (o: Partial<Transaction> & { id: string }): Transaction => ({ type: "expense", date: "2026-11-10", amount: 1000, currency: "JPY", categoryId: "exp-1", merchant: "", paymentMethod: "", note: "", source: "manual", createdAt: now, updatedAt: now, ...o });
export const MONTHS = ["2026-02", "2026-09", "2026-10", "2026-11", "2026-12", "2027-01", "2028-02"]; // うるう年の2月も入れる

export function synth(seed: number): AppData {
  const r = rng(seed);
  let d = emptyData(now);
  d.categories.push({ id: "inv", name: "証券口座へ", kind: "expense", order: 99, archived: false, role: "invest" });
  d.categories.push({ id: "inv2", name: "投資信託", kind: "expense", order: 100, archived: false }); // 名前で投資
  d.budget.monthly = r() < 0.5 ? 150000 : null;
  d.recurring = [
    { id: "rc", name: "家賃", amount: 80000, cycle: "monthly", anchorDay: 27, nextDueDate: "2026-11-27", categoryId: "exp-4", paymentMethod: "", active: true, createdAt: now, updatedAt: now },
    { id: "rc2", name: "スマホ", amount: 3000, cycle: "monthly", anchorDay: 28, nextDueDate: "2026-11-28", categoryId: "exp-5", paymentMethod: "card", active: true, createdAt: now, updatedAt: now },
    { id: "rc3", name: "やめたジム", amount: 5000, cycle: "monthly", anchorDay: 10, nextDueDate: "2026-11-10", categoryId: "exp-2", paymentMethod: "", active: false, createdAt: now, updatedAt: now }, // 止めた固定費（同じ額でも固定費にしない）
  ];
  const txs: Transaction[] = [];
  for (let i = 0; i < 120; i++) {
    const mo = MONTHS[Math.floor(r() * MONTHS.length)];
    const last = daysInMonth(Number(mo.slice(0, 4)), Number(mo.slice(5, 7)));
    const date = `${mo}-${String(1 + Math.floor(r() * last)).padStart(2, "0")}`;
    const k = r();
    const amount = 100 + Math.floor(r() * 50000);
    const x = r();
    if (x < 0.04) {
      txs.push(tx({ id: `ci${i}`, type: "income", date, amount, categoryId: "inc-1", countAs: x < 0.02 ? "invest" : "life" })); // 収入の数え方の上書き（収入のまま）
      continue;
    }
    if (x < 0.07) {
      txs.push(tx({ id: `gy${i}`, date, amount: 5000, categoryId: "exp-2" })); // 止めた固定費と同じ額
      continue;
    }
    if (x < 0.09) {
      // カードの引き落としの記録が全額返金の形になっているもの（数え方 transfer・元の額あり・transferKind card）。返金の記録もつける
      txs.push(tx({ id: `sc${i}`, date, amount, countAs: "transfer", transferKind: "card", refundGross: amount }));
      txs.push(tx({ id: `scr${i}`, type: "income", date, amount, categoryId: "inc-1", countAs: "transfer", refundOf: `sc${i}` }));
      continue;
    }
    if (k < 0.1) txs.push(tx({ id: `i${i}`, type: "income", date, amount, categoryId: "inc-1" }));
    else if (k < 0.13) txs.push(tx({ id: `l${i}`, type: "income", date, amount, categoryId: "inc-1", refundOf: "x" })); // 古い形の返金（収入として数える）
    else if (k < 0.16) txs.push(tx({ id: `ti${i}`, type: "income", date, amount, categoryId: "inc-1", countAs: "transfer" }));
    else if (k < 0.22) txs.push(tx({ id: `s${i}`, date, amount, countAs: "transfer", transferKind: "card" }));
    else if (k < 0.26) txs.push(tx({ id: `m${i}`, date, amount, countAs: "transfer" }));
    else if (k < 0.32) txs.push(tx({ id: `v${i}`, date, amount, categoryId: r() < 0.5 ? "inv" : "inv2" }));
    else if (k < 0.35) txs.push(tx({ id: `o${i}`, date, amount, categoryId: "exp-1", countAs: "invest" })); // 記録ごとに投資へ
    else if (k < 0.37) txs.push(tx({ id: `w${i}`, date, amount, categoryId: "inv", countAs: "life" })); // 投資のカテゴリでも生活費
    else if (k < 0.42) txs.push(tx({ id: `f${i}`, date, amount: 80000, categoryId: "exp-4", recurringId: "rc" }));
    else if (k < 0.45) txs.push(tx({ id: `g${i}`, date, amount: 3000, categoryId: "exp-5" })); // 金額とカテゴリで固定費
    else txs.push(tx({ id: `p${i}`, date, amount, categoryId: ["exp-1", "exp-2", "exp-3"][Math.floor(r() * 3)], paymentMethod: r() < 0.4 ? "card" : "cash" }));
  }
  d.transactions = txs;
  d.nisa = [{ id: "n1", date: "2026-11-05", kind: "buy", frame: "tsumitate", amount: 30000, name: "", note: "", createdAt: now, updatedAt: now }  as AppData["nisa"][number]];
  d.events = [{ id: "e1", title: "会議", startDate: "2026-11-24", endDate: "2026-11-24", allDay: true, startTime: "", endTime: "", repeat: "weekly", note: "", createdAt: now, updatedAt: now } as AppData["events"][number]];
  // 返金：一部・全額・取り消し（順番はばらばら）
  let n = 0;
  for (const p of txs.filter((t) => /^[pvfo]/.test(t.id))) {
    if (r() > 0.35) continue;
    const made: string[] = [];
    for (let k = 0; k < 1 + Math.floor(r() * 3); k++) {
      const cur = d.transactions.find((x) => x.id === p.id)!;
      const left = (cur.refundGross ?? cur.amount) - d.transactions.filter((x) => x.refundOf === p.id).reduce((a, x) => a + x.amount, 0);
      if (left <= 0) break;
      const amt = r() < 0.3 ? left : 1 + Math.floor(r() * left);
      const id = `r${n++}`;
      const rm = MONTHS[Math.floor(r() * MONTHS.length)];
      const rd = 1 + Math.floor(r() * daysInMonth(Number(rm.slice(0, 4)), Number(rm.slice(5, 7)))); // 29〜31日・2/29 も
      const res = applyRefund(d, p.id, amt, `${rm}-${String(rd).padStart(2, "0")}`, id, now);
      if (res.ok) {
        d = res.next;
        made.push(id);
      }
    }
    if (made.length && r() < 0.4) d = undoRefund(d, made[Math.floor(r() * made.length)], now);
  }
  return d;
}

