import { it, expect } from "vitest";
import { unpaidRecurringThisMonth } from "@/lib/allowance";
import type { RecurringExpense } from "@/lib/types";
const r: RecurringExpense = {id:"r",name:"test",amount:1000,cycle:"weekly",anchorDay:1,nextDueDate:"2020-01-01",categoryId:"exp-1",paymentMethod:"cash",active:true,createdAt:"2020-01-01",updatedAt:"2020-01-01"};
it("古い週次・月次予定も今月分を数える",()=>{
 expect(unpaidRecurringThisMonth([r],"2026-11-25")).toBe(4000);
 expect(unpaidRecurringThisMonth([{...r,cycle:"monthly"}],"2026-11-25")).toBe(1000);
});
