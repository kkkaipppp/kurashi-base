"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import { CollectionSection, numberFromDraft, type CollectionConfig } from "@/components/CollectionPage";
import { OpenFromQuery } from "@/components/OpenFromQuery";
import { Sheet } from "@/components/Sheet";
import { useUI } from "@/components/UIContext";
import { Button, Card, Empty, Field, PageHeader, inputCls } from "@/components/ui";
import { formatDateJa, isValidDateStr, todayStr } from "@/lib/date";
import { str } from "@/lib/draft";
import { studyStats } from "@/lib/life";
import { newId } from "@/lib/defaults";
import { useData, useStore } from "@/lib/store";
import { bookSearch, isSavableUrl, noteSearch, safeExternalLink } from "@/lib/externalLinks";
import { dailyTarget, findCertification, formatMinutes, groupedCertifications, searchCertifications, sourceLabel, type Certification } from "@/lib/study";
import type { StudyBook, StudySubject } from "@/lib/types";

/* ---------------- 勉強の記録（一覧は共通の部品を使う） ---------------- */

const logs: CollectionConfig<"studyLogs"> = {
  key: "studyLogs",
  title: "勉強の記録",
  noun: "勉強の記録",
  emptyText: "まだ勉強の記録がありません。資格のカードの「＋15分」などから、すぐに記録できます。",
  addBlocked: (data) => (data.studySubjects.some((s) => !s.archived) ? null : "先に、上で資格を追加してください。"),
  fields: ({ data }) => [
    {
      name: "subjectId",
      label: "資格",
      type: "select",
      options: data.studySubjects.map((s) => ({ value: s.id, label: s.archived ? `${s.name}（終了）` : s.name })),
    },
    { name: "date", label: "日付", type: "date", required: true, half: true },
    { name: "minutes", label: "勉強した時間（分）", type: "number", required: true, half: true, placeholder: "例：60" },
    { name: "note", label: "内容", optional: true, type: "textarea", placeholder: "例：過去問 第3問" },
  ],
  initial: ({ today, data }) => ({ subjectId: data.studySubjects.find((s) => !s.archived)?.id ?? "", date: today, minutes: "", note: "" }),
  toDraft: (l) => ({ subjectId: l.subjectId, date: l.date, minutes: String(l.minutes), note: l.note }),
  fromDraft: (d) => ({ subjectId: str(d, "subjectId"), date: str(d, "date"), minutes: numberFromDraft(str(d, "minutes")) ?? 0, note: str(d, "note") }),
  validate: (d) => {
    const m = numberFromDraft(str(d, "minutes"));
    const e: Record<string, string> = {};
    if (!str(d, "subjectId")) e.subjectId = "資格を選んでください";
    if (m === null || !Number.isInteger(m) || m < 1 || m > 1440) e.minutes = "1〜1440分の整数で入力してください";
    return e;
  },
  sort: (a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt),
  groupBy: (l) => l.date,
  groupLabel: (k) => formatDateJa(k, true),
  row: (l, { data }) => ({
    title: data.studySubjects.find((s) => s.id === l.subjectId)?.name ?? "（削除された資格）",
    sub: l.note,
    right: formatMinutes(l.minutes),
  }),
};

export default function StudyPage() {
  const data = useData();
  const today = todayStr();
  const [form, setForm] = useState<{ id?: string; key: number } | null>(null);
  const subjects = useMemo(
    () => [...data.studySubjects].sort((a, b) => Number(a.archived) - Number(b.archived) || (a.examDate || "9999").localeCompare(b.examDate || "9999")),
    [data.studySubjects],
  );
  const onOpen = useCallback((id: string) => setForm({ id: id === "new" ? undefined : id, key: Date.now() }), []);

  return (
    <main className="space-y-4">
      <OpenFromQuery ids={[...data.studySubjects.map((s) => s.id), "new"]} onOpen={onOpen} />
      <PageHeader
        title="資格の学習"
        right={
          <Button onClick={() => setForm({ key: Date.now() })} className="min-h-10 px-3 text-[14px]">
            ＋ 資格を追加
          </Button>
        }
      />
      {subjects.length === 0 ? (
        <Card>
          <Empty action={<Button onClick={() => setForm({ key: Date.now() })}>資格を追加する</Button>}>
            勉強している資格を追加すると、試験までの日数と、1日に勉強したい時間の目安が分かります。
          </Empty>
        </Card>
      ) : (
        <ul className="space-y-3">
          {subjects.map((s) => (
            <SubjectCard key={s.id} s={s} today={today} onEdit={() => setForm({ id: s.id, key: Date.now() })} />
          ))}
        </ul>
      )}
      <CollectionSection config={logs} heading="勉強の記録" />
      {form && <SubjectForm key={form.key} editing={form.id ? data.studySubjects.find((x) => x.id === form.id) : undefined} onClose={() => setForm(null)} />}
    </main>
  );
}

