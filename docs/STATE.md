# 現在地（STATE）— 暮らしベース

**このファイルが現在地の正本。** セッションの終わりに必ず更新する。（`docs/NEXT_SESSION_HANDOFF.md` は作りの要点、`docs/progress/STATUS.md` は WBS の集計用）

- 更新：2026-11-24
- ブランチ：`beta/friend-go`。**GitHub `kkkaipppp/kurashi-base`（Private）の master に push 済み（aa49fde、11-23。記録の分は平尾さんが push）**
- **公開 URL：https://kurashi-base-tau.vercel.app/**（Vercel、master を自動でデプロイ）
- 段階：M5 公開準備（ロードマップ `docs/progress/ROADMAP.md` の「友人β版」）
- **判定：GO（B01〜B15 全件 PASS、11-23。iPhone の Safari で公開 URL の R1〜R8 全部 OK＝平尾さん）**。友人に渡すことを平尾さんが承認（11-23）。iPhone 実機の B02・B03・B04・B13 は PASS（B02・B13 は UI・UX パッチの後の 97a9bd6 で再確認、平尾さん）。証拠：`docs/release/GO_EVIDENCE_20261122.md`
- 11-22 夜にやったこと
  - 全画面の言葉を短くした（cdc19d7。`docs/JAPANESE_COPY_AUDIT.md`）
  - チャッピーの UI・UX レビュー（v7）のパッチを取り込み（97a9bd6）。これで B09 のレビューの反映は完了
  - 支出・収入とタスクなどのシートも、編集中に別のタブで消されても入力を残すようにした（予定は 97a9bd6 で済み）
  - 決めたこと：支出と旅行のひも付け（V21）は友人βでは作らない。OCR は保留（評価用データの利用条件だけ確認：`docs/OCR_DATA_LICENSE_CHECK.md`）
  - 友人β の1週間テストのシート：`docs/release/FRIEND_BETA_TEST_SHEET.md`、感想の記録：`docs/release/FRIEND_FEEDBACK.md`
- チェック：`cd app && npm run check` PASS（テスト201件）
- 11-23 に判明：iPhone のホーム画面のアイコンと Safari で記録が別々（BUG-17）。ホームと使い方に案内を足した（公開 URL に反映済み、11-23）。友人には補足を送る。ウィジェットは論点 Q25（友人β の後）
- 画面の記録：`docs/screens/index.html`（最新は `2026-11-22_uiux_97a9bd6`）
- 進捗の画面：`docs/progress/PROGRESS.html`。論点は `docs/progress/ISSUES.csv`
- iPhone 用サーバー（開発用の 3211）：11-23 に止めた。友人用は公開 URL だけ
- 機能を足すのは 2026-11-25 まで。その後は不具合直しと言葉の直しだけ

## 次の3手
1. 友人に渡した（11-23、平尾さん）。1日目＝11-23 夜・3日目＝11-25・7日目＝11-30 に聞く
2. 友人に渡す（RELEASE_PREP 5章の一言＋テストのシート1章）→ 1日目・3日目・7日目に聞く → 感想を FRIEND_FEEDBACK に記録
3. 直しは master に push すると Vercel が自動で公開し直す（push は毎回 平尾さんの OK 後）

## ユーザー待ち
- 友人β の後：V21（ひも付け）・OCR・PWA を進めるか
- ウィジェット（自分用、Q25）：docs/widget/WIDGET_PLAN.md。Mac に SSH でつながる（kurashi-mac）・Node.js 入れた。macOS 27.2.1 には更新済み（11-23）。Xcode は平尾さん待ち
- 11-23：平尾さんのジップ（custom_settings）から「カテゴリの名前を変える」を取り込んだ。追加の復元で、初期カテゴリは名前が違っても同じものとみなすよう直した（点検役の指摘、再点検で合格）。テスト204件。push して公開 URL に反映済み（11-23）。iPhone 実機は未確認
- 11-23：カレンダーに祝日（赤い日付・選んだ日に名前、2022〜2099年をネットなしで計算）と、収入の金額（青い +数字）を出した（平尾さんの要望、点検役で合格、テスト209件）。iPhone 実機は未確認。ほかに：NISA（1293件）・カード明細（44件）の取り込み用ファイルを作って渡した（_private、Git に入れない）。iPhone アプリの準備は feat/ios-widget（Capacitor 8.6.0、静的書き出し）。Mac に Xcode 27.2 が入り、iOS の部品をダウンロード中
- 11-23：自分用の iPhone アプリとウィジェットを feat/ios-widget で作った（Capacitor 8.6.0・WidgetKit、無料の Apple ID で App Group が通った）。平尾さんの iPhone でウィジェットの表示と、Mac からの自動の入れ直し（7日の期限の前、Wi-Fi 経由）・入れ直し後も記録が残ることを確認。ウィジェットのボタンの動きは未確認。詳しくは feat/ios-widget の docs/widget/WIDGET_PLAN.md
- 11-24：Web 版でできる限界まで（平尾さん）：バックアップの案内を7日に・ブラウザに記録を消さないよう頼む、設定に「カレンダー用ファイルを書き出す」（.ics。予定と固定費の支払日）と「家計簿の CSV を取り込む」（docs/import/KURASHI_IMPORT_SPEC.md の形、追加だけ・二重にしない）。点検役で合格、テスト229件。iPhone 実機（.ics の読み込み）は未確認。push はまだ
- 11-24：ChatGPT のレビュー o1（P01〜P20・家計の機能3つ）を全部直した（平尾さん「全部直しといて」）。安全の直しと言葉は両方の版、新しい機能は自分用だけ。点検役の再点検で合格（master fb2220b、feat 468cc4b、テスト259件）。一覧は docs/review/REVIEW_O1_RESPONSE.md。push はまだ、iPhone 実機は未確認（iPhone 用の組み立ては済み、家の Wi-Fi に戻ったら入れ直す）
- 11-24 夜：ChatGPT「100点化 開発指示 v1」のうち、保存の形を変えない分（B 書きかけ・D 計算をひとつに・A 入力の候補・C グラフと設定の見出し・アプリのカレンダー反映の止める/始める）をした（平尾さん「1」）。点検役の2回目で合格（すぐ直す 0件）。feat 0718fca、テスト master 269件・feat 281件。一覧は docs/review/PLAN100_RESPONSE.md。push はまだ。iPhone 用の組み立ては済み（22:22）、iPhone が Mac から見えず（unavailable）入れ直しはまだ・実機は未確認。形を変える分（分類ID・固定費のつなぎ・ホームのカード・旅行のひも付け）は、進め方を平尾さんに聞いている
