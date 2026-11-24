# NEXT v21 C巻（運用・実現性・進め方）読了と現行リポジトリとの突き合わせ

作成: 2026-11-25 / 対象: `C\KURASHI_BASE_NEXT_v21` の PLATFORM_FEASIBILITY, FREE_OPERATIONS, OPERATIONS_DEPTH, DELIVERY_PROCESS, CHANGELOG, INDEX_A/B/C（各ファイルを最初から最後まで通読。MANIFEST と READ_ORDER は検証用に別途照合）
比較先: リポジトリ master（HEAD aa8c55c）、feat/ios-widget は `git show` / `git ls-tree` で読むだけ（切替・編集・npm・ビルドなし）。`自分用/` は開いていない。
注意: 私はテストもビルドも実行していない。「検証済み」はリポジトリの記録（GO_EVIDENCE、テスト名、STATE）に書いてあるという意味で、私が再実行したものではない。Web での最新の公式条件の再確認もしていない（未確認）。

## 1. 読了台帳

各ファイル本文の見出しにある版は v12〜v18 で、v21 の刻印は本文にはない。v21 は READ_ORDER.csv・INDEX の側で付いている（全33件「v21」）。

| ファイル | 本文で見えた版 | 要点（3行） | 定義するID | 矛盾・現行との食い違い |
|---|---|---|---|---|
| PLATFORM_FEASIBILITY.md | 「v13 …（設計承認済み・実装未検証）」＋「v14 保存方針（承認済み、実装未検証）」 | ①Web/PWA と iOS の能力表（11機能）。共通TSで計算・保存・OCR・共有・通知・カレンダー・ウィジェット・生体認証・Siri・Watch を整理。能力未確認なら「非提供」と表示 ②保存領域は Web と iOS で別、外部バックアップ必須。0円は規約と署名費用を確認するまで保証しない。外部送信・課金は別承認 ③P01〜P08 の実現性試験は全 NOT_RUN。v14 で IndexedDB/SQLite 第一候補・保存アダプタ・共通バックアップ(版・件数・ハッシュ)・暗号化・10年(約54750件)試験を方針化 | P01〜P08、機能表11行、v14 保存方針、「Sonnet運用」節 | 「現行localStorageを直ちに置換しない」は現行と整合。ADR-001 も IndexedDB は数万件になってからと書いており矛盾なし。「WebAuthn」「Share Extension」等は全て候補（提案）。本文に「Sonnet が開発モデル」とあるが、モデル名・料金は未確認と自ら書いている |
| FREE_OPERATIONS.md | 「v16 運営論点1」＋「v18 承認追補」 | ①利用者料金0円、運営DB/API原則0円、静的配信・端末内計算。無料の永久保証はしない ②Vercel Hobby は個人非商用限定、Cloudflare Pages は規約未確認の代替。Apple 無料 Personal Team は7日でプロファイル期限、TestFlight/App Store は年99USD。契約・支払は別承認 ③FOP01〜FOP05（全 NOT_RUN）。公式確認日 2026-11-25 の URL 4件 | FOP01〜FOP05 | 現行リポジトリの WIDGET_PLAN は「年1万円台」と書き、本ファイルは「年99USD（現地価格確認）」。為替差で矛盾ではないが数字の出所が違う。「v18 承認追補」は「旧候補表記より優先」と書く一方、見出しは「実装未検証」のまま。承認は設計の承認で、費用・実装・試験は別 |
| OPERATIONS_DEPTH.md | 「v17 運営10論点 詳細提案」＋「v18 承認追補」 | ①運営A01〜A10（無料・開発費・Claude Code・配布・障害・更新・依存・安全・長期・再開） ②受入欄は PASS/FAIL/NOT_RUN/BLOCKED、各Aに実測・証跡・担当・版 ③「現時点で実装なし」と明記 | A01〜A10、受入基準 | A03「初回に全資料の存在・版・整合を確認、読了台帳に未解決矛盾」→ 現行 CLAUDE.md には v21 の索引・読了台帳への参照がない（A03未実装の根拠）。A05 の P0〜P4 は、現行の点検役の分類（すぐ直す/次に直す/あとでよい）と別体系 |
| DELIVERY_PROCESS.md | 「v12 開発・品質管理」 | ①変更単位7手順（課題ID・Aの仕様IDとBの受入IDの対応・最小差分・独立レビュー・台帳更新）。公開版変更・有料契約・保存移行は別承認 ②管理台帳の項目一覧、1PR1目的、共通計算・保存は全関連画面を回帰、自動テスト合格を実機合格としない ③A/B 分割管理の規則、更新時に存在・版・参照・ZIP破損を検査 | 管理台帳の列、変更単位1〜7 | **自己矛盾あり**：「A=製品・体験、B=開発・品質」「READMEはBに保持」「ROADMAP/QUALITY_GATE/CHANGELOGはB正本」と書くが、v21 は A/B/C 3巻で、README・ROADMAP・QUALITY_GATE・CHANGELOG は全て C巻（INDEX_C）にあり、B巻は専門領域の資料（DOMAIN_DEPTH 等）。v12 時点の二分割の記述が更新されていない。また「30KBは目安」だが実ファイルは各5KB以下 |
| CHANGELOG.md | 表題「NEXT v6 統合変更履歴」、末尾 v21 まで追記 | ①v3〜v6 の機能群（追加20群・変更12領域・維持10方針）と R0〜R6 の実装順（2026年11月〜2029年以降） ②v7〜v21 は1〜2行ずつの追記。承認の連鎖（v21 で「v20まで全設計承認」） ③「基準 d756cbc」、「ソース変更・実機試験なし」 | なし（R0〜R6 は目安） | 基準が d756cbc だが、現行 HEAD は aa8c55c（以降に100点化 D・E・F など実装あり）。R2「2027年1–3月」以降の計画と、現行の「機能を足すのは2026-11-25まで、その後は不具合直し」（STATE・PJ_RULES）は時期の前提が違う（今日が2026-11-25）。表題が v6 のまま。「現行 d756cbc … 実装済み（主に本人版）」は、現行の edition.ts による personal/public 分離と整合 |
| INDEX_A.md | v21 A巻 | A/B/C全巻必須。11ファイルを列挙 | なし | 実際の A フォルダは11ファイルで一致（全件存在） |
| INDEX_B.md | v21 B巻 | 9ファイルを列挙 | なし | 実際の B フォルダは9ファイルで一致 |
| INDEX_C.md | v21 C巻 | 17ファイルを列挙（README, CLAUDE_START, WEB_IOS_MATRIX, 本稿4種, ROADMAP, QUALITY_GATE, CHANGELOG, TASK_QUEUE.csv, INDEX×3, READ_ORDER.csv, READ_RECEIPT.csv, MANIFEST.sha256） | なし | 実際の C フォルダは17ファイルで一致。MANIFEST.sha256 自身は MANIFEST に含まれない（循環のため通常どおり） |

