import Link from "next/link";
import { Card, IconChevronR } from "./ui";

/** 自分用の使い方：メニューと計画（To-Be 2026-11-27。05「目的別」「送信・権限の実態を明示」） */
export function GuideTobe() {
  const linkCls = "flex min-h-11 items-center justify-between rounded-lg px-1 text-[15px] font-semibold text-brand";
  return (
    <>
    <GuideInput />
    <Card>
      <h2 className="text-[17px] font-bold">メニューと計画</h2>
      <h3 className="mt-2 text-[14px] font-bold">下のボタン</h3>
      <ul className="mt-1 list-disc space-y-1 pl-5 text-[14px]">
        <li>初めは「ホーム・カレンダー・追加・家計簿・メニュー」です。真ん中の「追加」から、支出・予定・やることなどを足します</li>
        <li>並びは設定の「下のメニュー」で変えられます。やることは、ホームの「今日やること」とメニューの下の一覧から開きます</li>
      </ul>
      <h3 className="mt-3 text-[14px] font-bold">ホーム</h3>
      <ul className="mt-1 list-disc space-y-1 pl-5 text-[14px]">
        <li>初めは「今日の予定・今日やること・今月の残り予算・次の支払い・確認すること」の順です（今日やることは、期限が今日までのものがある日だけ出ます）。今日の予定が無い日は、次の予定を出します</li>
        <li>右上の「編集」で、並びを変えたり、今日のまとめ・支出の変化・最近の記録を出したりできます。前に並びを保存していれば、その並びのままです</li>
      </ul>
      <h3 className="mt-3 text-[14px] font-bold">メニュー</h3>
      <ul className="mt-1 list-disc space-y-1 pl-5 text-[14px]">
        <li>計画・目標・資産・契約・固定費・健康・メモ・書類に分かれています。旅行は「計画」、資格・勉強は「目標」の中です</li>
        <li>「編集」で並びを変えられます。出す機能は設定の「メニューに出す機能」で選びます。隠しても記録は消えず、検索で見つかります</li>
        <li>やること・お金の記録・分類していない記録・レシートを見て入力・ウィジェット・バックアップは、メニューの下の一覧から開きます</li>
      </ul>
      <h3 className="mt-3 text-[14px] font-bold">友達と飲み会の計画を立てたい</h3>
      <ol className="mt-1 list-decimal space-y-1 pl-5 text-[14px]">
        <li>メニュー →「計画」→「計画を作る」→「飲み会・集まり」</li>
        <li>「お店を比べる」に候補を入れて、決めたら「これに決める」</li>
        <li>日にちを入れて「予定に入れる」。予約などは「次にやること」に足します</li>
        <li>予算は見込みで、家計簿の支出には入りません。払ったら家計簿に支出を記録し、計画の「支出の記録をつなぐ」で選びます</li>
      </ol>
      <p className="mt-2 text-[13px] text-ink-3">
        みんなに日程を聞くリンクや、回答を集める機能はまだありません。連絡は LINE などで行ってください。計画を消しても、つないだ予定・やること・支出は消えません。
      </p>
      <Link href="/plans" className={`mt-2 ${linkCls}`}>
        計画を開く
        <IconChevronR className="size-4" />
      </Link>
    </Card>
    </>
  );
}

/** やりたいことごとに、押すと開く（2026-11-28。To-Be 06 A14「ヘルプと画面の一致」。文字を一度に並べすぎない） */
function Topic({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <details className="border-t border-line py-1 first-of-type:border-t-0">
      <summary className="flex min-h-11 cursor-pointer items-center text-[15px] font-semibold">{title}</summary>
      <ul className="mb-2 list-disc space-y-1 pl-5 text-[14px]">{children}</ul>
    </details>
  );
}

function GuideInput() {
  return (
    <Card>
      <h2 className="text-[17px] font-bold">入力とお金（やりたいことから）</h2>
      <Topic title="入力の画面の使い方">
        <li>保存のボタンは見出しのすぐ下にあります。キーボードが出ても動きません</li>
        <li>支出の支払方法・数え方・旅行・立替・メモは「詳細」を押すと出ます</li>
        <li>前の画面に戻るときは、見出しの左の「戻る」を押します</li>
      </Topic>
      <Topic title="LINE やメールの文から予定・支出を入れたい">
        <li>「追加」→「文章・URL を貼り付けて始める」に貼って「読み取る」</li>
        <li>日にち・時刻・金額・URL の候補が出ます。「予定として」か「支出として」を押すと入力の画面が開きます（押しただけでは保存しません）</li>
        <li>読み取るのはこの端末の中だけで、URL は開きません</li>
      </Topic>
      <Topic title="前と同じ支出をすぐ入れたい">
        <li>「追加」の下の「前の記録から」を押すと、同じ店・カテゴリ・金額で入力が始まります（日付は今日）</li>
      </Topic>
      <Topic title="友達の分も払った（立替）">
        <li>支出の金額は払った総額のまま入れ、「詳細」の「立替」に自分の分を入れます。支出に数えるのは自分の分だけです</li>
        <li>返してもらう分は、家計簿の「支払い」に出ます。押して「返してもらった」で記録します（収入には数えません）</li>
      </Topic>
      <Topic title="これからの支払いを見たい">
        <li>家計簿の「支払い」に、30日のうちの固定費の支払い・予定日を過ぎたもの・現金と預金の残高の目安が出ます</li>
      </Topic>
      <Topic title="ローンや借入も入れて純資産を見たい">
        <li>資産の種類で「負債（ローン・借入）」を選びます。負債があると、資産から負債を引いた純資産が出ます</li>
        <li>評価額を直すたびに前の値が残り、月末ごとの推移が出ます</li>
      </Topic>
      <Topic title="目標をしばらく休みたい">
        <li>目標を開いて「休止中」に印を付けます。ホームの確認や期限に出なくなります。外すと再開です</li>
      </Topic>
      <Topic title="契約と固定費を一緒に管理したい">
        <li>契約を開いて「つなぐ固定費」を選ぶと、金額と周期は固定費の金額を使います。自動ではつながりません</li>
        <li>解約したのに固定費が動いていると「固定費が止まっていません」と出ます。固定費の画面で止めてください</li>
      </Topic>
    </Card>
  );
}
