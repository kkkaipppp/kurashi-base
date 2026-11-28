// 暮らしベース データモデル（schemaVersion 2。v1 からは schema.ts の migrate で移行）
// 日付は端末ローカルの "YYYY-MM-DD"、時刻は "HH:mm" の文字列で持つ（UTC変換しない）。
// 金額は日本円の整数（最小単位=1円）。収支の区別は type で行い、amount は常に正の整数。

export type TxType = "expense" | "income";
export type TxSource = "manual" | "image" | "recurring";

export interface Transaction {
  id: string;
  type: TxType;
  date: string; // YYYY-MM-DD
  amount: number; // 正の整数（円）
  currency: "JPY";
  categoryId: string;
  merchant: string;
  paymentMethod: string; // "" = 未指定
  note: string;
  source: TxSource;
  sourceFingerprint?: string; // 画像取込時の画像指紋
  recurringId?: string; // 固定費から記録した場合（手で入れた支出を固定費の支払いとしてつないだ場合も）
  /** 100点化で追加（どれも任意。古い記録には無い。形式の番号は 2 のまま） */
  countAs?: "life" | "invest" | "transfer"; // この記録だけの数え方（カテゴリの分類より優先。lib/classify.ts）。transfer＝収支に数えない（カード引落・口座間の移動など。NEXT v21 X03）
  tripId?: string; // 旅行の支出（Trip.id）
  accountId?: string; // 払った・入った口座・カード・電子マネー（Account.id。自分用・任意。2026-11-28。lib/accounts.ts）
  toAccountId?: string; // 口座間の振替・カードの引き落とし：お金が入る先（Account.id。countAs=transfer と一緒に持つ）
  recurringDue?: string; // 一部の支払いのとき、どの支払日の分か（取り消しで別の回の払い分を巻き込まないため）
  recurringPartial?: boolean; // 固定費の「一部の支払い」として記録した（残りは、まだ払っていない。NEXT v21 X02）
  transferKind?: "card"; // 収支に数えない記録のうち「カード引き落とし」のとき（残高の目安に使う。NEXT v21 X05。lib/balance.ts）
  refundOf?: string; // 返金の記録：どの支出の返金か（NEXT v21 X02。収入にも数えない。lib/refund.ts）
  refundGross?: number; // 返金がある支出：返金の前の元の金額（返金の記録の合計から、いまの金額を計算し直すための控え。lib/refund.ts）
  refundWas?: "life" | "invest"; // 返金がある支出：返金の前の数え方の控え
  importBatchId?: string; // 取り込みの単位（CSV の取り込みごと。取り消しに使う。NEXT v21 CSV:C08）
  planId?: string; // 計画のお金（Plan.id。To-Be 2026-11-27。支出の正本はこの記録で、計画は集めて見るだけ）
  advanceGross?: number; // 立替の支出：実際に払った総額（amount は自分の分。To-Be 2026-11-28。lib/advance.ts）
  settles?: string; // 精算の記録：どの立替の、返してもらった分か（収支に数えない。lib/advance.ts）
  special?: true; // 特別支出（帰省・車検など）：支出には数えるが、月の予算と比べる額からは外し、年の特別支出の予算と比べる（2026-11-28）
  template?: true; // 入力のひな形（「追加」の一覧にいつも出す。2026-11-28。lib/txTemplates.ts）
  claim?: true; // 経費（会社に請求する支出）：全額を返してもらう分にして、支出に数えない（countAs=transfer と一緒に持つ。2026-11-28。lib/advance.ts）
  createdAt: string; // ISO
  updatedAt: string; // ISO
}

