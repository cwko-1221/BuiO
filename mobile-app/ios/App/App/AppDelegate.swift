import UIKit
import Capacitor
import WebKit

@UIApplicationMain
class AppDelegate: UIResponder, UIApplicationDelegate {

    var window: UIWindow?

    func application(_ application: UIApplication, didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?) -> Bool {
        // Override point for customization after application launch.
        return true
    }

    func applicationWillResignActive(_ application: UIApplication) {
        // Sent when the application is about to move from active to inactive state. This can occur for certain types of temporary interruptions (such as an incoming phone call or SMS message) or when the user quits the application and it begins the transition to the background state.
        // Use this method to pause ongoing tasks, disable timers, and invalidate graphics rendering callbacks. Games should use this method to pause the game.
    }

    func applicationDidEnterBackground(_ application: UIApplication) {
        // Use this method to release shared resources, save user data, invalidate timers, and store enough application state information to restore your application to its current state in case it is terminated later.
        // If your application supports background execution, this method is called instead of applicationWillTerminate: when the user quits.
    }

    func applicationWillEnterForeground(_ application: UIApplication) {
        // Called as part of the transition from the background to the active state; here you can undo many of the changes made on entering the background.
    }

    func applicationDidBecomeActive(_ application: UIApplication) {
        // Restart any tasks that were paused (or not yet started) while the application was inactive. If the application was previously in the background, optionally refresh the user interface.
    }

    func applicationWillTerminate(_ application: UIApplication) {
        // Called when the application is about to terminate. Save data if appropriate. See also applicationDidEnterBackground:.
    }

    func application(_ application: UIApplication,
                     configurationForConnecting connectingSceneSession: UISceneSession,
                     options: UIScene.ConnectionOptions) -> UISceneConfiguration {
        let config = UISceneConfiguration(name: "Default Configuration",
                                          sessionRole: connectingSceneSession.role)
        config.delegateClass = SceneDelegate.self
        return config
    }
}

// Keep the native additions small: no token extraction, request rewriting,
// custom cookie stores or changes to the game's simulation/network timing.
@objc(BuiOViewController)
class BuiOViewController: CAPBridgeViewController {
    private var keyboardBottom: NSLayoutConstraint?
    private var landscapeModule = false
    private var immersive = false
    private var returnOrientation: UIInterfaceOrientation = .portrait
    private var lastInsets = ""
    private var lastOrientationLock = false
    private var downloadDelegate: BuiODownloadDelegate?
    private var pendingExports: [URL] = []
    private var exportPresentationPending = false

    override func capacitorDidLoad() {
        super.capacitorDidLoad()
        guard let webView = webView else { return }

        // Paint edge to edge. Each module places its controls within CSS safe
        // areas; the native host must not create white strips around the page.
        let container = UIView(frame: webView.frame)
        container.backgroundColor = UIColor(red: 0.96, green: 0.97, blue: 0.98, alpha: 1)
        view = container
        webView.translatesAutoresizingMaskIntoConstraints = false
        container.addSubview(webView)
        let bottom = webView.bottomAnchor.constraint(equalTo: container.bottomAnchor)
        keyboardBottom = bottom
        NSLayoutConstraint.activate([
            webView.topAnchor.constraint(equalTo: container.topAnchor),
            webView.leadingAnchor.constraint(equalTo: container.leadingAnchor),
            webView.trailingAnchor.constraint(equalTo: container.trailingAnchor), bottom
        ])
        webView.isOpaque = false
        webView.scrollView.showsVerticalScrollIndicator = false
        webView.scrollView.showsHorizontalScrollIndicator = false
        webView.allowsBackForwardNavigationGestures = true
        NotificationCenter.default.addObserver(self, selector: #selector(keyboardFrameChanged(_:)),
            name: UIResponder.keyboardWillChangeFrameNotification, object: nil)
        NotificationCenter.default.addObserver(self, selector: #selector(resumeExports),
            name: UIApplication.didBecomeActiveNotification, object: nil)
        webView.configuration.userContentController.add(BuiOLayoutHandler(owner: self), name: "buioLayout")
        if let original = webView.navigationDelegate {
            let downloads = BuiODownloadDelegate(owner: self, original: original)
            downloadDelegate = downloads
            webView.navigationDelegate = downloads
        }

        // Capacitor replaces the configuration's userContentController when
        // creating its bridge. Install our script on the final controller,
        // before viewDidLoad starts the first navigation.
        if let url = Bundle.main.url(forResource: "runtime", withExtension: "js", subdirectory: "public"),
           let source = try? String(contentsOf: url, encoding: .utf8) {
            webView.configuration.userContentController.addUserScript(WKUserScript(
                source: source, injectionTime: .atDocumentStart, forMainFrameOnly: true))
        }
    }

