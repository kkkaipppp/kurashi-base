"use client";

import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { newId } from "./defaults";
import { applyRecurringPayment, applyTxUpdate, mergeCategoryData, partialMark, revertPartialPayment, setTxTripData, unlinkTripFromTx } from "./dataOps";
import { deleteTxWithRefunds, undoRefund } from "./refund";
import { replaceEventEditableFields } from "./eventMerge";
import { staleRecordError } from "./eventConcurrency";
import { renameCategoryIn } from "./categoryRename";
import { LocalStorageRepository, type Repository } from "./repository";
import { StoreCore, type CommitOptions, type CoreState } from "./storeCore";
import { CHANNEL, IdbRepositoryAdapter } from "./idbAdapter";
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
  /** check：保存の列の中で、最新のデータに対して確かめる。文字列を返したら保存しない */
  commit: (fn: (d: AppData) => AppData, opts?: { check?: (cur: AppData) => string | null }) => P;
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
  /** base：置き換える内容を作るときに使ったデータ（渡すと、今の最新と違うときは保存しない） */
  replaceAll: (d: AppData, reason: string, base: AppData) => P;
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


// 保存先：自分用の版は IndexedDB（起動時に localStorage の旧データを移す。旧データは消さない）。公開版は今までどおり localStorage（o11 A06 段階B）
// 版の値は、このファイルの中で直接比べる（公開版の組み立てから、IndexedDB の部品を外すため）
const PERSONAL_BUILD = process.env.NEXT_PUBLIC_KB_EDITION === "personal";
function defaultRepository(): Repository {
  if (PERSONAL_BUILD && typeof indexedDB !== "undefined") {
    let legacy: Storage | null = null;
    try {
      legacy = window.localStorage;
    } catch {
      legacy = null;
    }
    const channel = typeof BroadcastChannel !== "undefined" ? new BroadcastChannel(CHANNEL) : null;
    return new IdbRepositoryAdapter({ factory: indexedDB, legacy, channel });
  }
  return new LocalStorageRepository();
}

const Ctx = createContext<Store | null>(null);

