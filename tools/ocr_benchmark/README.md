# OCRテストの実行

最初に各データセットの利用条件を確認。現行v4はOCR未実装なので、取得できても精度は測れない。継続的に改善するには実OCRとの接続と正解ラベルが必須。

```bash
python -m pip install -r ocr_benchmark/requirements.txt
python ocr_benchmark/acquire.py --target .ocr-eval-data --licenses-reviewed
python ocr_benchmark/validate_manifest.py --target .ocr-eval-data
python -m unittest discover -s ocr_benchmark -p 'test_*.py'
# OCRエンジンを実装し、実際のOCRアダプタを用意したら：
python ocr_benchmark/run_benchmark.py --target .ocr-eval-data --adapter YOUR_OCR_ADAPTER.py --report .ocr-eval-data/report.json
```

`.gitignore`に`.ocr-eval-data/`を追加。画像をGitHubへコミットしない。レシートに個人情報が含まれる場合は適切に匿名化。商用利用の条件を再確認。

**run_benchmark.pyは処理の成功/失敗と所要時間を記録するが、認識精度%はわざと報告しない。** OCRと各項目の正解値の対応付けを実装・レビューしてから精度メトリクスを出す。後に日本語の許諾済みGTセットも追加する。
