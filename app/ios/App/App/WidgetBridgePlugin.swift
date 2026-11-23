import Foundation
import UIKit
import Capacitor
import WidgetKit

/// Web の画面（components/WidgetSync.tsx）から受け取った要約を、ウィジェットと一緒に使う置き場（App Group）に書く。
/// あわせて、その日の自動バックアップを書類フォルダに書く。
/// 要約は端末の中にだけ置き、外へは送らない。
@objc(WidgetBridgePlugin)
public class WidgetBridgePlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "WidgetBridgePlugin"
    public let jsName = "WidgetBridge"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "setSummary", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "writeBackup", returnType: CAPPluginReturnPromise)
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
}
