"use client";

import { useRef, useState } from "react";
import { useUI } from "./UIContext";
import { Button, inputCls } from "./ui";
import { useData, useStore } from "@/lib/store";
import { newId } from "@/lib/defaults";
import { formatDateJa, isValidDateStr } from "@/lib/date";
import { formatMinutes } from "@/lib/study";
import { EXAM_RESULT_LABEL, UNIT_LABEL, accuracy, bookPlan, bookUnit, coveredUnits, subjectExistsError, validAttempt, type BookPlan, type ExamResult, type RangeUnit } from "@/lib/studyCore";
import { todayStr } from "@/lib/date";
import { safeExternalLink } from "@/lib/externalLinks";
import { toNumber } from "@/lib/goalCond";
import type { StudyBook, StudyExamAttempt, StudySubject } from "@/lib/types";

const STATUS: [NonNullable<StudyBook["status"]>, string][] = [
  ["candidate", "購入候補"],
  ["owned", "持っている"],
  ["studying", "勉強中"],
  ["done", "終わった"],
];

/**
 * 自分用：資格のカードの中の「本棚」と「受験の回」（o31 F012・F013・F016、o30 D019・D020・D022）。
 * - 教材の状態（購入候補・持っている・勉強中・終わった）・版・全体の量。進んだ量は、記録の範囲の和（同じ所を2回やっても1回）
 * - 購入候補は支出ではない（家計簿には何も足さない。C014）
 * - 受験の回は学習の記録と別。合格は結果を入れたときだけ
 */
