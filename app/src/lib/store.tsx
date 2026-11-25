"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { newId } from "./defaults";
import { applyRecurringPayment, applyTxUpdate, mergeCategoryData, partialMark, revertPartialPayment, setTxTripData, unlinkTripFromTx } from "./dataOps";
import { deleteTxWithRefunds, undoRefund } from "./refund";
import { replaceEventEditableFields } from "./eventMerge";
import { staleRecordError } from "./eventConcurrency";
import { renameCategoryIn } from "./categoryRename";
import { LocalStorageRepository, type Repository, type RepoLoadResult, type RepoSaveResult, type Token } from "./repository";
import type { SaveResult, UndoSnapshot } from "./storage";
import type { AppData, CalendarEvent, Category, CollectionKey, HomeToggle, ItemOf, RecurringExpense, Transaction, Trip } from "./types";

export type TxInput = Omit<Transaction, "id" | "createdAt" | "updatedAt" | "currency">;
export type EventInput = Omit<CalendarEvent, "id" | "createdAt" | "updatedAt">;
export type RecurringInput = Omit<RecurringExpense, "id" | "createdAt" | "updatedAt">;
export type TripInput = Omit<Trip, "id" | "createdAt" | "updatedAt">;
export type ItemInput<K extends CollectionKey> = Omit<ItemOf<K>, "id" | "createdAt" | "updatedAt">;
export type { SaveResult };

const ID_PREFIX: Record<CollectionKey, string> = {
  nisa: "nisa", notes: "note", tasks: "task", assets: "asset", contracts: "ct", health: "hl",
  documents: "doc", studySubjects: "subj", studyLogs: "slog", goals: "goal",
};

type Status = "loading" | "ready" | "corrupt" | "unavailable";
/** 保存の結果は、保存が完了してから返る（o11 A06：「保存しました」は完了のあとだけ） */
type P<T = SaveResult> = Promise<T>;

interface Store {
  status: Status;
  error: string | null;
  data: AppData | null;
  /** 保存先の種類（localStorage／IndexedDB）。画面の「診断情報」用 */
  storageKind: Repository["kind"];
  commit: (fn: (d: AppData) => AppData) => P;
  addTx: (t: TxInput) => P<SaveResult & { id?: string }>;
  /** snapshot：編集を始めたときの記録の JSON。今の記録と違えば保存しない（別タブとの競合） */
  updateTx: (id: string, t: TxInput, snapshot?: string) => P;
  deleteTx: (id: string) => P;
  addEvent: (e: EventInput) => P<SaveResult & { id?: string }>;
  updateEvent: (id: string, e: EventInput, snapshot?: string) => P;
  deleteEvent: (id: string) => P;
  /** 持ち物のチェックを切り替える（予定の詳細から） */
  toggleEventItem: (eventId: string, itemId: string) => P;
  addTrip: (t: TripInput) => P<SaveResult & { id?: string }>;
  updateTrip: (id: string, t: TripInput, snapshot?: string) => P;
  /** 旅行を消しても、行程の予定と支出は消さない（予定は旅行から外れるだけ） */
  deleteTrip: (id: string) => P;
  addRecurring: (r: RecurringInput) => P;
  updateRecurring: (id: string, r: RecurringInput, snapshot?: string) => P;
  deleteRecurring: (id: string) => P;
  setBudget: (monthly: number | null) => P;
  setHomePref: (key: HomeToggle, v: boolean) => P;
  /** 自分用のホームのカードの並びと、隠したカード（100点化 E） */
  setHomeLayout: (order: string[], hidden: string[], flags: { nextRecurring: boolean; needsReview: boolean }) => P;
  /** メニューに出さない機能（道筋の一覧。記録は消さない） */
  setMenuHidden: (hrefs: string[]) => P;
  /** カテゴリを生活費・投資のどちらで数えるか。null で「名前から判断」に戻す（100点化 D） */
  setCategoryRole: (id: string, role: "life" | "invest" | null) => P;
  /** from のカテゴリの記録と固定費を to に移して、from を非表示にする（消さない。取り消しの控えを残す。100点化 E） */
  mergeCategory: (fromId: string, toId: string) => P<SaveResult & { moved?: number }>;
  /** 支出を旅行につなぐ・外す（tripId が null なら外す。100点化 F） */
  setTxTrip: (txIds: string[], tripId: string | null) => P;
  addCategory: (c: Omit<Category, "id" | "order" | "archived">) => P;
  setCategoryArchived: (id: string, archived: boolean) => P;
  renameCategory: (id: string, name: string) => P;
  /** 復元など、全体が大きく変わる保存。前の状態を1つ控える（reason は取り消すときに表示） */
  replaceAll: (d: AppData, reason: string) => P;
  /** すべて削除。控えも残さない */
  wipeAll: (empty: AppData) => P;
  /** 取り消し用の控え（保存のたびに読み直した値。同期で読める） */
  undoInfo: () => UndoSnapshot | null;
  undoLast: () => P;
  addItem: <K extends CollectionKey>(k: K, item: ItemInput<K>) => P;
  updateItem: <K extends CollectionKey>(k: K, id: string, patch: Partial<ItemInput<K>>, snapshot?: string) => P;
  /** 記録をまるごと置き換える（空にした項目を残さない）。snapshot で別タブとの競合を確かめる */
  replaceItem: <K extends CollectionKey>(k: K, id: string, item: ItemInput<K>, snapshot?: string) => P;
  removeItem: (k: CollectionKey, id: string) => P;
  removeStudySubject: (id: string) => P;
  resetCorrupt: () => P;
  corruptRaw: string | null;
}

