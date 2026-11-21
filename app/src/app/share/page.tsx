"use client";

import { ComingSoon } from "@/components/CollectionPage";

export default function SharePage() {
  return (
    <ComingSoon
      title="共有"
      lead="家族やパートナーと、家計や予定を一緒に見られるようにする予定です。"
      points={["共有する相手を招待する", "見るだけ・編集もできる、などの権限を分ける", "共有する範囲（家計だけ、予定だけなど）を選ぶ"]}
      note="今はデータがこの端末の中だけにあるため、ほかの人とは共有できません。招待を送ることもできません。共有するには、アカウントとデータの同期のしくみが先に必要です。"
    />
  );
}
