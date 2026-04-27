#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"
VERSION="${1:-1.0.0}"

echo "==> Building socAdmin Manager for Windows (NSIS installer)..."
cd "$ROOT_DIR/manager"
wails build -clean -nsis

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
