"use client";

import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from "react";
import { Button } from "./ui";
import { TxSheet, type TxSheetRequest } from "./TxSheet";
import { EventSheet, type EventSheetRequest } from "./EventSheet";

interface ConfirmOpts {
  title: string;
  body?: string;
  ok?: string;
  danger?: boolean;
}

interface UI {
  openTx: (r: TxSheetRequest) => void;
  openEvent: (r: EventSheetRequest) => void;
  confirm: (o: ConfirmOpts) => Promise<boolean>;
  toast: (msg: string, kind?: "ok" | "error") => void;
}

const Ctx = createContext<UI | null>(null);

export function UIProvider({ children }: { children: ReactNode }) {
  const [tx, setTx] = useState<(TxSheetRequest & { key: number }) | null>(null);
  const [ev, setEv] = useState<(EventSheetRequest & { key: number }) | null>(null);
  const [cf, setCf] = useState<(ConfirmOpts & { resolve: (v: boolean) => void }) | null>(null);
  const [toasts, setToasts] = useState<{ id: number; msg: string; kind: "ok" | "error" }[]>([]);
  const seq = useRef(0);

  const toast = useCallback((msg: string, kind: "ok" | "error" = "ok") => {
    const id = ++seq.current;
    setToasts((t) => [...t, { id, msg, kind }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), kind === "error" ? 6000 : 2600);
  }, []);

  const confirm = useCallback(
    (o: ConfirmOpts) =>
      new Promise<boolean>((resolve) => {
        setCf({ ...o, resolve });
      }),
    [],
  );

  const ui = useMemo<UI>(
    () => ({
      openTx: (r) => setTx({ ...r, key: ++seq.current }),
      openEvent: (r) => setEv({ ...r, key: ++seq.current }),
      confirm,
      toast,
    }),
    [confirm, toast],
  );

  const closeCf = (v: boolean) => {
    cf?.resolve(v);
    setCf(null);
  };

  return (
    <Ctx.Provider value={ui}>
      {children}
      {tx && <TxSheet key={tx.key} req={tx} onClose={() => setTx(null)} />}
      {ev && <EventSheet key={ev.key} req={ev} onClose={() => setEv(null)} />}
      {cf && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-6" role="alertdialog" aria-modal="true" aria-labelledby="cf-title">
          <div className="absolute inset-0 bg-black/40" onClick={() => closeCf(false)} aria-hidden="true" />
          <div className="relative w-full max-w-sm rounded-2xl bg-surface p-5 shadow-xl">
            <h2 id="cf-title" className="text-[17px] font-bold">
              {cf.title}
            </h2>
            {cf.body && <p className="mt-2 text-[14px] whitespace-pre-line text-ink-2">{cf.body}</p>}
            <div className="mt-5 grid grid-cols-2 gap-2">
              <Button variant="secondary" onClick={() => closeCf(false)} autoFocus>
                キャンセル
              </Button>
              <Button variant={cf.danger ? "danger" : "primary"} onClick={() => closeCf(true)}>
                {cf.ok ?? "OK"}
              </Button>
            </div>
          </div>
        </div>
      )}
      <div className="pointer-events-none fixed inset-x-0 bottom-24 z-[60] flex flex-col items-center gap-2 px-4" aria-live="polite">
        {toasts.map((t) => (
          <div
            key={t.id}
            role={t.kind === "error" ? "alert" : "status"}
            className={`pointer-events-auto max-w-[440px] rounded-xl px-4 py-2.5 text-[14px] font-medium shadow-lg ${
              t.kind === "error" ? "bg-danger text-white" : "bg-ink text-white"
            }`}
          >
            {t.msg}
          </div>
        ))}
      </div>
    </Ctx.Provider>
  );
}

export function useUI(): UI {
  const u = useContext(Ctx);
  if (!u) throw new Error("useUI must be used within UIProvider");
  return u;
}
