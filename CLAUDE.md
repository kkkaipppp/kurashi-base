# 暮らしベース（CLAUDE.md）

予定とお金を1か所で管理する、スマホ優先・ローカルファーストの Web アプリ（`app/`：Next.js + TypeScript + Tailwind、データは localStorage）。

**このPJの決まりの正本は `docs/PJ_RULES.md`。** セッションの始めに必ず読み、そこに書かれた手順（始め3分・終わり5分）に従う。このファイルには要点だけを置き、中身を二重に持たない。

## 最初に読む
1. `docs/PJ_RULES.md`（決まり・守ること・確認の手順・ユーザーへの頼み方）
2. `docs/STATE.md`（現在地・次の3手・ユーザー待ち）
3. `docs/LESSONS.md`（同じ指摘を2回受けないため）

## 特に守ること（詳細は PJ_RULES）
- ユーザーへの返信は、まとめ欄も本文も日本語
- `00_受領資料/`・`docs/ux-autonomous/`・`docs/autonomous_pack/` は書き換えない。`00_経営管理` とほかのPJには書き込まない
- push・公開・外部送信・npm パッケージの追加は、ユーザーの OK をもらってから
- localStorage のデータを壊す変更はしない（形式を変えるときは `migrate()` とテストが先）
- テスト未実施・実機未確認を合格と書かない。チェックは `cd app && npm run check`


## o11 統合方針（2026-11-25）
ユーザー承認：既存機能・データを保持して抜本的アーキテクチャ改革とUI改善を進める。`docs/integration/REFORM_O11.md` と `MERGE_LOG.md` を最初に確認。旧版の一括上書き禁止。統合後の試験・WBS同期は未実施。
