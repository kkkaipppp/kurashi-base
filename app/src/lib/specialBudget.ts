import { ledgerEntries } from "./ledgerCore";
import type { AppData } from "./types";

/** その年の特別支出（共通台帳の収支に数える支出のうち、特別支出の印のもの。投資は入れない。2026-11-28） */
export function yearSpecial(d: AppData, year: string): number {
  return ledgerEntries(d)
    .filter((e) => e.kind === "expense" && e.special && !e.invest && e.date.slice(0, 4) === year)
    .reduce((s, e) => s + e.amount, 0);
}
