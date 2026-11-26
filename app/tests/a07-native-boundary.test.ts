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
const readRaw = (p: string) => fs.readFileSync(path.join(root, p), "utf8");
/** コメントを除く（コメントに同じ書き方が残っていても、試験が通ってしまわないように。点検 中-4・2回目 足りない試験2）。URL の :// は残す */
const code = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
const read = (p: string) => code(readRaw(p));
const PLUGIN = read("ios/App/App/WidgetBridgePlugin.swift");
const WIDGET = read("ios/App/KurashiWidget/KurashiWidget.swift");
const MAINVC = read("ios/App/App/MainViewController.swift");
/** ios/App の中の Swift のファイルすべて（新しいファイルが増えても見る。組み立ての出力は除く） */
const SWIFT_FILES = (fs.readdirSync(path.join(root, "ios/App"), { recursive: true }) as string[])
  .map((f) => f.replaceAll("\\", "/"))
  .filter((f) => f.endsWith(".swift") && !/(^|\/)(build|DerivedData|Pods|\.build)\//.test(f));
const SWIFT_ALL = SWIFT_FILES.map((f) => read(`ios/App/${f}`)).join("\n");
/** 括弧の対応を見て、call.resolve( … ) の中身を取り出す（何行に分けて書いても拾う） */
function resolveArgs(src: string): string[] {
  const out: string[] = [];
  for (let i = src.indexOf("call.resolve("); i >= 0; i = src.indexOf("call.resolve(", i + 1)) {
    let depth = 0;
    let j = i + "call.resolve".length;
    for (; j < src.length; j++) {
      if (src[j] === "(") depth++;
      if (src[j] === ")" && --depth === 0) break;
    }
    out.push(src.slice(i + "call.resolve(".length, j));
  }
  return out;
}
/** Swift の部品ごとに、画面から受け取る項目（call.getString("x") など）と、その型 */
function swiftParams(): Record<string, Record<string, string>> {
  const out: Record<string, Record<string, string>> = {};
  for (const part of PLUGIN.split(/@objc func /).slice(1)) {
    const name = part.match(/^(\w+)\(/)![1];
    out[name] = {};
    for (const m of part.matchAll(/call\.get(String|Int|Bool|Double|Array|Object)\("(\w+)"\)/g)) out[name][m[2]] = m[1];
  }
  return out;
}
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
  // 名前を変える・自分で読む書き方をしていたら、この取り出し方では確かめられない（点検 中-5）
  expect(body, `${name} に var・CodingKeys・init(from:)・初期値つきの let がない`).not.toMatch(/\bvar \w+|CodingKeys|init\(from|\blet \w+(: [\w[\]?]+)? =/);
  const out: Record<string, string> = {};
  for (const m of body.matchAll(/\blet (\w+): ([\w[\]?]+)/g)) out[m[1]] = m[2];
  expect(Object.keys(out).length, `${name} の項目`).toBeGreaterThan(0);
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

  it("画面が送る項目の名前と型が、Swift の受け取る名前と型に合う（名前が違うと、受け取れずに黙って失敗する。点検 中-5）", () => {
    const sw = swiftParams();
    // 画面の側：NativeBridge の interface（lib/nativeBridge.ts）と、window.Capacitor から呼ぶ所の項目
    const nb = read("src/lib/nativeBridge.ts");
    const ts: Record<string, Record<string, string>> = {};
    for (const m of nb.matchAll(/^\s+(\w+)\(options: \{([^}]*)\}\)/gm)) {
      ts[m[1]] = {};
      for (const f of m[2].matchAll(/(\w+)\??: (\w+)/g)) ts[m[1]][f[1]] = f[2];
    }
    const cards = ["src/components/NativeStatusCard.tsx", "src/components/NotifyCard.tsx"].map(read).join("\n");
    for (const m of cards.matchAll(/\bcall\("(\w+)"(?:, \{([^}]*)\})?\)/g)) {
      ts[m[1]] ??= {};
      for (const f of (m[2] ?? "").matchAll(/(\w+): (true|false|[\w.]+)/g)) ts[m[1]][f[1]] = f[2] === "true" || f[2] === "false" ? "boolean" : "unknown";
    }
    const want: Record<string, string> = { String: "string", Int: "number", Bool: "boolean" };
    let n = 0;
    for (const [method, params] of Object.entries(sw))
      for (const [key, type] of Object.entries(params)) {
        expect(ts[method], `${method} を画面から呼んでいる`).toBeDefined();
        expect(ts[method][key], `${method} の ${key}（Swift は get${type}）を画面が送っている`).toBeDefined();
        if (ts[method][key] !== "unknown") expect(ts[method][key], `${method}.${key}`).toBe(want[type]);
        n++;
      }
    expect(n).toBeGreaterThanOrEqual(10);
    // JSON の読み方を変える設定はしていない（項目名は、そのままの名前で読む）
    expect(SWIFT_ALL).not.toMatch(/keyDecodingStrategy|dateDecodingStrategy|convertFromSnakeCase/);
  });

  it("Swift が返す項目の名前が、画面の戻り値の型（lib/nativeBridge.ts）にある（2回目 足りない試験3）", () => {
    const nb = read("src/lib/nativeBridge.ts");
    const tsReturns: Record<string, Set<string>> = {};
    for (const m of nb.matchAll(/^\s+(\w+)\(options: \{[^}]*\}\): Promise<(?:\{([^}]*)\}|void)>/gm)) tsReturns[m[1]] = new Set([...(m[2] ?? "").matchAll(/(\w+)\??:/g)].map((f) => f[1]));
    expect(Object.keys(tsReturns).sort()).toEqual(["readCalendarEvents", "recognizeText", "scheduleReminders", "setSummary", "syncCalendar", "writeBackup"]);
    const parts = PLUGIN.split(/@objc func /).slice(1);
    let n = 0;
    for (const part of parts) {
      const name = part.match(/^(\w+)\(/)![1];
      if (!tsReturns[name]) continue;
      for (const r of resolveArgs(part)) {
        for (const k of r.matchAll(/"(\w+)":/g)) {
          expect(tsReturns[name].has(k[1]), `${name} が返す ${k[1]} を、画面の型が知っている`).toBe(true);
          n++;
        }
      }
    }
    expect(n).toBeGreaterThanOrEqual(8);
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
    const links = [...WIDGET.matchAll(/kurashibase:\/\/add\/(\w+)/g)].map((m) => m[1]);
    const buttons = [...WIDGET.matchAll(/button\("[^"]+", "(\w+)"/g)].map((m) => m[1]);
    expect(links.length).toBeGreaterThan(0); // 見つからないときに素通りしない（点検 低-5）
    expect(buttons.sort()).toEqual(["event", "expense", "income"]);
    for (const k of [...links, ...buttons]) expect(ADD_KINDS as readonly string[]).toContain(k);
  });
});

