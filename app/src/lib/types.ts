// 暮らしベース データモデル（schemaVersion 2。v1 からは schema.ts の migrate で移行）
// 日付は端末ローカルの "YYYY-MM-DD"、時刻は "HH:mm" の文字列で持つ（UTC変換しない）。
// 金額は日本円の整数（最小単位=1円）。収支の区別は type で行い、amount は常に正の整数。

export type TxType = "expense" | "income";
export type TxSource = "manual" | "image" | "recurring";

export interface Transaction {
  id: string;
  type: TxType;
  date: string; // YYYY-MM-DD
  amount: number; // 正の整数（円）
  currency: "JPY";
  categoryId: string;
  merchant: string;
  paymentMethod: string; // "" = 未指定
  note: string;
  source: TxSource;
  sourceFingerprint?: string; // 画像取込時の画像指紋
  recurringId?: string; // 固定費から記録した場合
  createdAt: string; // ISO
  updatedAt: string; // ISO
}

export interface CalendarEvent {
  id: string;
  title: string;
  startDate: string; // YYYY-MM-DD
  endDate: string; // YYYY-MM-DD（startDate 以上）
  allDay: boolean;
  startTime: string; // HH:mm（終日なら ""）
  endTime: string; // HH:mm（終日なら ""）
  note: string;
  /** v2 で追加（任意）。繰り返しは1日の予定だけ。未指定は繰り返しなし */
  repeat?: EventRepeat;
  repeatUntil?: string; // 繰り返しの終了日（"" = 終わりなし）
  createdAt: string;
  updatedAt: string;
}

export type EventRepeat = "none" | "weekly" | "monthly" | "yearly";

export interface Category {
  id: string;
  name: string;
  kind: TxType;
  order: number;
  archived: boolean;
}

export type RecurringCycle = "weekly" | "monthly" | "yearly";

export interface RecurringExpense {
  id: string;
  name: string;
  amount: number;
  cycle: RecurringCycle;
  anchorDay: number; // 1..31 支払日（月末を超える場合は月末日）。毎週の場合は使わない
  nextDueDate: string; // YYYY-MM-DD
  categoryId: string;
  paymentMethod: string;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface HomePrefs {
  todaySpent: boolean;
  nextRecurring: boolean;
  needsReview: boolean;
}

// --- v2 で追加 ---

export type NisaFrame = "tsumitate" | "growth";

/** NISA の買付・売却の記録。sell の amount は売却した分の「簿価（買付時の金額）」 */
export interface NisaEntry {
  id: string;
  date: string;
  kind: "buy" | "sell";
  frame: NisaFrame;
  amount: number;
  name: string; // 銘柄（任意）
  note: string;
  createdAt: string;
  updatedAt: string;
}

/** 生活記録・メモ。date があれば日付別の記録として扱う */
export interface Note {
  id: string;
  title: string;
  body: string;
  date: string; // "" = 日付なし
  pinned: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface Task {
  id: string;
  title: string;
  due: string; // 期限（"" = なし）
  done: boolean;
  note: string;
  createdAt: string;
  updatedAt: string;
}

export type AssetKind = "cash" | "investment" | "nisa" | "pension" | "insurance" | "property" | "other";

export interface Asset {
  id: string;
  name: string;
  kind: AssetKind;
  value: number | null; // 評価額（円）。null = 未入力
  asOf: string; // 評価日（"" = 未入力）
  note: string;
  createdAt: string;
  updatedAt: string;
}

export interface Contract {
  id: string;
  name: string;
  provider: string;
  amount: number | null; // 1回あたりの支払額
  cycle: "monthly" | "yearly" | "none";
  renewalDate: string; // 更新日（"" = 未入力）
  status: "active" | "cancelled";
  note: string;
  createdAt: string;
  updatedAt: string;
}

export interface HealthRecord {
  id: string;
  date: string;
  item: string; // 体重・血圧・睡眠など
  value: number | null;
  unit: string;
  note: string;
  createdAt: string;
  updatedAt: string;
}

export interface LifeDocument {
  id: string;
  title: string;
  category: string;
  expiry: string; // 期限（"" = なし）
  place: string; // 保管場所（ファイル本体は保存しない）
  note: string;
  createdAt: string;
  updatedAt: string;
}

export interface StudySubject {
  id: string;
  name: string;
  examDate: string; // "" = 未定
  targetHours: number | null;
  archived: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface StudyLog {
  id: string;
  subjectId: string;
  date: string;
  minutes: number; // 1..1440
  note: string;
  createdAt: string;
  updatedAt: string;
}

export interface Goal {
  id: string;
  title: string;
  deadline: string; // "" = 期限なし
  kind: "number" | "check";
  target: number | null;
  current: number;
  unit: string;
  done: boolean;
  note: string;
  createdAt: string;
  updatedAt: string;
}

/** v2 で追加した一覧（汎用の追加・編集・削除で扱う） */
export interface Collections {
  nisa: NisaEntry[];
  notes: Note[];
  tasks: Task[];
  assets: Asset[];
  contracts: Contract[];
  health: HealthRecord[];
  documents: LifeDocument[];
  studySubjects: StudySubject[];
  studyLogs: StudyLog[];
  goals: Goal[];
}

export type CollectionKey = keyof Collections;
export type ItemOf<K extends CollectionKey> = Collections[K][number];
export const COLLECTION_KEYS: CollectionKey[] = ["nisa", "notes", "tasks", "assets", "contracts", "health", "documents", "studySubjects", "studyLogs", "goals"];

export interface AppData extends Collections {
  schemaVersion: 2;
  transactions: Transaction[];
  events: CalendarEvent[];
  categories: Category[];
  recurring: RecurringExpense[];
  budget: { monthly: number | null }; // 毎月の支出予算（円）。null = 未設定
  prefs: { home: HomePrefs };
  meta: { createdAt: string; lastBackupAt: string | null };
}

export const PAYMENT_METHODS: { id: string; label: string }[] = [
  { id: "", label: "指定なし" },
  { id: "cash", label: "現金" },
  { id: "card", label: "クレジットカード" },
  { id: "qr", label: "QRコード決済" },
  { id: "emoney", label: "電子マネー" },
  { id: "bank", label: "口座振替・振込" },
  { id: "other", label: "その他" },
];

export function paymentLabel(id: string): string {
  return PAYMENT_METHODS.find((p) => p.id === id)?.label ?? "その他";
}
