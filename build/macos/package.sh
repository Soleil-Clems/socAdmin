#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"
APP_NAME="socAdmin Manager"
VERSION="${1:-1.0.0}"

echo "==> Building socAdmin server binary..."
cd "$ROOT_DIR"
cd frontend && npm ci && npm run build && cd ..
CGO_ENABLED=1 go build -ldflags="-s -w" -o bin/socadmin .

echo "==> Building socAdmin Manager for macOS..."
cd "$ROOT_DIR/manager"
wails build -clean

APP_PATH="$ROOT_DIR/manager/build/bin/${APP_NAME}.app"
if [ ! -d "$APP_PATH" ]; then
    echo "ERROR: ${APP_PATH} not found. Wails build failed?"
    exit 1
fi

echo "==> Embedding socAdmin server binary into .app bundle..."
RESOURCES_DIR="$APP_PATH/Contents/Resources"
mkdir -p "$RESOURCES_DIR"
cp "$ROOT_DIR/bin/socadmin" "$RESOURCES_DIR/socadmin"
chmod +x "$RESOURCES_DIR/socadmin"

OUTPUT_DIR="$ROOT_DIR/build/macos/dist"
mkdir -p "$OUTPUT_DIR"
DMG_PATH="$OUTPUT_DIR/socAdmin-Manager-${VERSION}-macos.dmg"

echo "==> Creating DMG..."
rm -f "$DMG_PATH"

TEMP_DMG="$OUTPUT_DIR/temp.dmg"
MOUNT_DIR="/tmp/socadmin-dmg-mount"

hdiutil create -size 100m -fs HFS+ -volname "$APP_NAME" "$TEMP_DMG" -ov
hdiutil attach "$TEMP_DMG" -mountpoint "$MOUNT_DIR"

cp -R "$APP_PATH" "$MOUNT_DIR/"
ln -s /Applications "$MOUNT_DIR/Applications"

hdiutil detach "$MOUNT_DIR"
hdiutil convert "$TEMP_DMG" -format UDZO -o "$DMG_PATH"
rm -f "$TEMP_DMG"

echo ""
echo "Done: $DMG_PATH"
echo "Size: $(du -h "$DMG_PATH" | cut -f1)"