## 2. MANIFEST と READ_ORDER の検証

- MANIFEST.sha256 は36行。A(11)+B(9)+C(16、MANIFEST自身を除く)＝36 と一致。
- sha256sum で A・B・C の実ファイルと照合した結果は **36件すべて一致。欠落なし、不一致なし**。MANIFEST に載っていないファイルは MANIFEST.sha256 自身のみ。
- READ_ORDER.csv は33件（列：順,ファイル,版。全て v21）。33件すべていずれかの巻に存在。**存在しないファイルなし**。MANIFEST のうち READ_ORDER にないのは READ_ORDER.csv・READ_RECEIPT.csv・TASK_QUEUE.csv の3件（役割上妥当）。
- 注意点（欠陥ではない）：MANIFEST は同じファイル名が複数の巻に重複していないことを前提に、名前だけで照合する形式。パスは含まない。
- 阻害となる欠落資料：なし。

## 3. 仕様項目ごとの現行リポジトリとの対応

分類は次の6つのいずれか：実装済み・検証済み / 実装済み・未検証 / 一部実装済み / 未実装 / 技術検証が必要 / 外部条件によって実装できない。
「版」欄：Web公開=友人β・Vercel公開版、Web自分用=personal版、iOS=feat/ios-widget（master には入っていない）。
「検証済み」は記録上の合格（私は再実行していない）。

### 3-1 PLATFORM_FEASIBILITY：能力表（提案）

