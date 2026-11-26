"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { Sheet } from "./Sheet";
import { Button, Field, focusFirstInvalid, inputCls } from "./ui";
import { useUI } from "./UIContext";
import { eventTimeLabel } from "./Rows";
import { useData, useStore } from "@/lib/store";
import { validateEvent, type EventDraft, type FieldErrors } from "@/lib/validate";
import { formatDateJa, todayStr } from "@/lib/date";
import { formatYen } from "@/lib/money";
import { clearSheetDraft, draftTimeLabel, loadSheetDraft, saveSheetDraft } from "@/lib/sheetDraft";
import { OrphanDraft } from "./OrphanDraft";
import { newId } from "@/lib/defaults";
import { IS_PERSONAL } from "@/lib/edition";
import { eventExpenseStart, similarExpenseOn } from "@/lib/eventExpense";
import { departureTime } from "@/lib/eventOps";
import { EventActions } from "./EventActions";
import { calendarTemplate, isSavableUrl, mapsDirections, safeExternalLink } from "@/lib/externalLinks";
import { EVENT_KINDS, type CalendarEvent, type CheckItem, type EventKind } from "@/lib/types";

export type EventSheetRequest =
  | { mode: "view"; id: string; /** どの日の回を見ているか（繰り返しの予定の完了に使う） */ day?: string } // 予定の詳細（押したときに開く）
  | { mode: "edit"; id: string }
  | { mode: "new"; date?: string; tripId?: string; /** 複製：この予定の内容を引き継いで新しい予定にする（完了・実績は引き継がない。NEXT v21 CAL:C05） */ copyOf?: string };

/** 詳細（場所・URL・持ち物など）の入力。予定名と日時だけで保存でき、あとから足せる */
interface Extra {
  location: string;
  url: string;
  items: CheckItem[];
  tripId: string;
  kind: EventKind | "";
  cost: string;
  /** 移動にかかる時間（分）。出発の目安に使う（自分用） */
  travel: string;
  /** 関連する目標（自分用。"" = なし） */
  goalId: string;
}

const extraOf = (e?: CalendarEvent, tripId = ""): Extra => ({
  location: e?.location ?? "",
  url: e?.url ?? "",
  items: e?.items ?? [],
  tripId: e?.tripId ?? tripId,
  kind: e?.kind ?? "",
  cost: e?.cost != null ? String(e.cost) : "",
  travel: e?.travelMinutes ? String(e.travelMinutes) : "",
  goalId: e?.goalId ?? "",
});

const hasExtra = (x: Extra, d: EventDraft) =>
  !!(x.location || x.url || x.items.length || x.tripId || x.kind || x.cost || x.travel || x.goalId || d.note || (d.repeat && d.repeat !== "none"));

export function EventSheet({ req, onClose }: { req: EventSheetRequest; onClose: () => void }) {
  const data = useData();
  const ui = useUI();
  const [mode, setMode] = useState<"view" | "edit" | "new">(req.mode);
  const id = req.mode === "new" ? undefined : req.id;
  const ev = id ? data.events.find((e) => e.id === id) : undefined;
  // 編集中に別タブで削除されてもフォームをアンマウントしない。
  // 初回の記録を保持し、保存時にはストア側の競合検出で拒否する。
  const [originalEvent] = useState<CalendarEvent | undefined>(ev);
  const editingEvent = ev ?? originalEvent;

  // 詳細を見ている間に消されたときは、入力の画面（新規）に化けさせず「見つかりません」を出す
  if (id && (!editingEvent || (mode === "view" && !ev))) {
    return (
      <Sheet title="予定" open onRequestClose={onClose}>
        <p className="text-ink-2">この予定は見つかりません（削除された可能性があります）。</p>
        {id && <OrphanDraft kind="event" id={id} onNew={() => ui.openEvent({ mode: "new" })} onDone={onClose} />}
      </Sheet>
    );
  }
  if (mode === "view" && ev) return <EventDetail ev={ev} day={req.mode === "view" ? req.day : undefined} onClose={onClose} onEdit={() => setMode("edit")} />;
  return <EventForm editing={mode === "edit" ? editingEvent : undefined} req={req} onClose={onClose} />;
}

