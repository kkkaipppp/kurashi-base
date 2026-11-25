"use client";

import { useMemo, useState } from "react";
import { useData, useStore } from "@/lib/store";
import { useUI } from "@/components/UIContext";
import { Button, Card, Empty, Field, PageHeader, SectionTitle, inputCls } from "@/components/ui";
import { FEATURES } from "@/lib/edition";
import { newId } from "@/lib/defaults";
import { todayStr, formatDateJa } from "@/lib/date";
import { formatSignedYen, formatYen, parseAmount } from "@/lib/money";
import { addLifeChange, applyLifeChange, listChanges, removePlanned, totalMonthlyImpact, undoLifeChange, type LifeChange, type LifeItem } from "@/lib/lifeChange";

/**
 * 生活変化（自分用。NEXT v21 B03：引っ越し・転職など）。
 * これからの設定（固定費の金額・やめる・月の予算）の変更を、適用日つきの「計画」として残す。
 * 適用は、押したときだけ。変えるのは設定だけで、過去の記録は書き換えない。取り消すと、適用した分が元に戻る
 */
export default function LifePage() {
  const data = useData();
  const store = useStore();
  const ui = useUI();
  const today = todayStr();
  const [title, setTitle] = useState("");
  const [date, setDate] = useState(today);
  const [amounts, setAmounts] = useState<Record<string, string>>({});
  const [stops, setStops] = useState<Record<string, boolean>>({});
  const [budget, setBudget] = useState("");
  const active = useMemo(() => data.recurring.filter((r) => r.active), [data.recurring]);

  if (!FEATURES.lifeChange) {
    return (
      <main>
        <PageHeader title="生活の変化" />
        <Empty>この版では、まだ使えません</Empty>
      </main>
    );
  }

  const items: LifeItem[] = [];
  const problems: string[] = [];
  for (const r of active) {
    if (stops[r.id]) {
      items.push({ kind: "recurringStop", recurringId: r.id, name: r.name });
      continue;
    }
    const t = (amounts[r.id] ?? "").trim();
    if (!t) continue;
    const p = parseAmount(t);
    if (!p.ok) problems.push(`${r.name}の金額：${p.error}`);
    else if (p.value !== r.amount) items.push({ kind: "recurringAmount", recurringId: r.id, name: r.name, before: r.amount, after: p.value });
  }
  if (budget.trim()) {
    const p = parseAmount(budget.trim());
    if (!p.ok) problems.push(`予算：${p.error}`);
    else if (p.value !== data.budget.monthly) items.push({ kind: "budget", before: data.budget.monthly, after: p.value });
  }
  const impact = totalMonthlyImpact(data, { items });
  const canSave = title.trim() !== "" && items.length > 0 && problems.length === 0;

  const save = () => {
    const c: LifeChange = { id: newId("life"), title: title.trim().slice(0, 40), date, items, status: "planned", createdAt: new Date().toISOString() };
    const r = store.commit((d) => addLifeChange(d, c));
    if (!r.ok) return ui.toast(r.error, "error");
    ui.toast("計画として残しました（まだ変えていません）");
    setTitle("");
    setAmounts({});
    setStops({});
    setBudget("");
  };

  const apply = async (c: LifeChange) => {
    const ok = await ui.confirm({ title: `「${c.title}」を適用しますか？`, body: `固定費・予算の設定が変わります（過去の記録は変わりません）。あとで取り消せます。\n1か月あたりの影響：${formatSignedYen(totalMonthlyImpact(data, c))}`, ok: "適用する" });
    if (!ok) return;
    const ts = new Date().toISOString();
    let applied = 0;
    let skipped = 0;
    const r = store.commit((d) => {
      const x = applyLifeChange(d, c.id, ts);
      applied = x.applied;
      skipped = x.skipped;
      return x.next;
    });
    if (!r.ok) return ui.toast(r.error, "error");
    ui.toast(skipped > 0 ? `${applied}件を適用しました。${skipped}件は、変更前の値が今と違うので、変えていません` : `${applied}件を適用しました`, skipped > 0 ? "error" : "ok");
  };
  const undo = async (c: LifeChange) => {
    const ok = await ui.confirm({ title: `「${c.title}」を取り消しますか？`, body: "適用した分を、元に戻します（そのあとに自分で変えた項目は、そのままです）。履歴は残ります。", ok: "取り消す" });
    if (!ok) return;
    const r = store.commit((d) => undoLifeChange(d, c.id, new Date().toISOString()));
    ui.toast(r.ok ? "取り消しました" : r.error, r.ok ? "ok" : "error");
  };
  const remove = async (c: LifeChange) => {
    const ok = await ui.confirm({ title: `「${c.title}」の計画を消しますか？`, body: "まだ適用していない計画だけが消えます。", ok: "消す", danger: true });
    if (!ok) return;
    const r = store.commit((d) => removePlanned(d, c.id));
    ui.toast(r.ok ? "消しました" : r.error, r.ok ? "ok" : "error");
  };

  const label = (it: LifeItem) => (it.kind === "budget" ? `予算 ${it.before === null ? "未設定" : formatYen(it.before)} → ${it.after === null ? "未設定" : formatYen(it.after)}` : it.kind === "recurringStop" ? `${it.name}：やめる` : `${it.name}：${formatYen(it.before)} → ${formatYen(it.after)}`);
  const list = listChanges(data).slice().reverse();

  return (
    <main className="space-y-3">
      <PageHeader title="生活の変化" />
      <p className="px-1 text-[13px] text-ink-3">引っ越し・転職などで変わる、固定費や予算を、適用日つきの計画として残します。押すまで、何も変わりません。過去の記録は、書き換えません。</p>
      <Card>
        <SectionTitle>新しい計画</SectionTitle>
        <div className="space-y-3">
          <Field label="名前" htmlFor="life-title">
            <input id="life-title" value={title} onChange={(e) => setTitle(e.target.value)} className={inputCls} placeholder="例：引っ越し" maxLength={40} />
          </Field>
          <Field label="適用日" htmlFor="life-date">
            <input id="life-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} className={inputCls} />
          </Field>
          <div>
            <p className="mb-1 text-[13px] font-semibold">固定費（変えるものだけ。空欄は、変えない）</p>
            {active.length === 0 && <p className="text-[12px] text-ink-3">固定費が登録されていません</p>}
            <ul className="divide-y divide-line">
              {active.map((r) => (
                <li key={r.id} className="flex flex-wrap items-center gap-2 py-2">
                  <span className="min-w-0 flex-1 text-[14px]">
                    {r.name} <span className="num text-ink-3">{formatYen(r.amount)}</span>
                  </span>
                  <input inputMode="numeric" aria-label={`${r.name}の新しい金額`} placeholder="新しい金額" value={amounts[r.id] ?? ""} onChange={(e) => setAmounts({ ...amounts, [r.id]: e.target.value })} disabled={!!stops[r.id]} className={`${inputCls} !w-28`} />
                  <label className="flex min-h-11 items-center gap-1 text-[13px]">
                    <input type="checkbox" checked={!!stops[r.id]} onChange={(e) => setStops({ ...stops, [r.id]: e.target.checked })} />
                    やめる
                  </label>
                </li>
              ))}
            </ul>
          </div>
          <Field label={`毎月の予算（今は ${data.budget.monthly === null ? "未設定" : formatYen(data.budget.monthly)}。空欄は、変えない）`} htmlFor="life-budget">
            <input id="life-budget" inputMode="numeric" value={budget} onChange={(e) => setBudget(e.target.value)} className={inputCls} placeholder="新しい予算" />
          </Field>
          {problems.length > 0 && <p role="alert" className="text-[13px] text-danger">{problems.join(" ／ ")}</p>}
          {items.length > 0 && (
            <div className="rounded-xl bg-surface-2 px-3 py-2 text-[13px]">
              <p className="font-semibold">変わること（{items.length}件）</p>
              <ul className="mt-1 list-disc pl-4">
                {items.map((it, i) => (
                  <li key={i}>{label(it)}</li>
                ))}
              </ul>
              <p className="num mt-1">固定費の1か月あたりの影響：{formatSignedYen(impact)}（予算は含みません）</p>
            </div>
          )}
          <Button className="w-full" onClick={save} disabled={!canSave}>
            計画として残す
          </Button>
        </div>
      </Card>

      <section className="space-y-2" aria-label="計画と履歴">
        {list.length === 0 ? (
          <Card>
            <p className="text-[13px] text-ink-3">まだ計画がありません</p>
          </Card>
        ) : (
          list.map((c) => (
            <Card key={c.id}>
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="text-[15px] font-bold">{c.title}</p>
                  <p className="text-[12px] text-ink-3">
                    適用日 {formatDateJa(c.date)}・{c.status === "planned" ? (c.date <= today ? "適用日です（まだ変えていません）" : "計画") : c.status === "applied" ? "適用済み" : "取り消し済み"}
                  </p>
                </div>
              </div>
              <ul className="mt-1 list-disc pl-4 text-[13px]">
                {c.items.map((it, i) => (
                  <li key={i} className={it.applied === false ? "text-ink-3 line-through" : ""}>
                    {label(it)}
                    {it.applied === false && "（変更前の値が今と違うので、変えませんでした）"}
                  </li>
                ))}
              </ul>
              <p className="num mt-1 text-[12px] text-ink-3">固定費の1か月あたりの影響：{formatSignedYen(totalMonthlyImpact(data, c))}</p>
              <div className="mt-2 flex gap-2">
                {c.status === "planned" && (
                  <>
                    <Button className="flex-1" onClick={() => apply(c)}>
                      適用する
                    </Button>
                    <Button variant="secondary" className="flex-1" onClick={() => remove(c)}>
                      消す
                    </Button>
                  </>
                )}
                {c.status === "applied" && (
                  <Button variant="secondary" className="w-full" onClick={() => undo(c)}>
                    取り消す
                  </Button>
                )}
              </div>
            </Card>
          ))
        )}
      </section>
    </main>
  );
}
