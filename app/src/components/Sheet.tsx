"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { IconX } from "./ui";

/** 下から出るシート（スマホ）／中央モーダル（PC）。Esc・背景タップで onRequestClose */
export function Sheet({
  title,
  open,
  onRequestClose,
  children,
  footer,
}: {
  title: string;
  open: boolean;
  onRequestClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onRequestClose);
  useEffect(() => {
    closeRef.current = onRequestClose;
  });

  // iOS ではキーボードが画面に重なるだけで、固定配置の要素は隠れてしまう。
  // 見えている範囲（visualViewport）に合わせて、シートをキーボードの上に置く。
  const [vp, setVp] = useState<{ top: number; height: number } | null>(null);
  useEffect(() => {
    const v = typeof window !== "undefined" ? window.visualViewport : null;
    if (!open || !v) return;
    const update = () => setVp({ top: v.offsetTop, height: v.height });
    update();
    v.addEventListener("resize", update);
    v.addEventListener("scroll", update);
    return () => {
      v.removeEventListener("resize", update);
      v.removeEventListener("scroll", update);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const prev = document.activeElement as HTMLElement | null;
    const el = ref.current;
    // 最初の入力欄（金額・タイトル）にフォーカス。なければ最初のボタン
    const first =
      el?.querySelector<HTMLElement>("input:not([type=hidden]):not([type=checkbox]):not([type=radio]), textarea") ??
      el?.querySelector<HTMLElement>("button:not([data-close])");
    first?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        closeRef.current();
      }
      if (e.key === "Tab" && el) {
        const f = [...el.querySelectorAll<HTMLElement>("input, select, textarea, button, [href], [tabindex]:not([tabindex='-1'])")].filter(
          (x) => !x.hasAttribute("disabled"),
        );
        if (!f.length) return;
        if (e.shiftKey && document.activeElement === f[0]) {
          e.preventDefault();
          f[f.length - 1].focus();
        } else if (!e.shiftKey && document.activeElement === f[f.length - 1]) {
          e.preventDefault();
          f[0].focus();
        }
      }
    };
    document.addEventListener("keydown", onKey);
    const ov = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = ov;
      prev?.focus?.();
    };
  }, [open]);

  if (!open) return null;
  return (
    <div
      className="fixed inset-x-0 top-0 bottom-0 z-40 flex items-end justify-center sm:items-center"
      style={vp ? { top: vp.top, height: vp.height, bottom: "auto" } : undefined}
    >
      <div className="absolute inset-0 bg-black/35" onClick={() => closeRef.current()} aria-hidden="true" />
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="relative flex max-h-[92%] w-full max-w-[480px] flex-col rounded-t-3xl bg-bg shadow-xl sm:rounded-3xl"
      >
        <div className="flex min-h-14 items-center justify-between border-b border-line px-4">
          <h2 className="text-[17px] font-bold">{title}</h2>
          <button
            type="button"
            data-close
            onClick={() => closeRef.current()}
            className="-mr-2 inline-flex size-11 items-center justify-center rounded-full text-ink-2 hover:bg-surface-2"
            aria-label="閉じる"
          >
            <IconX />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-4 py-4">{children}</div>
        {footer && <div className="border-t border-line px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">{footer}</div>}
      </div>
    </div>
  );
}
