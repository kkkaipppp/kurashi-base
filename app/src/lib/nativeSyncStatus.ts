/**
 * iPhone アプリへの受け渡し（ウィジェット・カレンダー・通知・自動バックアップ）の、最後の結果（o11 A07 点検 中-3）。
 * 受け渡しに失敗しても記録の保存には影響しないが、黙っていると、古い写し（消した予定の通知など）が残っていることに気づけない。
 * 端末の中の別のキーに置くだけで、記録（AppData）にもバックアップにも入れない。外へは送らない
 */
export type SyncKind = "summary" | "calendar" | "reminders" | "backup";
export interface SyncState {
  at: string; // ISO
  ok: boolean;
  detail?: string;
}
export type SyncStatus = Partial<Record<SyncKind, SyncState>>;

export const NATIVE_SYNC_KEY = "kurashi-base:native-sync:v1";
/** 結果が変わったときに出す合図 */
export const SYNC_EVENT = "kb-native-sync";
export const SYNC_LABELS: Record<SyncKind, string> = {
  summary: "ウィジェット",
  calendar: "カレンダー",
  reminders: "通知",
  backup: "自動バックアップ",
};

type KVLike = { getItem(k: string): string | null; setItem(k: string, v: string): void };
const local = (): KVLike | null => {
  try {
    return typeof localStorage === "undefined" ? null : localStorage;
  } catch {
    return null;
  }
};

export function loadSyncStatus(kv: KVLike | null = local()): SyncStatus {
  try {
    const v = JSON.parse(kv?.getItem(NATIVE_SYNC_KEY) ?? "{}");
    if (!v || typeof v !== "object") return {};
    const out: SyncStatus = {};
    for (const k of Object.keys(SYNC_LABELS) as SyncKind[]) {
      const s = v[k];
      if (s && typeof s.at === "string" && typeof s.ok === "boolean") out[k] = { at: s.at, ok: s.ok, ...(typeof s.detail === "string" ? { detail: s.detail } : {}) };
    }
    return out;
  } catch {
    return {};
  }
}

/** 結果を残す。同じ結果が続くときは書かない（成功のたびに書き込まないため、時刻は最初の成功のまま） */
export function recordSync(kind: SyncKind, ok: boolean, detail?: string, kv: KVLike | null = local(), at: string = new Date().toISOString()): void {
  if (!kv) return;
  try {
    const cur = loadSyncStatus(kv);
    const prev = cur[kind];
    if (prev && prev.ok === ok && prev.detail === detail && ok) return;
    cur[kind] = { at, ok, ...(detail ? { detail } : {}) };
    kv.setItem(NATIVE_SYNC_KEY, JSON.stringify(cur));
    // 設定の「iPhone の連携」が開いていれば、すぐに出し直す（点検2回目 低-7）
    if (typeof window !== "undefined") window.dispatchEvent(new Event(SYNC_EVENT));
  } catch {
    /* 結果を残せなくても、記録には影響しない */
  }
}

/** 失敗している受け渡しの一覧（設定の「iPhone の連携」に出す） */
export function syncProblems(s: SyncStatus): { kind: SyncKind; label: string; at: string; detail: string }[] {
  return (Object.keys(SYNC_LABELS) as SyncKind[])
    .filter((k) => s[k] && !s[k]!.ok)
    .map((k) => ({ kind: k, label: SYNC_LABELS[k], at: s[k]!.at, detail: s[k]!.detail ?? "うまく渡せませんでした" }));
}

/** アプリの部品の失敗（reject）を、短い説明にする */
export function errorText(e: unknown): string {
  const m = e instanceof Error ? e.message : typeof e === "string" ? e : "";
  return m ? m.slice(0, 120) : "うまく渡せませんでした";
}