| 項目 | 分類 | 根拠 | 対象 |
|---|---|---|---|
| 家計/予定/目標/予測/検索の共通TS | 実装済み・未検証 | `app/src/lib/*.ts` を Web と Capacitor の両方で使う構造（feat の `app/scripts/build-app.mjs`）。「同一入力で両者一致」を測る試験は見つからない（= P06）。目標の構造化・予測・横断検索の機能自体は部分的（検索は 見つからない） | Web/iOS |
| 保存（localStorage） | 実装済み・検証済み | `app/src/lib/storage.ts`（キー `kurashi-base:data:v1`、1回書込み）、`tests/storage-backup.test.ts`・`restore-safety.test.ts`、`docs/release/GO_EVIDENCE_20261122.md` B06（容量不足）。ただしこれは GO 時点の記録 | Web公開/自分用、iOS |
| 保存（IndexedDB/SQLite 比較） | 未実装 | 見つからない（`indexedDB`・`sqlite` の grep 0件）。`docs/architecture/ADR-001_stack_and_storage.md` が将来検討と書く | Web/iOS |
| オフライン（Service Worker・キャッシュ） | 未実装（Web） | `serviceWorker` の grep 0件、`app/src/app` に manifest なし。Web 版に PWA 化はない（STATE「PWA を進めるか」はユーザー待ち） | Web |
| オフライン（同梱資産） | 実装済み・未検証 | feat: 静的書き出し（`KB_EXPORT=1`）を Capacitor が同梱。初回/再起動/更新失敗の試験は見つからない | iOS |
| OCR | 未実装 | `docs/DECISIONS.md` 2026-11-21・2026-11-22、`docs/progress/ISSUES.csv` Q10 は「入れない」、Q22 は友人β後。`tools/ocr_benchmark/` は評価用の足場のみ。端末内 OCR の精度・メモリ・ライセンスは技術検証が必要（PLATFORM の P03） | Web/iOS（検証未） |
| 共有（ファイル選択） | 実装済み・検証済み | バックアップ復元・CSV 取り込みでファイル選択（`app/src/app/settings/page.tsx`）、GO_EVIDENCE R4/R5 | Web公開/自分用 |
| 共有（Share Extension / Web Share） | 未実装 | `navigator.share`・Share Extension とも見つからない | iOS（SafariはPLATFORM自身が受信を仮定しない） |
| 通知 | 外部条件によって実装できない（Web Push）／未実装（iOS ローカル通知） | Web Push は配信基盤が要ると PLATFORM に明記（費用・インフラ未定）。リポジトリに `Notification` なし。iOS ローカル通知も見つからない | Web / iOS |
| カレンダー ICS 書き出し | 実装済み・検証済み | `app/src/lib/ics.ts`、`calendarExport.ts`、`tests/ics.test.ts`・`calendar-export.test.ts`。STATE 11-24「公開済み」。iPhone での .ics 読み込みは実機未確認（STATE） | Web公開/自分用 |
| カレンダー ICS 取り込み | 未実装 | 見つからない | Web/iOS |
| カレンダー EventKit 反映 | 実装済み・未検証（一部のみ実機確認） | feat: `app/ios/App/App/WidgetBridgePlugin.swift`、`NSCalendarsFullAccessUsageDescription`（Info.plist）。WIDGET_PLAN：終日の複数日予定の見え方は実機未確認。往復の重複・外部IDの試験記録は見つからない | iOS（自分用） |
| ウィジェット（iOS WidgetKit） | 実装済み・未検証（一部のみ実機確認） | feat: `app/ios/App/KurashiWidget/KurashiWidget.swift`、`app/src/lib/widgetSummary.ts`、`tests/widget-summary.test.ts`。WIDGET_PLAN 11-23 21:43 実機で表示確認、ボタンの動きは未確認 | iOS（自分用） |
| ウィジェット代替（Web のアプリ内カード） | 実装済み・未検証 | master: ホームの「今日のまとめ」（コミット c9b0b32、`docs/review/PLAN100_RESPONSE.md`）。自分用のみ。実機での確認は未（PLAN100 まだのもの） | Web自分用 |
| 生体認証（WebAuthn / LocalAuthentication） | 未実装 | `NSFaceIDUsageDescription` なし、LocalAuthentication/WebAuthn の記述なし | Web/iOS |
| ショートカット / Siri | 一部実装済み | URL 起動のみ：`app/src/components/AddFromQuery.tsx`（`/?add=`）、feat の `kurashibase://add/<種類>`（`MainViewController.swift`）。App Intents は見つからない | Web（?add=）/ iOS（URL）。ボタン押下は実機未確認 |
| Watch | 未実装 | 見つからない。PLATFORM は「別開発」と明記 | iOS |
| 保存領域の分離の周知・外部バックアップ | 実装済み・検証済み | 記録は Safari・ホーム画面・アプリで別（BUG-17）。ホームと使い方に案内（STATE 11-23）。バックアップ JSON は版・件数・チェックサム（`app/src/lib/backup.ts`）、`GO_EVIDENCE` R4〜R6。iOS アプリの自動バックアップは実機で「ファイル」アプリから確認、復元は未確認（WIDGET_PLAN） | Web/iOS |
| 静的配信 HTTPS・SW 更新・旧データ互換 | 実装済み・検証済み（HTTPS と旧データ）／SW 部分は対象外 | Vercel `https://kurashi-base-tau.vercel.app/` で iPhone R1〜R8 PASS（STATE）。旧データ互換は `migrate()`（`schema.ts`）と `tests/v2.test.ts`・`data-protection.test.ts`。SW は未実装なので更新互換は N/A | Web公開 |
| 0円保証なし／外部送信・課金は別承認 | 実装済み・検証済み（運用規則として） | `CLAUDE.md`・`docs/PJ_RULES.md`（push・公開・外部送信・npm 追加は OK 後）。アプリに `fetch(` なし（grep 0件）、`robots: noindex`（`app/src/app/layout.tsx`） | 両版 |
| Sonnet 運用方針（小差分・関連ID・独立レビュー） | 一部実装済み | 点検役 `release-checker` を使う運用（PLAN100_RESPONSE）。「関連仕様IDを渡す」運用は NEXT v21 を使っていないため未確認 | 開発プロセス |

