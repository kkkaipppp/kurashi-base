import { addDays, isValidDateStr } from "./date";
import type { AppData, CalendarEvent, EventRepeat } from "./types";

/**
 * カレンダーのファイル（.ics）から予定を読み込む（Q31＝①：iPhone 純正のカレンダーなどの予定を持ち込む。1回の写しで、同期はしない）。
 * - 端末の中だけで読む（外へ送らない）
 * - 読めるもの：予定の名前・日付・時刻・終日・場所・メモ・繰り返し（毎週・毎月・毎年の、1日の予定だけ。終わりの日も）
 * - 読めないもの（複雑な繰り返し・例外の日など）は、最初の回だけを写し、メモに「繰り返しは写していません」と書く（黙って落とさない）
 * - 時刻：Z（世界時）は日本時間に直す。TZID=Asia/Tokyo と時差なしは、そのまま。ほかの時間帯は、そのままの時刻で写し、数を知らせる
 * - すでに同じ予定（名前・開始日・開始時刻が同じ）があれば、足さない（重ねて読み込んでも増えない）
 */
export interface IcsParseResult {
  events: Omit<CalendarEvent, "id" | "createdAt" | "updatedAt">[];
  /** 読めなかった予定の数（日付がないなど） */
  skipped: number;
  /** 繰り返しを写せず、最初の回だけにした数 */
  repeatDropped: number;
  /** 日本以外の時間帯の予定の数（時刻はそのまま） */
  otherTimezone: number;
}

export const MAX_ICS_EVENTS = 5000;
export const MAX_ICS_BYTES = 5_000_000;

/** 行の折り返し（次の行の先頭が空白・タブ）をつなぐ */
function unfold(text: string): string[] {
  const raw = text.replace(/\r\n?/g, "\n").split("\n");
  const out: string[] = [];
  for (const l of raw) {
    if ((l.startsWith(" ") || l.startsWith("\t")) && out.length) out[out.length - 1] += l.slice(1);
    else out.push(l);
  }
  return out;
}

const unescape = (v: string) => v.replace(/\\n/gi, "\n").replace(/\\([,;\\])/g, "$1");

interface Prop {
  name: string;
  params: Record<string, string>;
  value: string;
}
function parseLine(line: string): Prop | null {
  const i = line.indexOf(":");
  if (i < 0) return null;
  const head = line.slice(0, i);
  const value = line.slice(i + 1);
  const [name, ...ps] = head.split(";");
  const params: Record<string, string> = {};
  for (const p of ps) {
    const [k, v] = p.split("=");
    if (k && v !== undefined) params[k.toUpperCase()] = v.replace(/^"|"$/g, "");
  }
  return { name: name.toUpperCase(), params, value };
}

const pad = (n: number) => String(n).padStart(2, "0");

/** DTSTART・DTEND の値を、日付・時刻（日本時間）にする。読めなければ null */
function parseWhen(p: Prop): { date: string; time: string; allDay: boolean; other: boolean } | null {
  const v = p.value.trim();
  if (p.params.VALUE === "DATE" || /^\d{8}$/.test(v)) {
    const d = `${v.slice(0, 4)}-${v.slice(4, 6)}-${v.slice(6, 8)}`;
    return isValidDateStr(d) ? { date: d, time: "", allDay: true, other: false } : null;
  }
  const m = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})?(Z)?$/.exec(v);
  if (!m) return null;
  let [y, mo, d, h, mi] = [m[1], m[2], m[3], m[4], m[5]].map(Number);
  let other = false;
  if (m[7]) {
    // 世界時 → 日本時間（+9時間）
    const t = new Date(Date.UTC(y, mo - 1, d, h, mi) + 9 * 3600_000);
    [y, mo, d, h, mi] = [t.getUTCFullYear(), t.getUTCMonth() + 1, t.getUTCDate(), t.getUTCHours(), t.getUTCMinutes()];
  } else if (p.params.TZID && !/Tokyo|Japan|JST/i.test(p.params.TZID)) other = true;
  const date = `${y}-${pad(mo)}-${pad(d)}`;
  if (!isValidDateStr(date) || h > 23 || mi > 59) return null;
  return { date, time: `${pad(h)}:${pad(mi)}`, allDay: false, other };
}

/** RRULE を、アプリの繰り返し（1日の予定の毎週・毎月・毎年）にする。写せなければ null */
function parseRule(rule: string, startDate: string): { repeat: EventRepeat; until: string } | null {
  const kv: Record<string, string> = {};
  for (const part of rule.split(";")) {
    const [k, v] = part.split("=");
    if (k && v) kv[k.toUpperCase()] = v.toUpperCase();
  }
  const freq = { WEEKLY: "weekly", MONTHLY: "monthly", YEARLY: "yearly" }[kv.FREQ] as EventRepeat | undefined;
  if (!freq) return null;
  // 間隔（2週おき など）・回数・曜日の複数指定・第n曜日などは、アプリの繰り返しでは表せない
  if ((kv.INTERVAL && kv.INTERVAL !== "1") || kv.COUNT || kv.BYSETPOS || kv.BYWEEKNO || kv.BYYEARDAY || kv.BYHOUR) return null;
  if (kv.BYDAY && (kv.BYDAY.includes(",") || /\d/.test(kv.BYDAY))) return null;
  if (kv.BYMONTHDAY && kv.BYMONTHDAY !== String(Number(startDate.slice(8, 10)))) return null;
  let until = "";
  if (kv.UNTIL) {
    const u = kv.UNTIL.slice(0, 8);
    until = `${u.slice(0, 4)}-${u.slice(4, 6)}-${u.slice(6, 8)}`;
    if (!isValidDateStr(until)) return null;
  }
  return { repeat: freq, until };
}

