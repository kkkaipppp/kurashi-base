"use client";

import { useState } from "react";
import { Sheet } from "./Sheet";
import { Button, Field, inputCls } from "./ui";
import { useUI } from "./UIContext";
import { addDays, formatDateJa, todayStr } from "@/lib/date";
import { updatePlan, setPlanDate } from "@/lib/plan";
import { MARK_LABEL, checkPoll, closeDateFor, expiresFor, publicPayload, randomToken, sha256Hex, tally, type Answer } from "@/lib/share/poll";
import { answerUrl, createPoll, deletePoll, closePoll, isShareConfigured, listAnswers } from "@/lib/share/firebase";
import type { AppData, Plan } from "@/lib/types";

type Save = (fn: (d: AppData) => AppData, ok?: string, extra?: (cur: AppData) => string | null) => Promise<boolean>;
type Draft = NonNullable<Plan["poll"]>;

/**
 * 計画の「日程を聞く」（To-Be 段階4。決定 2026-11-28 S-2〜S-5）。
 * 候補日と締め切りを選び、外に出す名前を直して（S-4）、外に置く中身を確かめてから「リンクを作る」。
 * Firebase の設定が無い間は、下書きを端末に残すだけで、外へは何も送らない。
 */
export function PollSection({ plan, save }: { plan: Plan; save: Save }) {
  const ui = useUI();
  const [editing, setEditing] = useState(false);
  const [answers, setAnswers] = useState<(Answer & { uid: string })[] | null>(null);
  const [busy, setBusy] = useState(false);
  const configured = isShareConfigured();
  const poll = plan.poll;
  const url = poll && poll.status !== "draft" ? answerUrl(poll.id) : null;

  const loadAnswers = async () => {
    if (!poll) return;
    setBusy(true);
    try {
      setAnswers(await listAnswers(poll.id));
    } catch {
      ui.toast("回答を読み込めませんでした。通信を確かめて、もう一度お試しください", "error");
    } finally {
      setBusy(false);
    }
  };

  const decide = async (date: string) => {
    if (!poll) return;
    const ok = await ui.confirm({ title: `${formatDateJa(date, true)}に決めますか？`, body: "計画の日にちになり、回答の受け付けを締め切ります（回答は締め切りの7日後に消えます）。", ok: "この日に決める" });
    if (!ok) return;
    // 締め切りは早めるだけ（締め切りのあとに決めても、外の締め切りは変えない。点検 高1）
    const early = closeDateFor(poll.closesAt, todayStr());
    if (await save((d) => updatePlan(setPlanDate(d, plan.id, date, new Date().toISOString()), plan.id, { poll: { ...poll, status: "closed", closesAt: early ?? poll.closesAt } }, new Date().toISOString()), "日にちを決めました")) {
      if (configured && poll.status === "open" && early) closePoll(poll.id, early).catch(() => ui.toast(`締め切りを早められませんでした。回答は ${formatDateJa(poll.closesAt)} まで受け付けます`, "error"));
    }
  };

  const remove = async () => {
    if (!poll) return;
    const ok = await ui.confirm({ title: "日程の調整を消しますか？", body: poll.status === "draft" ? "下書きを消します。" : "外に置いた調整と、みんなの回答も消します。リンクは開けなくなります。", ok: "消す", danger: true });
    if (!ok) return;
    if (poll.status !== "draft") {
      let gone = false;
      if (configured) {
        try {
          await deletePoll(poll.id, poll.ownerKey);
          gone = true;
        } catch {
          gone = false;
        }
      }
      // 外で消せないとき（通信・設定が無い）も、端末の控えは外せる。外の分は消す日に自動で消える（点検 高2）
      if (!gone) {
        const only = await ui.confirm({
          title: "外の調整を消せませんでした",
          body: `端末の控えだけ外しますか？ 外の調整とみんなの回答は ${formatDateJa(expiresFor(poll.closesAt), true)} ごろに自動で消えます。`,
          ok: "端末の控えだけ外す",
          danger: true,
        });
        if (!only) return;
      }
    }
    await save((d) => updatePlan(d, plan.id, { poll: undefined }, new Date().toISOString()), "日程の調整を消しました");
    setAnswers(null);
  };

  return (
    <section aria-labelledby="pl-poll">
      <h2 id="pl-poll" className="mb-1 text-[16px] font-bold">
        日程を聞く
      </h2>
      {!configured && <p className="mb-2 text-[13px] text-ink-3">共有の設定がまだです（Firebase のプロジェクトを作ったあとに使えます）。今は下書きだけ作れて、外へは何も送りません。</p>}
      {!poll ? (
        <Button variant="secondary" className="w-full" onClick={() => setEditing(true)}>
          候補日を選んで聞く
        </Button>
      ) : (
        <div className="space-y-2 rounded-xl border border-line p-3 text-[14px]">
          <p className="font-semibold">
            {poll.title}
            <span className="ml-2 text-[12px] font-medium text-ink-3">{poll.status === "draft" ? "下書き" : poll.status === "open" && todayStr() <= poll.closesAt ? `受け付け中（${formatDateJa(poll.closesAt)}まで）` : "締め切り"}</span>
          </p>
          <p className="text-[13px] text-ink-3">候補日：{poll.options.map((o) => `${formatDateJa(o.date)}${o.label ? ` ${o.label}` : ""}`).join("・")}</p>
          {url && (
            <div className="flex gap-2">
              <input readOnly value={url} className={`${inputCls} text-[13px]`} aria-label="回答のリンク" />
              <Button variant="secondary" onClick={() => navigator.clipboard?.writeText(url).then(() => ui.toast("リンクをコピーしました"), () => ui.toast("コピーできませんでした", "error"))}>
                コピー
              </Button>
            </div>
          )}
          {poll.status !== "draft" && !url && <p className="text-[13px] text-warn">回答のページの場所（公開のサイト）が決まっていないので、リンクを出せません。</p>}
          <div className="flex flex-wrap gap-2">
            {poll.status === "draft" && (
              <Button variant="secondary" onClick={() => setEditing(true)}>
                下書きを直す
              </Button>
            )}
            {poll.status !== "draft" && configured && (
              <Button variant="secondary" onClick={loadAnswers} disabled={busy}>
                {busy ? "読み込み中…" : "回答を見る"}
              </Button>
            )}
            <Button variant="danger" onClick={remove}>
              消す
            </Button>
          </div>
          {answers && (
            <div>
              <p className="text-[13px] text-ink-3">回答 {answers.length}人</p>
              <ul className="divide-y divide-line">
                {tally(poll.options, answers).map((r) => (
                  <li key={r.option.id} className="flex min-h-12 items-center justify-between gap-2">
                    <span className="min-w-0">
                      <span className="block font-semibold">
                        {formatDateJa(r.option.date)}
                        {r.option.label ? ` ${r.option.label}` : ""}
                      </span>
                      <span className="num block text-[12px] text-ink-3">
                        ○{r.o}・△{r.m}・×{r.x}
                      </span>
                    </span>
                    {poll.status === "open" && (
                      <Button variant="secondary" className="shrink-0 px-3 text-[13px]" onClick={() => decide(r.option.date)}>
                        この日に決める
                      </Button>
                    )}
                  </li>
                ))}
              </ul>
              {answers.length > 0 && (
                <details className="mt-1 text-[13px]">
                  <summary className="flex min-h-11 cursor-pointer items-center font-semibold text-ink-2">一人ずつ見る</summary>
                  <ul className="space-y-1">
                    {answers.map((a) => (
                      <li key={a.uid}>
                        <b>{a.name}</b>：{poll.options.map((o) => MARK_LABEL[a.marks[o.id]] ?? "－").join(" ")}
                        {a.comment ? `（${a.comment}）` : ""}
                      </li>
                    ))}
                  </ul>
                </details>
              )}
            </div>
          )}
        </div>
      )}
      {editing && <PollEditor plan={plan} save={save} configured={configured} onClose={() => setEditing(false)} />}
    </section>
  );
}

