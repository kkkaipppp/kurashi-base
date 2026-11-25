"use client";

import dynamic from "next/dynamic";
import { useCallback, useMemo, useRef, useState } from "react";
import { useData, useStore, type TripInput } from "@/lib/store";
import { sumEntries, txEntries } from "@/lib/ledgerCore";
import { addDays, daysBetween, formatDateJa, isValidDateStr, todayStr } from "@/lib/date";
import { formatYen } from "@/lib/money";
import { eventsOnDay } from "@/lib/aggregate";
import { mapsDirections, webSearch } from "@/lib/externalLinks";
import { useUI } from "@/components/UIContext";
import { EventRow, TxRow } from "@/components/Rows";
import { OpenFromQuery } from "@/components/OpenFromQuery";
import { Sheet } from "@/components/Sheet";
import { Button, Card, Empty, Field, IconChevronL, IconChevronR, PageHeader, inputCls } from "@/components/ui";
import { IS_PERSONAL } from "@/lib/edition";
import { tripMemoCandidates } from "@/lib/tripMemo";
import type { Trip } from "@/lib/types";

const MAX_TRIP_DAYS = 60;
// 組み立てのときに決まる値を、このファイルの中で直接比べる（別ファイルの定数だと、公開版のビルドから自分用の部品の塊が取り除かれない）
const PERSONAL_BUILD = process.env.NEXT_PUBLIC_KB_EDITION === "personal";
// 旅行のコピー（自分用だけ。NEXT v21 X17）
const TripCopy = PERSONAL_BUILD ? dynamic(() => import("@/components/TripCopy").then((m) => m.TripCopy)) : null;

function tripStatus(t: Trip, today: string): string {
  if (today < t.startDate) {
    const d = daysBetween(today, t.startDate);
    return d === 1 ? "明日から" : `あと${d}日`;
  }
  if (today > t.endDate) return "終わった旅行";
  return "旅行中";
}

