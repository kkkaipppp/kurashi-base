"use client";

import { Suspense, useEffect, useRef } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { isValidDateStr } from "@/lib/date";

/**
 * URL の ?open=<id> を読み、該当する記録の編集シートを開く（今日のナビなどから個別の記録へ直接行くため）。
 * 開いたら URL から open を外し、戻ったときに何度も開かないようにする。
 */
function Inner({ ids, onOpen }: { ids: string[]; onOpen: (id: string, date?: string) => void }) {
  const sp = useSearchParams();
  const router = useRouter();
  const path = usePathname();
  const id = sp.get("open");
  // 同じ open では1回だけ開く（URL から open を外し終わるまでの間に、記録の一覧が描き直されて何度も開き、更新が止まらなくなった。2026-11-28 旅行の ?open=new）
  const handled = useRef<string | null>(null);
  useEffect(() => {
    if (!id) {
      handled.current = null;
      return;
    }
    // open=new は新しく追加するシートを開く（＋ボタンの「タスク」から）
    if (id !== "new" && !ids.includes(id)) return;
    if (handled.current === id) return;
    handled.current = id;
    // open=new&date=YYYY-MM-DD：＋の「タスク」を、カレンダーで選んだ日から始める（期限の初めの値。磨き込み 2026-11-26）
    const date = sp.get("date");
    onOpen(id, id === "new" && date && isValidDateStr(date) ? date : undefined);
    const params = new URLSearchParams(sp.toString());
    params.delete("open");
    params.delete("date");
    router.replace(`${path}${params.size ? `?${params.toString()}` : ""}`, { scroll: false });
  }, [id, ids, onOpen, router, path, sp]);
  return null;
}

export function OpenFromQuery(props: { ids: string[]; onOpen: (id: string, date?: string) => void }) {
  return (
    <Suspense fallback={null}>
      <Inner {...props} />
    </Suspense>
  );
}
