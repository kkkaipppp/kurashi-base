"use client";

import { Fragment, useCallback, useMemo, useRef, useState, type ReactNode } from "react";
import { OpenFromQuery } from "./OpenFromQuery";
import { Sheet } from "./Sheet";
import { Button, Card, Empty, Field, PageHeader, focusFirstInvalid, inputCls } from "./ui";
import { useUI } from "./UIContext";
import { useData, useStore, type ItemInput } from "@/lib/store";
import { isValidDateStr, todayStr } from "@/lib/date";
import type { AppData, CollectionKey, ItemOf } from "@/lib/types";
import type { SaveResult } from "@/lib/storage";

// タスク・資産・契約・健康・書類・生活記録などで共通に使う「一覧＋入力シート」

import type { Draft } from "@/lib/draft";
export type { Draft };

export interface FieldDef {
  name: string;
  label: string;
  type: "text" | "textarea" | "date" | "number" | "select" | "checkbox";
  required?: boolean;
  /** 入力しなくてもよい欄（ラベルの横に「任意」） */
  optional?: boolean;
  /** group を付けると、選択肢をグループに分けて表示する */
  options?: { value: string; label: string; group?: string }[];
  placeholder?: string;
  hint?: string;
  /** number：小数を許すか（既定は整数のみ） */
  decimal?: boolean;
  /** number：0 未満を許すか */
  allowNegative?: boolean;
  half?: boolean; // 2列のうち1列分
  /** 入力中の内容で、この欄を出すか（出さない欄は確かめず、値はそのまま。例：目標の種類が数値のときだけ数の欄） */
  showWhen?: (d: Draft) => boolean;
}

export interface RowView {
  title: string;
  sub?: string;
  right?: ReactNode;
  muted?: boolean;
  badge?: { text: string; tone: "warn" | "ok" | "info" };
}

export interface CollectionConfig<K extends CollectionKey> {
  key: K;
  title: string;
  noun: string; // 「タスク」「資産」など。ボタン・確認文に使う
  /** 追加ボタンの文言（既定：「○○を追加」） */
  addLabel?: string;
  /** ＋から日を選んで新しく作るとき、その日を入れる日付の項目（タスクの期限など） */
  newDateField?: string;
  intro?: ReactNode;
  emptyText: string;
  fields: FieldDef[] | ((ctx: { data: AppData }) => FieldDef[]);
  /** 削除の確認文（既定：元に戻せません）。消える関連記録の件数などを書く */
  removeBody?: string | ((item: ItemOf<K>, data: AppData) => string);
  /** 削除の処理を差し替える（例：資格を消すと勉強記録も消す） */
  removeFn?: (store: ReturnType<typeof useStore>, id: string) => SaveResult | Promise<SaveResult>;
  /** 追加できない理由（例：先に資格を登録してください）。あれば追加ボタンを押せない */
  addBlocked?: (data: AppData) => string | null;
  /** 新規作成時の初期値 */
  initial: (ctx: { today: string; data: AppData }) => Draft;
  /** 新しく追加するときの「ひな形」（押すと入力の初めの値に入れるだけ。保存の形は変えない。To-Be 段階3） */
  presets?: { id: string; label: string; draft: Draft }[];
  /** 保存済みの項目 → 入力の初期値 */
  toDraft: (item: ItemOf<K>) => Draft;
  /** 入力 → 保存する項目（検証済みの値を渡す） */
  fromDraft: (d: Draft) => ItemInput<K>;
  /** 保存の直前に、前の記録から足す項目（資産の推移など。To-Be 2026-11-28） */
  beforeSave?: (prev: ItemOf<K> | undefined, next: ItemInput<K>) => ItemInput<K>;
  /** 追加の検証（項目名 → エラー文） */
  validate?: (d: Draft) => Record<string, string>;
  row: (item: ItemOf<K>, ctx: { today: string; data: AppData }) => RowView;
  sort?: (a: ItemOf<K>, b: ItemOf<K>) => number;
  /** 一覧の上に出す集計など */
  header?: (ctx: { data: AppData; today: string; list: ItemOf<K>[] }) => ReactNode;
  /** 行の右側に置く操作（例：タスクの完了チェック） */
  rowAction?: (item: ItemOf<K>) => ReactNode;
  /** 一覧のグループ分け（例：日付ごと） */
  groupBy?: (item: ItemOf<K>) => string;
  groupLabel?: (key: string) => string;
}