    deinit { NotificationCenter.default.removeObserver(self) }

    @objc private func keyboardFrameChanged(_ notification: Notification) {
        guard let frame = notification.userInfo?[UIResponder.keyboardFrameEndUserInfoKey] as? CGRect else { return }
        let local = view.convert(frame, from: nil)
        // A floating iPad keyboard should not collapse the entire canvas.
        let docked = local.width >= view.bounds.width * 0.8 && local.maxY >= view.bounds.maxY
        keyboardBottom?.constant = docked ? -max(0, view.bounds.maxY - local.minY) : 0
        let duration = notification.userInfo?[UIResponder.keyboardAnimationDurationUserInfoKey] as? Double ?? 0.25
        UIView.animate(withDuration: duration) { self.view.layoutIfNeeded() }
    }

    fileprivate func applyLayout(_ message: WKScriptMessage) {
        guard message.frameInfo.isMainFrame,
              let url = message.frameInfo.request.url, let expected = bridge?.config.serverURL,
              url.scheme == expected.scheme, url.host == expected.host, url.port == expected.port,
              let body = message.body as? [String: Any] else { return }
        #if DEBUG
        if expected.host == "127.0.0.1", body["dismissFixtureExport"] as? Bool == true,
           let activity = presentedViewController as? UIActivityViewController {
            activity.completionWithItemsHandler?(nil, false, nil, nil)
            return
        }
        #endif
        let science = url.path == "/science-lab" || url.path.hasPrefix("/science-lab/")
        let game = ["/pet", "/pet/", "/game", "/game/", "/tower-defense", "/tower-defense/"].contains(url.path)
        let forceLandscape = science || (game && (body["landscape"] as? Bool == true))
        immersive = science || (game && (body["immersive"] as? Bool == true))
        setStatusBarVisible(!immersive)
        setStatusBarStyle(body["lightStatus"] as? Bool == true ? .lightContent : .darkContent)
        webView?.allowsBackForwardNavigationGestures = !immersive
        webView?.scrollView.bounces = !immersive
        webView?.scrollView.pinchGestureRecognizer?.isEnabled = !immersive
        if let hex = body["background"] as? String, hex.range(of: "^#[0-9a-fA-F]{6}$", options: .regularExpression) != nil,
           let value = UInt32(hex.dropFirst(), radix: 16) {
            let color = UIColor(red: CGFloat((value >> 16) & 255) / 255,
                green: CGFloat((value >> 8) & 255) / 255, blue: CGFloat(value & 255) / 255, alpha: 1)
            view.backgroundColor = color
            webView?.backgroundColor = color
            webView?.scrollView.backgroundColor = color
        }
        if landscapeModule != forceLandscape {
            if forceLandscape {
                returnOrientation = view.window?.windowScene?.interfaceOrientation ?? .portrait
                if returnOrientation == .unknown { returnOrientation = .portrait }
            }
            landscapeModule = forceLandscape
            updateOrientation()
        }
        publishLayout(force: true)
    }

