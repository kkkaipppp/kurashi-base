"use client";

import dynamic from "next/dynamic";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { Button } from "./ui";
import { TxSheet, type TxSheetRequest } from "./TxSheet";
import { EventSheet, type EventSheetRequest } from "./EventSheet";
import { AddChooser } from "./AddChooser";
import { todayStr } from "@/lib/date";
import { usePathname, useRouter } from "next/navigation";

// 自分用の「追加」の一覧（o31 F002。遅れて読む。公開版は AddChooser のまま）
const PersonalAddSheet = process.env.NEXT_PUBLIC_KB_EDITION === "personal" ? dynamic(() => import("./AddSheet").then((m) => m.PersonalAddSheet), { ssr: false }) : null;

interface ConfirmOpts {
  title: string;
  body?: string;
  /** 押すと何が起きるかを書いたボタン名（「削除」「破棄」など）。「OK」は使わない（用語辞書 JP023） */
  ok: string;
  cancel?: string;
  danger?: boolean;
}

interface UI {
  /** 何を追加するか選ぶシート（支出・収入・予定・タスク）。date はその日付で入力を始める */
  openAdd: (o?: { date?: string }) => void;
  /** カレンダーで選んでいる日（＋ボタンがこの日付を引き継ぐ） */
  calendarDate: string | null;
  setCalendarDate: (d: string | null) => void;
  openTx: (r: TxSheetRequest) => void;
  openEvent: (r: EventSheetRequest) => void;
  confirm: (o: ConfirmOpts) => Promise<boolean>;
  toast: (msg: string, kind?: "ok" | "error") => void;
}

const Ctx = createContext<UI | null>(null);

