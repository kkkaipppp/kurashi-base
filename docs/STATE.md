# 現在地（STATE）— 暮らしベース

**このファイルが現在地の正本。** セッションの終わりに必ず更新する。（`docs/NEXT_SESSION_HANDOFF.md` は作りの要点、`docs/progress/STATUS.md` は WBS の集計用）

- 更新：2026-11-22
- ブランチ：`beta/friend-v1`（master にはまだマージしていない。push もしていない）
- 段階：M4 スマホβ／M5 公開準備（ロードマップ `docs/progress/ROADMAP.md` の「友人β版」）
- 判定：**友人β NO-GO（条件付き）**。コード上の重大な不具合はなし。iPhone 実機の確認と公開の承認が残る（`docs/BETA_RELEASE_REPORT.md`）／一般公開 NO-GO
- チェック：`cd app && npm run check` PASS（テスト111件）
- iPhone 用サーバー：`http://172.17.183.12:3211`（新しいビルド。iPhone は XN-002-5G で開く。このセッションが動いている間だけ）

## 次の3手
1. iPhone 実機で `docs/RELEASE_PREP.md` の R1〜R8（特にバックアップの書き出し・復元・取り消し、キーボード）→ 直す
2. ユーザーの OK のあと：beta/friend-v1 を master にマージ → GitHub（Private）に push → Vercel（Root Directory=app）で公開 → 公開 URL で R1〜R8
3. 友人に渡す（RELEASE_PREP 5章の一言）→ 感想を集める。CHARTER S1 の測り方も決める

## ユーザー待ち
- iPhone 実機での確認（B11・B12）
- GitHub への push と Vercel での公開の承認（B15）
- OCR・PWA を進めるかの判断（保留中）
