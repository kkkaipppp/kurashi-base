"use client";

import { isPractice } from "@/lib/practiceFlag";
import { useEffect, useState, useSyncExternalStore } from "react";
import { Sheet } from "./Sheet";
import { useUI } from "./UIContext";
import { Button, Field, inputCls } from "./ui";
import { useData, useStore } from "@/lib/store";
import { todayStr } from "@/lib/date";
import { formatMinutes } from "@/lib/study";
import { newId } from "@/lib/defaults";
import { toNumber } from "@/lib/goalCond";
import {
  TIMER_KEY,
  TIMER_MAX_MIN,
  UNIT_LABEL,
  addStudyLogOnce,
  studyLogExistsError,
  STUDY_LOG_EXISTS,
  subjectExistsError,
  liveBookId,
  bookUnit,
  lastStudy,
  minutesOn,
  parseTimer,
  pauseTimer,
  resumeTimer,
  startTimer,
  timerLogId,
  timerMinutes,
  validRange,
  validScore,
  type RangeUnit,
  type TimerState,
} from "@/lib/studyCore";
import type { StudyLog } from "@/lib/types";

const EVENT = "kb-study-timer";
const read = () => {
  try {
    return localStorage.getItem(TIMER_KEY) ?? "";
  } catch {
    return "";
  }
};
const subscribe = (cb: () => void) => {
  window.addEventListener(EVENT, cb);
  window.addEventListener("storage", cb);
  return () => {
    window.removeEventListener(EVENT, cb);
    window.removeEventListener("storage", cb);
  };
};
/** タイマーは端末に置く（アプリを閉じても、開き直せば続きから）。書けないときは false */
function writeTimer(t: TimerState | null): boolean {
  try {
    // 練習中（決定 Q34 ①）は端末に置かない（本当のタイマーを上書きしない）
    if (isPractice()) return true;
    if (t) localStorage.setItem(TIMER_KEY, JSON.stringify(t));
    else localStorage.removeItem(TIMER_KEY);
  } catch {
    return false;
  }
  window.dispatchEvent(new Event(EVENT));
  return true;
}

/** 1分ごとに画面の時間を進める（タイマーが動いているときだけ） */
function useNow(active: boolean) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    if (!active) return;
    const id = setInterval(() => setNow(new Date()), 15_000);
    return () => clearInterval(id);
  }, [active]);
  return now;
}

/**
 * 勉強の画面の上（o31 F015・D017）：今日の勉強時間、前回の続き（1回押せば始まる）、タイマー（休止・再開・終わる）。
 * 終わるときは時間・範囲・問題数を確かめてから保存する（壁時計の差だけで決めない）。同じタイマーの記録は1件だけ
 */
export function StudyTop() {
  const data = useData();
  const ui = useUI();
  const raw = useSyncExternalStore(subscribe, read, () => "");
  const timer = parseTimer(raw);
  const now = useNow(!!timer && !timer.pausedAt);
  const [finishing, setFinishing] = useState<TimerState | null>(null);
  const today = todayStr();
  const todayMin = minutesOn(data, today);
  const last = lastStudy(data);
  const subjectName = (id: string) => data.studySubjects.find((s) => s.id === id)?.name ?? "（削除された資格）";
  const bookTitle = (sid: string, bid?: string) => (bid ? data.studySubjects.find((s) => s.id === sid)?.books?.find((b) => b.id === bid)?.title : undefined);
  const openSubjects = data.studySubjects.filter((s) => !s.archived);

  const start = (subjectId: string, bookId?: string) => {
    if (timer) return ui.toast("動いているタイマーを先に終わらせてください", "error");
    if (!writeTimer(startTimer(newId("op"), subjectId, new Date(), bookId))) ui.toast("タイマーを保存できませんでした。ブラウザの保存の設定を確かめてください", "error");
  };

  const t = timer ? timerMinutes(timer, now) : null;
  return (
    <section aria-label="今日の勉強" className="space-y-3">
      <div className="flex items-baseline justify-between border-b border-line pb-2">
        <span className="text-[14px] text-ink-2">今日の勉強時間</span>
        <span className="num text-[28px] font-bold">{formatMinutes(todayMin)}</span>
      </div>

      {timer ? (
        <div className="rounded-lg border border-brand p-3" role="timer" aria-live="off">
          <p className="text-[14px] text-ink-2">
            {subjectName(timer.subjectId)}
            {bookTitle(timer.subjectId, timer.bookId) ? `・${bookTitle(timer.subjectId, timer.bookId)}` : ""}
            {timer.pausedAt ? "（休止中）" : "（勉強中）"}
          </p>
          <p className="num text-[32px] font-bold">{t?.needsConfirm === "clock" ? "時刻を確かめてください" : formatMinutes(t?.minutes ?? 0)}</p>
          <div className="mt-2 grid grid-cols-2 gap-2">
            {timer.pausedAt ? (
              <Button variant="secondary" onClick={() => writeTimer(resumeTimer(timer, new Date()))}>
                再開
              </Button>
            ) : (
              <Button variant="secondary" onClick={() => writeTimer(pauseTimer(timer, new Date()))}>
                休止
              </Button>
            )}
            <Button onClick={() => setFinishing(timer)}>終わる</Button>
          </div>
        </div>
      ) : last ? (
        <Button className="min-h-12 w-full" onClick={() => start(last.subjectId, last.bookId)}>
          続きを始める：{subjectName(last.subjectId)}
          {bookTitle(last.subjectId, last.bookId) ? `・${bookTitle(last.subjectId, last.bookId)}` : ""}
        </Button>
      ) : openSubjects.length > 0 ? (
        <Button className="min-h-12 w-full" onClick={() => start(openSubjects[0].id)}>
          勉強を始める：{openSubjects[0].name}
        </Button>
      ) : null}

      {!timer && openSubjects.length > 1 && (
        <details>
          <summary className="flex min-h-11 cursor-pointer items-center text-[14px] font-semibold text-brand">ほかの資格で始める</summary>
          <ul className="divide-y divide-line border-y border-line">
            {openSubjects.map((s) => (
              <li key={s.id}>
                <button type="button" onClick={() => start(s.id)} className="flex min-h-12 w-full items-center text-left hover:bg-surface-2">
                  {s.name}
                </button>
              </li>
            ))}
          </ul>
        </details>
      )}

      {finishing && <FinishSheet key={finishing.opId} timer={finishing} onClose={() => setFinishing(null)} />}
    </section>
  );
}