export function StudyShelf({ s }: { s: StudySubject }) {
  const data = useData();
  const store = useStore();
  const ui = useUI();
  const [examForm, setExamForm] = useState<{ date: string; result: ExamResult; score: string; max: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const books = s.books ?? [];
  const logs = data.studyLogs.filter((l) => l.subjectId === s.id);
  const acc = accuracy(logs);
  const today = todayStr();
  const review = s.reviewDays ?? 0;
  const showPlan = !!s.examDate && books.some((b) => b.total && b.status !== "candidate" && b.status !== "done");

  const updateSubject = async (patch: (x: StudySubject) => StudySubject) => {
    const ts = new Date().toISOString();
    const r = await store.commit((d) => ({ ...d, studySubjects: d.studySubjects.map((x) => (x.id === s.id ? { ...patch(x), updatedAt: ts } : x)) }), { check: (cur) => subjectExistsError(cur, s.id) });
    if (!r.ok) ui.toast(r.error, "error");
    return r.ok;
  };
  const setBook = (id: string, p: Partial<StudyBook>) => updateSubject((x) => ({ ...x, books: (x.books ?? []).map((b) => (b.id === id ? { ...b, ...p } : b)) }));

  const addExam = async () => {
    if (!examForm || busyRef.current) return; // 2回押しても1件（点検 低-1。描き直しを待たずに止める。再点検 L-7）
    if (examForm.date && !isValidDateStr(examForm.date)) return setError("受験日を正しく入れてください");
    const num = toNumber;
    const a: StudyExamAttempt = { id: newId("ex"), date: examForm.date, result: examForm.result, score: num(examForm.score), maxScore: num(examForm.max) };
    if (!validAttempt({ ...a, note: "" })) return setError("点数は0以上・満点以下で入れてください");
    busyRef.current = true;
    setBusy(true);
    let ok = false;
    try {
      ok = await updateSubject((x) => ({ ...x, exams: [...(x.exams ?? []), a] }));
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
    if (ok) {
      setExamForm(null);
      setError(null);
    }
  };

  return (
    <div className="mt-3 space-y-3">
      {(acc.pct !== null || logs.some((l) => l.range)) && (
        <p className="num text-[14px] text-ink-2">
          {acc.pct !== null && `正答率 ${acc.pct}%（${acc.correct}/${acc.questions}問）`}
        </p>
      )}
      {books.length > 0 && (
        <section aria-label="本棚">
          <h3 className="mb-1 text-[14px] font-semibold text-ink-3">本棚</h3>
          {showPlan && (
            <div className="mb-1 flex items-center gap-2 text-[14px] text-ink-2">
              <span aria-hidden="true">試験の前の復習の日数</span>
              <input aria-label="試験の前の復習の日数" inputMode="numeric" defaultValue={review ? String(review) : ""} placeholder="0" onBlur={(e) => {
                const raw = e.target.value.trim();
                const n = raw === "" ? 0 : toNumber(raw);
                if (n === null || !Number.isInteger(n) || n < 0 || n > 365) {
                  e.target.value = review ? String(review) : "";
                  return ui.toast("復習の日数は0〜365の整数で入れてください", "error");
                }
                const input = e.target;
                input.value = n ? String(n) : "";
                if (n !== review) void updateSubject((x) => ({ ...x, reviewDays: n })).then((ok) => {
                  if (!ok) input.value = review ? String(review) : ""; // 保存できなかった値を欄に残さない（3回目の点検 低-4）
                });
              }} className={`${inputCls} w-20`} />
              <span aria-hidden="true">日</span>
            </div>
          )}
          <ul className="divide-y divide-line border-y border-line">
            {books.map((b) => {
              const bl = logs.filter((l) => l.bookId === b.id);
              const all = bl.filter((l) => l.range && !l.review).map((l) => l.range!);
              // 数える単位は、選ぶ欄に出ている単位と同じ（未設定はページ。記録の並び順で変えない。再点検 M-3）
              const unit: RangeUnit = bookUnit(books, b.id);
              // 教材の単位と同じ範囲だけを数える（違う単位は足さない。o31 C018・点検 中-3）
              const ranges = all.filter((r) => r.unit === unit);
              const otherUnits = all.length - ranges.length;
              const done = coveredUnits(ranges);
              const min = bl.reduce((t, l) => t + l.minutes, 0);
              const href = b.url ? safeExternalLink(b.url) : null;
              return (
                <li key={b.id} className="space-y-1 py-2">
                  <p className="text-[15px] font-semibold">
                    {href ? (
                      <a href={href} target="_blank" rel="noopener noreferrer" className="text-brand underline">
                        {b.title}
                      </a>
                    ) : (
                      b.title
                    )}
                    {b.edition && <span className="ml-1 text-[14px] font-normal text-ink-3">{b.edition}</span>}
                  </p>
                  <p className="num text-[14px] text-ink-2">
                    {min > 0 ? `勉強時間 ${formatMinutes(min)}` : "まだ記録なし"}
                    {done > 0 && `・進んだ量 ${done}${UNIT_LABEL[unit as RangeUnit]}`}
                    {b.total ? `／全体 ${b.total}${UNIT_LABEL[unit as RangeUnit]}（残り ${Math.max(0, b.total - done)}）` : ""}
                    {otherUnits > 0 && `（ほかの単位の記録 ${otherUnits}件は数えていません）`}
                  </p>
                  {s.examDate && b.status !== "candidate" && b.status !== "done" && <PlanLine plan={bookPlan(b.total, done, today, s.examDate, review)} unit={UNIT_LABEL[unit as RangeUnit]} review={review} />}
                  <div className="flex flex-wrap items-center gap-2">
                    <select aria-label={`${b.title}の状態`} value={b.status ?? ""} onChange={(e) => setBook(b.id, { status: (e.target.value || undefined) as StudyBook["status"] })} className={`${inputCls} w-32`}>
                      {!b.status && <option value="">未設定</option>}
                      {STATUS.map(([k, label]) => (
                        <option key={k} value={k}>
                          {label}
                        </option>
                      ))}
                    </select>
                    <input aria-label={`${b.title}の全体の量`} inputMode="numeric" defaultValue={b.total ? String(b.total) : ""} placeholder="全体の量" onBlur={(e) => {
                      const n = toNumber(e.target.value);
                      if (e.target.value.trim() !== "" && (n === null || !Number.isInteger(n) || n < 1 || n > 100000)) {
                        // 保存しない値は欄に残さず、保存してある値に戻す（入力の保持の状態を正しく見せる。点検 指摘5）
                        e.target.value = b.total ? String(b.total) : "";
                        return ui.toast("全体の量は1以上の整数で入れてください", "error");
                      }
                      const input = e.target;
                      if (n !== null) input.value = String(n); // 全角で入れても、保存した形（半角）で見せる
                      if (n !== (b.total ?? null)) void setBook(b.id, { total: n }).then((ok) => {
                        if (!ok) input.value = b.total ? String(b.total) : ""; // 保存できなかった値を欄に残さない（3回目の点検 低-4）
                      });
                    }} className={`${inputCls} w-24`} />
                    <select aria-label={`${b.title}の単位`} value={b.unit ?? "page"} onChange={(e) => setBook(b.id, { unit: e.target.value as RangeUnit })} className={`${inputCls} w-24`}>
                      {(Object.keys(UNIT_LABEL) as RangeUnit[]).map((u) => (
                        <option key={u} value={u}>
                          {UNIT_LABEL[u]}
                        </option>
                      ))}
                    </select>
                  </div>
                  {b.status === "candidate" && <p className="text-[14px] text-ink-3">購入候補は家計簿に入りません。買ったら支出を記録してください。</p>}
                </li>
              );
            })}
          </ul>
        </section>
      )}

      <section aria-label="受験の回">
        <h3 className="mb-1 text-[14px] font-semibold text-ink-3">受験</h3>
        {(s.exams?.length ?? 0) > 0 && (
          <ul className="divide-y divide-line border-y border-line">
            {s.exams!.map((a) => (
              <li key={a.id} className="flex min-h-11 items-center justify-between gap-2 text-[14px]">
                <span>{a.date ? formatDateJa(a.date, true) : "日付未定"}</span>
                <span className="num">
                  {a.score != null && `${a.score}${a.maxScore ? `／${a.maxScore}点` : "点"}　`}
                  <select aria-label={`${a.date ? formatDateJa(a.date, true) : "日付未定"}の受験の結果`} value={a.result} onChange={async (e) => {
                    const next = e.target.value as ExamResult;
                    // 結果は記録の確定なので、変える前に確かめる（選んだだけで保存しない。点検 指摘5）
                    if (!(await ui.confirm({ title: `結果を「${EXAM_RESULT_LABEL[next]}」にしますか？`, ok: "変える" }))) return;
                    updateSubject((x) => ({ ...x, exams: (x.exams ?? []).map((y) => (y.id === a.id ? { ...y, result: next } : y)) }));
                  }} className="min-h-11 rounded border border-line bg-surface px-1">
                    {(Object.keys(EXAM_RESULT_LABEL) as ExamResult[]).map((k) => (
                      <option key={k} value={k}>
                        {EXAM_RESULT_LABEL[k]}
                      </option>
                    ))}
                  </select>
                </span>
              </li>
            ))}
          </ul>
        )}
        {examForm ? (
          <div className="mt-2 space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <input type="date" aria-label="受験日" value={examForm.date} onChange={(e) => setExamForm({ ...examForm, date: e.target.value })} className={`${inputCls} w-40`} />
              <select aria-label="結果" value={examForm.result} onChange={(e) => setExamForm({ ...examForm, result: e.target.value as ExamResult })} className={`${inputCls} w-28`}>
                {(Object.keys(EXAM_RESULT_LABEL) as ExamResult[]).map((k) => (
                  <option key={k} value={k}>
                    {EXAM_RESULT_LABEL[k]}
                  </option>
                ))}
              </select>
              <input aria-label="点数" inputMode="decimal" placeholder="点数" value={examForm.score} onChange={(e) => setExamForm({ ...examForm, score: e.target.value })} className={`${inputCls} w-20`} />
              <input aria-label="満点" inputMode="decimal" placeholder="満点" value={examForm.max} onChange={(e) => setExamForm({ ...examForm, max: e.target.value })} className={`${inputCls} w-20`} />
            </div>
            {error && (
              <p role="alert" className="text-[14px] text-danger">
                {error}
              </p>
            )}
            <div className="grid grid-cols-2 gap-2">
              <Button variant="secondary" onClick={() => setExamForm(null)}>
                やめる
              </Button>
              <Button onClick={addExam} disabled={busy}>
                保存
              </Button>
            </div>
          </div>
        ) : (
          <button type="button" onClick={() => setExamForm({ date: s.examDate, result: "planned", score: "", max: "" })} className="mt-1 min-h-11 text-[14px] font-semibold text-brand">
            ＋ 受験の回を追加
          </button>
        )}
      </section>
    </div>
  );
}

/** 教材の1日の量（o31 F017）。数を出せないときは理由を出す */
function PlanLine({ plan, unit, review }: { plan: BookPlan; unit: string; review: number }) {
  if (plan.kind === "noTotal" || plan.kind === "noExam") return null;
  if (plan.kind === "done") return <p className="text-[14px] text-ink-3">全体の量まで進みました</p>;
  if (plan.kind === "past") return null;
  if (plan.kind === "noDays") return <p className="text-[14px] text-warn">試験まで{plan.days}日で、復習の{review}日を除くと進める日がありません。復習の日数を見直してください</p>;
  return (
    <p className="num text-[14px] text-ink-2">
      試験日までに終えるには 1日 <b>{plan.perDay}{unit}</b>（残り {plan.remaining}{unit}・{plan.workDays}日{review > 0 ? `。復習の${review}日を除く` : ""}）
    </p>
  );
}
