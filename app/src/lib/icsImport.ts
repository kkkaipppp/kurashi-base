import { addDays, isValidDateStr } from "./date";
import type { AppData, CalendarEvent, EventRepeat } from "./types";

/**
 * カレンダーのファイル（.ics）から予定を読み込む（Q31＝①：iPhone 純正のカレンダーなどの予定を持ち込む。1回の写しで、同期はしない）。
 * - 端末の中だけで読む（外へ送らない）
 * - 読めるもの：予定の名前・日付・時刻・終日・場所・メモ・繰り返し（毎週・毎月・毎年の、1日の予定だけ。終わりの日も）
 * - 写せない繰り返し（2週おき・回数・複数の曜日・第n曜日・29〜31日の毎月・例外の日・足した日・その回だけ動かした回）は、
 *   最初の回だけを写し、メモに書き、件数で知らせる（黙って落とさない。独立点検 中-1・中-2）
 * - 時刻：Z（世界時）と UTC の TZID は日本時間に直す。Asia/Tokyo と時差なしは、そのまま。ほかの時間帯は、そのままの時刻で写し、数を知らせる
 * - 保存の検査（validateAppData）を通らない予定は作らない（日付の範囲・終わり≧始まり。独立点検 高-1）
 * - すでに同じ予定（名前・開始日・開始時刻が同じ）があれば、足さない（重ねて読み込んでも増えない）
 */
export type IcsEvent = Omit<CalendarEvent, "id" | "createdAt" | "updatedAt">;
export interface IcsParseResult {
  events: IcsEvent[];
  /** 読めなかった予定の数（日付がない・範囲外・途中で切れたなど） */
  skipped: number;
  /** 繰り返しを写せず、最初の回だけにした数 */
  repeatDropped: number;
  /** 日本以外の時間帯の予定の数（時刻はそのまま） */
  otherTimezone: number;
  /** 取り消された（CANCELLED）ので、写さなかった予定の数 */
  cancelled: number;
  /** 上限（5000件）を超えて、読まなかった予定の数 */
  overLimit: number;
}

export const MAX_ICS_EVENTS = 5000;
export const MAX_ICS_BYTES = 5_000_000;
/** 入力欄の上限に合わせる（取り込んだ予定を、そのまま直して保存できるように。独立点検 低-10） */
const MAX_TITLE = 100;
const MAX_NOTE = 500;
const MAX_LOCATION = 200;
const DROPPED = "（取り込み：繰り返しは写していません。最初の回だけです）";

/** 行の折り返し（次の行の先頭が空白・タブ）をつなぐ */
function unfold(text: string): string[] {
  const raw = text.replace(/^﻿/, "").replace(/\r\n?/g, "\n").split("\n");
  const out: string[] = [];
  for (const l of raw) {
    if ((l.startsWith(" ") || l.startsWith("\t")) && out.length) out[out.length - 1] += l.slice(1);
    else out.push(l);
  }
  return out;
}

/** 文字のエスケープを、1回の走査で戻す（\\n を改行にしない。独立点検 低-4） */
const unescape = (v: string) => v.replace(/\\([nN,;\\])/g, (_m, c: string) => (c === "n" || c === "N" ? "\n" : c));

/** 文字数で切る（絵文字を半分に割らない。独立点検 低-9） */
const cut = (s: string, n: number) => {
  const a = Array.from(s);
  return a.length > n ? a.slice(0, n).join("") : s;
};