### 3-2 PLATFORM_FEASIBILITY：実現性試験 P01〜P08（全 NOT_RUN の提案）

| ID | 分類 | 根拠 | 対象 |
|---|---|---|---|
| P01 保存分離と復元 | 一部実装済み（正式な試験は未実施） | BUG-17 を実機で確認、バックアップ→復元は公開URLで R4〜R6 PASS、アプリへの入れ直し後も記録が残ったと WIDGET_PLAN に記録（11-23）。ただし「Safari/ホーム追加/ネイティブ」の3者を P01 の形で揃えた試験記録は見つからない | Web/iOS |
| P02 オフライン初回/再起動/更新 | 未実装（試験なし） | SW なし。iOS 同梱の試験記録なし | Web/iOS |
| P03 OCR 端末別精度・メモリ | 技術検証が必要 | OCR エンジン未導入。`docs/OCR_DATA_LICENSE_CHECK.md` は日本のレシートで測れないと結論。データ約5GB のダウンロードは未承認 | Web/iOS |
| P04 通知拒否・配信費用・代替 | 外部条件によって実装できない（Web Push の配信基盤）／未実装 | 3-1 の通知行 | Web/iOS |
| P05 共有/ICS/ウィジェットの能力と代替 | 一部実装済み | ICS 書出し・ウィジェット・URL 起動は実装。ICS 取り込み・Share Extension は見つからない。「能力未確認は非提供と表示」は PJ_RULES「使えない機能を使えるように見せない」と同方針 | Web/iOS |
| P06 同一合成データで共通計算一致 | 技術検証が必要 | 共通TSは実装済みだが、Web と iOS で同じ合成データを通した比較は見つからない。計算の単体テストは `tests/lib.test.ts`・`plan100.test.ts`（`lib/ledger.ts`、指示書の検証データで一致と PLAN100_RESPONSE に記載） | Web/iOS |
| P07 署名・配布・ホスティング費用台帳 | 未実装 | 台帳としてまとまったファイルは見つからない。情報は `docs/RELEASE_PREP.md`・`docs/progress/ISSUES.csv` Q20/Q25・`docs/widget/WIDGET_PLAN.md`（feat）に散在 | 全体 |
| P08 10年データ・容量不足・複数タブ競合 | 一部実装済み | 容量不足：B06 PASS。複数タブ：`saveDataIfUnchanged`（`storage.ts`）と `storage` イベントの再読込（`store.tsx`）、`tests/go-data-deletion.test.ts` など。10年（約54750件）の試験は見つからない | Web/iOS |

### 3-3 PLATFORM_FEASIBILITY：v14 保存方針（承認済みの設計）

