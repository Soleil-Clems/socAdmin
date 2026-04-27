#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"
APP_NAME="socAdmin Manager"
VERSION="${1:-1.0.0}"

echo "==> Building socAdmin Manager for Linux..."
cd "$ROOT_DIR/manager"
wails build -clean

BINARY="$ROOT_DIR/manager/build/bin/socadmin-manager"
if [ ! -f "$BINARY" ]; then
    echo "ERROR: ${BINARY} not found. Wails build failed?"
    exit 1
fi

OUTPUT_DIR="$ROOT_DIR/build/linux/dist"
mkdir -p "$OUTPUT_DIR"

APPDIR="$OUTPUT_DIR/socAdmin-Manager.AppDir"
rm -rf "$APPDIR"
mkdir -p "$APPDIR/usr/bin"
mkdir -p "$APPDIR/usr/share/icons/hicolor/256x256/apps"

cp "$BINARY" "$APPDIR/usr/bin/socadmin-manager"
chmod +x "$APPDIR/usr/bin/socadmin-manager"

if [ -f "$ROOT_DIR/manager/build/appicon.png" ]; then
    cp "$ROOT_DIR/manager/build/appicon.png" "$APPDIR/socadmin-manager.png"
    cp "$ROOT_DIR/manager/build/appicon.png" "$APPDIR/usr/share/icons/hicolor/256x256/apps/socadmin-manager.png"
fi

cat > "$APPDIR/socadmin-manager.desktop" <<DESKTOP
[Desktop Entry]
Type=Application
Name=${APP_NAME}
Exec=socadmin-manager
Icon=socadmin-manager
Categories=Development;Database;
Comment=Database administration made simple
DESKTOP

cat > "$APPDIR/AppRun" <<'APPRUN'
#!/bin/bash
HERE="$(dirname "$(readlink -f "$0")")"
exec "$HERE/usr/bin/socadmin-manager" "$@"
APPRUN
chmod +x "$APPDIR/AppRun"

APPIMAGETOOL="$OUTPUT_DIR/appimagetool"
if [ ! -f "$APPIMAGETOOL" ]; then
    echo "==> Downloading appimagetool..."
    ARCH=$(uname -m)
    curl -sL "https://github.com/AppImage/appimagetool/releases/download/continuous/appimagetool-${ARCH}.AppImage" -o "$APPIMAGETOOL"
    chmod +x "$APPIMAGETOOL"
fi

APPIMAGE_PATH="$OUTPUT_DIR/socAdmin-Manager-${VERSION}-linux.AppImage"
ARCH=$(uname -m) "$APPIMAGETOOL" "$APPDIR" "$APPIMAGE_PATH"

rm -rf "$APPDIR"

echo ""
echo "Done: $APPIMAGE_PATH"
echo "Size: $(du -h "$APPIMAGE_PATH" | cut -f1)"
