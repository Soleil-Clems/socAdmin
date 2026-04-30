#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"
VERSION="${1:-1.0.0}"

echo "==> Building socAdmin Manager for Windows (amd64 + arm64)..."
cd "$ROOT_DIR/manager"

echo "  -> Building amd64 + generating NSIS templates..."
wails build -clean -platform windows/amd64 -nsis

echo "  -> Building arm64..."
wails build -platform windows/arm64 -o soca-manager-arm64.exe -skipbindings

echo "  -> Creating dual-arch NSIS installer..."
makensis \
  -DARG_WAILS_AMD64_BINARY=build/bin/soca-manager.exe \
  -DARG_WAILS_ARM64_BINARY=build/bin/soca-manager-arm64.exe \
  build/windows/installer/project.nsi

OUTPUT_DIR="$ROOT_DIR/build/windows/dist"
mkdir -p "$OUTPUT_DIR"

INSTALLER=$(find "$ROOT_DIR/manager/build/bin" -name "*installer.exe" -type f 2>/dev/null | head -1)
if [ -z "$INSTALLER" ]; then
    echo "ERROR: NSIS installer not found. Is NSIS installed?"
    echo "  macOS:  brew install makensis"
    echo "  Linux:  sudo apt install nsis"
    exit 1
fi

cp "$INSTALLER" "$OUTPUT_DIR/socAdmin-Manager-${VERSION}-windows-setup.exe"

echo ""
echo "Done: $OUTPUT_DIR/socAdmin-Manager-${VERSION}-windows-setup.exe"
echo "Size: $(du -h "$OUTPUT_DIR/socAdmin-Manager-${VERSION}-windows-setup.exe" | cut -f1)"
echo "Supports: amd64 + arm64 (auto-detected at install)"
