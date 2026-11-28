import type { ForeignAmount } from "./types";

/** 外貨の控えの見せ方（lib/fx.ts。記録の一覧の行から読むので、通貨の一覧は持たない） */
/** "USD 12.50" */
export function formatForeign(f: ForeignAmount): string {
  const n = f.minor / 10 ** f.digits;
  return `${f.currency} ${n.toLocaleString("en-US", { minimumFractionDigits: f.digits, maximumFractionDigits: f.digits })}`;
}