/** 終わるときの確かめ：時間（直せる）・範囲・問題数・復習。保存できたらタイマーを消す。保存に失敗したらタイマーは残る */
function FinishSheet({ timer, onClose }: { timer: TimerState; onClose: () => void }) {
  const data = useData();
  const books = data.studySubjects.find((s) => s.id === timer.subjectId)?.books ?? [];
  // 消えた教材は選ばない（記録に消えた教材の ID を入れない。再点検 L-3）
  const initialBook = liveBookId(books, timer.bookId);
  const [bookId, setBookIdRaw] = useState(initialBook);
  const unitOf = (id: string): RangeUnit => bookUnit(books, id);
  const store = useStore();
  const ui = useUI();
  const measured = timerMinutes(timer, new Date());
  const [initialMinutes] = useState(String(Math.max(1, Math.min(TIMER_MAX_MIN, measured.minutes))));
  const [minutes, setMinutes] = useState(initialMinutes);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  // 範囲の単位は、選んだ教材の単位から始める（本棚は教材の単位の記録だけを数えるため。再点検 M-2）
  const [unit, setUnit] = useState<RangeUnit>(unitOf(initialBook));
  const setBookId = (id: string) => {
    setBookIdRaw(id);
    if (id) setUnit(unitOf(id));
  };
  const [questions, setQuestions] = useState("");
  const [correct, setCorrect] = useState("");
  const [review, setReview] = useState(false);
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const dirty = [from, to, questions, correct, note].some((x) => x.trim() !== "") || review || minutes !== initialMinutes || bookId !== initialBook;
  // 閉じても、タイマーは残る（記録はまだ）。入れた範囲・問題数・メモは消えるので、確かめる（点検 指摘5）
  const requestClose = async () => {
    if (dirty && !(await ui.confirm({ title: "入力内容を破棄しますか？", body: "タイマーは残ります。入れた範囲・問題数・メモは消えます。", ok: "破棄する", danger: true }))) return;
    onClose();
  };
  const save = async () => {
    const m = toNumber(minutes) ?? NaN;
    if (!Number.isInteger(m) || m < 1 || m > TIMER_MAX_MIN) return setError(`時間は1〜${TIMER_MAX_MIN}分の整数で入れてください`);
    const hasRange = from.trim() !== "" || to.trim() !== "";
    const range = hasRange ? { from: toNumber(from) ?? NaN, to: toNumber(to) ?? NaN, unit } : undefined;
    if (hasRange && !validRange(range)) return setError("範囲は「はじめ ≦ おわり」の1以上の整数で入れてください");
    const hasScore = questions.trim() !== "" || correct.trim() !== "";
    // 片方だけは保存しない（空欄を 0 にしない。点検 中-4）
    if (hasScore && (questions.trim() === "" || correct.trim() === "")) return setError("問題数と正解数は、両方入れるか、両方空にしてください");
    const score = hasScore ? { questions: toNumber(questions) ?? NaN, correct: toNumber(correct) ?? NaN } : {};
    if (!data.studySubjects.some((s) => s.id === timer.subjectId)) return setError("この資格は削除されています。「記録せずに止める」でタイマーを止めてください");
    if (hasScore && !validScore(score)) return setError("問題数と正解数は、正解 ≦ 問題 の0以上の整数で入れてください");
    setBusy(true);
    const ts = new Date().toISOString();
    const log: StudyLog = {
      id: timerLogId(timer),
      subjectId: timer.subjectId,
      date: todayStr(),
      minutes: m,
      note: note.trim(),
      ...(bookId ? { bookId } : {}),
      startedAt: timer.startedAt,
      endedAt: ts,
      ...(range ? { range } : {}),
      ...(hasScore ? score : {}),
      ...(review ? { review: true } : {}),
      createdAt: ts,
      updatedAt: ts,
    };
    const r = await store.commit((d) => addStudyLogOnce(d, log), { check: (cur) => subjectExistsError(cur, timer.subjectId) ?? studyLogExistsError(cur, log.id) });
    setBusy(false);
    if (!r.ok && r.error === STUDY_LOG_EXISTS) {
      // 先に記録した画面がタイマーを消している。ここで入れた値は保存していないことを、そのまま伝えて閉じる（3回目の点検 低-3）
      writeTimer(null);
      ui.toast(STUDY_LOG_EXISTS, "error");
      return onClose();
    }
    if (!r.ok) return setError(`保存できませんでした（${r.error}）。タイマーは残しています。止めるときは「記録せずに止める」を押してください`);
    writeTimer(null);
    ui.toast(`${formatMinutes(m)}を記録しました`);
    onClose();
  };

  return (
    <Sheet title="勉強を記録" open onRequestClose={requestClose}>
      <div className="space-y-3">
        {measured.needsConfirm === "clock" && <p className="text-[14px] text-warn">端末の時刻が開始より前になっています。勉強した時間を入れてください。</p>}
        {measured.needsConfirm === "tooLong" && <p className="text-[14px] text-warn">1日より長くなっています。終わらせ忘れかもしれません。時間を確かめてください。</p>}
        {books.length > 0 && (
          <Field label="教材" htmlFor="st-book" optional>
            <select id="st-book" value={bookId} onChange={(e) => setBookId(e.target.value)} className={inputCls}>
              <option value="">選ばない</option>
              {books.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.title}
                  {b.edition ? `（${b.edition}）` : ""}
                </option>
              ))}
            </select>
          </Field>
        )}
        <Field label="勉強した時間（分）" htmlFor="st-min">
          <input id="st-min" inputMode="numeric" value={minutes} onChange={(e) => setMinutes(e.target.value)} className={inputCls} />
        </Field>
        <fieldset className="space-y-1">
          <legend className="text-[14px] font-semibold text-ink-2">進んだ範囲</legend>
          <div className="flex items-center gap-2">
            <input aria-label="はじめ" inputMode="numeric" value={from} onChange={(e) => setFrom(e.target.value)} className={`${inputCls} w-24`} />
            <span>〜</span>
            <input aria-label="おわり" inputMode="numeric" value={to} onChange={(e) => setTo(e.target.value)} className={`${inputCls} w-24`} />
            <select aria-label="単位" value={unit} onChange={(e) => setUnit(e.target.value as RangeUnit)} className={`${inputCls} w-28`}>
              {(Object.keys(UNIT_LABEL) as RangeUnit[]).map((u) => (
                <option key={u} value={u}>
                  {UNIT_LABEL[u]}
                </option>
              ))}
            </select>
          </div>
        </fieldset>
        <fieldset>
          <legend className="text-[14px] font-semibold text-ink-2">演習</legend>
          <div className="flex items-center gap-2">
            <label className="flex items-center gap-1 text-[14px]">
              正解
              <input inputMode="numeric" value={correct} onChange={(e) => setCorrect(e.target.value)} className={`${inputCls} w-20`} />
            </label>
            <label className="flex items-center gap-1 text-[14px]">
              ／ 問題数
              <input inputMode="numeric" value={questions} onChange={(e) => setQuestions(e.target.value)} className={`${inputCls} w-20`} />
            </label>
          </div>
        </fieldset>
        <label className="flex min-h-11 items-center gap-2">
          <input type="checkbox" className="size-5 accent-brand" checked={review} onChange={(e) => setReview(e.target.checked)} />
          復習（新しく進んだ量に数えない）
        </label>
        <Field label="メモ" htmlFor="st-note" optional>
          <input id="st-note" value={note} onChange={(e) => setNote(e.target.value)} className={inputCls} />
        </Field>
        {error && (
          <p role="alert" className="text-[14px] font-medium text-danger">
            {error}
          </p>
        )}
        <div className="grid grid-cols-2 gap-2">
          <Button
            variant="secondary"
            onClick={async () => {
              if (!(await ui.confirm({ title: "記録せずにタイマーを止めますか？", body: "この勉強時間は記録されません。", ok: "記録せずに止める", danger: true }))) return;
              writeTimer(null);
              onClose();
            }}
          >
            記録せずに止める
          </Button>
          <Button onClick={save} disabled={busy}>
            保存
          </Button>
        </div>
      </div>
    </Sheet>
  );
}
