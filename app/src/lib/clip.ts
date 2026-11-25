/**
 * 文字を max 文字（絵文字なども1文字と数える）までに切る。切ったときは最後を「…」にする。
 * iPhone アプリへ渡す中身（ウィジェット・通知・カレンダー）は、アプリの側に大きさの上限があり、
 * 超えると丸ごと受け取ってもらえない（o11 A07）。取り込んだ予定の名前がとても長いときのため
 */
export function clipText(s: string, max: number): string {
  const cs = Array.from(s);
  return cs.length <= max ? s : `${cs.slice(0, Math.max(0, max - 1)).join("")}…`;
}
