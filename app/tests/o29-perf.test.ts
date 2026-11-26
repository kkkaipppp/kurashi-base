import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { perfData } from "@/lib/perfData";
import { runBench } from "@/lib/perfBench";
import { emptyData } from "@/lib/defaults";

// o29 04（外部・性能）：0/100/1000/10000/68000/100000/250000件で p50・p95・大きさ・メモリを測る。
// ふだんの npm run check では動かさない（250,000件は数分かかる）。測るとき：KB_PERF_O29=1 npx vitest run tests/o29-perf.test.ts
// 合成データ（lib/perfData.ts。1年あたり約2,400件）。本物の記録には触れない。結果は docs/design/o29/PERF_RESULT.md に書く
const TARGETS = [0, 100, 1000, 10000, 68000, 100000, 250000];
const PER_YEAR = 2400;

describe.runIf(process.env.KB_PERF_O29 === "1")("o29 性能の測定（件数ごと）", () => {
  it("件数ごとに、主な計算の p50・p95 と保存の大きさを測る", () => {
    const lines: string[] = [
      "# o29 性能の測定結果",
      "",
      `- 測った日：${new Date().toISOString().slice(0, 10)}・環境：Node ${process.version}（${process.platform}）。iPhone の実機ではない（未確認）`,
      "- 合成データ（lib/perfData.ts）。各計算を7回測り、p50（真ん中）と p95（7回のうち最も遅い回に近い値）を出した",
      "- 「最も遅い計算」は、画面を開いたときに走る計算（benchCases の 25 種類）のうち、p50 がいちばん長いもの",
      "",
      "| 目標の件数 | 実際の記録の件数 | 保存の大きさ | ヒープの増え | 合計 p50 | 合計 p95 | 最も遅い計算 | その p50 | その p95 |",
      "|---|---|---|---|---|---|---|---|---|",
    ];
    for (const n of TARGETS) {
      const before = process.memoryUsage().heapUsed;
      const d = n === 0 ? emptyData("2026-11-25T00:00:00.000Z") : perfData(n / PER_YEAR);
      const heap = process.memoryUsage().heapUsed - before;
      const runs = n >= 100000 ? 3 : 7;
      const all: number[][] = [];
      let last = runBench(d, "2026-11-25", { runs: 1 });
      for (let i = 0; i < runs; i++) {
        last = runBench(d, "2026-11-25", { runs: 1 });
        all.push(last.rows.map((r) => r.ms));
      }
      const pct = (xs: number[], p: number) => {
        const s = [...xs].sort((a, b) => a - b);
        return s[Math.min(s.length - 1, Math.ceil((p / 100) * s.length) - 1)];
      };
      const names = last.rows.map((r) => r.name);
      const per = names.map((_, j) => all.map((row) => row[j]));
      const totals = all.map((row) => row.reduce((a, b) => a + b, 0));
      const p50s = per.map((xs) => pct(xs, 50));
      const worst = p50s.indexOf(Math.max(...p50s));
      const mb = (b: number) => `${(b / 1024 / 1024).toFixed(2)}MB`;
      lines.push(
        `| ${n.toLocaleString("ja-JP")} | ${last.records.toLocaleString("ja-JP")} | ${mb(last.dataBytes)} | ${mb(Math.max(0, heap))} | ${pct(totals, 50).toFixed(0)}ms | ${pct(totals, 95).toFixed(0)}ms | ${names[worst]} | ${p50s[worst].toFixed(1)}ms | ${pct(per[worst], 95).toFixed(1)}ms |`,
      );
      expect(last.records).toBeGreaterThanOrEqual(0);
    }
    writeFileSync(join(__dirname, "..", "..", "docs", "design", "o29", "PERF_RESULT.md"), lines.join("\n") + "\n");
  }, 1_800_000);
});
