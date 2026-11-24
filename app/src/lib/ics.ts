import type { CalendarItem } from "./calendarExport";

/**
 * iPhone などのカレンダーに入れるファイル（iCalendar / .ics）を作る。Web 版の「カレンダー用ファイルを書き出す」で使う。
 * 時刻つきの予定は、タイムゾーンを付けない時刻（入れた端末の時刻）で書く。
 */

const fnv = (s: string) => {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, "0");
};

/** 文字の中の , ; \ と改行を、ics の決まりどおりに書き換える */
export function icsEscape(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
}

/** 1行を75バイト以内に折り返す（日本語は3バイトなので、文字の切れ目で折る） */
export function icsFold(line: string): string {
  const enc = new TextEncoder();
  const out: string[] = [];
  let cur = "";
  let bytes = 0;
  for (const ch of line) {
    const b = enc.encode(ch).length;
    const limit = out.length === 0 ? 75 : 74; // 2行目からは先頭の空白1バイトぶん少なく
    if (bytes + b > limit) {
      out.push(cur);
      cur = "";
      bytes = 0;
    }
    cur += ch;
    bytes += b;
  }
  out.push(cur);
  return out.join("\r\n ");
}

const ymd = (d: string) => d.replaceAll("-", "");
const nextDay = (d: string) => {
  const t = new Date(`${d}T00:00:00Z`);
  t.setUTCDate(t.getUTCDate() + 1);
  return t.toISOString().slice(0, 10);
};
const hm = (t: string) => `${t.replace(":", "")}00`;

export function buildIcs(items: CalendarItem[], nowIso: string): string {
  const stamp = nowIso.replace(/[-:]/g, "").replace(/\.\d+Z$/, "Z");
  const lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//KURASHI BASE//JA", "CALSCALE:GREGORIAN", "X-WR-CALNAME:くらしベース"];
  const seen = new Map<string, number>();
  for (const it of items) {
    const base = `${it.title}|${it.startDate}|${it.endDate}|${it.startTime}`;
    const n = (seen.get(base) ?? 0) + 1;
    seen.set(base, n);
    lines.push("BEGIN:VEVENT");
    // 同じ予定は同じ UID（もう一度入れたときに、カレンダー側が同じ予定と分かるように）
    lines.push(`UID:${fnv(base)}-${n}@kurashi-base`);
    lines.push(`DTSTAMP:${stamp}`);
    if (it.allDay) {
      lines.push(`DTSTART;VALUE=DATE:${ymd(it.startDate)}`);
      lines.push(`DTEND;VALUE=DATE:${ymd(nextDay(it.endDate))}`);
    } else {
      // 同じ日の予定で終わりが始まりより前なら、始まりと同じにする（何日も続く予定は、そのまま）
      const end = it.endTime && (it.endDate > it.startDate || it.endTime > it.startTime) ? it.endTime : it.startTime;
      lines.push(`DTSTART:${ymd(it.startDate)}T${hm(it.startTime)}`);
      lines.push(`DTEND:${ymd(it.endDate)}T${hm(end)}`);
    }
    lines.push(icsFold(`SUMMARY:${icsEscape(it.title)}`));
    if (it.location) lines.push(icsFold(`LOCATION:${icsEscape(it.location)}`));
    lines.push("END:VEVENT");
  }
  lines.push("END:VCALENDAR");
  return lines.join("\r\n") + "\r\n";
}
