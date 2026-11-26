import { describe, expect, it } from "vitest";
import { emptyData } from "@/lib/defaults";
import { makeEventFromTask, setTaskDone, taskIsEvent } from "@/lib/taskEvent";
import { deadlinesOn } from "@/lib/deadlines";
import { validateAppData } from "@/lib/schema";
import { isDoneOn } from "@/lib/eventOps";
import type { AppData, Task } from "@/lib/types";

// NEXT v21：タスクを共通の予定にする。押したときだけ・2つ目は作らない・完了は揃える・二重に出さない
const now = "2026-11-25T00:00:00.000Z";
const task = (o: Partial<Task> = {}): Task => ({ id: "t1", title: "住民票を取る", due: "2026-11-28", done: false, note: "窓口は9時から", createdAt: now, updatedAt: now, ...o });
const seed = (t: Task = task()): AppData => {
  const d = emptyData(now);
  d.tasks = [t];
  return d;
};

describe("タスクを予定にする", () => {
  it("期限の日の終日の予定を1つ作り、タスクに予定の ID を持たせる（タスクは残る）", () => {
    const d = makeEventFromTask(seed(), "t1", "ev1", "2026-11-25", now);
    expect(d.events).toHaveLength(1);
    expect(d.events[0]).toMatchObject({ id: "ev1", title: "住民票を取る", startDate: "2026-11-28", endDate: "2026-11-28", allDay: true, note: "窓口は9時から" });
    expect(d.tasks[0].eventId).toBe("ev1");
    expect(validateAppData(d).ok).toBe(true);
  });
  it("期限がないタスクは、今日の予定にする", () => {
    const d = makeEventFromTask(seed(task({ due: "" })), "t1", "ev1", "2026-11-25", now);
    expect(d.events[0].startDate).toBe("2026-11-25");
  });
  it("すでに予定にしてあれば、2つ目は作らない", () => {
    const once = makeEventFromTask(seed(), "t1", "ev1", "2026-11-25", now);
    const twice = makeEventFromTask(once, "t1", "ev2", "2026-11-25", now);
    expect(twice.events).toHaveLength(1);
  });
  it("つないだ予定を消したら、ふつうのタスクに戻る（また予定にできる）", () => {
    const once = makeEventFromTask(seed(), "t1", "ev1", "2026-11-25", now);
    const gone: AppData = { ...once, events: [] };
    expect(taskIsEvent(gone, gone.tasks[0])).toBe(false);
    expect(makeEventFromTask(gone, "t1", "ev2", "2026-11-25", now).events).toHaveLength(1);
  });
  it("完了を切り替えると、予定の完了も揃う。戻すと、予定も戻る", () => {
    const d = makeEventFromTask(seed(), "t1", "ev1", "2026-11-25", now);
    const done = setTaskDone(d, "t1", true, now);
    expect(done.tasks[0].done).toBe(true);
    expect(isDoneOn(done.events[0], "2026-11-28")).toBe(true);
    const back = setTaskDone(done, "t1", false, now);
    expect(back.tasks[0].done).toBe(false);
    expect(isDoneOn(back.events[0], "2026-11-28")).toBe(false);
  });
  it("予定のないタスクの完了は、今までどおり（予定は触らない）", () => {
    const d = setTaskDone(seed(), "t1", true, now);
    expect(d.tasks[0].done).toBe(true);
    expect(d.events).toEqual([]);
  });
  it("完了済みのタスクを予定にすると、予定も完了で作る", () => {
    const d = makeEventFromTask(seed(task({ done: true })), "t1", "ev1", "2026-11-25", now);
    expect(isDoneOn(d.events[0], "2026-11-28")).toBe(true);
  });
  it("期限の一覧には、予定にしたタスクを二重に出さない", () => {
    const d = makeEventFromTask(seed(), "t1", "ev1", "2026-11-25", now);
    expect(deadlinesOn(d, "2026-11-28").filter((x) => x.kind === "やること")).toHaveLength(0);
    expect(deadlinesOn(seed(), "2026-11-28").filter((x) => x.kind === "やること")).toHaveLength(1);
  });
});