export function numberFromDraft(v: string | boolean | undefined): number | null {
  if (typeof v !== "string") return null;
  const s = v.replace(/[,，\s]/g, "").replace(/[０-９．－]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0));
  if (s === "") return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

function validateFields(fields: FieldDef[], d: Draft): Record<string, string> {
  const e: Record<string, string> = {};
  for (const f of fields) {
    const v = d[f.name];
    if (f.type === "checkbox") continue;
    if (f.showWhen && !f.showWhen(d)) continue;
    const s = typeof v === "string" ? v.trim() : "";
    if (f.required && s === "") {
      e[f.name] = `${f.label.replace(/（.*）/, "")}を入力してください`;
      continue;
    }
    if (s === "") continue;
    if (f.type === "date" && !isValidDateStr(s)) e[f.name] = "正しい日付を入力してください";
    if (f.type === "number") {
      const n = numberFromDraft(s);
      if (n === null) e[f.name] = "数字で入力してください";
      else if (!f.decimal && !Number.isInteger(n)) e[f.name] = "整数で入力してください";
      else if (!f.allowNegative && n < 0) e[f.name] = "0以上で入力してください";
      else if (Math.abs(n) > 999_999_999_999) e[f.name] = "数字が大きすぎます";
    }
    if ((f.type === "text" && s.length > 100) || (f.type === "textarea" && s.length > 2000)) e[f.name] = "文字数が多すぎます";
  }
  return e;
}

export function CollectionPage<K extends CollectionKey>({ config }: { config: CollectionConfig<K> }) {
  return (
    <main className="space-y-3">
      <PageHeader title={config.title} />
      <CollectionSection config={config} />
    </main>
  );
}

