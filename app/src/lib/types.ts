// 暮らしベース データモデル（schemaVersion 1）
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
  createdAt: string;
  updatedAt: string;
}

export interface Category {
  id: string;
  name: string;
  kind: TxType;
  order: number;
  archived: boolean;
}

export type RecurringCycle = "monthly" | "yearly";

export interface RecurringExpense {
  id: string;
  name: string;
  amount: number;
  cycle: RecurringCycle;
  anchorDay: number; // 1..31 支払日（月末を超える場合は月末日）
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

export interface AppData {
  schemaVersion: 1;
  transactions: Transaction[];
  events: CalendarEvent[];
  categories: Category[];
  recurring: RecurringExpense[];
  budget: { monthly: number | null }; // 毎月の支出予算（円）。null = 未設定
  prefs: { home: HomePrefs };
  meta: { createdAt: string; lastBackupAt: string | null };
}

export const PAYMENT_METHODS: { id: string; label: string }[] = [
  { id: "", label: "未指定" },
  { id: "cash", label: "現金" },
  { id: "card", label: "クレジットカード" },
  { id: "qr", label: "QR・スマホ決済" },
  { id: "emoney", label: "電子マネー" },
  { id: "bank", label: "口座振替・振込" },
  { id: "other", label: "その他" },
];

export function paymentLabel(id: string): string {
  return PAYMENT_METHODS.find((p) => p.id === id)?.label ?? "その他";
}
