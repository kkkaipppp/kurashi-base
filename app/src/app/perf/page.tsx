"use client";

import dynamic from "next/dynamic";
import { Empty, PageHeader } from "@/components/ui";
import { FEATURES } from "@/lib/edition";

/**
 * 性能を測る（自分用。o11 A08）。中身は components/PerfLab.tsx。
 * 自分用の版のときだけ読み込む（公開版の組み立てには、測る部品と合成データを入れない。A09）
 */
const PERSONAL_BUILD = process.env.NEXT_PUBLIC_KB_EDITION === "personal";
const PerfLab = PERSONAL_BUILD ? dynamic(() => import("@/components/PerfLab").then((m) => m.PerfLab)) : null;

export default function PerfPage() {
  if (!FEATURES.perfLab || !PerfLab) {
    return (
      <main>
        <PageHeader title="性能を測る" />
        <Empty>この版では、まだ使えません</Empty>
      </main>
    );
  }
  return <PerfLab />;
}