export interface CalendarEvent {
  id: string;
  title: string;
  startDate: string; // YYYY-MM-DD
  endDate: string; // YYYY-MM-DD（startDate 以上）
  allDay: boolean;
  startTime: string; // HH:mm（終日なら ""）
  endTime: string; // HH:mm（終日なら ""）
  note: string;
  /** v2 で追加（任意）。繰り返しは1日の予定だけ。未指定は繰り返しなし */
  repeat?: EventRepeat;
  repeatUntil?: string; // 繰り返しの終了日（"" = 終わりなし）
  /** v5 で追加（どれも任意。古い予定には無い） */
  location?: string; // 場所（Googleマップの目的地にも使う）
  url?: string; // 予約サイトなど（http/https のみ）
  items?: CheckItem[]; // 持ち物
  tripId?: string; // 旅行に入れた予定
  kind?: EventKind; // 旅行の行程の種類
  cost?: number | null; // かかりそうな費用（目安。支出の記録とは別）
  /** NEXT v21 で追加（任意）：完了した日付（1回きりは開始日、繰り返しはその回の日付）／移動にかかる時間（分。出発の目安に使う） */
  doneDates?: string[];
  travelMinutes?: number;
  goalId?: string; // 関連する目標（Goal.id。予定は目標の行動。時間・費用は予定のまま一度だけ数える。NEXT v21 X07）
  tentative?: true; // 仮の予定（まだ決まっていない。名前の前に「（仮）」。2026-11-28）
  planId?: string; // 計画の予定（Plan.id。To-Be 2026-11-27。計画の日程を決めたときの予定）
  createdAt: string;
  updatedAt: string;
}

export type EventRepeat = "none" | "weekly" | "monthly" | "yearly";
export type EventKind = "move" | "stay" | "sight" | "food" | "other";
export const EVENT_KINDS: { id: EventKind; label: string }[] = [
  { id: "move", label: "移動" },
  { id: "stay", label: "宿泊" },
  { id: "sight", label: "観光" },
  { id: "food", label: "食事" },
  { id: "other", label: "その他" },
];

export interface CheckItem {
  id: string;
  text: string;
  done: boolean;
}

/**
 * To-Be（2026-11-27）で追加：計画（飲み会・旅行・引っ越し・買い物・出張・転職・自由）。
 * - 計画は「実行するもの」、目標は「達成の状態」で、別のもの（To-Be 03）
 * - 予定・やること・支出は、それぞれの記録が正本。計画は planId で集めて見るだけ（二重に持たない）
 * - 旅行の計画は、今までの旅行（Trip）を tripId でつなぐ（行程・旅行の支出は Trip のまま）
 * - budget は見込みで、家計簿の集計には入れない（確定した支払いではない。To-Be 03「予算と支払い」）
 */
export type PlanType = "gathering" | "trip" | "move" | "shopping" | "business" | "job" | "free";
export type PlanStatus = "considering" | "preparing" | "done" | "canceled";
export interface PlanCandidate {
  id: string;
  label: string; // 候補の名前（日にち・お店・物件・商品など）
  url: string; // "" = なし（http/https のみ）
  price: number | null; // 目安の金額（円。取得した値ではなく、本人が入れた値）
  note: string;
  chosen?: boolean; // 「これに決める」を押した候補
}
export interface Plan {
  id: string;
  type: PlanType;
  title: string;
  status: PlanStatus;
  date: string; // 決まった日（"" = 日程未定）
  budget: number | null; // 見込み（円）
  note: string;
  tripId?: string;
  candidates?: PlanCandidate[];
  /** 日程調整の回答リンク（To-Be 段階4。2026-11-28 S-5 で保存の形の変更を許可）。ownerKey は端末の外へ出さない（lib/share/poll.ts） */
  poll?: {
    id: string;
    ownerKey: string;
    title: string;
    options: { id: string; date: string; label: string }[];
    closesAt: string;
    status: "draft" | "open" | "closed";
    createdAt: string;
  };
  createdAt: string;
  updatedAt: string;
}

/** v5 で追加：旅行（複数日の行程）。行程は CalendarEvent.tripId でつなぐ */
export interface Trip {
  id: string;
  title: string;
  startDate: string;
  endDate: string;
  destination: string;
  budget: number | null;
  note: string;
  createdAt: string;
  updatedAt: string;
}

