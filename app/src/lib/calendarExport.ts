import { addDays, daysBetween } from "./date";
import { occursOn } from "./aggregate";
import { advanceDueDate } from "./recurring";
import { formatYen } from "./money";
import { clipText } from "./clip";
import type { AppData } from "./types";

/**
 * iPhone のカレンダーに入れる予定の一覧。
 * Web 版は設定の「カレンダー用ファイルを書き出す」（lib/ics.ts）で、iPhone アプリは「くらしベース」カレンダーへの自動の書き込みで使う。
 * 書くのは、くらしベースの予定と、固定費の支払日。前の日から先の期間ぶんを、毎回まるごと書き直す。
 */
export interface CalendarItem {
  title: string;
  startDate: string; // YYYY-MM-DD
  endDate: string; // YYYY-MM-DD（終日の最後の日。時刻つきは startDate と同じ）
  allDay: boolean;
  startTime: string; // HH:mm（終日は ""）
  endTime: string; // HH:mm（終日は ""）
  location: string;
  notes: string;
}

export const CAL_PAST_DAYS = 30;
export const CAL_FUTURE_DAYS = 180;
/** カレンダーに書く名前・場所の長さ（アプリが受け取る一覧は 5MB まで。超えると1件も書けない。o11 A07） */
export const CAL_TEXT_MAX = 200;
export const CAL_MAX_ITEMS = 1500;

export function calendarWindow(today: string): { from: string; to: string } {
  return { from: addDays(today, -CAL_PAST_DAYS), to: addDays(today, CAL_FUTURE_DAYS) };
}

export function buildCalendarItems(data: AppData, today: string): CalendarItem[] {
  const { from, to } = calendarWindow(today);
  const items: CalendarItem[] = [];

  for (const e of data.events) {
    const title = clipText(e.title.trim(), CAL_TEXT_MAX) || "（名前なし）";
    // メモ（説明）は渡さない（iCloud に同期され、ロック画面などにも出るため）
    const base = { title, allDay: e.allDay, location: clipText(e.location ?? "", CAL_TEXT_MAX), notes: "" };
    const rep = e.repeat ?? "none";
    if (rep === "none" || e.startDate !== e.endDate) {
      // 1回だけの予定・何日も続く予定：期間に少しでもかかれば、そのまま1件
      if (e.endDate < from || e.startDate > to) continue;
      items.push({ ...base, startDate: e.startDate, endDate: e.endDate, startTime: e.allDay ? "" : e.startTime, endTime: e.allDay ? "" : e.endTime });
      continue;
    }
    // くり返しの予定：期間の中の1回ずつ
    for (let d = e.startDate > from ? e.startDate : from; d <= to; d = addDays(d, 1)) {
      if (occursOn(e, d)) items.push({ ...base, startDate: d, endDate: d, startTime: e.allDay ? "" : e.startTime, endTime: e.allDay ? "" : e.endTime });
    }
  }

  for (const r of data.recurring) {
    if (!r.active) continue;
    let d = r.nextDueDate;
    if (d < from && r.cycle === "weekly") d = addDays(d, Math.ceil(daysBetween(d, from) / 7) * 7);
    for (let guard = 0; d <= to && guard < 3620; guard++) {
      if (d >= from) {
        items.push({
          title: `固定費 ${clipText(r.name, CAL_TEXT_MAX - 24)} ${formatYen(r.amount)}`, // 金額まで入れて200文字の内側（点検 低-1）
          startDate: d,
          endDate: d,
          allDay: true,
          startTime: "",
          endTime: "",
          location: "",
          notes: "くらしベースの固定費",
        });
      }
      d = advanceDueDate(d, r.cycle, r.anchorDay);
    }
  }

  items.sort((a, b) => a.startDate.localeCompare(b.startDate) || a.startTime.localeCompare(b.startTime) || a.title.localeCompare(b.title));
  return items.slice(0, CAL_MAX_ITEMS);
}
