# iPhone のウィジェット（平尾さん用）の作り方

作成：2026-11-23。論点 Q25。まずは平尾さんが自分で使う版。友人への配布は、友人β の後に別に決める。

## 1. 何を出すか（平尾さんの希望）
- 今日の予定（最大3件）
- 今月の支出（と、予算があれば残り）
- 支出・収入・予定を入れるボタン（押すとアプリの入力画面がすぐ開く）
- **Safari の履歴を消しても記録が消えないこと**（2026-11-23 平尾さん①。今の Web 版は「履歴と Web サイトデータを消去」で消えるおそれがある。アプリにすると記録はアプリの中に残り、消えるのはアプリを削除したときだけ）

## 2. 作り方の方針
| 部分 | やり方 |
|---|---|
| アプリ本体 | 今の Web アプリ（`app/`）を、Capacitor で iPhone のアプリに包む。画面・保存の形式（`kurashi-base:data:v1`、schemaVersion 2）は変えない |
| ウィジェット | Swift の WidgetKit。アプリと同じ App Group の共有の置き場から、要約（下の3）を読むだけ |
| アプリ → ウィジェット | アプリが記録を保存するたびに、小さな要約を App Group に書き、ウィジェットの再読み込みを頼む（Capacitor の小さな自作プラグイン） |
| ボタン | ウィジェットのリンク → アプリを開いて `/?add=expense`・`/?add=income`・`/?add=event`（2026-11-23 に Web アプリ側を作った：`components/AddFromQuery.tsx`） |

### ウィジェットに渡す要約（案）
```json
{ "updatedAt": "ISO", "today": "YYYY-MM-DD",
  "events": [{ "title": "…", "time": "10:00" }],
  "monthExpense": 12345, "remaining": null }
```
記録の全部は渡さない（ウィジェットに要るのは数字と予定名だけ）。

## 3. 作業の場所
- Mac：`/Users/AI開発`（平尾さんが作成）。Windows から SSH（`ssh kurashi-mac`、鍵は `~/.ssh/id_ed25519_mac`）で操作する
- Mac の Node.js：v26.13.1（`~/.local/node`、2026-11-23 に公式のファイルを確かめて入れた）
- Xcode 27.2 には macOS 26.6 以上が要る。Mac を macOS 27.2.1 に更新中（2026-11-23、平尾さん）→ そのあと App Store で Xcode（平尾さん）

## 4. 気をつけること
- **記録の置き場所が変わる**：アプリにすると、Safari・ホーム画面のアイコンとは別の保存場所になる（BUG-17 と同じ仕組み）。移すときは、今の場所でバックアップを書き出し → アプリで「追加」で復元
- **無料の Apple ID の制限（未確認）**：無料のまま App Group が使えるか、アプリが何日で切れるか（7日と言われる）は、Apple の公式ページでまだ確かめられていない。使えなければ Apple の開発者登録（年1万円台）が要る → その前に平尾さんに相談
- **パッケージの追加**：Capacitor（`@capacitor/core`・`@capacitor/cli`・`@capacitor/ios`）を入れる。入れる前に、名前と出どころを平尾さんに伝える
- **友人β への影響を出さない**：ウィジェット用の作業は、`beta/friend-go` と分けたブランチ（例 `feat/ios-widget`）で行い、公開中の Web アプリ（master）は変えない。`?add=` は Web アプリにも入れたが、指定がなければ何も起きない
- 個人の記録（`自分用/`）は、Mac にも GitHub にも置かない。取り込みは iPhone の上で行う

## 5. 順番
1. macOS 更新・Xcode（平尾さん）
2. Mac にリポジトリを取ってくる（GitHub の Private。Mac での GitHub のログインが1回要る）
3. Capacitor で iPhone のアプリにして、シミュレーターで開く。**最初に、記録がアプリの中に保存され、Safari の履歴を消しても残ることを確かめる**（ウィジェットより先）
4. 要約を書くプラグインとウィジェットを作り、シミュレーターで確かめる
5. 平尾さんの iPhone を Mac につないで入れる（iPhone の「デベロッパモード」をオンにする操作が1回要る）
6. 自分で数日使って、直す

