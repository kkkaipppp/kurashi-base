import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { emptyData } from "@/lib/defaults";
import { buildWidgetSummary, WIDGET_TITLE_MAX } from "@/lib/widgetSummary";
import { buildCalendarItems } from "@/lib/calendarExport";
import { buildReminders, DEFAULT_REMINDERS } from "@/lib/reminders";
import { AUTO_BACKUP_KEEP_DAYS } from "@/lib/nativeBridge";
import { ADD_KINDS } from "@/components/AddFromQuery";
import { synth } from "./fixtures/synth";

// o11 A07：iPhone アプリ（Swift）と画面（TypeScript）の境目の約束を、両方のソースを読んで確かめる。
// Swift は Windows では組み立てられないので、組み立てと実機は Mac で行う（docs/integration/A07_NATIVE_BOUNDARY.md）
const root = path.resolve(import.meta.dirname, "..");
const read = (p: string) => fs.readFileSync(path.join(root, p), "utf8");
const PLUGIN = read("ios/App/App/WidgetBridgePlugin.swift");
const WIDGET = read("ios/App/KurashiWidget/KurashiWidget.swift");
const MAINVC = read("ios/App/App/MainViewController.swift");
const SWIFT_ALL = [PLUGIN, WIDGET, MAINVC, read("ios/App/App/AppDelegate.swift"), read("ios/App/App/SceneDelegate.swift")].join("\n");
const now = "2026-11-25T00:00:00.000Z";

/** Swift の struct の中の `let 名前: 型` を取り出す（入れ子の struct の中は除く） */
function swiftFields(src: string, name: string): Record<string, string> {
  const start = src.indexOf(`struct ${name}: Decodable {`);
  expect(start, `struct ${name}`).toBeGreaterThanOrEqual(0);
  let depth = 0;
  let body = "";
  for (let i = src.indexOf("{", start); i < src.length; i++) {
    const c = src[i];
    if (c === "{") depth++;
    if (c === "}") depth--;
    if (depth === 1 && c !== "{") body += c;
    if (depth === 0) break;
  }
  const out: Record<string, string> = {};
  for (const m of body.matchAll(/\blet (\w+): ([\w[\]?]+)/g)) out[m[1]] = m[2];
  return out;
}
/** JSON の値が Swift の型で読めるか（Int は安全な整数。? は null か無いのを許す） */
function fits(v: unknown, t: string): boolean {
  if (t.endsWith("?")) return v === undefined || v === null || fits(v, t.slice(0, -1));
  if (t === "String") return typeof v === "string";
  if (t === "Int") return typeof v === "number" && Number.isSafeInteger(v);
  if (t === "Bool") return typeof v === "boolean";
  if (t.startsWith("[")) return Array.isArray(v);
  return typeof v === "object" && v !== null; // 入れ子の struct（Ev・Day）
}
function expectDecodable(obj: Record<string, unknown>, fields: Record<string, string>, label: string) {
  for (const [k, t] of Object.entries(fields)) expect(fits(obj[k], t), `${label}.${k}（${t}）= ${JSON.stringify(obj[k])}`).toBe(true);
}

