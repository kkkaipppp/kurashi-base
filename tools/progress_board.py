"""WBS.csv・ROADMAP.md・ISSUES.csv から、ガントチャート／ロードマップ／論点一覧の1枚の HTML を作る。

  py -3 -I tools/progress_board.py        # docs/progress/PROGRESS.html を書き出す（progress.py sync からも呼ばれる）

未完了の作業の日付は「仮の予定」。完了した作業の日付は実績（CompletedAt）。
"""
from __future__ import annotations

import csv
import json
import re
import subprocess
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
PROG = ROOT / "docs" / "progress"
OUT = PROG / "PROGRESS.html"
TEMPLATE = Path(__file__).resolve().parent / "progress_board.html"
JST = timezone(timedelta(hours=9))

STATUS_JA = {"DONE": "完了", "IN_PROGRESS": "進行中", "NOT_STARTED": "未着手", "BLOCKED": "止まっている", "NOT_RUN": "未確認"}
TASK_KEYS = ("ID", "Milestone", "Priority", "Task", "DependsOn", "Acceptance", "Owner", "Status", "Evidence", "Start", "End", "Notes")


def _csv(p: Path) -> list[dict]:
    with p.open(encoding="utf-8-sig", newline="") as f:
        return list(csv.DictReader(f))


def _milestones() -> list[dict]:
    """ROADMAP.md の最初のマイルストン表（| M0 | ステージ | 到達条件 | 状態 | GO条件 |）を読む"""
    out: list[dict] = []
    for line in (PROG / "ROADMAP.md").read_text(encoding="utf-8").splitlines():
        c = [x.strip() for x in line.strip().strip("|").split("|")]
        if len(c) >= 5 and re.fullmatch(r"M\d", c[0]) and not any(m["id"] == c[0] for m in out):
            out.append({"id": c[0], "name": c[1], "goal": c[2], "go": c[-1]})
    return out


def build(sha: str = "") -> Path:
    issues_csv = PROG / "ISSUES.csv"
    now = datetime.now(JST)
    data = {
        "updated": now.strftime("%Y-%m-%d %H:%M"),
        "sha": sha,
        "today": now.date().isoformat(),
        "statusJa": STATUS_JA,
        "milestones": _milestones(),
        "tasks": [{k: t.get(k, "") for k in TASK_KEYS} for t in _csv(PROG / "WBS.csv")],
        "issues": _csv(issues_csv) if issues_csv.exists() else [],
    }
    payload = json.dumps(data, ensure_ascii=False).replace("</", "<\\/")
    OUT.write_text(TEMPLATE.read_text(encoding="utf-8").replace("__DATA__", payload), encoding="utf-8")
    return OUT


if __name__ == "__main__":
    sys.stdout.reconfigure(encoding="utf-8")
    sha = subprocess.run(["git", "rev-parse", "--short", "HEAD"], cwd=ROOT, capture_output=True, text=True).stdout.strip()
    print(build(sha))
