# o31 改革の報告（2026-11-27 時点・途中）

- 仕様：`00_受領資料/final_o31_20261127/`（o30・o29 を含む）
- ブランチ：`o31/reform`（master 4958f28 から）。コミット 71df1b2 → 262562f → 0516a9c → 5b50c09
- **push・公開・master への取り込みはしていない**（承認待ち）。自分用の feat/ios-widget にも、まだ入れていない
- 再開するときは `docs/integration/O31_PROGRESS.md` から

## 1. 判定（リリース可否）
**公開不可・完成ではない。** 理由：
- P2（カテゴリの親子・繰り返し）・P5（自由記録・保存集計・入力候補）が未実装、P3・P4 も一部（下の表）
- iPhone 実機・文字200%・VoiceOver・320px の目視は未確認（o31 X011）
- 公開版に効く言葉の直しは、平尾さんの OK が要る（RAID I-04）
- 復元の上限と大きなバックアップの矛盾（RAID R-08）が未解決

自分用の作業ブランチで続けるのは、2026-11-27 の再点検（kurashi-qa）・反証（kurashi-redteam）の指摘を直したあとで「記録を失う道・外へ送る道は見つかっていない」。ただし、直したあとの3回目の点検はまだ（下の 4）。

## 2. F 番号の結果（02_最終作業台帳）
判定の正本は `docs/integration/O31_MAPPING.csv`（作業前の判定）。この表は作業のあと。

| F | 内容 | 結果 | 根拠（コード・試験） |
|---|---|---|---|
| F001 | 下のメニュー 1〜4・右端の追加・上の全機能 | 自分用で実装 | `lib/navPrefs.ts`・`components/PersonalShell.tsx`・`ui.tsx` GlobalActions・`NavSettingsCard.tsx`／`tests/o31-nav.test.ts` |
| F002 | 追加と下書き | 自分用で実装（下書きは既存の種類ごとの下書きを再利用） | `AddSheet.tsx`・`UIContext.tsx`（どの入口も同じ一覧）／o31-nav |
| F003 | その他・検索 | 自分用で実装（お気に入り・最近・検索・すべての機能） | `PersonalMenu.tsx`・`lib/menuPrefs.ts`・`lib/menuGroups.ts`／o31-menu |
| F004 | 表示の自由化 | 一部（起動時の画面・下のメニュー・カレンダーの表示の形）。画面ごとの項目・密度は未 | `StartScreenCard.tsx`・`CalendarViews.tsx` |
| F005 | 日本語・AI 感 | 実装（約150か所。両方の版）。実機での見え方は未確認 | 文言の点検表（scratchpad の o29_copy_audit.csv 2,625件）・各試験 |
| F006 | カテゴリの親子・別名など | 未実装 | — |
| F007 | 独自分類軸 | 未実装 | — |
| F008 | カレンダーの表示 | 一部（月・週・一覧。年・日は未） | `CalendarViews.tsx`／o31-calendar-views |
| F009〜F011 | 日付の意味・繰り返し・関連予定の移動 | 未実装（既存の動きのまま） | — |
| F012 | 資格と受験 | 一部（受験の回・結果・点数。公式情報の更新は未） | `StudyShelf.tsx`・`lib/studyCore.ts`／o31-study-core・o31-study-data |
| F013 | 教材・本棚 | 一部（状態・版・量・進んだ範囲。2つの資格への結びつけは型だけで画面は未） | 同上 |
| F014 | 教材の推薦 | 未実装（外部カタログは承認待ち） | — |
| F015 | 勉強タイマー | 実装 | `StudyTimer.tsx`／o31-study-core（45分−10分＝35分・二重で1件・時刻の戻り） |
| F016 | 学習実績 | 実装（範囲の和・正答率） | 同上（181〜196 を2回で16ページ・10/12） |
| F017 | 学習計画 | 一部（教材ごとの1日の量と、試験の前の復習の日数を本棚に出す。時間の目安は前から。週ごとの計画の画面は未） | `bookPlan`・`StudyShelf.tsx` PlanLine／o31-study-plan |
| F018 | 目標の条件 | 実装（AND/OR・未判定・期限前の上限） | `lib/goalCond.ts`・`GoalConditions.tsx`／o31-goal-cond・o31-goal-data |
| F019 | 目標の階層 | 一部（親・循環の拒否・達成の写し。子目標の一覧は未） | 同上 |
| F020 | 実績の参照 | 計算だけ（画面で結ぶのは未） | `linkedTotals` |
| F021〜F023 | 自由記録・保存集計・入力候補 | 未実装 | — |
| F024 | 保存・移行 | 既存の仕組みのまま（新しい項目は任意で足すだけ・往復の試験）。操作 ID の全体化は未 | o31-study-data・o31-goal-data・o29-acceptance（T010〜T013） |
| F025 | 負担・品質 | 一部（試験・性能の測定）。操作時間の実測は未 | `docs/design/o29/PERF_RESULT.md` |