export function StoreProvider({ children, repo: repoProp }: { children: React.ReactNode; repo?: Repository }) {
  // 保存の中心は React に依らない StoreCore（列・競合の確かめ・読み込み直し。lib/storeCore.ts）
  const [core] = useState(() => new StoreCore(repoProp ?? defaultRepository()));
  const [state, setState] = useState<CoreState>(core.snapshot);
  useEffect(() => core.subscribe(setState), [core]);
  useEffect(() => {
    // ブラウザでのみ読めるため、マウント後に読み込む
    void core.reload();
    // ブラウザに「この記録を消さないで」と頼む（容量が足りないときなどに、ブラウザが自分で消すのを防ぐ。
    // 履歴の消去など、本人が消すのは防げない）。対応していないブラウザでは何もしない
    navigator.storage?.persist?.().catch(() => {});
    // 他のタブでの変更を反映（読み込み直しも列に並ぶ）
    return core.repo.subscribe(() => void core.reload());
  }, [core]);

  const store = useMemo<Store>(() => {
    const now = () => new Date().toISOString();
    const commit = (fn: (d: AppData) => AppData, opts?: CommitOptions) => core.commit(fn, opts);
    /** 編集を始めたときから、その記録が変わっていないか。列の中で、最新のデータに対して確かめる（点検 中-2） */
    const guarded = (pick: (d: AppData) => readonly { id: string }[] | undefined, id: string, snapshot: string | undefined, fn: (d: AppData) => AppData): Promise<SaveResult> =>
      commit(fn, { check: (cur) => staleRecordError(pick(cur), id, snapshot) }); // recordMatchesSnapshot(current, snapshot) で今の記録と比べる
    const withId = async (id: string, r: Promise<SaveResult>) => {
      const x = await r;
      return x.ok ? { ...x, id } : x;
    };
    return {
      status: state.status,
      error: state.error,
      data: state.data,
      corruptRaw: state.raw,
      storageKind: core.repo.kind,
      commit: (fn, opts) => commit(fn, opts?.check ? { check: opts.check } : undefined),
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
      updateTx: (id, t, snapshot) => guarded((d) => d.transactions, id, snapshot, (d) => applyTxUpdate(d, id, t, now())),
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
        guarded((d) => d.events, id, snapshot, (d) => ({
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
        return withId(id, commit((d) => ({ ...d, trips: [...(d.trips ?? []), { ...t, id, createdAt: ts, updatedAt: ts }] })));
      },
      updateTrip: (id, t, snapshot) =>
        guarded((d) => d.trips, id, snapshot, (d) => ({ ...d, trips: (d.trips ?? []).map((x) => (x.id === id ? { ...x, ...t, id, updatedAt: now() } : x)) })),
      deleteTrip: (id) =>
        commit((d) => ({
          ...d,
          trips: (d.trips ?? []).filter((x) => x.id !== id),
          // 計画が消えた旅行を指したまま残らないように、つながりを外す（To-Be 点検 M4）
          plans: (d.plans ?? []).map((p) => {
            if (p.tripId !== id) return p;
            const { tripId: _t, ...rest } = p; // eslint-disable-line @typescript-eslint/no-unused-vars
            return { ...rest, updatedAt: now() };
          }),
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
        guarded((d) => d.recurring, id, snapshot, (d) => ({ ...d, recurring: d.recurring.map((x) => (x.id === id ? { ...x, ...rc, id, updatedAt: now() } : x)) })),
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
        const ts = now();
        // 移した件数とラベルは、保存の時点（列の中）のデータで決める
        let moved = 0;
        let label = "";
        let next: AppData | null = null;
        const r = await commit((d) => next ?? d, {
          check: (cur) => {
            const m = mergeCategoryData(cur, fromId, toId, ts);
            if (!m.ok) return m.error;
            moved = m.moved;
            label = m.label;
            next = m.next;
            return null;
          },
          undoReason: () => label,
        });
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
        const r = renameCategoryIn(state.data?.categories ?? [], id, name);
        if (!r.ok) return Promise.resolve(r);
        return commit((d) => ({ ...d, categories: d.categories.map((c) => (c.id === id ? { ...c, name: name.trim() } : c)) }));
      },
      setCategoryArchived: (id, archived) =>
        commit((d) => ({ ...d, categories: d.categories.map((c) => (c.id === id ? { ...c, archived } : c)) })),
      // base：置き換える内容を作るときに使ったデータ。今の最新と違えば保存しない（点検 中-1：古い内容で別タブ・別の保存を上書きしない）
      replaceAll: (next, reason, base) => commit(() => next, { undoReason: reason, base }),
      // 本体・取り消しの控え・壊れたデータの退避分を消し、残っていないことを確かめる（repo.wipe → localStorage の版は wipeAllAppData）。
      // 消しきれなければ成功と言わず、戻せるものは戻す（ほかのアプリのキーには触れない）
      wipeAll: (empty) => core.wipe(empty),
      undoInfo: () => state.undo,
      undoLast: () => core.undoLast(),
      addItem: (k, item) => {
        const ts = now();
        return commit((d) => ({ ...d, [k]: [...d[k], { ...item, id: newId(ID_PREFIX[k]), createdAt: ts, updatedAt: ts }] }));
      },
      updateItem: (k, id, patch, snapshot) =>
        guarded((d) => d[k] as { id: string }[], id, snapshot, (d) => ({
          ...d,
          [k]: (d[k] as { id: string }[]).map((x) => (x.id === id ? { ...x, ...patch, id, updatedAt: now() } : x)),
        })),
      replaceItem: (k, id, item, snapshot) =>
        guarded((d) => d[k] as { id: string }[], id, snapshot, (d) => ({
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
      resetCorrupt: () => core.resetCorrupt(),
    };
  }, [state, core]);

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
