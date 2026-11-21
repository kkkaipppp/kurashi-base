# 暮らしベース Phase 1 → 機能の箱拡張パック

対象: `kurashi-base_phase1_6f5f075.zip` に収録されたアプリ。現行実装は `app/` に存在。
目的: 現行の機能を壊さず、将来の生活統合アプリとして必要な**機能入口・空状態・操作導線・状態表示**を増やす。

## 明示的な非対象
- DB方式、スキーマ、API、同期方式、配色、余白、コンポーネント配置、ナビゲーション形式、フォントの指定
- 全領域の本格実装、OCR精度保証、iOS通知の無断取得、Webでのネイティブウィジェット実現を装うこと

## 読む順序
1. `01_GAP_ASSESSMENT.md`
2. `02_FEATURE_BOX_BACKLOG.md`
3. `03_ACCEPTANCE_AND_TESTS.md`
4. `04_IMPLEMENTATION_BOUNDARIES.md`
5. `05_CLAUDE_PROMPT.txt`

現行実装の正本はClaude側にある作業ツリー。添付ZIPは差分の指示書であり、コードを上書きするものではない。
