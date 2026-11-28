import { isPractice } from "./practiceFlag";
/**
 * 入力の書きかけ（下書き）を、端末の中の別のキーに一時保存する（100点化の指示 B）。
 * 記録の保存の形（kurashi-base:data:v1）は変えない。アプリを閉じても、別の画面へ行っても、
 * 次に同じ入力を開いたときに「続きから」か「捨てる」を選べる。保存がうまくいったら消す。
 * - 入力ごと（支出・収入／予定 × 新しい入力／どの記録の編集か）に別のキーに置く。
 *   ほかの入力を始めても、前の書きかけは上書きされない（点検役の指摘）
 * - 編集の書きかけには、開いたときの元の記録（base）も控える。続きからのときに今の記録と比べ、
 *   違っていたら知らせる（そのあとに復元や別の画面で変わった記録を、古い書きかけで上書きしない）
 * - 「すべて削除」はキーの頭（kurashi-base:）でまとめて消すので、書きかけも一緒に消える
 */
export const SHEET_DRAFT_KEY = "kurashi-base:sheet-draft:v1";

export type DraftKind = "tx" | "event";

export interface SheetDraft<T> {
  kind: DraftKind;
  /** 新しい入力は null、編集は記録の ID（新規と編集を取り違えない） */
  targetId: string | null;
  draft: T;
  savedAt: string;
  /** 編集のとき、書き始めたときの元の記録（JSON） */
  base?: string;
}

type KV = Pick<Storage, "getItem" | "setItem" | "removeItem">;
const local = (): KV | null => {
  try {
    // 練習中（自分用。決定 Q34 ①）は書きかけを控えない（本当の記録の書きかけと混ぜない）
    if (isPractice()) return null;
    return typeof localStorage === "undefined" ? null : localStorage;
  } catch {
    return null;
  }
};

/** 入力ごとのキー。例：kurashi-base:sheet-draft:v1:tx:new、kurashi-base:sheet-draft:v1:event:ev_abc */
export function sheetDraftKey(kind: DraftKind, targetId: string | null): string {
  return `${SHEET_DRAFT_KEY}:${kind}:${targetId ?? "new"}`;
}

/** 書きかけを控える（同じ入力の前の書きかけだけを上書き）。書けなかったら false */
export function saveSheetDraft<T>(kind: DraftKind, targetId: string | null, draft: T, now = new Date(), kv: KV | null = local(), base?: string): boolean {
  if (!kv) return false;
  try {
    const v: SheetDraft<T> = { kind, targetId, draft, savedAt: now.toISOString(), ...(base !== undefined ? { base } : {}) };
    kv.setItem(sheetDraftKey(kind, targetId), JSON.stringify(v));
    return true;
  } catch {
    return false;
  }
}

const parse = <T>(raw: string | null): SheetDraft<T> | null => {
  if (!raw) return null;
  try {
    const v = JSON.parse(raw) as SheetDraft<T>;
    return v && typeof v === "object" && v.draft && typeof v.savedAt === "string" ? v : null;
  } catch {
    return null;
  }
};

/** この入力（種類と対象）の書きかけがあれば返す。壊れていたら捨てる */
export function loadSheetDraft<T>(kind: DraftKind, targetId: string | null, kv: KV | null = local()): SheetDraft<T> | null {
  if (!kv) return null;
  const key = sheetDraftKey(kind, targetId);
  try {
    const raw = kv.getItem(key);
    const v = parse<T>(raw);
    if (raw && !v) kv.removeItem(key);
    if (v && v.kind === kind && (v.targetId ?? null) === targetId) return v;
    // 前の版（キーが1つだけ）の書きかけが、この入力のものなら引き継ぐ
    const legacyRaw = kv.getItem(SHEET_DRAFT_KEY);
    if (!legacyRaw) return null;
    const old = parse<T>(legacyRaw);
    if (!old) {
      kv.removeItem(SHEET_DRAFT_KEY);
      return null;
    }
    if (old.kind !== kind || (old.targetId ?? null) !== targetId) return null;
    kv.setItem(key, legacyRaw);
    kv.removeItem(SHEET_DRAFT_KEY);
    return old;
  } catch {
    return null;
  }
}

export function clearSheetDraft(kind: DraftKind, targetId: string | null, kv: KV | null = local()): void {
  if (!kv) return;
  try {
    kv.removeItem(sheetDraftKey(kind, targetId));
    const old = parse<unknown>(kv.getItem(SHEET_DRAFT_KEY));
    if (old && old.kind === kind && (old.targetId ?? null) === targetId) kv.removeItem(SHEET_DRAFT_KEY);
  } catch {
    /* 何もしない */
  }
}

/** 編集の書きかけを、新しい入力の書きかけへ移す（編集元の記録が消えていたとき。本人が選んだときだけ） */
export function moveSheetDraftToNew(kind: DraftKind, targetId: string, kv: KV | null = local()): "ok" | "busy" | "failed" {
  const d = loadSheetDraft<unknown>(kind, targetId, kv);
  if (!d || !kv) return "failed";
  // 新しい入力に別の書きかけがあれば、上書きしない
  if (loadSheetDraft<unknown>(kind, null, kv)) return "busy";
  if (!saveSheetDraft(kind, null, d.draft, new Date(d.savedAt), kv)) return "failed";
  clearSheetDraft(kind, targetId, kv);
  return "ok";
}

/** 「11/24 21:05 の書きかけ」 */
export function draftTimeLabel(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "前回";
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getMonth() + 1}/${d.getDate()} ${p(d.getHours())}:${p(d.getMinutes())}`;
}
