import { IDB_NAME } from "./idbRepository";

/**
 * IndexedDB に大きなデータを書いて読む時間を測る（o11 A08）。
 * 本物の記録の保存場所（"kurashi-base"）とは別の、測るためだけの場所を作り、終わったら必ず消す。本物の記録には触れない
 */
export const PERF_IDB_NAME = "kurashi-base-perf";

export interface IdbTiming {
  writeMs: number;
  readMs: number;
  /** 読み直した中身が、書いた中身と同じか */
  same: boolean;
}

const req = <T>(r: IDBRequest<T>) =>
  new Promise<T>((ok, ng) => {
    r.onsuccess = () => ok(r.result);
    r.onerror = () => ng(r.error);
  });
const done = (tx: IDBTransaction) =>
  new Promise<void>((ok, ng) => {
    tx.oncomplete = () => ok();
    tx.onerror = () => ng(tx.error);
    tx.onabort = () => ng(tx.error ?? new Error("中断されました"));
  });

export function deletePerfDb(factory: IDBFactory): Promise<void> {
  return new Promise((ok) => {
    const r = factory.deleteDatabase(PERF_IDB_NAME);
    r.onsuccess = () => ok();
    r.onerror = () => ok();
    r.onblocked = () => ok();
  });
}

export async function measureIdb(factory: IDBFactory, json: string, now: () => number = () => performance.now()): Promise<IdbTiming> {
  if ((PERF_IDB_NAME as string) === IDB_NAME) throw new Error("本物の保存場所は使いません");
  await deletePerfDb(factory);
  const open = factory.open(PERF_IDB_NAME, 1);
  open.onupgradeneeded = () => open.result.createObjectStore("kv");
  const db = await req(open);
  try {
    const t0 = now();
    const w = db.transaction("kv", "readwrite");
    w.objectStore("kv").put(json, "data");
    await done(w);
    const writeMs = now() - t0;
    const t1 = now();
    const r = db.transaction("kv", "readonly");
    const back = await req(r.objectStore("kv").get("data"));
    const readMs = now() - t1;
    return { writeMs, readMs, same: back === json };
  } finally {
    db.close();
    await deletePerfDb(factory);
  }
}
