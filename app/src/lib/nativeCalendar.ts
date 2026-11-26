import { addDays, isValidDateStr } from "./date";
import { MAX_ICS_EVENTS, type IcsEvent, type IcsParseResult } from "./icsImport";

/**
 * iPhone のカレンダーの予定を、自分用アプリで直接読む（A5。2026-11-26 平尾さん「全部おすすめで」＝朝の報告の 8）。
 * - 読むのは iPhone の中だけ（ios/App/App/WidgetBridgePlugin.swift の readCalendarEvents）。外へは送らない
 * - 1回の写し（.ics の取り込みと同じ）。そのあとの変更はつながらない。同じ名前・日・時刻の予定は足さない（planIcsImport）
 * - 繰り返しの予定は、選んだ期間の中の回を1つずつ写す（iPhone のカレンダーが回ごとに返すため）
 * - くらしベースが書いた「くらしベース」カレンダーの予定は、Swift の側で除く（自分で書いたものを読み戻さない）
 * - 誕生日・照会（購読）のカレンダーは、初めは選ばない（本人が選べば読む）
 */
export interface NativeCalendarItem {
  title: string;
  /** "YYYY-MM-DD HH:mm"（端末の時間帯） */
  start: string;
  /** "YYYY-MM-DD HH:mm"。終日は、最後の日（含む） */
  end: string;
  allDay: boolean;
  location?: string;
  notes?: string;
  /** カレンダーの名前と種類（"local" | "calDAV" | "exchange" | "subscription" | "birthday"） */
  calendar: string;
  calendarType: string;
}

export interface NativeCalendarSummary {
  name: string;
  type: string;
  count: number;
  /** 初めから選んでおくか（誕生日・照会のカレンダーは選ばない） */
  defaultOn: boolean;
}

const MAX_TITLE = 100;
const MAX_NOTE = 500;
const MAX_LOCATION = 200;
const cut = (s: string, n: number) => Array.from(s).slice(0, n).join("");
const SPLIT = /^(\d{4}-\d{2}-\d{2}) (\d{2}:\d{2})$/;

/** 読む期間の選択肢（今日から） */
export const NATIVE_RANGES = [
  { key: "3m", label: "今日から3か月", back: 0, ahead: 92 },
  { key: "1y", label: "今日から1年", back: 0, ahead: 366 },
  { key: "past", label: "1か月前から1年先まで", back: 31, ahead: 366 },
] as const;
export type NativeRangeKey = (typeof NATIVE_RANGES)[number]["key"];

export function nativeRange(key: NativeRangeKey, today: string): { from: string; to: string } {
  const r = NATIVE_RANGES.find((x) => x.key === key) ?? NATIVE_RANGES[1];
  return { from: addDays(today, -r.back), to: addDays(today, r.ahead) };
}

/** カレンダーごとの件数（選ぶ画面用。件数の多い順） */
export function summarizeCalendars(items: NativeCalendarItem[]): NativeCalendarSummary[] {
  const m = new Map<string, NativeCalendarSummary>();
  for (const it of items) {
    const k = `${it.calendar}\u0000${it.calendarType}`;
    const cur = m.get(k) ?? { name: it.calendar || "（名前なし）", type: it.calendarType, count: 0, defaultOn: it.calendarType !== "birthday" && it.calendarType !== "subscription" };
    cur.count++;
    m.set(k, cur);
  }
  return [...m.values()].sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
}

export const calendarKey = (c: { name: string; type: string }) => `${c.name}\u0000${c.type}`;

/** 1件を、アプリの予定の形にする。保存の検査を通らない日付は作らない（null） */
export function nativeItemToEvent(it: NativeCalendarItem): IcsEvent | null {
  const s = SPLIT.exec(it.start);
  const e = SPLIT.exec(it.end);
  if (!s || !isValidDateStr(s[1])) return null;
  const startDate = s[1];
  const startTime = s[2];
  let endDate = startDate;
  let endTime = startTime;
  if (e && isValidDateStr(e[1])) {
    if (it.allDay) {
      if (e[1] > startDate) endDate = e[1];
    } else if (e[1] > startDate || (e[1] === startDate && e[2] >= startTime)) {
      endDate = e[1];
      endTime = e[2];
    }
  }
  const title = cut((it.title ?? "").trim(), MAX_TITLE) || "（名前なし）";
  const location = cut((it.location ?? "").trim(), MAX_LOCATION);
  let note = (it.notes ?? "").trim();
  if (Array.from(note).length > MAX_NOTE) note = cut(note, MAX_NOTE - 1) + "…";
  return {
    title,
    startDate,
    endDate,
    allDay: it.allDay,
    startTime: it.allDay ? "" : startTime,
    endTime: it.allDay ? "" : endTime,
    note,
    ...(location ? { location } : {}),
  };
}

/** 選んだカレンダーの予定を、.ics の取り込みと同じ形にする（そのあとは planIcsImport・applyIcsImport を使う） */
export function nativeToParsed(items: NativeCalendarItem[], selected: Set<string>, overLimit = 0): IcsParseResult {
  const res: IcsParseResult = { events: [], skipped: 0, repeatDropped: 0, otherTimezone: 0, cancelled: 0, overLimit };
  for (const it of items) {
    if (!selected.has(calendarKey({ name: it.calendar || "（名前なし）", type: it.calendarType }))) continue;
    if (res.events.length >= MAX_ICS_EVENTS) {
      res.overLimit++;
      continue;
    }
    const ev = nativeItemToEvent(it);
    if (ev) res.events.push(ev);
    else res.skipped++;
  }
  return res;
}
