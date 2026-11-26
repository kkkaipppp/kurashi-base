"use client";

import { useState } from "react";
import { Button, Card, SectionTitle } from "./ui";
import { useUI } from "./UIContext";
import { useData } from "@/lib/store";
import { buildDiagnostics } from "@/lib/diagnostics";
import Link from "next/link";
import { EDITION, FEATURES } from "@/lib/edition";
import { isNativeApp } from "@/lib/platform";
import { STORAGE_KEY, readUndo } from "@/lib/storage";

/** 困ったときの診断情報（自分用。NEXT v21 H10）。記録の中身は入れない。画面に出して、自分でコピーする */
export function DiagnosticsCard() {
  const data = useData();
  const ui = useUI();
  const [text, setText] = useState<string | null>(null);
  const make = () => {
    let chars: number | null = null;
    try {
      chars = localStorage.getItem(STORAGE_KEY)?.length ?? null;
    } catch {
      chars = null;
    }
    setText(buildDiagnostics({ data, edition: EDITION, native: isNativeApp(), storedChars: chars, hasUndo: !!readUndo(), userAgent: navigator.userAgent, nowIso: new Date().toISOString() }));
  };
  const copy = async () => {
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      ui.toast("コピーしました");
    } catch {
      ui.toast("コピーできませんでした。文字を長押しして、選んでコピーしてください", "error");
    }
  };
  return (
    <Card>
      <SectionTitle>困ったときの診断情報</SectionTitle>
      <p className="text-[13px] text-ink-2">不具合を伝えるときに使います。記録の中身（店名・メモ・金額・予定の名前）は入りません。件数・日付の範囲・保存の大きさ・端末の種類だけです。自動では送りません。</p>
      <div className="mt-3 grid gap-2">
        <Button variant="secondary" onClick={make}>
          診断情報を作る
        </Button>
        {FEATURES.perfLab && (
          <Link href="/perf" className="text-center text-[13px] font-semibold text-brand underline">
            性能を測る（記録には触れません）
          </Link>
        )}
      </div>
      {text && (
        <div className="mt-3 space-y-2">
          <pre className="max-h-64 overflow-auto rounded-xl bg-surface-2 p-3 text-[12px] whitespace-pre-wrap break-all" aria-label="診断情報">
            {text}
          </pre>
          <Button onClick={copy} className="w-full">
            コピーする
          </Button>
        </div>
      )}
    </Card>
  );
}