interface Prop {
  name: string;
  params: Record<string, string>;
  value: string;
}
/** 1行を「名前;引数:値」に分ける。引用符の中のコロン・セミコロンは区切りにしない（独立点検 低-5） */
function parseLine(line: string): Prop | null {
  let q = false;
  let colon = -1;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') q = !q;
    else if (c === ":" && !q) {
      colon = i;
      break;
    }
  }
  if (colon < 0) return null;
  const head = line.slice(0, colon);
  const value = line.slice(colon + 1);
  const parts: string[] = [];
  let buf = "";
  q = false;
  for (const c of head) {
    if (c === '"') q = !q;
    if (c === ";" && !q) {
      parts.push(buf);
      buf = "";
    } else buf += c;
  }
  parts.push(buf);
  const [name, ...ps] = parts;
  const params: Record<string, string> = {};
  for (const p of ps) {
    const i = p.indexOf("=");
    if (i > 0) params[p.slice(0, i).toUpperCase()] = p.slice(i + 1).replace(/^"|"$/g, "");
  }
  return { name: name.toUpperCase(), params, value };
}

const pad = (n: number) => String(n).padStart(2, "0");
const isUtcZone = (tz: string) => /^(?:UTC|Etc\/UTC|GMT|Etc\/GMT|Z|Coordinated Universal Time)$/i.test(tz.trim());
const isJapanZone = (tz: string) => /Tokyo|Japan|JST|GMT\+0?9(?::?00)?$/i.test(tz.trim());

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
  if (h > 23 || mi > 59) return null;
  const tz = p.params.TZID ?? "";
  let other = false;
  if (m[7] || (tz && isUtcZone(tz))) {
    // 世界時 → 日本時間（+9時間）
    const t = new Date(Date.UTC(y, mo - 1, d, h, mi) + 9 * 3600_000);
    [y, mo, d, h, mi] = [t.getUTCFullYear(), t.getUTCMonth() + 1, t.getUTCDate(), t.getUTCHours(), t.getUTCMinutes()];
  } else if (tz && !isJapanZone(tz)) other = true;
  const date = `${y}-${pad(mo)}-${pad(d)}`;
  if (!isValidDateStr(date)) return null;
  return { date, time: `${pad(h)}:${pad(mi)}`, allDay: false, other };
}

/** 長さ（DURATION：P1W・P1D・P1DT2H・PT1H30M・PT45M0S など）を分にする。読めなければ null */
function parseDuration(v: string | undefined): number | null {
  if (!v) return null;
  const m = /^\+?P(?:(\d+)W)?(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/i.exec(v.trim());
  if (!m || v.trim().toUpperCase() === "P" || /T$/i.test(v.trim())) return null;
  const [w, d, h, mi, s] = [m[1], m[2], m[3], m[4], m[5]].map((x) => Number(x ?? 0));
  return w * 7 * 1440 + d * 1440 + h * 60 + mi + Math.floor(s / 60);
}

const WEEKDAY = ["SU", "MO", "TU", "WE", "TH", "FR", "SA"];
const weekdayOf = (date: string) => WEEKDAY[new Date(`${date}T00:00:00Z`).getUTCDay()];

/** RRULE を、アプリの繰り返し（1日の予定の毎週・毎月・毎年）にする。写せなければ null（独立点検 中-2・低-2・低-3） */
function parseRule(rule: string, startDate: string): { repeat: EventRepeat; until: string } | null {
  const kv: Record<string, string> = {};
  for (const part of rule.split(";")) {
    const [k, v] = part.split("=");
    if (k && v) kv[k.toUpperCase()] = v.toUpperCase();
  }
  const freq = { WEEKLY: "weekly", MONTHLY: "monthly", YEARLY: "yearly" }[kv.FREQ] as EventRepeat | undefined;
  if (!freq) return null;
  // 間隔（2週おき など）・回数・細かい指定は、アプリの繰り返しでは表せない
  if ((kv.INTERVAL && kv.INTERVAL !== "1") || kv.COUNT || kv.BYSETPOS || kv.BYWEEKNO || kv.BYYEARDAY || kv.BYHOUR || kv.BYMINUTE) return null;
  const day = Number(startDate.slice(8, 10));
  if (freq === "weekly") {
    // 毎週：曜日の指定は、開始日の曜日と同じ1つだけ
    if (kv.BYDAY && kv.BYDAY !== weekdayOf(startDate)) return null;
    if (kv.BYMONTHDAY || kv.BYMONTH) return null;
  } else {
    // 毎月・毎年：曜日・月の指定は表せない。29〜31日（毎月）・2/29（毎年）は、元のカレンダーでは飛ばす月があるので写さない
    if (kv.BYDAY || kv.BYMONTH) return null;
    if (kv.BYMONTHDAY && kv.BYMONTHDAY !== String(day)) return null;
    if (freq === "monthly" && day > 28) return null;
    if (freq === "yearly" && startDate.slice(5) === "02-29") return null;
  }
  let until = "";
  if (kv.UNTIL) {
    const u = kv.UNTIL;
    const m = /^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})?(Z)?)?$/.exec(u);
    if (!m) return null;
    let [y, mo, d] = [m[1], m[2], m[3]].map(Number);
    if (m[4] && m[7]) {
      // 世界時の終わり → 日本時間の日付（独立点検 低-3）
      const t = new Date(Date.UTC(y, mo - 1, d, Number(m[4]), Number(m[5])) + 9 * 3600_000);
      [y, mo, d] = [t.getUTCFullYear(), t.getUTCMonth() + 1, t.getUTCDate()];
    }
    until = `${y}-${pad(mo)}-${pad(d)}`;
    // 終わりが開始より前（壊れたファイル）は、1回も出なくなるので写さない（独立点検 低-2）
    if (!isValidDateStr(until) || until < startDate) return null;
  }
  return { repeat: freq, until };
}

