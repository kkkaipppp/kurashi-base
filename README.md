# 暮らしベース

予定とお金を1か所で記録・確認する、スマホ向けの Web アプリ（友人β版）。

- **記録は端末のブラウザの中（localStorage）だけ**に保存します。サーバー・アカウント・外部への送信はありません
- 家計（支出・収入・予算・固定費）、予定、カレンダー、振り返り、バックアップと復元が中心。タスク・資格の勉強・目標などは登録・一覧・編集・削除まで

## 動かし方
```bash
cd app
npm ci
npm run dev        # http://localhost:3000
npm run check      # 型・lint・テスト・ビルドをまとめて実行
```

## フォルダ
| 場所 | 中身 |
|---|---|
| `app/` | アプリ本体（Next.js 16・TypeScript・Tailwind CSS v4・vitest） |
| `docs/RELEASE_PREP.md` | GitHub・Vercel での公開手順と、公開後に確かめること |
| `docs/BETA_RELEASE_REPORT.md` | 友人βの判定（GO / NO-GO）と残っている確認 |
| `docs/` | 設計・テスト・進捗の記録 |
| `00_受領資料/` | 最初に受け取った要件資料（変更しない） |

## 公開（Vercel）
Root Directory を `app` にするだけで動きます（環境変数なし）。手順は `docs/RELEASE_PREP.md`。
