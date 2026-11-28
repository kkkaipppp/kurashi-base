import { isValidDateStr, isValidTimeStr } from "./date";
import { MAX_AMOUNT } from "./money";
import { COLLECTION_KEYS, type AppData, type CollectionKey } from "./types";

// 保存データ・バックアップの構造検証。不正なら理由を返し、既存データには触れない。

type R = { ok: true; data: AppData } | { ok: false; error: string };

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const isStr = (v: unknown): v is string => typeof v === "string";
const okDateOrBlank = (v: unknown) => isStr(v) && (v === "" || isValidDateStr(v));
const isDate = (v: unknown) => isStr(v) && isValidDateStr(v);
const isBool = (v: unknown) => typeof v === "boolean";
const isNum = (v: unknown) => typeof v === "number" && Number.isFinite(v);
const numOrNull = (v: unknown) => v === null || isNum(v);
const oneOf = (...xs: string[]) => (v: unknown) => isStr(v) && xs.includes(v);
const intList = (min: number, max: number) => (v: unknown) => Array.isArray(v) && v.length <= 7 && v.every((x) => Number.isInteger(x) && x >= min && x <= max) && new Set(v).size === v.length;
// 外貨の控え（lib/fx.ts）：通貨は英字3つ、最小単位は1以上の整数、桁は 0〜3
const isFx = (v: unknown) => {
  if (typeof v !== "object" || v === null || Array.isArray(v)) return false;
  const f = v as Record<string, unknown>;
  return typeof f.currency === "string" && /^[A-Z]{3}$/.test(f.currency) && Number.isSafeInteger(f.minor) && (f.minor as number) > 0 && Number.isInteger(f.digits) && (f.digits as number) >= 0 && (f.digits as number) <= 3 && typeof f.basis === "string" && f.basis.length <= 200;
};
const isAmt = (v: unknown) => Number.isInteger(v) && (v as number) > 0 && (v as number) <= MAX_AMOUNT;

export const CURRENT_SCHEMA = 2;

/**
 * 古い形式のデータを今の形式に移行する（元のオブジェクトは変更しない）。
 * v1 → v2：NISA・メモ・勉強・目標の空の一覧を足す。既存のデータはそのまま。
 */
export function migrate(raw: unknown): unknown {
  if (!isObj(raw)) return raw;
  let d: Record<string, unknown> = raw;
  if (d.schemaVersion === 1) {
    d = { ...d, schemaVersion: 2 };
    // 通常の v1 には新しい一覧がないので空で足す。すでに値があれば消さずに残し、後の検証に任せる
    for (const k of COLLECTION_KEYS) if (d[k] === undefined) d[k] = [];
  }
  // v5：旅行の一覧（無ければ空で足す。形式の番号は 2 のまま。古いアプリは知らない項目をそのまま残す）
  if (d.schemaVersion === 2 && d.trips === undefined) d = { ...d, trips: [] };
  // To-Be（2026-11-27）：計画の一覧（無ければ空で足す。形式の番号は 2 のまま。今ある記録は変えない）
  if (d.schemaVersion === 2 && d.plans === undefined) d = { ...d, plans: [] };
  // 2026-11-28：欲しいものの一覧（無ければ空で足す。今ある記録は変えない。足さないと、今の記録を「一部が見つかりません」で断ってしまう）
  if (d.schemaVersion === 2 && d.wishes === undefined) d = { ...d, wishes: [] };
  // 2026-11-28：口座・カードの一覧（無ければ空で足す）
  if (d.schemaVersion === 2 && d.accounts === undefined) d = { ...d, accounts: [] };
  // 2026-11-28：ポイントの一覧（無ければ空で足す）
  if (d.schemaVersion === 2 && d.points === undefined) d = { ...d, points: [] };
  // 2026-11-28：予約・家事・買い足すもの・ゴミ出し（無ければ空で足す）
  for (const k of ["reservations", "chores", "stock", "garbage", "installments"] as const) if (d.schemaVersion === 2 && d[k] === undefined) d = { ...d, [k]: [] };
  return d;
}

