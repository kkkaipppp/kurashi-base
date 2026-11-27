import Link from "next/link";

/** この版では使えない画面を、直接 URL で開いたとき（To-Be 06 A13：未対応の機能は通常の画面・検索・直接 URL でも出さない） */
export function NotAvailable() {
  return (
    <main className="space-y-3 pt-10 text-center">
      <h1 className="text-xl font-bold">この画面は使えません</h1>
      <p className="text-ink-2">このアプリの版では、まだ使えない機能です。</p>
      <Link href="/" className="inline-flex min-h-11 items-center font-semibold text-brand underline">
        ホームに戻る
      </Link>
    </main>
  );
}
