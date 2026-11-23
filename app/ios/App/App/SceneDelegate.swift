import UIKit
import Capacitor

class SceneDelegate: UIResponder, UIWindowSceneDelegate {
    var window: UIWindow?

    func scene(_ scene: UIScene, willConnectTo session: UISceneSession, options connectionOptions: UIScene.ConnectionOptions) {
        guard let windowScene = scene as? UIWindowScene else { return }

        // ウィジェットのボタンでアプリが起動したとき
        if let url = connectionOptions.urlContexts.first?.url {
            MainViewController.pendingURL = url
        }
        #if DEBUG
        // 試し用（デバッグ版だけ）：simctl launch <id> -kbOpenURL kurashibase://add/expense で、ボタンと同じ処理を確かめる
        if let i = ProcessInfo.processInfo.arguments.firstIndex(of: "-kbOpenURL"),
           i + 1 < ProcessInfo.processInfo.arguments.count,
           let url = URL(string: ProcessInfo.processInfo.arguments[i + 1]) {
            MainViewController.pendingURL = url
        }
        #endif

        window = UIWindow(windowScene: windowScene)
        window?.rootViewController = MainViewController()
        window?.makeKeyAndVisible()

        SceneDelegateProxy.shared.scene(scene, willConnectTo: session, options: connectionOptions)
    }

    func scene(_ scene: UIScene, openURLContexts URLContexts: Set<UIOpenURLContext>) {
        // アプリが開いているときに、ウィジェットのボタンが押されたとき
        if let url = URLContexts.first?.url, let vc = window?.rootViewController as? MainViewController {
            vc.openAdd(from: url)
        }
        SceneDelegateProxy.shared.scene(scene, openURLContexts: URLContexts)
    }

    func scene(_ scene: UIScene, continue userActivity: NSUserActivity) {
        SceneDelegateProxy.shared.scene(scene, continue: userActivity)
    }
}