/* ---------------- 資格のカード ---------------- */

const linkCls = "inline-flex min-h-10 items-center rounded-lg border border-line px-3 text-[13px] font-semibold text-brand hover:bg-brand-soft";

function SubjectCard({ s, today, onEdit }: { s: StudySubject; today: string; onEdit: () => void }) {
  const data = useData();
  const store = useStore();
  const ui = useUI();
  const st = studyStats(s, data.studyLogs, today);
  const cert = findCertification(s.catalogId);
  const target = dailyTarget(s.targetHours, st.totalMinutes, today, s.examDate);
  const exam =
    st.daysToExam === null ? "試験日 未定" : st.daysToExam > 0 ? `試験まであと${st.daysToExam}日` : st.daysToExam === 0 ? "今日が試験日" : "試験日を過ぎました";

  const quick = (min: number) => {
    const r = store.addItem("studyLogs", { subjectId: s.id, date: today, minutes: min, note: "" });
    if (!r.ok) return ui.toast(r.error, "error");
    ui.toast(`${s.name}：${formatMinutes(min)}を記録しました`);
  };

  return (
    <li>
      <Card className={s.archived ? "opacity-70" : ""}>
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <h2 className="text-[17px] leading-snug font-bold break-words">
              {s.name}
              {s.archived && <span className="ml-2 rounded-full bg-surface-2 px-2 py-0.5 align-middle text-[11px] font-semibold text-ink-3">終了</span>}
            </h2>
            <p className="text-[13px] text-ink-2">
              {exam}
              {s.examDate && `（${formatDateJa(s.examDate)}）`}
            </p>
          </div>
          <Button variant="secondary" onClick={onEdit} className="min-h-10 shrink-0 px-3 text-[14px]">
            編集
          </Button>
        </div>

        <p className="num mt-2 text-[13px] text-ink-2">
          これまで {formatMinutes(st.totalMinutes)}
          {s.targetHours ? `／目標 ${s.targetHours}時間（${st.targetPct}%）` : ""}・この7日間 {formatMinutes(st.weekMinutes)}
        </p>
        {s.targetHours ? (
          <div className="mt-1 h-2 overflow-hidden rounded-full bg-surface-2" role="progressbar" aria-valuenow={st.targetPct ?? 0} aria-valuemin={0} aria-valuemax={100} aria-label="目標の勉強時間に対する進み具合">
            <div className="h-full rounded-full bg-brand" style={{ width: `${st.targetPct ?? 0}%` }} />
          </div>
        ) : null}

        {!s.archived && (
          <div className="mt-3 rounded-xl bg-brand-soft px-3 py-2 text-[14px]">
            {target.kind === "ok" && (
              <>
                <p>
                  1日あたり <b className="num">{formatMinutes(target.minutes)}</b> 勉強すると、試験日までに目標に届きます
                </p>
                {target.tooMuch && <p className="mt-1 text-[13px] text-warn">1日4時間を超えています。目標の勉強時間か試験日を調整してみましょう。</p>}
              </>
            )}
            {target.kind === "done" && <p>目標の勉強時間に届きました。</p>}
            {target.kind === "noTarget" && <p className="text-ink-2">「編集」で目標の勉強時間を入れると、1日の目安を出します。</p>}
            {target.kind === "noExam" && <p className="text-ink-2">「編集」で試験日を入れると、1日の目安を出します。</p>}
            {target.kind === "checkExam" && <p className="text-ink-2">試験日を確認してください（今日か、過ぎています）。</p>}
            <p className="mt-1 text-[12px] text-ink-3">今日の記録：{formatMinutes(st.todayMinutes)}</p>
          </div>
        )}

        {!s.archived && (
          <div className="mt-3">
            <p className="mb-1 text-[12px] font-semibold text-ink-3">今日の勉強を記録</p>
            <div className="grid grid-cols-3 gap-2">
              {[15, 30, 60].map((m) => (
                <button key={m} type="button" onClick={() => quick(m)} className="min-h-11 rounded-xl border border-line bg-surface text-[14px] font-semibold hover:bg-surface-2">
                  ＋{formatMinutes(m)}
                </button>
              ))}
            </div>
          </div>
        )}

        {cert?.targetHoursHint && (
          <p className="mt-3 text-[12px] text-ink-3">
            勉強時間の目安：{cert.targetHoursHint.min}〜{cert.targetHoursHint.max}時間（
            <a href={cert.targetHoursHint.source} target="_blank" rel="noopener noreferrer" className="underline">
              出典：{sourceLabel(cert.targetHoursHint.source)}
            </a>
            ）。学習の経験で大きく変わります。
          </p>
        )}

        {(s.books?.length ?? 0) > 0 && (
          <div className="mt-3">
            <p className="mb-1 text-[12px] font-semibold text-ink-3">登録した参考書</p>
            <ul className="space-y-1">
              {s.books!.map((b) => {
                const href = b.url ? safeExternalLink(b.url) : null;
                return (
                  <li key={b.id} className="text-[14px]">
                    {href ? (
                      <a href={href} target="_blank" rel="noopener noreferrer" className="font-semibold text-brand underline">
                        {b.title}
                      </a>
                    ) : (
                      <span className="font-semibold">{b.title}</span>
                    )}
                    {b.note && <span className="ml-1 text-[12px] text-ink-3">{b.note}</span>}
                  </li>
                );
              })}
            </ul>
          </div>
        )}

        <div className="mt-3 flex flex-wrap gap-2">
          <a href={bookSearch(`${s.name} 参考書`) ?? "#"} target="_blank" rel="noopener noreferrer" className={linkCls}>
            参考書を探す（Amazon）
          </a>
          <a href={noteSearch(`${s.name} 勉強法`) ?? "#"} target="_blank" rel="noopener noreferrer" className={linkCls}>
            noteで勉強法を探す
          </a>
          {cert && (
            <a href={cert.officialExamURL} target="_blank" rel="noopener noreferrer" className={linkCls}>
              試験の公式ページ
            </a>
          )}
        </div>
      </Card>
    </li>
  );
}

