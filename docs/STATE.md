# 現在地（STATE）— 暮らしベース

**このファイルが現在地の正本。** セッションの終わりに必ず更新する。（`docs/NEXT_SESSION_HANDOFF.md` は作りの要点、`docs/progress/STATUS.md` は WBS の集計用）

- 更新：2026-11-21
- コミット：`git log --oneline | head -1` で確認（push はしていない）
- 段階：M4 スマホβ準備（ロードマップ `docs/progress/ROADMAP.md`）
- 判定：友人β NO-GO（iPhone 実機での確認が未実施）／一般公開 NO-GO
- チェック：`cd app && npm run check` PASS（テスト81件）
- iPhone 用サーバー：`http://172.17.183.12:3211`（このセッションが動いている間だけ。手順は PJ_RULES）

## 次の3手
1. iPhone 実機で新しい画面を確認してもらう（＋の選択・振り返り・ナビの展開・カレンダーの期限・キーボード中の保存）→ 直す
2. CHARTER の S1（4週間・週5日以上）を測る方法を決める（今は未計測）
3. CHARTER の 80:20 に沿って、P0（家計・予定・カレンダー・振り返り）の磨き込み。候補：予定に予算を付ける・振り返りの週/年の切り替え（`docs/UX_NEXT_ACTIONS.md`）

## ユーザー待ち
- CLAUDE.md を作ってよいか（PJ の決まりを `docs/PJ_RULES.md` から参照する形）
- iPhone 実機での確認
- OCR・公開（PWA）を進めるかの判断（保留中）
