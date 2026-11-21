"""portfolio/report.json を報告契約v1でローカル検証する（送信はしない）。

  python3 tools/report_check.py portfolio/report.json

経営管理側と同じ規則を子PJ内に固定版として持つ。親・経営管理が停止していても使える。
未計測は null、実測0のみ 0。秘密らしき文字列や個人情報らしき値を拒否する。
"""
from __future__ import annotations
import json, re, sys
from datetime import datetime
from pathlib import Path

FIELDS = {'project_id', 'mode', 'as_of', 'phase', 'progress_pct', 'quality', 'revenue_yen', 'cost_yen',
          'period', 'blockers', 'approvals', 'next_action', 'evidence_ref'}
SECRET = re.compile(r'(sk-[A-Za-z0-9]{8,}|ghp_[A-Za-z0-9]{8,}|eyJ[A-Za-z0-9_-]{10,}\.|password\s*[:=]|BEGIN [A-Z ]*PRIVATE KEY|[\w.+-]+@[\w-]+\.[\w.]+|https?://)', re.I)


def validate(r: dict) -> list[str]:
    e = []
    if not isinstance(r, dict) or set(r) != FIELDS:
        return ['項目が契約v1と不一致: ' + ','.join(sorted(set(r) ^ FIELDS)) if isinstance(r, dict) else 'objectではない']
    if r['mode'] not in ('production', 'demo'): e.append('mode不正')
    try:
        if datetime.fromisoformat(r['as_of']).tzinfo is None: e.append('as_ofに時差なし')
    except (TypeError, ValueError):
        e.append('as_of不正')
    if r['quality'] not in ('UNKNOWN', 'NO_GO', 'GO_CANDIDATE'): e.append('quality不正')
    if not isinstance(r['period'], str) or not re.fullmatch(r'\d{4}-(0[1-9]|1[0-2])', r['period']): e.append('period不正')
    for k in ('progress_pct', 'revenue_yen', 'cost_yen', 'blockers', 'approvals'):
        v = r[k]
        if v is not None and (type(v) is not int or v < 0 or (k == 'progress_pct' and v > 100)): e.append(f'{k}不正')
    for k in ('project_id', 'phase', 'next_action', 'evidence_ref'):
        v = r[k]
        if not isinstance(v, str) or not 0 < len(v) <= 300 or any(ord(c) < 32 for c in v): e.append(f'{k}不正')
        elif SECRET.search(v): e.append(f'{k}に秘密・個人情報・URLらしき値')
    return e


if __name__ == '__main__':
    sys.stdout.reconfigure(encoding='utf-8')
    p = Path(sys.argv[1] if len(sys.argv) > 1 else 'portfolio/report.json')
    try:
        errs = validate(json.loads(p.read_text(encoding='utf-8')))
    except (OSError, ValueError) as x:
        errs = [f'読込不可: {x}']
    print(json.dumps({'file': p.as_posix(), 'valid': not errs, 'errors': errs}, ensure_ascii=False, indent=2))
    raise SystemExit(0 if not errs else 1)
