import Link from "next/link";
import { formatSignedYen, formatYen } from "@/lib/money";

/**
 * 縦の棒グラフ（支出＝赤・収入＝青）と、収支の累計の折れ線（推移）。
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
  // 折れ線は、まだ来ていない日・月の手前まで
  const lineLen = rows.findIndex((r) => r.future) === -1 ? rows.length : rows.findIndex((r) => r.future);
  const lineCum = cum.slice(0, lineLen);
  // 棒（支出・収入）と累計の折れ線は、目盛りを分ける（レビュー o1 の P07：累計が大きいと棒が小さく見えるため）。
  // 棒の目盛りは左、累計の目盛りは右（紫）
  const barMax = Math.max(1, ...rows.flatMap((r) => [r.expense, r.income]));
  const lMax = Math.max(0, ...lineCum);
  const lMin = Math.min(0, ...lineCum);
  // 累計がずっと0のときは、線を棒の0と同じ高さ（下）に描く
  const lSpan = lMax - lMin || 1;
  const flat = lMax === lMin;
  const plotW = W - PAD_L - PAD_R;
  const plotH = H - PAD_T - PAD_B;
  const yb = (v: number) => PAD_T + (1 - v / barMax) * plotH;
  const yl = (v: number) => (flat ? PAD_T + plotH : PAD_T + ((lMax - v) / lSpan) * plotH);
  const slot = plotW / Math.max(1, rows.length);
  const barW = Math.max(2, Math.min(12, slot * 0.32));
  const cx = (i: number) => PAD_L + slot * i + slot / 2;
  const base = yb(0);
  const line = lineCum.map((v, i) => `${i === 0 ? "M" : "L"}${cx(i).toFixed(1)},${yl(v).toFixed(1)}`).join(" ");
  const empty = rows.every((r) => r.expense === 0 && r.income === 0);
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
      <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label={`${title}の縦の棒グラフと、${lineLabel}の推移`}>
        {/* 棒の目盛り（左）：上と0 */}
        {[barMax, 0].map((v, k) => (
          <g key={`b${k}`}>
            <line x1={PAD_L} x2={W - PAD_R} y1={yb(v)} y2={yb(v)} stroke="var(--line)" strokeWidth={v === 0 ? 1 : 0.6} strokeDasharray={v === 0 ? undefined : "3 3"} />
            <text x={PAD_L - 4} y={yb(v) + 3} textAnchor="end" fontSize="9" fill="var(--ink-3)">
              {shortAmount(v)}
            </text>
          </g>
        ))}
        {/* 累計の目盛り（右、紫）：いちばん上・いちばん下（0 をまたぐときは 0 の点線も） */}
        {lineCum.length > 0 &&
          [...new Set([lMax, lMin])].map((v, k) => (
            <text key={`l${k}`} x={W - PAD_R + 4} y={yl(v) + 3} textAnchor="start" fontSize="9" fill="var(--event)">
              {shortAmount(v)}
            </text>
          ))}
        {lineCum.length > 0 && lMin < 0 && lMax > 0 && (
          <line x1={PAD_L} x2={W - PAD_R} y1={yl(0)} y2={yl(0)} stroke="var(--event)" strokeOpacity={0.35} strokeWidth={0.8} strokeDasharray="2 3" />
        )}
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
        <path d={line} fill="none" stroke="var(--event)" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
        {lineCum.map((v, i) => (
          <circle key={i} cx={cx(i)} cy={yl(v)} r={2.2} fill="var(--event)" />
        ))}
      </svg>
      <figcaption className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-[11px] text-ink-3">
        <span className="flex items-center gap-1">
          <span className="inline-block size-2.5 rounded-sm bg-expense" />支出（棒）
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block size-2.5 rounded-sm bg-income" />収入（棒）
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block h-0.5 w-3 rounded bg-event" />
          {lineLabel}（線）
        </span>
        <span className="w-full text-center">単位は円。棒は左の目盛り、線は右の紫の目盛り</span>
      </figcaption>
      <details className="rounded-xl bg-surface-2 px-3 py-1 text-[12px]">
        <summary className="min-h-9 cursor-pointer py-2 font-semibold text-ink-2">数字で見る</summary>
        <table className="num mb-2 w-full">
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
        </table>
      </details>
    </figure>
  );
}
