// 画面のスクリーンショットを、版ごとに同じ条件で撮って保存する（進み具合の記録）。
// 追加のパッケージは使わない：Windows の Edge をヘッドレスで起動し、Chrome DevTools Protocol（Node の WebSocket）で操作する。
//
//   node tools/screens/capture.mjs --base http://localhost:3211 --label v5 --commit 2cf3cb5 [--date 2026-11-22]
//
// 出力：docs/screens/<日付>_<label>_<commit>/{empty,sample}/NN_画面.jpg と manifest.json
// 撮影用のブラウザは一時的なプロフィールで開く。サンプルデータはその中だけに入り、実際の記録には触れない。

import { spawn } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { sampleData } from "./sample-data.mjs";

const args = Object.fromEntries(
  process.argv.slice(2).reduce((a, x, i, all) => (x.startsWith("--") ? [...a, [x.slice(2), all[i + 1]]] : a), []),
);
const BASE = args.base ?? "http://localhost:3211";
const LABEL = args.label ?? "dev";
const COMMIT = args.commit ?? "unknown";
const DATE = args.date ?? new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10);
const EDGE = args.edge ?? "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe";
const ROOT = resolve(import.meta.dirname, "..", "..");
const OUT = join(ROOT, "docs", "screens", `${DATE}_${LABEL}_${COMMIT}${args.width && args.width !== "375" ? `_${args.width}` : ""}`);
const WIDTH = Number(args.width ?? 375);
const HEIGHT = Number(args.height ?? 812);
const KEY = "kurashi-base:data:v1";
const SCHEMA = Number(args.schema ?? 2); // Phase 1（データ形式1）の版を撮るときは --schema 1

/** データ形式1の版に入れるサンプル（v2 で足した一覧と、v5 の旅行・予定の追加項目を外す） */
function seedFor(schema) {
  const d = sampleData();
  if (schema !== 1) return d;
  for (const k of ["nisa", "notes", "tasks", "assets", "contracts", "health", "documents", "studySubjects", "studyLogs", "goals", "trips"]) delete d[k];
  d.schemaVersion = 1;
  d.events = d.events.map(({ location, items, tripId, kind, cost, ...e }) => e); // eslint-disable-line no-unused-vars
  return d;
}

