"use client";

import { Suspense, useEffect } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useUI } from "./UIContext";

/** URL の ?add= で開ける入力画面（ウィジェットやショートカットのボタンから、すぐ入力するため） */
export const ADD_KINDS = ["expense", "income", "event", "choose"] as const;
export type AddKind = (typeof ADD_KINDS)[number];

export function parseAddKind(v: string | null): AddKind | null {
  return v && (ADD_KINDS as readonly string[]).includes(v) ? (v as AddKind) : null;
}

function Inner() {
  const sp = useSearchParams();
  const router = useRouter();
  const path = usePathname();
  const ui = useUI();
  const kind = parseAddKind(sp.get("add"));
  useEffect(() => {
    if (!kind) return;
    if (kind === "expense" || kind === "income") ui.openTx({ mode: "new", type: kind });
    else if (kind === "event") ui.openEvent({ mode: "new" });
    else ui.openAdd();
    // 開いたら URL から add を外し、戻ったときにもう一度開かないようにする
    const params = new URLSearchParams(sp.toString());
    params.delete("add");
    router.replace(`${path}${params.size ? `?${params.toString()}` : ""}`, { scroll: false });
  }, [kind, ui, router, path, sp]);
  return null;
}

export function AddFromQuery() {
  return (
    <Suspense fallback={null}>
      <Inner />
    </Suspense>
  );
}
