# 友人β 公開の準備（GitHub・Vercel）

**この文書は手順の準備だけです。push・デプロイ・URL の配布は、平尾さんの OK をもらってから行います。**（2026-11-22 時点で、どれも未実施）

## 0. 先に決めてもらうこと
| # | 決めること | すすめ | 理由 |
|---|---|---|---|
| 1 | GitHub リポジトリの公開範囲 | **Private（非公開）** | `docs/`（CHARTER・DECISIONS・RAID・PJ_RULES）に名前と開発の記録、`00_受領資料/` に受け取った資料が入っている。Vercel は Private のリポジトリからもデプロイできる |
| 2 | 公開先 | Vercel（Hobby・無料） | Next.js をそのまま動かせる。サーバー処理も DB もないので、追加の設定がない |
| 3 | URL を渡す相手 | 友人5人程度 | CHARTER S4。URL を知っている人だけが使える（検索エンジンには載せない設定済み） |

## 1. GitHub（平尾さんの OK のあと）
1. GitHub で新しいリポジトリを作る（例：`kurashi-base`、**Private**、README などは付けない）
2. このフォルダで：
   ```bash
   git remote add origin https://github.com/<アカウント>/kurashi-base.git
   git push -u origin master
   git push origin beta/friend-v1
   ```
3. 確認：`.gitignore` で `node_modules/`・`.next/`・`.env*`・`_review/` は入らない。秘密の鍵・トークンはリポジトリにない（2026-11-22 に `git grep` で確認）

## 2. Vercel（平尾さんの OK のあと）
1. https://vercel.com に GitHub でログイン →「Add New… → Project」→ 上のリポジトリを選ぶ
2. 設定：
   - **Root Directory：`app`**（いちばん大事。ここを指定しないとビルドできない）
   - Framework Preset：Next.js（自動）
   - Build Command・Output：既定のまま（`next build`）
   - 環境変数：なし（このアプリは使わない）
3. 「Deploy」→ 数分で `https://<名前>.vercel.app` ができる
4. 公開するブランチ：友人βは `master` に `beta/friend-v1` をマージしてから（Production Branch = master）。マージ前に試すなら、Vercel がブランチごとに作る Preview の URL を使う

## 3. 公開した URL で確かめること（HTTPS・iPhone の Safari）
| # | 確かめること | 合格 |
|---|---|---|
| R1 | URL を開くとホームが出る（「まずは3つだけ」） | 3秒以内に表示 |
| R2 | 支出を1件追加 → ホーム・カレンダー・振り返りに出る | 金額が一致 |
| R3 | 予定を1件追加 → ホーム「今日の予定」・カレンダーに出る | 一致 |
| R4 | 設定 → バックアップを書き出す → ファイルが「ファイル」アプリに保存される | 保存できる |
| R5 | そのファイルで復元（追加）→ 件数のプレビュー → 「同じ記録」として二重にならない | 二重にならない |
| R6 | 「直前の操作を取り消す」で、復元の前に戻る | 戻る |
| R7 | キーボードを出しても「保存する」が見える／下のメニューが隠れない | 見える |
| R8 | 画面の右にはみ出しがない | ない |

**注意**：記録はドメイン（URL）ごとに別に保存されます。iPhone で `http://172.17.183.12:3211`（開発用）に入れた記録は、公開した URL には出てきません。移すなら、開発用の画面でバックアップを書き出し、公開した URL で復元します。

## 4. 戻し方（ロールバック）
- Vercel：「Deployments」→ 前のデプロイ →「Promote to Production」（すぐ戻る。利用者の記録は端末の中なので消えない）
- コード：`git revert <コミット>` → push（Vercel が自動でデプロイし直す）
- データの形式は v2 のまま。形式を変える修正は、`migrate()` とテストが先（PJ_RULES）

## 5. 友人に渡すときの一言（案）
> 暮らしベース（試用版）です。予定とお金を1か所で記録できます。
> 記録はあなたの iPhone のこのブラウザの中だけに保存されます（私には見えません。サーバーにも送りません）。
> Safari のデータを消すと記録も消えるので、ときどき「メニュー → バックアップと復元 → 書き出す」をしてください。
> 使いにくいところ・分かりにくい言葉があったら、スクショで教えてください。

## 6. 公開の判定
`docs/BETA_RELEASE_REPORT.md` の GO / NO-GO を参照。
