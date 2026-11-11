#!/usr/bin/env bash
# Builds macos/build/EndlessPong.saver with the Xcode Command Line Tools
# (xcode-select --install). No Xcode project, no developer account.
#   ./macos/build.sh            build
#   ./macos/build.sh --install  build and copy to ~/Library/Screen Savers
set -euo pipefail
cd "$(dirname "$0")"
ROOT=..
OUT=build/EndlessPong.saver
rm -rf build
mkdir -p "$OUT/Contents/MacOS" "$OUT/Contents/Resources/web"

for arch in arm64 x86_64; do
  swiftc -O -parse-as-library -module-name EndlessPong \
    -target "$arch-apple-macos13.0" \
    -emit-library -Xlinker -bundle \
    -framework ScreenSaver -framework WebKit \
    EndlessPongView.swift -o "build/EndlessPong-$arch"
done
lipo -create build/EndlessPong-arm64 build/EndlessPong-x86_64 -output "$OUT/Contents/MacOS/EndlessPong"
rm build/EndlessPong-arm64 build/EndlessPong-x86_64
cp Info.plist "$OUT/Contents/Info.plist"
cp "$ROOT/LICENSE" "$OUT/Contents/Resources/LICENSE"

# The web app, minus the PWA-only files.
cp "$ROOT/index.html" "$ROOT/styles.css" "$ROOT/favicon.svg" "$OUT/Contents/Resources/web/"
cp -R "$ROOT/js" "$ROOT/fonts" "$OUT/Contents/Resources/web/"

codesign --force --deep --sign - "$OUT"
echo "built macos/$OUT"

if [[ "${1:-}" == "--install" ]]; then
  mkdir -p "$HOME/Library/Screen Savers"
  rm -rf "$HOME/Library/Screen Savers/EndlessPong.saver"
  cp -R "$OUT" "$HOME/Library/Screen Savers/"
  echo "installed to ~/Library/Screen Savers. Pick it in System Settings > Screen Saver."
fi