## 6. 進み具合（2026-11-23）
- ブランチ `feat/ios-widget`（master・公開版には入れていない）
- できた：Capacitor 8.6.0 で iPhone アプリ化（`npm run build:app` → `npx cap copy ios`）、要約（`lib/widgetSummary.ts`）を App Group に書く `WidgetBridgePlugin.swift`、ボタン `kurashibase://add/<種類>` で入力画面を開く `MainViewController.swift`、ウィジェット `ios/App/KurashiWidget`（小・中）、アイコン
- シミュレーター（iOS 27.2、Mac の DeviceHub を開いておく）で確かめた：アプリの表示、App Group に要約が書かれる、デバッグ用の起動引数 `-kbOpenURL kurashibase://add/expense` で「支出を追加」が開く
- 点検役：合格（個人用として、e0fb56d）
- 未確認：ウィジェットの見た目（ホーム画面に置く操作が SSH からできない）、実機、無料の Apple ID で App Group が使えるか、アプリの記録が Safari の履歴を消しても残ること（作りの上では別の置き場）
- 知っておくこと：アプリの記録は Safari・ホーム画面のアイコンとは別の置き場（アプリを消すと記録も消える。バックアップを書き出しておく）。入力の途中でウィジェットのボタンを押すと、閉じてよいかを聞く。書きかけは端末に控え、次に同じ入力を開いたときに「続きから／捨てる」を選べる（2026-11-24、100点化 B）
- Mac での組み立て：`cd app && npm run build:app && npx cap copy ios`、`cd ios/App && xcodebuild -project App.xcodeproj -scheme App -sdk iphonesimulator -derivedDataPath /tmp/kbdd build`
- 2026-11-23 21:43 実機（平尾さんの iPhone）：無料の Apple ID（Personal Team）で App Group の署名が通った。Xcode の ▶ で入れ、「VPNとデバイス管理」で信頼。記録を取り込み、中くらいのウィジェットに「今日の予定」「今月の支出 ¥291,049・収入」「＋支出・＋収入・＋予定」が出たことをスクショで確認。ボタンを押したときの動きは未確認
- SSH から iPhone 向けに署名すると errSecInternalComponent（Mac の鍵が SSH から使えない）。iPhone へ入れるときは Mac の Xcode の ▶ を使う
- チームの ID は Mac の project.pbxproj にだけ入れて、Git には入れていない
- 7日の期限への対策（2026-11-23、平尾さん①＝無料のまま自動で入れ直す）：Mac の LaunchAgent `~/Library/LaunchAgents/jp.kurashibase.refresh.plist` が毎日12時・21時に `app/ios/tools/refresh-install.sh` を動かす。署名の期限まで3日を切ったら、古いプロファイルを消して作り直し、Wi-Fi 経由で iPhone に入れ直す（記録は消えない）。記録は `~/Library/Logs/kurashi-refresh.log`。iPhone の識別番号は Mac の `~/.config/kurashi-refresh.env` にだけ置く。21:48 に強制で1回動かし、Wi-Fi 経由で入れ直せた（新しい期限まで6日）
- 条件：Mac の電源が入っていてスリープしていない・iPhone が同じ Wi-Fi。止めるときは `launchctl bootout gui/$(id -u)/jp.kurashibase.refresh`
- 21:50 平尾さん：自動の入れ直しのあとも、アプリの記録は残っていた
- 自動バックアップ（2026-11-23、平尾さん「自動バックアップ機能追加しよか」）：iPhone アプリの中だけ。アプリを開いた・閉じたときに、書類フォルダ「自動バックアップ」に `kurashi-base_backup_YYYYMMDD.json`（1日1ファイル、新しい14個）と、記録がいちばん多かったときの控え `kurashi-base_largest_backup.json`（消さない）を書く。記録が0件なら書かない。「ファイル」アプリ → このiPhone内 → くらしベース から見え、設定の「バックアップから復元」でそのまま読める形。点検役：合格（0034f87、9ca6f45）。22:02 に Mac から Wi-Fi で実機へ入れ直した
- 注意：アプリを消すと自動バックアップも消える（アプリの中の書類フォルダのため）。週1回くらい、「ファイル」アプリで iCloud Drive などにコピーしておくと安心。閉じるときの書き込みと、控えからの復元は実機で未確認
- 22:05 平尾さん：実機の「ファイル」アプリで、自動バックアップができていることを確認（ファイルからの復元・閉じるときの書き込みは未確認）
- iPhone のカレンダーへの反映（2026-11-24、平尾さん②＝アプリから自動）：くらしベースの予定と固定費の支払日（「固定費 家賃 ¥81,330」）を、iCloud かこの iPhone のアカウントの「くらしベース」カレンダーにだけ書く（30日前〜180日先、中身が変わったときだけ書き直す、予定のメモは渡さない）。EventKit を使い、パッケージは足さない。点検役：合格（673184f）。11:55 に実機へ入れ直した
- 知っておくこと：「くらしベース」カレンダーに手で入れた予定は、期間の中なら書き直しで消える。アクセスを断ったときは何も表示しない。終日で何日も続く予定の終わりの日の見え方は実機で未確認
