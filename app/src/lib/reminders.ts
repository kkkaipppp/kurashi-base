import { eventsOnDay } from "./aggregate";
import { addDays, formatDateJa } from "./date";
import { departureTime, occurrenceKey } from "./eventOps";
import { formatYen } from "./money";
import type { AppData } from "./types";

/**
 * 通知の予定づくり（NEXT v21 X13：通知は項目に従属し、同じ内容を複数回送らない。変更・削除・完了で取り消す。静穏時間と秘匿）。
 * ここでは「いつ・何を通知するか」の一覧だけを計算する（アプリの部品が、iPhone のローカル通知に登録する）。
 * - ID は 項目の種類＋項目の ID＋日付＋目的 から作る（同じ項目・同じ日・同じ目的は1回だけ。登録し直しても増えない）
 * - 登録は毎回「いま必要なものを全部」入れ替える。予定を直す・消す・完了にすると、次の入れ替えで取り消される
 * - 通知の時刻が静穏時間に入るときは、静穏時間が終わる時刻にずらす（なくさない）
 * - 内容を隠す設定のときは、題名と本文を一般的な言葉にする（ロック画面に細かい内容を出さない）
 * - 近いものから最大 MAX_REMINDERS 件（iPhone の予約の上限 64 件に余裕を持たせる）
 */
export const MAX_REMINDERS = 50;
export const HORIZON_DAYS = 14;

export interface ReminderSettings {
  on: boolean;
  /** 予定の何分前に知らせるか（0 = 知らせない）。時刻つきの予定だけ */
  eventLead: number;
  /** 固定費の支払日の朝に知らせる */
  fixedMorning: boolean;
  /** タスクの期限の日の朝に知らせる */
  taskMorning: boolean;
  /** 契約の更新日の何日前の朝に知らせるか（0 = 知らせない） */
  contractDays: number;
  /** 通知の内容を隠す（ロック画面に細かい内容を出さない） */
  hideDetail: boolean;
  quietFrom: string; // 静穏時間のはじめ HH:mm
  quietTo: string; // 静穏時間の終わり HH:mm
  morning: string; // 「朝」の時刻 HH:mm
}

export const DEFAULT_REMINDERS: ReminderSettings = { on: false, eventLead: 30, fixedMorning: true, taskMorning: true, contractDays: 7, hideDetail: false, quietFrom: "22:00", quietTo: "07:00", morning: "08:00" };

export interface Reminder {
  /** 同じ項目・同じ日・同じ目的で変わらない ID */
  id: string;
  title: string;
  body: string;
  /** 鳴らす日時（端末の現地時刻。"YYYY-MM-DDTHH:mm"） */
  at: string;
}

const toMin = (t: string) => {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
};
const hhmm = (n: number) => `${String(Math.floor(n / 60)).padStart(2, "0")}:${String(n % 60).padStart(2, "0")}`;

/** 静穏時間（quietFrom〜quietTo。日をまたぐ）に入る時刻は、静穏時間の終わりにずらす（時刻だけ。日付は、下の shiftQuiet が扱う） */
export function applyQuiet(min: number, quietFrom: string, quietTo: string): number {
  const from = toMin(quietFrom);
  const to = toMin(quietTo);
  if (from === to) return min;
  const inQuiet = from < to ? min >= from && min < to : min >= from || min < to;
  return inQuiet ? to : min;
}

/**
 * 日付つきで、静穏時間のずらしを行う。日をまたぐ静穏時間（例 22:00〜07:00）の夜側（22:00 以降）は、翌日の 07:00 にずらす。
 * 分が負（前の日にさかのぼる）や 24 時以降のときは、日付を繰り上げ・繰り下げてから判断する
 */
export function shiftQuiet(date: string, min: number, quietFrom: string, quietTo: string): { date: string; min: number } {
  let d = date;
  let m = min;
  if (m < 0) {
    d = addDays(d, -1);
    m += 1440;
  }
  const from = toMin(quietFrom);
  const to = toMin(quietTo);
  if (from === to) return { date: d, min: m };
  if (from < to) return m >= from && m < to ? { date: d, min: to } : { date: d, min: m };
  if (m >= from) return { date: addDays(d, 1), min: to }; // 夜側：翌日の静穏時間の終わり
  if (m < to) return { date: d, min: to }; // 朝側：その日の静穏時間の終わり
  return { date: d, min: m };
}

