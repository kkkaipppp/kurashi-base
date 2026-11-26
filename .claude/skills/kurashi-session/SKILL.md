---
name: kurashi-session
description: 暮らしベースのセッションの始め・終わりの手順。現在地（docs/STATE.md）と git の照合、WBS・論点の更新、本部への報告の作り直しまでを、PJ_RULES の手順どおりに行うときに使う。
---
# 暮らしベース：セッションの始めと終わり

**決まりの正本は `docs/PJ_RULES.md`。** このスキルは手順の入口だけで、中身を書き写さない。食い違ったら PJ_RULES が優先。

## 始め（PJ_RULES「セッションの始め（3分）」）
1. `docs/STATE.md` を読む。`git status --short`・`git rev-parse --abbrev-ref HEAD`・`git log -1` と、STATE に書かれたブランチ・コミットを照合する。違えば「不一致」として報告し、STATE を勝手に書き換えない。
2. `docs/LESSONS.md` を流し読みする。
3. 今日の作業が `docs/CHARTER.md` の問いと P0 につながるかを確かめる。
4. 版を確かめる：作業が personal（自分用、`feat/ios-widget` と `npm run dev`）か public（公開版、master と Vercel）か。新しい機能は personal だけで有効にする（`app/src/lib/edition.ts` の `FEATURE_EDITIONS`）。public を有効にするのは平尾さんが決めてから。 自分用の組み立て・確認は `KB_EDITION=personal`（`NEXT_PUBLIC_KB_EDITION` を直接付けても next.config.ts が上書きする。LESSONS L-19）。

## 作業中（PJ_RULES「WBS・ロードマップ・論点の更新」）
- 作業の開始・完了・停止のたびに `py -3 -I tools/progress.py set <ID> <状態> "根拠"`。決めることは `docs/progress/ISSUES.csv` に論点として足す。
- 機能を足す前に CHARTER の成功の基準に効くかを確かめる（PJ_RULES「範囲を絞る」）。

## 終わり（PJ_RULES「セッションの終わり（5分）」）
1. 返信がすべて日本語か（LESSONS L-09・L-11・L-12）。手戻りがあれば先にプレイブック 9-2。
2. STATE・DECISIONS・RAID を更新。
3. `cd app && npm run check`。落ちたまま終えない。
4. `py -3 -I tools/progress.py sync` → `tools/report_check.py` と本部の検査に通す。
5. 返信で WBS の変化と本部への報告の内容を伝える。

## してはいけないこと
push・公開・デプロイ・npm 追加・外部送信は平尾さんの OK の後（PJ_RULES「守ること」）。テスト未実施・実機未確認を PASS と書かない。

## 改訂履歴
- 2026-11-26｜始め 4 に自分用の組み立ての変数（KB_EDITION）｜LESSONS L-19
