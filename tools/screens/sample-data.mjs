// スクリーンショット用のサンプルデータ（架空）。日付は撮影した日を基準に作る。
// 撮影用の一時プロフィールの中だけで使う。実際の記録・公開のデータには入れない。

const pad = (n) => String(n).padStart(2, "0");
const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const day = (offset) => {
  const d = new Date();
  d.setHours(12, 0, 0, 0);
  d.setDate(d.getDate() + offset);
  return ymd(d);
};
const ts = "2026-11-01T00:00:00.000Z";

export function sampleData() {
  const t = day(0);
  const thisMonth = t.slice(0, 8);
  const lastMonth = (() => {
    const d = new Date();
    d.setDate(1);
    d.setMonth(d.getMonth() - 1);
    return ymd(d).slice(0, 8);
  })();
  const tx = (id, date, amount, categoryId, merchant, type = "expense") => ({
    id, type, date, amount, currency: "JPY", categoryId, merchant, paymentMethod: "card", note: "", source: "manual", createdAt: ts, updatedAt: ts,
  });
  const ev = (id, title, date, startTime, endTime, extra = {}) => ({
    id, title, startDate: date, endDate: date, allDay: !startTime, startTime: startTime ?? "", endTime: endTime ?? "", note: "", createdAt: ts, updatedAt: ts, ...extra,
  });
  const trip0 = day(10);
  const cats = [
    ["exp-1", "食費"], ["exp-2", "日用品"], ["exp-3", "交通"], ["exp-4", "住まい"], ["exp-5", "光熱・通信"], ["exp-6", "医療・健康"],
    ["exp-7", "趣味・娯楽"], ["exp-8", "交際"], ["exp-9", "衣服・美容"], ["exp-10", "その他"],
  ].map(([id, name], i) => ({ id, name, kind: "expense", order: i, archived: false }));
  const inc = ["給与", "副収入", "その他の収入"].map((name, i) => ({ id: `inc-${i + 1}`, name, kind: "income", order: i, archived: false }));

  return {
    schemaVersion: 2,
    transactions: [
      tx("tx_s1", t, 1280, "exp-1", "スーパー（サンプル）"),
      tx("tx_s2", day(-1), 540, "exp-3", "電車（サンプル）"),
      tx("tx_s3", day(-2), 3200, "exp-8", "ランチ会（サンプル）"),
      tx("tx_s4", `${thisMonth}01`, 85000, "exp-4", "家賃（サンプル）"),
      tx("tx_s5", `${thisMonth}05`, 6400, "exp-5", "電気・ガス（サンプル）"),
      tx("tx_s6", `${thisMonth}03`, 250000, "inc-1", "給与（サンプル）", "income"),
      tx("tx_s7", `${lastMonth}10`, 4200, "exp-1", "スーパー（サンプル）"),
      tx("tx_s8", `${lastMonth}20`, 85000, "exp-4", "家賃（サンプル）"),
    ],
    events: [
      ev("ev_s1", "歯医者（サンプル）", t, "10:00", "11:00", { location: "駅前歯科" }),
      ev("ev_s2", "友人と食事（サンプル）", t, "19:00", "21:00", { location: "渋谷駅", items: [{ id: "it_s1", text: "お土産", done: false }] }),
      ev("ev_s3", "燃えないゴミの日（サンプル）", day(1), null, null),
      ev("ev_s4", "新幹線で京都へ（サンプル）", trip0, "08:00", "10:15", { tripId: "trip_sample_kyoto", kind: "move", location: "京都駅", cost: 14000 }),
      ev("ev_s5", "清水寺（サンプル）", trip0, "13:00", "15:00", { tripId: "trip_sample_kyoto", kind: "sight", location: "清水寺" }),
      ev("ev_s6", "旅館に泊まる（サンプル）", trip0, "16:00", "17:00", { tripId: "trip_sample_kyoto", kind: "stay", location: "祇園" }),
    ],
    trips: [{ id: "trip_sample_kyoto", title: "京都旅行（サンプル）", startDate: trip0, endDate: day(12), destination: "京都", budget: 60000, note: "", createdAt: ts, updatedAt: ts }],
    categories: [...cats, ...inc],
    recurring: [{ id: "rc_s1", name: "スマホ代（サンプル）", amount: 2980, cycle: "monthly", anchorDay: 27, nextDueDate: day(5), categoryId: "exp-5", paymentMethod: "card", active: true, createdAt: ts, updatedAt: ts }],
    budget: { monthly: 120000 },
    prefs: { home: { todaySpent: true, nextRecurring: true, needsReview: true } },
    meta: { createdAt: ts, lastBackupAt: day(-3) + "T10:00:00.000Z" },
    nisa: [],
    notes: [],
    tasks: [
      { id: "task_s1", title: "住民票を取りに行く（サンプル）", due: day(-1), done: false, note: "", createdAt: ts, updatedAt: ts },
      { id: "task_s2", title: "保険の書類を出す（サンプル）", due: t, done: false, note: "", createdAt: ts, updatedAt: ts },
    ],
    assets: [],
    contracts: [],
    health: [],
    documents: [],
    studySubjects: [{ id: "subj_s1", name: "日商簿記3級", examDate: day(45), targetHours: 100, archived: false, catalogId: "boki3", createdAt: ts, updatedAt: ts }],
    studyLogs: [
      { id: "slog_s1", subjectId: "subj_s1", date: day(-1), minutes: 60, note: "", createdAt: ts, updatedAt: ts },
      { id: "slog_s2", subjectId: "subj_s1", date: t, minutes: 30, note: "", createdAt: ts, updatedAt: ts },
    ],
    goals: [],
  };
}