/** v5 で追加：資格の参考書（ユーザーが選んだものだけを保存） */
export interface StudyBook {
  id: string;
  title: string;
  url: string; // "" = なし
  note: string;
  /** o31 F013（任意・足すだけ）：状態（購入候補・持っている・勉強中・終わった）。無い古い教材は「持っている」として扱う */
  status?: "candidate" | "owned" | "studying" | "done";
  /** 版（例「2026年版」）。同じ名前でも版が違えば別の教材（自動でまとめない。C013） */
  edition?: string;
  /** 全体の量（ページ数など）と単位。残りの量の計算に使う */
  total?: number | null;
  unit?: "page" | "problem" | "chapter" | "lecture";
  /** ほかの資格でも使う（同じ教材を2つ目の資格に結びつける。元の資格から移さない。T013） */
  alsoSubjectIds?: string[];
  /** 買ったときの支出の記録（家計簿の正本は取引。ここは結びつけだけで、金額を数えない。D027） */
  txId?: string;
}

/** o31 F012（任意・足すだけ）：受験の回。学習の記録とは別に持つ（C012） */
export interface StudyExamAttempt {
  id: string;
  date: string; // "" = 未定
  result: "planned" | "passed" | "failed" | "absent";
  score?: number | null;
  maxScore?: number | null;
  note?: string;
}

/** 取り込みの履歴（CSV を取り込んだ記録。取り消し・件数の確認に使う。NEXT v21 CSV:C08） */
export interface ImportBatch {
  id: string;
  at: string; // ISO
  source: string; // ファイル名など
  added: number; // 実際に足した取引の件数
  from: string | null;
  to: string | null;
  /** 取り消した日時（取り消したあとも履歴は残す） */
  undoneAt?: string;
}

export interface Category {
  id: string;
  name: string;
  kind: TxType;
  order: number;
  archived: boolean;
  /** 100点化で追加（任意）。支出のカテゴリを生活費・投資のどちらで数えるか。無ければ名前から判断 */
  role?: "life" | "invest";
}

export type RecurringCycle = "weekly" | "monthly" | "yearly";

export interface RecurringExpense {
  id: string;
  name: string;
  amount: number;
  cycle: RecurringCycle;
  anchorDay: number; // 1..31 支払日（月末を超える場合は月末日）。毎週の場合は使わない
  nextDueDate: string; // YYYY-MM-DD
  categoryId: string;
  paymentMethod: string;
  active: boolean;
  /** 次の支払日の分を、一部だけ払ったとき（任意。NEXT v21 X02：予定と実績を別の値で持ち、未払い分だけ残す）。全部払ったら消える */
  partialPaid?: { due: string; paid: number };
  createdAt: string;
  updatedAt: string;
}

/** 設定画面のオン・オフ（ホームの補足の3つ） */
export type HomeToggle = "todaySpent" | "nextRecurring" | "needsReview";

export interface HomePrefs {
  todaySpent: boolean;
  nextRecurring: boolean;
  needsReview: boolean;
  /** 100点化で追加（任意。自分用のホームのカードの並びと、隠したカード。知らないカードは無視する） */
  order?: string[];
  hidden?: string[];
}

// --- v2 で追加 ---

export type NisaFrame = "tsumitate" | "growth";

/** NISA の買付・売却の記録。sell の amount は売却した分の「簿価（買付時の金額）」 */
export interface NisaEntry {
  id: string;
  date: string;
  kind: "buy" | "sell";
  frame: NisaFrame;
  amount: number;
  name: string; // 銘柄（任意）
  note: string;
  createdAt: string;
  updatedAt: string;
}

/** 生活記録・メモ。date があれば日付別の記録として扱う */
export interface Note {
  id: string;
  title: string;
  body: string;
  date: string; // "" = 日付なし
  pinned: boolean;
  /** タグ（自分用。1つ20字まで・10個まで。2026-11-28） */
  tags?: string[];
  createdAt: string;
  updatedAt: string;
}

/**
 * 口座・カード・電子マネー（自分用。2026-11-28。lib/accounts.ts）。
 * 残高の目安＝照合した残高（baseBalance・baseDate）＋その日より後の記録。カードは使った額を「引き落とし待ち」として数える
 */
