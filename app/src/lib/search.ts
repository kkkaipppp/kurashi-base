import { formatDateJa } from "./date";
import { formatYen } from "./money";
import type { AppData } from "./types";

/**
 * 横断検索（NEXT v21 Phase 2）。端末の中の記録だけを、その場で探す（外へは送らない）。
 * 記録・予定・固定費・旅行・タスク・メモ・契約・書類・資産・健康・目標・資格・NISA を、1つの言葉で探す。
 * - 全角・半角・大文字小文字をそろえ、空白で区切った言葉は「全部含む」（AND）
 * - 数字だけ（「1200」「¥1,200」）は、金額が同じものも探す
 * - 結果は種類ごとに、新しい・近いものから。多すぎるときは件数を数えて、上位だけ返す
 */
export type SearchKind = "tx" | "event" | "recurring" | "trip" | "plan" | "task" | "note" | "contract" | "document" | "asset" | "health" | "goal" | "study" | "nisa";

export const KIND_LABEL: Record<SearchKind, string> = {
  tx: "支出・収入",
  event: "予定",
  recurring: "固定費",
  trip: "旅行",
  plan: "計画",
  task: "やること",
  note: "メモ",
  contract: "契約",
  document: "書類",
  asset: "資産",
  health: "健康",
  goal: "目標",
  study: "資格",
  nisa: "NISA",
};

export interface SearchHit {
  kind: SearchKind;
  id: string;
  title: string;
  sub: string;
  /** 並べ替え用の日付（なければ ""） */
  date: string;
  href?: string;
}

export interface SearchGroup {
  kind: SearchKind;
  label: string;
  total: number;
  hits: SearchHit[];
}

export const SEARCH_PER_KIND = 8;
// 比べるときだけ、全角・半角（NFKC）・大文字小文字・ひらがなとカタカナをそろえる。表示と記録は原文のまま（o29 T027、2026-11-27）
const norm = (s: string) => s.normalize("NFKC").toLowerCase().replace(/[ぁ-ゖ]/g, (c) => String.fromCharCode(c.charCodeAt(0) + 0x60));

/** 検索語を、言葉（AND）と金額（あれば）に分ける */
export function parseQuery(q: string): { words: string[]; amount: number | null } {
  const n = norm(q).trim();
  const words = n.split(/[\s　]+/).filter(Boolean);
  const digits = n.replace(/[¥￥円,\s]/g, "");
  const amount = /^\d{1,12}$/.test(digits) ? Number(digits) : null;
  return { words, amount };
}

/** 種類で絞り込む（kind が空ならすべて）。件数の表示は、絞り込んだあとの種類だけ */
export function filterGroups(groups: SearchGroup[], kind: string): SearchGroup[] {
  return kind ? groups.filter((g) => g.kind === kind) : groups;
}

