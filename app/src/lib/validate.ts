import { isValidDateStr, isValidTimeStr } from "./date";
import { parseAmount } from "./money";
import type { Category, TxType } from "./types";

export type FieldErrors = Record<string, string>;

export interface TxDraft {
  type: TxType;
  date: string;
  amount: string; // 入力中の文字列
  categoryId: string;
  merchant: string;
  paymentMethod: string;
  note: string;
}

export function validateTx(
  draft: TxDraft,
  categories: Category[],
): { ok: true; amount: number } | { ok: false; errors: FieldErrors } {
  const errors: FieldErrors = {};
  const amt = parseAmount(draft.amount);
  if (!amt.ok) errors.amount = amt.error;
  if (!isValidDateStr(draft.date)) errors.date = "正しい日付を入力してください";
  const cat = categories.find((c) => c.id === draft.categoryId);
  if (!cat) errors.categoryId = "カテゴリを選んでください";
  else if (cat.kind !== draft.type) errors.categoryId = "種別に合うカテゴリを選んでください";
  if (draft.merchant.length > 100) errors.merchant = "店名・相手先は100文字以内にしてください";
  if (draft.note.length > 500) errors.note = "メモは500文字以内にしてください";
  if (Object.keys(errors).length > 0 || !amt.ok) return { ok: false, errors };
  return { ok: true, amount: amt.value };
}

export interface EventDraft {
  title: string;
  startDate: string;
  endDate: string;
  allDay: boolean;
  startTime: string;
  endTime: string;
  note: string;
}

export function validateEvent(draft: EventDraft): { ok: true } | { ok: false; errors: FieldErrors } {
  const errors: FieldErrors = {};
  if (draft.title.trim() === "") errors.title = "タイトルを入力してください";
  else if (draft.title.length > 100) errors.title = "タイトルは100文字以内にしてください";
  if (!isValidDateStr(draft.startDate)) errors.startDate = "正しい開始日を入力してください";
  if (!isValidDateStr(draft.endDate)) errors.endDate = "正しい終了日を入力してください";
  if (!draft.allDay) {
    if (!isValidTimeStr(draft.startTime)) errors.startTime = "開始時刻を入力してください";
    if (!isValidTimeStr(draft.endTime)) errors.endTime = "終了時刻を入力してください";
  }
  if (!errors.startDate && !errors.endDate) {
    const s = draft.allDay ? draft.startDate : `${draft.startDate}T${draft.startTime}`;
    const e = draft.allDay ? draft.endDate : `${draft.endDate}T${draft.endTime}`;
    if (!errors.startTime && !errors.endTime && e < s) errors.endDate = "終了は開始より後にしてください";
  }
  if (draft.note.length > 500) errors.note = "メモは500文字以内にしてください";
  return Object.keys(errors).length ? { ok: false, errors } : { ok: true };
}
