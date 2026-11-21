"use client";

import { useMemo, useRef, useState } from "react";
import { Sheet } from "./Sheet";
import { Button, Field, inputCls } from "./ui";
import { useUI } from "./UIContext";
import { useData, useStore } from "@/lib/store";
import { validateEvent, type EventDraft, type FieldErrors } from "@/lib/validate";
import { formatDateJa, todayStr } from "@/lib/date";

export type EventSheetRequest = { mode: "edit"; id: string } | { mode: "new"; date?: string };

export function EventSheet({ req, onClose }: { req: EventSheetRequest; onClose: () => void }) {
  const data = useData();
  const store = useStore();
  const ui = useUI();
  const editing = req.mode === "edit" ? data.events.find((e) => e.id === req.id) : undefined;

  const initial = useMemo<EventDraft>(() => {
    if (editing) {
      const { title, startDate, endDate, allDay, startTime, endTime, note } = editing;
      return { title, startDate, endDate, allDay, startTime, endTime, note };
    }
    const d = req.mode === "new" && req.date ? req.date : todayStr();
    return { title: "", startDate: d, endDate: d, allDay: false, startTime: "10:00", endTime: "11:00", note: "" };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const [draft, setDraft] = useState<EventDraft>(initial);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [saveError, setSaveError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  const saved = useRef(false);
  const dirty = JSON.stringify(draft) !== JSON.stringify(initial);

  const set = <K extends keyof EventDraft>(k: K, v: EventDraft[K]) => {
    setDraft((d) => {
      const n = { ...d, [k]: v };
      // 開始日を終了日より後にしたら終了日を合わせる
      if (k === "startDate" && typeof v === "string" && n.endDate < v) n.endDate = v;
      return n;
    });
    if (errors[k as string]) setErrors((e) => ({ ...e, [k]: "" }));
  };

  const requestClose = async () => {
    if (busy) return;
    if (dirty && !(await ui.confirm({ title: "入力内容を破棄しますか？", body: "保存していない変更は失われます。", ok: "破棄する", danger: true })))
      return;
    onClose();
  };

  const save = () => {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setSaveError(null);
    try {
      const v = validateEvent(draft);
      if (!v.ok) {
        setErrors(v.errors);
        return;
      }
      const input = {
        ...draft,
        title: draft.title.trim(),
        note: draft.note.trim(),
        startTime: draft.allDay ? "" : draft.startTime,
        endTime: draft.allDay ? "" : draft.endTime,
      };
      const r = editing ? store.updateEvent(editing.id, input) : store.addEvent(input);
      if (!r.ok) {
        setSaveError(r.error);
        return;
      }
      saved.current = true;
      ui.toast(editing ? "予定を更新しました" : "予定を追加しました");
      onClose();
    } finally {
      if (!saved.current) {
        lock.current = false;
        setBusy(false);
      }
    }
  };

  const remove = async () => {
    if (!editing) return;
    const ok = await ui.confirm({
      title: "この予定を削除しますか？",
      body: `${formatDateJa(editing.startDate)} ${editing.title}\n削除すると元に戻せません。`,
      ok: "削除する",
      danger: true,
    });
    if (!ok) return;
    const r = store.deleteEvent(editing.id);
    if (!r.ok) return ui.toast(r.error, "error");
    ui.toast("予定を削除しました");
    onClose();
  };

  if (req.mode === "edit" && !editing) {
    return (
      <Sheet title="予定" open onRequestClose={onClose}>
        <p className="text-ink-2">この予定は見つかりません（削除された可能性があります）。</p>
      </Sheet>
    );
  }

  return (
    <Sheet
      title={editing ? "予定を編集" : "予定を追加"}
      open
      onRequestClose={requestClose}
      footer={
        <div className="flex gap-2">
          {editing && (
            <Button variant="danger" onClick={remove} disabled={busy}>
              削除
            </Button>
          )}
          <Button className="flex-1" onClick={save} disabled={busy} aria-busy={busy}>
            {busy ? "保存中…" : "保存する"}
          </Button>
        </div>
      }
    >
      <form
        className="space-y-4"
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          save();
        }}
      >
        <Field label="タイトル" htmlFor="ev-title" error={errors.title}>
          <input
            id="ev-title"
            value={draft.title}
            onChange={(e) => set("title", e.target.value)}
            aria-invalid={!!errors.title}
            placeholder="例：友人と食事"
            className={inputCls}
            maxLength={100}
          />
        </Field>

        <label className="flex min-h-11 items-center justify-between rounded-xl border border-line bg-surface px-3">
          <span className="text-[15px] font-medium">終日</span>
          <input type="checkbox" checked={draft.allDay} onChange={(e) => set("allDay", e.target.checked)} className="size-5 accent-[var(--brand)]" />
        </label>

        <div className="grid grid-cols-2 gap-3">
          <Field label="開始日" htmlFor="ev-sd" error={errors.startDate}>
            <input id="ev-sd" type="date" value={draft.startDate} onChange={(e) => set("startDate", e.target.value)} aria-invalid={!!errors.startDate} className={inputCls} />
          </Field>
          {!draft.allDay ? (
            <Field label="開始時刻" htmlFor="ev-st" error={errors.startTime}>
              <input id="ev-st" type="time" value={draft.startTime} onChange={(e) => set("startTime", e.target.value)} aria-invalid={!!errors.startTime} className={inputCls} />
            </Field>
          ) : (
            <div />
          )}
          <Field label="終了日" htmlFor="ev-ed" error={errors.endDate}>
            <input id="ev-ed" type="date" value={draft.endDate} onChange={(e) => set("endDate", e.target.value)} aria-invalid={!!errors.endDate} className={inputCls} />
          </Field>
          {!draft.allDay && (
            <Field label="終了時刻" htmlFor="ev-et" error={errors.endTime}>
              <input id="ev-et" type="time" value={draft.endTime} onChange={(e) => set("endTime", e.target.value)} aria-invalid={!!errors.endTime} className={inputCls} />
            </Field>
          )}
        </div>

        <Field label="メモ（任意）" htmlFor="ev-note" error={errors.note}>
          <textarea id="ev-note" rows={2} value={draft.note} onChange={(e) => set("note", e.target.value)} className={inputCls} maxLength={500} />
        </Field>
        <p className="text-[12px] text-ink-3">繰り返し予定には、まだ対応していません。</p>

        {saveError && (
          <p role="alert" className="rounded-xl bg-expense-soft px-3 py-2 text-[14px] font-medium text-danger">
            保存できませんでした：{saveError}（入力内容は残っています）
          </p>
        )}
        <button type="submit" hidden aria-hidden="true" tabIndex={-1} />
      </form>
    </Sheet>
  );
}
