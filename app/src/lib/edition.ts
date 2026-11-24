/**
 * くらしベースの「版」：personal（平尾さんの自分用）と public（友人β・Vercel の公開版）。
 * 組み立てるときに決まり（next.config.ts の NEXT_PUBLIC_KB_EDITION）、画面の設定では切り替えない（友人が触れないように）。
 * - personal：iPhone の自分用アプリ（npm run build:app）と、パソコンでの試し（npm run dev）
 * - public：Vercel の公開版（何も付けずに npm run build）
 * 新しい機能は、まず personal だけで有効にして平尾さんが使い、公開するものを平尾さんが決めてから public でも有効にする
 * （2026-11-24 平尾さんの方針）。public のビルドでは、無効な機能の部分は `if (FEATURES.xxx)` の中ごと消える。
 */
export type Edition = "personal" | "public";

export const EDITION: Edition = process.env.NEXT_PUBLIC_KB_EDITION === "personal" ? "personal" : "public";
export const IS_PERSONAL = EDITION === "personal";

/** 機能ごとに、どの版で有効か。public を true にするのは、平尾さんが公開を決めてから（友人β用の確認表で点検する） */
export const FEATURE_EDITIONS = {
  /** カレンダー用ファイル（.ics）の書き出し（2026-11-24 公開済み） */
  calendarFile: { personal: true, public: true },
  /** 家計簿の CSV の取り込み（2026-11-24 公開済み） */
  csvImport: { personal: true, public: true },
  /** 振り返りの「週」「年」の収支（2026-11-24 平尾さん。まず自分用だけ） */
  periodReport: { personal: true, public: false },
} as const satisfies Record<string, Record<Edition, boolean>>;

export type FeatureName = keyof typeof FEATURE_EDITIONS;

export const FEATURES: Record<FeatureName, boolean> = Object.fromEntries(
  Object.entries(FEATURE_EDITIONS).map(([k, v]) => [k, v[EDITION]]),
) as Record<FeatureName, boolean>;
