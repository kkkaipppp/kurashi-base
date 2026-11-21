"""暮らしベースの WBS / ロードマップ / STATUS を管理し、親フォルダへ同期する。

  py -3 -I tools/progress.py init                      # docs/ux-autonomous/10_PARENT_WBS.csv から docs/progress/WBS.csv を作る（既にあれば何もしない）
  py -3 -I tools/progress.py set W004 DONE "根拠" [SHA]   # 状態を更新（DONE は根拠必須）
  py -3 -I tools/progress.py sync                      # ROADMAP/WBS/STATUS を docs/progress と親フォルダ 00_全体進捗/暮らしベース/ に書き出す

状態は NOT_STARTED / IN_PROGRESS / DONE / BLOCKED / NOT_RUN の5種のみ。
"""
from __future__ import annotations

import csv
import shutil
import subprocess
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "docs" / "ux-autonomous" / "10_PARENT_WBS.csv"
PROG = ROOT / "docs" / "progress"
WBS = PROG / "WBS.csv"
STATUS = PROG / "STATUS.md"
ROADMAP = PROG / "ROADMAP.md"
PARENT = ROOT.parent / "00_全体進捗" / "暮らしベース"
EXPORT = ROOT / "docs" / "parent_progress_export"
STATES = {"NOT_STARTED", "IN_PROGRESS", "DONE", "BLOCKED", "NOT_RUN"}
JST = timezone(timedelta(hours=9))


def now() -> str:
    return datetime.now(JST).strftime("%Y-%m-%d %H:%M")


def read() -> tuple[list[str], list[dict]]:
    with WBS.open(encoding="utf-8-sig", newline="") as f:
        r = csv.DictReader(f)
        return list(r.fieldnames or []), list(r)


def write(fields: list[str], rows: list[dict]) -> None:
    with WBS.open("w", encoding="utf-8-sig", newline="") as f:
        w = csv.DictWriter(f, fieldnames=fields)
        w.writeheader()
        w.writerows(rows)


def cmd_init() -> None:
    PROG.mkdir(parents=True, exist_ok=True)
    if not WBS.exists():
        shutil.copyfile(SRC, WBS)
    if not ROADMAP.exists():
        shutil.copyfile(ROOT / "docs" / "ux-autonomous" / "09_RELEASE_ROADMAP.md", ROADMAP)


def cmd_set(wid: str, state: str, evidence: str = "", sha: str = "") -> None:
    if state not in STATES:
        raise SystemExit(f"状態は {sorted(STATES)} のどれか")
    if state == "DONE" and not evidence:
        raise SystemExit("DONE には根拠（テスト名・ログ・画面確認など）が必要")
    fields, rows = read()
    hit = [r for r in rows if r["ID"] == wid]
    if not hit:
        raise SystemExit(f"{wid} がない")
    r = hit[0]
    r["Status"] = state
    if evidence:
        r["Evidence"] = evidence + (f" ({sha})" if sha else "")
    r["CompletedAt"] = now() if state == "DONE" else ""
    write(fields, rows)
    print(wid, state)


def git_sha() -> str:
    try:
        return subprocess.run(["git", "rev-parse", "--short", "HEAD"], cwd=ROOT, capture_output=True, text=True).stdout.strip()
    except OSError:
        return "不明"


def cmd_sync(extra: dict[str, str]) -> None:
    fields, rows = read()
    done = sum(r["Status"] == "DONE" for r in rows)
    p0_open = sum(r["Priority"] == "P0" and r["Status"] != "DONE" for r in rows)
    lines = [
        "# 暮らしベース 進捗 / STATUS",
        f"- 最終更新：{now()} JST",
        f"- 対象Git commit：{git_sha()}",
        f"- 現在のマイルストン：{extra.get('milestone', '未入力')}",
        f"- リリース判定：{extra.get('gate', 'NO-GO（評価未完）')}",
        f"- 実装完了WBS件数：{done} / {len(rows)}",
        f"- P0未完了件数（WBS上）：{p0_open}",
        f"- チェック：`cd app && npm run check`：{extra.get('check', 'NOT_RUN')}",
        f"- 画面確認（アプリ内ブラウザ）：{extra.get('screen', 'NOT_RUN')}",
        "- iPhone Safari：" + extra.get("iphone", "NOT_RUN"),
        f"- データ復元/保存テスト：{extra.get('data', 'NOT_RUN')}",
        f"- 今日完了したこと：{extra.get('done', '未入力')}",
        f"- 次の最優先タスク：{extra.get('next', '未入力')}",
        f"- ブロッカー：{extra.get('blocker', 'なし')}",
        "- リポジトリ内の報告：docs/UX_AUTONOMOUS_REPORT.md",
        "",
        "**注記：テスト未実施の項目を PASS や GO にしない。DONE は根拠のある項目だけ。**",
    ]
    STATUS.write_text("\n".join(lines) + "\n", encoding="utf-8")
    for dest in (PARENT, EXPORT):
        try:
            dest.mkdir(parents=True, exist_ok=True)
            shutil.copyfile(WBS, dest / "WBS.csv")
            shutil.copyfile(ROADMAP, dest / "ROADMAP.md")
            shutil.copyfile(STATUS, dest / "STATUS.md")
            print("synced ->", dest)
        except OSError as e:
            print("sync failed:", dest, e)


if __name__ == "__main__":
    sys.stdout.reconfigure(encoding="utf-8")
    a = sys.argv[1:]
    if not a:
        raise SystemExit(__doc__)
    if a[0] == "init":
        cmd_init()
    elif a[0] == "set":
        cmd_set(*a[1:])
    elif a[0] == "sync":
        cmd_sync(dict(x.split("=", 1) for x in a[1:]))