export function UIProvider({ children }: { children: ReactNode }) {
  const [tx, setTx] = useState<(TxSheetRequest & { key: number }) | null>(null);
  const [ev, setEv] = useState<(EventSheetRequest & { key: number }) | null>(
    null,
  );
  const [cf, setCf] = useState<
    (ConfirmOpts & { resolve: (v: boolean) => void }) | null
  >(null);
  const [add, setAdd] = useState<{ date?: string; key: number } | null>(null);
  const [calendarDate, setCalendarDate] = useState<string | null>(null);
  const [toasts, setToasts] = useState<
    { id: number; msg: string; kind: "ok" | "error" }[]
  >([]);
  const seq = useRef(0);
  const router = useRouter();
  const pathname = usePathname();
  const previousPath = useRef(pathname);
  // Next.js Activity がページを保持しても、画面をまたいだ一時シートは持ち越さない。
  useEffect(() => {
    if (previousPath.current === pathname) return;
    previousPath.current = pathname;
    setAdd(null);
    setTx(null);
    setEv(null);
    setCf((current) => {
      current?.resolve(false);
      return null;
    });
  }, [pathname]);

  const toast = useCallback((msg: string, kind: "ok" | "error" = "ok") => {
    const id = ++seq.current;
    setToasts((t) => [...t, { id, msg, kind }]);
    setTimeout(
      () => setToasts((t) => t.filter((x) => x.id !== id)),
      kind === "error" ? 6000 : 2600,
    );
  }, []);

  // iPhone アプリのウィジェットのボタン（アプリが開いているとき）。ページを読み込み直さずに、ここで入力の窓を開く。
  // 入力の途中なら、消してよいかを先に聞く（レビュー o1 の P02：書きかけを守る）。Web 版ではこの合図は来ない
  const openSheets = useRef({ tx: false, ev: false });
  useEffect(() => {
    openSheets.current = { tx: !!tx, ev: !!ev };
  }, [tx, ev]);
  useEffect(() => {
    const onAdd = async (e: Event) => {
      const kind = (e as CustomEvent<string>).detail;
      if (!["expense", "income", "event", "choose"].includes(kind)) return;
      if (openSheets.current.tx || openSheets.current.ev) {
        cfBefore.current = document.activeElement as HTMLElement | null;
        const ok = await new Promise<boolean>((resolve) =>
          setCf((current) => {
            // ほかの確認が開いていたら、その答えは「いいえ」にしてから聞く（答えが返らないままにしない）
            current?.resolve(false);
            return {
              title: "入力の途中です",
              body: "今の入力はまだ保存していません。新しく入力すると、今の入力は消えます。",
              ok: "新しく入力する",
              cancel: "入力を続ける",
              danger: true,
              resolve,
            };
          }),
        );
        if (!ok) return;
      }
      setTx(null);
      setEv(null);
      if (kind === "expense" || kind === "income")
        setTx({ mode: "new", type: kind, key: ++seq.current });
      else if (kind === "event") setEv({ mode: "new", key: ++seq.current });
      else setAdd({ key: ++seq.current });
    };
    window.addEventListener("kb-open-add", onAdd);
    return () => window.removeEventListener("kb-open-add", onAdd);
  }, []);

  // 確認の窓を開く前に focus があった所（閉じたら、そこへ戻す）。窓の「キャンセル」が autoFocus で先に focus を取るので、開く前に覚えておく（点検 中-1）
  const cfBefore = useRef<HTMLElement | null>(null);
  const confirm = useCallback(
    (o: ConfirmOpts) =>
      new Promise<boolean>((resolve) => {
        cfBefore.current = document.activeElement as HTMLElement | null;
        // ほかの確認が開いていたら、その答えは「いいえ」にしてから聞く（答えが返らないまま重ならないように。磨き込み 2026-11-26）
        setCf((current) => {
          current?.resolve(false);
          return { ...o, resolve };
        });
      }),
    [],
  );

  const ui = useMemo<UI>(
    () => ({
      openAdd: (o) => setAdd({ date: o?.date, key: ++seq.current }),
      calendarDate,
      setCalendarDate,
      openTx: (r) => setTx({ ...r, key: ++seq.current }),
      openEvent: (r) => setEv({ ...r, key: ++seq.current }),
      confirm,
      toast,
    }),
    [confirm, toast, calendarDate],
  );

  const closeCf = useCallback((v: boolean) => {
    setCf((current) => {
      current?.resolve(v);
      return null;
    });
  }, []);

  // 確認の窓：Esc で「いいえ」。Tab は窓の中だけを回る。閉じたら、開く前の場所へ戻る。
  // Esc は下のシートへ届けない（シートの「閉じる」の確認が、もう1つ重ならないように。磨き込み 2026-11-26）
  const cfBox = useRef<HTMLDivElement>(null);
  const cfOpen = !!cf;
  useEffect(() => {
    if (!cfOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopImmediatePropagation();
        closeCf(false);
        return;
      }
      if (e.key !== "Tab" || !cfBox.current) return;
      const items = [...cfBox.current.querySelectorAll<HTMLElement>("button")];
      if (!items.length) return;
      const i = items.indexOf(document.activeElement as HTMLElement);
      if (e.shiftKey && i <= 0) {
        e.preventDefault();
        items[items.length - 1].focus();
      } else if (!e.shiftKey && (i === -1 || i === items.length - 1)) {
        e.preventDefault();
        items[0].focus();
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => {
      window.removeEventListener("keydown", onKey, true);
      const before = cfBefore.current;
      cfBefore.current = null;
      if (before && document.contains(before)) before.focus();
    };
  }, [cfOpen, closeCf]);

  return (
    <Ctx.Provider value={ui}>
      {children}
      {add && PersonalAddSheet && (
        <PersonalAddSheet
          key={add.key}
          date={add.date}
          onClose={() => setAdd(null)}
          openTx={(type, date, initial, oneShot) => setTx({ mode: "new", type, date, ...(initial ? { initial } : {}), ...(oneShot ? { oneShot } : {}), key: ++seq.current })}
          openEvent={(date, prefill) => setEv({ mode: "new", date, ...(prefill ? { prefill } : {}), key: ++seq.current })}
        />
      )}
      {add && !PersonalAddSheet && (
        <AddChooser
          key={add.key}
          date={add.date}
          onClose={() => setAdd(null)}
          onPick={(kind) => {
            const date = add.date;
            setAdd(null);
            if (kind === "expense" || kind === "income")
              setTx({ mode: "new", type: kind, date, key: ++seq.current });
            else if (kind === "event")
              setEv({ mode: "new", date, key: ++seq.current });
            // 今日以外の日を選んでいたら、その日を期限の初めの値にする（磨き込み 2026-11-26）
            else router.push(date && date !== todayStr() ? `/tasks?open=new&date=${date}` : "/tasks?open=new");
          }}
        />
      )}
      {tx && <TxSheet key={tx.key} req={tx} onClose={() => setTx(null)} />}
      {ev && <EventSheet key={ev.key} req={ev} onClose={() => setEv(null)} />}
      {cf && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-6"
          role="alertdialog"
          aria-modal="true"
          aria-labelledby="cf-title"
          aria-describedby={cf.body ? "cf-body" : undefined}
        >
          <div
            className="absolute inset-0 bg-black/40"
            onClick={() => closeCf(false)}
            aria-hidden="true"
          />
          <div ref={cfBox} className="relative w-full max-w-sm rounded-2xl bg-surface p-5 shadow-xl">
            <h2 id="cf-title" className="text-[17px] font-bold">
              {cf.title}
            </h2>
            {cf.body && (
              <p id="cf-body" className="mt-2 text-[14px] whitespace-pre-line text-ink-2">
                {cf.body}
              </p>
            )}
            <div className="mt-5 grid grid-cols-2 gap-2">
              <Button
                variant="secondary"
                onClick={() => closeCf(false)}
                autoFocus
              >
                {cf.cancel ?? "やめる"}
              </Button>
              <Button
                variant={cf.danger ? "danger" : "primary"}
                onClick={() => closeCf(true)}
              >
                {cf.ok}
              </Button>
            </div>
          </div>
        </div>
      )}
      <div
        className="pointer-events-none fixed inset-x-0 bottom-[calc(6rem+var(--sab))] z-[60] flex flex-col items-center gap-2 px-4"
        aria-live="polite"
      >
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
