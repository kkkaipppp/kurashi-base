---
name: kurashi-pmo-checks
description: 暮らしベースの台帳の機械チェック。WBS の証拠なし完了・依存の誤り・循環、論点の判断待ち、STATE と台帳の食い違い、本部への報告の根拠を確かめるときに使う。台帳は書き換えない。
---
# 暮らしベース：PMO のチェック

台帳：`docs/progress/WBS.csv`（列 ID・Milestone・Priority・Task・DependsOn・Acceptance・Owner・Status・Evidence・Notes・Start・End など）、`docs/progress/ISSUES.csv`（論点）、`docs/progress/ROADMAP.md`、`docs/STATE.md`、`docs/RAID.md`、`docs/DECISIONS.md`。

## 手順
1. `py -3 -I tools/pmo.py check docs/progress/WBS.csv --today <今日>` を実行する。
   - `DONE_WITHOUT_EVIDENCE`・`UNKNOWN_DEPENDENCY`・`DEPENDENCY_CYCLE` は重大。`STARTED_BEFORE_DEPENDENCY` は中。
   - `PAST_PLANNED_END` は情報だけ。このPJの `End` は「未完了なら仮の予定」（`docs/progress/STATUS.md` の注記）なので、遅延と言わない。
2. `ISSUES.csv` の状態が「決定」以外のものを、判断待ちとして数える。STATE に「決定済み」と書かれているのに ISSUES が未決なら、不一致として指摘する。
3. 進捗率の根拠を確かめる：`tools/progress.py` の進捗は WBS の件数ベース（重みなし）。報告に使うときは「件数ベース」と根拠を書く。`tools/pmo.py progress` は重みが無いと UNKNOWN を返す（推測で作らない）。旧基準の受入合格率（86.79% など）を全体進捗にしない。
4. 本部への報告は手で書かない：`py -3 -I tools/progress.py sync` で作り直し、`tools/report_check.py` に通す（PJ_RULES「WBS・ロードマップ・論点の更新」）。

## 出すもの
指摘（ID・コード・根拠）、STATE の修正案（差分の案。直接書き換えるのは PM の判断の後）、判断待ちの一覧。台帳・STATE を、このチェックの中で書き換えない。