export function parseIcs(text: string): IcsParseResult {
  const res: IcsParseResult = { events: [], skipped: 0, repeatDropped: 0, otherTimezone: 0 };
  let cur: Prop[] | null = null;
  let depth = 0; // VEVENT の中の VALARM などは読まない
  for (const line of unfold(text)) {
    const t = line.trim();
    if (/^BEGIN:VEVENT$/i.test(t)) {
      cur = [];
      depth = 0;
      continue;
    }
    if (!cur) continue;
    if (/^BEGIN:/i.test(t)) {
      depth++;
      continue;
    }
    if (/^END:VEVENT$/i.test(t)) {
      if (res.events.length >= MAX_ICS_EVENTS) break;
      const ev = toEvent(cur, res);
      if (ev) res.events.push(ev);
      else res.skipped++;
      cur = null;
      continue;
    }
    if (/^END:/i.test(t)) {
      depth = Math.max(0, depth - 1);
      continue;
    }
    if (depth > 0) continue;
    const p = parseLine(line);
    if (p) cur.push(p);
  }
  return res;
}

function toEvent(props: Prop[], res: IcsParseResult): IcsParseResult["events"][number] | null {
  const get = (n: string) => props.find((p) => p.name === n);
  const s = get("DTSTART");
  if (!s) return null;
  const start = parseWhen(s);
  if (!start) return null;
  const e = get("DTEND");
  const end = e ? parseWhen(e) : null;
  let endDate = start.date;
  let endTime = "";
  if (start.allDay) {
    // 終日の終わりの日は「次の日」で書かれる（含まない）。1日前にする
    if (end?.allDay && end.date > start.date) endDate = addDays(end.date, -1);
  } else if (end && !end.allDay) {
    endDate = end.date >= start.date ? end.date : start.date;
    endTime = end.date >= start.date ? end.time : start.time;
  } else {
    // 終わりがないときは、長さ（DURATION：PT1H30M など）から。なければ開始と同じ時刻（RFC 5545：長さ0）
    const dur = /^P(?:T(?:(\d+)H)?(?:(\d+)M)?)$/.exec((get("DURATION")?.value ?? "").trim());
    const mins = dur ? Number(dur[1] ?? 0) * 60 + Number(dur[2] ?? 0) : 0;
    const [h, mi] = start.time.split(":").map(Number);
    const total = h * 60 + mi + mins;
    endDate = addDays(start.date, Math.floor(total / 1440));
    endTime = `${pad(Math.floor((total % 1440) / 60))}:${pad(total % 60)}`;
  }
  if (start.other) res.otherTimezone++;
  const title = unescape(get("SUMMARY")?.value ?? "").trim().slice(0, 100) || "（名前なし）";
  const location = unescape(get("LOCATION")?.value ?? "").trim().slice(0, 200);
  let note = unescape(get("DESCRIPTION")?.value ?? "").trim().slice(0, 1000);
  let repeat: { repeat: EventRepeat; until: string } | null = null;
  const rule = get("RRULE");
  if (rule) {
    // 繰り返しは1日の予定だけ（アプリの決まり）
    repeat = endDate === start.date ? parseRule(rule.value, start.date) : null;
    if (!repeat) {
      res.repeatDropped++;
      note = `${note ? `${note}\n` : ""}（取り込み：繰り返しは写していません。最初の回だけです）`;
    }
  }
  return {
    title,
    startDate: start.date,
    endDate,
    allDay: start.allDay,
    startTime: start.allDay ? "" : start.time,
    endTime: start.allDay ? "" : endTime,
    note,
    ...(location ? { location } : {}),
    ...(repeat ? { repeat: repeat.repeat, repeatUntil: repeat.until } : {}),
  };
}

const sameKey = (e: Pick<CalendarEvent, "title" | "startDate" | "startTime">) => `${e.title.trim()}|${e.startDate}|${e.startTime}`;

/** 取り込みの計画：足す予定と、すでにあって足さない予定の数 */
export function planIcsImport(d: AppData, parsed: IcsParseResult): { add: IcsParseResult["events"]; duplicates: number } {
  const have = new Set(d.events.map(sameKey));
  const add: IcsParseResult["events"] = [];
  let duplicates = 0;
  for (const e of parsed.events) {
    const k = sameKey(e);
    if (have.has(k)) {
      duplicates++;
      continue;
    }
    have.add(k);
    add.push(e);
  }
  return { add, duplicates };
}

export function applyIcsImport(d: AppData, add: IcsParseResult["events"], newId: () => string, ts: string): AppData {
  return { ...d, events: [...d.events, ...add.map((e) => ({ ...e, id: newId(), createdAt: ts, updatedAt: ts }))] };
}
