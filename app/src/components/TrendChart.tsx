import Link from "next/link";
import { formatSignedYen, formatYen } from "@/lib/money";

/**
 * 縦の棒グラフ（支出＝赤・収入＝青）。収支の累計は、折れ線ではなく「数字で見る」の表に出す（2026-11-25 平尾さんの指示）。
 * 振り返りの「週」「年」で使う（2026-11-24 平尾さん：縦の棒グラフと推移見たい）。
 * 数字は下の表にも出す（読み上げ・細かい金額のため）。
 */
export interface TrendRow {
  label: string; // 目盛りの文字（例「3月」「11/23」「月」）
  expense: number;
  income: number;
  strong?: boolean; // 今日・今月など
  future?: boolean; // まだ来ていない日・月（折れ線を引かない）
}

const W = 340;
const H = 190;
const PAD_L = 34;
const PAD_R = 36;
const PAD_T = 10;
const PAD_B = 22;

/** 目盛りの金額を短く（12万、3.5万、8,000） */
export function shortAmount(n: number): string {
  const a = Math.abs(n);
  const sign = n < 0 ? "-" : "";
  if (a >= 100_000_000) return `${sign}${Math.round(a / 100_000_000)}億`;
  if (a >= 100_000) return `${sign}${Math.round(a / 10_000)}万`;
  if (a >= 10_000) return `${sign}${(a / 10_000).toFixed(1).replace(/\.0$/, "")}万`;
  return `${sign}${a.toLocaleString("ja-JP")}`;
}

/** 収支の累計（推移の折れ線） */
export function cumulativeBalance(rows: TrendRow[]): number[] {
  let sum = 0;
  return rows.map((r) => (sum += r.income - r.expense));
}

