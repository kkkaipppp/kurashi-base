"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Button, Field, inputCls } from "@/components/ui";
import { formatDateJa, todayStr } from "@/lib/date";
import { COMMENT_MAX, MARK_LABEL, NAME_MAX, checkAnswer, type Mark, type PublicPoll } from "@/lib/share/poll";
import { getPoll, isShareConfigured, myAnswer, putAnswer } from "@/lib/share/firebase";

/**
 * 日程調整の回答のページ（友達がリンクから開く。アカウント不要。To-Be 段階4・決定 2026-11-28）。
 * 同じ端末からなら、あとで自分の回答を直せる（S-3。匿名ログインの uid ごとに1件）。
 * Firebase の設定が無い間は「準備中」を出すだけで、どこにも送らない。
 */
function Inner() {
  const sp = useSearchParams();
  const id = sp.get("p") ?? "";
  const [poll, setPoll] = useState<PublicPoll | null | "none" | "error">(null);
  const [name, setName] = useState("");
  const [marks, setMarks] = useState<Record<string, Mark>>({});
  const [comment, setComment] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [sending, setSending] = useState(false);
  const configured = isShareConfigured();

  useEffect(() => {
    if (!configured || !id) return;
    let live = true;
    (async () => {
      try {
        const p = await getPoll(id);
        if (!live) return;
        setPoll(p ?? "none");
        const mine = p ? await myAnswer(id) : null;
        if (live && mine) {
          setName(mine.name);
          setMarks(mine.marks);
          setComment(mine.comment ?? "");
        }
      } catch {
        if (live) setPoll("error");
      }
    })();
    return () => {
      live = false;
    };
  }, [configured, id]);

  if (!configured) return <p className="text-[15px]">このページは準備中です。</p>;
  if (!id || poll === "none") return <p className="text-[15px]">この日程調整は見つかりません（消されたか、リンクが違います）。</p>;
  if (poll === "error") return <p className="text-[15px]">読み込めませんでした。通信を確かめて、開き直してください。</p>;
  if (poll === null) return <p className="text-[15px] text-ink-3">読み込み中…</p>;

  const today = todayStr();
  const closed = today > poll.closesAt;
  const send = async () => {
    const a = { name, marks, ...(comment.trim() ? { comment: comment.trim() } : {}) };
    const err = checkAnswer(a, poll, today);
    if (err) return setMsg({ ok: false, text: err });
    setSending(true);
    try {
      await putAnswer(id, a, poll.expiresAt);
      setMsg({ ok: true, text: "回答しました。この端末からなら、あとで直せます" });
    } catch {
      setMsg({ ok: false, text: "送れませんでした。通信を確かめて、もう一度お試しください（入力は残っています）" });
    } finally {
      setSending(false);
    }
  };
  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold break-words">{poll.title}</h1>
      <p className="text-[13px] text-ink-3">
        {formatDateJa(poll.closesAt, true)}まで回答できます。アカウントは要りません。回答（名前・○△×・一言）は Google の Firebase に置き、見られるのは調整を作った人とあなただけです。{formatDateJa(poll.expiresAt, true)} ごろに自動で消えます。
      </p>
      {closed ? (
        <p className="text-[15px] font-semibold">締め切りました。</p>
      ) : (
        <>
          <Field label="名前（表示名）" htmlFor="ans-name" hint={`${NAME_MAX}字まで。本名でなくてもかまいません`}>
            <input id="ans-name" value={name} maxLength={NAME_MAX} onChange={(e) => setName(e.target.value)} className={inputCls} />
          </Field>
          <ul className="divide-y divide-line border-y border-line">
            {poll.options.map((o) => (
              <li key={o.id} className="flex min-h-14 items-center justify-between gap-2">
                <span className="text-[15px] font-semibold">
                  {formatDateJa(o.date, true)}
                  {o.label && <span className="ml-1 text-[13px] text-ink-3">{o.label}</span>}
                </span>
                <span className="flex gap-1" role="radiogroup" aria-label={`${formatDateJa(o.date)}の都合`}>
                  {(["o", "m", "x"] as const).map((m) => (
                    <button
                      key={m}
                      type="button"
                      role="radio"
                      aria-checked={marks[o.id] === m}
                      onClick={() => setMarks((x) => ({ ...x, [o.id]: m }))}
                      className={`size-11 rounded-lg border text-[18px] font-bold ${marks[o.id] === m ? "border-brand bg-brand-soft text-brand" : "border-line text-ink-2"}`}
                    >
                      {MARK_LABEL[m]}
                    </button>
                  ))}
                </span>
              </li>
            ))}
          </ul>
          <Field label="一言" optional htmlFor="ans-comment" hint={`${COMMENT_MAX}字まで`}>
            <input id="ans-comment" value={comment} maxLength={COMMENT_MAX} onChange={(e) => setComment(e.target.value)} className={inputCls} />
          </Field>
          <Button className="w-full" onClick={send} disabled={sending}>
            {sending ? "送っています…" : "回答する"}
          </Button>
        </>
      )}
      {msg && (
        <p role={msg.ok ? "status" : "alert"} className={`text-[14px] font-medium ${msg.ok ? "text-brand" : "text-danger"}`}>
          {msg.text}
        </p>
      )}
    </div>
  );
}

export default function AnswerPage() {
  return (
    <main className="space-y-4 pt-4">
      <Suspense fallback={null}>
        <Inner />
      </Suspense>
    </main>
  );
}