## 3. 矛盾の解消（03_矛盾決定台帳ほか）
- C001 中央の＋・固定のその他 → 撤回して右端の「追加」（DECISIONS 2026-11-27）
- C002 右端の一覧と画面内の直接追加 → 共存（この日に追加・各画面の追加ボタンはそのまま）
- C003 非表示と削除 → 分ける（隠しても記録は消えない。設定・使い方・バックアップは隠せない）
- C012 受験と学習 → 別に持つ（受験の回は資格の中、学習は記録）
- C015 壁時計 → 終わるときに確かめる（時刻の戻り・1日超え）
- C016 ページ位置と学習済み範囲 → 範囲の和で数える（復習は数えない）
- C018 異単位 → 足さない（本棚も教材の単位だけ）
- C020 二重計上 → 同じ記録は全体で1回（`linkedTotals`）・タイマーは同じ ID で1件
- 公開版と自分用 → 自分用の部品は公開版の組み立てに入れない（公開版の .next で自分用の文字0件を確認）

## 4. 試験（両版）
- `cd app && npm run check`（公開版の組み立て）：**891件合格・1件は性能の測定で通常は飛ばす・build 成功**（5b50c09）
- 自分用の組み立て：`KB_EDITION=personal npx next build` 成功（5b50c09）。自分用の試験は同じ試験で版の分岐を確かめている（`IS_PERSONAL` の分岐はソースの試験）
- 受入：o29-acceptance（50件）・o31-nav・o31-menu・o31-settings・o31-money-screen・o31-calendar-views・o31-study-core・o31-study-data・o31-goal-cond・o31-goal-data
- 独立点検：kurashi-qa（高1・中5・低7）と kurashi-redteam（11件）→ 直した（5b50c09）
- 再点検（2026-11-27 昼、5b50c09 に対して）：kurashi-qa（中4・低9）・kurashi-redteam（中4・低4）→ 直した（このあとのコミット）。主なもの：範囲の条件が期限の前に「満たす」になる／勉強の終わりの単位が教材と合わない／別のタブで変わった目標の条件を黙って上書き・消えた目標や資格に保存して「保存しました」／ほかのタブで記録済みのタイマーに「記録しました」／カレンダーの週・一覧の部品が公開版に入っていた／期限なしの「以下」が永久に未判定／数の読み取りが 0x10・1e3 を受け付ける／メモが選んだ日で始まらない／消えた親・消えた教材の参照
- 直したあとの check：公開版 **917件合格・1件は性能の測定で飛ばす・build 成功**、公開版の .next/static に自分用の文字（週の予定とお金・月の予定とお金の一覧・試験日までに終えるには・復習の日数・達成条件・お気に入りに入れる・続きを始める）が0件。自分用の組み立ても成功。1回目の check で試験が1件落ちた（開発用サーバーを止めたのと重なった。名前はログを消してしまい確認できていない。2回目と、試験だけの実行では全部合格）
- 試験の弱さ（再点検 M-4）：画面の動きを確かめる試験は無い（testing-library などは npm の追加が要るので承認待ち）。判定を関数に出して動きを試験し（o31-review2）、画面はブラウザで確かめた（教材の単位が「問」なら勉強の終わりの単位も「問」・教材を変えただけでも閉じる前に確かめる・復習の日数と1日の量）
- 3回目の独立点検：未

## 5. 画面
- 改革前（自分用）：`docs/screens/2026-11-27_o29-before-personal_1ec623c_390/`
- 改革後（自分用）：`docs/screens/2026-11-27_o31-personal_5b50c09_390/`
- 改革後（公開版）：`docs/screens/2026-11-27_o31-public_5b50c09_390/`（言葉以外は前と同じ）
- 一覧：`docs/screens/index.html`

## 6. 構成とデータ
- 構成図・データの関係：`docs/design/o29/ARCHITECTURE.md`（o31 の部品は PersonalShell・AddSheet・PersonalMenu・StudyTimer・StudyShelf・GoalConditions・CalendarViews）
- 足した項目（どれも任意・足すだけ・形式の番号 2 のまま）：`types.ts` の StudyLog（bookId・startedAt・endedAt・range・questions・correct・review）、StudyBook（status・edition・total・unit・alsoSubjectIds・txId）、StudySubject.exams、Goal（conditions・condMode・parentId・achievements）。検査は `schema.ts`
- 端末の表示の設定（記録ではない。バックアップに入らない）：`kurashi-base:ui:nav`・`add-favorites`・`menu-favorites`・`menu-recent`・`start-screen`・`calendar-view:v1`・`kurashi-base:study-timer`

## 7. 性能
`docs/design/o29/PERF_RESULT.md`（Node・Windows・合成データ。iPhone 実機は未）。10万件で画面の計算の合計 p50 4.3秒、最も重いのは復元のファイルの読み込み 0.5秒。

## 8. 未解決・未確認
- 未実装：F006・F007・F009〜F011・F014・F021〜F023、F004・F008・F012・F013・F017・F019・F020 の残り
- 未確認：iPhone 実機・200%・VoiceOver・320px の目視・操作時間（支出10秒・勉強再開1タップ）
- 承認待ち：公開版の言葉（master に入れる）・push・教材の外部カタログ・収益化・npm の追加（Playwright・fake-indexeddb）
- リスク：RAID R-08（復元の上限）・R-09（旧版に戻す）・I-04・I-05
