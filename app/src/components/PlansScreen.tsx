"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Button, Empty, Field, IconChevronR, PageHeader, inputCls } from "@/components/ui";
import { useUI } from "@/components/UIContext";
import { useData, useStore } from "@/lib/store";
import { newId } from "@/lib/defaults";
import { formatDateJa, isValidDateStr, todayStr } from "@/lib/date";
import { formatYen, parseAmount } from "@/lib/money";
import { safeExternalLink } from "@/lib/externalLinks";
import { categoryMap, txIsInvest } from "@/lib/classify";
import {
  PLAN_STATUS_LABEL,
  PLAN_TYPES,
  PLAN_TYPE_LABEL,
  addCandidate,
  addPlan,
  addPlanEvent,
  planEventError,
  setPlanDate,
  candidateNoun,
  chooseCandidate,
  deletePlan,
  linkToPlan,
  planView,
  removeCandidate,
  renamePlan,
  sortPlans,
  updatePlan,
} from "@/lib/plan";
import type { AppData, Plan, PlanStatus, PlanType } from "@/lib/types";

/**
 * 計画（To-Be 2026-11-27 02「計画」・05「計画を作る／次にやること／日程を決める…」）。
 * 予定・やること・支出は、それぞれの記録が正本で、ここでは計画につないだものを集めて見せる。
 * みんなに回答してもらうリンク（日程調整・アンケート）は、共有の仕組みが無いのでまだ出さない（To-Be 03：成立しなければ隠す）
 */