/** 撮る画面。act はページを開いたあとに行う操作（ボタンを押すなど）。無い画面（古い版）は飛ばす */
// 開いているシート（role=dialog）があれば、その中のボタンを優先して押す
const clickText = (text) => `(() => { const scope = [...document.querySelectorAll('[role=dialog]')].pop() ?? document; const b = [...scope.querySelectorAll('button,a')].find(e => e.textContent.trim().replace(/^[^\\p{L}\\p{N}]+/u, '').startsWith(${JSON.stringify(text)}) || e.getAttribute('aria-label')?.startsWith(${JSON.stringify(text)})); if (b) { b.click(); return true } return false })()`;
const SCREENS = [
  { id: "01_home", name: "ホーム", path: "/" },
  { id: "02_add", name: "＋（何を追加するか）", path: "/", act: [clickText("追加する")] },
  { id: "03_event_add", name: "予定を追加", path: "/", act: [clickText("追加する"), clickText("予定")] },
  { id: "04_event_detail", name: "予定の詳細", path: "/", act: [`(() => { const b = document.querySelector('main li button'); if (b) { b.click(); return true } return false })()`], sampleOnly: true },
  { id: "04b_event_edit", name: "予定を編集", path: "/", act: [`(() => { const b = document.querySelector('main li button'); if (b) { b.click(); return true } return false })()`, clickText("編集する")], sampleOnly: true },
  { id: "05_calendar", name: "カレンダー", path: "/calendar" },
  { id: "06_report", name: "振り返り", path: "/report" },
  { id: "07_trips", name: "旅行", path: "/trips" },
  { id: "08_trip_detail", name: "旅行の詳細", path: "/trips?open=trip_sample_kyoto", sampleOnly: true },
  { id: "09_study", name: "資格の学習", path: "/study" },
  { id: "10_menu", name: "メニュー", path: "/menu" },
  { id: "11_guide", name: "使い方", path: "/guide" },
  { id: "12_settings", name: "設定", path: "/settings" },
  { id: "12b_backup", name: "バックアップと復元", path: "/settings", act: [`(() => { const e = document.getElementById("backup"); if (e) { e.scrollIntoView(); return true } return false })()`] },
  { id: "13_history", name: "取引履歴", path: "/history" },
];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const profile = mkdtempSync(join(tmpdir(), "kb-shots-"));
  const port = 9300 + Math.floor(Math.random() * 500);
  const edge = spawn(EDGE, [`--headless=new`, `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`, "--no-first-run", "--hide-scrollbars", "about:blank"], { stdio: "ignore" });
  try {
    let target;
    for (let i = 0; i < 50 && !target; i++) {
      await sleep(200);
      try {
        target = (await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()).find((t) => t.type === "page");
      } catch {
        /* まだ起動中 */
      }
    }
    if (!target) throw new Error("Edge を起動できませんでした");
    const ws = new WebSocket(target.webSocketDebuggerUrl);
    await new Promise((r, j) => ((ws.onopen = r), (ws.onerror = j)));
    let seq = 0;
    const pending = new Map();
    const waiters = [];
    ws.onmessage = (m) => {
      const msg = JSON.parse(m.data);
      if (msg.id && pending.has(msg.id)) {
        pending.get(msg.id)(msg);
        pending.delete(msg.id);
      } else if (msg.method) waiters.filter((w) => w.method === msg.method).forEach((w) => w.resolve(msg));
    };
    const send = (method, params = {}) =>
      new Promise((r) => {
        const id = ++seq;
        pending.set(id, r);
        ws.send(JSON.stringify({ id, method, params }));
      });
    const once = (method, timeout = 10000) =>
      new Promise((resolve) => {
        const w = { method, resolve };
        waiters.push(w);
        setTimeout(() => resolve(null), timeout);
      });
    const evaluate = async (expr) => (await send("Runtime.evaluate", { expression: expr, awaitPromise: true, returnByValue: true })).result?.result?.value;
    const go = async (url) => {
      const loaded = once("Page.loadEventFired");
      await send("Page.navigate", { url });
      await loaded;
      await sleep(900); // データの読み込みと描画を待つ
    };

    await send("Page.enable");
    await send("Runtime.enable");
    await send("Emulation.setDeviceMetricsOverride", { width: WIDTH, height: HEIGHT, deviceScaleFactor: 2, mobile: true });
    await send("Emulation.setTouchEmulationEnabled", { enabled: true });

    const manifest = { date: DATE, schema: SCHEMA, label: LABEL, commit: COMMIT, base: BASE, viewport: `${WIDTH}x${HEIGHT}@2x`, states: {}, note: "サンプルデータは架空。撮影用の一時プロフィールの中だけに入れた" };
    for (const state of ["empty", "sample"]) {
      mkdirSync(join(OUT, state), { recursive: true });
      manifest.states[state] = [];
      await go(`${BASE}/`);
      await evaluate(state === "empty" ? `localStorage.clear()` : `localStorage.clear(); localStorage.setItem(${JSON.stringify(KEY)}, ${JSON.stringify(JSON.stringify(seedFor(SCHEMA)))})`);
      for (const s of SCREENS) {
        if (state === "empty" && s.sampleOnly) continue;
        const status = (await fetch(BASE + s.path.split("?")[0]).catch(() => null))?.status;
        if (status !== 200) {
          manifest.states[state].push({ ...s, file: null, skipped: `この版には無い画面（HTTP ${status ?? "接続できない"}）` });
          continue;
        }
        await go(BASE + s.path);
        let acted = true;
        for (const a of s.act ?? []) {
          acted = (await evaluate(a)) && acted;
          await sleep(700);
        }
        if (args.text) {
          // 文言の見直し用：画面の文字（シートが開いていればその中も）を保存する
          const text = await evaluate(`document.body.innerText`);
          writeFileSync(join(OUT, state, `${s.id}.txt`), String(text ?? ""));
        }
        const shot = await send("Page.captureScreenshot", { format: "jpeg", quality: 72 });
        const file = `${s.id}.jpg`;
        writeFileSync(join(OUT, state, file), Buffer.from(shot.result.data, "base64"));
        manifest.states[state].push({ id: s.id, name: s.name, path: s.path, file: `${state}/${file}`, ...(acted ? {} : { note: "操作のボタンが見つからず、開いただけの画面" }) });
        process.stdout.write(`${state}/${file} `);
      }
    }
    writeFileSync(join(OUT, "manifest.json"), JSON.stringify(manifest, null, 2) + "\n");
    ws.close();
    console.log(`\n保存：${OUT}`);
  } finally {
    edge.kill();
    await sleep(500);
    try {
      rmSync(profile, { recursive: true, force: true });
    } catch {
      /* Edge が掴んでいることがある。一時フォルダなので残っても害はない */
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
