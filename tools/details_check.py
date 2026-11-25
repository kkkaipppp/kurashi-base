# 出所：../00_経営管理/scripts/details_check.py（本部。中身一覧 v1 の検査）を PJ に写したもの。2026-11-25。
# 元の SHA-256：f6f9f5360b611cc604c5de24f4734dc46f8e7ca3ae88cd2096ab91066ecab294
# 違い：import 先を PJ の tools/report_check.py に（本部のフォルダが無くても動かすため）。検査の中身は同じ
"""portfolio/details.json（中身一覧 v1・任意）の検査。仕様は contract/DETAILS_v1.md。

  py -3 -I tools/details_check.py <path/to/details.json>
"""
from __future__ import annotations
import json, sys
from datetime import datetime
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from report_check import SECRET  # noqa: E402  (report.json と同じ秘密・個人情報・URL基準)

FIELDS = {'project_id', 'as_of', 'blocker_items', 'approval_items'}
MAX_ITEMS, MAX_LEN = 20, 60


def validate(d) -> list[str]:
    if not isinstance(d, dict) or set(d) != FIELDS:
        return ['項目が中身一覧v1と不一致: ' + ','.join(sorted(set(d) ^ FIELDS)) if isinstance(d, dict) else 'objectではない']
    e = []
    if not isinstance(d['project_id'], str) or not d['project_id']:
        e.append('project_id不正')
    try:
        if datetime.fromisoformat(d['as_of']).tzinfo is None:
            e.append('as_ofに時差なし')
    except (TypeError, ValueError):
        e.append('as_of不正')
    for k in ('blocker_items', 'approval_items'):
        v = d[k]
        if not isinstance(v, list) or len(v) > MAX_ITEMS:
            e.append(f'{k}は{MAX_ITEMS}件以内の配列'); continue
        for i, s in enumerate(v):
            if not isinstance(s, str) or not 0 < len(s) <= MAX_LEN or any(ord(c) < 32 for c in s):
                e.append(f'{k}[{i}]は1〜{MAX_LEN}字の1行の文字列')
            elif SECRET.search(s):
                e.append(f'{k}[{i}]に秘密・個人情報・URLらしき値')
    return e


if __name__ == '__main__':
    sys.stdout.reconfigure(encoding='utf-8')
    errs = validate(json.loads(Path(sys.argv[1]).read_text(encoding='utf-8')))
    print('OK' if not errs else '\n'.join(errs))
    sys.exit(1 if errs else 0)