/** 一覧1つ分。heading を渡すと、ページの中の1区画として見出し付きで出す */
export function CollectionSection<K extends CollectionKey>({ config, heading }: { config: CollectionConfig<K>; heading?: string }) {
  const data = useData();
  const today = todayStr();
  const [editing, setEditing] = useState<{ id?: string; key: number; date?: string } | null>(null);
  const list = useMemo(() => {
    const l = [...(data[config.key] as ItemOf<K>[])];
    return config.sort ? l.sort(config.sort) : l;
  }, [data, config]);

  const groups = useMemo(() => {
    if (!config.groupBy) return [["", list]] as [string, ItemOf<K>[]][];
    const m = new Map<string, ItemOf<K>[]>();
    for (const x of list) {
      const g = config.groupBy(x);
      m.set(g, [...(m.get(g) ?? []), x]);
    }
    return [...m.entries()];
  }, [list, config]);

  const blocked = config.addBlocked?.(data) ?? null;
  const add = () => setEditing({ key: Date.now() });
  const ids = useMemo(() => list.map((x) => (x as { id: string }).id), [list]);
  const openById = useCallback((id: string, date?: string) => setEditing(id === "new" ? { key: Date.now(), date } : { id, key: Date.now() }), [setEditing]);
  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        {heading ? <h2 className="text-[17px] font-bold">{heading}</h2> : <span />}
        <Button onClick={add} disabled={!!blocked} className="min-h-11 px-3 text-[14px]">
          ＋ {config.addLabel ?? `${config.noun}を追加`}
        </Button>
      </div>
      {blocked && <p className="text-[13px] text-ink-3">{blocked}</p>}
      {config.intro && <div className="text-[13px] text-ink-3">{config.intro}</div>}
      {config.header?.({ data, today, list })}
      {list.length === 0 ? (
        <Empty action={!blocked && <Button onClick={add}>{config.addLabel ?? `${config.noun}を追加`}</Button>}>{config.emptyText}</Empty>
      ) : (
        groups.map(([g, items]) => (
          <Card key={g || "all"} className="py-2">
            {g && <h2 className="pt-1 text-[13px] font-semibold text-ink-2">{config.groupLabel ? config.groupLabel(g) : g}</h2>}
            <ul className="-mx-2">
              {items.map((item) => {
                const v = config.row(item, { today, data });
                const id = (item as { id: string }).id;
                return (
                  <li key={id} className="flex items-center gap-1">
                    {config.rowAction?.(item)}
                    <button
                      type="button"
                      onClick={() => setEditing({ id, key: Date.now() })}
                      className={`flex min-h-14 min-w-0 flex-1 items-center gap-3 rounded-xl px-2 py-2 text-left hover:bg-surface-2 ${v.muted ? "bg-surface-2" : ""}`}
                    >
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[15px] font-semibold">{v.title}</span>
                        {(v.sub || v.badge) && (
                          <span className={`flex items-center gap-1.5 text-[12px] ${v.muted ? "text-ink-2" : "text-ink-3"}`}>
                            {v.badge && (
                              <span
                                className={`shrink-0 rounded-full px-1.5 py-0.5 text-[12px] font-semibold ${
                                  v.badge.tone === "warn" ? "bg-warn-soft text-warn" : v.badge.tone === "ok" ? "bg-brand-soft text-brand" : "bg-surface-2 text-ink-2 ring-1 ring-line"
                                }`}
                              >
                                {v.badge.text}
                              </span>
                            )}
                            <span className="truncate">{v.sub}</span>
                          </span>
                        )}
                      </span>
                      {v.right && <span className="num shrink-0 text-[15px] font-bold">{v.right}</span>}
                    </button>
                  </li>
                );
              })}
            </ul>
          </Card>
        ))
      )}
      <OpenFromQuery ids={ids} onOpen={openById} />
      {editing && <ItemSheet key={editing.key} config={config} id={editing.id} date={editing.date} onClose={() => setEditing(null)} />}
    </section>
  );
}

