"use client";

import type { ButtonHTMLAttributes, ReactNode } from "react";

type Variant = "primary" | "secondary" | "ghost" | "danger";

const variants: Record<Variant, string> = {
  primary: "bg-brand text-brand-ink hover:brightness-110 active:brightness-95",
  secondary: "bg-surface text-ink border border-line hover:bg-surface-2",
  ghost: "text-ink-2 hover:bg-surface-2",
  danger: "bg-surface text-danger border border-danger/40 hover:bg-expense-soft",
};

export function Button({
  variant = "primary",
  className = "",
  ...p
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }) {
  return (
    <button
      type="button"
      {...p}
      className={`inline-flex min-h-11 items-center justify-center gap-1.5 rounded-xl px-4 text-[15px] font-semibold transition disabled:cursor-not-allowed disabled:opacity-50 ${variants[variant]} ${className}`}
    />
  );
}

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  const pad = /(^|\s)p-0(\s|$)/.test(className) ? "" : "p-4";
  return <section className={`rounded-2xl border border-line bg-surface ${pad} shadow-[0_1px_2px_rgba(0,0,0,0.03)] ${className}`}>{children}</section>;
}

export function SectionTitle({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="mb-2 flex min-h-8 items-center justify-between">
      <h2 className="text-[15px] font-bold text-ink">{children}</h2>
      {action}
    </div>
  );
}

export function Field({
  label,
  htmlFor,
  error,
  hint,
  optional,
  children,
}: {
  label: string;
  htmlFor: string;
  error?: string;
  hint?: string;
  /** 入力しなくてもよい欄。ラベルの横に小さく「任意」と出す */
  optional?: boolean;
  children: ReactNode;
}) {
  return (
    <div className="min-w-0 space-y-1">
      <label htmlFor={htmlFor} className="flex items-center gap-1.5 text-[13px] font-semibold text-ink-2">
        {label}
        {optional && <span className="rounded bg-surface-2 px-1 py-px text-[10px] font-medium text-ink-3">任意</span>}
      </label>
      {children}
      {error ? (
        <p id={`${htmlFor}-error`} role="alert" className="text-[13px] font-medium text-danger">
          {error}
        </p>
      ) : hint ? (
        <p className="text-[12px] text-ink-3">{hint}</p>
      ) : null}
    </div>
  );
}

export const inputCls =
  "block w-full min-w-0 max-w-full min-h-11 rounded-xl border border-line bg-surface px-3 py-2 text-ink placeholder:text-ink-3 aria-[invalid=true]:border-danger aria-[invalid=true]:bg-expense-soft/40";

export function PageHeader({ title, right, sub }: { title: string; right?: ReactNode; sub?: ReactNode }) {
  return (
    <header className="sticky top-0 z-10 -mx-4 mb-3 flex min-h-14 items-center justify-between gap-2 bg-bg/95 px-4 pt-2 backdrop-blur">
      <div>
        <h1 className="text-xl font-bold tracking-tight">{title}</h1>
        {sub}
      </div>
      {right}
    </header>
  );
}

export function Empty({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="rounded-xl border border-dashed border-line px-4 py-5 text-center text-[14px] text-ink-3">
      <p>{children}</p>
      {action && <div className="mt-3">{action}</div>}
    </div>
  );
}

export function DevBadge() {
  return <span className="rounded-full bg-warn-soft px-2 py-0.5 text-[11px] font-semibold text-warn">開発版</span>;
}

// --- アイコン（インラインSVG） ---
const icon = (d: ReactNode) =>
  function Icon({ className = "size-5" }: { className?: string }) {
    return (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
        {d}
      </svg>
    );
  };

export const IconHome = icon(<path d="M3 11.5 12 4l9 7.5M5 10v10h5v-6h4v6h5V10" />);
export const IconCalendar = icon(
  <>
    <rect x="3" y="5" width="18" height="16" rx="2" />
    <path d="M3 10h18M8 3v4M16 3v4" />
  </>,
);
export const IconList = icon(<path d="M8 6h13M8 12h13M8 18h13M3.5 6h.01M3.5 12h.01M3.5 18h.01" />);
export const IconSettings = icon(
  <>
    <circle cx="12" cy="12" r="3" />
    <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z" />
  </>,
);
export const IconGrid = icon(
  <>
    <rect x="3" y="3" width="7" height="7" rx="1.5" />
    <rect x="14" y="3" width="7" height="7" rx="1.5" />
    <rect x="3" y="14" width="7" height="7" rx="1.5" />
    <rect x="14" y="14" width="7" height="7" rx="1.5" />
  </>,
);
export const IconPlus = icon(<path d="M12 5v14M5 12h14" />);
export const IconImage = icon(
  <>
    <rect x="3" y="4" width="18" height="16" rx="2" />
    <circle cx="9" cy="10" r="2" />
    <path d="m21 16-5-5-9 9" />
  </>,
);
export const IconChevronL = icon(<path d="m15 18-6-6 6-6" />);
export const IconChevronR = icon(<path d="m9 18 6-6-6-6" />);
export const IconX = icon(<path d="M18 6 6 18M6 6l12 12" />);
export const IconRepeat = icon(<path d="M17 2l4 4-4 4M3 11V9a3 3 0 0 1 3-3h15M7 22l-4-4 4-4M21 13v2a3 3 0 0 1-3 3H3" />);
export const IconAlert = icon(<path d="M12 9v4M12 17h.01M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z" />);
export const IconSearch = icon(
  <>
    <circle cx="11" cy="11" r="7" />
    <path d="m21 21-4.3-4.3" />
  </>,
);
