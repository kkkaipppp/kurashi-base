"use client";

import { Button, Card } from "./ui";
import { useUI } from "./UIContext";
import { isPractice, reloadHome, setPractice } from "@/lib/practice";

/** 設定の「アプリ情報」（自分用）：練習用のデータで試す（決定 Q34 ①。保存しない） */
export function PracticeCard() {
  const ui = useUI();
  const on = isPractice();
  const start = async () => {
    const ok = await ui.confirm({
      title: "練習用のデータで試しますか？",
      body: "見本の記録が入った画面に切り替わります。練習のあいだに入れたものは保存しません（この画面を閉じる・「練習をやめる」で消えます）。本当の記録・バックアップ・ウィジェットは変わりません（表示の設定は残ります）。練習のあいだは、書き出し・iPhone の連携・勉強のタイマーは使えません。",
      ok: "練習を始める",
    });
    if (!ok) return;
    if (!setPractice(true)) return ui.toast("この端末では練習を始められませんでした", "error");
    reloadHome();
  };
  return (
    <Card>
      <h2 className="text-[15px] font-bold">練習用のデータで試す</h2>
      <p className="mb-3 text-[13px] text-ink-3">見本の記録で、入力や画面を試せます。保存しないので、本当の記録には何も残りません。</p>
      {on ? (
        <Button
          variant="secondary"
          className="w-full"
          onClick={() => {
            setPractice(false);
            reloadHome();
          }}
        >
          練習をやめる（本当の記録に戻る）
        </Button>
      ) : (
        <Button variant="secondary" className="w-full" onClick={start}>
          練習を始める
        </Button>
      )}
    </Card>
  );
}
