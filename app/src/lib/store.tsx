"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { newId } from "./defaults";
import { advanceDueDate } from "./recurring";
import { applyTxUpdate, mergeCategoryData, setTxTripData, unlinkTripFromTx } from "./dataOps";
import { replaceEventEditableFields } from "./eventMerge";
import { staleRecordError } from "./eventConcurrency";
import { renameCategoryIn } from "./categoryRename";
import { loadData, quarantineAndReset, readUndo, restoreUndo, saveDataIfUnchanged, saveWithUndo, wipeAllAppData, type GuardedSaveResult, type LoadResult, type SaveResult, type UndoSnapshot, type WipeResult } from "./storage";
import type { AppData, CalendarEvent, Category, CollectionKey, HomeToggle, ItemOf, RecurringExpense, Transaction, Trip } from "./types";

export type TxInput = Omit<Transaction, "id" | "createdAt" | "updatedAt" | "currency">;
export type EventInput = Omit<CalendarEvent, "id" | "createdAt" | "updatedAt">;
export type RecurringInput = Omit<RecurringExpense, "id" | "createdAt" | "updatedAt">;
export type TripInput = Omit<Trip, "id" | "createdAt" | "updatedAt">;
export type ItemInput<K extends CollectionKey> = Omit<ItemOf<K>, "id" | "createdAt" | "updatedAt">;

const ID_PREFIX: Record<CollectionKey, string> = {
  nisa: "nisa", notes: "note", tasks: "task", assets: "asset", contracts: "ct", health: "hl",
  documents: "doc", studySubjects: "subj", studyLogs: "slog", goals: "goal",
};

type Status = "loading" | "ready" | "corrupt" | "unavailable";

interface Store {
  status: Status;
  error: string | null;
  data: AppData | null;
  commit: (fn: (d: AppData) => AppData) => SaveResult;
  addTx: (t: TxInput) => SaveResult & { id?: string };
  /** snapshot：編集を始めたときの記録の JSON。今の記録と違えば保存しない（別タブとの競合） */
  updateTx: (id: string, t: TxInput, snapshot?: string) => SaveResult;
  deleteTx: (id: string) => SaveResult;
  addEvent: (e: EventInput) => SaveResult & { id?: string };
  updateEvent: (id: string, e: EventInput, snapshot?: string) => SaveResult;
  deleteEvent: (id: string) => SaveResult;
  /** 持ち物のチェックを切り替える（予定の詳細から） */
  toggleEventItem: (eventId: string, itemId: string) => SaveResult;
  addTrip: (t: TripInput) => SaveResult & { id?: string };
  updateTrip: (id: string, t: TripInput, snapshot?: string) => SaveResult;
  /** 旅行を消しても、行程の予定と支出は消さない（予定は旅行から外れるだけ） */
  deleteTrip: (id: string) => SaveResult;
  addRecurring: (r: RecurringInput) => SaveResult;
  updateRecurring: (id: string, r: RecurringInput, snapshot?: string) => SaveResult;
  deleteRecurring: (id: string) => SaveResult;
  setBudget: (monthly: number | null) => SaveResult;
  setHomePref: (key: HomeToggle, v: boolean) => SaveResult;
  /** 自分用のホームのカードの並びと、隠したカード（100点化 E） */
  setHomeLayout: (order: string[], hidden: string[], flags: { nextRecurring: boolean; needsReview: boolean }) => SaveResult;
  /** カテゴリを生活費・投資のどちらで数えるか。null で「名前から判断」に戻す（100点化 D） */
  setCategoryRole: (id: string, role: "life" | "invest" | null) => SaveResult;
  /** from のカテゴリの記録と固定費を to に移して、from を非表示にする（消さない。取り消しの控えを残す。100点化 E） */
  mergeCategory: (fromId: string, toId: string) => SaveResult & { moved?: number };
  /** 支出を旅行につなぐ・外す（tripId が null なら外す。100点化 F） */
  setTxTrip: (txIds: string[], tripId: string | null) => SaveResult;
  addCategory: (c: Omit<Category, "id" | "order" | "archived">) => SaveResult;
  setCategoryArchived: (id: string, archived: boolean) => SaveResult;
  renameCategory: (id: string, name: string) => SaveResult;
  /** 復元など、全体が大きく変わる保存。前の状態を1つ控える（reason は取り消すときに表示） */
  replaceAll: (d: AppData, reason: string) => SaveResult;
  /** すべて削除。控えも残さない */
  wipeAll: (empty: AppData) => SaveResult;
  undoInfo: () => UndoSnapshot | null;
  undoLast: () => SaveResult;
  addItem: <K extends CollectionKey>(k: K, item: ItemInput<K>) => SaveResult;
  updateItem: <K extends CollectionKey>(k: K, id: string, patch: Partial<ItemInput<K>>, snapshot?: string) => SaveResult;
  /** 記録をまるごと置き換える（空にした項目を残さない）。snapshot で別タブとの競合を確かめる */
  replaceItem: <K extends CollectionKey>(k: K, id: string, item: ItemInput<K>, snapshot?: string) => SaveResult;
  removeItem: (k: CollectionKey, id: string) => SaveResult;
  removeStudySubject: (id: string) => SaveResult;
  resetCorrupt: () => SaveResult;
  corruptRaw: string | null;
}

