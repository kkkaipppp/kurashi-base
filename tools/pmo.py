"""PMO台帳の機械検査（Python 3.10+ 標準ライブラリのみ・OS非依存）。

使い方（子PJのルートで実行。Windowsは `py -3`、Mac/Linuxは `python3`）:
  python3 tools/pmo.py progress docs/00_PM_PMO/wbs.csv
  python3 tools/pmo.py check docs/00_PM_PMO/wbs.csv --today 2026-11-21 [--approvals docs/00_PM_PMO/approvals.csv]
  python3 tools/pmo.py gate docs/00_PM_PMO/kickoff_gate.csv --target G2 [--requirements docs/02_要求/functional_requests.csv]

原則: 重み未設定なら進捗は UNKNOWN(null)。証拠のない DONE は完了に数えない。
推測で値を補わない。終了コード 0=問題なし / 1=指摘あり / 2=入力不正。

既存PJの台帳は書き換えずに読む（2026-11-25）:
- 英語見出しの既存WBS（ID, Milestone, Priority, Task, DependsOn, Acceptance, Owner, Status, Evidence,
  Notes, Start, End など）も別名で読む。`End` は「仮の予定」として planned_end に入れ、期限(due)にはしない
  （過ぎていても OVERDUE ではなく INFO の PAST_PLANNED_END）。
- 状態の読み替えは STATUS_MAP の明示分だけ（元の値は status_raw に残す）。それ以外の未知の状態は入力不正。
G2 判定（2026-11-25）: 要求台帳が無い・空・priority/status 列が無い・MUST が0件・MUST が確定していない
（CONFIRMED 以外の状態）のいずれかなら REJECT。未確認のまま PASS にしない。
"""
from __future__ import annotations
import argparse, csv, json, sys
from datetime import date
from pathlib import Path

STATUSES = {'TODO', 'DOING', 'BLOCKED', 'REVIEW', 'DONE', 'OPEN', 'CANCELLED'}
# 既存台帳の状態語 → 本ツールの状態（明示したものだけ。推測で増やさない）
STATUS_MAP = {'NOT_STARTED': 'TODO', 'IN_PROGRESS': 'DOING'}
# 日本語見出し・英語見出しの既存台帳も読めるよう別名を許可する（先に書いたものを優先）
ALIASES = {
    'id': ('id', 'ID'), 'parent': ('parent', 'MS', '親ID', 'Milestone'),
    'task': ('deliverable', 'タスク', '成果物', 'Task', 'task'),
    'owner': ('owner', '担当', 'Owner'), 'depends': ('depends', '依存', 'DependsOn', 'depends_on'),
    'criteria': ('done_criteria', '完了条件', 'Acceptance', 'acceptance'),
    'due': ('due', '目標期日', '期限'), 'weight': ('weight', '重み', 'Weight'),
    'status': ('status', '状態', 'Status'), 'evidence': ('evidence', '証拠', 'Evidence'),
    'notes': ('notes', 'Notes', '備考', 'メモ'), 'planned_end': ('planned_end', 'End', '終了予定'),
}
EMPTY = {'', '未設定', '-', '—', 'NONE', 'none'}
# 要求台帳（G2 判定用）
REQ_ALIASES = {'id': ('id', 'ID', '要求ID'), 'priority': ('priority', 'Priority', '優先度'), 'status': ('status', 'Status', '状態')}
CONFIRMED = {'APPROVED', 'ACCEPTED', 'CONFIRMED', 'DONE', '確定', '承認済み'}


def read_csv(path: Path) -> list[dict]:
    with path.open(encoding='utf-8-sig', newline='') as f:
        return list(csv.DictReader(f))


def norm(row: dict) -> dict:
    out = {}
    for key, names in ALIASES.items():
        out[key] = next((str(row[n]).strip() for n in names if n in row and row[n] is not None), '')
    return out


