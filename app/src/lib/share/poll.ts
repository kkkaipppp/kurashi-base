import { addDays, isValidDateStr } from "../date";

/**
 * 日程調整の回答リンク（To-Be 段階4。決定 2026-11-28：Firebase・S-2 締め切りの7日後に消す・S-3 回答を直せる・S-4 名前を直してから出す）。
 * ここは外へ送らない純粋な計算だけ（形・確かめ・集計）。送るのは lib/share/firebase.ts で、Firebase の設定があるときだけ。
 * 外に置くのは：題名（本人が直せる）・候補日・締め切り・消す日・回答（表示名・○△×・一言）。家計・予定の本体は送らない。
 */
export const NAME_MAX = 20;
export const COMMENT_MAX = 50;
export const TITLE_MAX = 40;
export const OPTIONS_MAX = 20;
/** 締め切りの何日後に消すか（S-2） */
export const KEEP_DAYS_AFTER_CLOSE = 7;

export type Mark = "o" | "m" | "x";
export const MARK_LABEL: Record<Mark, string> = { o: "○", m: "△", x: "×" };

export interface PollOption {
  id: string;
  date: string; // YYYY-MM-DD
  label: string; // 「夜」など（任意・20字まで）
}

/** 端末の中に持つ控え（Plan.poll）。ownerKey は端末の外へ出さない（外にはハッシュだけ） */
export interface LocalPoll {
  id: string;
  ownerKey: string;
  title: string;
  options: PollOption[];
  closesAt: string; // YYYY-MM-DD（この日の終わりまで回答できる）
  status: "draft" | "open" | "closed";
  createdAt: string;
}

/** 外（Firestore）に置く形 */
export interface PublicPoll {
  title: string;
  options: { id: string; date: string; label: string }[];
  /** 候補の ID の一覧（ルールで回答の印を確かめるため） */
  optionIds: string[];
  closesAt: string;
  expiresAt: string; // YYYY-MM-DD（この日に消す。TTL は Firestore 側の設定）
  ownerKeyHash: string;
  createdAt: string;
}

export interface Answer {
  name: string;
  marks: Record<string, Mark>;
  comment?: string;
}

const chars = (s: string) => Array.from(s).length;

export function expiresFor(closesAt: string): string {
  return addDays(closesAt, KEEP_DAYS_AFTER_CLOSE);
}

/** 外に出す前の確かめ（題名・候補日・締め切り） */
export function checkPoll(p: Pick<LocalPoll, "title" | "options" | "closesAt">, today: string): string | null {
  const t = p.title.trim();
  if (!t) return "外に出す名前を入れてください";
  if (chars(t) > TITLE_MAX) return `名前は${TITLE_MAX}字までにしてください`;
  if (p.options.length === 0) return "候補日を1つ以上入れてください";
  if (p.options.length > OPTIONS_MAX) return `候補日は${OPTIONS_MAX}個までです`;
  const seen = new Set<string>();
  for (const o of p.options) {
    if (!isValidDateStr(o.date)) return "候補日の日付が正しくありません";
    if (chars(o.label) > NAME_MAX) return `候補日の補足は${NAME_MAX}字までです`;
    const k = `${o.date}|${o.label.trim()}`;
    if (seen.has(k)) return "同じ候補日が2つあります";
    seen.add(k);
  }
  if (!isValidDateStr(p.closesAt)) return "締め切りの日付が正しくありません";
  if (p.closesAt < today) return "締め切りが今日より前です";
  return null;
}

/** 外に置く中身（見せてから送る。ownerKey そのものは入れない） */
export function publicPayload(p: LocalPoll, ownerKeyHash: string): PublicPoll {
  const options = [...p.options].sort((a, b) => (a.date + a.label).localeCompare(b.date + b.label)).map((o) => ({ id: o.id, date: o.date, label: o.label.trim() }));
  return {
    title: p.title.trim(),
    options,
    optionIds: options.map((o) => o.id),
    closesAt: p.closesAt,
    expiresAt: expiresFor(p.closesAt),
    ownerKeyHash,
    createdAt: p.createdAt,
  };
}

/** 回答の確かめ（Firestore のルールと同じ決まり。ルールは firestore.rules） */
export function checkAnswer(a: Answer, poll: Pick<PublicPoll, "options" | "closesAt">, today: string): string | null {
  const name = a.name.trim();
  if (!name) return "名前を入れてください";
  if (chars(name) > NAME_MAX) return `名前は${NAME_MAX}字までにしてください`;
  if (a.comment !== undefined && chars(a.comment) > COMMENT_MAX) return `一言は${COMMENT_MAX}字までにしてください`;
  const ids = new Set(poll.options.map((o) => o.id));
  const keys = Object.keys(a.marks);
  if (keys.some((k) => !ids.has(k))) return "候補にない日が入っています";
  if (poll.options.some((o) => !a.marks[o.id])) return "すべての候補日に ○・△・× を付けてください";
  if (keys.some((k) => !["o", "m", "x"].includes(a.marks[k]))) return "○・△・× のどれかを選んでください";
  if (today > poll.closesAt) return "締め切りを過ぎています";
  return null;
}

/** 締め切りを早めるときの日（遅くはしない。決めた日が締め切りより後でも、外の締め切りは変えない。点検 高1） */
export function closeDateFor(closesAt: string, today: string): string | null {
  return today < closesAt ? today : null;
}

/** 候補日ごとの数（○を2点・△を1点として並べる。同点は日付の早い順） */
export function tally(options: PollOption[], answers: Answer[]): { option: PollOption; o: number; m: number; x: number; score: number }[] {
  return options
    .map((option) => {
      let o = 0;
      let m = 0;
      let x = 0;
      for (const a of answers) {
        const v = a.marks[option.id];
        if (v === "o") o++;
        else if (v === "m") m++;
        else if (v === "x") x++;
      }
      return { option, o, m, x, score: o * 2 + m };
    })
    .sort((a, b) => b.score - a.score || (a.option.date + a.option.label).localeCompare(b.option.date + b.option.label));
}

/** 推測されにくい ID・鍵（英数字。crypto で作る） */
export function randomToken(len: number, rand: (n: number) => Uint8Array = (n) => crypto.getRandomValues(new Uint8Array(n))): string {
  const A = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";
  const bytes = rand(len);
  let s = "";
  for (let i = 0; i < len; i++) s += A[bytes[i] % A.length];
  return s;
}

export async function sha256Hex(s: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