export function buildReminders(d: AppData, now: string, s: ReminderSettings): Reminder[] {
  if (!s.on) return [];
  const nowDate = now.slice(0, 10);
  const nowMin = toMin(now.slice(11, 16));
  const out: Reminder[] = [];
  /** notBefore：この日時（予定の開始）以降になるときは登録しない（「30分前」が開始後に鳴らないように） */
  const add = (id: string, title: string, body: string, day: string, rawMin: number, notBefore?: { date: string; min: number }) => {
    const sh = shiftQuiet(day, Math.min(1439, rawMin), s.quietFrom, s.quietTo);
    // すでに過ぎた時刻は登録しない
    if (sh.date < nowDate || (sh.date === nowDate && sh.min <= nowMin)) return;
    if (notBefore && (sh.date > notBefore.date || (sh.date === notBefore.date && sh.min >= notBefore.min))) return;
    out.push({ id, title: s.hideDetail ? "くらしベース" : title, body: s.hideDetail ? "お知らせがあります" : body, at: `${sh.date}T${hhmm(sh.min)}` });
  };
  const morning = toMin(s.morning);
  for (let i = 0; i < HORIZON_DAYS; i++) {
    const date = addDays(nowDate, i);
    if (s.eventLead > 0)
      for (const e of eventsOnDay(d.events, date)) {
        if (e.allDay || !/^\d{2}:\d{2}$/.test(e.startTime) || e.doneDates?.includes(occurrenceKey(e, date))) continue;
        // 何日かにまたがる予定は、開始の日だけ
        if (e.startDate !== e.endDate && e.startDate !== date) continue;
        // 移動時間を登録した予定は、開始ではなく「出発」の N 分前に知らせる（出発の目安が出せるときだけ。前の日にさかのぼるときは、今までどおり）
        const dep = departureTime(e);
        const base = dep ? toMin(dep) : toMin(e.startTime);
        const label = dep ? `出発の目安 ${dep}・${e.startTime}から${e.location ? `（${e.location}）` : ""}・出発の${s.eventLead}分前です` : `${e.startTime}から${e.location ? `（${e.location}）` : ""}・${s.eventLead}分前です`;
        add(`kb|ev|${e.id}|${date}|lead`, e.title || "（名前なし）", label, date, base - s.eventLead, { date, min: toMin(e.startTime) });
      }
    if (s.fixedMorning)
      for (const r of d.recurring) {
        if (!r.active || r.nextDueDate !== date) continue;
        const left = r.partialPaid && r.partialPaid.due === r.nextDueDate ? Math.max(0, r.amount - r.partialPaid.paid) : r.amount;
        add(`kb|rc|${r.id}|${date}|due`, `固定費の支払日：${r.name}`, `${formatYen(left)}（今日）`, date, morning);
      }
    if (s.taskMorning)
      for (const t of d.tasks) if (!t.done && t.due === date) add(`kb|task|${t.id}|${date}|due`, `今日が期限：${t.title}`, "タスクの期限です", date, morning);
    if (s.contractDays > 0)
      for (const c of d.contracts) {
        if (c.status !== "active" || !c.renewalDate) continue;
        if (addDays(date, s.contractDays) !== c.renewalDate) continue;
        add(`kb|ct|${c.id}|${c.renewalDate}|renew`, `契約の更新日が近づいています：${c.name}`, `${formatDateJa(c.renewalDate, true)}が更新日です（あと${s.contractDays}日）`, date, morning);
      }
  }
  return out.sort((a, b) => a.at.localeCompare(b.at) || a.id.localeCompare(b.id)).slice(0, MAX_REMINDERS);
}

/** 設定の保存値を、安全な形にそろえる（壊れた値・知らない項目は、既定値に戻す） */
export function cleanReminderSettings(v: unknown): ReminderSettings {
  const o = (v && typeof v === "object" ? v : {}) as Record<string, unknown>;
  const hm = (x: unknown, dflt: string) => (typeof x === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(x) ? x : dflt);
  const num = (x: unknown, dflt: number, allowed: number[]) => (typeof x === "number" && allowed.includes(x) ? x : dflt);
  const D = DEFAULT_REMINDERS;
  return {
    on: o.on === true,
    eventLead: num(o.eventLead, D.eventLead, [0, 10, 30, 60]),
    fixedMorning: o.fixedMorning === undefined ? D.fixedMorning : o.fixedMorning === true,
    taskMorning: o.taskMorning === undefined ? D.taskMorning : o.taskMorning === true,
    contractDays: num(o.contractDays, D.contractDays, [0, 3, 7, 14]),
    hideDetail: o.hideDetail === true,
    quietFrom: hm(o.quietFrom, D.quietFrom),
    quietTo: hm(o.quietTo, D.quietTo),
    morning: hm(o.morning, D.morning),
  };
}
