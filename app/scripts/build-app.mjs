// iPhone アプリ（Capacitor）用に、静的なファイルを out/ に書き出す。Windows でも Mac でも動くよう、環境変数をここで付ける
import { spawnSync } from "node:child_process";
const r = spawnSync("npx", ["next", "build"], { stdio: "inherit", shell: true, env: { ...process.env, KB_EXPORT: "1" } });
process.exit(r.status ?? 1);