const Ctx = createContext<Store | null>(null);

export function StoreProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<{ status: Status; data: AppData | null; error: string | null; raw: string | null }>({
    status: "loading",
    data: null,
    error: null,
    raw: null,
  });
  const dataRef = useRef<AppData | null>(null);
  const persistedRawRef = useRef<string | null>(null);

  const applyLoad = useCallback((r: LoadResult) => {
    if (r.status === "ok" || r.status === "new") {
      dataRef.current = r.data;
      persistedRawRef.current = r.persistedRaw;
      setState({ status: "ready", data: r.data, error: null, raw: null });
    } else if (r.status === "corrupt") {
      dataRef.current = null;
      persistedRawRef.current = null;
      setState({ status: "corrupt", data: null, error: r.error, raw: r.raw });
    } else {
      dataRef.current = null;
      persistedRawRef.current = null;
      setState({ status: "unavailable", data: null, error: r.error, raw: null });
    }
  }, []);

  useEffect(() => {
    // localStorage はブラウザでのみ読めるため、マウント後に読み込む
    // eslint-disable-next-line react-hooks/set-state-in-effect
    applyLoad(loadData());
    // ブラウザに「この記録を消さないで」と頼む（容量が足りないときなどに、ブラウザが自分で消すのを防ぐ。
    // 履歴の消去など、本人が消すのは防げない）。対応していないブラウザでは何もしない
    navigator.storage?.persist?.().catch(() => {});
    // 他のタブでの変更を反映
    const onStorage = (e: StorageEvent) => {
      if (e.key === null || e.key.startsWith("kurashi-base:data")) applyLoad(loadData());
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, [applyLoad]);

  /** 保存の結果を画面に反映する。ほかのタブで変わっていたら、最新を読み込み直す（入力中のシートはそのまま） */
  const finish = useCallback(
    (next: AppData, r: GuardedSaveResult | WipeResult): SaveResult => {
      if (r.ok) {
        persistedRawRef.current = r.persistedRaw;
        dataRef.current = next;
        setState((s) => ({ ...s, data: next }));
        return { ok: true };
      }
      if (r.conflict) applyLoad(loadData());
      return { ok: false, error: r.error };
    },
    [applyLoad],
  );

  // 先に保存し、成功したときだけ画面の状態を更新する
  const commit = useCallback((fn: (d: AppData) => AppData): SaveResult => {
    const cur = dataRef.current;
    if (!cur) return { ok: false, error: "保存できませんでした。データを読み込めていません。再読み込みしてください" };
    const next = fn(cur);
    return finish(next, saveDataIfUnchanged(next, persistedRawRef.current));
  }, [finish]);

  const store = useMemo<Store>(() => {
    const now = () => new Date().toISOString();
    /** 編集を始めたときから、その記録が変わっていないか（変わっていれば保存しない理由を返す） */
    const staleCheck = (list: readonly { id: string }[] | undefined, id: string, snapshot?: string): SaveResult | null => {
      const error = staleRecordError(list, id, snapshot); // recordMatchesSnapshot(current, snapshot) で今の記録と比べる
      return error ? { ok: false, error } : null;
    };
    return {
      status: state.status,
      error: state.error,
      data: state.data,
      corruptRaw: state.raw,
      commit,
      addTx: (t) => {
        const id = newId("tx");
        const ts = now();
        const r = commit((d) => {
          let recurring = d.recurring;
          // 固定費から記録したら、その固定費の次回予定日を進める（同じ保存で一括）
          if (t.recurringId) {
            recurring = d.recurring.map((rc) =>
              rc.id === t.recurringId
                ? { ...rc, nextDueDate: advanceDueDate(rc.nextDueDate, rc.cycle, rc.anchorDay), updatedAt: ts }
                : rc,
            );
          }
          return { ...d, recurring, transactions: [...d.transactions, { ...t, id, currency: "JPY", createdAt: ts, updatedAt: ts }] };
        });
        return r.ok ? { ...r, id } : r;
      },
      updateTx: (id, t, snapshot) =>
        staleCheck(dataRef.current?.transactions, id, snapshot) ??
        commit((d) => applyTxUpdate(d, id, t, now())),
      deleteTx: (id) => commit((d) => ({ ...d, transactions: d.transactions.filter((x) => x.id !== id) })),
      addEvent: (e) => {
        const ts = now();
        const id = newId("ev");
        const r = commit((d) => ({ ...d, events: [...d.events, { ...e, id, createdAt: ts, updatedAt: ts }] }));
        return r.ok ? { ...r, id } : r;
      },
      updateEvent: (id, e, snapshot) =>
        staleCheck(dataRef.current?.events, id, snapshot) ??
        commit((d) => ({
          ...d,
          events: d.events.map((x) => (x.id === id ? replaceEventEditableFields(x, e, now()) : x)),
        })),
      deleteEvent: (id) => commit((d) => ({ ...d, events: d.events.filter((x) => x.id !== id) })),
      toggleEventItem: (eventId, itemId) =>
        commit((d) => ({
          ...d,
          events: d.events.map((x) =>
            x.id === eventId ? { ...x, items: (x.items ?? []).map((i) => (i.id === itemId ? { ...i, done: !i.done } : i)), updatedAt: now() } : x,
          ),
        })),
      addTrip: (t) => {
        const ts = now();
        const id = newId("trip");
        const r = commit((d) => ({ ...d, trips: [...(d.trips ?? []), { ...t, id, createdAt: ts, updatedAt: ts }] }));
        return r.ok ? { ...r, id } : r;
      },
      updateTrip: (id, t, snapshot) =>
        staleCheck(dataRef.current?.trips, id, snapshot) ??
        commit((d) => ({ ...d, trips: (d.trips ?? []).map((x) => (x.id === id ? { ...x, ...t, id, updatedAt: now() } : x)) })),
      deleteTrip: (id) =>
        commit((d) => ({
          ...d,
          trips: (d.trips ?? []).filter((x) => x.id !== id),
          events: d.events.map((e) => {
            if (e.tripId !== id) return e;
            const { tripId: _drop, ...rest } = e; // eslint-disable-line @typescript-eslint/no-unused-vars
            return { ...rest, updatedAt: now() };
          }),
          // つないだ支出は消さずに、旅行から外すだけ
          transactions: unlinkTripFromTx(d, id, now()),
        })),
      setTxTrip: (txIds, tripId) => commit((d) => setTxTripData(d, txIds, tripId, now())),
      addRecurring: (rc) => {
        const ts = now();
        return commit((d) => ({ ...d, recurring: [...d.recurring, { ...rc, id: newId("rc"), createdAt: ts, updatedAt: ts }] }));
      },
      updateRecurring: (id, rc, snapshot) =>
        staleCheck(dataRef.current?.recurring, id, snapshot) ??
        commit((d) => ({ ...d, recurring: d.recurring.map((x) => (x.id === id ? { ...x, ...rc, id, updatedAt: now() } : x)) })),
      deleteRecurring: (id) => commit((d) => ({ ...d, recurring: d.recurring.filter((x) => x.id !== id) })),
      setBudget: (monthly) => commit((d) => ({ ...d, budget: { monthly } })),
      setHomePref: (key, v) => commit((d) => ({ ...d, prefs: { ...d.prefs, home: { ...d.prefs.home, [key]: v } } })),
      setHomeLayout: (order, hidden, flags) => commit((d) => ({ ...d, prefs: { ...d.prefs, home: { ...d.prefs.home, ...flags, order: [...order], hidden: [...hidden] } } })),
      setCategoryRole: (id, role) =>
        commit((d) => ({
          ...d,
          categories: d.categories.map((c) => {
            if (c.id !== id) return c;
            const { role: _drop, ...rest } = c; // eslint-disable-line @typescript-eslint/no-unused-vars
            return role ? { ...rest, role } : rest;
          }),
        })),
      mergeCategory: (fromId, toId) => {
        const d = dataRef.current;
        if (!d) return { ok: false, error: "保存できませんでした。データを読み込めていません。再読み込みしてください" };
        const ts = now();
        const m = mergeCategoryData(d, fromId, toId, ts);
        if (!m.ok) return m;
        const r = finish(m.next, saveWithUndo(m.next, persistedRawRef.current, m.label, ts));
        return r.ok ? { ...r, moved: m.moved } : r;
      },
      addCategory: (c) =>
        commit((d) => ({
          ...d,
          categories: [
            ...d.categories,
            { ...c, id: newId("cat"), order: d.categories.filter((x) => x.kind === c.kind).length, archived: false },
          ],
        })),
      renameCategory: (id, name) => {
        const r = renameCategoryIn(dataRef.current?.categories ?? [], id, name);
        if (!r.ok) return r;
        return commit((d) => ({ ...d, categories: d.categories.map((c) => (c.id === id ? { ...c, name: name.trim() } : c)) }));
      },
      setCategoryArchived: (id, archived) =>
        commit((d) => ({ ...d, categories: d.categories.map((c) => (c.id === id ? { ...c, archived } : c)) })),
      replaceAll: (next, reason) => {
        if (!dataRef.current) return { ok: false, error: "保存できませんでした。データを読み込めていません。再読み込みしてください" };
        return finish(next, saveWithUndo(next, persistedRawRef.current, reason, now()));
      },
      wipeAll: (empty) => {
        // 本体・取り消しの控え・壊れたデータの退避分（kurashi-base: で始まるキー）を消し、残っていないことを確かめる。
        // 消しきれなければ成功と言わず、戻せるものは戻す（ほかのアプリのキーには触れない）
        const r = wipeAllAppData(persistedRawRef.current);
        return finish(empty, r);
      },
      undoInfo: () => readUndo(),
      undoLast: () => {
        const r = restoreUndo(persistedRawRef.current, now());
        if (r.ok && r.data) return finish(r.data, r);
        if (!r.ok && r.conflict) applyLoad(loadData());
        return r.ok ? { ok: true } : { ok: false, error: r.error };
      },
      addItem: (k, item) => {
        const ts = now();
        return commit((d) => ({ ...d, [k]: [...d[k], { ...item, id: newId(ID_PREFIX[k]), createdAt: ts, updatedAt: ts }] }));
      },
      updateItem: (k, id, patch, snapshot) =>
        staleCheck(dataRef.current?.[k] as { id: string }[] | undefined, id, snapshot) ??
        commit((d) => ({
          ...d,
          [k]: (d[k] as { id: string }[]).map((x) => (x.id === id ? { ...x, ...patch, id, updatedAt: now() } : x)),
        })),
      replaceItem: (k, id, item, snapshot) =>
        staleCheck(dataRef.current?.[k] as { id: string }[] | undefined, id, snapshot) ??
        commit((d) => ({
          ...d,
          [k]: (d[k] as { id: string; createdAt: string }[]).map((x) => (x.id === id ? { ...item, id, createdAt: x.createdAt, updatedAt: now() } : x)),
        })),
      removeItem: (k, id) => commit((d) => ({ ...d, [k]: (d[k] as { id: string }[]).filter((x) => x.id !== id) })),
      // 資格・科目を消すときは、その勉強記録も一緒に消す（どこにも属さない記録を残さない）
      removeStudySubject: (id) =>
        commit((d) => ({
          ...d,
          studySubjects: d.studySubjects.filter((x) => x.id !== id),
          studyLogs: d.studyLogs.filter((l) => l.subjectId !== id),
        })),
      resetCorrupt: () => {
        if (!state.raw) return { ok: false, error: "対象のデータがありません" };
        const r = quarantineAndReset(state.raw);
        if (r.ok) applyLoad(loadData());
        return r;
      },
    };
  }, [state, commit, applyLoad, finish]);

  return <Ctx.Provider value={store}>{children}</Ctx.Provider>;
}

export function useStore(): Store {
  const s = useContext(Ctx);
  if (!s) throw new Error("useStore must be used within StoreProvider");
  return s;
}

/** status === "ready" の画面でだけ使う */
export function useData(): AppData {
  const s = useStore();
  if (!s.data) throw new Error("data not ready");
  return s.data;
}
