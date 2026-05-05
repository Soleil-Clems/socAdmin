#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"
APP_NAME="Soca Manager"
PKG_NAME="soca-manager"
VERSION="${1:-1.0.0}"

echo "==> Building socAdmin server binary..."
cd "$ROOT_DIR"
cd frontend && npm ci && npm run build && cd ..
CGO_ENABLED=1 go build -ldflags="-s -w" -o bin/socadmin .

echo "==> Building Soca Manager for Linux..."
cd "$ROOT_DIR/manager"
wails build -clean

BINARY="$ROOT_DIR/manager/build/bin/${PKG_NAME}"
if [ ! -f "$BINARY" ]; then
    echo "ERROR: ${BINARY} not found. Wails build failed?"
    exit 1
fi

OUTPUT_DIR="$ROOT_DIR/build/linux/dist"
mkdir -p "$OUTPUT_DIR"

ICON_SRC="$ROOT_DIR/manager/build/appicon.png"
ARCH=$(dpkg --print-architecture 2>/dev/null || echo "amd64")

# --- .deb package (Debian / Ubuntu / Mint) ---

echo "==> Building .deb package..."

DEBDIR="$OUTPUT_DIR/deb-build"
rm -rf "$DEBDIR"
mkdir -p "$DEBDIR/DEBIAN"
mkdir -p "$DEBDIR/usr/bin"
mkdir -p "$DEBDIR/usr/share/applications"
mkdir -p "$DEBDIR/usr/share/icons/hicolor/256x256/apps"

cp "$BINARY" "$DEBDIR/usr/bin/${PKG_NAME}"
cp "$ROOT_DIR/bin/socadmin" "$DEBDIR/usr/bin/socadmin"
chmod 755 "$DEBDIR/usr/bin/${PKG_NAME}"
chmod 755 "$DEBDIR/usr/bin/socadmin"

if [ -f "$ICON_SRC" ]; then
    cp "$ICON_SRC" "$DEBDIR/usr/share/icons/hicolor/256x256/apps/${PKG_NAME}.png"
fi

cat > "$DEBDIR/usr/share/applications/${PKG_NAME}.desktop" <<DESKTOP
[Desktop Entry]
Type=Application
Name=${APP_NAME}
Exec=${PKG_NAME}
Icon=${PKG_NAME}
Categories=Development;Database;
Comment=Database administration made simple
Terminal=false
DESKTOP

INSTALLED_SIZE=$(du -sk "$DEBDIR/usr" | cut -f1)

cat > "$DEBDIR/DEBIAN/control" <<CONTROL
Package: ${PKG_NAME}
Version: ${VERSION}
Section: database
Priority: optional
Architecture: ${ARCH}
Installed-Size: ${INSTALLED_SIZE}
Depends: libgtk-3-0, libwebkit2gtk-4.0-37
Maintainer: Soleil-Clems <marketing@librasoft.fr>
Description: ${APP_NAME} — Database administration made simple
 A modern, self-hosted, multi-database administration tool.
 Supports MySQL, PostgreSQL, and MongoDB.
Homepage: https://github.com/Soleil-Clems/socAdmin
CONTROL

DEB_PATH="$OUTPUT_DIR/${PKG_NAME}_${VERSION}_${ARCH}.deb"
dpkg-deb --build --root-owner-group "$DEBDIR" "$DEB_PATH"
rm -rf "$DEBDIR"

echo "Done: $DEB_PATH ($(du -h "$DEB_PATH" | cut -f1))"

# --- .pkg.tar.zst package (Arch / Manjaro) ---

echo "==> Building Arch package..."

ARCHDIR="$OUTPUT_DIR/arch-build"
rm -rf "$ARCHDIR"
mkdir -p "$ARCHDIR/usr/bin"
mkdir -p "$ARCHDIR/usr/share/applications"
mkdir -p "$ARCHDIR/usr/share/icons/hicolor/256x256/apps"

cp "$BINARY" "$ARCHDIR/usr/bin/${PKG_NAME}"
cp "$ROOT_DIR/bin/socadmin" "$ARCHDIR/usr/bin/socadmin"
chmod 755 "$ARCHDIR/usr/bin/${PKG_NAME}"
chmod 755 "$ARCHDIR/usr/bin/socadmin"

if [ -f "$ICON_SRC" ]; then
    cp "$ICON_SRC" "$ARCHDIR/usr/share/icons/hicolor/256x256/apps/${PKG_NAME}.png"
fi

cat > "$ARCHDIR/usr/share/applications/${PKG_NAME}.desktop" <<DESKTOP
[Desktop Entry]
Type=Application
Name=${APP_NAME}
Exec=${PKG_NAME}
Icon=${PKG_NAME}
Categories=Development;Database;
Comment=Database administration made simple
Terminal=false
DESKTOP

ARCH_ARCH="x86_64"
PKG_SIZE=$(du -sb "$ARCHDIR/usr" | cut -f1)
BUILD_DATE=$(date +%s)

cat > "$ARCHDIR/.PKGINFO" <<PKGINFO
pkgname = ${PKG_NAME}
pkgbase = ${PKG_NAME}
pkgver = ${VERSION}-1
pkgdesc = Database administration made simple
url = https://github.com/Soleil-Clems/socAdmin
builddate = ${BUILD_DATE}
packager = GitHub Actions <ci@github.com>
size = ${PKG_SIZE}
arch = ${ARCH_ARCH}
depends = gtk3
depends = webkit2gtk
PKGINFO

ARCH_PKG_PATH="$OUTPUT_DIR/${PKG_NAME}-${VERSION}-1-${ARCH_ARCH}.pkg.tar.zst"
cd "$ARCHDIR"
fakeroot -- tar --zstd -cf "$ARCH_PKG_PATH" .PKGINFO usr/
cd "$ROOT_DIR"
rm -rf "$ARCHDIR"

echo "Done: $ARCH_PKG_PATH ($(du -h "$ARCH_PKG_PATH" | cut -f1))"

echo ""
echo "==> All Linux packages built successfully!"