const isHttpOrBlank = (v: unknown) => {
  if (!isStr(v)) return false;
  if (v.trim() === "") return true;
  try {
    const u = new URL(v);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
};
const optional = (check: (v: unknown) => boolean) => (v: unknown) => v === undefined || check(v);
const isLifeItem = (x: unknown): boolean => {
  if (!isObj(x) || !optional(isBool)(x.applied)) return false;
  if (x.kind === "budget") return (x.before === null || isAmt(x.before)) && (x.after === null || isAmt(x.after));
  if (x.kind === "recurringStop") return isStr(x.recurringId) && isStr(x.name);
  if (x.kind === "recurringAmount") return isStr(x.recurringId) && isStr(x.name) && isAmt(x.before) && isAmt(x.after);
  return false;
};
const isLifeChanges = (v: unknown) =>
  Array.isArray(v) && v.every((c) => isObj(c) && isStr(c.id) && isStr(c.title) && isValidDateStr(c.date as string) && oneOf("planned", "applied", "undone")(c.status) && isStr(c.createdAt) && Array.isArray(c.items) && c.items.every(isLifeItem));
const isCheckList2 = (v: unknown) =>
  Array.isArray(v) && v.every((x) => isObj(x) && isStr(x.id) && isStr(x.text) && isBool(x.done) && (x.due === undefined || isDate(x.due)));
const isCheckList = (v: unknown) =>
  Array.isArray(v) && v.every((x) => isObj(x) && isStr(x.id) && isStr(x.text) && isBool(x.done));
const isUnit = oneOf("page", "problem", "chapter", "lecture");
const isPosInt = (v: unknown) => Number.isInteger(v) && (v as number) >= 0 && (v as number) <= 100_000;
// o31 F013：教材の任意の項目（無くてもよい。あれば形を確かめる）
const isBookList = (v: unknown) =>
  Array.isArray(v) &&
  v.every(
    (x) =>
      isObj(x) && isStr(x.id) && isStr(x.title) && isHttpOrBlank(x.url) && isStr(x.note) &&
      optional(oneOf("candidate", "owned", "studying", "done"))(x.status) && optional(isStr)(x.edition) &&
      optional((t) => t === null || isPosInt(t))(x.total) && optional(isUnit)(x.unit) &&
      optional((a) => Array.isArray(a) && a.every(isStr))(x.alsoSubjectIds) && optional(isStr)(x.txId),
  );
// o31 F012：受験の回（点数は満点以下）
const isExamList = (v: unknown) =>
  Array.isArray(v) &&
  v.every(
    (x) =>
      isObj(x) && isStr(x.id) && okDateOrBlank(x.date) && oneOf("planned", "passed", "failed", "absent")(x.result) &&
      optional((s) => s === null || (isNum(s) && (s as number) >= 0))(x.score) && optional((m) => m === null || (isNum(m) && (m as number) > 0))(x.maxScore) &&
      !(isNum(x.score) && isNum(x.maxScore) && (x.score as number) > (x.maxScore as number)) && optional(isStr)(x.note),
  );
const isIso = (v: unknown) => isStr(v) && !Number.isNaN(Date.parse(v as string));
// o31 F018：目標の達成条件（今の値は分からなければ null）
const isCondList = (v: unknown) =>
  Array.isArray(v) &&
  v.every(
    (x) =>
      isObj(x) && isStr(x.id) && isStr(x.label) && isStr(x.unit) && oneOf(">=", "<=", "==", "range")(x.op) && isNum(x.target) &&
      optional(isNum)(x.targetMax) && (x.actual === null || isNum(x.actual)),
  );
const isMoneyOrNull = (v: unknown) => v === null || (Number.isInteger(v) && (v as number) >= 0 && (v as number) <= MAX_AMOUNT);

/** 日程調整の回答リンクの控え（To-Be 段階4。2026-11-28） */
const isPoll = (v: unknown) =>
  isObj(v) && isStr(v.id) && isStr(v.ownerKey) && isStr(v.title) && isDate(v.closesAt) && oneOf("draft", "open", "closed")(v.status) && isStr(v.createdAt) &&
  Array.isArray(v.options) && v.options.length <= 20 && v.options.every((o) => isObj(o) && isStr(o.id) && isDate(o.date) && isStr(o.label));

/** To-Be（2026-11-27）の計画。候補は任意 */
const isCandidate = (c: unknown) =>
  isObj(c) && isStr(c.id) && isStr(c.label) && isHttpOrBlank(c.url) && isMoneyOrNull(c.price) && isStr(c.note) && optional(isBool)(c.chosen);
const isPlan = (p: unknown): p is Record<string, unknown> =>
  isObj(p) && isStr(p.id) && isStr(p.title) &&
  oneOf("gathering", "trip", "move", "shopping", "business", "job", "free")(p.type) &&
  oneOf("considering", "preparing", "done", "canceled")(p.status) &&
  okDateOrBlank(p.date) && isMoneyOrNull(p.budget) && isStr(p.note) && optional(isStr)(p.tripId) &&
  optional((v) => Array.isArray(v) && v.every(isCandidate))(p.candidates) && optional(isPoll)(p.poll) && isStr(p.createdAt) && isStr(p.updatedAt);

/** v5 で予定に足した任意の項目（無くてもよい。あれば形を確かめる） */
const EVENT_V5: Record<string, (v: unknown) => boolean> = {
  location: optional(isStr),
  url: optional(isHttpOrBlank),
  items: optional(isCheckList),
  tripId: optional(isStr),
  kind: optional(oneOf("move", "stay", "sight", "food", "other")),
  cost: optional(isMoneyOrNull),
  doneDates: optional((v) => Array.isArray(v) && v.every((x) => isDate(x))),
  travelMinutes: optional((v) => Number.isInteger(v) && (v as number) >= 0 && (v as number) <= 1440),
  goalId: optional(isStr),
  planId: optional(isStr),
  tentative: optional((v) => v === true),
};

// 追加した一覧ごとの項目チェック（順番は COLLECTION_KEYS に合わせる。studySubjects は studyLogs より前）
const SPECS: Record<CollectionKey, { label: string; fields: Record<string, (v: unknown) => boolean> }> = {
  nisa: { label: "NISA", fields: { date: isDate, kind: oneOf("buy", "sell"), frame: oneOf("tsumitate", "growth"), amount: (v) => isAmt(v), name: isStr, note: isStr } },
  notes: { label: "生活記録・メモ", fields: { title: isStr, body: isStr, date: okDateOrBlank, pinned: isBool, tags: optional((v) => Array.isArray(v) && v.length <= 10 && v.every((t) => isStr(t) && (t as string).length > 0 && Array.from(t as string).length <= 20)), photoPlace: optional((v) => isStr(v) && (v as string).length <= 200) } },
  tasks: { label: "やること", fields: { title: isStr, due: okDateOrBlank, doDate: optional(okDateOrBlank), done: isBool, note: isStr, eventId: optional(isStr), planId: optional(isStr) } },
  assets: { label: "資産", fields: { name: isStr, kind: oneOf("cash", "investment", "nisa", "pension", "insurance", "property", "other"), value: numOrNull, asOf: okDateOrBlank, note: isStr, cardDebt: optional(isAmt), debt: optional((v) => v === true), history: optional((v) => Array.isArray(v) && v.length <= 100 && v.every((p) => isObj(p) && isDate(p.asOf) && isNum(p.value))) } },
  contracts: { label: "契約", fields: { name: isStr, provider: isStr, amount: numOrNull, cycle: oneOf("monthly", "yearly", "none"), renewalDate: okDateOrBlank, status: oneOf("active", "cancelled"), note: isStr, recurringId: optional(isStr) } },
  health: { label: "健康記録", fields: { date: isDate, item: isStr, value: numOrNull, unit: isStr, note: isStr } },
  documents: { label: "書類", fields: { title: isStr, category: isStr, expiry: okDateOrBlank, place: isStr, note: isStr, photoPlace: optional((v) => isStr(v) && (v as string).length <= 200) } },
  studySubjects: { label: "勉強（資格）", fields: { name: isStr, examDate: okDateOrBlank, targetHours: (v) => v === null || (isNum(v) && (v as number) > 0), archived: isBool, catalogId: optional(isStr), books: optional(isBookList), exams: optional(isExamList), reviewDays: optional((v) => Number.isInteger(v) && (v as number) >= 0 && (v as number) <= 365) } },
  studyLogs: {
    label: "勉強記録",
    fields: {
      subjectId: isStr,
      date: isDate,
      minutes: (v) => Number.isInteger(v) && (v as number) >= 1 && (v as number) <= 1440,
      note: isStr,
      // o31 F015・F016・D022（任意）
      bookId: optional(isStr),
      startedAt: optional(isIso),
      endedAt: optional(isIso),
      range: optional((r) => isObj(r) && isPosInt(r.from) && isPosInt(r.to) && (r.from as number) >= 1 && (r.to as number) >= (r.from as number) && isUnit(r.unit)),
      questions: optional(isPosInt),
      correct: optional(isPosInt),
      review: optional(isBool),
    },
  },
  goals: {
    label: "目標",
    fields: {
      title: isStr,
      deadline: okDateOrBlank,
      kind: oneOf("number", "check"),
      target: numOrNull,
      current: isNum,
      unit: isStr,
      done: isBool,
      note: isStr,
      steps: optional(isCheckList2),
      // o31 F018・F019（任意）
      conditions: optional(isCondList),
      condMode: optional(oneOf("and", "or")),
      parentId: optional(isStr),
      achievements: optional((v) => Array.isArray(v) && v.every((a) => isObj(a) && isIso(a.at) && oneOf("met", "unmet", "unknown")(a.verdict) && isCondList(a.conditions))),
      pausedAt: optional(isDate),
    },
  },
  accounts: { label: "口座・カード", fields: { name: isStr, kind: oneOf("bank", "card", "emoney", "cash"), closingDay: (v) => v === null || (Number.isInteger(v) && (v as number) >= 1 && (v as number) <= 31), payDay: (v) => v === null || (Number.isInteger(v) && (v as number) >= 1 && (v as number) <= 31), baseBalance: (v) => v === null || Number.isInteger(v), baseDate: okDateOrBlank, baseAt: optional(isStr), note: isStr, archived: isBool } },
  reservations: { label: "予約", fields: { name: isStr, kind: oneOf("hotel", "flight", "train", "restaurant", "other"), date: okDateOrBlank, status: oneOf("none", "booked", "canceled"), ref: isStr, cancelBy: okDateOrBlank, amount: (v: unknown) => v === null || isAmt(v), url: isHttpOrBlank, planId: optional(isStr), note: isStr } },
  chores: { label: "家事", fields: { name: isStr, who: isStr, cycle: oneOf("daily", "weekly", "monthly", "none"), lastDone: okDateOrBlank, note: isStr } },
  stock: { label: "買い足すもの", fields: { name: isStr, need: isBool, note: isStr } },
  garbage: { label: "ゴミ出し", fields: { name: isStr, weekdays: intList(0, 6), weeks: intList(1, 5), note: isStr } },
  installments: { label: "分割払い", fields: { name: isStr, total: isAmt, count: (v: unknown) => Number.isInteger(v) && (v as number) >= 1 && (v as number) <= 120, firstDate: isDate, note: isStr } },
  points: { label: "ポイント", fields: { name: isStr, balance: (v: unknown) => v === null || (Number.isInteger(v) && (v as number) >= 0), expiry: okDateOrBlank, note: isStr } },
  wishes: { label: "欲しいもの", fields: { name: isStr, price: numOrNull, url: isHttpOrBlank, priority: oneOf("high", "mid", "low"), status: oneOf("want", "bought", "dropped"), note: isStr } },
};

export function validateAppData(input: unknown): R {
  const raw = migrate(input);
  if (!isObj(raw)) return { ok: false, error: "データの形式が正しくありません" };
  if (raw.schemaVersion !== CURRENT_SCHEMA)
    return { ok: false, error: "対応していない形式のデータです。アプリを最新にしてください" };
  for (const k of ["transactions", "events", "categories", "recurring", ...COLLECTION_KEYS]) {
    if (!Array.isArray(raw[k])) return { ok: false, error: "データの一部が見つかりません。データが壊れている可能性があります" };
  }
  const cats = raw.categories as unknown[];
  const catIds = new Set<string>();
  for (const c of cats) {
    if (!isObj(c) || !isStr(c.id) || !isStr(c.name) || (c.kind !== "expense" && c.kind !== "income") || !optional(oneOf("life", "invest"))(c.role))
      return { ok: false, error: "カテゴリのデータが壊れています" };
    if (catIds.has(c.id)) return { ok: false, error: "カテゴリが二重に入っています" };
    catIds.add(c.id);
  }
  const ids = new Set<string>();
  for (const t of raw.transactions as unknown[]) {
    if (
      !isObj(t) || !isStr(t.id) || (t.type !== "expense" && t.type !== "income") ||
      !isStr(t.date) || !isValidDateStr(t.date) || !isAmt(t.amount) || !isStr(t.categoryId) ||
      !isStr(t.merchant) || !isStr(t.paymentMethod) || !isStr(t.note) || !isStr(t.createdAt) ||
      // 100点化で足した任意の項目（無くてもよい。あれば形を確かめる）
      !optional(oneOf("life", "invest", "transfer"))(t.countAs) || !optional(isStr)(t.tripId) || !optional(isStr)(t.importBatchId) || !optional(isBool)(t.recurringPartial) || !optional(isStr)(t.recurringDue) || !optional(isStr)(t.recurringId) || !optional(isStr)(t.refundOf) || !optional(oneOf("card"))(t.transferKind) || !optional(oneOf("life", "invest"))(t.refundWas) || !optional(isAmt)(t.refundGross) || !optional(isStr)(t.planId) || !optional(isAmt)(t.advanceGross) || !optional(isStr)(t.settles) || !optional((v) => v === true)(t.claim) || !optional((v) => v === true)(t.template) || !optional((v) => v === true)(t.special) || !optional(isStr)(t.accountId) || !optional(isStr)(t.toAccountId) || !optional(isFx)(t.fx)
    )
      return { ok: false, error: "支出・収入のデータが壊れています" };
    if (ids.has(t.id)) return { ok: false, error: "支出・収入の記録が二重に入っています" };
    ids.add(t.id);
  }
  for (const e of raw.events as unknown[]) {
    if (
      !isObj(e) || !isStr(e.id) || !isStr(e.title) || !isStr(e.startDate) || !isValidDateStr(e.startDate) ||
      !isStr(e.endDate) || !isValidDateStr(e.endDate) || e.endDate < e.startDate || typeof e.allDay !== "boolean" ||
      (!e.allDay && (!isStr(e.startTime) || !isValidTimeStr(e.startTime) || !isStr(e.endTime) || !isValidTimeStr(e.endTime))) ||
      !(e.repeat === undefined || ["none", "weekly", "monthly", "yearly"].includes(e.repeat as string)) ||
      !(e.repeatUntil === undefined || okDateOrBlank(e.repeatUntil)) ||
      !Object.entries(EVENT_V5).every(([f, check]) => check(e[f]))
    )
      return { ok: false, error: "予定のデータが壊れています" };
    if (ids.has(e.id)) return { ok: false, error: "予定が二重に入っています" };
    ids.add(e.id);
  }
  if (!Array.isArray(raw.trips)) return { ok: false, error: "旅行のデータが見つかりません" };
  const tripIds = new Set<string>();
  for (const t of raw.trips as unknown[]) {
    if (
      !isObj(t) || !isStr(t.id) || !isStr(t.title) || !isDate(t.startDate) || !isDate(t.endDate) ||
      (t.endDate as string) < (t.startDate as string) || !isStr(t.destination) || !isMoneyOrNull(t.budget) || !isStr(t.note)
    )
      return { ok: false, error: "旅行のデータが壊れています" };
    if (tripIds.has(t.id)) return { ok: false, error: "旅行が二重に入っています" };
    tripIds.add(t.id);
  }
  if (!Array.isArray(raw.plans)) return { ok: false, error: "計画のデータが見つかりません" };
  const planIds = new Set<string>();
  for (const p of raw.plans as unknown[]) {
    if (!isPlan(p)) return { ok: false, error: "計画のデータが壊れています" };
    if (planIds.has(p.id as string)) return { ok: false, error: "計画が二重に入っています" };
    planIds.add(p.id as string);
  }
  const recurringIds = new Set<string>();
  for (const r of raw.recurring as unknown[]) {
    if (
      !isObj(r) || !isStr(r.id) || !isStr(r.name) || !isAmt(r.amount) || !["weekly", "monthly", "yearly"].includes(r.cycle as string) ||
      !optional((v) => isObj(v) && isDate(v.due) && isNum(v.paid) && (v.paid as number) >= 0)(r.partialPaid) ||
      !Number.isInteger(r.anchorDay) || !isStr(r.nextDueDate) || !isValidDateStr(r.nextDueDate) || typeof r.active !== "boolean"
    )
      return { ok: false, error: "固定費のデータが壊れています" };
    if (recurringIds.has(r.id)) return { ok: false, error: "固定費が二重に入っています" };
    recurringIds.add(r.id);
  }
  if (
    !isObj(raw.budget) || !(raw.budget.monthly === null || isAmt(raw.budget.monthly)) ||
    !optional((v) => v === null || isAmt(v))(raw.budget.yearlySpecial) ||
    !optional((v) => v === null || (Number.isInteger(v) && (v as number) >= 1 && (v as number) <= 31))(raw.budget.payday) ||
    !optional((v) => Array.isArray(v) && v.length <= 100 && v.every((h) => isObj(h) && isDate(h.at) && (h.monthly === null || isAmt(h.monthly))))(raw.budget.history)
  )
    return { ok: false, error: "予算のデータが壊れています" };
  const isStrList = (v: unknown) => Array.isArray(v) && v.every(isStr);
  if (!isObj(raw.prefs) || !isObj(raw.prefs.home) || !optional(isStrList)(raw.prefs.home.order) || !optional(isStrList)(raw.prefs.home.hidden) || !optional(isStrList)(raw.prefs.menuHidden))
    return { ok: false, error: "表示設定のデータが壊れています" };
  if (!isObj(raw.meta) || !optional((v) => Array.isArray(v) && v.every((b) => isObj(b) && isStr(b.id) && isStr(b.at) && isStr(b.source) && isNum(b.added)))(raw.meta.imports) || !optional(isLifeChanges)(raw.meta.lifeChanges))
    return { ok: false, error: "取り込みの履歴・生活の変化のデータが壊れています" };

  const subjectIds = new Set<string>();
  for (const k of COLLECTION_KEYS) {
    const spec = SPECS[k];
    const seen = new Set<string>();
    for (const item of raw[k] as unknown[]) {
      if (!isObj(item) || !isStr(item.id) || !Object.entries(spec.fields).every(([f, check]) => check(item[f])))
        return { ok: false, error: `${spec.label}のデータが壊れています` };
      if (seen.has(item.id)) return { ok: false, error: `${spec.label}が二重に入っています` };
      seen.add(item.id);
      if (k === "studySubjects") subjectIds.add(item.id);
      if (k === "studyLogs" && !subjectIds.has(item.subjectId as string))
        return { ok: false, error: "勉強の記録の資格が見つかりません" };
      // o31 D022：正解は問題数より多くならない。正解だけ・問題数だけ、は受け付けない
      if (k === "studyLogs" && (item.questions === undefined) !== (item.correct === undefined))
        return { ok: false, error: "勉強の記録の問題数と正解数がそろっていません" };
      if (k === "studyLogs" && isNum(item.questions) && isNum(item.correct) && (item.correct as number) > (item.questions as number))
        return { ok: false, error: "勉強の記録の正解数が問題数より多くなっています" };
    }
  }
  return { ok: true, data: raw as unknown as AppData };
}

/**
 * 参照整合性を追加検査する。古い端末データの読み込みでは自動変更・破棄をしないため、
 * 構造検査 validateAppData と分離し、復元前の厳密検査で使う。
 */
export function validateRelationships(data: AppData): { ok: true } | { ok: false; error: string } {
  const categories = new Map(data.categories.map((c) => [c.id, c]));
  for (const t of data.transactions) {
    const cat = categories.get(t.categoryId);
    if (cat && cat.kind === t.type) continue;
    // 説明の文は、問題があったときだけ作る（30年分の復元で、全件に作ると遅い。o11 A08 点検 高-2）
    const label = `${t.date}の${t.type === "expense" ? "支出" : "収入"}${t.amount.toLocaleString("ja-JP")}円${t.merchant ? `（${t.merchant}）` : ""}`;
    if (!cat) return { ok: false, error: `${label}のカテゴリが、バックアップの中に見つかりません` };
    return { ok: false, error: `${label}のカテゴリが、支出用・収入用で食い違っています` };
  }
  for (const r of data.recurring) {
    const cat = categories.get(r.categoryId);
    if (!cat || cat.kind !== "expense") return { ok: false, error: `固定費「${r.name}」のカテゴリが、支出用のカテゴリになっていません` };
  }
  const trips = new Set((data.trips ?? []).map((t) => t.id));
  for (const e of data.events) {
    if (e.tripId && !trips.has(e.tripId)) {
      return { ok: false, error: `${e.startDate}の予定「${e.title}」の旅行が、バックアップの中に見つかりません` };
    }
  }
  // 計画を指す番号（planId・Plan.tripId）は、ここでは断らない（To-Be 点検 高-1：端末で切れたつながりがあると、どのバックアップも戻せなくなるため）。
  // 復元のときに plan.ts の dropDanglingPlanLinks で、つながりだけを外す（記録は残す）
  const subjects = new Set(data.studySubjects.map((s) => s.id));
  for (const l of data.studyLogs) {
    if (!subjects.has(l.subjectId)) return { ok: false, error: `${l.date}の勉強の記録（${l.minutes}分）の資格が、バックアップの中に見つかりません` };
  }
  return { ok: true };
}

/** 文字列の簡易チェックサム（FNV-1a 32bit）。改ざん防止ではなく破損検出用 */
export function checksum(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, "0");
}
