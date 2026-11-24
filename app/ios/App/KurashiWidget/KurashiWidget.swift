import WidgetKit
import SwiftUI

// くらしベースのウィジェット（個人用）。アプリが App Group に置いた要約（lib/widgetSummary.ts）を読むだけ。
// 記録の全部は読まない。ボタンは kurashibase://add/<種類> でアプリの入力画面を開く。

private let appGroup = "group.jp.kurashibase.personal"

struct Summary: Decodable {
    struct Ev: Decodable { let title: String; let time: String }
    let today: String
    let events: [Ev]
    let moreEvents: Int
    let monthExpense: Int
    let monthIncome: Int
    let budget: Int?
    let remaining: Int?
    /// 予算と比べる額（投資を除いた生活費）。古い要約には無い
    let budgetSpent: Int?
    let updatedAt: String?
    /// 明日の予定（日付が変わってアプリを開くまでの間に使う。古い要約にはない）
    struct Day: Decodable { let date: String; let events: [Ev] }
    let tomorrow: Day?
}

private func loadSummary() -> Summary? {
    guard let s = UserDefaults(suiteName: appGroup)?.string(forKey: "summary"),
          let data = s.data(using: .utf8) else { return nil }
    return try? JSONDecoder().decode(Summary.self, from: data)
}

extension ISO8601DateFormatter {
    /// 「2026-11-24T03:37:40.441Z」のような、小数の秒つきの時刻を読む
    static let withFraction: ISO8601DateFormatter = {
        let f = ISO8601DateFormatter()
        f.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return f
    }()
}

private func todayString(_ d: Date = Date()) -> String {
    let f = DateFormatter()
    f.calendar = Calendar(identifier: .gregorian)
    f.locale = Locale(identifier: "en_US_POSIX")
    f.timeZone = .current
    f.dateFormat = "yyyy-MM-dd"
    return f.string(from: d)
}

private func yen(_ n: Int) -> String {
    let f = NumberFormatter()
    f.numberStyle = .decimal
    let s = f.string(from: NSNumber(value: abs(n))) ?? "\(abs(n))"
    return (n < 0 ? "−¥" : "¥") + s
}

struct Entry: TimelineEntry {
    let date: Date
    let summary: Summary?
}

struct Provider: TimelineProvider {
    func placeholder(in context: Context) -> Entry { Entry(date: Date(), summary: nil) }

    func getSnapshot(in context: Context, completion: @escaping (Entry) -> Void) {
        completion(Entry(date: Date(), summary: loadSummary()))
    }

    func getTimeline(in context: Context, completion: @escaping (Timeline<Entry>) -> Void) {
        let now = Date()
        let summary = loadSummary()
        // 日付が変わる時刻にも1枚用意する。その日の要約がまだないので「アプリを開くと出ます」になり、
        // 作り直しが遅れても前の日の予定・前の月の支出を「今日」として出さない
        let tomorrow = Calendar.current.startOfDay(for: now.addingTimeInterval(24 * 60 * 60))
        completion(Timeline(entries: [Entry(date: now, summary: summary), Entry(date: tomorrow, summary: summary)], policy: .atEnd))
    }
}

private enum KB {
    static let bg = Color(red: 0.965, green: 0.957, blue: 0.937) // #f6f4ef
    static let ink = Color(red: 0.122, green: 0.141, blue: 0.129) // #1f2421
    static let ink3 = Color(red: 0.45, green: 0.47, blue: 0.46)
    static let brand = Color(red: 0.184, green: 0.435, blue: 0.369) // #2f6f5e
    static let expense = Color(red: 0.706, green: 0.314, blue: 0.235) // #b4503c
    static let income = Color(red: 0.184, green: 0.435, blue: 0.620) // #2f6f9e
    static let event = Color(red: 0.478, green: 0.353, blue: 0.702) // #7a5ab3
}

struct KurashiWidgetView: View {
    @Environment(\.widgetFamily) private var family
    let entry: Entry

    /// 要約が今日のものか（アプリを開いていない日は、予定が古い）
    private var fresh: Bool { entry.summary?.today == todayString(entry.date) }
    /// 今日の予定：要約が今日のものならそれ、昨日の要約なら「明日の予定」として渡されたものを使う（レビュー o1 の P12）
    private var todaysEvents: [Summary.Ev]? {
        guard let s = entry.summary else { return nil }
        if s.today == todayString(entry.date) { return s.events }
        if let t = s.tomorrow, t.date == todayString(entry.date) { return t.events }
        return nil
    }
    /// 要約を作った時刻（「12:34 更新」）
    private var updatedText: String? {
        guard let iso = entry.summary?.updatedAt, let d = ISO8601DateFormatter.withFraction.date(from: iso) ?? ISO8601DateFormatter().date(from: iso) else { return nil }
        let f = DateFormatter()
        f.locale = Locale(identifier: "ja_JP")
        f.dateFormat = Calendar.current.isDate(d, inSameDayAs: entry.date) ? "H:mm 更新" : "M/d H:mm 更新"
        return f.string(from: d)
    }
    /// 要約が今月のものか
    private var sameMonth: Bool { entry.summary.map { $0.today.prefix(7) == todayString(entry.date).prefix(7) } ?? false }

