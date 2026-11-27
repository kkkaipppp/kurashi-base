// 画面に出る日本語の文字を、ソースから全部抜き出して文言台帳（CSV）にする（To-Be 05「全表示文字列を抽出して記録」）。
// 抜き出すもの：JSX の文字・JSX の属性（aria-label・placeholder・title など）・日本語を含む文字列と template literal（トースト・エラー・確認の文も含む）
// 使い方：node tools/copy_ledger.mjs <出力CSV>   （app/node_modules の typescript を使う）
import { createRequire } from "node:module";
import { readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";

const root = new URL("..", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");
const app = join(root, "app");
const ts = createRequire(join(app, "package.json"))("typescript");
const JA = /[぀-ヿ㐀-鿿！-｠]/;

function walk(d, out = []) {
  for (const n of readdirSync(d)) {
    const p = join(d, n);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(tsx?|mjs)$/.test(n)) out.push(p);
  }
  return out;
}

const rows = [];
for (const f of walk(join(app, "src"))) {
  const text = readFileSync(f, "utf8");
  const sf = ts.createSourceFile(f, text, ts.ScriptTarget.Latest, true, f.endsWith("x") ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const rel = relative(app, f).replaceAll("\\", "/");
  const add = (node, kind, s) => {
    const t = s.replace(/\s+/g, " ").trim();
    if (!t || !JA.test(t)) return;
    const line = sf.getLineAndCharacterOfPosition(node.getStart()).line + 1;
    rows.push([rel, line, kind, t]);
  };
  const visit = (node) => {
    if (ts.isJsxText(node)) add(node, "画面の文字", node.getText());
    else if (ts.isJsxAttribute(node) && node.initializer && ts.isStringLiteral(node.initializer)) add(node, `属性:${node.name.getText()}`, node.initializer.text);
    else if (ts.isStringLiteral(node) && !ts.isImportDeclaration(node.parent) && !ts.isJsxAttribute(node.parent)) {
      // コメント・型の中は ts の木に出ない。説明用の定数も画面に出るので含める
      add(node, kindOf(node), node.text);
    } else if (ts.isNoSubstitutionTemplateLiteral(node)) add(node, kindOf(node), node.text);
    else if (ts.isTemplateExpression(node)) {
      add(node, kindOf(node), node.head.text + node.templateSpans.map((s) => "{…}" + s.literal.text).join(""));
      return; // 中の式は個別に見る必要はない（式の中の文字列は別に拾う）
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
}

function kindOf(node) {
  let p = node.parent;
  for (let i = 0; i < 4 && p; i++, p = p.parent) {
    if (ts.isCallExpression(p)) {
      const c = p.expression.getText();
      if (/toast/.test(c)) return "通知";
      if (/confirm/.test(c)) return "確認";
      if (/setError|Err\b|Error/.test(c)) return "エラー";
    }
    if (ts.isReturnStatement(p) && /error|Error/.test(p.getText().slice(0, 60))) return "エラー";
  }
  return "文字列";
}

const esc = (v) => (/[",\n]/.test(String(v)) ? `"${String(v).replaceAll('"', '""')}"` : String(v));
const out = process.argv[2] ?? join(root, "docs", "tobe", "COPY_LEDGER.csv");
const head = ["ID", "ファイル", "行", "種類", "今の文字", "判定（変更/維持/削除/ヘルプへ移動）", "新しい文字", "理由"];
writeFileSync(out, "﻿" + [head, ...rows.map((r, i) => [`C${String(i + 1).padStart(4, "0")}`, ...r, "", "", ""])].map((r) => r.map(esc).join(",")).join("\n") + "\n");
console.log(`${rows.length} 件 → ${out}`);
