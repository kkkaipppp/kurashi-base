"""暮らしベースの WBS / ロードマップ / STATUS を管理し、親フォルダへ同期する。

  py -3 -I tools/progress.py init                      # docs/ux-autonomous/10_PARENT_WBS.csv から docs/progress/WBS.csv を作る（既にあれば何もしない）
  py -3 -I tools/progress.py set W004 DONE "根拠" [SHA]   # 状態を更新（DONE は根拠必須）
  py -3 -I tools/progress.py sync                      # ROADMAP/WBS/STATUS/論点（ISSUES.csv）と、ガント・ロードマップ・論点一覧の画面（PROGRESS.html）を docs/progress と親フォルダ 00_全体進捗/暮らしベース/ に書き出す

状態は NOT_STARTED / IN_PROGRESS / DONE / BLOCKED / NOT_RUN の5種のみ。
"""
from __future__ import annotations

import csv
import json
import re
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


STATUS_JA = {"DONE": "完了", "IN_PROGRESS": "進行中", "NOT_STARTED": "未着手", "BLOCKED": "止まっている", "NOT_RUN": "未確認"}
ISSUES = PROG / "ISSUES.csv"
REPORT = ROOT / "portfolio" / "report.json"
DETAILS = ROOT / "portfolio" / "details.json"


def _board():
    """progress_board.py を読み込む（-I で起動するので、同じフォルダのファイルを直接読む）"""
    import importlib.util

    spec = importlib.util.spec_from_file_location("progress_board", Path(__file__).resolve().parent / "progress_board.py")
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def _issues() -> list[dict]:
    if not ISSUES.exists():
        return []
    with ISSUES.open(encoding="utf-8-sig", newline="") as f:
        return list(csv.DictReader(f))


def roadmap_summary(rows: list[dict], milestones: list[dict]) -> dict:
    """ロードマップの順に見て、今いるマイルストン・次の作業・ユーザーの判断待ちをまとめる（本部への報告の元）"""
    by_m = {m["id"]: [r for r in rows if r["Milestone"] == m["id"]] for m in milestones}
    cur = next((m for m in milestones if any(r["Status"] != "DONE" for r in by_m[m["id"]])), milestones[-1] if milestones else None)
    pri = {"P0": 0, "P1": 1, "P2": 2}
    open_rows = sorted((r for r in rows if r["Status"] != "DONE"), key=lambda r: (r.get("Start") or "9", pri.get(r["Priority"], 9), r["ID"]))
    issues = _issues()
    decide = [i for i in issues if i["状態"] == "未決" and "平尾" in i["決める人"] and re.fullmatch(r"\d{4}-\d{2}-\d{2}", i["期限"])]
    done = sum(r["Status"] == "DONE" for r in rows)
    cur_rows = by_m[cur["id"]] if cur else []
    return {
        "milestone": f"{cur['id']} {cur['name']}（{sum(r['Status'] == 'DONE' for r in cur_rows)}/{len(cur_rows)} 完了）" if cur else "なし",
        "done": done,
        "total": len(rows),
        "pct": round(done * 100 / len(rows)) if rows else None,
        "blocked": [r for r in rows if r["Status"] == "BLOCKED"],
        "next": open_rows[:3],
        "decide": sorted(decide, key=lambda i: (i["期限"], i["ID"])),
        "open_issues": sum(i["状態"] == "未決" for i in issues),
    }


def wbs_changes(rows: list[dict]) -> list[str]:
    """最後のコミットの WBS と比べて、状態・日付が変わった作業を返す（ユーザー・本部への報告用）"""
    try:
        old_txt = subprocess.run(["git", "show", "HEAD:docs/progress/WBS.csv"], cwd=ROOT, capture_output=True).stdout.decode("utf-8-sig")
    except OSError:
        return []
    old = {r["ID"]: r for r in csv.DictReader(old_txt.splitlines())} if old_txt else {}
    out = []
    for r in rows:
        o = old.get(r["ID"])
        if o is None:
            out.append(f"{r['ID']} 追加：{r['Task']}（{STATUS_JA.get(r['Status'], r['Status'])}）")
            continue
        if o.get("Status") != r["Status"]:
            out.append(f"{r['ID']} {r['Task']}：{STATUS_JA.get(o.get('Status'), o.get('Status'))} → {STATUS_JA.get(r['Status'], r['Status'])}")
        elif (o.get("Start"), o.get("End")) != (r.get("Start"), r.get("End")) and o.get("End"):
            out.append(f"{r['ID']} {r['Task']}：予定 {o.get('Start')}〜{o.get('End')} → {r.get('Start')}〜{r.get('End')}")
    return out


def _write_json(p: Path, d: dict) -> None:
    raw = p.read_bytes() if p.exists() else b""
    nl = "\r\n" if b"\r\n" in raw else "\n"
    p.write_bytes((json.dumps(d, ensure_ascii=False, indent=2) + "\n").replace("\n", nl).encode("utf-8"))


