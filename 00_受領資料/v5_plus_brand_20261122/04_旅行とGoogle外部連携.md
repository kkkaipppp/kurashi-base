# 旅行の行程管理と、Googleマップ・Googleカレンダー・Web検索

## 旅行の基本構造（既存のデータモデルを尊重して追加）
旅行全体：タイトル、開始日/終了日、目的地、予算（任意）、メモ。
個別行程：日付、開始/終了時刻、種別（移動/宿泊/観光/飲食/その他）、場所、URL、メモ、持ち物、関連支出、交通手段。旅行に所属しない通常予定もそのまま扱える。

旅行詳細は日付別タイムライン。移動・宿泊・観光の順序を見て、該当行を押せば予定詳細へ。予約確認用のURL/番号をアプリ内で持たせる場合は外部サイトに勝手に送らない（個人情報）。旅行削除でも独立した取引は削除しない。

## 行動が意味通りになる3つのリンク
1. **「行き方を調べる」**：Googleマップの経路検索URL。例: `https://www.google.com/maps/dir/?api=1&destination=東京駅&travelmode=transit`。URLの目的地を必ずエンコード。
2. **「Googleカレンダーに追加」**：Googleカレンダーのイベント作成候補を開く。`https://calendar.google.com/calendar/render?action=TEMPLATE&text=...&dates=...&details=...&location=...&ctz=Asia/Tokyo`。Google側で保存操作が必要。直接同期や既存イベント編集はしない。「登録完了」「同期しました」は禁止。
3. **「Webで調べる」**：ユーザー入力語だけをエンコードして`https://www.google.com/search?q=...`を開く。検索内容をアプリが自動で調べて回答したと誤表示しない。外部へ出す前にユーザーが入力する。

日付は終日イベントならGoogle側の終了日が排他的（1日の予定＝開始日/翌日）。時刻付きはJST基準でエンコード。海外旅行の現地タイムゾーンは今後拡張とし、現段階のJST表示を誤認させない。

受入：URLを押す前に外部へ送信しない／目的地や検索語が日本語で正しく残る／空入力は検索しない／javascript:リンクを拒否／旅行タイムラインが当該日付へ表示／iPhone Safariで戻れる。

Google公式資料: https://developers.google.com/maps/documentation/urls/get-started 、https://support.google.com/calendar/answer/72143?hl=ja
