import { ledgerEntries, sumEntries } from "./ledgerCore";
import type { AppData, Plan, PlanCandidate, PlanStatus, PlanType } from "./types";

/**
 * 計画（To-Be 2026-11-27 02「計画」・03「旅行/計画」「予算と支払い」）。画面から切り離した処理だけを置く。
 * - 予定・やること・支出は、それぞれの記録が正本。計画は planId で集めて見るだけ（二重に持たない）
 * - 計画の予算は見込み。家計簿の集計には入れない。使ったお金は、計画に結んだ支出を家計簿と同じ数え方（ledgerEntries）で足す
 * - 計画を消しても、結んだ予定・やること・支出は消さない（結び付けだけを外す。To-Be 03「予定を消してもタスクを勝手に完了・削除しない」と同じ考え）
 */
export const PLAN_TYPES: { type: PlanType; label: string; hint: string }[] = [
  { type: "gathering", label: "飲み会・集まり", hint: "日程・お店・会費" },
  { type: "trip", label: "旅行", hint: "旅程・移動・宿・予算" },
  { type: "move", label: "引っ越し", hint: "引っ越す日・内見・初期費用・住所変更" },
  { type: "shopping", label: "買い物", hint: "商品を比べる・購入金額・保証" },
  { type: "business", label: "出張", hint: "日程・移動・宿泊・経費" },
  { type: "job", label: "転職", hint: "応募先を比べる・面接" },
  { type: "free", label: "自由に作る", hint: "名前と中身を自分で決める" },
];
export const PLAN_TYPE_LABEL: Record<PlanType, string> = Object.fromEntries(PLAN_TYPES.map((t) => [t.type, t.label])) as Record<PlanType, string>;

/** 状態（05「計画: 検討中・準備中・完了・中止」） */
export const PLAN_STATUS_LABEL: Record<PlanStatus, string> = { considering: "検討中", preparing: "準備中", done: "完了", canceled: "中止" };
export const isActivePlan = (p: Pick<Plan, "status">) => p.status === "considering" || p.status === "preparing";

/** 候補の名前（種類に合わせる。05「お店を比べる／物件を比べる／商品を比べる／応募先を比べる」） */
export function candidateNoun(t: PlanType): string {
  return { gathering: "お店", trip: "ホテル・航空券", move: "物件", shopping: "商品", business: "ホテル・航空券", job: "応募先", free: "候補" }[t];
}

export type PlanInput = Pick<Plan, "type" | "title" | "date" | "budget" | "note"> & { status?: PlanStatus; tripId?: string };

export function addPlan(d: AppData, input: PlanInput, id: string, ts: string): AppData {
  const p: Plan = {
    id,
    type: input.type,
    title: input.title.trim().slice(0, 100),
    status: input.status ?? "considering",
    date: input.date,
    budget: input.budget,
    note: input.note,
    ...(input.tripId ? { tripId: input.tripId } : {}),
    createdAt: ts,
    updatedAt: ts,
  };
  return { ...d, plans: [...(d.plans ?? []), p] };
}

export function updatePlan(d: AppData, id: string, patch: Partial<Omit<Plan, "id" | "createdAt">>, ts: string): AppData {
  return { ...d, plans: (d.plans ?? []).map((p) => (p.id === id ? { ...p, ...patch, id, updatedAt: ts } : p)) };
}

/** 計画を消す。結んだ記録は残し、planId だけを外す（記録の更新日時は変えない：中身は変わっていないため） */
export function deletePlan(d: AppData, id: string): AppData {
  const unlink = <T extends { planId?: string }>(xs: T[]): T[] =>
    xs.map((x) => {
      if (x.planId !== id) return x;
      const { planId: _p, ...rest } = x; // eslint-disable-line @typescript-eslint/no-unused-vars
      return rest as T;
    });
  return { ...d, plans: (d.plans ?? []).filter((p) => p.id !== id), events: unlink(d.events), tasks: unlink(d.tasks), transactions: unlink(d.transactions) };
}

export const PLAN_EVENT_EXISTS = "この計画の予定は、もう入っています（ほかのタブなどで先に入れた可能性があります）";

/**
 * 計画の日にちを予定に入れる（To-Be 03「内部予定は同一IDで更新」・06 A09「再送しても予定1件」）。
 * - まだ結んだ予定が無ければ、終日の予定を1件作る
 * - もう結んだ予定があれば、作らずに理由を返す（保存の列の中で最新のデータに対して確かめる）
 */
export function planEventError(d: Pick<AppData, "events">, planId: string): string | null {
  return d.events.some((e) => e.planId === planId) ? PLAN_EVENT_EXISTS : null;
}
export function addPlanEvent(d: AppData, plan: Pick<Plan, "id" | "title" | "date">, eventId: string, ts: string): AppData {
  if (!plan.date || planEventError(d, plan.id)) return d;
  return {
    ...d,
    events: [...d.events, { id: eventId, title: plan.title, startDate: plan.date, endDate: plan.date, allDay: true, startTime: "", endTime: "", note: "", planId: plan.id, createdAt: ts, updatedAt: ts }],
  };
}

/**
 * 計画の日にちを変える。結んだ予定のうち1日の予定は、同じ ID のまま新しい日へ移す（時刻・中身はそのまま）。
 * 何日にもまたがる予定・繰り返しの予定は、本人が組んだものなので動かさない
 */
