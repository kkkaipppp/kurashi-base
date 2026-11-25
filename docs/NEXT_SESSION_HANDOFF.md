# 次のセッションへの引き継ぎ（2026-11-21）

> 現在地（次の3手・ユーザー待ち）の正本は `docs/STATE.md`。PJ の決まりは `docs/PJ_RULES.md`。このファイルは「作りの要点」として残す。

> **定期タスクの担当（2026-11-25）**：「【暮らしベース】家計簿をマネフォから移す（毎月2日）」（kakeibo-monthly-to-kurashi、毎月2日20時）は、暮らしベースの開発セッションが担当する。知らせはこのセッションに届くので、重なりを日付・種類・金額で数えて平尾さんに見せ、「追加」用のファイルを作る（「置き換え」は使わない）。台帳は `../00_経営管理/docs/SCHEDULED_TASKS.md`。

## 今の状態
- ブランチなし（ローカルの git、`main` 相当のみ）。リモートへの push はしていない。最新のコミットは `git log --oneline | head` で確認する。
- `cd app && npm run check` はすべて合格（型・lint・テスト50件・ビルド）。
- データ形式は v2（`app/src/lib/types.ts` の `AppData`）。v1 からの移行は `app/src/lib/schema.ts` の `migrate()`。
- iPhone 用の確認サーバー：`cd app && npx next start -H 0.0.0.0 -p 3211`（同じ Wi-Fi から http://<PCのIP>:3211）。セッションを閉じると止まる。
- 状況の一覧は `docs/FEATURE_BOX_STATUS.md`、テスト結果は `docs/TEST_REPORT.md`、文言の監査は `docs/JAPANESE_COPY_AUDIT.md`。

## 作りの要点
- 新しい領域は、`app/src/components/CollectionPage.tsx` の汎用の「一覧＋入力シート」を、各ページの設定（`CollectionConfig`）で使っている。領域を足すときは：
  1. `types.ts` に型を足し、`Collections` と `COLLECTION_KEYS` に追加
  2. `schema.ts` の `SPECS` に項目のチェックを追加（**既存の形を変えるときは `migrate()` に移行を書く**）
  3. `backup.ts` の `COUNT_LABELS` に名前を追加
  4. `store.tsx` の `ID_PREFIX` に接頭辞を追加
  5. `app/src/app/<領域>/page.tsx` に設定を書き、`menu/page.tsx` に入口を足す
- 計算は画面から分けて `lib/`（`nisa.ts`・`life.ts`・`navi.ts`・`aggregate.ts`）に置き、`app/tests/` で単体テストする。
- Next.js 16 では `page.tsx` から default 以外を export するとビルドが通らない。

## 保留中（ユーザーの判断が必要）
1. **OCR（tesseract.js）**：端末内で処理するが、言語データ（数MB）を外部の配布元からダウンロードする。外部への通信を伴うため、入れるかはユーザーに確認する。
2. **公開・PWA**：いつでも iPhone で使うには、ホスティングへの公開が必要。公開してよいか、どこに置くかの判断が必要。
3. **AI・共有・外部連携**：つなぐには、外部へ送るデータ・費用・アカウントの設計が必要。今は「準備中」の箱だけ。

## 次の改善候補（優先順）
1. iPhone 実機で新しい画面を確認（特にメニュー、各入力シート、今日のナビ）。直すところを集める
2. 繰り返し予定の「この回だけ変更・削除」
3. 契約・書類・タスクの期限をカレンダーにも表示（今はタスク・メモ・勉強のみ）
4. 固定費と契約のつなぎ込み（契約から固定費を作る）
5. 健康記録のグラフ（体重の推移など）
6. 資産の推移（評価額の履歴）
7. Playwright などで主要な流れの E2E テストを自動化
8. 振替（口座間の移動）・分割払いの記録

## 連絡先
- チャットの連絡先一覧：`../00_経営管理/docs/CHAT_DIRECTORY.md`（本部 ed61bc9。相手の ID を SendMessage の `to` に指定すれば直接頼める。承認の代わりにはならない。2026-11-25 平尾さんの指示）
