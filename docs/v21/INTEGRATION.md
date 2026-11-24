# NEXT v21 の統合（2026-11-25）

- 基準：ChatGPT「NEXT v21」A・B・C の3巻（基準 d756cbc。計37ファイル）。**設計承認であり、実装・課金・公開・不可逆移行の承認ではない**（FINAL_INTEGRATION・APPROVED_EVOLUTION 末尾）。
- 置き場：資料の原本 `docs/v21/spec/`（そのまま）、読了台帳 `docs/v21/READ_RECEIPT.csv`、分類 `docs/v21/CLASSIFICATION_A.md`（9資料）・`_B.md`（9資料）・`_C.md`（C巻の8資料と費用）。
- 管理の統合：別の管理体系は作らない。ロードマップは `docs/progress/ROADMAP.md` に **M9〜M15＝Phase 0〜6** を足し、作業は `docs/progress/WBS.csv` の **N00〜N13**（TASK_QUEUE の T00〜T11 に対応）。論点は `ISSUES.csv`、決めたことは `DECISIONS.md`。

## 読了
- 33ファイルすべて読了（READ_RECEIPT.csv）。本体が全行読んだのは README・CLAUDE_START・FINAL_INTEGRATION・APPROVED_EVOLUTION・WEB_IOS_MATRIX・ROADMAP・QUALITY_GATE・TASK_QUEUE・READ_ORDER。残りの24資料は、読み込み担当（別のエージェント）が全行読み、現行ソースと照合した。
- MANIFEST.sha256 の36件はすべて実ファイルと一致。欠落なし。
- 資料どうしの食い違い（記録）：DELIVERY_PROCESS は A/B の2巻前提だが実際は3巻／C01–C10 が CSV と CAL、G01–G10 が CH と重なる（名前空間で区別）／DOMAIN_DEPTH の「既存 Goal/Milestone/ActionPlan」は現行に無い／5導線（ナビ）と4入口（＋の中身）は別物／基準 d756cbc は feat/ios-widget にだけある（master には無い）。

## 現行との差分の分類（概数。厳密な件数ではない）
| 区分 | 件数 | 例 |
|---|---|---|
| 実装済み・検証済み | 約18 | 保存・復元の往復、書きかけ、収支の共通計算（予算の定義）、固定費の支払いつなぎ |
| 実装済み・未検証 | 約23 | ホームの並べ替え・今日のまとめ（実機は一部のみ）、旅行の ID つなぎ |
| 一部実装済み | 約142 | 予定とタスクの統合前、設定6分類（今は見出し3つ）、グラフの根拠表示 |
| 未実装 | 約112 | 共通予定、目標の階層、予測・提案、OCR、横断検索、カード/現金の区別 |
| 技術検証が必要 | 約13 | IndexedDB/SQLite、OCR、Share Extension、App Intents |
| 外部条件で実装できない | 約5 | App Store 配布（年99USD）、Web Push の基盤 |

## 今回の優先順位（影響の大きさ＝データ・金額の正しさを先に）
1. **重大（点数に関係なく最優先）**：CSV 取込の弱点3つ（誤統合・固定費の前方一致・未閉鎖の引用符）。現行コードに実在（CLASSIFICATION_B 4章）→ N06 から先に着手
2. 保存の形を変えない小さな単位（CLASSIFICATION_A・B の「すぐ着手できる小さな単位」）：二重表示の解消、履歴の絞り込みの保持、グラフの根拠の一行、カレンダーの表示の記憶、文言
3. 保存の形を変えるもの（カード/現金 X03、部分実績 X02、共通予定、目標の階層）は、`migrate()`・復元試験・既存データの件数/金額/ID 一致の確認を先に作ってから（N01・N02 の後）
4. Phase 6（Shortcuts・Watch・AI・同期）は設計と成立性の記録まで

## 版と端末（4つの組み合わせは別軸）
- 本人版（personal）と友人版（public）は別。友人βの公開版は、平尾さんの OK があるまで変えない。新しい機能は本人版が先（`lib/edition.ts`）。
- Web と iOS は別。iOS の部品（WidgetSync・EventKit・ウィジェット）は feat/ios-widget にあり master には無い。

## 判断の記録（DECISIONS にも1行）
- 「機能の追加を止める日（11-25）」は、平尾さんが中止を決定（アンケートを見て本人が判断）。
- 公開・push・デプロイ・npm 追加・課金・不可逆移行は、依頼文どおり承認が必要。必要になったら課題に記録して他を続ける。