| 項目 | 分類 | 根拠 | 対象 |
|---|---|---|---|
| Web IndexedDB／iOS SQLite への移行 | 未実装 | 見つからない。ADR-001「数万件になる頃に IndexedDB」 | Web/iOS |
| 保存アダプタ（保存と共通計算の分離） | 一部実装済み | `storage.ts` に `KV` インターフェース（注入可能）。計算は `lib/ledger.ts`・`dataOps.ts` に分離（PLAN100）。IndexedDB/SQLite 用アダプタはなし | Web/iOS |
| 共通バックアップ JSON（版・件数・ハッシュ） | 実装済み・検証済み | `app/src/lib/backup.ts`（`schemaVersion`・`counts`・`checksum`、復元前に照合）、`tests/storage-backup.test.ts` | 両版 |
| 共通バックアップ ZIP | 未実装 | zip の処理は見つからない | 全 |
| CSV 可搬性（取り込み） | 実装済み・検証済み | `app/src/lib/csvImport.ts`、`tests/csv-import.test.ts`、`docs/import/KURASHI_IMPORT_SPEC.md`。公開済み（`edition.ts` csvImport） | 両版 |
| CSV 書き出し | 未実装 | 見つからない | 全 |
| ICS 可搬性（書出し） | 実装済み・検証済み | 3-1 の ICS 行 | 両版 |
| 元画像と OCR 結果の分離保持 | 未実装 | 画像保存・OCR とも未実装 | 全 |
| 端末内世代バックアップ | 実装済み・未検証（iOS のみ） | feat: 書類フォルダ「自動バックアップ」に日次14個＋最大件数の控え。Web 版には対応する機能なし。閉じるときの書込みと復元は実機未確認 | iOS |
| 端末外保存の区別（案内） | 一部実装済み | 「ファイルに書き出す」「週1回 iCloud Drive にコピー」の案内は WIDGET_PLAN と RELEASE_PREP にあり。画面上で端末内と端末外を区別して表示しているかは未確認 | Web/iOS |
| 移行手順（保全→コピー→検証→切替→再起動） | 一部実装済み | v1→v2 は `migrate()`＋`v2.test.ts`、復元前の控えと「直前の操作を取り消す」（DECISIONS 2026-11-22、`readUndo`/`restoreUndo`）。ストレージエンジン切替の手順は N/A（切替が未実装） | Web/iOS |
| 中断・再実行・容量不足・複数タブの試験 | 一部実装済み | 容量不足と複数タブは試験あり（P08 行）。中断・再実行の網羅は未確認 | Web |
| 暗号化（標準技術・鍵紛失説明） | 未実装 | 見つからない | 全 |
| 10年試験（54750件） | 未実装 | 3-2 P08 | 全 |

### 3-4 FREE_OPERATIONS

| ID | 分類 | 根拠 | 対象 |
|---|---|---|---|
| 方針：利用者0円・運営DB/APIなし・静的配信・端末内計算 | 実装済み・検証済み | サーバー処理なし・`fetch(` なし。Vercel 静的配信。`docs/CHARTER.md`・ISSUES Q12（同期しない）。ただし「無料を永久保証しない」は文書側の留保 | Web公開 |
| Vercel Hobby は個人非商用限定 | 外部条件によって制約あり（現行は条件内と推定、未確認） | 現行は友人1人・無料・非公開リポジトリ（`docs/RELEASE_PREP.md`）。ただしリポジトリの文書に「Hobby は個人非商用限定」の記述が見つからない＝現行文書は規約を確認した記録が薄い。公式規約の再確認は私は未実施 | Web公開 |
| FOP01 費用台帳（用途・契約・上限・停止時影響・代替・確認日・担当）、上限接近の通知 | 未実装 | 台帳ファイルは見つからない。「無断課金なし」は PJ_RULES と CLAUDE.md の承認規則で担保 | 全 |
| FOP02 静的ビルドを別配信先で試験／origin変更時の外部バックアップ→復元→照合 | 一部実装済み | feat: `KB_EXPORT=1` の静的書き出し（`build-app.mjs`）。`docs/RELEASE_PREP.md` に「記録は URL ごとに別、移すならバックアップ→復元」の手順。別の配信先（Cloudflare Pages 等）での試験は見つからない | Web/iOS |
| FOP03 OCR 等の遅延読込・通信量計測・キャッシュ更新の旧版互換 | 未実装 | OCR 未導入、通信量計測なし | Web |
| FOP04 配布終了時のエクスポート・案内・オフライン制約 | 一部実装済み | エクスポート（バックアップ書出し）は実装済み。配布終了の案内文・手順は見つからない | 全 |
| FOP05 無料枠・規約・ライセンス・署名/実機制約・費用の公開前確認 | 一部実装済み | OCR データ利用条件（`docs/OCR_DATA_LICENSE_CHECK.md`）、Apple 無料 ID の App Group・7日期限の実機確認（WIDGET_PLAN）。Vercel・Cloudflare の規約確認は見つからない（未確認） | 全 |
| 公式確認 URL（Vercel Hobby/規約、Apple アカウント/登録） | 未確認 | 文書内の確認日は 2026-11-25。私は Web を開いていないため再確認していない | — |