/* ---------------- 資格の追加・編集 ---------------- */

function SubjectForm({ editing, onClose }: { editing?: StudySubject; onClose: () => void }) {
  const data = useData();
  const store = useStore();
  const ui = useUI();
  const initial = useMemo(
    () => ({
      name: editing?.name ?? "",
      catalogId: editing?.catalogId ?? "",
      examDate: editing?.examDate ?? "",
      targetHours: editing?.targetHours != null ? String(editing.targetHours) : "",
      archived: editing?.archived ?? false,
      books: editing?.books ?? ([] as StudyBook[]),
    }),
    [editing],
  );
  const [f, setF] = useState(initial);
  const [q, setQ] = useState("");
  const [book, setBook] = useState({ title: "", url: "" });
  const [errors, setErrors] = useState<Record<string, string>>({});
  // 編集を始めたときの記録と ID。保存の直前に比べ、別のタブで変わっていたら・消されていたら保存しない
  const editSnapshot = useRef(editing ? JSON.stringify(editing) : undefined);
  const editId = useRef(editing?.id);
  const [wasEditing] = useState(Boolean(editing)); // 見出し用（消されても「編集」のまま）
  const lock = useRef(false);
  const dirty = JSON.stringify(f) !== JSON.stringify(initial) || !!book.title.trim();
  const cert = findCertification(f.catalogId);
  const hits = q.trim() ? searchCertifications(q).slice(0, 6) : [];

  const pick = (c: Certification) => {
    setF((x) => ({ ...x, name: c.name, catalogId: c.id }));
    setQ("");
    setErrors((e) => ({ ...e, name: "" }));
  };

  const requestClose = async () => {
    if (dirty && !(await ui.confirm({ title: "入力内容を破棄しますか？", body: "保存していない変更は失われます。", ok: "破棄する", danger: true }))) return;
    onClose();
  };

  const addBook = () => {
    const title = book.title.trim();
    if (!title) return setErrors((e) => ({ ...e, book: "参考書の名前を入力してください" }));
    if (!isSavableUrl(book.url)) return setErrors((e) => ({ ...e, book: "URL は https:// から始まる形で入力してください" }));
    setF((x) => ({ ...x, books: [...x.books, { id: newId("bk"), title: title.slice(0, 100), url: safeExternalLink(book.url) ?? "", note: "" }] }));
    setBook({ title: "", url: "" });
    setErrors((e) => ({ ...e, book: "" }));
  };

  const save = () => {
    if (lock.current) return;
    const e: Record<string, string> = {};
    if (!f.name.trim()) e.name = "資格の名前を入力するか、候補から選んでください";
    if (f.examDate && !isValidDateStr(f.examDate)) e.examDate = "正しい日付を入力してください";
    const h = f.targetHours.trim() === "" ? null : Number(f.targetHours.normalize("NFKC"));
    if (h !== null && (!Number.isFinite(h) || h <= 0 || h > 10000)) e.targetHours = "目標の勉強時間は1〜10000時間で入力してください";
    if (book.title.trim()) e.book = "入力中の参考書を「追加」するか、消してください";
    if (Object.keys(e).length) return setErrors(e);
    lock.current = true;
    const item = {
      name: f.name.trim(),
      examDate: f.examDate,
      targetHours: h,
      archived: f.archived,
      ...(f.catalogId && f.name.trim() === cert?.name ? { catalogId: f.catalogId } : {}),
      ...(f.books.length ? { books: f.books } : {}),
    };
    const r = editId.current ? store.replaceItem("studySubjects", editId.current, item, editSnapshot.current) : store.addItem("studySubjects", item);
    if (!r.ok) {
      lock.current = false;
      return ui.toast(r.error, "error");
    }
    ui.toast(editing ? "保存しました" : "資格を追加しました");
    onClose();
  };

  const remove = async () => {
    if (!editing) return;
    const n = data.studyLogs.filter((l) => l.subjectId === editing.id).length;
    const ok = await ui.confirm({
      title: "この資格を削除しますか？",
      body: `${editing.name}\n${n > 0 ? `この資格の勉強の記録${n}件も、一緒に削除されます。` : ""}削除すると元に戻せません。学習をやめるだけなら「学習を終了」にしてください。`,
      ok: "削除する",
      danger: true,
    });
    if (!ok) return;
    const r = store.removeStudySubject(editing.id);
    if (!r.ok) return ui.toast(r.error, "error");
    ui.toast("削除しました");
    onClose();
  };

  return (
    <Sheet
      title={wasEditing ? "資格を編集" : "資格を追加"}
      open
      onRequestClose={requestClose}
      footer={
        <div className="flex gap-2">
          {editing && (
            <Button variant="danger" onClick={remove}>
              削除
            </Button>
          )}
          <Button className="flex-1" onClick={save}>
            保存する
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        {!editing && (
          <div>
            <Field label="資格を探す" optional htmlFor="sj-q">
              <input id="sj-q" value={q} onChange={(e) => setQ(e.target.value)} placeholder="例：簿記、ITパス、宅建" className={inputCls} enterKeyHint="search" autoComplete="off" />
            </Field>
            {q.trim() !== "" && (
              <ul className="mt-2 space-y-1" aria-label="候補">
                {hits.map((c) => (
                  <li key={c.id}>
                    <button type="button" onClick={() => pick(c)} className="flex min-h-11 w-full items-center justify-between rounded-xl bg-surface-2 px-3 text-left text-[14px] hover:bg-brand-soft">
                      <span className="font-semibold">{c.name}</span>
                      <span className="text-[12px] text-ink-3">{c.group}</span>
                    </button>
                  </li>
                ))}
                <li>
                  <button
                    type="button"
                    onClick={() => {
                      setF((x) => ({ ...x, name: q.trim(), catalogId: "" }));
                      setQ("");
                    }}
                    className="flex min-h-11 w-full items-center rounded-xl border border-dashed border-line px-3 text-left text-[14px] text-brand"
                  >
                    「{q.trim()}」を自分で登録する
                  </button>
                </li>
              </ul>
            )}
            {q.trim() === "" && !f.name && (
              <div className="mt-2 space-y-2">
                <p className="text-[12px] font-semibold text-ink-3">候補から選ぶ（見つからなければ、上に名前を入力）</p>
                {groupedCertifications().map((g) => (
                  <div key={g.group}>
                    <p className="text-[12px] text-ink-3">{g.group}</p>
                    <div className="mt-1 flex flex-wrap gap-1.5">
                      {g.items.map((c) => (
                        <button key={c.id} type="button" onClick={() => pick(c)} className="min-h-9 rounded-full border border-line bg-surface px-3 text-[13px] hover:bg-brand-soft">
                          {c.name}
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {(editing || f.name) && (
          <>
            <Field label="資格の名前" htmlFor="sj-name" error={errors.name}>
              <input id="sj-name" value={f.name} onChange={(e) => setF((x) => ({ ...x, name: e.target.value }))} className={inputCls} maxLength={60} aria-invalid={!!errors.name} />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="試験日" optional htmlFor="sj-exam" error={errors.examDate}>
                <input id="sj-exam" type="date" value={f.examDate} onChange={(e) => setF((x) => ({ ...x, examDate: e.target.value }))} className={inputCls} aria-invalid={!!errors.examDate} />
              </Field>
              <Field label="目標の勉強時間" optional htmlFor="sj-hours" error={errors.targetHours}>
                <div className="flex items-center gap-1">
                  <input id="sj-hours" inputMode="numeric" value={f.targetHours} onChange={(e) => setF((x) => ({ ...x, targetHours: e.target.value }))} className={inputCls} maxLength={5} aria-invalid={!!errors.targetHours} />
                  <span className="shrink-0 text-[14px] text-ink-2">時間</span>
                </div>
              </Field>
            </div>
            {cert?.targetHoursHint ? (
              <div className="rounded-xl bg-brand-soft px-3 py-2 text-[13px]">
                <p>
                  勉強時間の目安：<b>{cert.targetHoursHint.min}〜{cert.targetHoursHint.max}時間</b>（出典：{sourceLabel(cert.targetHoursHint.source)}）
                </p>
                <p className="text-[12px] text-ink-3">資格の学校・通信講座が示している目安です。学習の経験で大きく変わるので、自分に合わせて変えてください。</p>
                <div className="mt-1 flex gap-2">
                  {[cert.targetHoursHint.min, cert.targetHoursHint.max].map((h) => (
                    <button key={h} type="button" onClick={() => setF((x) => ({ ...x, targetHours: String(h) }))} className="min-h-9 rounded-lg bg-surface px-3 text-[13px] font-semibold text-brand">
                      {h}時間にする
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              f.name && <p className="text-[12px] text-ink-3">この資格の勉強時間の目安は、出典を確かめられていないため出していません。目標は自分で決めてください。</p>
            )}

            <div>
              <p className="mb-1 text-[14px] font-semibold">
                参考書<span className="ml-1 text-[12px] font-normal text-ink-3">任意・使っている本をメモ</span>
              </p>
              {f.books.length > 0 && (
                <ul className="mb-2 space-y-1">
                  {f.books.map((b) => (
                    <li key={b.id} className="flex min-h-10 items-center gap-2 rounded-lg bg-surface-2 px-3">
                      <span className="min-w-0 flex-1 truncate text-[14px]">{b.title}</span>
                      <button type="button" onClick={() => setF((x) => ({ ...x, books: x.books.filter((y) => y.id !== b.id) }))} className="min-h-9 rounded-lg px-2 text-[13px] text-ink-3" aria-label={`${b.title}を外す`}>
                        外す
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              <div className="grid gap-2">
                <input value={book.title} onChange={(e) => setBook((x) => ({ ...x, title: e.target.value }))} placeholder="本の名前" className={inputCls} maxLength={100} aria-label="参考書の名前" />
                <div className="flex gap-2">
                  <input value={book.url} onChange={(e) => setBook((x) => ({ ...x, url: e.target.value }))} placeholder="URL（任意）https://" inputMode="url" className={inputCls} maxLength={500} aria-label="参考書のURL" />
                  <Button variant="secondary" onClick={addBook} disabled={!book.title.trim()} className="shrink-0 whitespace-nowrap">
                    追加
                  </Button>
                </div>
                {errors.book && (
                  <p role="alert" className="text-[13px] text-danger">
                    {errors.book}
                  </p>
                )}
              </div>
            </div>

            {editing && (
              <label className="flex min-h-11 items-center justify-between rounded-xl border border-line bg-surface px-3">
                <span className="text-[15px]">学習を終了（一覧の下へ移す）</span>
                <input type="checkbox" checked={f.archived} onChange={(e) => setF((x) => ({ ...x, archived: e.target.checked }))} className="size-5 accent-[var(--brand)]" />
              </label>
            )}
          </>
        )}
      </div>
    </Sheet>
  );
}
