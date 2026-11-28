"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Sheet } from "./Sheet";
import { useNavPrefs } from "./useNavPrefs";
import { formatDateJa, todayStr } from "@/lib/date";
import { ADD_KINDS, addOrder, type AddKindId } from "@/lib/navPrefs";
import { useMemo, useState } from "react";
import { useData } from "@/lib/store";
import { formatYen } from "@/lib/money";
import { recentTemplates, type TxTemplate } from "@/lib/txTemplates";
import { PASTE_MAX, parsePasted, type PasteGuess } from "@/lib/pasteParse";

/** 日付を入力の初めの値に使う種類（ほかは日付を出さない。点検 指摘3） */
const USES_DATE: AddKindId[] = ["expense", "income", "event", "task", "note"];
/** 各画面の新規入力（?open=new）で開く種類 */
const ROUTE: Partial<Record<AddKindId, string>> = { task: "/tasks", study: "/study", goal: "/goals", note: "/notes", trip: "/trips" };

/**
 * 自分用の「追加」の一覧（UIContext から出す。右端の「追加」・カレンダーの「この日に追加」・?add=choose で同じ一覧）。
 * 支出・収入・予定は入力のシートを開き、ほかは各画面の新規入力へ（選んだ日を引き継ぐ）
 */
export function PersonalAddSheet({
  date,
  onClose,
  openTx,
  openEvent,
}: {
  date?: string;
  onClose: () => void;
  openTx: (type: "expense" | "income", date?: string, initial?: { amount?: string; categoryId?: string; merchant?: string; paymentMethod?: string; note?: string; countAs?: "life" | "invest" }, oneShot?: boolean) => void;
  openEvent: (date?: string, prefill?: { title: string; time?: string; url?: string; note?: string }) => void;
}) {
  const path = usePathname();
  const router = useRouter();
  const { fav } = useNavPrefs();
  const data = useData();
  const templates = useMemo(() => recentTemplates(data.transactions), [data.transactions]);
  const catName = (id: string) => data.categories.find((c) => c.id === id)?.name ?? "";
  // 前の記録から：同じ中身で入力を始める（日付は選んだ日。保存は入力の中で本人が押したとき）
  const fromTemplate = (t: TxTemplate) => {
    onClose();
    openTx(t.type, date, { amount: String(t.amount), categoryId: t.categoryId, merchant: t.merchant, paymentMethod: t.paymentMethod, ...(t.countAs ? { countAs: t.countAs } : {}) });
  };
  const pick = (k: AddKindId) => {
    onClose();
    if (k === "expense" || k === "income") return openTx(k, date);
    if (k === "event") return openEvent(date);
    const useDate = USES_DATE.includes(k) && date && date !== todayStr();
    router.push(`${ROUTE[k]}?open=new${useDate ? `&date=${date}` : ""}`);
  };
  // 貼り付けから：候補を入力の初めの値に入れて開くだけ（保存は入力の中で本人が押したとき。URL は開かない・送らない）
  const fromPaste = (kind: "event" | "expense", g: PasteGuess) => {
    onClose();
    if (kind === "event") return openEvent(g.date ?? date, { title: g.title ?? "", ...(g.time ? { time: g.time } : {}), ...(g.url ? { url: g.url } : {}) });
    // 支出は過去の日付で読む（来年にしない）。店名は1行目を入れない（お知らせの題名などが入るため）
    openTx("expense", g.pastDate ?? date, { amount: g.amount ? String(g.amount) : "", note: g.url ?? "" }, true);
  };
  return (
    <AddSheet path={path} date={date} fav={fav} onClose={onClose} onPick={pick}>
      <PastePanel onStart={fromPaste} />
      {templates.length > 0 && (
        <>
          <h3 className="mt-4 mb-1 text-[14px] font-semibold text-ink-3">前の記録から</h3>
          <ul className="divide-y divide-line border-y border-line" aria-label="前の記録から入力を始める">
            {templates.map((t) => (
              <li key={t.key}>
                <button type="button" onClick={() => fromTemplate(t)} className="flex min-h-12 w-full items-center gap-3 px-1 text-left hover:bg-surface-2">
                  <span className="min-w-0 flex-1 truncate text-[15px]">
                    {t.merchant || catName(t.categoryId) || (t.type === "expense" ? "支出" : "収入")}
                    {t.merchant && catName(t.categoryId) && <span className="ml-1 text-[13px] text-ink-3">{catName(t.categoryId)}</span>}
                  </span>
                  <span className={`num shrink-0 text-[15px] ${t.type === "expense" ? "text-expense" : "text-income"}`}>
                    {t.type === "expense" ? "−" : "+"}
                    {formatYen(t.amount)}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
    </AddSheet>
  );
}

/** 年まで出す（年の無い日付を来年・去年とみなしたことが見えるように） */
const ymd = (iso: string) => `${Number(iso.slice(0, 4))}年${formatDateJa(iso)}`;

/** 文章・URL を貼り付けて、予定か支出の入力を始める（To-Be 02 ＋「文章・URL」。自分用） */
function PastePanel({ onStart }: { onStart: (kind: "event" | "expense", g: PasteGuess) => void }) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [guess, setGuess] = useState<PasteGuess | null>(null);
  if (!open)
    return (
      <button type="button" onClick={() => setOpen(true)} className="mt-4 flex min-h-12 w-full items-center rounded-xl border border-line px-3 text-left text-[15px] hover:bg-surface-2">
        文章・URL を貼り付けて始める
      </button>
    );
  const read = () => setGuess(parsePasted(text, todayStr()));
  const g = guess;
  return (
    <section className="mt-4 rounded-xl border border-line p-3" aria-label="文章・URL を貼り付けて始める">
      <label htmlFor="paste-text" className="block text-[14px] font-semibold text-ink-3">
        文章・URL（LINE やメールの文など）
      </label>
      <textarea
        id="paste-text"
        value={text}
        maxLength={PASTE_MAX}
        rows={4}
        onChange={(e) => {
          setText(e.target.value);
          setGuess(null);
        }}
        className="mt-1 w-full rounded-lg border border-line bg-surface px-3 py-2 text-[16px]"
      />
      <p className="mt-1 text-[13px] text-ink-3">読み取るのはこの端末の中だけ。URL は開きません。</p>
      <button type="button" onClick={read} disabled={!text.trim()} className="mt-2 min-h-11 w-full rounded-lg bg-brand px-3 text-[15px] font-semibold text-brand-ink disabled:opacity-40">
        読み取る
      </button>
      <div className="mt-3 space-y-2" aria-live="polite">
      {g && (
        <>
          {!g.date && !g.time && !g.amount && !g.url ? (
            <p className="text-[14px]">日付・金額・URL が見つかりませんでした。下の一覧から手で入力してください。</p>
          ) : (
            <>
              <dl className="grid grid-cols-[5em_1fr] gap-x-2 gap-y-1 text-[14px]">
                <dt className="text-ink-3">名前</dt>
                <dd className="min-w-0 break-words">{g.title ?? "読めませんでした"}</dd>
                <dt className="text-ink-3">日にち</dt>
                <dd>{g.date ? `${ymd(g.date)}${g.time ? ` ${g.time}` : ""}` : "読めませんでした（選んだ日が入ります）"}</dd>
                {g.pastDate && g.pastDate !== g.date && (
                  <>
                    <dt className="text-ink-3">支出なら</dt>
                    <dd>{ymd(g.pastDate)}</dd>
                  </>
                )}
                <dt className="text-ink-3">金額</dt>
                <dd>{g.amount ? `${formatYen(g.amount)}${g.amountConfidence === "low" ? "（自信がありません）" : ""}` : "読めませんでした"}</dd>
                {g.url && (
                  <>
                    <dt className="text-ink-3">URL</dt>
                    <dd className="min-w-0 break-all">{g.url}</dd>
                  </>
                )}
              </dl>
              <p className="text-[13px] text-ink-3">押すと入力の画面が開きます。確かめてから保存してください。</p>
              <div className="grid grid-cols-2 gap-2">
                <button type="button" onClick={() => onStart("event", g)} className="min-h-11 rounded-lg border border-line px-2 text-[15px] hover:bg-surface-2">
                  予定として
                </button>
                <button type="button" onClick={() => onStart("expense", g)} className="min-h-11 rounded-lg border border-line px-2 text-[15px] hover:bg-surface-2">
                  支出として
                </button>
              </div>
            </>
          )}
        </>
      )}
      </div>
    </section>
  );
}

/**
 * 自分用：右端の「追加」から開く種類の一覧（o31 F002・o30 D007）。
 * 今の画面に合う種類とお気に入りを先頭に、残りをその下に出す。選ぶまで何も保存しない。
 * 選んだ日（カレンダー）を入力の初めの値に引き継ぐ。閉じれば元の画面のまま。
 */
export function AddSheet({ path, date, fav, onClose, onPick, children }: { path: string; date?: string; fav: AddKindId[]; onClose: () => void; onPick: (k: AddKindId) => void; children?: React.ReactNode }) {
  const { top, rest } = addOrder(path, fav);
  const d = date ?? todayStr();
  const row = (id: AddKindId) => {
    const k = ADD_KINDS.find((x) => x.id === id)!;
    return (
      <li key={id}>
        <button type="button" onClick={() => onPick(id)} className="flex min-h-14 w-full items-center justify-between gap-3 px-1 text-left hover:bg-surface-2">
          <span className="text-[16px] font-semibold">{k.label}</span>
          <span className="text-[14px] text-ink-3">{k.desc}</span>
        </button>
      </li>
    );
  };
  return (
    <Sheet title="追加" open onRequestClose={onClose}>
      <p className="mb-2 text-[14px] text-ink-2">支出・収入・予定・やること・メモは {formatDateJa(d, true)} で始めます（入力の中で変えられます）</p>
      <ul className="divide-y divide-line border-y border-line">{top.map(row)}</ul>
      <h3 className="mt-4 mb-1 text-[14px] font-semibold text-ink-3">ほかの種類</h3>
      <ul className="divide-y divide-line border-y border-line">{rest.map(row)}</ul>
      {children}
      <p className="mt-3 text-right">
        <Link href="/settings#nav" onClick={onClose} className="inline-flex min-h-11 items-center text-[14px] font-semibold text-brand">
          よく使う種類を変える
        </Link>
      </p>
    </Sheet>
  );
}