    var body: some View {
        Group {
            if family == .systemSmall { small } else { medium }
        }
        .containerBackground(KB.bg, for: .widget)
    }

    // 小さいウィジェット：今月のお金と今日の予定。押すと支出の入力
    private var small: some View {
        VStack(alignment: .leading, spacing: 4) {
            money
            Spacer(minLength: 2)
            events(max: 2)
            // 小さいウィジェットは全体が「支出を記録」のボタン。そのことを書いておく
            Text("押すと ＋支出")
                .font(.caption2.bold())
                .foregroundStyle(KB.expense)
        }
        .widgetURL(URL(string: "kurashibase://add/expense"))
    }

    // 中くらいのウィジェット：予定・お金・入力のボタン
    private var medium: some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack(alignment: .top, spacing: 10) {
                events(max: 3).frame(maxWidth: .infinity, alignment: .leading)
                money.frame(maxWidth: .infinity, alignment: .leading)
            }
            Spacer(minLength: 0)
            HStack(spacing: 6) {
                button("支出", "expense", KB.expense)
                button("収入", "income", KB.income)
                button("予定", "event", KB.event)
            }
        }
    }

    private var money: some View {
        VStack(alignment: .leading, spacing: 1) {
            if let s = entry.summary, sameMonth {
                if let r = s.remaining {
                    Text("今月の残り予算").font(.caption2).foregroundStyle(KB.ink3)
                    Text(yen(r)).font(.title3.bold()).foregroundStyle(r < 0 ? KB.expense : KB.brand)
                        .minimumScaleFactor(0.6).lineLimit(1)
                    // 残り予算の下は、予算から引いた額（生活費）を出す（支出の合計だと数字が合わない。点検役の指摘）
                    Text("生活費 \(yen(s.budgetSpent ?? s.monthExpense))").font(.caption2).foregroundStyle(KB.ink3).lineLimit(1)
                } else {
                    Text("今月の支出").font(.caption2).foregroundStyle(KB.ink3)
                    Text(yen(s.monthExpense)).font(.title3.bold()).foregroundStyle(KB.expense)
                        .minimumScaleFactor(0.6).lineLimit(1)
                    if s.monthIncome > 0 {
                        Text("収入 +\(yen(s.monthIncome))").font(.caption2).foregroundStyle(KB.income).lineLimit(1)
                    }
                }
                if family != .systemSmall, let u = updatedText {
                    Text(u).font(.system(size: 9)).foregroundStyle(KB.ink3)
                }
            } else {
                Text("今月の支出").font(.caption2).foregroundStyle(KB.ink3)
                Text("アプリを開くと出ます").font(.caption).foregroundStyle(KB.ink3)
            }
        }
    }

    private func events(max: Int) -> some View {
        VStack(alignment: .leading, spacing: 2) {
            Text("今日の予定").font(.caption2.bold()).foregroundStyle(KB.ink)
            if let evs = todaysEvents, let s = entry.summary {
                if evs.isEmpty {
                    Text("予定はありません").font(.caption).foregroundStyle(KB.ink3)
                } else {
                    ForEach(Array(evs.prefix(max).enumerated()), id: \.offset) { _, e in
                        HStack(spacing: 4) {
                            Text(e.time).font(.caption2.monospacedDigit()).foregroundStyle(KB.event)
                            Text(e.title).font(.caption).foregroundStyle(KB.ink).lineLimit(1)
                        }
                    }
                    let rest = evs.count - min(max, evs.count) + (fresh ? s.moreEvents : 0)
                    if rest > 0 { Text("ほか\(rest)件").font(.caption2).foregroundStyle(KB.ink3) }
                }
            } else {
                Text("アプリを開くと出ます").font(.caption).foregroundStyle(KB.ink3)
            }
        }
    }

    private func button(_ label: String, _ kind: String, _ color: Color) -> some View {
        Link(destination: URL(string: "kurashibase://add/\(kind)")!) {
            Text("＋\(label)")
                .font(.caption.bold())
                .foregroundStyle(.white)
                .frame(maxWidth: .infinity, minHeight: 30)
                .background(color, in: RoundedRectangle(cornerRadius: 8))
        }
    }
}

struct KurashiWidget: Widget {
    let kind = "KurashiWidget"
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: kind, provider: Provider()) { entry in
            KurashiWidgetView(entry: entry)
        }
        .configurationDisplayName("くらしベース")
        .description("今日の予定と今月の支出。ボタンからすぐ記録できます")
        .supportedFamilies([.systemSmall, .systemMedium])
    }
}

@main
struct KurashiWidgetBundle: WidgetBundle {
    var body: some Widget { KurashiWidget() }
}