    override var supportedInterfaceOrientations: UIInterfaceOrientationMask {
        landscapeModule ? .landscape : (UIDevice.current.userInterfaceIdiom == .pad ? .all : .allButUpsideDown)
    }
    override var preferredInterfaceOrientationForPresentation: UIInterfaceOrientation {
        landscapeModule ? .landscapeRight : returnOrientation
    }
    @available(iOS 26.0, *)
    override var prefersInterfaceOrientationLocked: Bool { landscapeModule && view.bounds.width > view.bounds.height }

    override func viewDidAppear(_ animated: Bool) {
        super.viewDidAppear(animated)
        if landscapeModule { updateOrientation() }
        presentNextExport()
    }

    override func viewDidLayoutSubviews() {
        super.viewDidLayoutSubviews()
        if #available(iOS 26.0, *) {
            let locked = prefersInterfaceOrientationLocked
            if locked != lastOrientationLock {
                lastOrientationLock = locked
                setNeedsUpdateOfPrefersInterfaceOrientationLocked()
            }
        }
        publishLayout()
    }

    private func publishLayout(force: Bool = false) {
        guard let webView = webView else { return }
        let insets = view.safeAreaInsets
        let edges: [String: Double] = ["top": Double(insets.top), "right": Double(insets.right),
            "bottom": keyboardBottom?.constant == 0 ? Double(insets.bottom) : 0, "left": Double(insets.left)]
        guard let data = try? JSONSerialization.data(withJSONObject: edges, options: .sortedKeys),
              let json = String(data: data, encoding: .utf8) else { return }
        var script = "window.BuiOApplyInsets?.(\(json));"
        var layoutState = json
        #if DEBUG
        // Anonymous loopback CI fixture only; absent from the release app.
        if bridge?.config.serverURL.host == "127.0.0.1" {
            let values: [String: Double] = [
                "containerWidth": Double(view.bounds.width), "containerHeight": Double(view.bounds.height),
                "width": Double(webView.bounds.width), "height": Double(webView.bounds.height),
                "x": Double(webView.frame.minX), "y": Double(webView.frame.minY),
                "top": Double(insets.top), "right": Double(insets.right),
                "bottom": Double(insets.bottom), "left": Double(insets.left)
            ]
            if let data = try? JSONSerialization.data(withJSONObject: values, options: .sortedKeys), let json = String(data: data, encoding: .utf8) {
                layoutState += json
                script += "window.BuiONativeLayout=\(json);window.dispatchEvent(new Event('buio:native-layout'));"
            }
        }
        #endif
        if force || layoutState != lastInsets {
            lastInsets = layoutState
            webView.evaluateJavaScript(script)
        }
    }

    private func updateOrientation() {
        if #available(iOS 16.0, *) {
            setNeedsUpdateOfSupportedInterfaceOrientations()
            if #available(iOS 26.0, *) { setNeedsUpdateOfPrefersInterfaceOrientationLocked() }
            DispatchQueue.main.async { [weak self] in
                guard let self = self else { return }
                let previous = UIInterfaceOrientationMask(rawValue: 1 << self.returnOrientation.rawValue)
                self.view.window?.windowScene?.requestGeometryUpdate(.iOS(interfaceOrientations: self.landscapeModule ? .landscape : previous)) { error in
                    NSLog("BuiO orientation request: %@", error.localizedDescription)
                }
            }
        } else { UIViewController.attemptRotationToDeviceOrientation() }
    }

    fileprivate func permitsExportURL(_ url: URL?) -> Bool {
        guard let url = url, let expected = bridge?.config.serverURL else { return false }
        if url.scheme == "blob" {
            let origin = expected.absoluteString.trimmingCharacters(in: CharacterSet(charactersIn: "/"))
            return url.absoluteString.hasPrefix("blob:" + origin + "/")
        }
        if url.scheme == "data" { return true }
        return url.scheme == expected.scheme && url.host == expected.host && url.port == expected.port
    }

    fileprivate func shareExport(_ url: URL) {
        pendingExports.append(url)
        #if DEBUG
        if bridge?.config.serverURL.host == "127.0.0.1" {
            let size = (try? url.resourceValues(forKeys: [.fileSizeKey]).fileSize) ?? 0
            let details: [String: Any] = ["name": url.lastPathComponent, "bytes": size]
            if let data = try? JSONSerialization.data(withJSONObject: details), let json = String(data: data, encoding: .utf8) {
                webView?.evaluateJavaScript("window.BuiODownloads=window.BuiODownloads||[];window.BuiODownloads.push(\(json));window.BuiODownloadReady=true;window.dispatchEvent(new Event('buio:native-layout'));")
            }
        }
        #endif
        presentNextExport()
    }

    private func presentNextExport() {
        guard !exportPresentationPending, presentedViewController == nil, !pendingExports.isEmpty,
              viewIfLoaded?.window?.windowScene?.activationState == .foregroundActive else { return }
        exportPresentationPending = true
        let url = pendingExports.removeFirst()
        let share = UIActivityViewController(activityItems: [url], applicationActivities: nil)
        if let popover = share.popoverPresentationController {
            popover.sourceView = view
            popover.sourceRect = CGRect(x: view.bounds.midX, y: view.bounds.midY, width: 1, height: 1)
            popover.permittedArrowDirections = []
        }
        share.completionWithItemsHandler = { [weak self, weak share] _, _, _, _ in
            try? FileManager.default.removeItem(at: url.deletingLastPathComponent())
            let advance: () -> Void = { [weak self] in
                self?.exportPresentationPending = false
                self?.presentNextExport()
            }
            if let share = share, share.presentingViewController != nil {
                if share.isBeingDismissed, let transition = share.transitionCoordinator,
                   transition.animate(alongsideTransition: nil, completion: { _ in DispatchQueue.main.async(execute: advance) }) { return }
                share.dismiss(animated: true, completion: advance)
            } else { DispatchQueue.main.async(execute: advance) }
        }
        present(share, animated: true) { [weak self] in
            #if DEBUG
            if self?.bridge?.config.serverURL.host == "127.0.0.1" {
                self?.webView?.evaluateJavaScript("window.BuiOSharePresented=true;window.BuiOShareCount=(window.BuiOShareCount||0)+1;window.dispatchEvent(new Event('buio:native-layout'));")
            }
            #endif
        }
    }

    @objc private func resumeExports() { presentNextExport() }

    fileprivate func exportFailed() {
        guard presentedViewController == nil else { return }
        let alert = UIAlertController(title: "匯出未完成", message: "請返回原來頁面再試一次。", preferredStyle: .alert)
        alert.addAction(UIAlertAction(title: "知道了", style: .default))
        present(alert, animated: true)
    }

    override func webViewConfiguration(for instanceConfiguration: InstanceConfiguration) -> WKWebViewConfiguration {
        let configuration = super.webViewConfiguration(for: instanceConfiguration)
        configuration.websiteDataStore = .default()
        configuration.allowsInlineMediaPlayback = true
        // Follow normal iOS audio rules: learning audio starts with a gesture.
        configuration.mediaTypesRequiringUserActionForPlayback = .audio
        return configuration
    }
}