describe("A07：Swift と TypeScript の約束", () => {
  it("画面から呼ぶアプリの部品の名前は、すべて Swift の一覧にある", () => {
    const swift = new Set([...PLUGIN.matchAll(/CAPPluginMethod\(name: "(\w+)"/g)].map((m) => m[1]));
    const called = new Set<string>();
    const ts = ["src/lib/nativeBridge.ts", "src/components/NativeStatusCard.tsx", "src/components/NotifyCard.tsx"].map(read).join("\n");
    for (const m of ts.matchAll(/^\s+(\w+)\(options/gm)) called.add(m[1]); // NativeBridge の interface
    for (const m of ts.matchAll(/\bcall\("(\w+)"/g)) called.add(m[1]); // window.Capacitor から呼ぶ所
    expect(called.size).toBeGreaterThanOrEqual(10);
    for (const c of called) expect(swift.has(c), c).toBe(true);
    // Swift 側の @objc の関数も、一覧と同じ
    for (const s of swift) expect(PLUGIN).toContain(`@objc func ${s}(_ call: CAPPluginCall)`);
    expect(PLUGIN).toContain('public let jsName = "WidgetBridge"');
    expect(read("src/lib/nativeBridge.ts")).toContain('registerPlugin<NativeBridge>("WidgetBridge")');
  });

  it("ウィジェットの要約は、Swift の Summary として読める（200通りのデータと、名前のとても長い予定）", () => {
    const top = swiftFields(WIDGET, "Summary");
    expect(Object.keys(top)).toEqual(expect.arrayContaining(["today", "events", "moreEvents", "monthExpense", "monthIncome", "budget", "remaining", "budgetSpent", "updatedAt", "tomorrow"]));
    const ev = swiftFields(WIDGET, "Ev");
    const day = swiftFields(WIDGET, "Day");
    const check = (s: ReturnType<typeof buildWidgetSummary>) => {
      const o = JSON.parse(JSON.stringify(s));
      expectDecodable(o, top, "Summary");
      for (const e of [...o.events, ...o.tomorrow.events]) expectDecodable(e, ev, "Ev");
      expectDecodable(o.tomorrow, day, "Day");
      // 要約は 20,000 バイトまで（setSummary）
      expect(new TextEncoder().encode(JSON.stringify(s)).length).toBeLessThan(20_000);
    };
    for (let seed = 1; seed <= 200; seed++) for (const today of ["2026-11-25", "2026-12-31", "2028-02-29"]) check(buildWidgetSummary(synth(seed), today, now));
    const d = emptyData(now);
    d.budget.monthly = 50_000;
    d.events = Array.from({ length: 8 }, (_, i) => ({ id: `e${i}`, title: "長".repeat(5000), startDate: "2026-11-25", endDate: "2026-11-26", allDay: i % 2 === 0, startTime: "10:00", endTime: "11:00", note: "", createdAt: now, updatedAt: now }));
    const s = buildWidgetSummary(d, "2026-11-25", now);
    check(s);
    expect(s.events).toHaveLength(3);
    for (const e of [...s.events, ...s.tomorrow.events]) expect(Array.from(e.title).length).toBeLessThanOrEqual(WIDGET_TITLE_MAX);
  });

  it("カレンダーの一覧は、Swift の CalItem として読める（項目が1つでも欠けると、1件も書けない）", () => {
    const f = swiftFields(PLUGIN, "CalItem");
    expect(Object.keys(f).sort()).toEqual(["allDay", "endDate", "endTime", "location", "notes", "startDate", "startTime", "title"]);
    let n = 0;
    for (let seed = 1; seed <= 200; seed++)
      for (const it of buildCalendarItems(synth(seed), "2026-11-25")) {
        expectDecodable(it as unknown as Record<string, unknown>, f, "CalItem");
        expect(it.startDate).toMatch(/^\d{4}-\d{2}-\d{2}$/); // Swift は "yyyy-MM-dd HH:mm" で読む
        if (!it.allDay) expect(it.startTime).toMatch(/^(\d{2}:\d{2})?$/);
        n++;
      }
    expect(n).toBeGreaterThan(100);
  });

  it("通知の一覧は、Swift の ReminderItem として読める。ID は kb| で始まり、時刻は YYYY-MM-DDTHH:mm、60件まで", () => {
    const f = swiftFields(PLUGIN, "ReminderItem");
    expect(Object.keys(f).sort()).toEqual(["at", "body", "id", "title"]);
    expect(PLUGIN).toContain('private static let reminderPrefix = "kb|"');
    expect(PLUGIN).toContain("items.prefix(60)");
    let n = 0;
    for (let seed = 1; seed <= 200; seed++) {
      const list = buildReminders(synth(seed), "2026-11-25T06:00:00", { ...DEFAULT_REMINDERS, on: true, contractDays: 7 });
      expect(list.length).toBeLessThanOrEqual(60);
      for (const r of list) {
        expectDecodable(r as unknown as Record<string, unknown>, f, "ReminderItem");
        expect(r.id.startsWith("kb|")).toBe(true);
        expect(r.at).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/);
        n++;
      }
    }
    expect(n).toBeGreaterThan(0);
  });

  it("決まりの数字と名前が、両側で同じ（バックアップを残す日数・App Group・ウィジェットのボタン）", () => {
    expect(PLUGIN).toContain(`static let keepDays = ${AUTO_BACKUP_KEEP_DAYS}`);
    const group = "group.jp.kurashibase.personal";
    expect(PLUGIN).toContain(`static let appGroup = "${group}"`);
    expect(WIDGET).toContain(`private let appGroup = "${group}"`);
    expect(read("ios/App/App/App.entitlements")).toContain(group);
    expect(read("ios/App/KurashiWidget/KurashiWidget.entitlements")).toContain(group);
    // ウィジェットのボタンが開く種類は、画面が受け付ける種類の中
    const swiftKinds = MAINVC.match(/\[("[a-z]+"(?:, )?)+\]\.contains\(kind\)/)?.[0].match(/"([a-z]+)"/g)?.map((s) => s.slice(1, -1)) ?? [];
    expect(swiftKinds.sort()).toEqual([...ADD_KINDS].sort());
    for (const m of WIDGET.matchAll(/kurashibase:\/\/add\/(\w+)/g)) expect(ADD_KINDS as readonly string[]).toContain(m[1]);
    for (const m of WIDGET.matchAll(/button\("[^"]+", "(\w+)"/g)) expect(ADD_KINDS as readonly string[]).toContain(m[1]);
  });
});

describe("A07：保存の正本は1つ（画面の中の記録だけ）", () => {
  it("Swift は記録を持たない：画面の保存（localStorage・IndexedDB・WebView のデータ）を読まず、書かない", () => {
    for (const w of ["localStorage", "indexedDB", "IndexedDB", "WKWebsiteDataStore", "sqlite", "SQLite", "CoreData", "NSPersistentContainer"]) expect(SWIFT_ALL, w).not.toContain(w);
    // 画面に JavaScript で話しかけるのは、入力の窓を開く合図の1か所だけ
    const js = [...SWIFT_ALL.matchAll(/evaluateJavaScript\(/g)];
    expect(js).toHaveLength(1);
    expect(MAINVC).toMatch(/evaluateJavaScript\("window\.dispatchEvent\(new CustomEvent\('kb-open-add'/);
  });
  it("アプリが持つものは、記録から作った写しだけ（要約・自動バックアップ・カレンダー・通知）。アプリから画面へ記録を戻す道はない", () => {
    // アプリの部品が返すのは、状態と件数と、読み取った文字の行だけ
    const resolves = [...PLUGIN.matchAll(/call\.resolve\((.*)\)/g)].map((m) => m[1]);
    for (const r of resolves) expect(r, r).not.toMatch(/json|backup\b|transactions|records/i);
    // 自動バックアップは書くだけ（読み戻す関数はない。戻すのは本人が「ファイル」から選んで、設定の「復元」で）
    expect(PLUGIN).not.toMatch(/Data\(contentsOf|String\(contentsOf|readBackup|restore/i);
    // 画面の側：アプリの答えを記録に入れるのは、文字の読み取りだけで、それも入力画面の候補（保存は本人）
    const ts = fs.readdirSync(path.join(root, "src"), { recursive: true }) as string[];
    const users = ts.filter((f) => /\.(ts|tsx)$/.test(f) && /NativeBridge\.\w+\(/.test(read(path.join("src", f))));
    expect(users.map((f) => f.replaceAll("\\", "/")).sort()).toEqual(["app/import/page.tsx", "components/WidgetSync.tsx"]);
    const imp = read("src/app/import/page.tsx");
    expect(imp).toMatch(/const \{ lines \} = await NativeBridge\.recognizeText[\s\S]*?ui\.openTx\(\{/);
    expect(imp).not.toMatch(/recognizeText[\s\S]{0,1500}?(commit|setData|addTransaction)\(/);
    const sync = read("src/components/WidgetSync.tsx");
    expect(sync).not.toMatch(/useStore|commit\(|setData|update\(/);
  });
  it("自動バックアップは、記録が0件のときは書かない・いちばん多かったときの控えを残す（空で上書きしない）", () => {
    expect(read("src/components/WidgetSync.tsx")).toContain("if (records === 0) return;");
    expect(PLUGIN).toContain("guard records > 0 else");
    expect(PLUGIN).toContain("if records >= largest {");
    expect(PLUGIN).toContain("options: [.atomic]");
  });
});