export interface Account {
  id: string;
  name: string;
  kind: "bank" | "card" | "emoney" | "cash";
  /** カードの締め日・引き落とし日（1〜31。月末を超える日は月末。カード以外は null） */
  closingDay: number | null;
  payDay: number | null;
  /** 照合した残高（カードは、その日の引き落とし待ちの額）と、その日（"" = 未照合） */
  baseBalance: number | null;
  baseDate: string;
  /** 照合した時刻（同じ日のあとから入れた記録を数えるため。任意） */
  baseAt?: string;
  note: string;
  archived: boolean;
  createdAt: string;
  updatedAt: string;
}

/** ポイント（自分用。2026-11-28）。期限が近づいたら、ホームの確認に出す */
export interface PointCard {
  id: string;
  name: string;
  balance: number | null;
  expiry: string; // "" = 期限なし
  note: string;
  createdAt: string;
  updatedAt: string;
}

/** 予約（自分用。2026-11-28）。予約済み・キャンセル済みは本人が付ける（外のサイトとはつながっていない） */
export interface Reservation {
  id: string;
  name: string;
  kind: "hotel" | "flight" | "train" | "restaurant" | "other";
  date: string; // 利用日（"" = 未定）
  status: "none" | "booked" | "canceled"; // 未予約・予約済み・キャンセル済み
  ref: string; // 予約番号
  cancelBy: string; // 無料キャンセルの期限（"" = なし）
  amount: number | null; // 金額の目安（支出の記録とは別）
  url: string;
  planId?: string;
  note: string;
  createdAt: string;
  updatedAt: string;
}

/** 家事（自分用。2026-11-28）。誰がやるかと、どのくらいおきか。「やった」でやった日を入れる */
export interface Chore {
  id: string;
  name: string;
  who: string;
  cycle: "daily" | "weekly" | "monthly" | "none";
  lastDone: string; // "" = まだ
  note: string;
  createdAt: string;
  updatedAt: string;
}

/** 買い足すもの（自分用。2026-11-28） */
export interface StockItem {
  id: string;
  name: string;
  need: boolean; // 買い足す
  note: string;
  createdAt: string;
  updatedAt: string;
}

/** ゴミ出しの日（自分用。2026-11-28）。曜日（0=日〜6=土）と、第何週（空 = 毎週） */
export interface GarbageDay {
  id: string;
  name: string;
  weekdays: number[];
  weeks: number[];
  note: string;
  createdAt: string;
  updatedAt: string;
}

/** 欲しいもの（自分用。2026-11-28）。買ったら「買った」にする（支出は家計簿に記録する。二重に数えない） */
export interface Wish {
  id: string;
  name: string;
  price: number | null; // 目安の値段（円）
  url: string;
  priority: "high" | "mid" | "low";
  status: "want" | "bought" | "dropped";
  note: string;
  createdAt: string;
  updatedAt: string;
}

export interface Task {
  id: string;
  title: string;
  due: string; // 期限（"" = なし）
  /** やる日（期限とは別。To-Be 03「期限と実施日時は別」。自分用・任意。2026-11-28） */
  doDate?: string;
  done: boolean;
  note: string;
  /** 予定にしたとき、その予定の ID（任意。NEXT v21 T06。自分用） */
  eventId?: string;
  planId?: string; // 計画の準備（Plan.id。To-Be 2026-11-27）
  createdAt: string;
  updatedAt: string;
}

export type AssetKind = "cash" | "investment" | "nisa" | "pension" | "insurance" | "property" | "other";