export function TrendChart({ rows, title, lineLabel = "収支の累計" }: { rows: TrendRow[]; title: string; lineLabel?: string }) {
  const cum = cumulativeBalance(rows);
  // 累計は、まだ来ていない日・月の手前まで（表の「累計」の合計の行に使う）
  const lineLen = rows.findIndex((r) => r.future) === -1 ? rows.length : rows.findIndex((r) => r.future);
  const lineCum = cum.slice(0, lineLen);
  // 棒グラフだけ（2026-11-25 平尾さん「紫の線がわけわからん」→ 紫の累計の線をやめた。累計は「数字で見る」の表に残す）
  const barMax = Math.max(1, ...rows.flatMap((r) => [r.expense, r.income]));
  const plotW = W - PAD_L - PAD_R;
  const plotH = H - PAD_T - PAD_B;
  const yb = (v: number) => PAD_T + (1 - v / barMax) * plotH;
  const slot = plotW / Math.max(1, rows.length);
  const barW = Math.max(2, Math.min(12, slot * 0.32));
  const cx = (i: number) => PAD_L + slot * i + slot / 2;
  const base = yb(0);
  const empty = rows.every((r) => r.expense === 0 && r.income === 0);
  const totalExpense = rows.reduce((a, r) => a + r.expense, 0);
  const totalIncome = rows.reduce((a, r) => a + r.income, 0);
  // 目盛りの文字が重ならないよう、いちばん長い文字の幅に合わせて間引く（最後と、今日・今月は必ず出す）。
  // 2026-11-24 実機で「12週の推移」の日付が重なった
  const labelW = Math.max(...rows.map((r) => r.label.length)) * 5.6 + 4;
  const step = Math.max(1, Math.ceil(labelW / slot));
  const showLabel = (i: number) => rows[i].strong || ((rows.length - 1 - i) % step === 0 && !rows.slice(i + 1, i + step).some((r) => r.strong));

  if (empty) {
    return (
      <div className="rounded-xl bg-surface-2 px-3 py-6 text-center">
        <p className="text-[14px] text-ink-2">この期間は、まだ記録がありません</p>
        <Link href="/?add=expense" className="mt-2 inline-flex min-h-11 items-center rounded-xl bg-brand px-4 text-[14px] font-semibold text-brand-ink">
          支出を追加
        </Link>
      </div>
    );
  }
  return (
    <figure className="space-y-2">
      <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label={`${title}の縦の棒グラフ（支出と収入）`}>
        {/* 棒の目盛り（左）：上と0 */}
        {[barMax, 0].map((v, k) => (
          <g key={`b${k}`}>
            <line x1={PAD_L} x2={W - PAD_R} y1={yb(v)} y2={yb(v)} stroke="var(--line)" strokeWidth={v === 0 ? 1 : 0.6} strokeDasharray={v === 0 ? undefined : "3 3"} />
            <text x={PAD_L - 4} y={yb(v) + 3} textAnchor="end" fontSize="9" fill="var(--ink-3)">
              {shortAmount(v)}
            </text>
          </g>
        ))}
        {rows.map((r, i) => (
          <g key={r.label + i}>
            {r.strong && <rect x={cx(i) - slot / 2 + 1} y={PAD_T} width={slot - 2} height={plotH} rx={4} fill="var(--brand-soft)" />}
            {r.expense > 0 && <rect x={cx(i) - barW - 0.5} y={yb(r.expense)} width={barW} height={Math.max(1, base - yb(r.expense))} rx={1.5} fill="var(--expense)" />}
            {r.income > 0 && <rect x={cx(i) + 0.5} y={yb(r.income)} width={barW} height={Math.max(1, base - yb(r.income))} rx={1.5} fill="var(--income)" />}
            {showLabel(i) && (
              <text x={cx(i)} y={H - 6} textAnchor="middle" fontSize="9" fill={r.strong ? "var(--ink)" : "var(--ink-3)"} fontWeight={r.strong ? 700 : 400}>
                {r.label}
              </text>
            )}
          </g>
        ))}
      </svg>
      <figcaption className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-[11px] text-ink-3">
        <span className="flex items-center gap-1">
          <span className="inline-block size-2.5 rounded-sm bg-expense" />支出（棒）
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block size-2.5 rounded-sm bg-income" />収入（棒）
        </span>
        <span className="w-full text-center">単位は円。収支の累計は、下の「数字で見る」にあります</span>
      </figcaption>
      <details className="rounded-xl bg-surface-2 px-3 py-1 text-[12px]">
        <summary className="min-h-9 cursor-pointer py-2 font-semibold text-ink-2">数字で見る</summary>
        <table className="num mb-2 w-full">
          <caption className="sr-only">{lineLabel}</caption>
          <thead>
            <tr className="text-ink-3">
              <th className="py-1 text-left font-semibold"> </th>
              <th className="py-1 text-right font-semibold">支出</th>
              <th className="py-1 text-right font-semibold">収入</th>
              <th className="py-1 text-right font-semibold">累計</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={r.label + i} className={r.strong ? "font-bold" : ""}>
                <td className="py-0.5">{r.label}</td>
                <td className="py-0.5 text-right text-expense">{r.expense ? formatYen(r.expense) : "—"}</td>
                <td className="py-0.5 text-right text-income">{r.income ? formatYen(r.income) : "—"}</td>
                <td className={`py-0.5 text-right ${cum[i] < 0 ? "text-expense" : ""}`}>{r.future ? "—" : formatSignedYen(cum[i])}</td>
              </tr>
            ))}
          </tbody>
          {/* 期間の合計（グラフの数字と合っているかを確かめられる。NEXT v21 CH:G08） */}
          <tfoot>
            <tr className="border-t border-line font-bold">
              <td className="py-1">合計</td>
              <td className="py-1 text-right text-expense">{formatYen(totalExpense)}</td>
              <td className="py-1 text-right text-income">{formatYen(totalIncome)}</td>
              <td className={`py-1 text-right ${(lineCum.at(-1) ?? 0) < 0 ? "text-expense" : ""}`}>{lineCum.length ? formatSignedYen(lineCum.at(-1) ?? 0) : "—"}</td>
            </tr>
          </tfoot>
        </table>
        {/* 数字の根拠（何を数えているか。NEXT v21 CH:G01） */}
        <p className="mb-2 text-[12px] text-ink-3">支出・収入はこの期間に記録したものの合計です（投資として数えた支出も含みます。予算と比べる「生活費」とは別の数字です）。まだ来ていない日・月は数えません。</p>
      </details>
    </figure>
  );
}
