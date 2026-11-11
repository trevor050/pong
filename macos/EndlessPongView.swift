// macOS screen saver wrapper for Endless Pong.
//
// Loads the bundled web app (Contents/Resources/web) in a WKWebView with the
// #saver kiosk flag, so there is no UI, no cursor and no network access.
// Pick a look with any share link's hash, e.g.:
//   defaults -currentHost write com.trevor050.endlesspong look "p=seafoam&shuffle=1"
import ScreenSaver
import WebKit

@objc(EndlessPongView)
final class EndlessPongView: ScreenSaverView {
    private var webView: WKWebView?

    override init?(frame: NSRect, isPreview: Bool) {
        super.init(frame: frame, isPreview: isPreview)
        animationTimeInterval = 1.0 // the web view animates itself
        wantsLayer = true
        layer?.backgroundColor = NSColor.black.cgColor

        let config = WKWebViewConfiguration()
        config.mediaTypesRequiringUserActionForPlayback = .all
        let web = WKWebView(frame: bounds, configuration: config)
        web.autoresizingMask = [.width, .height]
        web.setValue(false, forKey: "drawsBackground")
        addSubview(web)
        webView = web

        let bundle = Bundle(for: EndlessPongView.self)
        guard let index = bundle.url(forResource: "index", withExtension: "html", subdirectory: "web"),
              var components = URLComponents(url: index, resolvingAgainstBaseURL: false)
        else { return }
        components.fragment = "saver" + lookFragment()
        if let url = components.url {
            web.loadFileURL(url, allowingReadAccessTo: index.deletingLastPathComponent())
        }

        // macOS 14+ keeps the legacyScreenSaver host alive after dismissal and
        // never calls stopAnimation; quit with it so instances do not pile up.
        if !isPreview {
            DistributedNotificationCenter.default().addObserver(
                self,
                selector: #selector(screenSaverWillStop),
                name: NSNotification.Name("com.apple.screensaver.willstop"),
                object: nil
            )
        }
    }

    required init?(coder: NSCoder) {
        super.init(coder: coder)
    }

    private func lookFragment() -> String {
        let defaults = ScreenSaverDefaults(forModuleWithName: "com.trevor050.endlesspong")
        guard let look = defaults?.string(forKey: "look")?.trimmingCharacters(in: CharacterSet(charactersIn: "#& ")),
              !look.isEmpty
        else { return "" }
        return "&" + look
    }

    @objc private func screenSaverWillStop() {
        if #available(macOS 14.0, *) {
            exit(0)
        }
    }

    override var hasConfigureSheet: Bool { false }
    override var configureSheet: NSWindow? { nil }
}
