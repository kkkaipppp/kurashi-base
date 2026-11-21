"use client";

import { ComingSoon } from "@/components/CollectionPage";

export default function AiPage() {
  return (
    <ComingSoon
      title="AI生活サポート"
      lead="記録した家計や予定をもとに、AIに相談したり、提案を受けたりできるようにする予定です。"
      points={["「今月の使いすぎ」などを相談する", "提案の履歴を見返す", "AIに渡すデータの範囲を自分で決める"]}
      note="今はAIにはつながっていません。ここで入力しても、AIは返事をしません。つなぐ場合は、どのデータを外部に送るか・費用・プライバシーを確認してから決めます。"
    />
  );
}
