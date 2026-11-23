// Appli de test (simulateur iOS) : la page dans une WKWebView, comme Brave sur iPhone.
// Le micro est accordé d'office ; harness.js pilote la conversation et renvoie ses traces ici.
import AVFoundation
import UIKit
import WebKit

/// Trace : sortie standard, journal système et fichier Documents/harness.log (lu par run.sh).
func out(_ s: String) {
  let line = "HARNESS " + s + "\n"
  let data = line.data(using: .utf8)!
  FileHandle.standardOutput.write(data)
  NSLog("%@", line)
  let url = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask)[0].appendingPathComponent("harness.log")
  if let h = try? FileHandle(forWritingTo: url) {
    h.seekToEndOfFile()
    h.write(data)
    try? h.close()
  } else {
    try? data.write(to: url)
  }
}

@main
final class AppDelegate: UIResponder, UIApplicationDelegate {
  func application(_ application: UIApplication, didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil) -> Bool {
    true
  }

  // SDK iOS 27 : le cycle de vie UIScene est obligatoire.
  func application(_ application: UIApplication, configurationForConnecting connectingSceneSession: UISceneSession, options: UIScene.ConnectionOptions) -> UISceneConfiguration {
    let c = UISceneConfiguration(name: "Default", sessionRole: connectingSceneSession.role)
    c.delegateClass = SceneDelegate.self
    return c
  }
}

final class SceneDelegate: UIResponder, UIWindowSceneDelegate {
  var window: UIWindow?

  func scene(_ scene: UIScene, willConnectTo session: UISceneSession, options connectionOptions: UIScene.ConnectionOptions) {
    guard let ws = scene as? UIWindowScene else { return }
    let w = UIWindow(windowScene: ws)
    w.rootViewController = WebController()
    w.makeKeyAndVisible()
    window = w
  }
}

final class WebController: UIViewController, WKUIDelegate, WKNavigationDelegate, WKScriptMessageHandler {
  private var web: WKWebView!

  override func viewDidLoad() {
    super.viewDidLoad()
    let env = ProcessInfo.processInfo.environment
    let cfg = WKWebViewConfiguration()
    cfg.allowsInlineMediaPlayback = true
    // Le clic de harness.js n'est pas un vrai toucher : lecture audio permise sans geste.
    cfg.mediaTypesRequiringUserActionForPlayback = []
    cfg.applicationNameForUserAgent = "Version/27.0 Mobile/15E148 Safari/604.1"
    let uc = WKUserContentController()
    uc.add(self, name: "harness")
    var js = ""
    if let p = Bundle.main.path(forResource: "harness", ofType: "js"), let s = try? String(contentsOfFile: p, encoding: .utf8) {
      js = s
    }
    let settings = env["HARNESS_SETTINGS"] ?? "{}"
    let turns = env["HARNESS_TURNS"] ?? "3"
    let timeout = env["HARNESS_TIMEOUT"] ?? "480"
    let mode = env["HARNESS_MODE"] ?? ""
    // Réponse enregistrée, passée à la page en base64 (le site en ligne ne la sert pas).
    var wav = ""
    if let p = Bundle.main.path(forResource: "user-says", ofType: "wav"), let d = FileManager.default.contents(atPath: p) {
      wav = d.base64EncodedString()
    }
    let prelude = "window.__HARNESS = { settings: \(settings), turns: \(turns), timeout: \(timeout), mode: '\(mode)', wav: '\(wav)' };\n"
    // Au début du document : les espions (niveaux du micro, texte de Whisper) précèdent le code de l'appli.
    uc.addUserScript(WKUserScript(source: prelude + js, injectionTime: .atDocumentStart, forMainFrameOnly: true))
    cfg.userContentController = uc
    web = WKWebView(frame: view.bounds, configuration: cfg)
    web.autoresizingMask = [.flexibleWidth, .flexibleHeight]
    web.uiDelegate = self
    web.navigationDelegate = self
    if #available(iOS 16.4, *) { web.isInspectable = true }
    view.addSubview(web)
    let url = URL(string: env["HARNESS_URL"] ?? "http://localhost:4317/")!
    out("load \(url) session=\(AVAudioSession.sharedInstance().category.rawValue)")
    web.load(URLRequest(url: url))
  }

  func webView(_ webView: WKWebView, requestMediaCapturePermissionFor origin: WKSecurityOrigin, initiatedByFrame frame: WKFrameInfo, type: WKMediaCaptureType, decisionHandler: @escaping (WKPermissionDecision) -> Void) {
    out("media-permission type=\(type.rawValue) -> grant")
    decisionHandler(.grant)
  }

  func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
    let s = "\(message.body)"
    out(s)
    if s.hasPrefix("EXIT") {
      DispatchQueue.main.asyncAfter(deadline: .now() + 1.5) { exit(0) }
    }
  }

  func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) {
    out("nav-fail \(error.localizedDescription)")
  }

  func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) {
    out("nav-fail-provisional \(error.localizedDescription)")
  }

  func webViewWebContentProcessDidTerminate(_ webView: WKWebView) {
    out("WEBCONTENT-TERMINATED (page tuée)")
  }

  func webView(_ webView: WKWebView, runJavaScriptAlertPanelWithMessage message: String, initiatedByFrame frame: WKFrameInfo, completionHandler: @escaping () -> Void) {
    out("alert \(message)")
    completionHandler()
  }

  func webView(_ webView: WKWebView, runJavaScriptConfirmPanelWithMessage message: String, initiatedByFrame frame: WKFrameInfo, completionHandler: @escaping (Bool) -> Void) {
    out("confirm \(message)")
    completionHandler(true)
  }
}
