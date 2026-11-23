import UIKit
import Capacitor

/// くらしベースの画面。ウィジェットへの橋渡し（WidgetBridgePlugin）を登録し、
/// ウィジェットのボタン（kurashibase://add/expense など）から入力画面を開く。
class MainViewController: CAPBridgeViewController {
    /// アプリが閉じていたときにボタンで開かれた URL（画面ができてから開く）
    static var pendingURL: URL?

    override open func capacitorDidLoad() {
        bridge?.registerPluginInstance(WidgetBridgePlugin())
    }

    override func viewDidLoad() {
        super.viewDidLoad()
        if let url = MainViewController.pendingURL {
            MainViewController.pendingURL = nil
            openAdd(from: url)
        }
    }

    /// kurashibase://add/<種類> → アプリの /?add=<種類> を開く（components/AddFromQuery.tsx）
    func openAdd(from url: URL) {
        guard url.scheme == "kurashibase", url.host == "add" else { return }
        let kind = url.lastPathComponent
        guard ["expense", "income", "event", "choose"].contains(kind),
              let base = bridge?.config.serverURL,
              var c = URLComponents(url: base, resolvingAgainstBaseURL: false) else { return }
        c.path = "/"
        c.queryItems = [URLQueryItem(name: "add", value: kind)]
        guard let target = c.url else { return }
        bridge?.webView?.load(URLRequest(url: target))
    }
}
