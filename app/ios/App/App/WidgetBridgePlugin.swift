import Foundation
import UIKit
import Capacitor
import WidgetKit
import EventKit

/// Web の画面（components/WidgetSync.tsx）から受け取った要約を、ウィジェットと一緒に使う置き場（App Group）に書く。
/// あわせて、その日の自動バックアップを書類フォルダに書く。
/// 要約は端末の中にだけ置き、外へは送らない。
@objc(WidgetBridgePlugin)
public class WidgetBridgePlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "WidgetBridgePlugin"
    public let jsName = "WidgetBridge"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "setSummary", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "writeBackup", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "syncCalendar", returnType: CAPPluginReturnPromise)
    ]

    static let appGroup = "group.jp.kurashibase.personal"
    static let key = "summary"

    @objc func setSummary(_ call: CAPPluginCall) {
        guard let json = call.getString("json"), !json.isEmpty, json.utf8.count < 20_000 else {
            call.reject("要約がありません")
            return
        }
        guard let shared = UserDefaults(suiteName: Self.appGroup) else {
            call.reject("共有の置き場を開けません")
            return
        }
        if shared.string(forKey: Self.key) != json {
            shared.set(json, forKey: Self.key)
            WidgetCenter.shared.reloadAllTimelines()
        }
        call.resolve()
    }

    // MARK: - 自動バックアップ

    /// 残す日数（lib/nativeBridge.ts の AUTO_BACKUP_KEEP_DAYS と同じ）
    static let keepDays = 14
    static let backupFolder = "自動バックアップ"
    static let prefix = "kurashi-base_backup_"
    /// これまでで記録がいちばん多かったときのバックアップ（日ごとの14個とは別に、消さずに残す）
    static let largestName = "kurashi-base_largest_backup.json"
    static let largestKey = "kbLargestBackupRecords"

    /// その日のバックアップを、書類フォルダの「自動バックアップ」に書く（同じ日は上書き）。古いものは14日分を残して消す。
    /// 書類フォルダは「ファイル」アプリ → このiPhone内 → くらしベース から見える（Info.plist の UIFileSharingEnabled）。
    @objc func writeBackup(_ call: CAPPluginCall) {
        guard let day = call.getString("day"), day.count == 8, day.allSatisfy({ $0.isASCII && $0.isNumber }) else {
            call.reject("日付が正しくありません")
            return
        }
        guard let json = call.getString("json"), !json.isEmpty, json.utf8.count < 50_000_000 else {
            call.reject("バックアップの中身がありません")
            return
        }
        let records = call.getInt("records") ?? 0
        guard records > 0 else {
            call.reject("記録が空なので書きません")
            return
        }
        // アプリを閉じる瞬間でも書き終えられるよう、少しだけ時間をもらう
        var task: UIBackgroundTaskIdentifier = .invalid
        task = UIApplication.shared.beginBackgroundTask(withName: "kurashi-backup") {
            UIApplication.shared.endBackgroundTask(task)
            task = .invalid
        }
        defer { if task != .invalid { UIApplication.shared.endBackgroundTask(task) } }
        let fm = FileManager.default
        guard let docs = fm.urls(for: .documentDirectory, in: .userDomainMask).first else {
            call.reject("書類フォルダが見つかりません")
            return
        }
        let dir = docs.appendingPathComponent(Self.backupFolder, isDirectory: true)
        do {
            try fm.createDirectory(at: dir, withIntermediateDirectories: true)
            let name = "\(Self.prefix)\(day).json"
            let bytes = Data(json.utf8)
            try bytes.write(to: dir.appendingPathComponent(name), options: [.atomic])
            // 記録の件数がこれまでで最多（同じも含む）なら、消さない控えも更新する。
            // その日のファイルを大量削除や誤った復元のあとの中身で上書きしても、いちばん多かったときの控えは残る
            let largest = UserDefaults.standard.integer(forKey: Self.largestKey)
            if records >= largest {
                try bytes.write(to: dir.appendingPathComponent(Self.largestName), options: [.atomic])
                UserDefaults.standard.set(records, forKey: Self.largestKey)
            }
            // 古いものを消す（名前の日付の新しい順に14個を残す。自分で置いたほかのファイルには触らない）
            let files = try fm.contentsOfDirectory(atPath: dir.path)
                .filter { $0.hasPrefix(Self.prefix) && $0.hasSuffix(".json") }
                .sorted(by: >)
            for old in files.dropFirst(Self.keepDays) {
                try? fm.removeItem(at: dir.appendingPathComponent(old))
            }
            call.resolve(["name": name, "kept": min(files.count, Self.keepDays)])
        } catch {
            call.reject("バックアップを書けませんでした")
        }
    }

    // MARK: - iPhone のカレンダーへの反映

    private struct CalItem: Decodable {
        let title: String
        let startDate: String
        let endDate: String
        let allDay: Bool
        let startTime: String
        let endTime: String
        let location: String
        let notes: String
    }

    private static let eventStore = EKEventStore()
    private static let calendarIdKey = "kbCalendarIdentifier"
    private static let lastSyncKey = "kbCalendarLastSync"
    private static let calendarTitle = "くらしベース"
    /// 書き込みは1つずつ（同時に2回動かさない）
    private static let calendarQueue = DispatchQueue(label: "jp.kurashibase.calendar")

    private static func date(_ day: String, _ time: String = "00:00") -> Date? {
        let f = DateFormatter()
        f.calendar = Calendar(identifier: .gregorian)
        f.locale = Locale(identifier: "en_US_POSIX")
        f.timeZone = .current
        f.dateFormat = "yyyy-MM-dd HH:mm"
        return f.date(from: "\(day) \(time.isEmpty ? "00:00" : time)")
    }

    /// 起動をまたいでも同じになる簡単な指紋（同じ中身なら書き直さないため）
    private static func fingerprint(_ s: String) -> String {
        var h: UInt64 = 0xcbf29ce484222325
        for b in s.utf8 { h ^= UInt64(b); h = h &* 0x100000001b3 }
        return String(h, radix: 16)
    }

    /// カレンダーを作ってよいアカウント：iCloud か、この iPhone の中（ローカル）だけ。
    /// 仕事の Exchange や Google などのアカウントには作らない（固定費や予定を勤め先などのサーバーに送らないため）
    private static func isAllowedSource(_ src: EKSource) -> Bool {
        return src.sourceType == .local || (src.sourceType == .calDAV && src.title.lowercased().contains("icloud"))
    }

    private static func allowedSource(_ store: EKEventStore) -> EKSource? {
        return store.sources.first(where: { $0.sourceType == .calDAV && $0.title.lowercased().contains("icloud") })
            ?? store.sources.first(where: { $0.sourceType == .local })
    }

    private static func isAllowed(_ c: EKCalendar) -> Bool {
        guard c.allowsContentModifications, let src = c.source else { return false }
        return isAllowedSource(src)
    }

    /// 「くらしベース」カレンダー（なければ作る）。ほかのカレンダーには書かない
    private static func kurashiCalendar() throws -> EKCalendar {
        let store = eventStore
        if let id = UserDefaults.standard.string(forKey: calendarIdKey), let c = store.calendar(withIdentifier: id),
           c.title == calendarTitle, isAllowed(c) {
            return c
        }
        // ID が変わっていても、同じ名前で書き込める「くらしベース」カレンダーがあれば、それを使う（2つ作らない）
        if let c = store.calendars(for: .event).first(where: { $0.title == calendarTitle && isAllowed($0) }) {
            UserDefaults.standard.set(c.calendarIdentifier, forKey: calendarIdKey)
            return c
        }
        guard let source = allowedSource(store) else {
            throw NSError(domain: "kurashi", code: 1, userInfo: [NSLocalizedDescriptionKey: "iCloud か この iPhone のカレンダーが見つかりません"])
        }
        let c = EKCalendar(for: .event, eventStore: store)
        c.title = calendarTitle
        c.cgColor = UIColor(red: 0.184, green: 0.435, blue: 0.369, alpha: 1).cgColor
        c.source = source
        try store.saveCalendar(c, commit: true)
        UserDefaults.standard.set(c.calendarIdentifier, forKey: calendarIdKey)
        return c
    }

    /// from〜to の「くらしベース」カレンダーの予定を消して、受け取った一覧で書き直す。
    /// 中身と期間が前回と同じなら何もしない。メモ（予定の説明）は渡さない
    @objc func syncCalendar(_ call: CAPPluginCall) {
        guard let from = call.getString("from"), let to = call.getString("to"),
              let start = Self.date(from), let endDay = Self.date(to),
              let json = call.getString("json"), json.utf8.count < 5_000_000,
              let items = try? JSONDecoder().decode([CalItem].self, from: Data(json.utf8)) else {
            call.reject("カレンダーに書く中身が正しくありません")
            return
        }
        let store = Self.eventStore
        let stamp = Self.fingerprint("\(from)|\(to)|\(json)")
        let work: (Bool) -> Void = { granted in
            Self.calendarQueue.async {
                guard granted else {
                    call.reject("カレンダーへのアクセスが許可されていません")
                    return
                }
                if UserDefaults.standard.string(forKey: Self.lastSyncKey) == stamp,
                   let id = UserDefaults.standard.string(forKey: Self.calendarIdKey), store.calendar(withIdentifier: id) != nil {
                    call.resolve(["written": 0])
                    return
                }
                do {
                    let cal = try Self.kurashiCalendar()
                    let end = Calendar.current.date(byAdding: .day, value: 1, to: endDay) ?? endDay
                    let old = store.events(matching: store.predicateForEvents(withStart: start, end: end, calendars: [cal]))
                    for e in old { try store.remove(e, span: .thisEvent, commit: false) }
                    var written = 0
                    for it in items {
                        guard let s = Self.date(it.startDate, it.allDay ? "00:00" : it.startTime) else { continue }
                        let e = EKEvent(eventStore: store)
                        e.calendar = cal
                        e.title = it.title
                        e.isAllDay = it.allDay
                        e.startDate = s
                        if it.allDay {
                            e.endDate = Self.date(it.endDate) ?? s
                        } else {
                            let en = Self.date(it.endDate, it.endTime) ?? s
                            e.endDate = en > s ? en : s.addingTimeInterval(3600)
                        }
                        if !it.location.isEmpty { e.location = it.location }
                        try store.save(e, span: .thisEvent, commit: false)
                        written += 1
                    }
                    try store.commit()
                    UserDefaults.standard.set(stamp, forKey: Self.lastSyncKey)
                    call.resolve(["written": written])
                } catch {
                    store.reset()
                    call.reject("カレンダーに書けませんでした：\(error.localizedDescription)")
                }
            }
        }
        if #available(iOS 17.0, *) {
            store.requestFullAccessToEvents { granted, _ in work(granted) }
        } else {
            store.requestAccess(to: .event) { granted, _ in work(granted) }
        }
    }
}
