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
const PAD_R = 6;
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
  const top = Math.max(1, ...rows.flatMap((r) => [r.expense, r.income]), ...lineCum);
  const bottom = Math.min(0, ...lineCum);
  const span = top - bottom || 1;
  const plotW = W - PAD_L - PAD_R;
  const plotH = H - PAD_T - PAD_B;
  const y = (v: number) => PAD_T + ((top - v) / span) * plotH;
  const slot = plotW / Math.max(1, rows.length);
  const barW = Math.max(2, Math.min(12, slot * 0.32));
  const cx = (i: number) => PAD_L + slot * i + slot / 2;
  const zero = y(0);
  const line = lineCum.map((v, i) => `${i === 0 ? "M" : "L"}${cx(i).toFixed(1)},${y(v).toFixed(1)}`).join(" ");
  const showLabel = (i: number) => rows.length <= 12 || i % Math.ceil(rows.length / 12) === 0;

  return (
    <figure className="space-y-2">
      <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label={`${title}の縦の棒グラフと、${lineLabel}の推移`}>
        {/* 目盛りの線：上・0・下 */}
        {[top, 0, ...(bottom < 0 ? [bottom] : [])].map((v, k) => (
          <g key={k}>
            <line x1={PAD_L} x2={W - PAD_R} y1={y(v)} y2={y(v)} stroke="var(--line)" strokeWidth={v === 0 ? 1 : 0.6} strokeDasharray={v === 0 ? undefined : "3 3"} />
            <text x={PAD_L - 4} y={y(v) + 3} textAnchor="end" fontSize="9" fill="var(--ink-3)">
              {shortAmount(v)}
            </text>
          </g>
        ))}
        {rows.map((r, i) => (
          <g key={r.label + i}>
            {r.strong && <rect x={cx(i) - slot / 2 + 1} y={PAD_T} width={slot - 2} height={plotH} rx={4} fill="var(--brand-soft)" />}
            {r.expense > 0 && <rect x={cx(i) - barW - 0.5} y={y(r.expense)} width={barW} height={Math.max(1, zero - y(r.expense))} rx={1.5} fill="var(--expense)" />}
            {r.income > 0 && <rect x={cx(i) + 0.5} y={y(r.income)} width={barW} height={Math.max(1, zero - y(r.income))} rx={1.5} fill="var(--income)" />}
            {showLabel(i) && (
              <text x={cx(i)} y={H - 6} textAnchor="middle" fontSize="9" fill={r.strong ? "var(--ink)" : "var(--ink-3)"} fontWeight={r.strong ? 700 : 400}>
                {r.label}
              </text>
            )}
          </g>
        ))}
        <path d={line} fill="none" stroke="var(--event)" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
        {lineCum.map((v, i) => (
          <circle key={i} cx={cx(i)} cy={y(v)} r={2.2} fill="var(--event)" />
        ))}
      </svg>
      <figcaption className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-[11px] text-ink-3">
        <span className="flex items-center gap-1">
          <span className="inline-block size-2.5 rounded-sm bg-expense" />支出
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block size-2.5 rounded-sm bg-income" />収入
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block h-0.5 w-3 rounded bg-event" />
          {lineLabel}
        </span>
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
