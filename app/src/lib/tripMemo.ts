import { addDays } from "./date";
import type { Transaction, Trip } from "./types";

/**
 * 前の作り（メモに「旅行：名前」）で入れた支出のうち、この旅行のものらしいもの（100点化の指示 F。押したときだけつなぐ）。
 * 名前は最後まで一致（「沖縄」で「沖縄2025」を拾わない）、旅行の期間の前後7日だけ、まだどの旅行にもつないでいないもの
 */
export function tripMemoCandidates(txs: Transaction[], trip: Pick<Trip, "title" | "startDate" | "endDate">): Transaction[] {
  const tag = `旅行：${trip.title}`;
  const from = addDays(trip.startDate, -7);
  const to = addDays(trip.endDate, 7);
  return txs.filter((t) => {
    if (t.tripId || t.date < from || t.date > to) return false;
    const i = t.note.indexOf(tag);
    if (i < 0) return false;
    const after = t.note.charAt(i + tag.length);
    return after === "" || /\s/.test(after);
  });
}
