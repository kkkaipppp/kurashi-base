// docs/screens/ の各版の manifest.json から、版ごとに見比べる一覧（docs/screens/index.html）と index.json を作る。
//   node tools/screens/gallery.mjs
// index.html はファイルを直接開いて見られる（画像は相対パス）。

import { readdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { join, resolve } from "node:path";

const DIR = resolve(import.meta.dirname, "..", "..", "docs", "screens");
const caps = readdirSync(DIR, { withFileTypes: true })
  .filter((d) => d.isDirectory() && existsSync(join(DIR, d.name, "manifest.json")))
  .map((d) => ({ dir: d.name, ...JSON.parse(readFileSync(join(DIR, d.name, "manifest.json"), "utf8")) }))
  .sort((a, b) => (a.date + a.dir).localeCompare(b.date + b.dir));

// 版の並び（古い→新しい）。同じ日付は撮った版の順（phase1 < v2 < v3 < v4 < v5）
const ORDER = ["phase1", "v2", "v3", "v4-beta", "v5", "v5-fix", "go-ready", "copy"];
caps.sort((a, b) => a.date.localeCompare(b.date) || (ORDER.indexOf(a.label) + 99) % 99 - (ORDER.indexOf(b.label) + 99) % 99);

const index = caps.map((c) => ({ dir: c.dir, date: c.date, label: c.label, commit: c.commit, viewport: c.viewport, screens: Object.fromEntries(Object.entries(c.states).map(([s, list]) => [s, list.map((x) => ({ id: x.id, name: x.name, file: x.file ? `${c.dir}/${x.file}` : null, skipped: x.skipped ?? null, note: x.note ?? null }))])) }));
writeFileSync(join(DIR, "index.json"), JSON.stringify(index, null, 2) + "\n");

const payload = JSON.stringify(index).replace(/</g, "\\u003c");
const html = `<!doctype html>
<html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>くらしベース 画面の記録</title>
<style>
:root{--bg:#f6f4ef;--card:#fff;--ink:#1f2421;--ink3:#8a908b;--line:#e4e0d6;--brand:#2f6f5e}
@media (prefers-color-scheme:dark){:root{--bg:#171614;--card:#22201d;--ink:#eeeae2;--ink3:#8a8478;--line:#38342e;--brand:#6fb39d}}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--ink);font:14px/1.6 -apple-system,BlinkMacSystemFont,"Hiragino Sans","Yu Gothic UI",sans-serif}
header{padding:16px;max-width:1400px;margin:auto}h1{margin:0;font-size:20px}.meta{color:var(--ink3);font-size:12px}
.tools{display:flex;flex-wrap:wrap;gap:12px;align-items:center;margin-top:10px;font-size:13px}
select,label{font:inherit;color:inherit}select{background:var(--card);border:1px solid var(--line);border-radius:8px;padding:4px 8px}
main{max-width:1400px;margin:auto;padding:0 16px 40px}
.wrap{overflow-x:auto;border:1px solid var(--line);border-radius:14px;background:var(--card)}
table{border-collapse:separate;border-spacing:0}th,td{padding:8px;vertical-align:top;border-bottom:1px solid var(--line)}
thead th{position:sticky;top:0;background:var(--card);z-index:2;font-size:13px;text-align:left;white-space:nowrap}
th.row{position:sticky;left:0;background:var(--card);z-index:1;font-size:13px;text-align:left;white-space:nowrap;min-width:110px}
img{display:block;width:var(--w,180px);border-radius:10px;border:1px solid var(--line);cursor:zoom-in}
.none{width:var(--w,180px);height:calc(var(--w,180px)*2.165);display:flex;align-items:center;justify-content:center;text-align:center;color:var(--ink3);font-size:12px;border:1px dashed var(--line);border-radius:10px;padding:8px}
.cap{color:var(--ink3);font-size:11px;font-weight:400}
dialog{border:0;padding:0;background:transparent;max-width:96vw}dialog img{width:auto;max-height:92vh;max-width:96vw;cursor:zoom-out}dialog::backdrop{background:rgba(0,0,0,.7)}
</style></head><body>
<header><h1>くらしベース 画面の記録</h1>
<p class="meta">同じサンプルデータ（架空）・同じ大きさ（375×812）で、版ごとに撮ったスクリーンショット。左が古い版、右が新しい版。画像を押すと大きく表示します。撮り方は docs/screens/README.md。</p>
<div class="tools"><label>データ <select id="state"><option value="sample">サンプルデータあり</option><option value="empty">はじめて開いたとき（データなし）</option></select></label>
<label>大きさ <select id="size"><option value="140px">小</option><option value="180px" selected>中</option><option value="260px">大</option></select></label></div></header>
<main><div class="wrap"><table id="t"></table></div></main>
<dialog id="dlg"><img id="big" alt=""></dialog>
<script>
const D=${payload};
const esc=s=>String(s??"").replace(/[&<>"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
function draw(){const st=document.getElementById("state").value;
 const ids=[];const names={};D.forEach(c=>(c.screens[st]||[]).forEach(x=>{if(!ids.includes(x.id))ids.push(x.id);names[x.id]=names[x.id]||x.name}));ids.sort();
 let h="<thead><tr><th class=row>画面</th>"+D.map(c=>"<th>"+esc(c.label)+"<br><span class=cap>"+esc(c.date)+"・"+esc(c.commit)+"<br>"+esc(c.viewport)+"</span></th>").join("")+"</tr></thead><tbody>";
 for(const id of ids){h+="<tr><th class=row>"+esc(names[id])+"<br><span class=cap>"+esc(id)+"</span></th>";
  for(const c of D){const x=(c.screens[st]||[]).find(y=>y.id===id);
   h+="<td>"+(x&&x.file?"<img loading=lazy src='"+esc(x.file)+"' alt='"+esc(c.label+" "+x.name)+"'>"+(x.note?"<div class=cap>"+esc(x.note)+"</div>":""):"<div class=none>"+(x&&x.skipped?"この版には無い画面":"撮っていない")+"</div>")+"</td>"}
  h+="</tr>"}
 document.getElementById("t").innerHTML=h+"</tbody>"}
document.getElementById("state").onchange=draw;
document.getElementById("size").onchange=e=>document.documentElement.style.setProperty("--w",e.target.value);
document.getElementById("t").onclick=e=>{if(e.target.tagName==="IMG"){document.getElementById("big").src=e.target.src;document.getElementById("dlg").showModal()}};
document.getElementById("dlg").onclick=()=>document.getElementById("dlg").close();
draw();
</script></body></html>
`;
writeFileSync(join(DIR, "index.html"), html);
console.log(`版 ${caps.length} 件：${caps.map((c) => c.label).join(" → ")}`);
