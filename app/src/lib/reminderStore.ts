import { DEFAULT_REMINDERS, cleanReminderSettings, type ReminderSettings } from "./reminders";

/**
 * 通知の設定の保存（端末の中。記録（kurashi-base:data:v1）とは別のキー。「すべて削除」で一緒に消える）。
 * 読めない・書けない端末でも、通知がオフのまま動く。
 */
export const REMINDER_KEY = "kurashi-base:notify:v1";

export function loadReminderSettings(): ReminderSettings {
  try {
    const raw = localStorage.getItem(REMINDER_KEY);
    return raw ? cleanReminderSettings(JSON.parse(raw)) : { ...DEFAULT_REMINDERS };
  } catch {
    return { ...DEFAULT_REMINDERS };
  }
}

export function saveReminderSettings(s: ReminderSettings): boolean {
  try {
    localStorage.setItem(REMINDER_KEY, JSON.stringify(s));
    return true;
  } catch {
    return false;
  }
}