export default function TripsPage() {
  const data = useData();
  const today = todayStr();
  const trips = useMemo(() => data.trips ?? [], [data.trips]);
  const [openId, setOpenId] = useState<string | null>(null);
  const [form, setForm] = useState<{ mode: "new" } | { mode: "edit"; id: string } | null>(null);
  const open = openId ? trips.find((t) => t.id === openId) : undefined;

  const onOpen = useCallback((id: string) => (id === "new" ? setForm({ mode: "new" }) : setOpenId(id)), []);

  // これからの旅行を先に（近い順）、終わった旅行はあと（新しい順）
  const sorted = useMemo(() => {
    const coming = trips.filter((t) => t.endDate >= today).sort((a, b) => a.startDate.localeCompare(b.startDate));
    const past = trips.filter((t) => t.endDate < today).sort((a, b) => b.startDate.localeCompare(a.startDate));
    return [...coming, ...past];
  }, [trips, today]);

  return (
    <main className="space-y-3">
      <OpenFromQuery ids={[...trips.map((t) => t.id), "new"]} onOpen={onOpen} />
      {open ? (
        <TripDetail trip={open} onBack={() => setOpenId(null)} onEdit={() => setForm({ mode: "edit", id: open.id })} onOpenTrip={(id) => setOpenId(id)} />
      ) : (
        <>
          <PageHeader
            title="旅行"
            sub="旅行の日程と行程（移動・宿泊・観光など）をまとめます"
            right={
              <Button onClick={() => setForm({ mode: "new" })} className="min-h-10 px-3 text-[14px]">
                ＋ 旅行を追加
              </Button>
            }
          />
          {sorted.length === 0 ? (
            <Card>
              <Empty action={<Button onClick={() => setForm({ mode: "new" })}>旅行を追加する</Button>}>
                まだ旅行がありません。日程と行き先を入れると、日ごとの行程を作れます。
              </Empty>
            </Card>
          ) : (
            <ul className="space-y-2">
              {sorted.map((t) => {
                const n = data.events.filter((e) => e.tripId === t.id).length;
                return (
                  <li key={t.id}>
                    <button type="button" onClick={() => setOpenId(t.id)} className="w-full text-left">
                      <Card className={`flex items-center gap-3 hover:bg-surface-2 ${t.endDate < today ? "opacity-70" : ""}`}>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-[16px] font-bold">{t.title}</span>
                          <span className="block text-[13px] text-ink-2">
                            {formatDateJa(t.startDate)}〜{formatDateJa(t.endDate)}
                            {t.destination && `・${t.destination}`}
                          </span>
                          <span className="block text-[12px] text-ink-3">
                            {tripStatus(t, today)}・行程{n}件
                          </span>
                        </span>
                        <IconChevronR className="size-4 shrink-0 text-ink-3" />
                      </Card>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </>
      )}
      {form && (
        <TripForm
          key={form.mode === "edit" ? form.id : "new"}
          editing={form.mode === "edit" ? trips.find((t) => t.id === form.id) : undefined}
          onClose={() => setForm(null)}
          onSaved={(id) => {
            setForm(null);
            setOpenId(id);
          }}
          onDeleted={() => {
            setForm(null);
            setOpenId(null);
          }}
        />
      )}
    </main>
  );
}

/* ---------------- 旅行の詳細（日ごとの行程） ---------------- */

function TripDetail({ trip, onBack, onEdit, onOpenTrip }: { trip: Trip; onBack: () => void; onEdit: () => void; onOpenTrip: (id: string) => void }) {
  const [copying, setCopying] = useState(false);
  const data = useData();
  const ui = useUI();
  const today = todayStr();
  const [q, setQ] = useState(trip.destination ? `${trip.destination} 観光` : "");
  const evs = data.events.filter((e) => e.tripId === trip.id);
  const days: string[] = [];
  for (let d = trip.startDate; d <= trip.endDate && days.length < MAX_TRIP_DAYS; d = addDays(d, 1)) days.push(d);
  // 旅行の期間の外にある行程も、消さずに「期間の外」として出す
  const outside = evs.filter((e) => e.endDate < trip.startDate || e.startDate > trip.endDate);
  const costTotal = evs.reduce((s, e) => s + (e.cost ?? 0), 0);
  const directions = mapsDirections(trip.destination);
  const search = webSearch(q);
  // 自分用：旅行につないだ支出（100点化の指示 F。メモの文字ではなく旅行の ID でつなぐ）
  const linkedTx = IS_PERSONAL ? data.transactions.filter((t) => t.tripId === trip.id).sort((a, b) => b.date.localeCompare(a.date)) : [];
  const spentTotal = sumEntries(txEntries(linkedTx), () => true).expense; // 共通台帳の数え方（o11 A06）
  // 前の作り（メモに「旅行：名前」）で入れた支出は、候補として出して、本人が「つなぐ」を押したときだけつなぐ
  const memoCands = IS_PERSONAL ? tripMemoCandidates(data.transactions, trip) : [];

  return (
    <>
      <div className="flex items-center gap-1 pt-1">
        <button type="button" onClick={onBack} className="inline-flex min-h-11 items-center rounded-xl pr-2 text-[14px] font-semibold text-brand">
          <IconChevronL className="size-4" />
          旅行の一覧
        </button>
      </div>
      <Card>
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <h1 className="text-[20px] leading-snug font-bold break-words">{trip.title}</h1>
            <p className="text-[14px] text-ink-2">
              {formatDateJa(trip.startDate, true)}〜{formatDateJa(trip.endDate)}（{days.length}日間）
            </p>
            {trip.destination && <p className="text-[14px] text-ink-2">行き先：{trip.destination}</p>}
          </div>
          <Button variant="secondary" onClick={onEdit} className="min-h-10 shrink-0 px-3 text-[14px]">
            編集
          </Button>
        </div>
        {(trip.budget != null || costTotal > 0) && (
          <p className="num mt-2 text-[13px] text-ink-2">
            {trip.budget != null && <>予算 {formatYen(trip.budget)}　</>}
            {costTotal > 0 && <>行程の費用の目安 {formatYen(costTotal)}</>}
          </p>
        )}
        {IS_PERSONAL && (linkedTx.length > 0 || trip.budget != null) && (
          <p className="num mt-1 text-[13px] font-semibold text-ink-2">
            記録した支出 {formatYen(spentTotal)}
            {trip.budget != null && <span className={spentTotal > trip.budget ? "text-danger" : ""}>（予算の残り {formatYen(trip.budget - spentTotal)}）</span>}
          </p>
        )}
        {/* 旅行の支出をすぐ記録（レビュー o1 の P17）。公開版はメモに旅行の名前を入れるだけ、自分用は旅行の ID でつなぐ */}
        <button
          type="button"
          onClick={() =>
            ui.openTx({
              mode: "new",
              type: "expense",
              date: today >= trip.startDate && today <= trip.endDate ? today : trip.startDate,
              initial: IS_PERSONAL ? { tripId: trip.id } : { note: `旅行：${trip.title}` },
            })
          }
          className="mt-2 flex min-h-11 w-full items-center justify-center rounded-xl bg-brand-soft text-[14px] font-semibold text-brand"
        >
          ＋ この旅行の支出を追加
        </button>
        {trip.note && <p className="mt-2 text-[14px] whitespace-pre-wrap break-words">{trip.note}</p>}
        {TripCopy && (
          <>
            <button type="button" onClick={() => setCopying(true)} className="mt-2 flex min-h-11 w-full items-center justify-center rounded-xl border border-line text-[14px] font-semibold text-ink-2">
              この旅行を元に新しい旅行を作る
            </button>
            {copying && (
              <TripCopy
                trip={trip}
                onClose={() => setCopying(false)}
                onCreated={(id) => {
                  setCopying(false);
                  onOpenTrip(id);
                }}
              />
            )}
          </>
        )}
        <div className="mt-3 grid gap-2">
          {directions && (
            <a href={directions} target="_blank" rel="noopener noreferrer" className="flex min-h-11 items-center justify-center rounded-xl border border-line text-[14px] font-semibold text-brand hover:bg-brand-soft">
              行き先までの行き方を調べる（Googleマップ）
            </a>
          )}
          <div className="flex gap-2">
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="調べたいこと（例：京都 紅葉）" className={inputCls} aria-label="Webで調べる言葉" enterKeyHint="search" />
            {search ? (
              <a href={search} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 shrink-0 items-center rounded-xl bg-brand px-3 text-[14px] font-semibold text-brand-ink">
                Webで調べる
              </a>
            ) : (
              <span className="inline-flex min-h-11 shrink-0 items-center rounded-xl bg-surface-2 px-3 text-[14px] font-semibold text-ink-3" aria-disabled="true">
                Webで調べる
              </span>
            )}
          </div>
          <p className="text-[12px] text-ink-3">Google の検索結果が開きます。</p>
        </div>
      </Card>

      {IS_PERSONAL && (linkedTx.length > 0 || memoCands.length > 0) && <TripSpending trip={trip} linked={linkedTx} cands={memoCands} />}

      <h2 className="px-1 pt-1 text-[15px] font-bold">日ごとの行程</h2>
      {days.map((d, i) => {
        const list = eventsOnDay(evs, d);
        return (
          <Card key={d} className="py-3">
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-[14px] font-bold">
                {i + 1}日目<span className="ml-2 font-medium text-ink-2">{formatDateJa(d)}</span>
              </h3>
              <button
                type="button"
                onClick={() => ui.openEvent({ mode: "new", date: d, tripId: trip.id })}
                className="min-h-10 rounded-lg px-2 text-[13px] font-semibold text-brand hover:bg-brand-soft"
              >
                ＋ 行程を追加
              </button>
            </div>
            {list.length ? (
              <ul className="-mx-2">
                {list.map((e) => (
                  <EventRow key={e.id} ev={e} day={d} />
                ))}
              </ul>
            ) : (
              <p className="py-1 text-[13px] text-ink-3">まだ行程がありません</p>
            )}
          </Card>
        );
      })}
      {outside.length > 0 && (
        <Card className="py-3">
          <h3 className="text-[14px] font-bold text-warn">旅行の期間の外にある行程</h3>
          <p className="text-[12px] text-ink-3">旅行の日程を変えたため、期間の外になった予定です。押して日付を直せます。</p>
          <ul className="-mx-2">
            {outside.map((e) => (
              <EventRow key={e.id} ev={e} />
            ))}
          </ul>
        </Card>
      )}
    </>
  );
}

/* ---------------- 旅行の追加・編集 ---------------- */

function TripForm({ editing, onClose, onSaved, onDeleted }: { editing?: Trip; onClose: () => void; onSaved: (id: string) => void; onDeleted: () => void }) {
  const store = useStore();
  const data = useData();
  const ui = useUI();
  const initial = useMemo(
    () => ({
      title: editing?.title ?? "",
      startDate: editing?.startDate ?? todayStr(),
      endDate: editing?.endDate ?? todayStr(),
      destination: editing?.destination ?? "",
      budget: editing?.budget != null ? String(editing.budget) : "",
      note: editing?.note ?? "",
    }),
    [editing],
  );
  const [f, setF] = useState(initial);
  // 編集を始めたときの記録。保存の直前に今の記録と比べ、別のタブで変わっていたら上書きしない
  const editSnapshot = useRef(editing ? JSON.stringify(editing) : undefined);
  // 編集を始めた記録の ID。別のタブで消されても「追加」に化けず、削除されたと知らせる
  const editId = useRef(editing?.id);
  const [wasEditing] = useState(Boolean(editing)); // 見出し用（消されても「編集」のまま）
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saveError, setSaveError] = useState<string | null>(null);
  const lock = useRef(false);
  const dirty = JSON.stringify(f) !== JSON.stringify(initial);
  const set = (k: keyof typeof f, v: string) => {
    setF((x) => {
      const n = { ...x, [k]: v };
      if (k === "startDate" && n.endDate < v) n.endDate = v;
      return n;
    });
    if (errors[k]) setErrors((e) => ({ ...e, [k]: "" }));
  };

  const requestClose = async () => {
    if (dirty && !(await ui.confirm({ title: "入力内容を破棄しますか？", body: "保存していない変更は失われます。", ok: "破棄する", danger: true }))) return;
    onClose();
  };

  const save = async () => {
    if (lock.current) return;
    const e: Record<string, string> = {};
    if (!f.title.trim()) e.title = "旅行の名前を入力してください";
    if (!isValidDateStr(f.startDate)) e.startDate = "正しい開始日を入力してください";
    if (!isValidDateStr(f.endDate)) e.endDate = "正しい終了日を入力してください";
    if (!e.startDate && !e.endDate && f.endDate < f.startDate) e.endDate = "終了日は開始日以降にしてください";
    if (!e.startDate && !e.endDate && daysBetween(f.startDate, f.endDate) >= MAX_TRIP_DAYS) e.endDate = `旅行の期間は${MAX_TRIP_DAYS}日までにしてください`;
    const b = f.budget.replace(/[,，円\s]/g, "").normalize("NFKC");
    const budget = b === "" ? null : Number(b);
    if (budget !== null && (!Number.isInteger(budget) || budget < 0 || budget > 100_000_000)) e.budget = "予算は0以上の整数（円）で入力してください";
    if (Object.keys(e).length) return setErrors(e);
    lock.current = true;
    const input: TripInput = { title: f.title.trim(), startDate: f.startDate, endDate: f.endDate, destination: f.destination.trim(), budget, note: f.note.trim() };
    const r = await (editId.current ? store.updateTrip(editId.current, input, editSnapshot.current) : store.addTrip(input));
    if (!r.ok) {
      lock.current = false;
      return setSaveError(r.error);
    }
    ui.toast(editing ? "保存しました" : "旅行を追加しました");
    onSaved(editing ? editing.id : (r as { id?: string }).id ?? "");
  };

  const remove = async () => {
    if (!editing) return;
    const n = data.events.filter((x) => x.tripId === editing.id).length;
    const ok = await ui.confirm({
      title: "この旅行を削除しますか？",
      body: `${editing.title}\n行程の予定${n}件と、記録した支出は消えません（予定は旅行から外れて、カレンダーに残ります）。`,
      ok: "削除する",
      danger: true,
    });
    if (!ok) return;
    const r = await store.deleteTrip(editing.id);
    if (!r.ok) return ui.toast(r.error, "error");
    ui.toast("旅行を削除しました");
    onDeleted();
  };

  return (
    <Sheet
      title={wasEditing ? "旅行を編集" : "旅行を追加"}
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
      <form
        className="space-y-4"
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          save();
        }}
      >
        <Field label="旅行の名前" htmlFor="tr-title" error={errors.title}>
          <input id="tr-title" value={f.title} onChange={(e) => set("title", e.target.value)} placeholder="例：京都旅行" className={inputCls} maxLength={60} aria-invalid={!!errors.title} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="開始日" htmlFor="tr-sd" error={errors.startDate}>
            <input id="tr-sd" type="date" value={f.startDate} onChange={(e) => set("startDate", e.target.value)} className={inputCls} aria-invalid={!!errors.startDate} />
          </Field>
          <Field label="終了日" htmlFor="tr-ed" error={errors.endDate}>
            <input id="tr-ed" type="date" value={f.endDate} onChange={(e) => set("endDate", e.target.value)} className={inputCls} aria-invalid={!!errors.endDate} />
          </Field>
        </div>
        <Field label="行き先" optional htmlFor="tr-dest">
          <input id="tr-dest" value={f.destination} onChange={(e) => set("destination", e.target.value)} placeholder="例：京都" className={inputCls} maxLength={60} />
        </Field>
        <Field label="予算（円）" optional htmlFor="tr-budget" error={errors.budget}>
          <input id="tr-budget" inputMode="numeric" value={f.budget} onChange={(e) => set("budget", e.target.value)} placeholder="例：50000" className={inputCls} maxLength={12} aria-invalid={!!errors.budget} />
        </Field>
        <Field label="メモ" optional htmlFor="tr-note">
          <textarea id="tr-note" rows={2} value={f.note} onChange={(e) => set("note", e.target.value)} className={inputCls} maxLength={500} />
        </Field>
        <p className="text-[12px] text-ink-3">予約番号などの個人情報は、必要なときだけメモに入れてください（記録はこの端末の中だけに保存されます）。</p>
        {saveError && (
          <p role="alert" className="rounded-xl bg-expense-soft px-3 py-2 text-[14px] font-medium text-danger">
            {saveError}（入力した内容は残っています）
          </p>
        )}
        <button type="submit" hidden aria-hidden="true" tabIndex={-1} />
      </form>
    </Sheet>
  );
}

/* ---------------- 旅行の支出（自分用。100点化の指示 F） ---------------- */

function TripSpending({ trip, linked, cands }: { trip: Trip; linked: import("@/lib/types").Transaction[]; cands: import("@/lib/types").Transaction[] }) {
  const store = useStore();
  const ui = useUI();
  const link = async () => {
    const list = cands
      .slice(0, 6)
      .map((t) => `・${formatDateJa(t.date)} ${formatYen(t.amount)} ${t.merchant}`.trimEnd())
      .join("\n");
    const ok = await ui.confirm({
      title: `${cands.length}件をこの旅行につなぎますか？`,
      body: `メモに「旅行：${trip.title}」があり、旅行の期間の前後7日の支出です。\n${list}${cands.length > 6 ? `\nほか${cands.length - 6}件` : ""}\nつなぐと、この旅行の支出として数えます（メモはそのまま残します）。`,
      ok: "つなぐ",
    });
    if (!ok) return;
    const r = await store.setTxTrip(cands.map((t) => t.id), trip.id);
    ui.toast(r.ok ? `${cands.length}件をつなぎました` : r.error, r.ok ? "ok" : "error");
  };
  return (
    <Card>
      <h2 className="text-[15px] font-bold">
        この旅行の支出<span className="ml-1 text-[13px] font-medium text-ink-3">{linked.length}件</span>
      </h2>
      {cands.length > 0 && (
        <div className="mt-2 rounded-xl bg-warn-soft p-3">
          <p className="text-[13px] text-warn">メモに「旅行：{trip.title}」がある支出が{cands.length}件あります（まだつないでいません）。</p>
          <Button variant="secondary" className="mt-2 w-full" onClick={link}>
            {cands.length}件をこの旅行につなぐ
          </Button>
        </div>
      )}
      {linked.length > 0 && (
        <ul className="-mx-2 mt-1">
          {linked.slice(0, 20).map((t) => (
            <TxRow key={t.id} tx={t} showDate />
          ))}
        </ul>
      )}
      {linked.length > 20 && <p className="mt-1 text-[12px] text-ink-3">ほか{linked.length - 20}件（取引履歴で見られます）</p>}
    </Card>
  );
}
