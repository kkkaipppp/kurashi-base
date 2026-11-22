"use client";

import { useEffect, useRef, useState } from "react";
import { useData } from "@/lib/store";
import { fingerprintBytes } from "@/lib/duplicates";
import { formatDateJa } from "@/lib/date";
import { formatYen } from "@/lib/money";
import type { Transaction } from "@/lib/types";
import { useUI } from "@/components/UIContext";
import { Button, Card, IconAlert, IconImage, PageHeader } from "@/components/ui";

const MAX_BYTES = 15 * 1024 * 1024;
const OK_TYPES = ["image/png", "image/jpeg", "image/webp", "image/gif", "image/heic", "image/heif"];

type Picked = { url: string; name: string; size: number; fingerprint: string; dupOf: Transaction[] };

export default function ImportPage() {
  const data = useData();
  const ui = useUI();
  const inputRef = useRef<HTMLInputElement>(null);
  const [picked, setPicked] = useState<Picked | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reading, setReading] = useState(false);

  // プレビューURLを解放
  useEffect(() => () => {
    if (picked) URL.revokeObjectURL(picked.url);
  }, [picked]);

  const clear = () => {
    setPicked(null);
    if (inputRef.current) inputRef.current.value = "";
  };

  const onFile = async (f: File | undefined) => {
    setError(null);
    clear();
    if (!f) return;
    if (!f.type.startsWith("image/") || (f.type && !OK_TYPES.includes(f.type))) {
      return setError("画像ファイル（PNG・JPEG・WebP など）を選んでください");
    }
    if (f.size > MAX_BYTES) return setError("画像が大きすぎます（15MBまで）。スクリーンショットなど小さな画像を選んでください");
    setReading(true);
    try {
      const fp = await fingerprintBytes(await f.arrayBuffer());
      const dupOf = data.transactions.filter((t) => t.sourceFingerprint === fp);
      setPicked({ url: URL.createObjectURL(f), name: f.name, size: f.size, fingerprint: fp, dupOf });
    } catch {
      setError("画像を読み込めませんでした。別の画像を選ぶか、手で入力してください");
    } finally {
      setReading(false);
    }
  };

  const startEntry = () => {
    if (!picked) return;
    ui.openTx({
      mode: "new",
      type: "expense",
      title: "レシートを見て入力",
      source: "image",
      sourceFingerprint: picked.fingerprint,
      previewUrl: picked.url,
      onSaved: clear,
    });
  };

  return (
    <main className="space-y-4">
      <PageHeader title="レシートを見て入力" />

      <section className="rounded-2xl border border-warn/30 bg-warn-soft px-4 py-3">
        <p className="text-[13px] text-ink-2">
          <span className="font-bold text-warn">文字の自動読み取り（OCR）は、まだありません。</span>
          画像を見ながら金額・日付・店名を入力して登録します。入力した内容を確認するまで、取引は登録されません。
        </p>
      </section>

      <Card>
        <input ref={inputRef} type="file" accept="image/*" className="hidden" onChange={(e) => onFile(e.target.files?.[0])} aria-label="画像を選ぶ" />
        {!picked ? (
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            disabled={reading}
            className="flex min-h-48 w-full flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-line text-ink-2 hover:bg-surface-2"
          >
            <IconImage className="size-10 text-brand" />
            <span className="text-[15px] font-bold">{reading ? "読み込み中…" : "レシート・決済画面の画像を選ぶ"}</span>
            <span className="text-[12px] text-ink-3">画像はこの端末の中だけで扱い、保存も送信もしません</span>
          </button>
        ) : (
          <div className="space-y-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={picked.url} alt="選んだ画像のプレビュー" className="mx-auto max-h-[50dvh] rounded-xl border border-line object-contain" />
            <p className="truncate text-center text-[12px] text-ink-3">
              {picked.name}（{Math.round(picked.size / 1024)}KB）
            </p>
            {picked.dupOf.length > 0 && (
              <div role="alert" className="rounded-xl border border-warn/40 bg-warn-soft p-3 text-[13px]">
                <p className="flex items-center gap-1.5 font-bold text-warn">
                  <IconAlert className="size-4" />
                  この画像はすでに取り込んでいます
                </p>
                <ul className="mt-1">
                  {picked.dupOf.map((t) => (
                    <li key={t.id}>
                      {formatDateJa(t.date)} {formatYen(t.amount)} {t.merchant}
                    </li>
                  ))}
                </ul>
                <p className="mt-1 text-ink-2">別の支出として登録するときだけ、先に進んでください。</p>
              </div>
            )}
            <div className="grid grid-cols-2 gap-2">
              <Button variant="secondary" onClick={clear}>
                取り消す
              </Button>
              <Button onClick={startEntry}>入力へ進む</Button>
            </div>
          </div>
        )}
        {error && (
          <div role="alert" className="mt-3 space-y-2 rounded-xl bg-expense-soft px-3 py-2">
            <p className="text-[14px] font-medium text-danger">{error}</p>
            <Button variant="secondary" onClick={() => ui.openTx({ mode: "new", type: "expense" })} className="w-full">
              画像なしで手入力する
            </Button>
          </div>
        )}
      </Card>
    </main>
  );
}
