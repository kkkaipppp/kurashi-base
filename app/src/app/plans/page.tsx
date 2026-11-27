"use client";

import dynamic from "next/dynamic";
import { NotAvailable } from "@/components/NotAvailable";

// 計画は、まず自分用だけ（To-Be 03「新規は personal 検証後に承認」）。公開版の組み立てには中身を入れない
const PlansScreen = process.env.NEXT_PUBLIC_KB_EDITION === "personal" ? dynamic(() => import("@/components/PlansScreen").then((m) => m.PlansScreen)) : null;

export default function PlansPage() {
  return PlansScreen ? <PlansScreen /> : <NotAvailable />;
}