describe("A07：保存の正本は1つ（画面の中の記録だけ）", () => {
  it("Swift は記録を持たない：画面の保存（localStorage・IndexedDB・WebView のデータ）を読まず、書かない", () => {
    expect(SWIFT_FILES.length).toBeGreaterThanOrEqual(5);
    for (const w of ["localStorage", "indexedDB", "IndexedDB", "WKWebsiteDataStore", "sqlite", "SQLite", "CoreData", "NSPersistentContainer", "notifyListeners", "WKUserScript", "WKScriptMessageHandler", "addUserScript", "callAsyncJavaScript"]) expect(SWIFT_ALL, w).not.toContain(w);
    // 画面に JavaScript で話しかけるのは、入力の窓を開く合図の1か所だけ
    const js = [...SWIFT_ALL.matchAll(/evaluateJavaScript\(/g)];
    expect(js).toHaveLength(1);
    expect(MAINVC).toMatch(/evaluateJavaScript\("window\.dispatchEvent\(new CustomEvent\('kb-open-add'/);
  });
  it("アプリが持つものは、記録から作った写しだけ（要約・自動バックアップ・カレンダー・通知）。アプリから記録へ入る道は、本人が押す iPhone のカレンダーの取り込み（A5）だけ", () => {
    // アプリの部品が返すのは、状態と件数と、読み取った文字の行だけ
    const resolves = resolveArgs(PLUGIN);
    expect(resolves.length).toBeGreaterThanOrEqual(15);
    for (const r of resolves) expect(r, r).not.toMatch(/json|backup\b|transactions|records|contents/i);
    // 自動バックアップは書くだけ（読み戻す関数はない。戻すのは本人が「ファイル」から選んで、設定の「復元」で）
    expect(SWIFT_ALL).not.toMatch(/Data\(contentsOf|String\(contentsOf|contents\(atPath|FileHandle\(forReading|readBackup|restore/i);
    // 画面の側：アプリの答えを記録に入れるのは、文字の読み取りだけで、それも入力画面の候補（保存は本人）
    const ts = fs.readdirSync(path.join(root, "src"), { recursive: true }) as string[];
    const users = ts.filter((f) => /\.(ts|tsx)$/.test(f) && /NativeBridge\.\w+\(/.test(read(path.join("src", f))));
    expect(users.map((f) => f.replaceAll("\\", "/")).sort()).toEqual(["app/import/page.tsx", "components/WidgetSync.tsx"]);
    const imp = read("src/app/import/page.tsx");
    expect(imp).toMatch(/const \{ lines \} = await NativeBridge\.recognizeText[\s\S]*?ui\.openTx\(\{/);
    // 記録を書き換えられるのは useStore() だけ。アプリの部品とやり取りする画面は、どれも useStore を使わない（読むだけ。点検 中-4）
    for (const f of ["src/app/import/page.tsx", "src/components/WidgetSync.tsx", "src/components/NativeStatusCard.tsx", "src/components/NotifyCard.tsx"]) expect(read(f), f).not.toMatch(/\buseStore\b/);
    expect(read("src/lib/store.tsx")).toMatch(/export function useStore\(\): Store/);
    // window.Capacitor から呼ぶ画面は、ここに挙げた3つだけ
    const caps = ts.filter((f) => /\.(ts|tsx)$/.test(f) && /nativePromise\(/.test(read(path.join("src", f))));
    expect(caps.map((f) => f.replaceAll("\\", "/")).sort()).toEqual(["components/NativeCalendarImportCard.tsx", "components/NativeStatusCard.tsx", "components/NotifyCard.tsx"]);
    // A5（2026-11-26 平尾さん「全部おすすめで」）：アプリから記録へ入る道は、iPhone のカレンダーの取り込みの1つだけ。
    // 本人が「読む」「N件を取り込む」を押したときだけで、ファイルの取り込み（.ics）と同じく、件数を見せてから、取り消しの控えつきで足す（消さない・書き換えない）
    const nc = read("src/components/NativeCalendarImportCard.tsx");
    expect(nc).toContain('cap.nativePromise("WidgetBridge", "readCalendarEvents", { from, to })');
    expect(nc).toMatch(/const run = async \(\) => \{[\s\S]*?applyIcsImport\(base, p\.add,[\s\S]*?store\.replaceAll\(next, `iPhone のカレンダーから予定を\$\{p\.add\.length\}件取り込む`, base\)/);
    expect(nc.match(/store\.(replaceAll|commit|update|set)\w*\(/g)).toEqual(["store.replaceAll("]);
  });
  it("自動バックアップは、記録が0件のときは書かない・いちばん多かったときの控えを残す（空で上書きしない）", () => {
    expect(read("src/components/WidgetSync.tsx")).toContain("if (records === 0) return;");
    expect(PLUGIN).toContain("guard records > 0 else");
    expect(PLUGIN).toContain("if records >= largest {"); // 件数が最多と同じか多いときは、いつも書き直す（1日1回にしない。A08 点検2回目 中-1）
    expect(PLUGIN).not.toMatch(/largestDay/);
    expect(PLUGIN).toContain("options: [.atomic]");
  });
});

describe("o11 A09 一次点検 中-3：同じ日の自動バックアップを、件数の少ない中身で上書きする前に残す", () => {
  it("その日の最多の件数より少ないときは、上書きの前に、その日の前の中身を _before-decrease として1つだけ残す", () => {
    expect(PLUGIN).toMatch(/if records < dayMax && fm\.fileExists\(atPath: todayURL\.path\) && !fm\.fileExists\(atPath: keptURL\.path\) \{\s*try fm\.copyItem\(at: todayURL, to: keptURL\)\s*\}\s*try bytes\.write\(to: todayURL, options: \[\.atomic\]\)/);
    expect(PLUGIN).toContain('"\\(Self.prefix)\\(day)_before-decrease.json"');
    expect(PLUGIN).toContain('if records > dayMax { UserDefaults.standard.set("\\(day):\\(records)", forKey: Self.dayRecordsKey) }');
  });
});
