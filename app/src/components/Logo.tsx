// くらしベース（KURASHI BASE）のシンボル：家の屋根・4つの窓・V字の生活の土台。
// 参考画像（v5 パックの brand_reference）から起こした「再現案」。正式なロゴの原本ではない（docs/BRAND_IMPLEMENTATION_REPORT.md）。
// 色はブランドの指定（ネイビー #0B2545、ブルー #3B82F6、スカイ #7DB8FF、シアン #A8E6FF、ティール #34C3B1）。
// アプリの配色（緑）は変えず、ロゴの中だけでブランドの色を使う。

import { useId } from "react";

export const BRAND = {
  name: "くらしベース",
  en: "KURASHI BASE",
  message: "暮らしの面倒を、ひとつに。",
  navy: "#0B2545",
  blue: "#3B82F6",
  sky: "#7DB8FF",
  cyan: "#A8E6FF",
  teal: "#34C3B1",
} as const;

/** シンボルの SVG の中身（アイコン・ファビコンと共通） */
export function symbolSvg(gradId = "kb-v"): string {
  return `<defs><linearGradient id="${gradId}" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="${BRAND.sky}"/><stop offset="1" stop-color="${BRAND.teal}"/></linearGradient></defs>
<path d="M14 41V26L32 10L50 26V41" fill="none" stroke="${BRAND.navy}" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"/>
<rect x="23" y="22" width="8" height="8" rx="1.6" fill="${BRAND.blue}"/>
<rect x="33" y="22" width="8" height="8" rx="1.6" fill="${BRAND.cyan}"/>
<rect x="23" y="32" width="8" height="8" rx="1.6" fill="${BRAND.sky}"/>
<rect x="33" y="32" width="8" height="8" rx="1.6" fill="${BRAND.teal}"/>
<path d="M7 45L32 55L57 45" fill="none" stroke="url(#${gradId})" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"/>`;
}

export function LogoMark({ size = 28, className = "" }: { size?: number; className?: string }) {
  const id = `kb-v-${useId().replace(/:/g, "")}`;
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      className={className}
      role="img"
      aria-label="くらしベースのロゴ"
      dangerouslySetInnerHTML={{ __html: symbolSvg(id) }}
    />
  );
}

/** 横組み：シンボル＋「くらしベース」＋小さく KURASHI BASE */
export function LogoLockup({ size = 30, showEn = true }: { size?: number; showEn?: boolean }) {
  return (
    <span className="inline-flex items-center gap-2">
      <LogoMark size={size} />
      <span className="flex flex-col leading-none">
        <span className="text-[19px] font-bold tracking-tight" style={{ color: "var(--logo-ink)" }}>
          {BRAND.name}
        </span>
        {showEn && (
          <span className="mt-1 text-[9px] font-semibold tracking-[0.28em] text-ink-3" aria-hidden="true">
            {BRAND.en}
          </span>
        )}
      </span>
    </span>
  );
}
