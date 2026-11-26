"use client";

import { Card, PageHeader } from "@/components/ui";
import { daySummary, eventsOnDay, remainingBudget } from "@/lib/aggregate";
import { budgetSpent } from "@/lib/ledger";
import { formatDateJa, monthKey, todayStr } from "@/lib/date";
import { formatSignedYen, formatYen } from "@/lib/money";
import { useData } from "@/lib/store";
import { eventTimeLabel } from "@/components/Rows";
import { IS_PERSONAL } from "@/lib/edition";

export default function WidgetPreviewPage() {
  const data = useData();
  const today = todayStr();
  const events = eventsOnDay(data.events, today);
  const spent = daySummary(data.transactions, today).expense;
  // 予算と比べる額は、ホームと同じもの（自分用は投資を除いた生活費。lib/ledger.ts の budgetSpent。独立点検 中2）
  const remaining = remainingBudget(data.budget.monthly, budgetSpent(data, monthKey(today), today));

  return (
    <main className="space-y-3">
      <PageHeader title="ウィジェット" />
      {IS_PERSONAL ? (
        // 自分用の iPhone アプリでは、ホーム画面にウィジェットを置ける（磨き込み 2026-11-26）
        <section className="rounded-2xl border border-line bg-surface-2 px-4 py-3 text-[13px] text-ink-2">
          <p className="font-bold">ウィジェットの中身のプレビューです</p>
          iPhone アプリでは、ホーム画面を長押し →「＋」→「くらしベース」で、ウィジェットを置けます。パソコンのブラウザでは置けません。
        </section>
      ) : (
        <section className="rounded-2xl border border-warn/30 bg-warn-soft px-4 py-3 text-[13px] text-ink-2">
          <p className="font-bold text-warn">アプリの中で見るだけのプレビューです</p>
          iPhone のホーム画面のウィジェットは、Web 版では使えません。iPhone アプリが必要で、まだ対応していません。
        </section>
      )}

      <p className="text-[13px] text-ink-3">ウィジェットにしたときに出す予定の内容です（今のデータで表示しています）。</p>
      <div className="grid grid-cols-2 gap-3">
        <div className="aspect-square rounded-[22px] bg-brand p-3 text-brand-ink shadow-md">
          <p className="text-[11px] font-semibold opacity-80">今月の予算の残り</p>
          <p className="num mt-1 text-xl leading-tight font-bold">{remaining === null ? "未設定" : formatSignedYen(remaining)}</p>
          <p className="mt-3 text-[11px] font-semibold opacity-80">今日の支出</p>
          <p className="num text-lg font-bold">{formatYen(spent)}</p>
        </div>
        <div className="aspect-square overflow-hidden rounded-[22px] bg-surface p-3 shadow-md ring-1 ring-line">
          <p className="text-[11px] font-semibold text-ink-3">{formatDateJa(today)}</p>
          {events.length === 0 ? (
            <p className="mt-2 text-[13px] text-ink-3">今日の予定はありません</p>
          ) : (
            <ul className="mt-1 space-y-1.5">
              {events.slice(0, 3).map((e) => (
                <li key={e.id} className="border-l-2 border-event pl-1.5">
                  <p className="truncate text-[12px] font-semibold">{e.title}</p>
                  <p className="truncate text-[10px] text-ink-3">{eventTimeLabel(e, today)}</p>
                </li>
              ))}
              {events.length > 3 && <li className="text-[10px] text-ink-3">ほか{events.length - 3}件</li>}
            </ul>
          )}
        </div>
      </div>
      <Card>
        <p className="text-[13px] text-ink-2">
          今すぐできること：Safari の共有ボタンから「ホーム画面に追加」を選ぶと、アイコンからこのアプリを開けます（ウィジェットではありません）。
        </p>
      </Card>
    </main>
  );
}
