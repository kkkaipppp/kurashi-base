// Run against compiled pure modules: node architecture-regression.cjs /path/to/output
const assert = require('node:assert/strict');
const path = require('node:path');
const load = n => require(path.resolve(process.argv[2], n));
const {emptyData}=load('defaults'); const {cashBalance}=load('balance'); const {forecastCurve,forecastMonthEnd}=load('forecast'); const {monthLedger}=load('ledger');
const now='2026-11-25T00:00:00Z'; const tx=(id,date,amount,extra={})=>({id,date,amount,type:'expense',currency:'JPY',categoryId:'exp-1',merchant:'',paymentMethod:'',note:'',source:'manual',createdAt:now,updatedAt:now,...extra});
let checks=0; const eq=(a,b)=>{assert.equal(a,b);checks++};
for(const baseDate of ['2026-10-01','2026-11-01','2026-11-07','2026-11-15']) {
 const d=emptyData(now);d.assets=[{id:'a',name:'cash',kind:'cash',value:500000,asOf:baseDate}];d.transactions=[tx('a','2026-10-25',100000,{paymentMethod:'card'}),tx('b','2026-11-05',30000,{paymentMethod:'card'}),tx('c','2026-11-10',100000,{countAs:'transfer',transferKind:'card'}),tx('future','2026-12-01',999,{paymentMethod:'card'})];
 const r=cashBalance(d,'2026-11-25');eq(r.cardPending,30000);eq(r.balance,500000-(baseDate<'2026-11-10'?100000:0));eq(r.afterCard,r.balance-30000);d.transactions.reverse();eq(cashBalance(d,'2026-11-25').cardPending,30000);
}
for(let day=8;day<=30;day++) {const d=emptyData(now);d.budget.monthly=100000;d.transactions=[tx('a','2026-11-03',1000),tx('b','2026-11-04',1000),tx('c','2026-11-05',1000),tx('old','2026-11-01',1000)];d.recurring=[{id:'r',active:true,cycle:'weekly',anchorDay:1,nextDueDate:'2026-11-09',amount:7000,categoryId:'exp-5'}];const today=`2026-11-${String(day).padStart(2,'0')}`;const f=forecastMonthEnd(d,today),c=forecastCurve(d,today);eq(c.projected.at(-1),f.projected);if(day<30)eq(c.projected[0],c.actual.at(-1));if(day===8){eq(c.projected[1]-c.projected[0],f.dailyVariable+7000);eq(c.projected[8]-c.projected[7],f.dailyVariable+7000);eq(c.projected[15]-c.projected[14],f.dailyVariable+7000);eq(c.projected[22]-c.projected[21],f.dailyVariable+7000);}eq(monthLedger(d,'2026-10',today).freeLeft,null);eq(monthLedger(d,'2026-12',today).perDay,null);}
console.log(`${checks} assertions passed`);
