#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"
APP_NAME="Soca Manager"
VERSION="${1:-1.0.0}"

echo "==> Building socAdmin server binary..."
cd "$ROOT_DIR"
cd frontend && npm ci && npm run build && cd ..
CGO_ENABLED=1 go build -ldflags="-s -w" -o bin/socadmin .

echo "==> Building Soca Manager for Linux..."
cd "$ROOT_DIR/manager"
wails build -clean

BINARY="$ROOT_DIR/manager/build/bin/soca-manager"
if [ ! -f "$BINARY" ]; then
    echo "ERROR: ${BINARY} not found. Wails build failed?"
    exit 1
fi

OUTPUT_DIR="$ROOT_DIR/build/linux/dist"
mkdir -p "$OUTPUT_DIR"

APPDIR="$OUTPUT_DIR/Soca-Manager.AppDir"
rm -rf "$APPDIR"
mkdir -p "$APPDIR/usr/bin"
mkdir -p "$APPDIR/usr/share/icons/hicolor/256x256/apps"

cp "$BINARY" "$APPDIR/usr/bin/soca-manager"
cp "$ROOT_DIR/bin/socadmin" "$APPDIR/usr/bin/socadmin"
chmod +x "$APPDIR/usr/bin/soca-manager"
chmod +x "$APPDIR/usr/bin/socadmin"

if [ -f "$ROOT_DIR/manager/build/appicon.png" ]; then
    cp "$ROOT_DIR/manager/build/appicon.png" "$APPDIR/soca-manager.png"
    cp "$ROOT_DIR/manager/build/appicon.png" "$APPDIR/usr/share/icons/hicolor/256x256/apps/soca-manager.png"
fi

cat > "$APPDIR/soca-manager.desktop" <<DESKTOP
[Desktop Entry]
Type=Application
Name=${APP_NAME}
Exec=soca-manager
Icon=soca-manager
Categories=Development;Database;
Comment=Database administration made simple
DESKTOP

cat > "$APPDIR/AppRun" <<'APPRUN'
#!/bin/bash
HERE="$(dirname "$(readlink -f "$0")")"
exec "$HERE/usr/bin/soca-manager" "$@"
APPRUN
chmod +x "$APPDIR/AppRun"

APPIMAGETOOL="$OUTPUT_DIR/appimagetool"
if [ ! -f "$APPIMAGETOOL" ]; then
    echo "==> Downloading appimagetool..."
    ARCH=$(uname -m)
    curl -sL "https://github.com/AppImage/appimagetool/releases/download/continuous/appimagetool-${ARCH}.AppImage" -o "$APPIMAGETOOL"
    chmod +x "$APPIMAGETOOL"
fi

APPIMAGE_PATH="$OUTPUT_DIR/Soca-Manager-${VERSION}-linux.AppImage"
ARCH=$(uname -m) "$APPIMAGETOOL" "$APPDIR" "$APPIMAGE_PATH"

rm -rf "$APPDIR"

echo ""
echo "Done: $APPIMAGE_PATH"
echo "Size: $(du -h "$APPIMAGE_PATH" | cut -f1)"
