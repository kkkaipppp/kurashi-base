import { describe, expect, it } from "vitest";
import { emptyData } from "@/lib/defaults";
import { validateAppData } from "@/lib/schema";
import { applyRestore, buildBackup, parseBackup } from "@/lib/backup";
import { CERTIFICATIONS, dailyTarget, formatMinutes, searchCertifications } from "@/lib/study";
import type { AppData, CalendarEvent, Trip } from "@/lib/types";

const ev = (id: string, extra: Partial<CalendarEvent> = {}): CalendarEvent => ({
  id, title: "予定", startDate: "2026-11-22", endDate: "2026-11-22", allDay: false, startTime: "10:00", endTime: "11:00",
  note: "", createdAt: "x", updatedAt: "x", ...extra,
});
const trip = (id: string): Trip => ({
  id, title: "京都旅行", startDate: "2026-12-01", endDate: "2026-12-03", destination: "京都", budget: 50000, note: "", createdAt: "x", updatedAt: "x",
});

/** v4 までの保存データ（trips が無い） */
const v4Raw = () => {
  const d = emptyData() as unknown as Record<string, unknown>;
  delete d.trips;
  (d.events as CalendarEvent[]).push(ev("old-1"));
  return d;
};

describe("v5 のデータ：古いデータを壊さない", () => {
  it("旅行の一覧が無い v4 のデータも読め、予定は消えない", () => {
    const r = validateAppData(v4Raw());
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.data.trips).toEqual([]);
    expect(r.data.events.map((e) => e.id)).toEqual(["old-1"]);
  });

  it("v1 のデータも、旅行の空の一覧つきで読める", () => {
    const d = v4Raw();
    d.schemaVersion = 1;
    for (const k of ["nisa", "notes", "tasks", "assets", "contracts", "health", "documents", "studySubjects", "studyLogs", "goals"]) delete d[k];
    const r = validateAppData(d);
    expect(r.ok && r.data.trips).toEqual([]);
  });

  it("場所・URL・持ち物・旅行つきの予定を保存できる", () => {
    const d = emptyData();
    d.trips.push(trip("t1"));
    d.events.push(ev("e1", { location: "京都駅", url: "https://example.com/r", items: [{ id: "i1", text: "充電器", done: false }], tripId: "t1", kind: "move", cost: 14000 }));
    expect(validateAppData(d).ok).toBe(true);
  });

  it("予定の URL に javascript: などは入れられない", () => {
    const d = emptyData();
    d.events.push(ev("e1", { url: "javascript:alert(1)" }));
    expect(validateAppData(d).ok).toBe(false);
  });

  it("旅行の終了日が開始日より前なら壊れていると判定する", () => {
    const d = emptyData();
    d.trips.push({ ...trip("t1"), endDate: "2026-11-30" });
    expect(validateAppData(d).ok).toBe(false);
  });

  it("v4 のバックアップ（旅行なし）を v5 で追加しても、記録は消えない", () => {
    const old = v4Raw() as unknown as AppData;
    const file = JSON.stringify(buildBackup(old, "2026-11-22T00:00:00.000Z"));
    const p = parseBackup(file);
    expect(p.ok).toBe(true);
    if (!p.ok) return;
    const cur = emptyData();
    cur.trips.push(trip("t1"));
    const r = applyRestore(cur, p.preview.data, "merge");
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.data.trips.map((t) => t.id)).toEqual(["t1"]);
    expect(r.data.events.map((e) => e.id)).toEqual(["old-1"]);
  });

  it("旅行もバックアップから二重にならずに追加できる", () => {
    const d = emptyData();
    d.trips.push(trip("t1"));
    const p = parseBackup(JSON.stringify(buildBackup(d, "2026-11-22T00:00:00.000Z")));
    if (!p.ok) throw new Error(p.error);
    const r1 = applyRestore(emptyData(), p.preview.data, "merge");
    if (!r1.ok) throw new Error(r1.error);
    const r2 = applyRestore(r1.data, p.preview.data, "merge");
    expect(r2.ok && r2.data.trips).toHaveLength(1);
  });
});

describe("資格の候補と勉強時間", () => {
  it("候補は20件。別名・全角半角の違いでも見つかる", () => {
    expect(CERTIFICATIONS).toHaveLength(20);
    expect(searchCertifications("ITパス")[0].id).toBe("ip");
    expect(searchCertifications("基本情報")[0].id).toBe("fe");
    expect(searchCertifications("簿記")[0].name).toContain("簿記");
    expect(searchCertifications("ＦＰ３級")[0].id).toBe("fp3");
    expect(searchCertifications("宅建")[0].id).toBe("takken");
    expect(searchCertifications("存在しない資格名")).toEqual([]);
  });

  it("出典のない資格に、勉強時間の目安を出さない", () => {
    for (const c of CERTIFICATIONS) {
      if (c.targetHoursHint) {
        expect(c.targetHoursHint.source).toMatch(/^https:\/\//);
        expect(c.targetHoursHint.min).toBeLessThanOrEqual(c.targetHoursHint.max);
      }
    }
    expect(CERTIFICATIONS.find((c) => c.id === "ip")!.targetHoursHint).toBeNull();
  });

  it("1日の目標＝残りの分数÷試験までの日数（10分単位で切り上げ）", () => {
    // 100時間 − 記録 0 分、30日 → 200分
    expect(dailyTarget(100, 0, "2026-11-22", "2026-12-22")).toEqual({ kind: "ok", minutes: 200, daysLeft: 30, tooMuch: false });
    // 80時間 − 記録 600分 = 4200分、7日 → 600分 → 多すぎ
    const t = dailyTarget(80, 600, "2026-11-22", "2026-11-29");
    expect(t.kind === "ok" && t.minutes).toBe(600);
    expect(t.kind === "ok" && t.tooMuch).toBe(true);
    // 31分/日 → 40分
    expect(dailyTarget(1, 29, "2026-11-22", "2026-11-23")).toMatchObject({ minutes: 40 });
  });

  it("試験日が今日・過去・未設定、目標なし・達成ずみは割り算しない", () => {
    expect(dailyTarget(100, 0, "2026-11-22", "2026-11-22").kind).toBe("checkExam");
    expect(dailyTarget(100, 0, "2026-11-22", "2026-11-01").kind).toBe("checkExam");
    expect(dailyTarget(100, 0, "2026-11-22", "").kind).toBe("noExam");
    expect(dailyTarget(null, 0, "2026-11-22", "2026-12-22").kind).toBe("noTarget");
    expect(dailyTarget(1, 60, "2026-11-22", "2026-12-22").kind).toBe("done");
  });

  it("うるう年の2月をまたいでも日数が正しい", () => {
    expect(dailyTarget(10, 0, "2028-02-28", "2028-03-01")).toMatchObject({ daysLeft: 2, minutes: 300 });
  });

  it("分を時間の表記にする", () => {
    expect(formatMinutes(40)).toBe("40分");
    expect(formatMinutes(120)).toBe("2時間");
    expect(formatMinutes(150)).toBe("2時間30分");
  });
});