### 3-5 OPERATIONS_DEPTH

| ID | 分類 | 根拠 | 対象 |
|---|---|---|---|
| A01 無料（台帳・上限・代替・無断課金禁止・配信停止時のデータ持出し） | 一部実装済み | データ持出し＝バックアップ書出し（実装済み）。台帳・上限・代替は FOP01 と同様に見つからない | 全 |
| A02 開発費（差分範囲・テスト選択・費用/時間/再作業の記録） | 未実装（記録なし） | 費用・時間・再作業の記録は見つからない。全回帰は `npm run check` に集約（`app/package.json`）。差分範囲は PJ_RULES「範囲を絞る」 | 開発 |
| A03 Claude Code（CLAUDE.md・仕様索引・読了台帳・分割と引継ぎ） | 一部実装済み | `CLAUDE.md`（必須規則と最初に読む3ファイル）、`docs/STATE.md`。v21 の仕様索引・読了台帳（パス・版・要件ID・未解決矛盾）は見つからない | 開発 |
| A04 配布（個人iOS検証・友人Web・別ゲート・origin変更前バックアップ・署名と費用の確認） | 一部実装済み | 版の分離：`app/src/lib/edition.ts`・`tests/edition.test.ts`。友人β公開は B01〜B15（GO_EVIDENCE）。個人版の別ゲートは点検役のみで、公開版のB表に当たる固定ゲートは見つからない。一般Web公開は未着手 | Web公開/自分用/iOS |
| A05 障害（P0〜P4、封じ込め、復旧、告知） | 一部実装済み | `docs/UX_BUGS.md`（P0/P1 の記載は0件）、`docs/RAID.md`、`docs/release/FRIEND_FEEDBACK.md`、RELEASE_PREP の「戻し方（Vercel の Promote）」。重大度 P0〜P4 の体系は見つからない | 全 |
| A06 更新（旧DB/新DB・キャッシュ・入力中更新・移行中断・復元） | 一部実装済み | 書きかけの控え（`lib/sheetDraft.ts`・`draft.ts`、PLAN100 B）、他タブ更新で入力を残す（STATE 11-22）、`migrate()`、取り消し。キャッシュ（SW）は N/A。不可逆移行の承認規則は PJ_RULES「保存の形を変えるときは migrate とテストが先」 | Web/iOS |
| A07 依存（ライセンス・脆弱性・容量・保守台帳） | 一部実装済み | `app/package-lock.json`（ロックファイル）。台帳は見つからない。npm 追加は承認制。feat で Capacitor 8.6.0 を追加（`app/package.json`）。脆弱性監査の記録は見つからない | 開発 |
| A08 安全（非信頼入力・HTML実行禁止・CSV数式注入・ZIP・機密ログ禁止・ウィジェット秘匿・最小権限） | 一部実装済み | `dangerouslySetInnerHTML` は `components/Logo.tsx` の1箇所のみ（内部の固定シンボル）。`console.*` の使用0件。ICS の文字エスケープ（`ics.ts` の `icsEscape`、`tests/ics.test.ts`）。CSV は取り込みのみで書出しがないため、数式注入対策（書出し時）は N/A。取り込み値の安全性は `csvImport.ts` で文字列として扱う想定だが、悪性入力試験は見つからない。ZIP は未実装のため N/A。ウィジェットはメモを渡さない設計（WIDGET_PLAN）だがロック画面での金額表示の方針は未確認。権限は EventKit のみ（Info.plist） | Web/iOS |
| A09 長期（版付き形式・移行経路・10年データ・配信終了案内） | 一部実装済み | `schemaVersion`（現在2）、`migrate()`、`checksum`。10年試験と配信終了案内は見つからない | 全 |
| A10 再開（コミット・環境・コマンド・仕様版・WBS/ISSUES・試験証跡・次作業・未解決・別セッション再開試験） | 一部実装済み | `docs/STATE.md`、`docs/NEXT_SESSION_HANDOFF.md`、`docs/progress/WBS.csv`・`ISSUES.csv`、`PLAN100_RESPONSE.md`。仕様版（NEXT v21）の記録と別セッションでの再開試験は見つからない | 開発 |
| 受入（各Aに実測・証跡・担当・版・PASS/FAIL/NOT_RUN/BLOCKED） | 未実装 | A01〜A10 に対応する受入表は見つからない。現行の合否表は B01〜B15（GO_EVIDENCE）で体系が異なる | 全 |