const NOT_LOADED = "保存できませんでした。データを読み込めていません。再読み込みしてください";

const Ctx = createContext<Store | null>(null);

export function StoreProvider({ children, repo: repoProp }: { children: React.ReactNode; repo?: Repository }) {
  const [repo] = useState<Repository>(() => repoProp ?? new LocalStorageRepository());
  const [state, setState] = useState<{ status: Status; data: AppData | null; error: string | null; raw: string | null }>({
    status: "loading",
    data: null,
    error: null,
    raw: null,
  });
  const dataRef = useRef<AppData | null>(null);
  const tokenRef = useRef<Token>(null);
  const undoRef = useRef<UndoSnapshot | null>(null);
  /** 保存を1つずつ順に行う（前の保存が終わってから、次の変更を最新のデータに当てる） */
  const queueRef = useRef<Promise<unknown>>(Promise.resolve());

  const refreshUndo = useCallback(async () => {
    try {
      undoRef.current = await repo.readUndo();
    } catch {
      undoRef.current = null;
    }
  }, [repo]);

  const applyLoad = useCallback(
    (r: RepoLoadResult) => {
      if (r.status === "ok" || r.status === "new") {
        dataRef.current = r.data;
        tokenRef.current = "token" in r ? r.token : null;
        setState({ status: "ready", data: r.data, error: null, raw: null });
      } else if (r.status === "corrupt") {
        dataRef.current = null;
        tokenRef.current = null;
        setState({ status: "corrupt", data: null, error: r.error, raw: r.raw });
      } else {
        dataRef.current = null;
        tokenRef.current = null;
        setState({ status: "unavailable", data: null, error: r.error, raw: null });
      }
    },
    [],
  );

  const reload = useCallback(async () => {
    applyLoad(await repo.load());
    await refreshUndo();
  }, [repo, applyLoad, refreshUndo]);

  useEffect(() => {
    // ブラウザでのみ読めるため、マウント後に読み込む
    // eslint-disable-next-line react-hooks/set-state-in-effect -- 読み込みはマウントのあと（保存場所はブラウザでだけ読める）
    void reload();
    // ブラウザに「この記録を消さないで」と頼む（容量が足りないときなどに、ブラウザが自分で消すのを防ぐ。
    // 履歴の消去など、本人が消すのは防げない）。対応していないブラウザでは何もしない
    navigator.storage?.persist?.().catch(() => {});
    // 他のタブでの変更を反映
    return repo.subscribe(() => void reload());
  }, [repo, reload]);

  /** 保存の結果を画面に反映する。ほかのタブで変わっていたら、最新を読み込み直す（入力中のシートはそのまま） */
  const finish = useCallback(
    async (next: AppData, r: RepoSaveResult, undoTouched: boolean): Promise<SaveResult> => {
      if (r.ok) {
        tokenRef.current = r.token;
        dataRef.current = next;
        setState((s) => ({ ...s, data: next }));
        if (undoTouched) await refreshUndo();
        return { ok: true };
      }
      if (r.conflict) await reload();
      return { ok: false, error: r.error };
    },
    [reload, refreshUndo],
  );

  /** 保存を順番に並べる（同時に2つの保存が、同じ古いデータから計算しないように） */
  const enqueue = useCallback(<T,>(job: () => Promise<T>): Promise<T> => {
    const run = queueRef.current.then(job, job);
    queueRef.current = run.catch(() => undefined);
    return run;
  }, []);

  // 先に保存し、保存が完了したときだけ画面の状態を更新する
  const commit = useCallback(
    (fn: (d: AppData) => AppData, undoReason?: string): Promise<SaveResult> =>
      enqueue(async () => {
        const cur = dataRef.current;
        if (!cur) return { ok: false, error: NOT_LOADED };
        const next = fn(cur);
        try {
          return await finish(next, await repo.save(next, tokenRef.current, undoReason), !!undoReason);
        } catch (e) {
          return { ok: false, error: `保存できませんでした（${(e as Error)?.message ?? "不明"}）。今までの記録は消えていません` };
        }
      }),
    [enqueue, finish, repo],
  );

  const store = useMemo<Store>(() => {
    const now = () => new Date().toISOString();
    /** 編集を始めたときから、その記録が変わっていないか（変わっていれば保存しない理由を返す） */
    const guarded = (list: readonly { id: string }[] | undefined, id: string, snapshot: string | undefined, go: () => Promise<SaveResult>): Promise<SaveResult> => {
      const error = staleRecordError(list, id, snapshot); // recordMatchesSnapshot(current, snapshot) で今の記録と比べる
      return error ? Promise.resolve({ ok: false, error }) : go();
    };
    const withId = async (id: string, r: Promise<SaveResult>) => {
      const x = await r;
      return x.ok ? { ...x, id } : x;
    };
    return {
      status: state.status,
      error: state.error,
      data: state.data,
      corruptRaw: state.raw,
      storageKind: repo.kind,
      commit: (fn) => commit(fn),
      addTx: (t) => {
        const id = newId("tx");
        const ts = now();
        return withId(
          id,
          commit((d) => {
            let recurring = d.recurring;
            // 固定費から記録したら、その固定費の次回予定日を進める（同じ保存で一括）。一部の支払いは、進めずに払った額を足す（X02）
            if (t.recurringId) recurring = applyRecurringPayment(d.recurring, t.recurringId, t.amount, !!t.recurringPartial, ts);
            // 一部の支払いは、どの支払日の分かも記録に持たせる（全部払い終わる記録は、一部の印を付けない）
            const mark = t.recurringId ? partialMark(d.recurring, t.recurringId, t.amount, !!t.recurringPartial) : {};
            const { recurringPartial: _p, ...base } = t; // eslint-disable-line @typescript-eslint/no-unused-vars
            return { ...d, recurring, transactions: [...d.transactions, { ...base, ...mark, id, currency: "JPY", createdAt: ts, updatedAt: ts }] };
          }),
        );
      },
      updateTx: (id, t, snapshot) => guarded(dataRef.current?.transactions, id, snapshot, () => commit((d) => applyTxUpdate(d, id, t, now()))),
      deleteTx: (id) =>
        commit((d) => {
          const tx = d.transactions.find((x) => x.id === id);
          // 返金の記録を消すときは、元の支出を元に戻す
          if (tx?.refundOf) return undoRefund(d, id, now());
          // 返金のある支出を消すときは、その返金の記録も一緒に消す（返金だけが残らないように）
          const rest = deleteTxWithRefunds(d, id);
          return { ...rest, recurring: tx ? revertPartialPayment(d.recurring, tx, now()) : d.recurring };
        }),
      addEvent: (e) => {
        const ts = now();
        const id = newId("ev");
        return withId(id, commit((d) => ({ ...d, events: [...d.events, { ...e, id, createdAt: ts, updatedAt: ts }] })));
      },
      updateEvent: (id, e, snapshot) =>
        guarded(dataRef.current?.events, id, snapshot, () =>
          commit((d) => ({
            ...d,
            events: d.events.map((x) => (x.id === id ? replaceEventEditableFields(x, e, now()) : x)),
          })),
        ),
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
        return withId(id, commit((d) => ({ ...d, trips: [...(d.trips ?? []), { ...t, id, createdAt: ts, updatedAt: ts }] })));
      },
      updateTrip: (id, t, snapshot) =>
        guarded(dataRef.current?.trips, id, snapshot, () =>
          commit((d) => ({ ...d, trips: (d.trips ?? []).map((x) => (x.id === id ? { ...x, ...t, id, updatedAt: now() } : x)) })),
        ),
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
        guarded(dataRef.current?.recurring, id, snapshot, () =>
          commit((d) => ({ ...d, recurring: d.recurring.map((x) => (x.id === id ? { ...x, ...rc, id, updatedAt: now() } : x)) })),
        ),
      deleteRecurring: (id) => commit((d) => ({ ...d, recurring: d.recurring.filter((x) => x.id !== id) })),
      setBudget: (monthly) => commit((d) => ({ ...d, budget: { monthly } })),
      setHomePref: (key, v) => commit((d) => ({ ...d, prefs: { ...d.prefs, home: { ...d.prefs.home, [key]: v } } })),
      setMenuHidden: (hrefs) => commit((d) => ({ ...d, prefs: { ...d.prefs, menuHidden: [...new Set(hrefs)] } })),
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
      mergeCategory: async (fromId, toId) => {
        if (!dataRef.current) return { ok: false, error: NOT_LOADED };
        const ts = now();
        // 移した件数とラベルは、保存の時点のデータで決める（並んだ保存のあとでも正しい件数を返す）
        let moved = 0;
        let fail: string | null = null;
        const r = await enqueue(async () => {
          const cur = dataRef.current;
          if (!cur) return { ok: false as const, error: NOT_LOADED };
          const m = mergeCategoryData(cur, fromId, toId, ts);
          if (!m.ok) {
            fail = m.error;
            return { ok: false as const, error: m.error };
          }
          moved = m.moved;
          return finish(m.next, await repo.save(m.next, tokenRef.current, m.label), true);
        });
        if (fail) return { ok: false, error: fail };
        return r.ok ? { ...r, moved } : r;
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
        if (!r.ok) return Promise.resolve(r);
        return commit((d) => ({ ...d, categories: d.categories.map((c) => (c.id === id ? { ...c, name: name.trim() } : c)) }));
      },
      setCategoryArchived: (id, archived) =>
        commit((d) => ({ ...d, categories: d.categories.map((c) => (c.id === id ? { ...c, archived } : c)) })),
      replaceAll: (next, reason) => {
        if (!dataRef.current) return Promise.resolve({ ok: false, error: NOT_LOADED });
        return commit(() => next, reason);
      },
      wipeAll: (empty) =>
        // 本体・取り消しの控え・壊れたデータの退避分を消し、残っていないことを確かめる。
        // 消しきれなければ成功と言わず、戻せるものは戻す（ほかのアプリのキーには触れない）
        enqueue(async () => {
          const r = await repo.wipe(tokenRef.current);
          return finish(empty, r, true);
        }),
      undoInfo: () => undoRef.current,
      undoLast: () =>
        enqueue(async () => {
          const r = await repo.undo(tokenRef.current);
          if (r.ok && r.data) return finish(r.data, r, true);
          if (!r.ok && r.conflict) await reload();
          return r.ok ? { ok: true as const } : { ok: false as const, error: r.error };
        }),
      addItem: (k, item) => {
        const ts = now();
        return commit((d) => ({ ...d, [k]: [...d[k], { ...item, id: newId(ID_PREFIX[k]), createdAt: ts, updatedAt: ts }] }));
      },
      updateItem: (k, id, patch, snapshot) =>
        guarded(dataRef.current?.[k] as { id: string }[] | undefined, id, snapshot, () =>
          commit((d) => ({
            ...d,
            [k]: (d[k] as { id: string }[]).map((x) => (x.id === id ? { ...x, ...patch, id, updatedAt: now() } : x)),
          })),
        ),
      replaceItem: (k, id, item, snapshot) =>
        guarded(dataRef.current?.[k] as { id: string }[] | undefined, id, snapshot, () =>
          commit((d) => ({
            ...d,
            [k]: (d[k] as { id: string; createdAt: string }[]).map((x) => (x.id === id ? { ...item, id, createdAt: x.createdAt, updatedAt: now() } : x)),
          })),
        ),
      removeItem: (k, id) => commit((d) => ({ ...d, [k]: (d[k] as { id: string }[]).filter((x) => x.id !== id) })),
      // 資格・科目を消すときは、その勉強記録も一緒に消す（どこにも属さない記録を残さない）
      removeStudySubject: (id) =>
        commit((d) => ({
          ...d,
          studySubjects: d.studySubjects.filter((x) => x.id !== id),
          studyLogs: d.studyLogs.filter((l) => l.subjectId !== id),
        })),
      resetCorrupt: async () => {
        if (!state.raw) return { ok: false, error: "対象のデータがありません" };
        const r = await repo.quarantine(state.raw);
        if (r.ok) await reload();
        return r;
      },
    };
  }, [state, commit, enqueue, finish, reload, repo]);

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