/** ファイル全体を読む */
export function parseIcs(text: string): IcsParseResult {
  const res: IcsParseResult = { events: [], skipped: 0, repeatDropped: 0, otherTimezone: 0, cancelled: 0, overLimit: 0 };
  // 1回目：予定ごとの行を集める（その回だけ動かした回の UID も集める）
  const blocks: Prop[][] = [];
  let cur: Prop[] | null = null;
  let depth = 0; // VEVENT の中の VALARM などは読まない
  for (const line of unfold(text)) {
    const t = line.trim();
    if (/^BEGIN:VEVENT$/i.test(t)) {
      if (cur) res.skipped++; // 前の予定が END なしで切れていた
      cur = [];
      depth = 0;
      continue;
    }
    if (!cur) continue;
    if (/^END:VEVENT$/i.test(t)) {
      blocks.push(cur);
      cur = null;
      continue;
    }
    if (/^BEGIN:/i.test(t)) {
      depth++;
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
  if (cur) res.skipped++; // ファイルの最後が切れていた（独立点検 低-8）
  const moved = new Set<string>();
  for (const b of blocks) {
    const uid = b.find((p) => p.name === "UID")?.value;
    if (uid && b.some((p) => p.name === "RECURRENCE-ID")) moved.add(uid);
  }
  for (const b of blocks) {
    if (res.events.length >= MAX_ICS_EVENTS) {
      res.overLimit++; // 上限を超えた分は、数えて知らせる（独立点検 中-4）
      continue;
    }
    const ev = toEvent(b, res, moved);
    if (ev === "cancelled") res.cancelled++;
    else if (ev) res.events.push(ev);
    else res.skipped++;
  }
  return res;
}

function toEvent(props: Prop[], res: IcsParseResult, moved: Set<string>): IcsEvent | null | "cancelled" {
  const get = (n: string) => props.find((p) => p.name === n);
  if ((get("STATUS")?.value ?? "").trim().toUpperCase() === "CANCELLED") return "cancelled";
  const s = get("DTSTART");
  if (!s) return null;
  const start = parseWhen(s);
  if (!start) return null;
  const e = get("DTEND");
  const end = e ? parseWhen(e) : null;
  const dur = parseDuration(get("DURATION")?.value);
  let endDate = start.date;
  let endTime = "";
  if (start.allDay) {
    // 終日の終わりの日は「次の日」で書かれる（含まない）。1日前にする。長さ（P3D など）でも同じ
    if (end?.allDay && end.date > start.date) endDate = addDays(end.date, -1);
    else if (!end && dur !== null && dur >= 1440) endDate = addDays(start.date, Math.ceil(dur / 1440) - 1);
  } else if (end && !end.allDay) {
    if (end.date > start.date || (end.date === start.date && end.time >= start.time)) {
      endDate = end.date;
      endTime = end.time;
    } else {
      // 終わりが始まりより前（壊れたファイル）は、開始と同じ時刻にする（独立点検 低-1）
      endTime = start.time;
    }
  } else {
    // 終わりがないときは、長さから。なければ開始と同じ時刻（RFC 5545：長さ0）
    const [h, mi] = start.time.split(":").map(Number);
    const total = h * 60 + mi + (dur ?? 0);
    endDate = addDays(start.date, Math.floor(total / 1440));
    endTime = `${pad(Math.floor((total % 1440) / 60))}:${pad(total % 60)}`;
  }
  // 保存の検査を通らない日付（1900〜2200年の外）は作らない（独立点検 高-1）
  if (!isValidDateStr(endDate) || endDate < start.date) return null;
  if (start.other) res.otherTimezone++;
  const title = cut(unescape(get("SUMMARY")?.value ?? "").trim(), MAX_TITLE) || "（名前なし）";
  const location = cut(unescape(get("LOCATION")?.value ?? "").trim(), MAX_LOCATION);
  let note = unescape(get("DESCRIPTION")?.value ?? "").trim();
  let repeat: { repeat: EventRepeat; until: string } | null = null;
  const rule = get("RRULE");
  const uid = get("UID")?.value;
  const isMovedInstance = !!get("RECURRENCE-ID");
  if (isMovedInstance) note = `${note ? `${note}\n` : ""}（取り込み：繰り返しの中で、その回だけ動かした予定です）`;
  if (rule) {
    // 繰り返しは1日の予定だけ（アプリの決まり）。例外の日（EXDATE）・足した日（RDATE）・その回だけ動かした回がある繰り返しは、表せない
    const hasExceptions = props.some((p) => p.name === "EXDATE" || p.name === "RDATE") || (!!uid && moved.has(uid));
    repeat = endDate === start.date && !hasExceptions ? parseRule(rule.value, start.date) : null;
    if (!repeat) {
      res.repeatDropped++;
      note = `${note ? `${note}\n` : ""}${DROPPED}`;
    }
  }
  // メモは入力欄の上限まで（取り込みの一文は残す）
  if (Array.from(note).length > MAX_NOTE) {
    const tail = note.endsWith(DROPPED) ? `\n${DROPPED}` : "";
    note = cut(note, MAX_NOTE - Array.from(tail).length - 1) + "…" + tail;
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

/** 取り込みの計画：足す予定と、すでにアプリにある予定・ファイルの中で重なった予定の数（独立点検 低-11） */
export function planIcsImport(d: AppData, parsed: IcsParseResult): { add: IcsEvent[]; duplicates: number; inFileDuplicates: number } {
  const have = new Set(d.events.map(sameKey));
  const seen = new Set<string>();
  const add: IcsEvent[] = [];
  let duplicates = 0;
  let inFileDuplicates = 0;
  for (const e of parsed.events) {
    const k = sameKey(e);
    if (have.has(k)) {
      duplicates++;
      continue;
    }
    if (seen.has(k)) {
      inFileDuplicates++;
      continue;
    }
    seen.add(k);
    add.push(e);
  }
  return { add, duplicates, inFileDuplicates };
}

export function applyIcsImport(d: AppData, add: IcsEvent[], newId: () => string, ts: string): AppData {
  return { ...d, events: [...d.events, ...add.map((e) => ({ ...e, id: newId(), createdAt: ts, updatedAt: ts }))] };
}
