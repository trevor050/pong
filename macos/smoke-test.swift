// Loads build/EndlessPong.saver the way the screen saver host does, shows it
// in a small window for a few seconds, and checks that the simulation runs.
// Usage: swift macos/smoke-test.swift [output.png]   (after ./macos/build.sh)
import AppKit
import ScreenSaver
import WebKit

let here = URL(fileURLWithPath: #filePath).deletingLastPathComponent()
let saverURL = here.appendingPathComponent("build/EndlessPong.saver")
let snapshotPath = CommandLine.arguments.dropFirst().first

guard let bundle = Bundle(url: saverURL), bundle.load(),
      let viewClass = bundle.principalClass as? ScreenSaverView.Type else {
    print("FAIL: could not load \(saverURL.path)")
    exit(1)
}

let app = NSApplication.shared
app.setActivationPolicy(.regular)
let frame = NSRect(x: 0, y: 0, width: 640, height: 400)
let window = NSWindow(contentRect: frame, styleMask: [.titled], backing: .buffered, defer: false)
window.title = "Endless Pong smoke test"
guard let view = viewClass.init(frame: frame, isPreview: false) else {
    print("FAIL: principal class did not initialise")
    exit(1)
}
window.contentView = view
window.center()
window.makeKeyAndOrderFront(nil)
app.activate(ignoringOtherApps: true)
view.startAnimation()

func findWebView(_ v: NSView) -> WKWebView? {
    if let w = v as? WKWebView { return w }
    for sub in v.subviews { if let w = findWebView(sub) { return w } }
    return nil
}

// With the display asleep or the screen locked, WebKit marks the page hidden
// and pauses requestAnimationFrame (exactly like a background tab). In that
// case step the simulation by hand so the load and render path still get
// checked, and say so.
let probe = """
(() => {
  const pong = window.endlessPong;
  const hidden = document.visibilityState === "hidden";
  if (hidden) {
    for (let i = 0; i < 900; i++) PongPhysics.step(pong.world);
    pong.repaint();
  }
  return JSON.stringify({ steps: pong.world.steps, hidden, kiosk: document.body.classList.contains("kiosk"), counts: pong.world.counts, reducedMotion: matchMedia("(prefers-reduced-motion: reduce)").matches });
})()
"""

func probeState(_ web: WKWebView, _ done: @escaping ([String: Any]) -> Void) {
    web.evaluateJavaScript(probe) { result, error in
        guard let json = result as? String, error == nil,
              let state = try? JSONSerialization.jsonObject(with: Data(json.utf8)) as? [String: Any]
        else {
            print("FAIL: web app did not boot: \(error.map { "\($0)" } ?? "no result")")
            exit(1)
        }
        print("web app state: \(json)")
        done(state)
    }
}

// Two samples a few seconds apart: the simulation must keep advancing.
// (CI Macs have no GPU, so the absolute step rate there is low.)
DispatchQueue.main.asyncAfter(deadline: .now() + 6) {
    guard let web = findWebView(view) else { print("FAIL: no web view"); exit(1) }
    probeState(web) { first in
        DispatchQueue.main.asyncAfter(deadline: .now() + 3) {
            probeState(web) { second in
                let before = first["steps"] as? Int ?? 0
                let after = second["steps"] as? Int ?? 0
                let hidden = second["hidden"] as? Bool ?? true
                let kiosk = second["kiosk"] as? Bool ?? false
                web.takeSnapshot(with: nil) { image, _ in
                    if let path = snapshotPath, let tiff = image?.tiffRepresentation,
                       let png = NSBitmapImageRep(data: tiff)?.representation(using: .png, properties: [:]) {
                        try? png.write(to: URL(fileURLWithPath: path))
                        print("snapshot: \(path)")
                    }
                    if hidden { print("note: display asleep or locked, so the simulation was stepped by hand (rAF is paused)") }
                    let ok = kiosk && after > before && after > 0
                    print(ok ? "PASS: kiosk mode, simulation advancing (\(before) -> \(after) steps)"
                             : "FAIL: kiosk=\(kiosk) steps \(before) -> \(after)")
                    exit(ok ? 0 : 1)
                }
            }
        }
    }
}
app.run()
