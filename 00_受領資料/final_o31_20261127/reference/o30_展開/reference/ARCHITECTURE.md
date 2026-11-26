# くらしベースの構成とデータの形（o29 時点、2026-11-27）

正本は `app/src/lib/types.ts` の `AppData`（形式の番号 2）。この文書は全体の見取り図で、細かい決まりはコードと試験が正本。

## 1. 全体の構成

```mermaid
flowchart TB
  subgraph 画面["画面（app/src/app の 28 ルート）"]
    TAB["下のタブ（自分用）<br/>カレンダー・家計簿・＋・やること・その他"]
    NAV["下のメニュー（公開版）<br/>ホーム・カレンダー・＋・家計簿・メニュー"]
    SHEET["入力のシート<br/>TxSheet・EventSheet・やること"]
  end
  subgraph 計算["計算（派生。正本から毎回作り直す）"]
    LC["ledgerCore / ledger<br/>月の収支・予算の残り"]
    FC["forecast<br/>月末の見込み"]
    BAL["balance<br/>現金・預金の残高"]
    SR["search<br/>横断検索（ひらがな・カタカナ・全角半角をそろえて比べる）"]
    RP["report / periods<br/>週・月・年"]
  end
  subgraph 保存["保存（store.tsx → storeCore → Repository）"]
    LS["LocalStorageRepository<br/>公開版"]
    IDB["IndexedDbRepository<br/>自分用（A04/A05）"]
    DRAFT["書きかけ（sheetDraft）<br/>正本と別"]
  end
  subgraph 外["端末の外とのやりとり（ユーザーが操作したときだけ）"]
    BK["バックアップ・復元（JSON）"]
    CSV["CSV の取り込み"]
    ICS[".ics の書き出し・取り込み"]
    NAT["iPhone アプリの橋（自分用）<br/>ウィジェット・通知・カレンダー・文字の読み取り"]
  end
  画面 --> 計算
  画面 --> 保存
  計算 --> 保存
  保存 --> 外
```

- 版の分け方：`lib/edition.ts` の `FEATURE_EDITIONS` と `IS_PERSONAL`。組み立てるときに決まり、公開版のビルドには自分用だけの部品が入らない。
- 予算の対象：公開版はすべての支出、自分用は投資を除く（`BUDGET_EXCLUDES_INVEST`）。計算は共通で、版の差は引数で渡す（o29 C015）。
- Swift（iPhone アプリ）は写しだけを持ち、記録の正本は画面の中の保存だけ（A07。`docs/integration/A07_NATIVE_BOUNDARY.md`）。

## 2. データの形（AppData）と関係

```mermaid
erDiagram
  Transaction }o--o| Category : "categoryId"
  Transaction }o--o| RecurringExpense : "recurringId（固定費の支払い）"
  Transaction }o--o| Trip : "tripId（表示用のつながり）"
  Transaction }o--o| ImportBatch : "importBatchId（取り込みの取り消し）"
  CalendarEvent }o--o| Trip : "tripId"
  CalendarEvent ||--o{ EventCost : "cost（予定の費用＝見込み。実績ではない）"
  Task }o--o| CalendarEvent : "予定にする（別の記録）"
  Goal ||--o{ GoalStep : "やること・節目"
  StudySubject ||--o{ StudyLog : ""
  AppData ||--o{ Transaction : ""
  AppData ||--o{ CalendarEvent : ""
  AppData ||--o{ Task : ""
  AppData ||--o{ Note : ""
  AppData ||--o{ Contract : ""
  AppData ||--o{ Asset : ""
  AppData ||--o{ Health : ""
  AppData ||--o{ Document : ""
  AppData ||--|| Budget : "monthly（null＝未設定）"
```

- 実績は `Transaction` だけ。予定の費用（`CalendarEvent.cost`）は見込みで、実績には数えない（o29 C008）。
- カードの購入と引き落とし：費用は購入の1回だけ。引き落としは現金の動きで、収支に数えない（X03・C009）。
- 返金：購入月の純額と、返金日の現金の戻りを分ける（`lib/refund.ts`・C010）。
- 旅行を削除しても、支出は残してつながりだけ外す（`unlinkTripFromTx`・C012）。
- 書き換えは足すだけ。任意の項目は消さない。形式を変えるときは `migrate()` と試験が先（PJ_RULES）。
- o29 の Account・Posting・Allocation（配分）・操作ID は、今のデータには無い。足すかは ADR と移行試験が先で、今回は作っていない（o29 C016・C011）。

## 3. 保存の流れ（自分用）

```mermaid
sequenceDiagram
  participant 画面
  participant Store as storeCore
  participant Repo as IndexedDbRepository
  画面->>Store: 変更（追加・編集・削除）
  Store->>Repo: save（トランザクションの完了を待つ）
  alt 完了
    Repo-->>Store: ok
    Store-->>画面: 反映・「保存しました」
  else 失敗（容量不足など）
    Repo-->>Store: ok:false
    Store-->>画面: 前の状態のまま・エラー表示・書きかけは残す
  end
```

移行（localStorage → IndexedDB）：読む → 検査 → 仮置き → 件数・金額・関連 ID を読み直して比べる → 一致したときだけ切り替える。旧データは消さない（`lib/idbRepository.ts`）。

## 4. 画面の入口（自分用、o29 A 案）

| タブ | 入る画面 | ＋の既定 |
|---|---|---|
| カレンダー | /calendar | 予定（選んでいる日） |
| 家計簿 | /report・/history・/recurring・/decide・/inbox・/assets・/nisa | 支出 |
| やること | /tasks | やること |
| その他 | /menu と、それ以外の全部（ホーム / を含む） | 種類を選ぶ |

起動時の画面は設定で選ぶ（初期はカレンダー。`lib/startScreen.ts`）。
