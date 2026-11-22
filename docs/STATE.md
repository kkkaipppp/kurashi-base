# 現在地（STATE）— 暮らしベース

**このファイルが現在地の正本。** セッションの終わりに必ず更新する。（`docs/NEXT_SESSION_HANDOFF.md` は作りの要点、`docs/progress/STATUS.md` は WBS の集計用）

- 更新：2026-11-22
- ブランチ：`beta/friend-go`（`beta/friend-v1` の a6e7f00 から。master にはまだマージしていない。push もしていない）
- 段階：M4 スマホβ／M5 公開準備（ロードマップ `docs/progress/ROADMAP.md` の「友人β版」）
- **GO 準備の根本修正を取り込み済み**（ブランチ `beta/friend-go`、28a7c74〜。テスト191件 PASS、最終 ddb5dc3）。必須受入 B01〜B15 は 9 PASS・6 NOT_RUN（iPhone・公開 URL）で **NO-GO**。証拠：`docs/release/GO_EVIDENCE_20261122.md`
- **友人β 最終修正（P0 4件）を取り込み済み**（e005b04〜d4718ff、テスト159件 PASS、実画面のスクショは docs/screens/…_v5-fix_d4718ff）。判定は **NO-GO（条件付き：iPhone 実機で修正した流れ F07）**
- **v5（生活の機能とブランド）を実装**：ホーム3項目・予定の詳細・旅行・資格の学習・日本語・くらしベースのロゴ。受入105件は `docs/v5/ACCEPTANCE_V5.csv`。iPhone 実機で v5 の新しい画面も OK（11-22、平尾さん）。判定は **友人β GO 可（公開の判断待ち）**。ロゴは再現案で使うと決定（Q21）
- v4 時点の判定：**友人β GO 可（公開の承認待ち）**。iPhone 実機でキーボード・バックアップの確認が済んだ（11-22、平尾さん）。残りは公開の承認（`docs/BETA_RELEASE_REPORT.md`）／一般公開 NO-GO
- レビュー：チャッピー用 `_review/kurashi-base_v4_beta_a648199.zip`＋依頼文 v4 を渡した。返事が来たら差分を見て反映
- チェック：`cd app && npm run check` PASS（テスト159件、最終修正の後）
- 画面の記録：`docs/screens/index.html`（phase1〜v5 の全画面を同じ条件で撮って並べた。版の区切りごとに追加）
- 進捗の画面：`docs/progress/PROGRESS.html`（ガントチャート・ロードマップ・論点一覧）。要件を決めるための論点は `docs/progress/ISSUES.csv`（未決15件。v5 で Q21 ロゴ・Q22 OCR の画像を追加）
- iPhone 用サーバー：`http://172.17.183.12:3211`（新しいビルド。iPhone は XN-002-5G で開く。このセッションが動いている間だけ）

## 次の3手
1. iPhone 実機で `docs/release/IPHONE_CHECK_20261122.md` の6つ（B02・B03・B04・B13）
2. ユーザーの OK のあと：beta/friend-v1 を master にマージ → GitHub（Private）に push → Vercel（Root Directory=app）で公開 → 公開 URL で R1〜R8
3. 友人に渡す（RELEASE_PREP 5章の一言）→ 感想を集める。CHARTER S1 の測り方も決める

## ユーザー待ち
- チャッピーのレビュー結果（v4）
- GitHub への push と Vercel での公開の承認（B15）
- OCR・PWA を進めるかの判断（保留中）
