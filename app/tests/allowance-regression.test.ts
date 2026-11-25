import { it, expect } from "vitest";
import { unpaidRecurringThisMonth } from "@/lib/allowance";
import { buildNavi } from "@/lib/navi";
import { emptyData } from "@/lib/defaults";
import type { RecurringExpense } from "@/lib/types";
const r: RecurringExpense = {id:"r",name:"test",amount:1000,cycle:"weekly",anchorDay:1,nextDueDate:"2020-01-01",categoryId:"exp-1",paymentMethod:"cash",active:true,createdAt:"2020-01-01",updatedAt:"2020-01-01"};
// 2026-11-25 平尾さんの決定（Q30＝C）：次の支払日が先月以前のまま（古い）の固定費は、今月の「これから払う固定費」に数えない。かわりに知らせる
// （o11 の当初の版は「今月の回をすべて数える」だったが、手で記録していると二重に引くため、本人の判断で変えた）
it("古い週次・月次の固定費は数えない（二重に引かない）", () => {
  expect(unpaidRecurringThisMonth([r], "2026-11-25")).toBe(0);
  expect(unpaidRecurringThisMonth([{ ...r, cycle: "monthly" }], "2026-11-25")).toBe(0);
});
it("今月の中で過ぎた回と、これからの回は、今までどおり数える（毎週・11/04 始まり → 4回）", () => {
  expect(unpaidRecurringThisMonth([{ ...r, nextDueDate: "2026-11-04" }], "2026-11-25")).toBe(4000);
  expect(unpaidRecurringThisMonth([{ ...r, cycle: "monthly", nextDueDate: "2026-11-30" }], "2026-11-25")).toBe(1000);
});
it("古い固定費は「確認したいこと」で知らせる（予定日を過ぎています）", () => {
  const d = emptyData("2026-11-25T00:00:00.000Z");
  d.recurring = [r];
  expect(buildNavi(d, "2026-11-25").some((n) => n.key === "rc-r" && (n.sub ?? "").includes("過ぎています"))).toBe(true);
});