private final class BuiOLayoutHandler: NSObject, WKScriptMessageHandler {
    weak var owner: BuiOViewController?
    init(owner: BuiOViewController) { self.owner = owner }
    func userContentController(_ controller: WKUserContentController, didReceive message: WKScriptMessage) {
        owner?.applyLayout(message)
    }
}

// Keep Capacitor's normal navigation, authentication challenges and lifecycle
// delegate intact. Only file-download policies are handled here; WebKit keeps
// the original cookie context and streams the file directly to the sandbox.
private final class BuiODownloadDelegate: NSObject, WKNavigationDelegate, WKDownloadDelegate {
    weak var owner: BuiOViewController?
    let original: WKNavigationDelegate
    private var files: [ObjectIdentifier: URL] = [:]
    private var convertingToDownload = false
    init(owner: BuiOViewController, original: WKNavigationDelegate) { self.owner = owner; self.original = original }
    override func responds(to selector: Selector!) -> Bool { super.responds(to: selector) || original.responds(to: selector) }
    override func forwardingTarget(for selector: Selector!) -> Any? {
        original.responds(to: selector) ? original : super.forwardingTarget(for: selector)
    }
    func webView(_ webView: WKWebView, decidePolicyFor action: WKNavigationAction, decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
        if action.shouldPerformDownload, owner?.permitsExportURL(action.sourceFrame.request.url) == true,
           owner?.permitsExportURL(action.request.url) == true {
            convertingToDownload = true
            decisionHandler(.download); return
        }
        if action.targetFrame?.isMainFrame == true { convertingToDownload = false }
        if original.responds(to: NSSelectorFromString("webView:decidePolicyForNavigationAction:decisionHandler:")) {
            original.webView?(webView, decidePolicyFor: action, decisionHandler: decisionHandler)
        } else { decisionHandler(.allow) }
    }
    func webView(_ webView: WKWebView, decidePolicyFor response: WKNavigationResponse, decisionHandler: @escaping (WKNavigationResponsePolicy) -> Void) {
        let attachment = (response.response as? HTTPURLResponse)?.value(forHTTPHeaderField: "Content-Disposition")?.lowercased().contains("attachment") == true
        if response.isForMainFrame, (attachment || !response.canShowMIMEType), owner?.permitsExportURL(response.response.url) == true {
            convertingToDownload = true
            decisionHandler(.download); return
        }
        if original.responds(to: NSSelectorFromString("webView:decidePolicyForNavigationResponse:decisionHandler:")) {
            original.webView?(webView, decidePolicyFor: response, decisionHandler: decisionHandler)
        } else { decisionHandler(.allow) }
    }
    func webView(_ webView: WKWebView, navigationAction: WKNavigationAction, didBecome download: WKDownload) { download.delegate = self }
    func webView(_ webView: WKWebView, navigationResponse: WKNavigationResponse, didBecome download: WKDownload) { download.delegate = self }
    private func expectedInterruption(_ error: Error) -> Bool {
        let value = error as NSError
        if value.domain == NSURLErrorDomain && value.code == NSURLErrorCancelled { return true }
        // WebKit reports a navigation converted to WKDownload as a policy
        // interruption (legacy WebKit code 102). It is not a network failure.
        return convertingToDownload && value.code == 102 &&
            ["WebKitErrorDomain", WKErrorDomain].contains(value.domain)
    }
    func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) {
        if !expectedInterruption(error) { original.webView?(webView, didFail: navigation, withError: error) }
    }
    func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) {
        if !expectedInterruption(error) { original.webView?(webView, didFailProvisionalNavigation: navigation, withError: error) }
    }
    func download(_ download: WKDownload, decideDestinationUsing response: URLResponse, suggestedFilename: String, completionHandler: @escaping (URL?) -> Void) {
        let directory = FileManager.default.temporaryDirectory.appendingPathComponent("BuiO-Exports", isDirectory: true).appendingPathComponent(UUID().uuidString, isDirectory: true)
        do {
            try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
            let name = (suggestedFilename as NSString).lastPathComponent
            let safe = name.isEmpty || name == "." || name == ".." ? "export" : String(name.prefix(160))
            let url = directory.appendingPathComponent(safe)
            files[ObjectIdentifier(download)] = url
            completionHandler(url)
        } catch { completionHandler(nil); owner?.exportFailed() }
    }
    func downloadDidFinish(_ download: WKDownload) {
        if let url = files.removeValue(forKey: ObjectIdentifier(download)) { owner?.shareExport(url) }
    }
    func download(_ download: WKDownload, didFailWithError error: Error, resumeData: Data?) {
        if let url = files.removeValue(forKey: ObjectIdentifier(download)) { try? FileManager.default.removeItem(at: url.deletingLastPathComponent()) }
        owner?.exportFailed()
    }
}
