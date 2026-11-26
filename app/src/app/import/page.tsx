"use client";

import { useEffect, useRef, useState } from "react";
import { useData } from "@/lib/store";
import { fingerprintBytes } from "@/lib/duplicates";
import { formatDateJa } from "@/lib/date";
import { formatYen } from "@/lib/money";
import { parseReceipt } from "@/lib/receiptParse";
import { imageToBase64 } from "@/lib/imageScale";
import { NativeBridge } from "@/lib/nativeBridge";
import { useIsNativeApp } from "@/lib/platform";
import { todayStr } from "@/lib/date";
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
  const native = useIsNativeApp();
  // 文字の読み取り（iPhone アプリだけ）：読み取った行と、そこから出した候補。取引は、本人が入力画面で確認して保存するまで作らない
  const [ocr, setOcr] = useState<{ lines: string[] } | null>(null);
  const [ocrBusy, setOcrBusy] = useState(false);
  const fileRef = useRef<File | null>(null);

  // プレビューURLを解放
  useEffect(() => () => {
    if (picked) URL.revokeObjectURL(picked.url);
  }, [picked]);

  const clear = () => {
    setPicked(null);
    setOcr(null);
    fileRef.current = null;
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
      fileRef.current = f;
      setPicked({ url: URL.createObjectURL(f), name: f.name, size: f.size, fingerprint: fp, dupOf });
    } catch {
      setError("画像を読み込めませんでした。別の画像を選ぶか、手で入力してください");
    } finally {
      setReading(false);
    }
  };

  // 画像の文字を読み取り、日付・合計・店名の「候補」を入力欄に入れて入力画面を開く（確認して保存するのは本人）
  const readText = async () => {
    if (!picked || !fileRef.current) return;
    setOcrBusy(true);
    try {
      const image = await imageToBase64(fileRef.current);
      const { lines } = await NativeBridge.recognizeText({ image });
      setOcr({ lines });
      const g = parseReceipt(lines, todayStr());
      if (!g.amount && !g.merchant && !g.date) {
        ui.toast("文字は読めましたが、日付・金額・店名の候補が見つかりませんでした。画像を見ながら入力してください", "error");
        return;
      }
      // 候補の確かさを、はっきり知らせる（読み間違いを、確定した値に見せない）
      const doubts = [
        g.amount && g.amountConfidence === "low" ? "金額は自信がありません" : "",
        !g.date ? "日付は読めなかったので、今日の日付が入ります" : "",
        !g.amount ? "金額は読めませんでした" : "",
        !g.merchant ? "店名は読めませんでした" : "",
      ].filter(Boolean);
      if (doubts.length) ui.toast(`${doubts.join("。")}。画像と照らして確かめてください`, "error");
      ui.openTx({
        mode: "new",
        type: "expense",
        title: "読み取った候補を確認",
        date: g.date ?? undefined,
        initial: { amount: g.amount ? String(g.amount) : "", merchant: g.merchant ?? "", note: "" },
        source: "image",
        sourceFingerprint: picked.fingerprint,
        previewUrl: picked.url,
        onSaved: clear,
      });
    } catch {
      ui.toast("文字を読み取れませんでした。画像を見ながら入力してください", "error");
    } finally {
      setOcrBusy(false);
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
          {native ? (
            <>
              <span className="font-bold text-brand">文字の読み取りは、iPhone の中だけで行います。</span>
              画像の文字から、日付・金額・店名の「候補」を入力欄に入れます。読み間違いがあるので、必ず確かめてから保存してください（保存するまで、記録は追加されません）。
            </>
          ) : (
            <>
              <span className="font-bold text-warn">文字の自動読み取り（OCR）は、まだありません。</span>
              画像を見ながら金額・日付・店名を入力します。保存するまで、記録は追加されません。
            </>
          )}
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
                <p className="mt-1 text-ink-2">別の支出として追加するときだけ、先に進んでください。</p>
              </div>
            )}
            <div className="grid grid-cols-2 gap-2">
              <Button variant="secondary" onClick={clear}>
                取り消す
              </Button>
              <Button variant={native ? "secondary" : "primary"} onClick={startEntry}>
                {native ? "手で入力する" : "入力へ進む"}
              </Button>
            </div>
            {native && (
              <Button onClick={readText} disabled={ocrBusy} className="w-full" aria-busy={ocrBusy}>
                {ocrBusy ? "読み取り中…" : "文字を読み取って、候補を入れる"}
              </Button>
            )}
            {ocr && (
              <details className="rounded-xl bg-surface-2 px-3 py-1 text-[12px]">
                <summary className="min-h-11 cursor-pointer py-2 font-semibold text-ink-2">読み取った文字（{ocr.lines.length}行）</summary>
                <pre className="mb-2 max-h-48 overflow-auto whitespace-pre-wrap break-all">{ocr.lines.join("\n")}</pre>
              </details>
            )}
          </div>
        )}
        {error && (
          <div role="alert" className="mt-3 space-y-2 rounded-xl bg-expense-soft px-3 py-2">
            <p className="text-[14px] font-medium text-danger">{error}</p>
            <Button variant="secondary" onClick={() => ui.openTx({ mode: "new", type: "expense" })} className="w-full">
              画像なしで入力する
            </Button>
          </div>
        )}
      </Card>
    </main>
  );
}
