---
name: kurashi-ledger
description: 暮らしベースのお金の計算（収支・固定費・一部払い・カード引落・投資・取り込みの重複）を変える・確かめるときに使う。期待値はコードから作らず、要件から独立に作る。
---
# 暮らしベース：お金の計算の確かめ方

## 守る性質（現行の仕様。変えるときは平尾さんの判断と DECISIONS への記録が先）
- 金額は正の整数（円）。入力は `app/src/lib/money.ts` の `parseAmount`（全角・カンマ・¥ を許容、上限 `MAX_AMOUNT`）。
- 投資のカテゴリは収支に入れない（`app/src/lib/classify.ts` の `categoryIsInvest`）。
- カードの引き落としは収支に二重に数えない（v21 X03）。固定費の一部の支払いは、残りだけを未払いとして扱う（v21 X02。`app/tests/partial-payment.test.ts`）。
- 固定費の次の支払日は、月末を超える日を月末に丸める（`app/src/lib/recurring.ts` の `advanceDueDate`）。
- 重複は「候補」の警告だけで、自動で消さない・まとめない（`app/src/lib/duplicates.ts`）。取り込みは足すだけで二重にしない（`app/src/lib/importBatch.ts`・`app/tests/import-batch.test.ts`）。
- 日付は日本時間の暦日（`app/src/lib/date.ts`）。

## 確かめ方
1. 要件（`docs/v21/spec/` の該当箇所、受入 X01〜X16）から、期待値を**手で**作る。実装を読んで期待値を作らない。
2. 境界：月末（28/29/30/31日）・うるう年（2月29日）・年またぎ・支払日の当日・0円・上限額・取り消しのあと・取り込み直し。
3. `cd app && npx vitest run <該当のテスト>`、最後に `npm run check`。
4. 結果は「対象のコミット・コマンド・件数・失敗」を添える。未実行は NOT_RUN。
