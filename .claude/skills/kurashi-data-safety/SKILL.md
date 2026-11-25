---
name: kurashi-data-safety
description: 暮らしベースの保存・復元・取り消し・別タブの競合・保存形式の変更を扱う、または確かめるときに使う。記録は端末の中にしかないので、失わないことを最優先にする。
---
# 暮らしベース：データを失わない

## 現行の保存の仕組み（前提。これ以外の仕組みを勝手に持ち込まない）
- 保存先は端末の localStorage だけ。キー `kurashi-base:data:v1`（`app/src/lib/storage.ts` の `STORAGE_KEY`）、形式の番号 `schemaVersion` は 2（`app/src/lib/schema.ts`）。
- サーバー側のデータベースや同期・送信の仕組みは**前提にしない**。持ち込むかどうかは論点として平尾さんが決める（`docs/progress/ISSUES.csv`）。
- 書き込みは、読んだときから変わっていないときだけ（`saveDataIfUnchanged`）。取り消しの控え（`saveWithUndo`）。
- 復元・追加復元は `app/src/lib/backup.ts` の `applyRestore`（意味の違う同じ ID につながない・二重にしない）。
- iPhone の自分用アプリ（`feat/ios-widget`）には自動バックアップがある。Safari とホーム画面のアイコンでは記録が別（BUG-17）。

## 守る手順（PJ_RULES「守ること」）
- 形式を変えるときは、先に `migrate()` とテストを書く。古い形（v1、旅行なし等）を読めることをテストで示す（`app/tests/v5-data.test.ts`・`app/tests/restore-safety.test.ts`）。
- 保存に失敗したら、今の記録と取り消しの控えを失わず、「保存しました」と出さない。
- 削除・置き換えの前に確認を出す。ユーザーのデータを外へ送る道を作らない。

## 確かめ方
`cd app && npx vitest run tests/data-protection.test.ts tests/restore-safety.test.ts tests/storage-backup.test.ts`、最後に `npm run check`。障害の模擬（保存失敗・別タブで先に保存・壊れたバックアップ）を含める。iPhone でしか出ないものは DEVICE_PENDING。
