# 暮らしベース v2 → 旧くらしカレンダー体験への再接近 / 自律改修パック

**2026-11-21｜対象：ユーザー提供 `kurashi-base_v2_64d4dbb.zip` のコード**

## 目的
データベース設計・カラーパレット・配置ピクセル値の指定はせず、以前の「くらしカレンダー」の *画面の伝わり方、日々の操作の軽さ、文言、予定と家計を1か所で見る導線* を現行の暮らしベースv2に再現・向上させる。今ある機能は温存。完成優先ではなく、ユーザーが自然に使える状態にする。実動作しない機能を動くようには見せない。

## このZIPの使い方
1. 現在のリポジトリの `docs/ux-autonomous/` 以下へこのZIPの内容を展開。**アプリのソースは同梱せず、既存のソースコードを上書きしない。**
2. プロジェクト直下のClaude Codeへ `01_COPY_PASTE_TO_CLAUDE.txt` 全文を貼る。
3. 作業終了時に `docs/UX_AUTONOMOUS_REPORT.md` / `docs/UX_BUGS.md` / `docs/UX_TEST_RESULT.md` / `docs/UX_NEXT_ACTIONS.md` と親フォルダ用のロードマップ/WBS更新版を回収。

## 優先文書
`01_COPY_PASTE_TO_CLAUDE.txt` → `02_PRODUCT_VISION.md` → `03_OLD_UI_REFERENCE_AND_USER_FLOWS.md` → `04_GAP_BACKLOG.md` → `05_SAFETY_REVIEW.md` → `06_ACCEPTANCE_SCENARIOS.md` → `07_JAPANESE_COPY.md` → `08_AUTONOMOUS_WORKFLOW.md` → `09_RELEASE_ROADMAP.md` → `10_PARENT_WBS.csv`。

## 画像の位置付け
`reference_ui/` 内4枚は、以前のくらしカレンダーに関する**参考ビジュアル**（企画/紹介画面）。旧アプリの実際の全画面・最終確定版コードと同一とは保証しない。画面画像から確定できない部分は、現行データ/コードと今回のUX要件を優先。新規の画面レイアウトを丸写しするのではなく、操作設計と情報の優先順位を参考にする。

## 絶対に変えてはいけないこと
- 既存の取引、予定、固定費、予算、カテゴリ、タスク、NISA、資格記録などの保存データを消さない
- DBの移設、全面的なデータモデルの変更、新サービス/API課金、ログイン導入、本番公開は今回しない
- ユーザー確認なしの `localStorage` 初期化・全削除・バックアップ上書き・強制push/force resetは禁止
- 現行の見た目の色/配置を指定値で上書きするのではなく、比較してユーザーが伝えたUXを実装
- OCR/PWA/iOSウィジェット/同期/AI/共有の本実装は今回の対象外
- 報告に虚偽の PASS や「実機確認済み」を書かない