/* ---------------- 予定の詳細 ---------------- */

function EventDetail({ ev, day, onClose, onEdit }: { ev: CalendarEvent; day?: string; onClose: () => void; onEdit: () => void }) {
  const data = useData();
  const store = useStore();
  const ui = useUI();
  const trip = ev.tripId ? data.trips.find((t) => t.id === ev.tripId) : undefined;
  const directions = ev.location ? mapsDirections(ev.location) : null;
  // メモ（予約番号などが入りうる）とURLは Google に渡さない。予定名・日時・場所だけ
  const gcal = calendarTemplate({ ...ev, location: ev.location });
  const link = ev.url ? safeExternalLink(ev.url) : null;
  const kind = EVENT_KINDS.find((k) => k.id === ev.kind)?.label;
  const goal = ev.goalId ? data.goals.find((g) => g.id === ev.goalId) : undefined;

  const remove = async () => {
    const ok = await ui.confirm({
      title: "この予定を削除しますか？",
      body: `${formatDateJa(ev.startDate)} ${ev.title}\n${ev.repeat && ev.repeat !== "none" ? "繰り返しのすべての日から消えます。" : ""}記録した支出は消えません。削除すると元に戻せません。`,
      ok: "削除する",
      danger: true,
    });
    if (!ok) return;
    const r = await store.deleteEvent(ev.id);
    if (!r.ok) return ui.toast(r.error, "error");
    ui.toast("削除しました");
    onClose();
  };

  const linkBtn = "flex min-h-11 items-center justify-center rounded-xl border border-line bg-surface px-3 text-[14px] font-semibold text-brand hover:bg-brand-soft";

  return (
    <Sheet
      title="予定の詳細"
      open
      onRequestClose={onClose}
      footer={
        <div className="flex gap-2">
          <Button variant="danger" onClick={remove}>
            削除
          </Button>
          {IS_PERSONAL && (
            <Button
              variant="secondary"
              onClick={() => {
                onClose();
                ui.openEvent({ mode: "new", copyOf: ev.id });
              }}
            >
              複製
            </Button>
          )}
          <Button className="flex-1" onClick={onEdit}>
            編集する
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        <div>
          <h3 className="text-[19px] leading-snug font-bold break-words">{ev.title}</h3>
          <p className="mt-1 text-[14px] text-ink-2">
            {formatDateJa(ev.startDate, true)}
            {ev.endDate !== ev.startDate && ` 〜 ${formatDateJa(ev.endDate, true)}`}
            <span className="ml-2">{eventTimeLabel(ev)}</span>
          </p>
          {(trip || kind) && (
            <p className="mt-1 text-[13px] text-ink-3">
              {trip && (
                <Link href={`/trips?open=${trip.id}`} className="font-semibold text-brand" onClick={onClose}>
                  旅行：{trip.title}
                </Link>
              )}
              {trip && kind && "・"}
              {kind}
            </p>
          )}
        </div>

        {ev.location && (
          <div>
            <p className="text-[12px] font-semibold text-ink-3">場所</p>
            <p className="text-[15px] break-words">{ev.location}</p>
          </div>
        )}
        {ev.note && (
          <div>
            <p className="text-[12px] font-semibold text-ink-3">メモ</p>
            <p className="text-[15px] whitespace-pre-wrap break-words">{ev.note}</p>
          </div>
        )}
        {IS_PERSONAL && <EventActions ev={ev} day={day} onClose={onClose} />}
        {goal && (
          <div>
            <p className="text-[12px] font-semibold text-ink-3">目標</p>
            <Link href={`/goals?open=${goal.id}`} className="inline-flex min-h-11 items-center text-[15px] font-semibold text-brand underline">
              {goal.title}
            </Link>
          </div>
        )}
        {ev.travelMinutes ? (
          <div>
            <p className="text-[12px] font-semibold text-ink-3">移動時間</p>
            <p className="num text-[15px]">
              {ev.travelMinutes}分{departureTime(ev) ? `（出発の目安 ${departureTime(ev)}）` : ""}
            </p>
          </div>
        ) : null}
        {ev.cost != null && (
          <div>
            <p className="text-[12px] font-semibold text-ink-3">費用の目安</p>
            <p className="num text-[15px]">{formatYen(ev.cost)}</p>
            {/* A2（自分用）：この額で支出の入力を始める。保存は入力の画面で本人が押す */}
            {IS_PERSONAL && eventExpenseStart(ev, day) && (
              <>
                <button
                  type="button"
                  onClick={() => {
                    const s = eventExpenseStart(ev, day)!;
                    onClose();
                    ui.openTx({ mode: "new", type: "expense", date: s.date, initial: { amount: s.amount, merchant: s.merchant } });
                  }}
                  className="mt-1 inline-flex min-h-11 items-center rounded-lg border border-line px-3 text-[13px] font-semibold text-brand hover:bg-brand-soft"
                >
                  この額で支出を記録する
                </button>
                {similarExpenseOn(data, eventExpenseStart(ev, day)!.date, ev.cost) && (
                  <p className="mt-1 text-[12px] text-ink-3">同じ日に同じ額の支出が、もう記録されています（二重に記録しないよう気をつけてください）。</p>
                )}
              </>
            )}
          </div>
        )}

        {(ev.items?.length ?? 0) > 0 && (
          <div>
            <p className="text-[12px] font-semibold text-ink-3">
              持ち物（{ev.items!.filter((i) => i.done).length}/{ev.items!.length}）
            </p>
            <ul className="mt-1 space-y-1">
              {ev.items!.map((i) => (
                <li key={i.id}>
                  <label className="flex min-h-11 items-center gap-3 rounded-xl px-1">
                    <input
                      type="checkbox"
                      checked={i.done}
                      onChange={async () => {
                        const r = await store.toggleEventItem(ev.id, i.id);
                        if (!r.ok) ui.toast(r.error, "error");
                      }}
                      className="size-5 accent-[var(--brand)]"
                    />
                    <span className={`text-[15px] ${i.done ? "text-ink-3 line-through" : ""}`}>{i.text}</span>
                  </label>
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="grid gap-2">
          {directions && (
            <div>
              <a href={directions} target="_blank" rel="noopener noreferrer" className={linkBtn}>
                行き方を調べる（Googleマップ・電車やバス）
              </a>
              <div className="mt-1 flex justify-center gap-4 text-[13px]">
                <a href={mapsDirections(ev.location!, "driving")!} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center rounded-lg px-3 font-semibold text-brand underline">
                  車で
                </a>
                <a href={mapsDirections(ev.location!, "walking")!} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center rounded-lg px-3 font-semibold text-brand underline">
                  歩いて
                </a>
              </div>
            </div>
          )}
          {link && (
            <a href={link} target="_blank" rel="noopener noreferrer" className={linkBtn}>
              登録したページを開く
            </a>
          )}
          {gcal && (
            <a href={gcal} target="_blank" rel="noopener noreferrer" className={linkBtn}>
              Googleカレンダーで予定を作る
            </a>
          )}
          {gcal && <p className="text-[12px] text-ink-3">Google の画面で「保存」すると登録されます（予定名・日時・場所だけ渡します。連動はしません）。</p>}
        </div>
        {ev.repeat && ev.repeat !== "none" && (
          <p className="text-[12px] text-ink-3">繰り返しの予定です。編集・削除は、繰り返しのすべての日に反映されます（1回分だけの変更には、まだ対応していません）。</p>
        )}
      </div>
    </Sheet>
  );
}

/* ---------------- 予定の追加・編集 ---------------- */

function EventForm({ editing, req, onClose }: { editing?: CalendarEvent; req: EventSheetRequest; onClose: () => void }) {
  const data = useData();
  const store = useStore();
  const ui = useUI();
  const newReq = req.mode === "new" ? req : undefined;
  const trips = data.trips ?? [];
  // 複製のとき：元の予定（内容だけ引き継ぐ。新しい ID で保存される）
  const copySrc = !editing && newReq?.copyOf ? data.events.find((e) => e.id === newReq.copyOf) : undefined;

  const initial = useMemo<EventDraft>(() => {
    if (copySrc) {
      const { title, startDate, endDate, allDay, startTime, endTime, note } = copySrc;
      return { title, startDate, endDate, allDay, startTime, endTime, note, repeat: copySrc.repeat ?? "none", repeatUntil: copySrc.repeatUntil ?? "" };
    }
    if (editing) {
      const { title, startDate, endDate, allDay, startTime, endTime, note } = editing;
      return { title, startDate, endDate, allDay, startTime, endTime, note, repeat: editing.repeat ?? "none", repeatUntil: editing.repeatUntil ?? "" };
    }
    const trip = newReq?.tripId ? trips.find((t) => t.id === newReq.tripId) : undefined;
    const d = newReq?.date ?? trip?.startDate ?? todayStr();
    return { title: "", startDate: d, endDate: d, allDay: false, startTime: "10:00", endTime: "11:00", note: "", repeat: "none", repeatUntil: "" };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  // 持ち物は、複製のときは未チェックに戻す
  const initialExtra = useMemo(() => {
    if (!copySrc) return extraOf(editing, newReq?.tripId ?? "");
    const x = extraOf(copySrc);
    return { ...x, items: x.items.map((i) => ({ ...i, id: newId("it"), done: false })) };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const initialEventSnapshot = useRef(editing ? JSON.stringify(editing) : undefined);
  const [draft, setDraft] = useState<EventDraft>(initial);
  const [extra, setExtra] = useState<Extra>(initialExtra);
  const [showMore, setShowMore] = useState(hasExtra(initialExtra, initial));
  const [newItem, setNewItem] = useState("");
  const [errors, setErrors] = useState<FieldErrors>({});
  const [saveError, setSaveError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  const saved = useRef(false);
  const dirty = JSON.stringify([draft, extra]) !== JSON.stringify([initial, initialExtra]) || newItem.trim() !== "";

  // 下書きの控え（100点化の指示 B）。新しい予定は targetId=null、編集は予定の ID
  type Saved = { draft: EventDraft; extra: Extra; newItem?: string };
  const draftTarget = editing?.id ?? null;
  // 複製のときは、下書きの控えを使わない・上書きしない（空の新しい入力の下書きを壊さない）
  const [pending] = useState(() => (copySrc ? null : loadSheetDraft<Saved>("event", draftTarget)));
  const [resumeAsked, setResumeAsked] = useState(false);
  const resumed = useRef(false);
  const [draftSaveFailed, setDraftSaveFailed] = useState(false);
  useEffect(() => {
    if (saved.current || copySrc) return;
    // 前の下書きに答えるまでは控えない（答える前に打った分で、前の下書きを消さない）
    if (pending && !resumeAsked) return;
     
    if (dirty) setDraftSaveFailed(!saveSheetDraft<Saved>("event", draftTarget, { draft, extra, newItem }, undefined, undefined, initialEventSnapshot.current));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft, extra, newItem, dirty, resumeAsked]);
  const pendingTrip = pending?.draft.extra.tripId ? trips.find((t) => t.id === pending.draft.extra.tripId) : undefined;
  const resume = async () => {
    if (!pending) return setResumeAsked(true);
    if (pending.base && initialEventSnapshot.current && pending.base !== initialEventSnapshot.current) {
      const ok = await ui.confirm({
        title: "元の予定が、下書きのあとに変わっています",
        body: "続きからにすると、今の予定の中身が下書きの中身に置き換わります（保存するまでは変わりません）。今の予定のまま直す場合は「今の予定を使う」を選んでください（下書きは捨てます）。",
        ok: "下書きを使う",
        cancel: "今の予定を使う",
      });
      if (!ok) {
        clearSheetDraft("event", draftTarget);
        return setResumeAsked(true);
      }
    }
    if (dirty && !(await ui.confirm({ title: "下書きに置き換えますか？", body: "今この画面で打った分は消えて、下書きの中身になります。", ok: "置き換える" }))) return;
    setDraft({ ...pending.draft.draft });
    // 旅行は、今ある旅行だけつなぐ（消えた旅行にはつながない）
    const tripOk = !pending.draft.extra.tripId || trips.some((t) => t.id === pending.draft.extra.tripId);
    // 古い下書きには、あとから足した項目（移動時間・目標）がないので、既定値で埋める（保存で例外にならないように）
    setExtra({ ...extraOf(undefined), ...pending.draft.extra, tripId: tripOk ? pending.draft.extra.tripId : "" });
    setNewItem(pending.draft.newItem ?? "");
    if (hasExtra(pending.draft.extra, pending.draft.draft)) setShowMore(true);
    resumed.current = true;
    setResumeAsked(true);
  };

  const set = <K extends keyof EventDraft>(k: K, v: EventDraft[K]) => {
    setDraft((d) => {
      const n = { ...d, [k]: v };
      // 1日だけの予定は、開始日を変えたら終了日も一緒に動かす（前にずらしたとき、知らないうちに何日もの予定にならない。磨き込み 2026-11-26）。
      // 何日も続く予定は、開始日を終了日より後にしたときだけ終了日を合わせる
      if (k === "startDate" && typeof v === "string" && (d.startDate === d.endDate || n.endDate < v)) n.endDate = v;
      // 開始時刻を終わりと同じか後にしたら、終わりを開始の1時間後にする（レビュー o1 の P13）
      if (k === "startTime" && typeof v === "string" && /^\d{2}:\d{2}$/.test(v) && n.startDate === n.endDate && n.endTime <= v) {
        const [h, mi] = v.split(":").map(Number);
        n.endTime = h >= 23 ? "23:59" : `${String(h + 1).padStart(2, "0")}:${String(mi).padStart(2, "0")}`;
      }
      return n;
    });
    if (errors[k as string]) setErrors((e) => ({ ...e, [k]: "" }));
  };
  const setX = <K extends keyof Extra>(k: K, v: Extra[K]) => {
    setExtra((x) => ({ ...x, [k]: v }));
    if (errors[k as string]) setErrors((e) => ({ ...e, [k]: "" }));
  };

  const addItem = () => {
    const t = newItem.trim();
    if (!t) return;
    setX("items", [...extra.items, { id: newId("it"), text: t.slice(0, 60), done: false }]);
    setNewItem("");
  };

  const requestClose = async () => {
    if (busy) return;
    if (dirty && !(await ui.confirm({ title: "入力内容を破棄しますか？", body: "保存していない変更は失われます。", ok: "破棄する", danger: true })))
      return;
    if ((dirty || resumed.current) && !(pending && !resumeAsked) && !copySrc) clearSheetDraft("event", draftTarget);
    onClose();
  };

  // 編集の途中で、予定が別の画面で消されたとき（入力は残っている）
  const gone = !!editing && !data.events.some((e) => e.id === editing.id);
  const saveAsNew = async () => {
    const ok = await ui.confirm({ title: "新しい予定として保存しますか？", body: "消された予定は戻りません。今の入力の中身で、新しい予定を1件追加します。", ok: "新しく保存する" });
    if (ok) save(true);
  };

  const save = async (asNew = false) => {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setSaveError(null);
    try {
      const v = validateEvent(draft);
      const errs: FieldErrors = v.ok ? {} : { ...v.errors };
      if (!isSavableUrl(extra.url)) errs.url = "URLは https:// または http:// から入力してください";
      const costTxt = extra.cost.replace(/[,，円\s]/g, "").normalize("NFKC");
      const cost = costTxt === "" ? null : Number(costTxt);
      if (cost !== null && (!Number.isInteger(cost) || cost < 0 || cost > 100_000_000)) errs.cost = "費用は0以上の整数（円）で入力してください";
      const travelTxt = (extra.travel ?? "").replace(/[分\s]/g, "").normalize("NFKC");
      const travel = travelTxt === "" ? null : Number(travelTxt);
      if (travel !== null && (!Number.isInteger(travel) || travel < 0 || travel > 1440)) errs.travel = "移動時間は0〜1440の整数（分）で入力してください";
      if (Object.keys(errs).length) {
        setErrors(errs);
        if (errs.url || errs.cost || errs.travel || errs.note || errs.repeat || errs.repeatUntil) setShowMore(true);
        focusFirstInvalid();
        return;
      }
      const pending = newItem.trim() ? [...extra.items, { id: newId("it"), text: newItem.trim().slice(0, 60), done: false }] : extra.items;
      const input = {
        ...draft,
        title: draft.title.trim(),
        note: draft.note.trim(),
        startTime: draft.allDay ? "" : draft.startTime,
        endTime: draft.allDay ? "" : draft.endTime,
        repeat: draft.repeat ?? "none",
        repeatUntil: draft.repeat && draft.repeat !== "none" ? (draft.repeatUntil ?? "") : "",
        // v5 の詳細（空のものは保存しない。古い予定の形のまま残す）
        ...(extra.location.trim() ? { location: extra.location.trim() } : { location: undefined }),
        ...(extra.url.trim() ? { url: safeExternalLink(extra.url) ?? undefined } : { url: undefined }),
        ...(pending.length ? { items: pending } : { items: undefined }),
        ...(extra.tripId ? { tripId: extra.tripId } : { tripId: undefined }),
        ...(extra.kind ? { kind: extra.kind } : { kind: undefined }),
        ...(cost !== null ? { cost } : { cost: undefined }),
        // 目標：選んだ目標が今もあるときだけ（自分用。公開版は、今ある値をそのまま持つ）
        ...(IS_PERSONAL ? (extra.goalId && data.goals.some((g) => g.id === extra.goalId) ? { goalId: extra.goalId } : { goalId: undefined }) : editing?.goalId ? { goalId: editing.goalId } : {}),
        ...(IS_PERSONAL && travel ? { travelMinutes: travel } : IS_PERSONAL ? { travelMinutes: undefined } : editing?.travelMinutes ? { travelMinutes: editing.travelMinutes } : {}),
      };
      // undefined の項目は保存しない（JSON に残さない）
      for (const k of Object.keys(input) as (keyof typeof input)[]) if (input[k] === undefined) delete input[k];
      const r = await (editing && !asNew ? store.updateEvent(editing.id, input, initialEventSnapshot.current) : store.addEvent(input));
      if (!r.ok) {
        setSaveError(r.error);
        return;
      }
      saved.current = true;
      // 保存がうまくいったときだけ下書きを消す（前の下書きに答えていないときは、それは残す）
      // 複製のときは、通常の「新しい予定」の下書きを消さない（点検役の指摘）
      if (!copySrc && (!(pending && !resumeAsked) || asNew)) clearSheetDraft("event", draftTarget);
      ui.toast(asNew ? "新しい予定として保存しました" : editing ? "保存しました" : "予定を追加しました");
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
      body: `${formatDateJa(editing.startDate)} ${editing.title}\n記録した支出は消えません。削除すると元に戻せません。`,
      ok: "削除する",
      danger: true,
    });
    if (!ok) return;
    const r = await store.deleteEvent(editing.id);
    if (!r.ok) return ui.toast(r.error, "error");
    ui.toast("削除しました");
    onClose();
  };

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
          <Button className="flex-1" onClick={() => save()} disabled={busy} aria-busy={busy}>
            {busy ? "保存中…" : "保存する"}
          </Button>
        </div>
      }
    >
      {pending && !resumeAsked && (
        <div className="mb-3 rounded-xl border border-brand/30 bg-brand-soft p-3" role="status">
          <p className="text-[14px] font-semibold">{draftTimeLabel(pending.savedAt)} の下書きがあります</p>
          <p className="mt-0.5 text-[12px] text-ink-2">
            {pending.draft.draft.title || "（名前なし）"} {pending.draft.draft.startDate}
            {pendingTrip ? `（旅行：${pendingTrip.title}）` : ""}
          </p>
          <div className="mt-2 grid grid-cols-2 gap-2">
            <Button
              variant="secondary"
              onClick={() => {
                clearSheetDraft("event", draftTarget);
                setResumeAsked(true);
              }}
            >
              捨てる
            </Button>
            <Button onClick={resume}>
              続きから
            </Button>
          </div>
        </div>
      )}
      {draftSaveFailed && <p className="mb-2 text-[12px] text-warn">下書きを端末に控えられませんでした（保存すれば記録は残ります）。</p>}
      <form
        className="space-y-4"
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          save();
        }}
      >
        <Field label="予定名" htmlFor="ev-title" error={errors.title}>
          <input
            id="ev-title"
            value={draft.title}
            onChange={(e) => set("title", e.target.value)}
            aria-invalid={!!errors.title}
            placeholder="例：友人と食事"
            className={inputCls}
            maxLength={100}
            enterKeyHint="done"
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

        {!showMore ? (
          <button
            type="button"
            onClick={() => setShowMore(true)}
            className="flex min-h-12 w-full flex-col items-center justify-center rounded-xl border border-dashed border-line py-1.5 text-brand hover:bg-brand-soft"
          >
            <span className="text-[14px] font-semibold">＋ 詳細を追加</span>
            <span className="text-[12px] text-ink-3">場所・URL・メモ・持ち物・繰り返し</span>
          </button>
        ) : (
          <div className="space-y-4 rounded-2xl bg-surface-2 p-3">
            <Field label="場所" optional htmlFor="ev-loc">
              <input id="ev-loc" value={extra.location} onChange={(e) => setX("location", e.target.value)} placeholder="例：京都駅" className={inputCls} maxLength={100} />
            </Field>
            <Field label="URL（予約サイトなど）" optional htmlFor="ev-url" error={errors.url}>
              <input id="ev-url" type="url" inputMode="url" value={extra.url} onChange={(e) => setX("url", e.target.value)} placeholder="https://" className={inputCls} maxLength={500} aria-invalid={!!errors.url} />
            </Field>
            <Field label="メモ" optional htmlFor="ev-note" error={errors.note}>
              <textarea id="ev-note" rows={2} value={draft.note} onChange={(e) => set("note", e.target.value)} className={inputCls} maxLength={500} />
            </Field>

            <div>
              <p className="mb-1 text-[14px] font-semibold">
                持ち物<span className="ml-1 text-[12px] font-normal text-ink-3">任意</span>
              </p>
              {extra.items.length > 0 && (
                <ul className="mb-2 space-y-1">
                  {extra.items.map((i) => (
                    <li key={i.id} className="flex min-h-10 items-center gap-2 rounded-lg bg-surface px-3">
                      <span className="flex-1 text-[14px]">{i.text}</span>
                      <button
                        type="button"
                        onClick={() => setX("items", extra.items.filter((x) => x.id !== i.id))}
                        className="min-h-11 rounded-lg px-2 text-[13px] text-ink-3 hover:bg-surface-2"
                        aria-label={`${i.text}を持ち物から外す`}
                      >
                        外す
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              <div className="flex gap-2">
                <input
                  value={newItem}
                  onChange={(e) => setNewItem(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      addItem();
                    }
                  }}
                  placeholder="例：充電器"
                  className={inputCls}
                  maxLength={60}
                  aria-label="持ち物を入力"
                  enterKeyHint="enter"
                />
                <Button variant="secondary" onClick={addItem} disabled={!newItem.trim()} className="shrink-0 whitespace-nowrap">
                  追加
                </Button>
              </div>
            </div>

            {trips.length > 0 && (
              <div className="grid grid-cols-2 gap-3">
                <Field label="旅行に入れる" optional htmlFor="ev-trip">
                  <select id="ev-trip" value={extra.tripId} onChange={(e) => setX("tripId", e.target.value)} className={inputCls}>
                    <option value="">入れない</option>
                    {trips.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.title}
                      </option>
                    ))}
                  </select>
                </Field>
                {extra.tripId && (
                  <Field label="種類" optional htmlFor="ev-kind">
                    <select id="ev-kind" value={extra.kind} onChange={(e) => setX("kind", e.target.value as Extra["kind"])} className={inputCls}>
                      <option value="">選ばない</option>
                      {EVENT_KINDS.map((k) => (
                        <option key={k.id} value={k.id}>
                          {k.label}
                        </option>
                      ))}
                    </select>
                  </Field>
                )}
              </div>
            )}

            <Field label="費用の目安（円）" optional htmlFor="ev-cost" error={errors.cost}>
              <input id="ev-cost" inputMode="numeric" value={extra.cost} onChange={(e) => setX("cost", e.target.value)} placeholder="例：14000" className={inputCls} maxLength={12} aria-invalid={!!errors.cost} />
            </Field>
            <p className="-mt-2 text-[12px] text-ink-3">支出の記録は「＋」からです。</p>

            {IS_PERSONAL && data.goals.some((g) => !g.done || g.id === extra.goalId) && (
              <Field label="関連する目標" optional htmlFor="ev-goal">
                <select id="ev-goal" value={extra.goalId} onChange={(e) => setX("goalId", e.target.value)} className={inputCls}>
                  <option value="">なし</option>
                  {data.goals
                    .filter((g) => !g.done || g.id === extra.goalId)
                    .map((g) => (
                      <option key={g.id} value={g.id}>
                        {g.title}
                      </option>
                    ))}
                </select>
                <p className="mt-1 text-[12px] text-ink-3">この予定を、目標のための行動として数えます（時間・費用は、この予定のまま一度だけ）。</p>
              </Field>
            )}

            {IS_PERSONAL && (
              <Field label="移動にかかる時間（分）" optional htmlFor="ev-travel" error={errors.travel}>
                <input id="ev-travel" inputMode="numeric" value={extra.travel} onChange={(e) => setX("travel", e.target.value)} placeholder="例：30" className={inputCls} maxLength={4} aria-invalid={!!errors.travel} />
                <p className="mt-1 text-[12px] text-ink-3">入れると、開始時刻から引いた「出発の目安」を出します（地図の推計ではありません）。</p>
              </Field>
            )}

            <div className="grid grid-cols-2 gap-3">
              <Field label="繰り返し" htmlFor="ev-rep" error={errors.repeat}>
                <select
                  id="ev-rep"
                  value={draft.repeat ?? "none"}
                  onChange={(e) => set("repeat", e.target.value as EventDraft["repeat"])}
                  className={inputCls}
                  aria-invalid={!!errors.repeat}
                >
                  <option value="none">しない</option>
                  <option value="weekly">毎週</option>
                  <option value="monthly">毎月</option>
                  <option value="yearly">毎年</option>
                </select>
              </Field>
              {draft.repeat && draft.repeat !== "none" && (
                <Field label="いつまで" optional htmlFor="ev-until" error={errors.repeatUntil}>
                  <input id="ev-until" type="date" value={draft.repeatUntil ?? ""} onChange={(e) => set("repeatUntil", e.target.value)} className={inputCls} aria-invalid={!!errors.repeatUntil} />
                </Field>
              )}
            </div>
            {draft.repeat && draft.repeat !== "none" && (
              <p className="text-[12px] text-ink-3">
                繰り返しは1日の予定だけ設定できます。編集・削除すると、繰り返しのすべての日に反映されます（1回分だけの変更には、まだ対応していません）。
              </p>
            )}
          </div>
        )}

        {gone && (
          <div className="rounded-xl border border-warn/40 bg-warn-soft p-3" role="alert">
            <p className="text-[13px] font-semibold text-warn">この予定は、別の画面で消されました。</p>
            <p className="mt-0.5 text-[12px] text-ink-2">今の入力は残っています。新しい予定として保存できます。</p>
            <Button variant="secondary" className="mt-2 w-full" onClick={saveAsNew} disabled={busy}>
              新しい予定として保存する
            </Button>
          </div>
        )}
        {saveError && (
          <p role="alert" className="rounded-xl bg-expense-soft px-3 py-2 text-[14px] font-medium text-danger">
            {saveError}（入力した内容は残っています）
          </p>
        )}
        <button type="submit" hidden aria-hidden="true" tabIndex={-1} />
      </form>
    </Sheet>
  );
}
