/**
 * 画像を、文字の読み取りに使う大きさ（長い辺が MAX_SIDE 以下）に縮めて、JPEG の base64 にする（端末の中だけ。保存しない）。
 * 大きすぎる画像をそのまま渡すと、メモリを使いすぎるため。
 */
export const MAX_SIDE = 1800;

/** 縮めたあとの大きさ（長い辺を MAX_SIDE にそろえる。小さい画像は大きくしない） */
export function scaledSize(w: number, h: number, max: number = MAX_SIDE): { w: number; h: number } {
  const long = Math.max(w, h);
  if (long <= max || long <= 0) return { w, h };
  const r = max / long;
  return { w: Math.max(1, Math.round(w * r)), h: Math.max(1, Math.round(h * r)) };
}

export async function imageToBase64(file: File): Promise<string> {
  const bmp = await createImageBitmap(file);
  const { w, h } = scaledSize(bmp.width, bmp.height);
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("canvas");
  ctx.drawImage(bmp, 0, 0, w, h);
  bmp.close?.();
  const url = canvas.toDataURL("image/jpeg", 0.85);
  return url.slice(url.indexOf(",") + 1);
}