export interface Asset {
  id: string;
  name: string;
  kind: AssetKind;
  value: number | null; // 評価額（円）。null = 未入力
  asOf: string; // 評価日（"" = 未入力）
  /** 種類が「現金」のとき：評価日の時点の、カードの未払い（任意。残高の目安で、引き落とし前のカード払いに足す。NEXT v22 G0） */
  cardDebt?: number;
  /** 負債（ローン・借入）。評価額は正の数で持ち、純資産で引く。種類は増やさず印で持つ（前の版が種類で断らず読めるように。前の版では「その他」として出る。To-Be 2026-11-28） */
  debt?: true;
  /** 評価額の推移（前の評価日と額。評価日の古い順に最大 24 件。To-Be 2026-11-28。lib/assetTrend.ts） */
  history?: { asOf: string; value: number }[];
  note: string;
  createdAt: string;
  updatedAt: string;
}

export interface Contract {
  id: string;
  name: string;
  provider: string;
  amount: number | null; // 1回あたりの支払額
  cycle: "monthly" | "yearly" | "none";
  renewalDate: string; // 更新日（"" = 未入力）
  status: "active" | "cancelled";
  /** つないだ固定費（Recurring.id。本人が選んだときだけ。金額・周期は固定費の側が正本。To-Be 2026-11-28） */
  recurringId?: string;
  note: string;
  createdAt: string;
  updatedAt: string;
}

export interface HealthRecord {
  id: string;
  date: string;
  item: string; // 体重・血圧・睡眠など
  value: number | null;
  unit: string;
  note: string;
  createdAt: string;
  updatedAt: string;
}

export interface LifeDocument {
  id: string;
  title: string;
  category: string;
  expiry: string; // 期限（"" = なし）
  place: string; // 保管場所（ファイル本体は保存しない）
  note: string;
  createdAt: string;
  updatedAt: string;
}

export interface StudySubject {
  id: string;
  name: string;
  examDate: string; // "" = 未定
  targetHours: number | null;
  archived: boolean;
  /** v5 で追加（任意）：候補から選んだ資格の ID、参考書 */
  catalogId?: string;
  books?: StudyBook[];
  /** o31 F012（任意）：受験の回 */
  exams?: StudyExamAttempt[];
  /** o31 F017（任意）：試験の前に、新しい所を進めずに復習に使う日数（0〜365）。教材の1日の量の計算から除く */
  reviewDays?: number;
  createdAt: string;
  updatedAt: string;
}

