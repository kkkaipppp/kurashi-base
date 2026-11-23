# 現在地（STATE）— 暮らしベース

**このファイルが現在地の正本。** セッションの終わりに必ず更新する。（`docs/NEXT_SESSION_HANDOFF.md` は作りの要点、`docs/progress/STATUS.md` は WBS の集計用）

- 更新：2026-11-23
- ブランチ：`beta/friend-go`。**GitHub `kkkaipppp/kurashi-base`（Private）の master に push 済み（b55bc2c、11-23）**
- **公開 URL：https://kurashi-base-tau.vercel.app/**（Vercel、master を自動でデプロイ）
- 段階：M5 公開準備（ロードマップ `docs/progress/ROADMAP.md` の「友人β版」）
- **判定：NO-GO（残りは iPhone の Safari で公開 URL を確かめるだけ）**。必須受入 B01〜B15 のうち、残りは B01・B14。B15 の公開部分は 11-23 に PASS。iPhone 実機の B02・B03・B04・B13 は PASS（B02・B13 は UI・UX パッチの後の 97a9bd6 で再確認、平尾さん）。証拠：`docs/release/GO_EVIDENCE_20261122.md`
- 11-22 夜にやったこと
  - 全画面の言葉を短くした（cdc19d7。`docs/JAPANESE_COPY_AUDIT.md`）
  - チャッピーの UI・UX レビュー（v7）のパッチを取り込み（97a9bd6）。これで B09 のレビューの反映は完了
  - 支出・収入とタスクなどのシートも、編集中に別のタブで消されても入力を残すようにした（予定は 97a9bd6 で済み）
  - 決めたこと：支出と旅行のひも付け（V21）は友人βでは作らない。OCR は保留（評価用データの利用条件だけ確認：`docs/OCR_DATA_LICENSE_CHECK.md`）
  - 友人β の1週間テストのシート：`docs/release/FRIEND_BETA_TEST_SHEET.md`、感想の記録：`docs/release/FRIEND_FEEDBACK.md`
- チェック：`cd app && npm run check` PASS（テスト199件）
- 画面の記録：`docs/screens/index.html`（最新は `2026-11-22_uiux_97a9bd6`）
- 進捗の画面：`docs/progress/PROGRESS.html`。論点は `docs/progress/ISSUES.csv`
- iPhone 用サーバー：`http://172.17.183.12:3211`（iPhone は XN-002-5G で開く。このセッションが動いている間だけ）
- 機能を足すのは 2026-11-25 まで。その後は不具合直しと言葉の直しだけ

## 次の3手
1. 平尾さんが iPhone の Safari で公開 URL を確かめる（RELEASE_PREP 3章の R1〜R8 → B01・B14。R7 は支出の入力で）→ GO_EVIDENCE を GO に更新
2. 友人に渡す（RELEASE_PREP 5章の一言＋テストのシート1章）→ 1日目・3日目・7日目に聞く → 感想を FRIEND_FEEDBACK に記録
3. 直しは master に push すると Vercel が自動で公開し直す（push は毎回 平尾さんの OK 後）

## ユーザー待ち
- iPhone の Safari での公開 URL の確認
- 友人β の後：V21（ひも付け）・OCR・PWA を進めるか
