# 共有の仕組みの候補の比較（日程調整・出欠・アンケートの回答リンク）

- 作った日：2026-11-27（平尾さんの答え Q-T02 ①：比べる資料だけ。決定 D-T14）
- 調べ方：各社の公開ページを読んだだけ。**どのサービスにも登録・送信・申込みをしていない**。アプリから外へ送る処理も作っていない
- 【事実】＝公式ページで確かめたこと、【推測】＝確かめていない・判断を含むこと
- 料金や無料枠は変わる。選ぶ前に、もう一度公式ページで確かめる

## 前提（To-Be 03・04 から）
- 回答者はアカウント無しのゲスト（リンクで回答）。友達数人〜数十人のβ
- 外に置くのは最小限：計画の名前・候補日・回答者の表示名・○△×。家計・予定の本体は端末の中のまま
- 費用の上限で止まること、東京に置けること、消すのが簡単なことを重く見る

## 比べた表【事実】
| | Supabase（Free） | Firebase Firestore（Spark） | Cloudflare Workers + D1 | Neon（Vercel Marketplace） | PocketBase 自前 |
|---|---|---|---|---|---|
| 無料枠 | DB 500MB・転送 5GB/月・有効なプロジェクト2つまで・使わないと一時停止 | 容量 1GiB・読み 5万/日・書き 2万/日・転送 10GiB/月 | D1 読み 500万行/日・書き 10万行/日・5GB。Workers 10万リクエスト/日 | 1GB・100 CU時間/月・転送 5GB/月。使わないと休止し、次の問い合わせで再開 | ソフトは無料。サーバー代は別 |
| 超えたとき | 無料版は請求されない（容量超過は制限） | その月の残りは止まる。上の有料版の予算アラートは通知だけで止まらない | 翌日のリセットまでエラー | 休止・書き込み停止。データは消えない | サーバー次第 |
| 東京 | 選べる（後から変えられない） | 選べる（後から変えられない） | 固定できない（地域の希望だけ） | 無い（最寄りはシンガポール） | サーバーの場所次第 |
| ゲストの書き込みの守り | 行ごとの権限（RLS）＋公開してよい鍵・匿名ログイン・Turnstile 等 | セキュリティルール＋App Check | Turnstile（無料）・自分で書く API | 自分の API で守る | 自分でルールを書く |
| 取り出し・消す | 停止後も一定期間は戻せる・バックアップを取り出せる | 未確認 | SQL に書き出せる | データは消さないと明記 | 書き出しの補助なし |

出典（2026-11-27 に読んだページ）：
- Supabase：https://supabase.com/pricing ・ https://supabase.com/docs/guides/platform/cost-control ・ https://supabase.com/docs/guides/platform/regions ・ https://supabase.com/docs/guides/api/api-keys ・ https://supabase.com/docs/guides/auth/auth-anonymous
- Firebase：https://firebase.google.com/pricing ・ https://firebase.google.com/docs/projects/billing/avoid-surprise-bills ・ https://firebase.google.com/docs/firestore/locations ・ https://firebase.google.com/docs/app-check
- Cloudflare：https://developers.cloudflare.com/d1/platform/pricing/ ・ https://developers.cloudflare.com/d1/configuration/data-location/ ・ https://developers.cloudflare.com/workers/platform/limits/ ・ https://developers.cloudflare.com/turnstile/plans/
- Vercel・Neon：https://vercel.com/docs/storage ・ https://vercel.com/docs/plans/hobby ・ https://neon.com/pricing ・ https://neon.com/docs/introduction/regions
- PocketBase：https://pocketbase.io/faq/
- 個人情報保護委員会 Q&A：https://www.ppc.go.jp/all_faq_index/faq1-q12-3

補足【事実】
- Vercel 自身の Postgres・KV は今は無く、Marketplace（Neon・Upstash・Supabase など）から入れる。Hobby の費用の上限の設定（Spend Management）は Pro だけ
- Supabase の公開してよい鍵（publishable key）は RLS の範囲しか触れない。秘密の鍵はサーバーの中だけで使う
- 外国のクラウドでも、事業者が個人データを扱わない契約なら「外国の第三者への提供」には当たらない。ただし安全の管理と、本人が国の名前などを知りうる状態にする義務は残る（個人情報保護委員会 Q&A）

## おすすめの順【推測：上の条件からの判断】
1. **Firebase Firestore（無料の Spark）**：東京に置ける・超えたら止まり自動では課金されない・使わない間の停止が無い。弱み：ルールを間違えると誰でも書ける状態になりやすい → ルールの試験を先に作る
2. **Supabase（Free）**：東京・RLS が分かりやすい・無料版は請求なし。弱み：しばらく使わないと一時停止し、回答リンクが開けなくなる（戻すのは持ち主の操作）
3. **Cloudflare Workers + D1**：無料枠が大きく止まるだけ。弱み：東京に固定できない・Vercel と別に配る手間
4. **Neon**：止まり方は安全。弱み：東京が無い・守りを自分で作る
5. **PocketBase 自前**：サーバーの運用とバックアップが友達向けβには重い

## 確かめられなかったこと
- Supabase 無料版が何日使わないと止まるか（ページによって食い違う）
- Firebase の書き出し・プロジェクトを消したあとのデータの扱い（書き出しに有料版が要るかもしれない）
- Cloudflare のレート制限の仕組みが無料版で使えるか
- 各社の規約の非商用の条件（規約の本文は読んでいない）

## 作る前に平尾さんに決めてもらうこと（どれも承認が要る）
1. 使うサービス（上の1つ）と、アカウントを作ること（作るのは平尾さん本人）
2. 費用の上限（無料版のままにする・有料に上げない）と、止まったときの扱い
3. 外に置く項目（上の「最小限」で良いか）・回答の保存期間・計画を消したら回答も消すか
4. 友達に見せる説明（どこに保存されるか・いつ消えるか）

決まるまでは、アプリに共有の画面を出さない（D-T02 のまま）。
