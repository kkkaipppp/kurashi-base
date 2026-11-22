# 現在地（STATE）— 暮らしベース

**このファイルが現在地の正本。** セッションの終わりに必ず更新する。（`docs/NEXT_SESSION_HANDOFF.md` は作りの要点、`docs/progress/STATUS.md` は WBS の集計用）

- 更新：2026-11-22
- ブランチ：`beta/friend-v1`（master にはまだマージしていない。push もしていない）
- 段階：M4 スマホβ／M5 公開準備（ロードマップ `docs/progress/ROADMAP.md` の「友人β版」）
- **v5（生活の機能とブランド）を実装**：ホーム3項目・予定の詳細・旅行・資格の学習・日本語・くらしベースのロゴ。受入105件は `docs/v5/ACCEPTANCE_V5.csv`。判定は **友人β NO-GO（条件付き：iPhone 実機で v5 の新しい画面 V17・ロゴ Q21）**
- v4 時点の判定：**友人β GO 可（公開の承認待ち）**。iPhone 実機でキーボード・バックアップの確認が済んだ（11-22、平尾さん）。残りは公開の承認（`docs/BETA_RELEASE_REPORT.md`）／一般公開 NO-GO
- レビュー：チャッピー用 `_review/kurashi-base_v4_beta_a648199.zip`＋依頼文 v4 を渡した。返事が来たら差分を見て反映
- チェック：`cd app && npm run check` PASS（テスト147件、v5 の後）
- 進捗の画面：`docs/progress/PROGRESS.html`（ガントチャート・ロードマップ・論点一覧）。要件を決めるための論点は `docs/progress/ISSUES.csv`（未決15件。v5 で Q21 ロゴ・Q22 OCR の画像を追加）
- iPhone 用サーバー：`http://172.17.183.12:3211`（新しいビルド。iPhone は XN-002-5G で開く。このセッションが動いている間だけ）

## 次の3手
1. iPhone 実機で v5 の新しい画面を確かめる（V17）→ 直す。あわせてチャッピーのレビュー（v4）を反映する
2. ユーザーの OK のあと：beta/friend-v1 を master にマージ → GitHub（Private）に push → Vercel（Root Directory=app）で公開 → 公開 URL で R1〜R8
3. 友人に渡す（RELEASE_PREP 5章の一言）→ 感想を集める。CHARTER S1 の測り方も決める

## ユーザー待ち
- iPhone 実機で v5 の新しい画面（V17）
- ロゴの再現案を正式にするか（Q21）
- チャッピーのレビュー結果（v4）
- GitHub への push と Vercel での公開の承認（B15）
- OCR・PWA を進めるかの判断（保留中）
