import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { ADD_KINDS, DEFAULT_NAV, NAV_ITEMS, activeNav, addOrder, contextKind, moveNav, parseAddFav, parseNav, serializeNav, validateNav } from "@/lib/navPrefs";

// o31 F001・F002・F003（o30 D003〜D007、T001〜T007）：右端の「追加」・下のメニュー 1〜4 個・全機能の入口。期待値は o31 01・02・03 から手で作った
const src = (p: string) => readFileSync(join(__dirname, "..", "src", p), "utf8");

describe("o31 T001 下のメニュー（1〜4個）", () => {
  it("初期はカレンダー・家計簿・やること・その他", () => {
    expect(DEFAULT_NAV).toEqual(["calendar", "money", "tasks", "more"]);
    expect(parseNav(null)).toEqual(DEFAULT_NAV);
  });
  it("その他を外して勉強を足す → 保存して読み直しても順序が同じ（再起動で維持）", () => {
    const next = [...DEFAULT_NAV.filter((x) => x !== "more"), "study"];
    const v = validateNav(next);
    expect(v.ok).toBe(true);
    const saved = serializeNav(v.ok ? v.ids : []);
    expect(parseNav(saved)).toEqual(["calendar", "money", "tasks", "study"]);
  });
  it("0個・5個・重複・知らない ID は保存しない（理由を返す）", () => {
    expect(validateNav([]).ok).toBe(false);
    expect(validateNav(["calendar", "money", "tasks", "more", "study"]).ok).toBe(false);
    expect(validateNav(["calendar", "calendar"]).ok).toBe(false);
    expect(validateNav(["calendar", "nope"]).ok).toBe(false);
  });
  it("壊れた保存・0件・知らない ID だけなら初期の構成に戻る。重複と知らない ID は取り除く（o31 01）", () => {
    expect(parseNav("{壊れた")).toEqual(DEFAULT_NAV);
    expect(parseNav(serializeNav([]))).toEqual(DEFAULT_NAV);
    expect(parseNav(JSON.stringify({ v: 1, items: ["nope", "x"] }))).toEqual(DEFAULT_NAV);
    expect(parseNav(JSON.stringify({ v: 1, items: ["goals", "goals", "nope", "trips"] }))).toEqual(["goals", "trips"]);
    // 古い形（配列だけ）も読む。4個より多ければ先頭の4個
    expect(parseNav(JSON.stringify(["study", "goals", "trips", "notes", "home"]))).toEqual(["study", "goals", "trips", "notes"]);
  });
  it("並べ替えは上下のボタン。端では変えない", () => {
    expect(moveNav(["calendar", "money", "tasks"], 2, -1)).toEqual(["calendar", "tasks", "money"]);
    expect(moveNav(["calendar", "money"], 0, -1)).toEqual(["calendar", "money"]);
    expect(moveNav(["calendar", "money"], 1, 1)).toEqual(["calendar", "money"]);
  });
  it("今の画面のタブ。家計簿の中の画面（履歴など）は家計簿。並んでいない画面は null", () => {
    expect(activeNav("/history", DEFAULT_NAV)).toBe("money");
    expect(activeNav("/calendar", DEFAULT_NAV)).toBe("calendar");
    expect(activeNav("/study", DEFAULT_NAV)).toBeNull();
    expect(activeNav("/study", ["study", "calendar"])).toBe("study");
    expect(activeNav("/", ["home"])).toBe("home");
    expect(activeNav("/reportx", DEFAULT_NAV)).toBeNull();
  });
  it("登録表の画面は、どれも実在する画面（app/<道筋>/page.tsx）", () => {
    for (const n of NAV_ITEMS) {
      const file = n.href === "/" ? "app/page.tsx" : `app${n.href}/page.tsx`;
      expect(() => src(file), n.href).not.toThrow();
    }
  });
});

describe("o31 T002・T007 右端の「追加」", () => {
  it("今の画面に合う種類が先頭、次にお気に入り、残りは下。全種類に届く・重複なし", () => {
    const fav = parseAddFav(null);
    const o = addOrder("/calendar", fav);
    expect(o.top[0]).toBe("event");
    const all = [...o.top, ...o.rest];
    expect(new Set(all).size).toBe(all.length);
    expect([...all].sort()).toEqual(ADD_KINDS.map((k) => k.id).sort());
    expect(addOrder("/history", fav).top[0]).toBe("expense");
    expect(addOrder("/goals", fav).top[0]).toBe("goal");
    expect(contextKind("/menu")).toBeNull();
  });
  it("お気に入りは最大4件。壊れた値・知らない種類は除き、空なら初期", () => {
    expect(parseAddFav(JSON.stringify(["goal", "goal", "x", "note", "trip", "study", "expense"]))).toEqual(["goal", "note", "trip", "study"]);
    expect(parseAddFav("[")).toEqual(["expense", "event", "task", "income"]);
  });
  it("「追加」は下のメニューの最後の子要素で、文字「追加」と 48px 以上の高さ（D003）。公開版の下のメニューは変えない（C025）", () => {
    const shell = src("components/AppShell.tsx");
    const tab = shell.slice(shell.indexOf("function TabBar()"));
    const nav = tab.slice(tab.indexOf("<nav"), tab.indexOf("</nav>"));
    const lastLink = nav.lastIndexOf("</Link>");
    const addBtn = nav.indexOf('data-testid="nav-add"');
    expect(addBtn).toBeGreaterThan(lastLink);
    expect(nav).toMatch(/min-h-12[^"]*"[\s\S]*?追加\s*<\/button>/);
    expect(shell).toMatch(/IS_PERSONAL \? \([\s\S]*<TabBar \/>[\s\S]*\) : \([\s\S]*<BottomNav \/>/);
    // 公開版の下のメニュー（中央の＋・ホーム/カレンダー/家計簿/メニュー）は残す。「振り返り」→「家計簿」は言葉の直し（両方の版。o31 07）
    expect(shell).toContain('{ href: "/report", label: "家計簿", Icon: IconChart }');
    expect(shell).toContain("function BottomNav()");
  });
  it("選んだ種類だけ開く（選ぶまで保存しない）。日付はカレンダーの選んだ日を引き継ぐ", () => {
    const tab = src("components/AppShell.tsx");
    expect(tab).toContain('ui.openTx({ mode: "new", type: k, date })');
    expect(tab).toContain('ui.openEvent({ mode: "new", date })');
    expect(tab).not.toMatch(/onPick[\s\S]{0,400}(addTx|saveTx|store\.)/);
  });
});

describe("o31 T003・T005 全機能の入口（D005）", () => {
  it("自分用の見出しには、いつも「検索」と「すべての機能」がある（その他を外しても届く）", () => {
    const ui = src("components/ui.tsx");
    const header = ui.slice(ui.indexOf("export function PageHeader"), ui.indexOf("export function Empty"));
    expect(header).toMatch(/IS_PERSONAL \? \([\s\S]*<GlobalActions \/>/);
    const ga = ui.slice(ui.indexOf("export function GlobalActions"));
    expect(ga).toContain('href="/search"');
    expect(ga).toContain('href="/menu"');
    // ホーム（PageHeader を使わない）にも置く
    expect(src("app/page.tsx")).toContain("<GlobalActions />");
  });
  it("設定に、下のメニューの編集と起動時の画面がある（自分用だけ）", () => {
    const s = src("app/settings/page.tsx");
    expect(s).toMatch(/const NavSettingsCard = PERSONAL_BUILD \?/);
    expect(s).toMatch(/const StartScreenCard = PERSONAL_BUILD \?/);
  });
});