### 3-6 DELIVERY_PROCESS

| 項目 | 分類 | 根拠 | 対象 |
|---|---|---|---|
| 変更単位1 課題ID・利用場面・現状証拠・対象版 | 一部実装済み | `docs/progress/ISSUES.csv`（Q番号）、`docs/progress/WBS.csv`、`docs/UX_BUGS.md`（BUG番号）。「対象版」の記録は STATE のコミット記載で代替 | 開発 |
| 変更単位2 Aの仕様IDとBの受入IDの対応 | 未実装 | NEXT v21 の ID 体系を使った対応表は見つからない。現行は PLAN100_RESPONSE の「指示→コミット」表と旧 V/B 番号 | 開発 |
| 変更単位3 既存処理を調査し再利用優先 | 一部実装済み | PJ_RULES「範囲を絞る」、LESSONS。強制の仕組みは見つからない | 開発 |
| 変更単位4 最小差分＋単体・統合・実機 | 実装済み・検証済み（単体・統合）／実機は一部未確認 | `npm run check`（型・lint・vitest・build）。実機は多くが「未確認」とSTATEに明記 | 開発 |
| 変更単位5 変更前後の画面・操作時間・回帰・復旧手順 | 一部実装済み | `docs/screens/index.html`、`tools/screens/capture.mjs`（画面の記録）。操作時間の記録は見つからない | 開発 |
| 変更単位6 独立レビュー | 実装済み・検証済み | 点検役 `release-checker`（PLAN100_RESPONSE の2回点検）、ChatGPT レビュー o1（`docs/review/`） | 開発 |
| 変更単位7 WBS/ISSUES/PROGRESS 更新・未検証は NOT_RUN | 実装済み・未検証 | `docs/progress/PROGRESS.html`・`tools/progress.py`。ただし STATE の記載は「更新日 11-24」で、`beta/friend-go` と書かれている一方、現在のブランチは master（記述が古い可能性。未確認）。NOT_RUN という語は現行では「未確認（NOT_RUN）」の形で一部使用 | 開発 |
| 公開版変更・有料契約・保存移行は別承認 | 実装済み・検証済み（規則として） | `CLAUDE.md`・PJ_RULES（push・公開・外部送信・npm・保存形式） | 開発 |
| 管理台帳（仕様ID/課題ID/対象版/…/復旧方法） | 未実装 | 列を揃えた台帳は見つからない（STATE・ISSUES・WBS に分散） | 開発 |
| 1PR 1目的、共通計算・保存変更は全関連画面を回帰 | 一部実装済み | 現行は単一の master 運用と日次コミット。PR は使っていない（git log）。回帰は `npm run check` 全件 | 開発 |
| UI 変更は前後画像と文言辞書照合 | 一部実装済み | 画面の記録（`docs/screens/`）、`docs/JAPANESE_COPY_AUDIT.md`、`tests/copy-v5.test.ts`。前後比較は版ごとのスナップ | 開発 |
| 自動テスト合格だけで実機合格としない | 実装済み・検証済み（規則） | PJ_RULES「テスト未実施・実機未確認を合格と書かない」。STATE が実機未確認を明記 | 開発 |
| A/B 分割管理（A=製品、B=開発・品質）、READMEはB等 | 矛盾（本資料内） | 1章の DELIVERY_PROCESS 行を参照。v21 の3巻構成と本文が不一致。現行リポジトリにこの分割はない | — |
| 更新時に存在・版・参照・承認状態・ZIP破損の検査 | 未実装 | 検査スクリプトは見つからない（今回の MANIFEST 照合は私が手で実施） | 開発 |

## 4. 費用・外部条件（現在発生しているもの／発生しうるもの）

