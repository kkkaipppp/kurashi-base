"use client";

import { Suspense, useEffect } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

/**
 * URL の ?open=<id> を読み、該当する記録の編集シートを開く（今日のナビなどから個別の記録へ直接行くため）。
 * 開いたら URL から open を外し、戻ったときに何度も開かないようにする。
 */
function Inner({ ids, onOpen }: { ids: string[]; onOpen: (id: string) => void }) {
  const sp = useSearchParams();
  const router = useRouter();
  const path = usePathname();
  const id = sp.get("open");
  useEffect(() => {
    // open=new は新しく追加するシートを開く（＋ボタンの「タスク」から）
    if (!id || (id !== "new" && !ids.includes(id))) return;
    onOpen(id);
    router.replace(path, { scroll: false });
  }, [id, ids, onOpen, router, path]);
  return null;
}

export function OpenFromQuery(props: { ids: string[]; onOpen: (id: string) => void }) {
  return (
    <Suspense fallback={null}>
      <Inner {...props} />
    </Suspense>
  );
}
