# くらしベース v5 友人β 最終不具合修正パック

基準：`beta/friend-v1` / `2cf3cb5`、現行のv5 ZIPから抽出したコードに基づく修正候補。

## 同梱内容
- `00_CLAUDE_CODE_そのまま送る.txt`：Claude Codeへの実行指示
- `kurashi_v5_friend_beta_fix.patch`：元ソースとの差分（新規テスト含む）
- `overlay/app/src/...`：修正したファイルを個別参照できる構成。直接上書き禁止、差分確認の上取り込むこと。
- `docs/01_改善指示と安全基準.md`：原因・修正内容・禁止事項
- `docs/02_受入試験とGO判断.md`：GO/NO-GO判定条件
- `screenshots/preview_4screens_code_based.png`：現行コードに準拠した参考プレビュー（実機の画面ではない）
- `checks/PURE_LOGIC_VERIFICATION.txt`：こちらで実行できた範囲の検証結果

## 現在の検証状況
- TypeScriptの純粋なロジックファイル4つ：strictモードでコンパイル成功。
- Node実行の主要ロジック簡易チェック7区分：PASS。
- Next.jsの型チェック、lint、Vitest、ビルド、iPhone実機：こちらの環境では未実施。Claude側で必ず実施すること。
- 理由：npm依存パッケージをこの環境では取得できず、Next.js開発サーバーは起動できなかった。

## 期待する結果
友人1人・7日間のβ試用に必要な安定性。すべての自動チェック成功＋Safariでの保存・復元・取り消し・予定編集の実機確認が完了してからGO判断。
