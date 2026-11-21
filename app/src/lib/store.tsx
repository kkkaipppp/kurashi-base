"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { newId } from "./defaults";
import { advanceDueDate } from "./recurring";
import { clearUndo, loadData, quarantineAndReset, readUndo, restoreUndo, saveDataIfUnchanged, saveWithUndo, type GuardedSaveResult, type LoadResult, type SaveResult, type UndoSnapshot } from "./storage";
import type { AppData, CalendarEvent, Category, CollectionKey, HomePrefs, ItemOf, RecurringExpense, Transaction } from "./types";

export type TxInput = Omit<Transaction, "id" | "createdAt" | "updatedAt" | "currency">;
export type EventInput = Omit<CalendarEvent, "id" | "createdAt" | "updatedAt">;
export type RecurringInput = Omit<RecurringExpense, "id" | "createdAt" | "updatedAt">;
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
  updateTx: (id: string, t: TxInput) => SaveResult;
  deleteTx: (id: string) => SaveResult;
  addEvent: (e: EventInput) => SaveResult;
  updateEvent: (id: string, e: EventInput) => SaveResult;
  deleteEvent: (id: string) => SaveResult;
  addRecurring: (r: RecurringInput) => SaveResult;
  updateRecurring: (id: string, r: RecurringInput) => SaveResult;
  deleteRecurring: (id: string) => SaveResult;
  setBudget: (monthly: number | null) => SaveResult;
  setHomePref: (key: keyof HomePrefs, v: boolean) => SaveResult;
  addCategory: (c: Omit<Category, "id" | "order" | "archived">) => SaveResult;
  setCategoryArchived: (id: string, archived: boolean) => SaveResult;
  /** 復元など、全体が大きく変わる保存。前の状態を1つ控える（reason は取り消すときに表示） */
  replaceAll: (d: AppData, reason: string) => SaveResult;
  /** すべて削除。控えも残さない */
  wipeAll: (empty: AppData) => SaveResult;
  undoInfo: () => UndoSnapshot | null;
  undoLast: () => SaveResult;
  addItem: <K extends CollectionKey>(k: K, item: ItemInput<K>) => SaveResult;
  updateItem: <K extends CollectionKey>(k: K, id: string, patch: Partial<ItemInput<K>>) => SaveResult;
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
    // 他のタブでの変更を反映
    const onStorage = (e: StorageEvent) => {
      if (e.key === null || e.key.startsWith("kurashi-base:data")) applyLoad(loadData());
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, [applyLoad]);

  /** 保存の結果を画面に反映する。ほかのタブで変わっていたら、最新を読み込み直す（入力中のシートはそのまま） */
  const finish = useCallback(
    (next: AppData, r: GuardedSaveResult): SaveResult => {
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
      updateTx: (id, t) =>
        commit((d) => ({
          ...d,
          transactions: d.transactions.map((x) => (x.id === id ? { ...x, ...t, id, updatedAt: now() } : x)),
        })),
      deleteTx: (id) => commit((d) => ({ ...d, transactions: d.transactions.filter((x) => x.id !== id) })),
      addEvent: (e) => {
        const ts = now();
        return commit((d) => ({ ...d, events: [...d.events, { ...e, id: newId("ev"), createdAt: ts, updatedAt: ts }] }));
      },
      updateEvent: (id, e) =>
        commit((d) => ({ ...d, events: d.events.map((x) => (x.id === id ? { ...x, ...e, id, updatedAt: now() } : x)) })),
      deleteEvent: (id) => commit((d) => ({ ...d, events: d.events.filter((x) => x.id !== id) })),
      addRecurring: (rc) => {
        const ts = now();
        return commit((d) => ({ ...d, recurring: [...d.recurring, { ...rc, id: newId("rc"), createdAt: ts, updatedAt: ts }] }));
      },
      updateRecurring: (id, rc) =>
        commit((d) => ({ ...d, recurring: d.recurring.map((x) => (x.id === id ? { ...x, ...rc, id, updatedAt: now() } : x)) })),
      deleteRecurring: (id) => commit((d) => ({ ...d, recurring: d.recurring.filter((x) => x.id !== id) })),
      setBudget: (monthly) => commit((d) => ({ ...d, budget: { monthly } })),
      setHomePref: (key, v) => commit((d) => ({ ...d, prefs: { ...d.prefs, home: { ...d.prefs.home, [key]: v } } })),
      addCategory: (c) =>
        commit((d) => ({
          ...d,
          categories: [
            ...d.categories,
            { ...c, id: newId("cat"), order: d.categories.filter((x) => x.kind === c.kind).length, archived: false },
          ],
        })),
      setCategoryArchived: (id, archived) =>
        commit((d) => ({ ...d, categories: d.categories.map((c) => (c.id === id ? { ...c, archived } : c)) })),
      replaceAll: (next, reason) => {
        if (!dataRef.current) return { ok: false, error: "保存できませんでした。データを読み込めていません。再読み込みしてください" };
        return finish(next, saveWithUndo(next, persistedRawRef.current, reason, now()));
      },
      wipeAll: (empty) => {
        const r = commit(() => empty);
        if (r.ok) clearUndo();
        return r;
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
      updateItem: (k, id, patch) =>
        commit((d) => ({
          ...d,
          [k]: (d[k] as { id: string }[]).map((x) => (x.id === id ? { ...x, ...patch, id, updatedAt: now() } : x)),
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