export interface StudyLog {
  id: string;
  subjectId: string;
  date: string;
  minutes: number; // 1..1440
  note: string;
  /** o31 F015・F016・D022（任意・足すだけ。古い記録には無く、作り話で埋めない） */
  bookId?: string;
  /** タイマーで測ったときの開始・終了（ISO）。手で入れた記録には無い */
  startedAt?: string;
  endedAt?: string;
  /** 学んだ範囲（例 181〜196 ページ）。ページの位置と学んだ範囲の和は別に数える */
  range?: { from: number; to: number; unit: "page" | "problem" | "chapter" | "lecture" };
  /** 演習：問題数と正解数 */
  questions?: number;
  correct?: number;
  /** 復習（新しく進んだ量に数えない） */
  review?: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface Goal {
  id: string;
  title: string;
  deadline: string; // "" = 期限なし
  kind: "number" | "check";
  target: number | null;
  current: number;
  unit: string;
  done: boolean;
  note: string;
  /** やること（任意。NEXT v21 T06。自分用の入力。数字の進み具合は変えない） */
  steps?: { id: string; text: string; done: boolean; due?: string }[];
  /** o31 F018・F019（任意・足すだけ。古い目標には無い。number/check と current/target はそのまま使う） */
  conditions?: GoalConditionData[];
  /** 条件のまとめ方（初めは AND） */
  condMode?: "and" | "or";
  /** 親の目標（循環は保存しない） */
  parentId?: string;
  /** 達成の記録（そのときの条件の写し。あとで条件を変えても残る） */
  achievements?: { at: string; verdict: "met" | "unmet" | "unknown"; conditions: GoalConditionData[] }[];
  /** 休止した日（YYYY-MM-DD。休止中はホームの確認・ペースに出さない。再開で消す。To-Be 2026-11-28） */
  pausedAt?: string;
  createdAt: string;
  updatedAt: string;
}

/** 目標の達成条件（lib/goalCond.ts の GoalCondition と同じ形。actual は手で入れた今の値、分からなければ null） */
export interface GoalConditionData {
  id: string;
  label: string;
  unit: string;
  op: ">=" | "<=" | "==" | "range";
  target: number;
  targetMax?: number;
  actual: number | null;
}

/** v2 で追加した一覧（汎用の追加・編集・削除で扱う） */
export interface Collections {
  nisa: NisaEntry[];
  notes: Note[];
  tasks: Task[];
  assets: Asset[];
  contracts: Contract[];
  health: HealthRecord[];
  documents: LifeDocument[];
  studySubjects: StudySubject[];
  studyLogs: StudyLog[];
  goals: Goal[];
  wishes: Wish[];
  accounts: Account[];
  points: PointCard[];
  reservations: Reservation[];
  chores: Chore[];
  stock: StockItem[];
  garbage: GarbageDay[];
}

export type CollectionKey = keyof Collections;
export type ItemOf<K extends CollectionKey> = Collections[K][number];
export const COLLECTION_KEYS: CollectionKey[] = ["nisa", "notes", "tasks", "assets", "contracts", "health", "documents", "studySubjects", "studyLogs", "goals", "wishes", "accounts", "points", "reservations", "chores", "stock", "garbage"];

export interface AppData extends Collections {
  schemaVersion: 2;
  transactions: Transaction[];
  events: CalendarEvent[];
  categories: Category[];
  recurring: RecurringExpense[];
  /** v5 で追加。古いデータには無いので、読み込み時に空の一覧を足す（schema.ts の migrate） */
  trips: Trip[];
  /** To-Be（2026-11-27）：計画。古い記録には無い（読み込むときに空で足す。schema.ts の migrate） */
  plans: Plan[];
  budget: {
    monthly: number | null; // 毎月の支出予算（円）。null = 未設定
    /** 特別支出（帰省・車検など）の年の予算（円。自分用・任意。2026-11-28） */
    yearlySpecial?: number | null;
    /** 給料日（1〜31。月末を超える月は月末）。あれば給料日からの予算も出す（自分用・任意。2026-11-28） */
    payday?: number | null;
    /** 月の予算を変えた記録（変えた日と新しい額。新しいものが後ろ。最大 24 件。自分用・任意） */
    history?: { at: string; monthly: number | null }[];
  };
  prefs: { home: HomePrefs; /** メニューに出さない機能の道筋（任意。非表示でも記録は消えない。NEXT v21 X16・D11） */ menuHidden?: string[] };
  meta: { createdAt: string; lastBackupAt: string | null; /** 取り込みの履歴（任意。100点化以降に追加） */ imports?: ImportBatch[]; /** 生活変化の計画と履歴（任意。NEXT v21 B03。lib/lifeChange.ts） */ lifeChanges?: LifeChange[] };
}

export const PAYMENT_METHODS: { id: string; label: string }[] = [
  { id: "", label: "指定なし" },
  { id: "cash", label: "現金" },
  { id: "card", label: "クレジットカード" },
  { id: "qr", label: "QRコード決済" },
  { id: "emoney", label: "電子マネー" },
  { id: "bank", label: "口座振替・振込" },
  { id: "other", label: "その他" },
];

export function paymentLabel(id: string): string {
  return PAYMENT_METHODS.find((p) => p.id === id)?.label ?? "その他";
}

/** 生活変化の計画（NEXT v21 B03。計算は lib/lifeChange.ts） */
export type LifeItem =
  | { kind: "recurringAmount"; recurringId: string; name: string; before: number; after: number; applied?: boolean }
  | { kind: "recurringStop"; recurringId: string; name: string; applied?: boolean }
  | { kind: "budget"; before: number | null; after: number | null; applied?: boolean };

export interface LifeChange {
  id: string;
  title: string;
  /** 適用日（この日から変える予定の日） */
  date: string;
  items: LifeItem[];
  status: "planned" | "applied" | "undone";
  createdAt: string;
  appliedAt?: string;
  undoneAt?: string;
}
