import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

// o11 A01（N17）：計算と保存の部品（src/lib）は、画面（components・app）を読まない。lib の中に、読み込みの輪（循環）がない
const root = path.resolve(import.meta.dirname, "../src");
const libDir = path.join(root, "lib");
const files = fs.readdirSync(libDir).filter((f) => /\.(ts|tsx)$/.test(f));
const imports = (f: string) => {
  const s = fs.readFileSync(path.join(libDir, f), "utf8");
  return [...s.matchAll(/^\s*(?:import|export)[^"'\n]*?from\s+["']([^"']+)["']/gm), ...s.matchAll(/import\(\s*["']([^"']+)["']\s*\)/g)].map((m) => m[1]);
};
const toLib = (spec: string): string | null => {
  const m = spec.match(/^(?:@\/lib\/|\.\/)([\w-]+)$/);
  if (!m) return null;
  const hit = files.find((f) => f.replace(/\.(ts|tsx)$/, "") === m[1]);
  return hit ?? null;
};

describe("A01：部品のつながり", () => {
  it("src/lib は components・app を読まない", () => {
    const bad = files.flatMap((f) => imports(f).filter((s) => /^@\/(components|app)\//.test(s) || /^\.\.\/(components|app)\//.test(s)).map((s) => `${f} → ${s}`));
    expect(bad).toEqual([]);
  });
  it("src/lib の中に、読み込みの輪（循環）がない（型だけの読み込みも含めて数える）", () => {
    const graph = new Map(files.map((f) => [f, imports(f).map(toLib).filter((x): x is string => !!x)]));
    expect(files.length).toBeGreaterThan(50);
    const state = new Map<string, 0 | 1 | 2>();
    const cycles: string[] = [];
    const visit = (f: string, stack: string[]) => {
      state.set(f, 1);
      for (const g of graph.get(f) ?? []) {
        if (state.get(g) === 1) cycles.push([...stack.slice(stack.indexOf(g)), g].join(" → "));
        else if (!state.get(g)) visit(g, [...stack, g]);
      }
      state.set(f, 2);
    };
    for (const f of files) if (!state.get(f)) visit(f, [f]);
    expect(cycles).toEqual([]);
  });
});