def wbs(path: Path) -> list[dict]:
    rows = [norm(r) for r in read_csv(path)]
    ids = [r['id'] for r in rows]
    if any(not i for i in ids) or len(ids) != len(set(ids)):
        raise ValueError('WBS: IDが空または重複')
    for r in rows:
        raw = r['status']
        st = STATUS_MAP.get(raw.upper(), raw.upper())
        if st not in STATUSES:
            raise ValueError(f"WBS: 不正な状態 {r['id']}={raw}")
        r['status_raw'] = raw
        r['status'] = st
        r['deps'] = [d.strip() for d in r['depends'].replace(';', ',').split(',') if d.strip()]
    return rows


def has_evidence(r: dict) -> bool:
    return r['evidence'] not in EMPTY


def progress(rows: list[dict]) -> dict:
    """承認済み重みのうち、証拠付きDONEの割合。重みが1件でも未設定ならUNKNOWN。"""
    live = [r for r in rows if r['status'] != 'CANCELLED']
    weights = []
    for r in live:
        try:
            w = float(r['weight'])
        except ValueError:
            return {'progress_pct': None, 'reason': f"重み未設定: {r['id']}", 'basis': 'UNKNOWN'}
        if w < 0:
            raise ValueError('重みが負')
        weights.append(w)
    total = sum(weights)
    if total <= 0:
        return {'progress_pct': None, 'reason': '総重み0', 'basis': 'UNKNOWN'}
    done = sum(w for r, w in zip(live, weights) if r['status'] == 'DONE' and has_evidence(r))
    return {'progress_pct': int(done * 100 // total), 'reason': None, 'basis': 'weighted DONE with evidence / total weight'}


def parse_due(s: str):
    try:
        return date.fromisoformat(s)
    except ValueError:
        return None


def check(rows: list[dict], today: date, approvals: list[dict] | None = None) -> list[dict]:
    by = {r['id']: r for r in rows}
    f = []
    for r in rows:
        if r['status'] == 'DONE' and not has_evidence(r):
            f.append({'id': r['id'], 'code': 'DONE_WITHOUT_EVIDENCE', 'severity': 'HIGH'})
        for d in r['deps']:
            if d not in by:
                f.append({'id': r['id'], 'code': 'UNKNOWN_DEPENDENCY', 'detail': d, 'severity': 'HIGH'})
            elif r['status'] in ('DOING', 'REVIEW', 'DONE') and by[d]['status'] != 'DONE':
                f.append({'id': r['id'], 'code': 'STARTED_BEFORE_DEPENDENCY', 'detail': d, 'severity': 'MEDIUM'})
        due = parse_due(r['due'])
        if due and due < today and r['status'] not in ('DONE', 'CANCELLED'):
            f.append({'id': r['id'], 'code': 'OVERDUE', 'detail': r['due'], 'severity': 'HIGH'})
        if r['due'] and r['due'] not in EMPTY and due is None:
            f.append({'id': r['id'], 'code': 'BAD_DUE_DATE', 'detail': r['due'], 'severity': 'LOW'})
        pend = parse_due(r['planned_end'])
        if pend and pend < today and r['status'] not in ('DONE', 'CANCELLED'):
            f.append({'id': r['id'], 'code': 'PAST_PLANNED_END', 'detail': r['planned_end'], 'severity': 'INFO'})
        if r['status'] == 'BLOCKED' and not (r['notes'] or r['evidence']):
            f.append({'id': r['id'], 'code': 'BLOCKED_WITHOUT_REASON', 'severity': 'MEDIUM'})
    # 循環依存
    state: dict[str, int] = {}
    def visit(n: str, stack: list[str]):
        state[n] = 1
        for d in by[n]['deps']:
            if d not in by:
                continue
            if state.get(d) == 1:
                f.append({'id': n, 'code': 'DEPENDENCY_CYCLE', 'detail': '→'.join(stack + [d]), 'severity': 'HIGH'})
            elif not state.get(d):
                visit(d, stack + [d])
        state[n] = 2
    for n in by:
        if not state.get(n):
            visit(n, [n])
    for a in approvals or []:
        st = (a.get('status') or a.get('状態') or '').strip().upper()
        if st in ('PENDING', '未承認', '承認待ち', 'OPEN', '未決', '未確認'):
            f.append({'id': a.get('id') or a.get('ID') or '?', 'code': 'APPROVAL_PENDING', 'severity': 'INFO'})
    return f


GATES = {'G0': [f'K{i:02}' for i in range(1, 5)], 'G1': [f'K{i:02}' for i in range(1, 9)], 'G2': [f'K{i:02}' for i in range(1, 13)]}


def gate(kickoff: list[dict], target: str, requirements: list[dict] | None = None) -> dict:
    """K01–K12の状態からG0/G1/G2の通過可否を判定。重大未決・MUST未解決があればREJECT。"""
    if target not in GATES:
        raise ValueError('target must be G0/G1/G2')
    k = {r['id'].strip(): r for r in kickoff}
    reasons = []
    for kid in GATES[target]:
        r = k.get(kid)
        if r is None:
            reasons.append(f'{kid}: 記録なし')
            continue
        st = r.get('status', '').strip().upper()
        if st == 'NA':
            if not r.get('rationale', '').strip():
                reasons.append(f'{kid}: N/Aの理由なし')
        elif st != 'DONE':
            reasons.append(f'{kid}: {st or "未記入"}')
        elif not r.get('evidence', '').strip():
            reasons.append(f'{kid}: DONEだが証拠なし')
        try:
            crit = int(r.get('critical_open', '0') or 0)
        except ValueError:
            crit = 1
        if crit > 0:
            reasons.append(f'{kid}: 重大未決{crit}件')
    if target == 'G2':
        reasons += requirement_reasons(requirements)
    return {'gate': target, 'result': 'PASS' if not reasons else 'REJECT', 'reasons': reasons}


def requirement_reasons(requirements: list[dict] | None) -> list[str]:
    """G2 で必須の要求台帳を検査する。確認できないものは理由として返す（PASS にしない）。"""
    if requirements is None:
        return ['要求台帳が未指定（MUST要求を確認できない）']
    if not requirements:
        return ['要求台帳が空（MUST要求を確認できない）']
    def get(row, key):
        return next((str(row[n]).strip() for n in REQ_ALIASES[key] if n in row and row[n] is not None), None)
    out = []
    if any(get(q, 'priority') is None or get(q, 'status') is None for q in requirements):
        return ['要求台帳に priority/status 列がない（MUST要求を確認できない）']
    must = [q for q in requirements if get(q, 'priority').upper() == 'MUST']
    if not must:
        return ['MUST要求が0件（MUSTが無いことの確認記録が必要）']
    for q in must:
        st = get(q, 'status')
        if st.upper() not in CONFIRMED and st not in CONFIRMED:
            out.append(f"{get(q, 'id') or '?'}: MUST要求が未確定（状態={st or '空'}）")
    return out


def main(argv=None) -> int:
    a = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = a.add_subparsers(dest='cmd', required=True)
    p = sub.add_parser('progress'); p.add_argument('wbs', type=Path)
    c = sub.add_parser('check'); c.add_argument('wbs', type=Path); c.add_argument('--today', required=True); c.add_argument('--approvals', type=Path)
    g = sub.add_parser('gate'); g.add_argument('kickoff', type=Path); g.add_argument('--target', required=True); g.add_argument('--requirements', type=Path)
    x = a.parse_args(argv)
    sys.stdout.reconfigure(encoding='utf-8')
    try:
        if x.cmd == 'progress':
            out = progress(wbs(x.wbs)); code = 0
        elif x.cmd == 'check':
            out = check(wbs(x.wbs), date.fromisoformat(x.today), read_csv(x.approvals) if x.approvals else None)
            code = 1 if any(i['severity'] != 'INFO' for i in out) else 0
        else:
            out = gate(read_csv(x.kickoff), x.target, read_csv(x.requirements) if x.requirements else None)
            code = 0 if out['result'] == 'PASS' else 1
    except (ValueError, KeyError, OSError) as e:
        print(json.dumps({'error': str(e)}, ensure_ascii=False)); return 2
    print(json.dumps(out, ensure_ascii=False, indent=2)); return code


if __name__ == '__main__':
    raise SystemExit(main())
