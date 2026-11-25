# A01 現行の依存・書き込み経路の棚卸し（o11 工程1）

基準：master 8db1a71（o11 統合後）。**実コードの grep と読解から作成**（推測は「推測」と書く）。iPhone 側（feat/ios-widget）は、同じ Web 部分を Capacitor で包んだもの。

## 1. 全体の依存（今）
```
画面（app/*/page.tsx・components/*.tsx）
  ├─ 読み取り：useData() → AppData をそのまま lib の計算関数に渡す（画面ごとに直接呼ぶ）
  └─ 書き込み：useStore() の操作 → store.commit(fn) → storage.ts（saveData / saveWithUndo）→ localStorage
lib（計算）：純粋関数が中心。React・DOM・保存に依存しない（例外：下の「要修正」）
storage.ts：localStorage の読み書き・取り消し用の控え（UNDO_KEY）・壊れたデータの退避
iPhone（feat のみ）：WidgetSync → NativeBridge（setSummary・writeBackup・syncCalendar・scheduleReminders・recognizeText）
```

## 2. 書き込み経路（すべて store.tsx を通る）
| 経路 | 入口 | 保存の仕方 |
|---|---|---|
| 記録（支出・収入） | addTx・updateTx（applyTxUpdate）・deleteTx（一部払い・返金を戻す） | commit → saveData（1キーに全データ） |
| 予定・旅行・固定費 | addEvent/updateEvent/deleteEvent・addTrip…・addRecurring… | 同上 |
| 一覧（タスク・目標・資産など10種） | addItem・updateItem・replaceItem・removeItem | 同上 |
| 設定・カテゴリ | setBudget・setHomeLayout・setMenuHidden・setCategoryRole・mergeCategory・addCategory… | 同上 |
| 直接 commit を呼ぶ画面 | life（生活の変化）・settings・tasks（カレンダーに入れる）・EventActions・TxSheet（返金） | 同上 |
| 大きく変える操作 | replaceAll（復元・取り込み）・wipeAll・undoLast・resetCorrupt | saveWithUndo（今のデータを UNDO_KEY に控えてから保存） |
| データ以外 | sheetDraft（下書き：別キー）・calendar の表示（SHOW_KEY）・通知の設定（feat） | 別のキー。記録の保存の形には入らない |

**原子性**：localStorage は複数キーを一度に書けない。saveWithUndo は「控え→本体」の順に書き、本体が失敗したら控えを元に戻す（storage.ts:118-151）。別タブとの競合は、保存前の生データの一致で検出（conflict）。

## 3. 金額の計算を画面から直接呼んでいる所
summarizeMonth（calendar・history・home・widget）、daySummary（calendar・home・widget）、monthBreakdown（MonthBreakdownCard・PeriodReport）、monthLedger（home）、budgetSpent（report）、forecastMonthEnd（ForecastCard）、cashBalance（CashBalanceCard）、weeklyReview、summarizePeriod、assessPurchase・compareScenarios（decide）。
→ 共通の台帳（A03）を作ったら、まず「並行比較」の試験で、これらの答えと台帳の答えが一致することを確かめてから、画面を順に台帳へつなぐ。

## 4. 要修正（依存の向き）
- `lib/draft.ts` が `@/components/CollectionPage` の型（Draft）を import している（lib → components の逆向き）。型だけなので動作には影響しないが、A06 で型を lib 側へ移す。
- 循環 import は見つかっていない（lib → components は上の型1件のみ）。

## 5. 保存の限界（実測済み。RAID R-06）
- 1つの localStorage キーに全データ。10年相当（1.5万件）で 4.1MB、取り消し用の控えを書く操作はデータの約3.2倍を使う。
- iPhone アプリも WKWebView の localStorage（推測：Capacitor の既定。ネイティブの保存は writeBackup のファイルだけ）。A04 で、実際の Swift 構成を確認してから保存方式を決める。

## 6. 未確認
- iPhone の WKWebView で localStorage が消える条件（OS の容量不足時）は、実機で未確認。
- 保存の失敗（容量不足）を実際に起こした試験は、ブラウザでは未実施（単体試験のみ）。
