import { ImageResponse } from "next/og";

// iPhone の「ホーム画面に追加」用のアイコン（180×180）。ネイビーの地に白い家・4つの窓・V字。
// ロゴの再現案から作る（docs/BRAND_IMPLEMENTATION_REPORT.md）
export const size = { width: 180, height: 180 };
export const contentType = "image/png";

const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><defs><linearGradient id="v" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#A8E6FF"/><stop offset="1" stop-color="#34C3B1"/></linearGradient></defs><path d="M14 41V26L32 10L50 26V41" fill="none" stroke="#FFFFFF" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"/><rect x="23" y="22" width="8" height="8" rx="1.6" fill="#5B9BF8"/><rect x="33" y="22" width="8" height="8" rx="1.6" fill="#A8E6FF"/><rect x="23" y="32" width="8" height="8" rx="1.6" fill="#7DB8FF"/><rect x="33" y="32" width="8" height="8" rx="1.6" fill="#34C3B1"/><path d="M7 45L32 55L57 45" fill="none" stroke="url(#v)" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", background: "#0B2545" }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={`data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`} width={128} height={128} alt="" />
      </div>
    ),
    size,
  );
}
