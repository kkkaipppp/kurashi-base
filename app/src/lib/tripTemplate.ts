import { addDays, daysBetween } from "./date";
import { newId } from "./defaults";
import type { AppData, CalendarEvent, Trip } from "./types";

/**
 * 過去の旅行を元に、新しい旅行を作る（NEXT v21 X17：テンプレートは計画だけを複製し、実績・完了・元の明細 ID を複製しない）。
 * - 旅行：タイトル・行き先・予算・メモを引き継ぐ。日付は、新しい出発日に合わせてずらす（日数は同じ）
 * - 行程の予定：タイトル・場所・URL・種類・費用の目安・メモを引き継ぐ。日付は同じだけずらす。持ち物は「未完了」に戻す。新しい ID
 * - 引き継がない：支出の記録（つないだ支出）、予定の完了・実績、旅行の ID（新しく作る）
 * 元の旅行・予定は変えない。
 */
export function cloneTrip(
  d: AppData,
  tripId: string,
  newStart: string,
  ts: string,
  ids: { trip: () => string; event: () => string } = { trip: () => newId("trip"), event: () => newId("ev") },
): { ok: true; next: AppData; tripId: string; events: number } | { ok: false; error: string } {
  const src = (d.trips ?? []).find((t) => t.id === tripId);
  if (!src) return { ok: false, error: "元の旅行が見つかりません" };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(newStart)) return { ok: false, error: "出発日を選んでください" };
  const shift = daysBetween(src.startDate, newStart);
  const id = ids.trip();
  const trip: Trip = {
    ...src,
    id,
    title: `${src.title}（コピー）`,
    startDate: newStart,
    endDate: addDays(src.endDate, shift),
    createdAt: ts,
    updatedAt: ts,
  };
  const events: CalendarEvent[] = d.events
    .filter((e) => e.tripId === tripId)
    .map((e) => {
      const { items, ...rest } = e;
      const copy: CalendarEvent = {
        ...rest,
        id: ids.event(),
        tripId: id,
        startDate: addDays(e.startDate, shift),
        endDate: addDays(e.endDate, shift),
        createdAt: ts,
        updatedAt: ts,
      };
      if (e.repeatUntil) copy.repeatUntil = addDays(e.repeatUntil, shift);
      if (items) copy.items = items.map((i) => ({ ...i, id: ids.event(), done: false }));
      return copy;
    });
  return { ok: true, next: { ...d, trips: [...(d.trips ?? []), trip], events: [...d.events, ...events] }, tripId: id, events: events.length };
}
