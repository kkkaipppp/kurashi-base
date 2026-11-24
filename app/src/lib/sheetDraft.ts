/**
 * 入力の書きかけ（下書き）を、端末の中の別のキーに一時保存する（100点化の指示 B）。
 * 記録の保存の形（kurashi-base:data:v1）は変えない。アプリを閉じても、別の画面へ行っても、
 * 次に同じ入力を開いたときに「続きから」か「捨てる」を選べる。保存がうまくいったら消す。
 * 「すべて削除」はキーの頭（kurashi-base:）でまとめて消すので、下書きも一緒に消える。
 */
export const SHEET_DRAFT_KEY = "kurashi-base:sheet-draft:v1";

export type DraftKind = "tx" | "event";

export interface SheetDraft<T> {
  kind: DraftKind;
  /** 新しい入力は null、編集は記録の ID（新規と編集を取り違えない） */
  targetId: string | null;
  draft: T;
  savedAt: string;
}

type KV = Pick<Storage, "getItem" | "setItem" | "removeItem">;
const local = (): KV | null => {
  try {
    return typeof localStorage === "undefined" ? null : localStorage;
  } catch {
    return null;
  }
};

/** 書きかけを1つだけ控える（新しく書けば前のものは上書き）。書けなかったら false */
export function saveSheetDraft<T>(kind: DraftKind, targetId: string | null, draft: T, now = new Date(), kv: KV | null = local()): boolean {
  if (!kv) return false;
  try {
    const v: SheetDraft<T> = { kind, targetId, draft, savedAt: now.toISOString() };
    kv.setItem(SHEET_DRAFT_KEY, JSON.stringify(v));
    return true;
  } catch {
    return false;
  }
}

/** この入力（種類と対象）の書きかけがあれば返す。壊れていたら捨てる */
export function loadSheetDraft<T>(kind: DraftKind, targetId: string | null, kv: KV | null = local()): SheetDraft<T> | null {
  if (!kv) return null;
  try {
    const raw = kv.getItem(SHEET_DRAFT_KEY);
    if (!raw) return null;
    const v = JSON.parse(raw) as SheetDraft<T>;
    if (!v || typeof v !== "object" || !v.draft || typeof v.savedAt !== "string") {
      kv.removeItem(SHEET_DRAFT_KEY);
      return null;
    }
    return v.kind === kind && (v.targetId ?? null) === targetId ? v : null;
  } catch {
    try {
      kv.removeItem(SHEET_DRAFT_KEY);
    } catch {
      /* 何もしない */
    }
    return null;
  }
}

export function clearSheetDraft(kind: DraftKind, targetId: string | null, kv: KV | null = local()): void {
  if (!kv) return;
  try {
    // 別の入力の下書きは消さない
    if (loadSheetDraft(kind, targetId, kv)) kv.removeItem(SHEET_DRAFT_KEY);
  } catch {
    /* 何もしない */
  }
}

/** 「11/24 21:05 の書きかけ」 */
export function draftTimeLabel(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "前回";
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getMonth() + 1}/${d.getDate()} ${p(d.getHours())}:${p(d.getMinutes())}`;
}