def _clip(s: str, n: int = 60) -> str:
    return s if len(s) <= n else s[: n - 1] + "…"


def update_report(s: dict, sha: str) -> None:
    """本部への報告（portfolio/report.json・details.json）を、ロードマップと WBS から作る。
    mode・quality・金額は人が決める項目なので、そのまま残す"""
    if not REPORT.exists():
        return
    ts = datetime.now(JST).isoformat(timespec="seconds")
    r = json.loads(REPORT.read_text(encoding="utf-8"))
    nxt = s["next"][0] if s["next"] else None
    r.update({
        "as_of": ts,
        "period": ts[:7],
        "phase": f"ロードマップ {s['milestone']}。WBS {s['done']}/{s['total']} 完了、未決の論点 {s['open_issues']}件"[:300],
        "progress_pct": s["pct"],
        "blockers": len(s["blocked"]),
        "approvals": len(s["decide"]),
        "next_action": (f"{nxt['ID']} {nxt['Task']}" + (f"（{nxt['Notes']}）" if nxt.get("Notes") else ""))[:300] if nxt else "なし",
        "evidence_ref": f"docs/progress/PROGRESS.html@{sha}",
    })
    _write_json(REPORT, r)
    if DETAILS.exists():
        d = json.loads(DETAILS.read_text(encoding="utf-8"))
        d.update({
            "as_of": ts,
            # 本部の検査：1項目60字まで
            "blocker_items": [_clip(f"{b['ID']} {b['Task']}（{b.get('Notes') or b.get('Evidence') or '理由は WBS'}）") for b in s["blocked"]][:20],
            "approval_items": [_clip(f"{i['ID']} {i['論点']}（期限 {i['期限']}）") for i in s["decide"]][:20],
        })
        _write_json(DETAILS, d)


def cmd_sync(extra: dict[str, str]) -> None:
    fields, rows = read()
    mod = _board()
    sha = git_sha()
    s = roadmap_summary(rows, mod._milestones())
    changes = wbs_changes(rows)
    p0_open = sum(r["Priority"] == "P0" and r["Status"] != "DONE" for r in rows)
    fmt_task = lambda r: f"{r['ID']} {r['Task']}（{STATUS_JA.get(r['Status'], r['Status'])}・{r['Owner']}・{r.get('Start', '')}〜{r.get('End', '')}）"
    lines = [
        "# 暮らしベース 進捗 / STATUS",
        f"- 最終更新：{now()} JST",
        f"- 対象Git commit：{sha}",
        f"- 現在のマイルストン（ロードマップの順で最初の未完了）：{extra.get('milestone', s['milestone'])}",
        f"- リリース判定：{extra.get('gate', '`docs/BETA_RELEASE_REPORT.md` を参照')}",
        f"- 完了したWBS：{s['done']} / {s['total']}（{s['pct']}%）",
        f"- P0未完了件数（WBS上）：{p0_open}",
        f"- 止まっている作業：{'、'.join(b['ID'] + ' ' + b['Task'] for b in s['blocked']) or 'なし'}",
        f"- 次の作業（予定の早い順）：{' ／ '.join(fmt_task(r) for r in s['next']) or 'なし'}",
        f"- 平尾さんの判断待ち（期限つきの論点）：{'、'.join(i['ID'] + ' ' + i['論点'] for i in s['decide']) or 'なし'}",
        f"- 前のコミットからの WBS の変化：{' ／ '.join(changes) or 'なし'}",
        "- 画面：`docs/progress/PROGRESS.html`（ガントチャート・ロードマップ・論点一覧）",
        "",
        "**注記：テスト未実施の項目を PASS や GO にしない。DONE は根拠のある項目だけ。未完了の作業の日付は仮の予定。**",
    ]
    STATUS.write_text("\n".join(lines) + "\n", encoding="utf-8")
    update_report(s, sha)
    board = mod.build(sha)
    files = [(WBS, "WBS.csv"), (ROADMAP, "ROADMAP.md"), (STATUS, "STATUS.md"), (board, "PROGRESS.html")]
    if (PROG / "ISSUES.csv").exists():
        files.append((PROG / "ISSUES.csv", "ISSUES.csv"))
    for dest in (PARENT, EXPORT):
        dest.mkdir(parents=True, exist_ok=True)
        failed = []
        for src, name in files:  # 1つが開かれていて書けなくても、ほかは同期する
            try:
                shutil.copyfile(src, dest / name)
            except OSError as e:
                failed.append(f"{name}（{e.strerror}。Excel などで開いていたら閉じて、もう一度 sync）")
        print(("sync failed: " + "、".join(failed) + " ->" if failed else "synced ->"), dest)
    print("--- WBS の変化（前のコミットから） ---")
    print("\n".join(changes) or "なし")
    print(f"--- 本部への報告 --- {s['milestone']}／WBS {s['done']}/{s['total']}／次：{s['next'][0]['ID'] + ' ' + s['next'][0]['Task'] if s['next'] else 'なし'}／判断待ち {len(s['decide'])}件")


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