function ItemSheet<K extends CollectionKey>({ config, id, date, onClose }: { config: CollectionConfig<K>; id?: string; date?: string; onClose: () => void }) {
  const data = useData();
  const store = useStore();
  const ui = useUI();
  const today = todayStr();
  const liveCur = id ? (data[config.key] as ItemOf<K>[]).find((x) => (x as { id: string }).id === id) : undefined;
  // 編集中に別のタブで消されても入力を消さない。保存すると「削除されています」で止まる（作り直さない）
  const [originalCur] = useState(liveCur);
  const cur = liveCur ?? originalCur;
  const initial = useMemo(() => (cur ? config.toDraft(cur) : { ...config.initial({ today, data }), ...(date && config.newDateField ? { [config.newDateField]: date } : {}) }), []); // eslint-disable-line react-hooks/exhaustive-deps
  const fields = typeof config.fields === "function" ? config.fields({ data }) : config.fields;
  const [draft, setDraft] = useState<Draft>(initial);
  const [errors, setErrors] = useState<Record<string, string>>({});
  // 押したひな形（押していなければ null）。ひな形が入れた欄を手で変えたら、押していない扱いに戻す（点検 中1）
  const [picked, setPicked] = useState<string | null>(null);
  // 編集を始めたときの記録。保存の直前に今の記録と比べ、別のタブで変わっていたら上書きしない
  const editSnapshot = useRef(cur ? JSON.stringify(cur) : undefined);
  const lock = useRef(false);
  const dirty = JSON.stringify(draft) !== JSON.stringify(initial);

  const set = (name: string, v: string | boolean) => {
    setDraft((d) => ({ ...d, [name]: v }));
    if (picked && config.presets?.find((p) => p.id === picked)?.draft[name] !== undefined) setPicked(null);
    if (errors[name]) setErrors((e) => ({ ...e, [name]: "" }));
  };

  const requestClose = async () => {
    if (dirty && !(await ui.confirm({ title: "入力内容を破棄しますか？", body: "保存していない変更は失われます。", ok: "破棄する", danger: true }))) return;
    onClose();
  };

  const save = async () => {
    if (lock.current) return;
    const e = { ...validateFields(fields, draft), ...(config.validate?.(draft) ?? {}) };
    const real = Object.fromEntries(Object.entries(e).filter(([, v]) => v));
    setErrors(real);
    if (Object.keys(real).length) return focusFirstInvalid();
    lock.current = true;
    const drafted = config.fromDraft(draft);
    const item = config.beforeSave ? config.beforeSave(cur, drafted) : drafted;
    const r = await (cur ? store.updateItem(config.key, (cur as { id: string }).id, item, editSnapshot.current) : store.addItem(config.key, item));
    if (!r.ok) {
      lock.current = false;
      ui.toast(r.error, "error");
      return;
    }
    ui.toast("保存しました");
    onClose();
  };

  const remove = async () => {
    if (!cur) return;
    const ok = await ui.confirm({ title: `この${config.noun}を削除しますか？`, body: typeof config.removeBody === "function" ? config.removeBody(cur, data) : (config.removeBody ?? "削除すると元に戻せません。"), ok: "削除する", danger: true });
    if (!ok) return;
    const cid = (cur as { id: string }).id;
    const r = await (config.removeFn ? config.removeFn(store, cid) : store.removeItem(config.key, cid));
    if (!r.ok) return ui.toast(r.error.replace("保存できませんでした", "削除できませんでした"), "error");
    ui.toast("削除しました");
    onClose();
  };

  if (id && !cur) {
    return (
      <Sheet title={config.noun} open onRequestClose={onClose}>
        <p className="text-ink-2">この{config.noun}は見つかりません（削除された可能性があります）。</p>
      </Sheet>
    );
  }

  return (
    <Sheet
      title={cur ? `${config.noun}を編集` : `${config.noun}を追加`}
      open
      onRequestClose={requestClose}
      footer={
        <div className="flex gap-2">
          {cur && (
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
        className="grid grid-cols-2 gap-x-3 gap-y-4"
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          save();
        }}
      >
        {/* ひな形は今は自分用だけ（公開版の組み立てに入れない） */}
        {process.env.NEXT_PUBLIC_KB_EDITION === "personal" && !cur && config.presets && config.presets.length > 0 && (
          <div className="col-span-2">
            <p id={`preset-${config.key}`} className="mb-1 text-[14px] font-semibold text-ink-3">
              ひな形（押すと下の欄に入ります）
            </p>
            <div role="group" aria-labelledby={`preset-${config.key}`} className="flex flex-wrap gap-1.5">
              {config.presets.map((p) => {
                const on = picked === p.id;
                return (
                  <button
                    key={p.id}
                    type="button"
                    aria-pressed={on}
                    onClick={() => {
                      setDraft((d) => ({ ...d, ...p.draft }));
                      setPicked(p.id);
                      // ひな形が入れた欄のエラーだけ消す（ほかの欄のエラーは残す。点検 低2）
                      setErrors((e) => Object.fromEntries(Object.entries(e).filter(([k]) => !(k in p.draft))));
                    }}
                    className={`min-h-11 rounded-full border px-3 text-[14px] font-semibold ${on ? "border-brand bg-brand-soft text-brand" : "border-line bg-surface text-ink-2"}`}
                  >
                    {p.label}
                  </button>
                );
              })}
            </div>
          </div>
        )}
        {fields.map((f) => {
          if (f.showWhen && !f.showWhen(draft)) return null;
          const fid = `f-${config.key}-${f.name}`;
          const v = draft[f.name];
          const err = errors[f.name];
          const span = f.half ? "col-span-1" : "col-span-2";
          if (f.type === "checkbox")
            return (
              <label key={f.name} className={`${span} flex min-h-11 items-center justify-between rounded-xl border border-line bg-surface px-3`}>
                <span className="text-[15px] font-medium">{f.label}</span>
                <input type="checkbox" checked={v === true} onChange={(e) => set(f.name, e.target.checked)} className="size-5 accent-[var(--brand)]" />
              </label>
            );
          return (
            <div key={f.name} className={span}>
              <Field label={f.label} htmlFor={fid} error={err} hint={f.hint} optional={f.optional}>
                {f.type === "textarea" ? (
                  <textarea id={fid} rows={4} value={String(v ?? "")} onChange={(e) => set(f.name, e.target.value)} placeholder={f.placeholder} className={inputCls} aria-invalid={!!err} />
                ) : f.type === "select" ? (
                  <select id={fid} value={String(v ?? "")} onChange={(e) => set(f.name, e.target.value)} className={inputCls} aria-invalid={!!err}>
                    <SelectOptions options={f.options ?? []} current={String(v ?? "")} />
                  </select>
                ) : (
                  <input
                    id={fid}
                    type={f.type === "date" ? "date" : "text"}
                    inputMode={f.type === "number" ? (f.decimal ? "decimal" : "numeric") : undefined}
                    value={String(v ?? "")}
                    onChange={(e) => set(f.name, e.target.value)}
                    placeholder={f.placeholder}
                    className={`${inputCls} ${f.type === "number" ? "num" : ""}`}
                    aria-invalid={!!err}
                  />
                )}
              </Field>
            </div>
          );
        })}
        <button type="submit" hidden aria-hidden="true" tabIndex={-1} />
      </form>
    </Sheet>
  );
}

/**
 * 選択肢。group があれば optgroup でまとめる。
 * 保存済みの値が今の選択肢にない場合（名前を変えた古い分類など）も、その値を残して表示する（データは書き換えない）。
 */
function SelectOptions({ options, current }: { options: NonNullable<FieldDef["options"]>; current: string }) {
  const list = current && !options.some((o) => o.value === current) ? [...options, { value: current, label: `${current}（以前の分類）` }] : options;
  const groups: [string, typeof list][] = [];
  for (const o of list) {
    const g = o.group ?? "";
    const last = groups[groups.length - 1];
    if (last && last[0] === g) last[1].push(o);
    else groups.push([g, [o]]);
  }
  return (
    <>
      {groups.map(([g, os]) => {
        const opts = os.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ));
        return g ? (
          <optgroup key={g} label={g}>
            {opts}
          </optgroup>
        ) : (
          <Fragment key={`_${os[0].value}`}>{opts}</Fragment>
        );
      })}
    </>
  );
}

/** 「準備中」の領域で使う説明ページ */
export function ComingSoon({ title, lead, points, note }: { title: string; lead: string; points: string[]; note?: string }) {
  return (
    <main className="space-y-3">
      <PageHeader title={title} />
      <section className="rounded-2xl border border-warn/30 bg-warn-soft px-4 py-3">
        <p className="text-[14px] font-bold text-warn">準備中です</p>
        <p className="mt-1 text-[13px] text-ink-2">この機能はまだ使えません。今は、どんなことができるようになる予定かだけを表示しています。</p>
      </section>
      <Card>
        <p className="text-[14px] text-ink-2">{lead}</p>
        <ul className="mt-3 list-disc space-y-1.5 pl-5 text-[14px]">
          {points.map((p) => (
            <li key={p}>{p}</li>
          ))}
        </ul>
        {note && <p className="mt-3 text-[12px] text-ink-3">{note}</p>}
      </Card>
    </main>
  );
}
