// 資格の候補・勉強時間の目安・1日の目標（v5）。
// 勉強時間の目安は、出典がある資格だけに出す（出典がなければ null。数値を作らない）。

import catalog from "./certifications.json";
import { daysBetween } from "./date";

export interface HoursHint {
  min: number;
  max: number;
  source: string; // 出典の URL
  kind: string;
}

export interface Certification {
  id: string;
  name: string;
  group: string;
  aliases: string[];
  targetHoursHint: HoursHint | null;
  officialExamURL: string;
  checkedOn: string;
  caveat: string;
}

export const CERTIFICATIONS: Certification[] = catalog as Certification[];

/** 出典の名前（画面に出す短い名前） */
export function sourceLabel(url: string): string {
  try {
    const h = new URL(url).hostname;
    if (h.includes("tac-school")) return "TAC";
    if (h.includes("u-can")) return "ユーキャン";
    if (h.includes("ipa.go.jp")) return "IPA";
    return h.replace(/^www\./, "");
  } catch {
    return "出典";
  }
}

/** 全角・半角、大文字・小文字、空白の違いを無視して比べる */
export function normalize(s: string): string {
  return s.normalize("NFKC").toLowerCase().replace(/[\s・･\-‐ー－]/g, "");
}

/** 名前・別名で資格の候補を探す（前方一致を先に、次に部分一致） */
export function searchCertifications(q: string, list: Certification[] = CERTIFICATIONS): Certification[] {
  const n = normalize(q);
  if (!n) return [];
  const score = (c: Certification) => {
    const names = [c.name, ...c.aliases].map(normalize);
    if (names.some((x) => x === n)) return 0;
    if (names.some((x) => x.startsWith(n))) return 1;
    if (names.some((x) => x.includes(n))) return 2;
    return -1;
  };
  return list
    .map((c) => ({ c, s: score(c) }))
    .filter((x) => x.s >= 0)
    .sort((a, b) => a.s - b.s)
    .map((x) => x.c);
}

export function findCertification(id: string | undefined): Certification | undefined {
  return id ? CERTIFICATIONS.find((c) => c.id === id) : undefined;
}

/** 分野ごとの候補（「人気の資格から選ぶ」用） */
export function groupedCertifications(): { group: string; items: Certification[] }[] {
  const out: { group: string; items: Certification[] }[] = [];
  for (const c of CERTIFICATIONS) {
    const g = out.find((x) => x.group === c.group);
    if (g) g.items.push(c);
    else out.push({ group: c.group, items: [c] });
  }
  return out;
}

export type DailyTarget =
  | { kind: "ok"; minutes: number; daysLeft: number; tooMuch: boolean }
  | { kind: "done" } // 目標の時間に届いた
  | { kind: "noTarget" } // 目標の勉強時間が未設定
  | { kind: "noExam" } // 試験日が未設定
  | { kind: "checkExam" }; // 試験日が今日・過去

/** 1日あたりの勉強時間 = 残りの分数 ÷ 試験までの日数（10分単位で切り上げ）。4時間を超えたら「調整」を促す */
export function dailyTarget(targetHours: number | null, loggedMinutes: number, today: string, examDate: string): DailyTarget {
  if (!targetHours || targetHours <= 0) return { kind: "noTarget" };
  const remaining = Math.max(0, targetHours * 60 - loggedMinutes);
  if (remaining === 0) return { kind: "done" };
  if (!examDate) return { kind: "noExam" };
  const daysLeft = daysBetween(today, examDate);
  if (daysLeft <= 0) return { kind: "checkExam" };
  const minutes = Math.ceil(remaining / daysLeft / 10) * 10;
  return { kind: "ok", minutes, daysLeft, tooMuch: minutes > 240 };
}

/** 分を「1時間30分」の形に（life.ts と共通） */
export { formatMinutes } from "./life";
