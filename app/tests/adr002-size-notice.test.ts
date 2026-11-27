import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { MAX_BACKUP_BYTES, backupSizeNotice } from "@/lib/backup";

// ADR-002（2026-11-27 決定：B を先に・上限は実機の試験まで 20MB）。期待値は手で決めた
const MB = 1024 * 1024;
describe("書き出しの大きさの知らせ", () => {
  it("上限は 20MB のまま", () => {
    expect(MAX_BACKUP_BYTES).toBe(20 * MB);
  });
  it("8割（16MB）までは知らせない", () => {
    expect(backupSizeNotice(1000)).toBeNull();
    expect(backupSizeNotice(16 * MB)).toBeNull();
  });
  it("8割を超えたら近づいていると知らせる", () => {
    expect(backupSizeNotice(16 * MB + 1)).toContain("近づいて");
    expect(backupSizeNotice(20 * MB)).toContain("近づいて");
  });
  it("上限を超えたら戻せないと知らせる（大きさを MB で出す）", () => {
    const t = backupSizeNotice(25 * MB);
    expect(t).toContain("超えて");
    expect(t).toContain("25.0MB");
    expect(t).toContain("20.0MB");
  });
  it("書き出しと復元は同じ上限を使う（設定の画面に別の値を置かない）", () => {
    const src = readFileSync("src/app/settings/page.tsx", "utf8");
    expect(src).not.toMatch(/const MAX_BACKUP_BYTES/);
    expect(src).toMatch(/backupSizeNotice\(blob\.size\)/);
    expect(src).toMatch(/f\.size > MAX_BACKUP_BYTES/);
  });
});
