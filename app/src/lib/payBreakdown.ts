import { countedEntries, ledgerEvents } from "./ledgerCore";
import { paymentLabel, type AppData } from "./types";

/**
 * その月の支出を、支払方法（現金・カード・電子マネーなど）ごとに分ける（To-Be 02 家計簿「口座/カード/電子マネー」。保存の形は変えない）。
 * 数え方は家計簿と同じ（共通台帳の収支に数える支出。返金を引いたあと・投資も入る・口座間の移動とカードの引き落としは入らない）
 */
export function payBreakdown(d: Pick<AppData, "transactions" | "categories" | "recurring">, month: string): { id: string; label: string; amount: number }[] {
  const pay = new Map(d.transactions.map((t) => [t.id, t.paymentMethod]));
  const sums = new Map<string, number>();
  for (const e of countedEntries(ledgerEvents(d))) {
    if (e.kind !== "expense" || e.date.slice(0, 7) !== month) continue;
    const id = pay.get(e.txId) ?? "";
    sums.set(id, (sums.get(id) ?? 0) + e.amount);
  }
  return [...sums.entries()].map(([id, amount]) => ({ id, label: paymentLabel(id), amount })).filter((x) => x.amount > 0).sort((a, b) => b.amount - a.amount || a.label.localeCompare(b.label));
}