function PollEditor({ plan, save, configured, onClose }: { plan: Plan; save: Save; configured: boolean; onClose: () => void }) {
  const today = todayStr();
  const [draft, setDraft] = useState<Draft>(
    () => plan.poll ?? { id: randomToken(20), ownerKey: randomToken(32), title: plan.title.slice(0, 40), options: [], closesAt: addDays(today, 7), status: "draft", createdAt: new Date().toISOString() },
  );
  const [date, setDate] = useState(addDays(today, 7));
  const [label, setLabel] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const addOption = () => {
    if (!date) return;
    if (draft.options.length >= 20) return setError("候補日は20個までです");
    setDraft((d) => ({ ...d, options: [...d.options, { id: randomToken(8), date, label: label.trim() }] }));
    setLabel("");
  };
  const keepDraft = async () => {
    if (await save((d) => updatePlan(d, plan.id, { poll: draft }, new Date().toISOString()), "下書きを保存しました")) onClose();
  };
  const publish = async () => {
    const err = checkPoll(draft, today);
    if (err) return setError(err);
    if (!configured) return setError("共有の設定がまだなので、リンクは作れません（下書きは保存できます）");
    setSending(true);
    try {
      await createPoll(draft.id, publicPayload(draft, await sha256Hex(draft.ownerKey)));
    } catch {
      setSending(false);
      return setError("リンクを作れませんでした。通信を確かめて、もう一度お試しください（入力は残っています）");
    }
    setSending(false);
    if (await save((d) => updatePlan(d, plan.id, { poll: { ...draft, status: "open" } }, new Date().toISOString()), "リンクを作りました。コピーして送ってください")) onClose();
  };
  const payload = publicPayload(draft, "（鍵のハッシュ）");
  return (
    <Sheet
      title="日程を聞く"
      open
      onRequestClose={onClose}
      footer={
        <div className="flex gap-2">
          <Button variant="secondary" onClick={keepDraft}>
            下書きを保存
          </Button>
          <Button className="flex-1" onClick={publish} disabled={sending || !configured}>
            {sending ? "作っています…" : "リンクを作る"}
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        <Field label="外に出す名前" htmlFor="poll-title" hint="友達に見える名前です。計画の名前のままでよいか確かめてください（40字まで）">
          <input id="poll-title" value={draft.title} maxLength={40} onChange={(e) => setDraft((d) => ({ ...d, title: e.target.value }))} className={inputCls} />
        </Field>
        <div>
          <p className="mb-1 text-[14px] font-semibold">候補日</p>
          <ul className="mb-2 divide-y divide-line border-y border-line">
            {draft.options.length === 0 && <li className="py-2 text-[13px] text-ink-3">まだありません</li>}
            {draft.options.map((o) => (
              <li key={o.id} className="flex min-h-11 items-center justify-between gap-2">
                <span>
                  {formatDateJa(o.date, true)}
                  {o.label && <span className="ml-1 text-ink-3">{o.label}</span>}
                </span>
                <Button variant="ghost" className="px-2 text-[13px]" onClick={() => setDraft((d) => ({ ...d, options: d.options.filter((x) => x.id !== o.id) }))}>
                  外す
                </Button>
              </li>
            ))}
          </ul>
          <div className="grid grid-cols-[1fr_1fr_auto] gap-2">
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={inputCls} aria-label="候補日" />
            <input value={label} maxLength={20} onChange={(e) => setLabel(e.target.value)} placeholder="例：夜" className={inputCls} aria-label="候補日の補足" />
            <Button variant="secondary" onClick={addOption}>
              足す
            </Button>
          </div>
        </div>
        <Field label="締め切り" htmlFor="poll-close" hint={`この日の終わりまで回答できます。回答は ${formatDateJa(expiresFor(draft.closesAt), true)} ごろに自動で消えます（締め切りの7日後。消えるまで1日ほどかかることがあります）`}>
          <input id="poll-close" type="date" value={draft.closesAt} onChange={(e) => setDraft((d) => ({ ...d, closesAt: e.target.value }))} className={inputCls} />
        </Field>
        <div className="rounded-xl bg-surface-2 p-3 text-[13px]">
          <p className="font-semibold">外に置く中身（これだけを送ります）</p>
          <ul className="mt-1 list-disc space-y-0.5 pl-5">
            <li>名前：{payload.title || "（未入力）"}</li>
            <li>候補日：{payload.options.length ? payload.options.map((o) => `${o.date}${o.label ? ` ${o.label}` : ""}`).join("、") : "（なし）"}</li>
            <li>締め切り：{payload.closesAt}・消す日：{payload.expiresAt}</li>
            <li>作った時刻・持ち主を確かめるための値（鍵そのものではなく、鍵から作った値）・この端末の匿名の番号</li>
          </ul>
          <p className="mt-1 text-ink-3">家計・予定・メモなど、ほかの記録は送りません。置き場所は Google の Firebase です。回答を見られるのは、あなたと回答した本人だけです。</p>
        </div>
        {error && (
          <p role="alert" className="text-[14px] font-medium text-danger">
            {error}
          </p>
        )}
      </div>
    </Sheet>
  );
}