export function searchAll(data: AppData, q: string, perKind: number = SEARCH_PER_KIND): SearchGroup[] {
  const { words, amount } = parseQuery(q);
  if (words.length === 0) return [];
  const catName = (id: string) => data.categories.find((c) => c.id === id)?.name ?? "";
  const match = (fields: (string | undefined)[], amt?: number | null) => {
    const hay = norm(fields.filter(Boolean).join(" "));
    if (words.every((w) => hay.includes(w))) return true;
    return amount !== null && words.length === 1 && amt === amount;
  };
  const out = new Map<SearchKind, SearchHit[]>();
  const add = (h: SearchHit) => out.set(h.kind, [...(out.get(h.kind) ?? []), h]);

  for (const t of data.transactions)
    if (match([t.merchant, t.note, catName(t.categoryId)], t.amount))
      add({ kind: "tx", id: t.id, title: `${t.merchant || catName(t.categoryId) || "（名前なし）"}`, sub: `${formatDateJa(t.date, true)}・${t.type === "expense" ? "支出" : "収入"} ${formatYen(t.amount)}・${catName(t.categoryId)}`, date: t.date });
  for (const e of data.events)
    if (match([e.title, e.location, e.note]))
      add({ kind: "event", id: e.id, title: e.title || "（名前なし）", sub: `${formatDateJa(e.startDate, true)}${e.location ? `・${e.location}` : ""}`, date: e.startDate });
  for (const r of data.recurring) if (match([r.name], r.amount)) add({ kind: "recurring", id: r.id, title: r.name, sub: `${formatYen(r.amount)}・次は${formatDateJa(r.nextDueDate)}`, date: r.nextDueDate, href: `/recurring?open=${r.id}` });
  for (const t of data.trips ?? []) if (match([t.title, t.destination, t.note])) add({ kind: "trip", id: t.id, title: t.title, sub: `${formatDateJa(t.startDate, true)}〜${t.destination ? `・${t.destination}` : ""}`, date: t.startDate, href: `/trips?open=${t.id}` });
  // 計画は自分用だけ（To-Be 2026-11-27）。公開版には計画の画面が無いので出さない
  // 環境の値を直接比べる（組み立てのときに決まり、公開版ではこの処理ごと消える。点検 L1）
  if (process.env.NEXT_PUBLIC_KB_EDITION === "personal") for (const p of data.plans ?? []) if (match([p.title, p.note, ...(p.candidates ?? []).map((c) => c.label)])) add({ kind: "plan", id: p.id, title: p.title, sub: p.date ? formatDateJa(p.date, true) : "日程未定", date: p.date, href: `/plans?open=${p.id}` });
  for (const t of data.tasks) if (match([t.title, t.note])) add({ kind: "task", id: t.id, title: t.title, sub: t.done ? "完了" : t.due ? `期限 ${formatDateJa(t.due, true)}` : "期限なし", date: t.due, href: `/tasks?open=${t.id}` });
  for (const n of data.notes) if (match([n.title, n.body])) add({ kind: "note", id: n.id, title: n.title || "（タイトルなし）", sub: n.date ? formatDateJa(n.date, true) : "", date: n.date, href: `/notes?open=${n.id}` });
  for (const c of data.contracts) if (match([c.name, c.provider, c.note], c.amount ?? undefined)) add({ kind: "contract", id: c.id, title: c.name, sub: `${c.provider}${c.renewalDate ? `・更新 ${formatDateJa(c.renewalDate, true)}` : ""}`, date: c.renewalDate, href: `/contracts?open=${c.id}` });
  for (const d of data.documents) if (match([d.title, d.category, d.place, d.note])) add({ kind: "document", id: d.id, title: d.title, sub: `${d.category}${d.expiry ? `・期限 ${formatDateJa(d.expiry, true)}` : ""}`, date: d.expiry, href: `/documents?open=${d.id}` });
  for (const a of data.assets) if (match([a.name, a.note], a.value ?? undefined)) add({ kind: "asset", id: a.id, title: a.name, sub: a.value != null ? formatYen(a.value) : "", date: a.asOf, href: `/assets?open=${a.id}` });
  for (const h of data.health) if (match([h.item, h.note])) add({ kind: "health", id: h.id, title: h.item, sub: `${formatDateJa(h.date, true)}${h.value != null ? `・${h.value}${h.unit}` : ""}`, date: h.date, href: `/health?open=${h.id}` });
  for (const g of data.goals) if (match([g.title, g.note])) add({ kind: "goal", id: g.id, title: g.title, sub: g.done ? "達成" : g.deadline ? `期限 ${formatDateJa(g.deadline, true)}` : "", date: g.deadline, href: `/goals?open=${g.id}` });
  for (const s of data.studySubjects) if (match([s.name])) add({ kind: "study", id: s.id, title: s.name, sub: s.examDate ? `試験 ${formatDateJa(s.examDate, true)}` : "", date: s.examDate, href: `/study?open=${s.id}` });
  for (const n of data.nisa) if (match([n.name, n.note], n.amount)) add({ kind: "nisa", id: n.id, title: n.name || "NISA", sub: `${formatDateJa(n.date, true)}・${n.kind === "buy" ? "買付" : "売却"} ${formatYen(n.amount)}`, date: n.date, href: "/nisa" });

  return (Object.keys(KIND_LABEL) as SearchKind[])
    .filter((k) => out.has(k))
    .map((kind) => {
      const all = (out.get(kind) ?? []).sort((a, b) => (b.date || "").localeCompare(a.date || ""));
      return { kind, label: KIND_LABEL[kind], total: all.length, hits: all.slice(0, perKind) };
    });
}
