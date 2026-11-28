import type { AppData, Plan } from "./types";

// 復元（backup.ts）から使うので、計画の画面の言葉（plan.ts の種類の名前など）を読み込まない別のファイルにする（公開版の組み立てに自分用の文字を入れない）

/**
 * 指し先の無い計画のつながり（planId・Plan.tripId）を外す。記録そのものは残し、更新日時も変えない（中身は変わっていないため）。
 * 復元（置き換え・追加）の最後に使う（To-Be 点検 高-1）。何も無ければ同じデータを返す
 */
export function dropDanglingPlanLinks(d: AppData): { data: AppData; dropped: number } {
  const plans = new Set((d.plans ?? []).map((p) => p.id));
  const trips = new Set((d.trips ?? []).map((t) => t.id));
  let dropped = 0;
  const unlink = <T extends { planId?: string }>(xs: T[]): T[] => {
    if (!xs.some((x) => x.planId && !plans.has(x.planId))) return xs;
    return xs.map((x) => {
      if (!x.planId || plans.has(x.planId)) return x;
      dropped++;
      const { planId: _p, ...rest } = x; // eslint-disable-line @typescript-eslint/no-unused-vars
      return rest as T;
    });
  };
  const events = unlink(d.events);
  const tasks = unlink(d.tasks);
  const transactions = unlink(d.transactions);
  const reservations = unlink(d.reservations ?? []);
  const planList = (d.plans ?? []).some((p) => p.tripId && !trips.has(p.tripId))
    ? (d.plans ?? []).map((p) => {
        if (!p.tripId || trips.has(p.tripId)) return p;
        dropped++;
        const { tripId: _t, ...rest } = p; // eslint-disable-line @typescript-eslint/no-unused-vars
        return rest as Plan;
      })
    : d.plans;
  return dropped ? { data: { ...d, events, tasks, transactions, ...(d.reservations ? { reservations } : {}), plans: planList }, dropped } : { data: d, dropped: 0 };
}