export function PlansScreen() {
  const data = useData();
  const [openId, setOpenId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  // 検索・ホームから ?id= で開く
  useEffect(() => {
    const q = new URLSearchParams(location.search);
    const id = q.get("open") ?? q.get("id");
    if (id) setOpenId(id); // eslint-disable-line react-hooks/set-state-in-effect
  }, []);

  const plan = openId ? (data.plans ?? []).find((p) => p.id === openId) : undefined;
  if (openId && plan) return <PlanDetail plan={plan} onBack={() => setOpenId(null)} />;
  if (creating) return <PlanCreate onDone={(id) => { setCreating(false); if (id) setOpenId(id); }} />;

  const { active, past } = sortPlans(data.plans ?? []);
  const linkedTrips = new Set((data.plans ?? []).map((p) => p.tripId).filter(Boolean));
  const trips = (data.trips ?? []).filter((t) => t.endDate >= todayStr() && !linkedTrips.has(t.id));
  return (
    <main className="space-y-5">
      <PageHeader title="計画" right={<Button onClick={() => setCreating(true)}>計画を作る</Button>} />
      {active.length === 0 && trips.length === 0 ? (
        <Empty action={<Button onClick={() => setCreating(true)}>計画を作る</Button>}>まだ計画がありません</Empty>
      ) : (
        <ul className="divide-y divide-line border-y border-line">
          {active.map((p) => (
            <PlanRow key={p.id} p={p} onOpen={() => setOpenId(p.id)} />
          ))}
          {trips.map((t) => (
            <li key={t.id}>
              <Link href={`/trips?open=${t.id}`} className="flex min-h-14 items-center gap-3 py-2">
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[16px] font-semibold">{t.title}</span>
                  <span className="block text-[13px] text-ink-3">旅行・{formatDateJa(t.startDate)}〜{formatDateJa(t.endDate)}</span>
                </span>
                <IconChevronR className="size-4 shrink-0 text-ink-3" />
              </Link>
            </li>
          ))}
        </ul>
      )}
      {past.length > 0 && (
        <details>
          <summary className="flex min-h-11 cursor-pointer items-center text-[14px] font-semibold text-ink-3">過去の計画（{past.length}件）</summary>
          <ul className="divide-y divide-line border-y border-line">
            {past.map((p) => (
              <PlanRow key={p.id} p={p} onOpen={() => setOpenId(p.id)} />
            ))}
          </ul>
        </details>
      )}
    </main>
  );
}

function PlanRow({ p, onOpen }: { p: Plan; onOpen: () => void }) {
  return (
    <li>
      <button type="button" onClick={onOpen} className="flex min-h-14 w-full items-center gap-3 py-2 text-left">
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[16px] font-semibold">{p.title}</span>
          <span className="block text-[13px] text-ink-3">
            {PLAN_TYPE_LABEL[p.type]}・{p.date ? formatDateJa(p.date) : "日程未定"}・{PLAN_STATUS_LABEL[p.status]}
          </span>
        </span>
        <IconChevronR className="size-4 shrink-0 text-ink-3" />
      </button>
    </li>
  );
}

function PlanCreate({ onDone }: { onDone: (id: string | null) => void }) {
  const store = useStore();
  const ui = useUI();
  const [type, setType] = useState<PlanType | null>(null);
  const [title, setTitle] = useState("");
  const [error, setError] = useState<string | null>(null);
  if (!type)
    return (
      <main className="space-y-4">
        <PageHeader title="計画を作る" onBack={() => onDone(null)} minimal />
        <ul className="divide-y divide-line border-y border-line">
          {PLAN_TYPES.map((t) => (
            <li key={t.type}>
              <button type="button" onClick={() => setType(t.type)} className="flex min-h-14 w-full items-center gap-3 py-2 text-left">
                <span className="min-w-0 flex-1">
                  <span className="block text-[16px] font-semibold">{t.label}</span>
                  <span className="block text-[13px] text-ink-3">{t.hint}</span>
                </span>
                <IconChevronR className="size-4 shrink-0 text-ink-3" />
              </button>
            </li>
          ))}
        </ul>
      </main>
    );
  const save = async () => {
    const name = title.trim();
    if (!name) return setError("名前を入れてください");
    const id = newId("pl");
    const r = await store.commit((d) => addPlan(d, { type, title: name, date: "", budget: null, note: "" }, id, new Date().toISOString()));
    if (!r.ok) return setError(`保存できませんでした（${r.error}）。入力した名前は残っています`);
    ui.toast(`計画「${name}」を作りました`);
    onDone(id);
  };
  return (
    <main className="space-y-4">
      <PageHeader title={PLAN_TYPE_LABEL[type]} onBack={() => setType(null)} minimal />
      <Field label="計画の名前" htmlFor="plan-title" error={error ?? undefined}>
        <input id="plan-title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder={type === "gathering" ? "例：忘年会" : type === "trip" ? "例：京都旅行" : ""} className={inputCls} aria-invalid={!!error} maxLength={100} />
      </Field>
      <Button onClick={save} className="w-full">
        作る
      </Button>
    </main>
  );
}

function PlanDetail({ plan, onBack }: { plan: Plan; onBack: () => void }) {
  const data = useData();
  const store = useStore();
  const ui = useUI();
  const v = planView(data, plan);
  const ts = () => new Date().toISOString();
  const save = async (fn: Parameters<typeof store.commit>[0], ok?: string, extra?: (cur: AppData) => string | null) => {
    // 開いている計画が、ほかのタブで消されていたら保存しない。extra は、保存の列の中で最新のデータに対して確かめること
    const r = await store.commit(fn, { check: (cur) => ((cur.plans ?? []).some((p) => p.id === plan.id) ? (extra?.(cur) ?? null) : "この計画は、ほかのタブなどで削除されています") });
    if (!r.ok) {
      ui.toast(`保存できませんでした（${r.error}）`, "error");
      return false;
    }
    if (ok) ui.toast(ok);
    return true;
  };
  const [task, setTask] = useState("");
  const [cand, setCand] = useState({ label: "", url: "", price: "" });
  const [candErr, setCandErr] = useState<string | null>(null);
  const noun = candidateNoun(plan.type);
  const trip = plan.tripId ? (data.trips ?? []).find((t) => t.id === plan.tripId) : undefined;
  const cats = categoryMap(data);
  const unlinkedExpenses = data.transactions
    .filter((t) => t.type === "expense" && !t.planId && !t.refundOf && t.countAs !== "transfer" && !txIsInvest(t, cats) && !(plan.tripId && t.tripId === plan.tripId))
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, 30);

  return (
    <main className="space-y-6">
      {/* 戻るは見出しの左の1つだけ（押すと計画の一覧へ。2026-11-28 洗い出し 1） */}
      <PageHeader title={plan.title} sub={<p className="truncate text-[13px] text-ink-3">{PLAN_TYPE_LABEL[plan.type]}</p>} onBack={onBack} minimal />

      <Field label="計画の名前" htmlFor="pl-title">
        <input
          id="pl-title"
          key={`t-${plan.updatedAt}`}
          defaultValue={plan.title}
          maxLength={100}
          onBlur={(e) => {
            const name = e.target.value.trim();
            if (!name) {
              e.target.value = plan.title;
              return ui.toast("計画の名前を入れてください", "error");
            }
            if (name !== plan.title) void save((d) => renamePlan(d, plan.id, name, ts()), "名前を変えました");
          }}
          className={inputCls}
        />
      </Field>

      <section aria-labelledby="pl-state" className="grid grid-cols-2 gap-3">
        <h2 id="pl-state" className="sr-only">
          状態と日にち
        </h2>
        <Field label="状態" htmlFor="pl-status">
          <select id="pl-status" value={plan.status} onChange={(e) => void save((d) => updatePlan(d, plan.id, { status: e.target.value as PlanStatus }, ts()))} className={inputCls}>
            {(Object.keys(PLAN_STATUS_LABEL) as PlanStatus[]).map((s) => (
              <option key={s} value={s}>
                {PLAN_STATUS_LABEL[s]}
              </option>
            ))}
          </select>
        </Field>
        <Field label="日にち" htmlFor="pl-date" hint={plan.date ? undefined : "日程未定"}>
          <input
            id="pl-date"
            key={`d-${plan.updatedAt}`}
            type="date"
            defaultValue={plan.date}
            onBlur={(e) => {
              const v2 = e.target.value;
              if (v2 !== "" && !isValidDateStr(v2)) return;
              if (v2 !== plan.date) void save((d) => setPlanDate(d, plan.id, v2, ts()), v.events.length ? "日にちと、つないだ予定の日を変えました" : undefined);
            }}
            className={inputCls}
          />
        </Field>
      </section>

      {plan.date && !v.events.length && (
        <Button
          variant="secondary"
          className="w-full"
          onClick={() =>
            void save((d) => addPlanEvent(d, plan, newId("ev"), ts()), `${formatDateJa(plan.date)}の予定に入れました`, (cur) => planEventError(cur, plan.id))
          }
        >
          {formatDateJa(plan.date)}の予定に入れる
        </Button>
      )}

      {v.events.length > 0 && (
        <ul aria-label="この計画の予定" className="divide-y divide-line border-y border-line">
          {v.events.map((e) => (
            <li key={e.id}>
              <Link href={`/calendar?d=${e.startDate}`} className="flex min-h-12 items-center gap-2 text-[15px]">
                <span className="text-[13px] text-ink-3">予定</span>
                <span className="min-w-0 flex-1 truncate">
                  {formatDateJa(e.startDate)}
                  {e.allDay ? "" : ` ${e.startTime}`} {e.title}
                </span>
                <IconChevronR className="size-4 shrink-0 text-ink-3" />
              </Link>
            </li>
          ))}
        </ul>
      )}

      <section aria-labelledby="pl-next">
        <h2 id="pl-next" className="mb-1 text-[16px] font-bold">
          次にやること
        </h2>
        {v.tasks.length > 0 && (
          <ul className="divide-y divide-line border-y border-line">
            {[...v.next, ...v.tasks.filter((t) => t.done)].map((t) => (
              <li key={t.id} className="flex min-h-12 items-center gap-3">
                <input
                  id={`pt-${t.id}`}
                  type="checkbox"
                  checked={t.done}
                  onChange={() => void save((d) => ({ ...d, tasks: d.tasks.map((x) => (x.id === t.id ? { ...x, done: !x.done, updatedAt: ts() } : x)) }))}
                  className="size-5"
                />
                <label htmlFor={`pt-${t.id}`} className={`min-w-0 flex-1 text-[15px] ${t.done ? "text-ink-3 line-through" : ""}`}>
                  {t.title}
                  {t.due && <span className="ml-2 text-[13px] text-ink-3">{formatDateJa(t.due)}まで</span>}
                </label>
              </li>
            ))}
          </ul>
        )}
        <form
          className="mt-2 flex gap-2"
          onSubmit={async (e) => {
            e.preventDefault();
            const name = task.trim();
            if (!name) return;
            const ok = await save((d) => ({ ...d, tasks: [...d.tasks, { id: newId("tk"), title: name.slice(0, 100), due: "", done: false, note: "", planId: plan.id, createdAt: ts(), updatedAt: ts() }] }));
            if (ok) setTask("");
          }}
        >
          <label htmlFor="pl-task" className="sr-only">
            やることを追加
          </label>
          <input id="pl-task" value={task} onChange={(e) => setTask(e.target.value)} placeholder={plan.type === "gathering" ? "例：お店を予約する" : "やることを追加"} className={inputCls} />
          <Button type="submit" variant="secondary" className="shrink-0">
            追加
          </Button>
        </form>
      </section>

      {plan.type === "trip" && (
        <section aria-labelledby="pl-trip">
          <h2 id="pl-trip" className="mb-1 text-[16px] font-bold">
            旅行の日程
          </h2>
          {trip ? (
            <Link href={`/trips?open=${trip.id}`} className="flex min-h-12 items-center justify-between border-y border-line text-[15px]">
              {trip.title}（{formatDateJa(trip.startDate)}〜{formatDateJa(trip.endDate)}）
              <IconChevronR className="size-4 text-ink-3" />
            </Link>
          ) : (
            <Field label="旅行の記録をつなぐ" htmlFor="pl-tripid" hint="旅程・移動・宿は「旅行」の画面で入れます">
              <select id="pl-tripid" value="" onChange={(e) => {
                const id = e.target.value;
                if (!id) return;
                // ほかのタブで旅行が消されていたら、つながない（点検 高-1）
                void save((d) => updatePlan(d, plan.id, { tripId: id }, ts()), "旅行をつなぎました", (cur) => ((cur.trips ?? []).some((t) => t.id === id) ? null : "この旅行は、ほかのタブなどで削除されています"));
              }} className={inputCls}>
                <option value="">選ぶ</option>
                {(data.trips ?? []).map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.title}（{formatDateJa(t.startDate)}）
                  </option>
                ))}
              </select>
            </Field>
          )}
        </section>
      )}

      <section aria-labelledby="pl-cand">
        <h2 id="pl-cand" className="mb-1 text-[16px] font-bold">
          {noun}を比べる
        </h2>
        {(plan.candidates ?? []).length > 0 && (
          <ul className="divide-y divide-line border-y border-line">
            {(plan.candidates ?? []).map((c) => {
              const href = c.url ? safeExternalLink(c.url) : null;
              return (
                <li key={c.id} className="flex min-h-12 items-center gap-2 py-1">
                  <span className="min-w-0 flex-1">
                    <span className="block text-[15px] font-semibold">
                      {c.chosen && <span className="mr-1 text-brand">決定</span>}
                      {href ? (
                        <a href={href} target="_blank" rel="noopener noreferrer" className="underline">
                          {c.label}
                        </a>
                      ) : (
                        c.label
                      )}
                    </span>
                    {c.price !== null && <span className="num block text-[13px] text-ink-3">目安 {formatYen(c.price)}</span>}
                  </span>
                  <Button variant={c.chosen ? "primary" : "secondary"} className="shrink-0 px-3 text-[14px]" aria-pressed={!!c.chosen} onClick={() => void save((d) => chooseCandidate(d, plan.id, c.id, ts()))}>
                    {c.chosen ? "決定を取り消す" : "これに決める"}
                  </Button>
                  <Button
                    variant="ghost"
                    className="shrink-0 px-2 text-[14px]"
                    aria-label={`${c.label}を候補から外す`}
                    onClick={() => void save((d) => removeCandidate(d, plan.id, c.id, ts()))}
                  >
                    外す
                  </Button>
                </li>
              );
            })}
          </ul>
        )}
        <form
          className="mt-2 space-y-2"
          onSubmit={async (e) => {
            e.preventDefault();
            const label = cand.label.trim();
            if (!label) return setCandErr(`${noun}の名前を入れてください`);
            const url = cand.url.trim();
            if (url && !safeExternalLink(url)) return setCandErr("URL は http:// か https:// で始まるものを入れてください");
            let price: number | null = null;
            if (cand.price.trim()) {
              const a = parseAmount(cand.price);
              if (!a.ok) return setCandErr(a.error);
              price = a.value;
            }
            setCandErr(null);
            const ok = await save((d) => addCandidate(d, plan.id, { label: label.slice(0, 100), url, price, note: "" }, newId("pc"), ts()));
            if (ok) setCand({ label: "", url: "", price: "" });
          }}
        >
          <Field label={`${noun}の名前`} htmlFor="pc-label" error={candErr ?? undefined}>
            <input id="pc-label" value={cand.label} onChange={(e) => setCand({ ...cand, label: e.target.value })} className={inputCls} aria-invalid={!!candErr} />
          </Field>
          <div className="grid grid-cols-2 gap-2">
            <Field label="URL" htmlFor="pc-url" optional>
              <input id="pc-url" inputMode="url" value={cand.url} onChange={(e) => setCand({ ...cand, url: e.target.value })} className={inputCls} />
            </Field>
            <Field label="目安の金額" htmlFor="pc-price" optional>
              <input id="pc-price" inputMode="numeric" value={cand.price} onChange={(e) => setCand({ ...cand, price: e.target.value })} className={inputCls} />
            </Field>
          </div>
          <Button type="submit" variant="secondary" className="w-full">
            候補に入れる
          </Button>
        </form>
      </section>

      <section aria-labelledby="pl-money">
        <h2 id="pl-money" className="mb-1 text-[16px] font-bold">
          お金
        </h2>
        <dl className="grid grid-cols-3 gap-2 text-center">
          <div>
            <dt className="text-[13px] text-ink-3">予算（見込み）</dt>
            <dd className="num text-[16px] font-semibold">{plan.budget === null ? "未設定" : formatYen(plan.budget)}</dd>
          </div>
          <div>
            <dt className="text-[13px] text-ink-3">かかったお金</dt>
            <dd className="num text-[16px] font-semibold">{formatYen(v.spent)}</dd>
          </div>
          <div>
            <dt className="text-[13px] text-ink-3">残り</dt>
            <dd className={`num text-[16px] font-semibold ${v.left !== null && v.left < 0 ? "text-danger" : ""}`}>{v.left === null ? "—" : formatYen(v.left)}</dd>
          </div>
        </dl>
        <p className="mt-1 text-[13px] text-ink-3">予算は見込みで、家計簿の支出には入りません。</p>
        <Field label="予算（見込み）" htmlFor="pl-budget" optional>
          <input
            id="pl-budget"
            key={`b-${plan.updatedAt}`}
            inputMode="numeric"
            defaultValue={plan.budget === null ? "" : String(plan.budget)}
            onBlur={(e) => {
              const raw = e.target.value.trim();
              if (raw === "") {
                if (plan.budget !== null) void save((d) => updatePlan(d, plan.id, { budget: null }, ts()));
                return;
              }
              const a = parseAmount(raw);
              if (!a.ok) {
                e.target.value = plan.budget === null ? "" : String(plan.budget);
                return ui.toast(a.error, "error");
              }
              e.target.value = String(a.value);
              if (a.value !== plan.budget) void save((d) => updatePlan(d, plan.id, { budget: a.value }, ts()));
            }}
            className={inputCls}
          />
        </Field>
        {v.transactions.length > 0 && (
          <ul className="mt-2 divide-y divide-line border-y border-line">
            {v.transactions.map((t) => (
              <li key={t.id} className="flex min-h-12 items-center gap-2 text-[15px]">
                <span className="min-w-0 flex-1 truncate">
                  {formatDateJa(t.date)} {t.merchant || "支出"}
                </span>
                <span className="num">{formatYen(t.amount)}</span>
                {v.uncounted.has(t.id) && <span className="text-[12px] text-ink-3">数えない</span>}
                {v.viaTrip.has(t.id) ? (
                  <span className="px-2 text-[12px] text-ink-3">旅行から</span>
                ) : (
                  <Button variant="ghost" className="px-2 text-[14px]" aria-label={`${t.merchant || "支出"}をこの計画から外す`} onClick={() => void save((d) => linkToPlan(d, "transaction", t.id, null, ts()))}>
                    外す
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}
        {unlinkedExpenses.length > 0 && (
          <Field label="支出の記録をつなぐ" htmlFor="pl-tx" hint="家計簿に記録した支出から選びます（新しい順に30件）">
            <select id="pl-tx" value="" onChange={(e) => e.target.value && void save((d) => linkToPlan(d, "transaction", e.target.value, plan.id, ts()), "支出をつなぎました")} className={inputCls}>
              <option value="">選ぶ</option>
              {unlinkedExpenses.map((t) => (
                <option key={t.id} value={t.id}>
                  {formatDateJa(t.date)} {t.merchant || "支出"} {formatYen(t.amount)}
                </option>
              ))}
            </select>
          </Field>
        )}
      </section>

      <Field label="メモ" htmlFor="pl-note" optional>
        <textarea
          id="pl-note"
          key={`n-${plan.updatedAt}`}
          defaultValue={plan.note}
          rows={3}
          onBlur={(e) => e.target.value !== plan.note && void save((d) => updatePlan(d, plan.id, { note: e.target.value.slice(0, 2000) }, ts()))}
          className={inputCls}
        />
      </Field>

      <Button
        variant="danger"
        className="w-full"
        onClick={async () => {
          const yes = await ui.confirm({ title: `計画「${plan.title}」を削除しますか？`, body: "つないだ予定・やること・支出の記録は消えません。計画とのつながりだけを外します。", ok: "削除", danger: true });
          if (!yes) return;
          const r = await store.commit((d) => deletePlan(d, plan.id));
          if (!r.ok) return ui.toast(`削除できませんでした（${r.error}）`, "error");
          ui.toast(`計画「${plan.title}」を削除しました`);
          onBack();
        }}
      >
        この計画を削除
      </Button>
    </main>
  );
}
