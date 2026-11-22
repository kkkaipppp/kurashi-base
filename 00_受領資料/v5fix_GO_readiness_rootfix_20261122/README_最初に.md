# くらしベース｜友人β GO達成パック

対象：ブランチ `beta/friend-v1`、基準コミット `a6e7f00`（添付 `kurashi-base_v5fix_a6e7f00.zip` に基づく）。

**このZIPはアプリ丸ごとの置き換えではありません。** 既存プロジェクトへの差分パッチ、回帰テスト、リリースゲート、Claude Code実行指示をまとめたものです。

## 最初に
1. 現行コードをコミットし、元データのバックアップを保存する。作業は新しいブランチで行う。
2. `00_CLAUDE_CODE_貼り付け用.txt` をClaude Codeに渡す。
3. `patches/*.patch` は必ず `git apply --check` を通す。自動適用できない場合、差分を目視で取り込む（丸ごと上書き禁止）。
4. `patches/eventConcurrency.ts` を `app/src/lib/`、`tests/go-data-deletion.test.ts` を `app/tests/` に配置する。
5. `cd app && npm ci && npm run check` を実行し、追加テストも実際に走ったことを確認する。
6. 本番に近いURLとiPhone Safariで `docs/02_必須受入シナリオ.md` を検証する。
7. `docs/03_GO判定と公開手順.md` の必須証拠が揃うまで「GO」と報告しない。

## ZIPの内容
- `patches/`：データ消去の検証と同一予定編集の競合防止の修正案（実コード差分）
- `tests/`：削除・復旧・同一予定の競合に関するVitest
- `docs/01_根本原因と修正仕様.md`：現行コードに基づく原因と対策
- `docs/02_必須受入シナリオ.md`：本当のユーザー操作でのテスト手順
- `docs/03_GO判定と公開手順.md`：証拠に基づくGO条件
- `docs/04_データ保存と将来DB.md`：localStorageの限界とDB移行のロードマップ
- `docs/05_初見UXと日本語.md`：1人・1週間の試用までに必要な操作体験
- `docs/06_WBSと改善順序.md`：進捗管理と実装順

## 何を保証できるか
本パック作成時点では、`storage.ts`と`eventConcurrency.ts`のTypeScriptコアを独立コンパイルし、データ消去・失敗時復旧・予定差分検査の基本シナリオを実行確認した。**フルビルド・追加Vitest・iPhone実機・Vercel公開URLの検証は実施していない。**

元ソースの設計を尊重し、`STORAGE_KEY=kurashi-base:data:v1` と `schemaVersion=2` は変更しない。友人β版のためだけに認証や外部DBを新設しない。
