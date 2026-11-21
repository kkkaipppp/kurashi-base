# Claude Code自律実行手順

## 開始時
1. `pwd` とgit状態・branch・node/npmの実行環境を確認。ユーザーの未コミット変更を無断破棄しない。
2. 対象v2の `docs/FEATURE_BOX_STATUS.md`, `docs/TEST_REPORT.md`, `docs/JAPANESE_COPY_AUDIT.md`, `app/src` の状況を読む。
3. `cd app && npm run check` を実行しBASELINEとして記録（node_modules不足など実行不可なら理由をNOT_RUN）。
4. 現状の重要データテスト/移行テストとUI画面を記録。可能ならスクリーンショットでbeforeを保存。
5. `10_PARENT_WBS.csv` の行を初期化し、`NOT_STARTED` / `IN_PROGRESS` / `DONE` / `BLOCKED` / `NOT_RUN` の5種で更新する。

## 実装順（安全な小単位）
- **M1** 復元データ保護。テストを先に作る。合成が危険なら追加復元を一時停止/明示。
- **M2** 画面を旧UXに近づける：ホームの優先情報、全画面共通＋、カレンダー日別の記録、振り返り/レポート。
- **M3** 今日のナビ、固定費、メニュー導線を最短化。
- **M4** 自然な日本語、未実装の誤認防止、スマホフォーム。
- **M5** 回帰/追加テスト、親WBS/報告。

各タスクは 変更前の挙動 → 変更点 → テスト → PASS/FAIL/NOT_RUN → Git SHA の順に記録。前段のデータ保護がFAILのままユーザー向けGOにしない。

## 自律判断
- 明白な不具合、既存コンポーネントを使ったUX小改善、自動テスト作成・修正は自律実行。
- 意見が分かれる情報設計は「データ保護」「日常の最短導線」「既存機能非破壊」「未実装誤認防止」の順で選ぶ。代替案をdecision logに記録。
- 権限外フォルダ、公開URL、新サービス接続、npm install等の通信/依存追加、強制リセット、既存データ破壊、本番デプロイを伴う場合は確認待ちとして保留し、安全な別タスクへ移る。
- チェックが通らなければ原因調査→修正→再実行を基本とし、見せかけのテスト変更/skipでPASSにしない。

## 終了
- `docs/UX_AUTONOMOUS_REPORT.md` を完成（修正ファイル/動線Before-After/根拠のあるテスト/残課題/未確認iPhone項目）。
- `docs/UX_TEST_RESULT.md`、`docs/UX_BUGS.md`、`docs/UX_NEXT_ACTIONS.md` を残す。
- 親フォルダ `00_全体進捗/暮らしベース/` へ最新WBS/ROADMAP/STATUSを同期。権限がなければ `docs/parent_progress_export/` に出力。
- 停止や中断時でも、作業記録と次に再開するコマンドを残す。