| 項目 | 現在の発生 | 将来の発生条件・金額 | 出典 | 承認 |
|---|---|---|---|---|
| Apple Developer Program（TestFlight/App Store/長期署名） | なし（無料 Personal Team で運用中。署名7日で切れるため Mac の LaunchAgent が自動で入れ直し） | 年99USD（現地価格確認要）。現行リポジトリでは「年1万円台」と表記 | FREE_OPERATIONS、`docs/widget/WIDGET_PLAN.md`（feat）、ISSUES Q25 | **承認が必要**（「契約・支払は別承認」）。登録前に平尾さんへ相談と WIDGET_PLAN にも明記 |
| Mac・Xcode・macOS 更新 | 機器は既に所有。追加費用なし（macOS 27.2.1・Xcode 27.2） | 自動の入れ直しは Mac の電源と同じ Wi-Fi が条件（外部条件） | WIDGET_PLAN | 条件の変更は本人判断 |
| Vercel（Hobby） | 0円。master を自動デプロイ中（友人1人） | 個人非商用限定。商用・一般公開で条件に合わなくなる可能性＝別プラン費用（本資料は金額を示していない）。上限接近時は通知と配信最適化（FOP01） | FREE_OPERATIONS、`docs/RELEASE_PREP.md`、ISSUES Q20 | **承認が必要**（契約・支払） |
| Cloudflare Pages（代替） | なし | 規約・上限が未確認 | FREE_OPERATIONS | 採用時に確認と承認 |
| 独自ドメイン | なし（`kurashi-base-tau.vercel.app` のサブドメイン） | 資料内に費用の記載は見つからない（未確認）。origin が変わると記録が別になる（RELEASE_PREP）ため、移行前に外部バックアップが必須 | リポジトリ（RELEASE_PREP）、FOP02 | 契約時は承認が必要（FREE_OPERATIONS の一般則） |
| GitHub（Private リポジトリ） | 0円（`kkkaipppp/kurashi-base`、Private）。GitHub Pages を使う場合は公開リポジトリが必要（ISSUES Q20） | — | RELEASE_PREP、ISSUES Q01/Q20 | 公開範囲の変更は承認 |
| Web Push の配信基盤 | なし | 配信基盤が必要で費用は不明（本資料は金額なし）。PLATFORM は任意時刻のローカル通知を保証しない | PLATFORM_FEASIBILITY（P04） | **承認が必要**（外部送信・課金は別承認） |
| OCR 評価データのダウンロード（約5GB）と Python datasets の導入 | なし（未実施） | 通信量・保存容量。CORD v2 は CC BY の表示義務あり | `docs/OCR_DATA_LICENSE_CHECK.md`、ISSUES Q22 | **承認が必要**（平尾さんの OK、友人β後） |
| npm パッケージの追加（Capacitor 3種など） | feat に Capacitor 8.6.0 が入っている（費用なし）。追加は都度 | OCR・暗号化・DB 接続層等の追加ライブラリ。ライセンス確認（A07） | `app/package.json`（feat）、PJ_RULES | **承認が必要**（PJ_RULES） |
| 開発に使う AI（Sonnet 等）の料金・利用枠 | 未確認 | PLATFORM は「モデル名や料金、利用枠は未確認」。Opus 等の上位は必要時のみ | PLATFORM_FEASIBILITY、OPERATIONS_DEPTH A02 | 契約変更は承認 |
| Apple Watch、Share Extension、App Intents の追加開発 | なし | Watch は別開発で費用・実機が必要（PLATFORM）。他は無料 ID で足りるかは未確認 | PLATFORM_FEASIBILITY | 着手前に承認 |
| 任意同期・外部サーバー | なし（`fetch` なし） | サーバー・費用・個人情報の管理が必要（ISSUES Q12 は「端末だけ」に決定）。CHANGELOG の R5（2028年）に任意共有・同期 | ISSUES Q12、CHANGELOG | **承認が必要** |

## 5. 補足（読み取りの限界と注意）

- 現行のリポジトリ文書（STATE.md）の「ブランチ：beta/friend-go」は、現在の checkout（master）・直近コミット（aa8c55c）と合っておらず、古い可能性がある。STATE のテスト件数（295/301）も私は再実行していない。
- 現行 master は 11-25 までに機能を足すと決めている（PJ_RULES）。NEXT v21 の R2 以降（2027年）とは時期の前提が異なり、実装に入る場合は友人βの感想後に平尾さんが決める扱い。
- 文書の見出しは「設計承認済み・実装未検証」。承認は設計であり、実装・費用・試験の承認ではない（本文にも明記）。
