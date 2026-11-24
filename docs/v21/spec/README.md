# KURASHI BASE NEXT v21 最終設計引継ぎ
基準 d756cbc / 2026-11-25。v1–v20設計承認済み。v21横断裁定を追加。ソース変更・試験・公開・課金なし。
全巻必須。同一フォルダに展開し CLAUDE_START.md → FINAL_INTEGRATION.md → READ_ORDER.csv の順。MANIFEST.sha256で検証。正本はFINAL_INTEGRATION、APPROVED_EVOLUTION、ROADMAP末尾のPhase0–6、QUALITY_GATE。旧提案・旧版・ZIP保留は履歴。Web/iOS差分はWEB_IOS_MATRIX。既存CLAUDE.mdを上書きしない。
## 以下は旧版の履歴（実行指示ではない）
# Claude Code 引継ぎ：NEXT 差分設計
対象 d756cbc。既存ソースを全面改修しない。COMPETITORS と SCREENS を ROADMAP/DESIGN に追加。旧計画と矛盾する場合、現行ナビ維持・自分用優先・公開版β後承認を優先。まずベースライン npm run check、実画面採取、課題の再現、差分見積もり。P0: 固定費照合と数字の一貫性、入力・データ保護、実機。P1: ホーム重複、履歴・設定・振り返り。P2: 自動取得の端末内試作、生活イベントモデル。既存データ移行・新規有料契約・公開版変更は承認まで行わない。各PRで変更前後画像、操作時間、テスト結果、未検証項目を記録。320/375/390/430px、文字拡大、VoiceOver、iPhoneキーボード、オフライン、バックアップ復元、ウィジェット実機を確認。未実施はNOT_RUN。資料のみでコード・ロードマップ原本は変更していない。

## v3 追補
APPROVED_EVOLUTION.md が最新の承認方針。旧資料と矛盾する場合はこちらを優先。ソース未変更。実装前に現行機能・型・保存形式との差分を確認する。

## v4 追補
GOAL_PLANNING.md は目標構造化・行動サジェスト・予定統合の最新設計。v3を維持し、独立タスク導線を新設しない。具体仕様は提案、実装・原本ロードマップ更新・実機試験は未実施。

## v5 追補
v4の目標・予定統合をユーザーが採用。LIFE_PLANNING.md は時間予算・目標関係・再計画・週次レビューの承認済み設計。既存資料の保護条件を継承。

## v6
CHANGELOG.md を変更履歴・差分一覧として追加。v5を承認済みに更新。実装前の現行棚卸し、品質ゲート、費用承認を維持。

## v7
JAPANESE_UX.md を追加。ユーザー向け文言の改善案を実装前に検証する。v6の方針を維持。コード未変更。

## v8
v7日本語改善は承認済み。PRODUCT_RISK_REVIEW.md は追加レビュー候補。承認後に既存WBSへ統合し、既存機能との重複を確認。

## v9
v8全案と維持・非採用方針を承認済みに更新。QUALITY_GATE.md の追加品質基準は提案。現行ナビ、予定統合前後、R3目標MVPの矛盾を修正。実装前に正本として確認しWBSへ反映。

## v10
v9品質ゲートを設計承認済みに更新。AUTOMATION_EXPERIENCE.md はv11で承認済み。既存WidgetSync/WidgetBridgeを活用し、OS共有と家族共有を混同しない。実装前に能力・権限・費用・端末別試験をWBSへ登録。ソース未変更。

## v11
DOMAIN_DEPTH.md を追加。専門領域の設計仮説を現行機能台帳と照合し、重複を新設せずD01–D12をWBSに追加する。ソース未変更。

## v12
A/B両ZIPを同じ作業フォルダに展開しINDEXを確認。INTERACTION_DEPTHとDELIVERY_PROCESSは新規提案。v11承認済み。

## v13
A/B同版を展開し、PLATFORM_FEASIBILITYとDECISION_SUPPORTを参照。P/V試験は未実施。Web/iOSの能力・費用を確認してから実装。

## v14 最新指示
APPROVED_EVOLUTION.md末尾とROADMAP.md末尾が旧記述に優先。CSV_IMPORT_DEPTH.mdを追加。最終引継ぎでは全ファイルのマニフェスト・読込順・仕様IDと試験ID対応・版一致・読了チェックを作成。分割数は容量に応じ決定し全巻必須。現在は未圧縮の設計作業版。

## v15
HELP_AND_RECOVERY.mdを必読に追加。CSV承認済み。H01–H10は提案・未試験。最終引継ぎ時に索引・マニフェストを再生成。

## v16 最新
v15承認済み。FREE_OPERATIONS.md と PRODUCT_VALUE_REVIEW.md は追加提案。Phase 0の費用/配布検証と価値レビューを並行管理。全試験未実施。索引はv16を使用。

## v17 追加資料
OPERATIONS_DEPTH.md と VALUE_DEPTH.md を参照。今回の20論点は提案。最終引継ぎでは全資料の版・依存・読了台帳を整備する。

## v18
v18: MAP_NAVIGATION.mdを地図・予定・旅行変更時の依存仕様として読む。ZIP保留。

## v19
FINANCIAL_CHARTS.mdを追加。地図設計承認済み。最新承認状態はAPPROVED_EVOLUTION.md末尾を優先。

## v20
v20はv19収支承認とカレンダー追加提案。最終引継ぎ時に全索引・承認状態・矛盾を照合する。
