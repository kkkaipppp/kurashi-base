"use client";

import { useState } from "react";
import { useUI } from "@/components/UIContext";
import { Button, Card, Empty, PageHeader, SectionTitle } from "@/components/ui";
import { FEATURES } from "@/lib/edition";
import { todayStr } from "@/lib/date";
import { perfData, PERF_YEARS } from "@/lib/perfData";
import { benchText, runBench } from "@/lib/perfBench";
import { measureIdb } from "@/lib/perfIdb";
import { isNativeApp } from "@/lib/platform";

/**
 * 性能を測る（自分用。o11 A08）。
 * 合成データ（1・5・10・30年分）をメモリの中で作り、主な計算の時間と、保存の大きさ、IndexedDB に書いて読む時間を測る。
 * 本物の記録は読みも書きもしない（測るための IndexedDB は別の名前で作り、終わったら消す）。外へは何も送らない
 */
const wait = () => new Promise((r) => setTimeout(r, 30));
const mb = (b: number) => `${(b / 1024 / 1024).toFixed(1)}MB`;

export default function PerfPage() {
  const ui = useUI();
  const [busy, setBusy] = useState<string | null>(null);
  const [out, setOut] = useState<string[]>([]);

  if (!FEATURES.perfLab) {
    return (
      <main>
        <PageHeader title="性能を測る" />
        <Empty>この版では、まだ使えません</Empty>
      </main>
    );
  }

  const env = () => `${isNativeApp() ? "iPhone アプリ" : "ブラウザ"}・${new Date().toLocaleString("ja-JP")}・${navigator.userAgent.slice(0, 80)}`;

  const run = async (years: readonly number[]) => {
    setBusy("準備しています");
    setOut([]);
    const lines: string[] = [];
    try {
      const est = await navigator.storage?.estimate?.().catch(() => null);
      if (est) lines.push(`【端末の保存】使用 ${mb(est.usage ?? 0)}・上限の目安 ${mb(est.quota ?? 0)}`);
      for (const y of years) {
        setBusy(`${y}年分を作っています`);
        await wait();
        const t0 = performance.now();
        const d = perfData(y, todayStr());
        const gen = performance.now() - t0;
        setBusy(`${y}年分を測っています（画面が少し止まります）`);
        await wait();
        const r = runBench(d, todayStr());
        let idb = "IndexedDB：測れませんでした";
        try {
          const json = JSON.stringify(d);
          const t = await measureIdb(indexedDB, json);
          idb = `IndexedDB：書く ${t.writeMs.toFixed(0)}ms・読む ${t.readMs.toFixed(0)}ms・${t.same ? "中身は同じ" : "中身が違う！"}`;
        } catch (e) {
          idb = `IndexedDB：失敗（${e instanceof Error ? e.message : "不明"}）`;
        }
        lines.push(benchText(`${y}年分`, r, `作るのに ${gen.toFixed(0)}ms`), idb);
        setOut([...lines]);
      }
      lines.push(`（${env()}）`);
      setOut([...lines]);
    } finally {
      setBusy(null);
    }
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(out.join("\n"));
      ui.toast("コピーしました");
    } catch {
      ui.toast("コピーできませんでした。文字を長押しして、選んでコピーしてください", "error");
    }
  };

  return (
    <main className="space-y-4">
      <PageHeader title="性能を測る" />
      <Card>
        <SectionTitle>合成データで測る</SectionTitle>
        <p className="text-[13px] text-ink-2">
          1・5・10・30年分の作り物のデータを、この画面の中だけで作って、計算と保存にかかる時間を測ります。今の記録は読みも書きもしません。測るあいだ、画面が数秒〜数十秒止まることがあります。
        </p>
        <div className="mt-3 grid grid-cols-2 gap-2">
          {PERF_YEARS.map((y) => (
            <Button key={y} variant="secondary" disabled={!!busy} onClick={() => run([y])}>
              {y}年分
            </Button>
          ))}
          <Button className="col-span-2" disabled={!!busy} onClick={() => run(PERF_YEARS)}>
            全部を順に測る
          </Button>
        </div>
        {busy && (
          <p role="status" className="mt-3 text-[13px] font-semibold">
            {busy}…
          </p>
        )}
      </Card>
      {out.length > 0 && (
        <Card>
          <SectionTitle>結果</SectionTitle>
          <pre className="max-h-[60vh] overflow-auto rounded-xl bg-surface-2 p-3 text-[12px] whitespace-pre-wrap break-all" aria-label="測った結果">
            {out.join("\n")}
          </pre>
          <Button onClick={copy} className="mt-2 w-full" disabled={!!busy}>
            コピーする
          </Button>
        </Card>
      )}
    </main>
  );
}
