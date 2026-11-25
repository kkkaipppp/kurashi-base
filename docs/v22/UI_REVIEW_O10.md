# o10 UI詳細レビュー（追加100視点）
o9の抜本改革方針をユーザー承認。既存UI01–16を維持し、下記を追加受入条件とする。100件は机上の個別レビュー項目であり実機試験100回ではない。コード修正は限定的。全項目 NOT_RUN（実画面未確認）。
|ID|領域|参照箇所（後半は設計参照を含む）|改善・受入条件|状態|
|---|---|---|---|---|
|U017|文字階層|ui.tsx / globals.css|本文16px|NOT_RUN|
|U018|文字階層|ui.tsx / globals.css|補足13px|NOT_RUN|
|U019|文字階層|ui.tsx / globals.css|見出し17–20px|NOT_RUN|
|U020|文字階層|ui.tsx / globals.css|主要金額28–36px|NOT_RUN|
|U021|文字階層|ui.tsx / globals.css|入力16px以上|NOT_RUN|
|U022|文字階層|ui.tsx / globals.css|任意表示12px|NOT_RUN|
|U023|文字階層|ui.tsx / globals.css|ナビ12px|NOT_RUN|
|U024|文字階層|ui.tsx / globals.css|行間1.5|NOT_RUN|
|U025|文字階層|ui.tsx / globals.css|200%文字拡大|NOT_RUN|
|U026|文字階層|ui.tsx / globals.css|数字の桁揃え|NOT_RUN|
|U027|寸法・余白|ui.tsx / AppShell.tsx|カード内16px|NOT_RUN|
|U028|寸法・余白|ui.tsx / AppShell.tsx|カード角16px|NOT_RUN|
|U029|寸法・余白|ui.tsx / AppShell.tsx|外側16px|NOT_RUN|
|U030|寸法・余白|ui.tsx / AppShell.tsx|カード間12–16px|NOT_RUN|
|U031|寸法・余白|ui.tsx / AppShell.tsx|行の高さ56px以上|NOT_RUN|
|U032|寸法・余白|ui.tsx / AppShell.tsx|操作領域44px以上|NOT_RUN|
|U033|寸法・余白|ui.tsx / AppShell.tsx|アイコン24px|NOT_RUN|
|U034|寸法・余白|ui.tsx / AppShell.tsx|入力高さ44px以上|NOT_RUN|
|U035|寸法・余白|ui.tsx / AppShell.tsx|長文で高さ自動拡張|NOT_RUN|
|U036|寸法・余白|ui.tsx / AppShell.tsx|320pxで横スクロールなし|NOT_RUN|
|U037|日本語|TxSheet.tsx / AppShell.tsx|書きかけを下書きへ|NOT_RUN|
|U038|日本語|TxSheet.tsx / AppShell.tsx|控えるを保存へ|NOT_RUN|
|U039|日本語|TxSheet.tsx / AppShell.tsx|破損と読込不能を区別|NOT_RUN|
|U040|日本語|TxSheet.tsx / AppShell.tsx|固定費の支払登録を明示|NOT_RUN|
|U041|日本語|TxSheet.tsx / AppShell.tsx|残予算と残高を区別|NOT_RUN|
|U042|日本語|TxSheet.tsx / AppShell.tsx|自由に使える見込みに前提|NOT_RUN|
|U043|日本語|TxSheet.tsx / AppShell.tsx|返金と収入を区別|NOT_RUN|
|U044|日本語|TxSheet.tsx / AppShell.tsx|保存失敗を断定的に通知|NOT_RUN|
|U045|日本語|TxSheet.tsx / AppShell.tsx|削除の対象を明示|NOT_RUN|
|U046|日本語|TxSheet.tsx / AppShell.tsx|専門語は必要時に説明|NOT_RUN|
|U047|ホーム|page.tsx|残予算の優先|NOT_RUN|
|U048|ホーム|page.tsx|未設定時は実績|NOT_RUN|
|U049|ホーム|page.tsx|今日の支出を分離|NOT_RUN|
|U050|ホーム|page.tsx|長い金額を折返す|NOT_RUN|
|U051|ホーム|page.tsx|予算超過を明示|NOT_RUN|
|U052|ホーム|page.tsx|予定の件数と詳細|NOT_RUN|
|U053|ホーム|page.tsx|期限超過の明示|NOT_RUN|
|U054|ホーム|page.tsx|提案最大3件|NOT_RUN|
|U055|ホーム|page.tsx|広告なし|NOT_RUN|
|U056|ホーム|page.tsx|編集取消で元に戻る|NOT_RUN|
|U057|カレンダー|calendar/page.tsx|日付14px以上|NOT_RUN|
|U058|カレンダー|calendar/page.tsx|セル補足12px|NOT_RUN|
|U059|カレンダー|calendar/page.tsx|曜日12px|NOT_RUN|
|U060|カレンダー|calendar/page.tsx|未来日を斜体以外でも区別|NOT_RUN|
|U061|カレンダー|calendar/page.tsx|予定省略件数|NOT_RUN|
|U062|カレンダー|calendar/page.tsx|日別全件表示|NOT_RUN|
|U063|カレンダー|calendar/page.tsx|金額省略時に詳細で全額|NOT_RUN|
|U064|カレンダー|calendar/page.tsx|320pxで日別一覧代替|NOT_RUN|
|U065|カレンダー|calendar/page.tsx|凡例の折返し|NOT_RUN|
|U066|カレンダー|calendar/page.tsx|選択日と今日を区別|NOT_RUN|
|U067|入力・一覧|TxSheet.tsx / Rows.tsx / Sheet.tsx|金額入力優先|NOT_RUN|
|U068|入力・一覧|TxSheet.tsx / Rows.tsx / Sheet.tsx|下書き失敗時に入力保持|NOT_RUN|
|U069|入力・一覧|TxSheet.tsx / Rows.tsx / Sheet.tsx|重複確認維持|NOT_RUN|
|U070|入力・一覧|TxSheet.tsx / Rows.tsx / Sheet.tsx|長い店名を折返す|NOT_RUN|
|U071|入力・一覧|TxSheet.tsx / Rows.tsx / Sheet.tsx|長い予定名を折返す|NOT_RUN|
|U072|入力・一覧|TxSheet.tsx / Rows.tsx / Sheet.tsx|長い金額を欠落させない|NOT_RUN|
|U073|入力・一覧|TxSheet.tsx / Rows.tsx / Sheet.tsx|保存ボタンをキーボードで隠さない|NOT_RUN|
|U074|入力・一覧|TxSheet.tsx / Rows.tsx / Sheet.tsx|取消と削除を分離|NOT_RUN|
|U075|入力・一覧|TxSheet.tsx / Rows.tsx / Sheet.tsx|連続登録の結果明示|NOT_RUN|
|U076|入力・一覧|TxSheet.tsx / Rows.tsx / Sheet.tsx|完了済み文字のコントラスト|NOT_RUN|
|U077|グラフ・家計|ForecastCard.tsx / PeriodReport.tsx / TrendChart.tsx|実績と予測を線種で区別|NOT_RUN|
|U078|グラフ・家計|ForecastCard.tsx / PeriodReport.tsx / TrendChart.tsx|軸ラベル12px以上|NOT_RUN|
|U079|グラフ・家計|ForecastCard.tsx / PeriodReport.tsx / TrendChart.tsx|凡例13px目標|NOT_RUN|
|U080|グラフ・家計|ForecastCard.tsx / PeriodReport.tsx / TrendChart.tsx|収入と支出に符号|NOT_RUN|
|U081|グラフ・家計|ForecastCard.tsx / PeriodReport.tsx / TrendChart.tsx|ゼロと未設定を区別|NOT_RUN|
|U082|グラフ・家計|ForecastCard.tsx / PeriodReport.tsx / TrendChart.tsx|予測不足理由|NOT_RUN|
|U083|グラフ・家計|ForecastCard.tsx / PeriodReport.tsx / TrendChart.tsx|予算超過の数値|NOT_RUN|
|U084|グラフ・家計|ForecastCard.tsx / PeriodReport.tsx / TrendChart.tsx|金額とグラフ一致|NOT_RUN|
|U085|グラフ・家計|ForecastCard.tsx / PeriodReport.tsx / TrendChart.tsx|長い桁の表表示|NOT_RUN|
|U086|グラフ・家計|ForecastCard.tsx / PeriodReport.tsx / TrendChart.tsx|読み上げ用数値一覧|NOT_RUN|
|U087|アクセシビリティ|globals.css / Sheet.tsx / AppShell.tsx|通常文字4.5対1|NOT_RUN|
|U088|アクセシビリティ|globals.css / Sheet.tsx / AppShell.tsx|UI境界3対1|NOT_RUN|
|U089|アクセシビリティ|globals.css / Sheet.tsx / AppShell.tsx|フォーカス視認性|NOT_RUN|
|U090|アクセシビリティ|globals.css / Sheet.tsx / AppShell.tsx|低減モーション|NOT_RUN|
|U091|アクセシビリティ|globals.css / Sheet.tsx / AppShell.tsx|VoiceOver操作|NOT_RUN|
|U092|アクセシビリティ|globals.css / Sheet.tsx / AppShell.tsx|フォーカス復帰|NOT_RUN|
|U093|アクセシビリティ|globals.css / Sheet.tsx / AppShell.tsx|モーダル背景操作不可|NOT_RUN|
|U094|アクセシビリティ|globals.css / Sheet.tsx / AppShell.tsx|色以外の状態表示|NOT_RUN|
|U095|アクセシビリティ|globals.css / Sheet.tsx / AppShell.tsx|横向き画面|NOT_RUN|
|U096|アクセシビリティ|globals.css / Sheet.tsx / AppShell.tsx|安全領域|NOT_RUN|
|U097|生活機能・収益|menu/page.tsx / UI_DESIGN.md|メニュー説明を折返す|NOT_RUN|
|U098|生活機能・収益|menu/page.tsx / UI_DESIGN.md|準備中と利用可能を区別|NOT_RUN|
|U099|生活機能・収益|menu/page.tsx / UI_DESIGN.md|目的と期限を先頭|NOT_RUN|
|U100|生活機能・収益|menu/page.tsx / UI_DESIGN.md|進捗の意味を明示|NOT_RUN|
|U101|生活機能・収益|menu/page.tsx / UI_DESIGN.md|次の行動を明示|NOT_RUN|
|U102|生活機能・収益|menu/page.tsx / UI_DESIGN.md|予算と実績を分離|NOT_RUN|
|U103|生活機能・収益|menu/page.tsx / UI_DESIGN.md|PRをリンク隣接|NOT_RUN|
|U104|生活機能・収益|menu/page.tsx / UI_DESIGN.md|無料選択肢|NOT_RUN|
|U105|生活機能・収益|menu/page.tsx / UI_DESIGN.md|広告OFFでも同じ機能|NOT_RUN|
|U106|生活機能・収益|menu/page.tsx / UI_DESIGN.md|外部遷移の明示|NOT_RUN|
|U107|全体反証|UI_DESIGN.md / ARCHITECTURE_O9.md|公開版と自分用の導線|NOT_RUN|
|U108|全体反証|UI_DESIGN.md / ARCHITECTURE_O9.md|WebとiPhoneの差|NOT_RUN|
|U109|全体反証|UI_DESIGN.md / ARCHITECTURE_O9.md|オフライン|NOT_RUN|
|U110|全体反証|UI_DESIGN.md / ARCHITECTURE_O9.md|容量不足|NOT_RUN|
|U111|全体反証|UI_DESIGN.md / ARCHITECTURE_O9.md|データ移行前後|NOT_RUN|
|U112|全体反証|UI_DESIGN.md / ARCHITECTURE_O9.md|30年データ|NOT_RUN|
|U113|全体反証|UI_DESIGN.md / ARCHITECTURE_O9.md|320/375/390/430/768/1280px|NOT_RUN|
|U114|全体反証|UI_DESIGN.md / ARCHITECTURE_O9.md|初回操作成功率90%目標|NOT_RUN|
|U115|全体反証|UI_DESIGN.md / ARCHITECTURE_O9.md|支出30秒以内目標|NOT_RUN|
|U116|全体反証|UI_DESIGN.md / ARCHITECTURE_O9.md|重大誤操作ゼロ|NOT_RUN|

## 実ソース確認と変更
o9のTSXに明示された9–11px指定は43箇所（9px 1、10px 8、11px 34）。12px 134、13px 156。文字指定の出現数であり実際の画面要素数ではない。共通部品、ホーム、カレンダー、一覧、入力の一部を変更。カレンダーの7列で12pxが収まるか実機で確認し、収まらなければ日別一覧・件数表示へ切替。残存する小文字は個別対応。
## 実装順
A01–A10を優先し、共通UI変更を新基盤に移植。全画面のスクリーンショット、文字拡大、実機、両版ビルド、WBS同期を実施。公開・外部通信・費用は別承認。日本語変更は意味を変えず、計算仕様変更後に再確認。
