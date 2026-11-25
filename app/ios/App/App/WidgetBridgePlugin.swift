import Foundation
import UIKit
import Capacitor
import WidgetKit
import EventKit
import UserNotifications
import Vision

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
        CAPPluginMethod(name: "syncCalendar", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "backupStatus", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "calendarStatus", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "requestCalendarResync", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "setCalendarSync", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "removeCalendarEvents", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "openAppSettings", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "scheduleReminders", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "reminderStatus", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "requestReminderPermission", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "recognizeText", returnType: CAPPluginReturnPromise)
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
    private static let lastSyncAtKey = "kbCalendarLastSyncAt"
    /// くらしベースが書いた予定の印（これが付いた予定だけを書き直す。レビュー o1 の P05）
    private static let ownedMark = URL(string: "kurashibase://calendar-item")!
    /// 印を付ける前の版で書いた予定を、1回だけまとめて消したか
    private static let ownedMigratedKey = "kbCalendarOwnedV2"
    private static let calendarTitle = "くらしベース"
    /// iPhone のカレンダーへの反映のオン・オフ（100点化の指示 B。初めはオン。オフのあいだは何も書かない）
    private static let calendarEnabledKey = "kbCalendarSyncEnabled"
    private static var calendarEnabled: Bool { UserDefaults.standard.object(forKey: calendarEnabledKey) as? Bool ?? true }
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
        // オフのときは、アクセスも聞かず、何も書かない
        guard Self.calendarEnabled else {
            call.resolve(["written": 0, "disabled": true])
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
                // 待っているあいだにオフにされたら書かない
                guard Self.calendarEnabled else {
                    call.resolve(["written": 0, "disabled": true])
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
                    // くらしベースが書いた予定（印つき）だけを消す。手で入れた予定は残す。
                    // 印を付ける前の版で書いた予定は印がないので、最初の1回だけ、これから書く予定と
                    // 名前・始まりの日が同じで印のないものに限って消す（手で入れた予定を巻き込まない。点検役の指摘）
                    let migrated = UserDefaults.standard.bool(forKey: Self.ownedMigratedKey)
                    let dayF = DateFormatter()
                    dayF.calendar = Calendar(identifier: .gregorian)
                    dayF.locale = Locale(identifier: "en_US_POSIX")
                    dayF.timeZone = .current
                    dayF.dateFormat = "yyyy-MM-dd"
                    let ours = Set(items.map { "\($0.title)|\($0.startDate)" })
                    for e in old {
                        let isOurs = e.url == Self.ownedMark
                        let oldVersion = !migrated && e.url == nil && ours.contains("\(e.title ?? "")|\(dayF.string(from: e.startDate))")
                        if isOurs || oldVersion { try store.remove(e, span: .thisEvent, commit: false) }
                    }
                    var written = 0
                    // 日時を読めずに書かなかった予定の数（黙って捨てず、画面に知らせる。o11 A07 点検 中-3）
                    var skipped = 0
                    for it in items {
                        guard let s = Self.date(it.startDate, it.allDay ? "00:00" : it.startTime) else { skipped += 1; continue }
                        let e = EKEvent(eventStore: store)
                        e.calendar = cal
                        e.url = Self.ownedMark
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
                    UserDefaults.standard.set(true, forKey: Self.ownedMigratedKey)
                    UserDefaults.standard.set(ISO8601DateFormatter().string(from: Date()), forKey: Self.lastSyncAtKey)
                    call.resolve(["written": written, "skipped": skipped])
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

    // MARK: - 状態（設定の「iPhone の連携」。components/NativeStatusCard.tsx）

    /// いちばん新しい自動バックアップ
    @objc func backupStatus(_ call: CAPPluginCall) {
        let fm = FileManager.default
        guard let docs = fm.urls(for: .documentDirectory, in: .userDomainMask).first else {
            call.resolve(["kept": 0])
            return
        }
        let dir = docs.appendingPathComponent(Self.backupFolder, isDirectory: true)
        let files = ((try? fm.contentsOfDirectory(atPath: dir.path)) ?? [])
            .filter { $0.hasPrefix(Self.prefix) && $0.hasSuffix(".json") }
            .sorted(by: >)
        var out: [String: Any] = ["kept": files.count]
        if let latest = files.first {
            out["latestName"] = latest
            if let attr = try? fm.attributesOfItem(atPath: dir.appendingPathComponent(latest).path),
               let d = attr[.modificationDate] as? Date {
                out["latestAt"] = ISO8601DateFormatter().string(from: d)
            }
        }
        call.resolve(out)
    }

    /// カレンダーへのアクセスと、最後に反映した時刻
    @objc func calendarStatus(_ call: CAPPluginCall) {
        let status = EKEventStore.authorizationStatus(for: .event)
        var access = "notDetermined"
        if #available(iOS 17.0, *) {
            switch status {
            case .fullAccess: access = "full"
            case .writeOnly: access = "writeOnly"
            case .denied: access = "denied"
            case .restricted: access = "restricted"
            default: access = "notDetermined"
            }
        } else {
            switch status {
            case .authorized: access = "full"
            case .denied: access = "denied"
            case .restricted: access = "restricted"
            default: access = "notDetermined"
            }
        }
        var out: [String: Any] = ["access": access, "enabled": Self.calendarEnabled]
        if let at = UserDefaults.standard.string(forKey: Self.lastSyncAtKey) { out["lastSyncAt"] = at }
        if let id = UserDefaults.standard.string(forKey: Self.calendarIdKey) {
            out["calendarExists"] = Self.eventStore.calendar(withIdentifier: id) != nil
        }
        call.resolve(out)
    }

    /// 次の反映で、中身が同じでも書き直す
    @objc func requestCalendarResync(_ call: CAPPluginCall) {
        UserDefaults.standard.removeObject(forKey: Self.lastSyncKey)
        call.resolve()
    }

    /// 反映のオン・オフ。オンに戻したら、次の反映で書き直す
    @objc func setCalendarSync(_ call: CAPPluginCall) {
        let on = call.getBool("enabled") ?? true
        Self.calendarQueue.async {
            UserDefaults.standard.set(on, forKey: Self.calendarEnabledKey)
            UserDefaults.standard.removeObject(forKey: Self.lastSyncKey)
            call.resolve(["enabled": on])
        }
    }

    /// くらしベースが入れた予定（印つき）だけを、「くらしベース」カレンダーから消す。
    /// 手で入れた予定とカレンダーそのものは消さない。オフにしたときに、本人が「消す」を選んだときだけ呼ぶ
    @objc func removeCalendarEvents(_ call: CAPPluginCall) {
        Self.calendarQueue.async {
            let store = Self.eventStore
            // 予定を読めない（許可しない・追加のみ）ときは、消せたことにしない（点検役の指摘）
            let canRead: Bool
            if #available(iOS 17.0, *) {
                canRead = EKEventStore.authorizationStatus(for: .event) == .fullAccess
            } else {
                canRead = EKEventStore.authorizationStatus(for: .event) == .authorized
            }
            guard canRead else {
                call.reject("カレンダーへのフルアクセスがないので、予定を消せません")
                return
            }
            guard let id = UserDefaults.standard.string(forKey: Self.calendarIdKey), let cal = store.calendar(withIdentifier: id) else {
                call.resolve(["removed": 0])
                return
            }
            do {
                var removed = 0
                // 1年ずつの区切りの境目にかかる予定は2回出てくるので、同じ予定は1回だけ消す
                var seen = Set<String>()
                // EventKit は一度に4年までしか探せないので、1年ずつ（3年前〜3年先）
                let now = Date()
                for y in -3..<3 {
                    guard let s = Calendar.current.date(byAdding: .year, value: y, to: now),
                          let e = Calendar.current.date(byAdding: .year, value: y + 1, to: now) else { continue }
                    for ev in store.events(matching: store.predicateForEvents(withStart: s, end: e, calendars: [cal])) where ev.url == Self.ownedMark {
                        guard seen.insert(ev.calendarItemIdentifier).inserted else { continue }
                        try store.remove(ev, span: .thisEvent, commit: false)
                        removed += 1
                    }
                }
                try store.commit()
                UserDefaults.standard.removeObject(forKey: Self.lastSyncKey)
                call.resolve(["removed": removed])
            } catch {
                store.reset()
                call.reject("カレンダーの予定を消せませんでした：\(error.localizedDescription)")
            }
        }
    }

    // MARK: - 文字の読み取り（NEXT v21 OCR。iPhone の Vision。端末の中だけで行い、画像も文字も外へは送らない）

    /// 画像（base64 の JPEG/PNG）から、文字を上から下の順に読み取る。結果は「行の一覧」だけ（画像は保存しない）。
    /// 読み取った内容は候補にすぎない（日付・金額・店名の解釈と確認は、画面側で本人が行う）
    @objc func recognizeText(_ call: CAPPluginCall) {
        guard let b64 = call.getString("image"), b64.utf8.count < 12_000_000,
              let data = Data(base64Encoded: b64), let image = UIImage(data: data), let cg = image.cgImage else {
            call.reject("画像を読み込めませんでした")
            return
        }
        // 結果は1回だけ返す（読み取りの完了と例外の両方が来ても、二重に返さない）
        var finished = false
        let finish: (@escaping () -> Void) -> Void = { body in
            DispatchQueue.main.async {
                if finished { return }
                finished = true
                body()
            }
        }
        let request = VNRecognizeTextRequest { req, error in
            if let error = error {
                finish { call.reject("文字を読み取れませんでした：\(error.localizedDescription)") }
                return
            }
            let obs = (req.results as? [VNRecognizedTextObservation]) ?? []
            // 上から下へ（boundingBox は左下が原点なので、minY の大きい順）。同じ高さは左から
            let sorted = obs.sorted { a, b in
                let ay = a.boundingBox.midY, by = b.boundingBox.midY
                if abs(ay - by) > 0.012 { return ay > by }
                return a.boundingBox.minX < b.boundingBox.minX
            }
            let lines = sorted.compactMap { $0.topCandidates(1).first?.string }.filter { !$0.isEmpty }
            finish { call.resolve(["lines": lines]) }
        }
        request.recognitionLevel = .accurate
        request.usesLanguageCorrection = true
        request.recognitionLanguages = ["ja-JP", "en-US"]
        DispatchQueue.global(qos: .userInitiated).async {
            let orientation = CGImagePropertyOrientation(image.imageOrientation)
            let handler = VNImageRequestHandler(cgImage: cg, orientation: orientation, options: [:])
            do {
                try handler.perform([request])
            } catch {
                finish { call.reject("文字を読み取れませんでした：\(error.localizedDescription)") }
            }
        }
    }

    // MARK: - 通知（NEXT v21 X13）

    /// くらしベースが登録した通知の ID の頭（これで始まるものだけを入れ替える。ほかのアプリ・ほかの通知には触れない）
    private static let reminderPrefix = "kb|"

    private struct ReminderItem: Decodable {
        let id: String
        let title: String
        let body: String
        /// 端末の現地時刻 "YYYY-MM-DDTHH:mm"
        let at: String
    }

    private static func components(_ at: String) -> DateComponents? {
        let parts = at.split(separator: "T")
        guard parts.count == 2 else { return nil }
        let d = parts[0].split(separator: "-").compactMap { Int($0) }
        let t = parts[1].split(separator: ":").compactMap { Int($0) }
        guard d.count == 3, t.count == 2 else { return nil }
        var c = DateComponents()
        c.calendar = Calendar.current
        c.timeZone = TimeZone.current
        c.year = d[0]; c.month = d[1]; c.day = d[2]; c.hour = t[0]; c.minute = t[1]
        return c
    }

    /// いま必要な通知を全部入れ替える（くらしベースの通知だけ）。空の一覧なら、くらしベースの通知を全部消す。
    /// 許可がまだなら、1件以上あるときに聞く。拒否されていたら何も登録せず denied を返す
    @objc func scheduleReminders(_ call: CAPPluginCall) {
        guard let json = call.getString("json"), json.utf8.count < 200_000,
              let items = try? JSONDecoder().decode([ReminderItem].self, from: Data(json.utf8)) else {
            call.reject("通知の中身が正しくありません")
            return
        }
        let center = UNUserNotificationCenter.current()
        let apply: () -> Void = {
            center.getPendingNotificationRequests { pending in
                let mine = pending.map { $0.identifier }.filter { $0.hasPrefix(Self.reminderPrefix) }
                center.removePendingNotificationRequests(withIdentifiers: mine)
                // 登録できた数と、できなかった数（時刻を読めない・登録の失敗）を、本当の結果で数える（o11 A07 点検 中-3）
                let group = DispatchGroup()
                let lock = NSLock()
                var n = 0
                var failed = 0
                for it in items.prefix(60) where it.id.hasPrefix(Self.reminderPrefix) {
                    guard let c = Self.components(it.at) else { lock.lock(); failed += 1; lock.unlock(); continue }
                    let content = UNMutableNotificationContent()
                    content.title = it.title
                    content.body = it.body
                    content.sound = .default
                    let trigger = UNCalendarNotificationTrigger(dateMatching: c, repeats: false)
                    group.enter()
                    center.add(UNNotificationRequest(identifier: it.id, content: content, trigger: trigger)) { error in
                        lock.lock()
                        if error == nil { n += 1 } else { failed += 1 }
                        lock.unlock()
                        group.leave()
                    }
                }
                group.notify(queue: .global()) {
                    call.resolve(["scheduled": n, "removed": mine.count, "failed": failed])
                }
            }
        }
        center.getNotificationSettings { s in
            switch s.authorizationStatus {
            case .authorized, .provisional, .ephemeral:
                apply()
            case .notDetermined:
                if items.isEmpty {
                    apply()
                } else {
                    center.requestAuthorization(options: [.alert, .sound]) { granted, _ in
                        if granted { apply() } else { call.resolve(["scheduled": 0, "denied": true]) }
                    }
                }
            default:
                // 拒否されている：登録できない。すでにある分は、消しておく
                center.getPendingNotificationRequests { pending in
                    center.removePendingNotificationRequests(withIdentifiers: pending.map { $0.identifier }.filter { $0.hasPrefix(Self.reminderPrefix) })
                    call.resolve(["scheduled": 0, "denied": true])
                }
            }
        }
    }

    /// 通知の許可と、いま登録している件数（設定の「通知」の表示用）
    @objc func reminderStatus(_ call: CAPPluginCall) {
        let center = UNUserNotificationCenter.current()
        center.getNotificationSettings { s in
            var access = "notDetermined"
            switch s.authorizationStatus {
            case .authorized, .provisional, .ephemeral: access = "granted"
            case .denied: access = "denied"
            default: access = "notDetermined"
            }
            center.getPendingNotificationRequests { pending in
                call.resolve(["access": access, "pending": pending.filter { $0.identifier.hasPrefix(Self.reminderPrefix) }.count])
            }
        }
    }

    /// 通知の許可を聞く（オンにしたときだけ）
    @objc func requestReminderPermission(_ call: CAPPluginCall) {
        UNUserNotificationCenter.current().requestAuthorization(options: [.alert, .sound]) { granted, _ in
            call.resolve(["granted": granted])
        }
    }

    /// iPhone の「設定」のこのアプリの画面を開く（カレンダーへのアクセスを変えるため）
    @objc func openAppSettings(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            if let url = URL(string: UIApplication.openSettingsURLString) {
                UIApplication.shared.open(url)
            }
            call.resolve()
        }
    }
}

/// UIImage の向きを、Vision が使う向きに変える
extension CGImagePropertyOrientation {
    init(_ o: UIImage.Orientation) {
        switch o {
        case .up: self = .up
        case .upMirrored: self = .upMirrored
        case .down: self = .down
        case .downMirrored: self = .downMirrored
        case .left: self = .left
        case .leftMirrored: self = .leftMirrored
        case .right: self = .right
        case .rightMirrored: self = .rightMirrored
        @unknown default: self = .up
        }
    }
}
