import { isDoneOn, toggleDoneOn } from "./eventOps";
import type { AppData, CalendarEvent, Task } from "./types";

/**
 * タスクを共通の予定にする（NEXT v21 T06：予定・タスク・期限を、ひとつの予定の流れにまとめる。自分用）。
 * - 「予定にする」を押したときだけ、終日の予定を1つ作り、タスクに予定の ID（eventId）を持たせる。勝手には作らない
 * - 予定にしたタスクは、期限の一覧では二重に出さない（予定として出る）。タスク自体は消さない
 * - タスクの完了・未完了は、つないだ予定の完了と同じに揃える（予定側で完了にしても、タスクは変えない）
 */
// やる日があれば、やる日に予定を作る（期限と実施日は別。点検 中1。2026-11-28）
export function taskEventDate(t: Pick<Task, "due" | "doDate">, today: string): string {
  return t.doDate || t.due || today;
}

export function linkedEvent(d: Pick<AppData, "events">, t: Pick<Task, "eventId">): CalendarEvent | null {
  return t.eventId ? (d.events.find((e) => e.id === t.eventId) ?? null) : null;
}

/** 予定になっているタスク（予定がもうなければ、ふつうのタスクに戻る） */
export const taskIsEvent = (d: Pick<AppData, "events">, t: Pick<Task, "eventId">): boolean => linkedEvent(d, t) !== null;

export function makeEventFromTask(d: AppData, taskId: string, eventId: string, today: string, ts: string): AppData {
  const t = d.tasks.find((x) => x.id === taskId);
  if (!t || taskIsEvent(d, t)) return d; // すでに予定にしてあれば、2つ目は作らない
  const date = taskEventDate(t, today);
  const ev: CalendarEvent = {
    id: eventId,
    title: t.title,
    startDate: date,
    endDate: date,
    allDay: true,
    startTime: "",
    endTime: "",
    note: t.note,
    ...(t.done ? { doneDates: [date] } : {}),
    createdAt: ts,
    updatedAt: ts,
  };
  return { ...d, events: [...d.events, ev], tasks: d.tasks.map((x) => (x.id === taskId ? { ...x, eventId, updatedAt: ts } : x)) };
}

/** タスクの完了を切り替える。つないだ予定があれば、その予定の完了も同じに揃える */
export function setTaskDone(d: AppData, taskId: string, done: boolean, ts: string): AppData {
  const t = d.tasks.find((x) => x.id === taskId);
  if (!t) return d;
  const ev = linkedEvent(d, t);
  return {
    ...d,
    tasks: d.tasks.map((x) => (x.id === taskId ? { ...x, done, updatedAt: ts } : x)),
    events: ev ? d.events.map((e) => (e.id === ev.id && isDoneOn(e, e.startDate) !== done ? toggleDoneOn(e, e.startDate, ts) : e)) : d.events,
  };
}