export function setPlanDate(d: AppData, planId: string, date: string, ts: string): AppData {
  const next = updatePlan(d, planId, { date }, ts);
  if (!date) return next;
  return {
    ...next,
    events: next.events.map((e) =>
      e.planId === planId && e.startDate === e.endDate && (!e.repeat || e.repeat === "none") && e.startDate !== date ? { ...e, startDate: date, endDate: date, updatedAt: ts } : e,
    ),
  };
}

export function addCandidate(d: AppData, planId: string, c: Omit<PlanCandidate, "id" | "chosen">, cid: string, ts: string): AppData {
  return {
    ...d,
    plans: (d.plans ?? []).map((p) => (p.id === planId ? { ...p, candidates: [...(p.candidates ?? []), { ...c, id: cid }], updatedAt: ts } : p)),
  };
}

export function removeCandidate(d: AppData, planId: string, cid: string, ts: string): AppData {
  return { ...d, plans: (d.plans ?? []).map((p) => (p.id === planId ? { ...p, candidates: (p.candidates ?? []).filter((c) => c.id !== cid), updatedAt: ts } : p)) };
}

/** 「これに決める」：選んだ候補だけを決めたものにする（もう一度押すと取り消す） */
export function chooseCandidate(d: AppData, planId: string, cid: string, ts: string): AppData {
  return {
    ...d,
    plans: (d.plans ?? []).map((p) => {
      if (p.id !== planId) return p;
      const was = (p.candidates ?? []).find((c) => c.id === cid)?.chosen;
      return { ...p, candidates: (p.candidates ?? []).map((c) => ({ ...c, chosen: c.id === cid ? !was : false })), updatedAt: ts };
    }),
  };
}

/** 記録を計画に結ぶ・外す（planId = null で外す） */
export function linkToPlan(d: AppData, kind: "event" | "task" | "transaction", recordId: string, planId: string | null, ts: string): AppData {
  const set = <T extends { id: string; planId?: string; updatedAt: string }>(xs: T[]): T[] =>
    xs.map((x) => {
      if (x.id !== recordId) return x;
      if (planId === null) {
        const { planId: _p, ...rest } = x; // eslint-disable-line @typescript-eslint/no-unused-vars
        return { ...rest, updatedAt: ts } as T;
      }
      return { ...x, planId, updatedAt: ts };
    });
  if (kind === "event") return { ...d, events: set(d.events) };
  if (kind === "task") return { ...d, tasks: set(d.tasks) };
  return { ...d, transactions: set(d.transactions) };
}

export interface PlanView {
  events: AppData["events"];
  tasks: AppData["tasks"];
  transactions: AppData["transactions"];
  /** 使ったお金（家計簿と同じ数え方。返金・口座間の移動・カードの引き落とし・投資は入らない） */
  spent: number;
  /** つないだ記録のうち、かかったお金に数えないもの（口座間の移動・投資）の ID */
  uncounted: Set<string>;
  /** 旅行とのつながりだけで入っている記録（計画からは外せない。旅行の画面で外す）の ID */
  viaTrip: Set<string>;
  /** 見込みの残り（予算 − 使ったお金）。予算が無ければ null */
  left: number | null;
  /** 次にやること：終わっていないやること（期限の近い順。期限なしは後ろ） */
  next: AppData["tasks"];
}

export function planView(d: AppData, plan: Pick<Plan, "id" | "budget"> & { tripId?: string }): PlanView {
  const events = d.events.filter((e) => e.planId === plan.id).sort((a, b) => (a.startDate + a.startTime).localeCompare(b.startDate + b.startTime));
  const tasks = d.tasks.filter((t) => t.planId === plan.id);
  // 旅行の計画は、旅行につないだ支出（tripId）も入れる。同じ記録は1回だけ（To-Be 点検 M3：旅行の支出の正本は今までどおり Trip とのつながり）
  const transactions = d.transactions.filter((t) => t.planId === plan.id || (!!plan.tripId && t.tripId === plan.tripId)).sort((a, b) => a.date.localeCompare(b.date));
  // 投資は家計簿の生活費と同じく数えない（To-Be 点検 L2・kurashi-ledger「投資のカテゴリは収支に入れない」）
  const entries = ledgerEntries({ ...d, transactions });
  const counted = new Set(entries.filter((e) => e.kind === "expense" && !e.invest).map((e) => e.txId));
  const spent = sumEntries(entries, (e) => counted.has(e.txId)).expense;
  const uncounted = new Set(transactions.filter((t) => t.type === "expense" && !counted.has(t.id)).map((t) => t.id));
  const viaTrip = new Set(transactions.filter((t) => t.planId !== plan.id).map((t) => t.id));
  const next = tasks.filter((t) => !t.done).sort((a, b) => (a.due || "9999").localeCompare(b.due || "9999"));
  return { events, tasks, transactions, spent, uncounted, viaTrip, left: plan.budget === null ? null : plan.budget - spent, next };
}

/** 一覧の並び：進めている計画（日付の近い順・日程未定は後ろ）→ 過去・中止（新しい順） */
export function sortPlans(plans: Plan[]): { active: Plan[]; past: Plan[] } {
  const active = plans.filter(isActivePlan).sort((a, b) => (a.date || "9999").localeCompare(b.date || "9999") || a.createdAt.localeCompare(b.createdAt));
  const past = plans.filter((p) => !isActivePlan(p)).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  return { active, past };
}
