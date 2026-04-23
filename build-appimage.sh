#!/usr/bin/env bash
# build-appimage.sh — Build the Enrichment Analysis AppImage on Linux (SCC).
# Run this script on the Linux machine / cluster login node.
# Prerequisites: python3, pip3, node >= 20, npm
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APP_DIR="$SCRIPT_DIR/my-app"
BACKEND_DIR="$APP_DIR/backend"
RESOURCES_DIR="$APP_DIR/resources"
OUT_APPIMAGE="$SCRIPT_DIR/EnrichmentAnalysis-x86_64.AppImage"

echo "===== Step 1: Install Python backend dependencies ====="
cd "$BACKEND_DIR"
pip3 install --quiet --user -r requirements.txt
pip3 install --quiet --user pyinstaller

echo "===== Step 2: Build backend binary with PyInstaller ====="
python3 -m PyInstaller --clean backend.spec

echo "===== Step 3: Stage backend binary in app resources ====="
mkdir -p "$RESOURCES_DIR"
cp "$BACKEND_DIR/dist/backend" "$RESOURCES_DIR/backend"
chmod +x "$RESOURCES_DIR/backend"

echo "===== Step 4: Install Node dependencies ====="
cd "$APP_DIR"
npm install

echo "===== Step 5: Package Electron app for Linux x64 ====="
npm run package -- --platform linux --arch x64

echo "===== Step 6: Assemble AppDir ====="
PACKAGED_DIR="$APP_DIR/out/my-app-linux-x64"
APPDIR="/tmp/EnrichmentAnalysis.AppDir"

rm -rf "$APPDIR"
mkdir -p "$APPDIR/usr/lib/enrichment-analysis"

cp -r "$PACKAGED_DIR/"* "$APPDIR/usr/lib/enrichment-analysis/"

# AppRun entry point
cat > "$APPDIR/AppRun" << 'APPRUN'
#!/bin/bash
HERE="$(dirname "$(readlink -f "$0")")"
# Electron needs this for sandboxing on older kernels (common on HPC)
export ELECTRON_DISABLE_SANDBOX=1
exec "$HERE/usr/lib/enrichment-analysis/my-app" "$@"
APPRUN
chmod +x "$APPDIR/AppRun"

# Desktop entry (required by AppImage spec)
cat > "$APPDIR/enrichment-analysis.desktop" << 'DESKTOP'
[Desktop Entry]
Name=Enrichment Analysis
Exec=enrichment-analysis
Icon=enrichment-analysis
Type=Application
Categories=Science;Education;
DESKTOP

# Icon — copy if one exists, otherwise write a minimal placeholder PNG
ICON_SRC="$APP_DIR/src/icons/icon.png"
if [ -f "$ICON_SRC" ]; then
    cp "$ICON_SRC" "$APPDIR/enrichment-analysis.png"
else
    # 1×1 transparent PNG so appimagetool doesn't complain
    printf '\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01\x00\x00\x00\x01\x08\x06\x00\x00\x00\x1f\x15\xc4\x89\x00\x00\x00\nIDATx\x9cc\x00\x01\x00\x00\x05\x00\x01\r\n-\xb4\x00\x00\x00\x00IEND\xaeB`\x82' \
        > "$APPDIR/enrichment-analysis.png"
fi

echo "===== Step 7: Download appimagetool if needed ====="
APPIMAGETOOL_PATH="/tmp/appimagetool-x86_64.AppImage"
if command -v appimagetool &>/dev/null; then
    APPIMAGETOOL="appimagetool"
elif [ -f "$APPIMAGETOOL_PATH" ]; then
    APPIMAGETOOL="$APPIMAGETOOL_PATH"
else
    echo "Downloading appimagetool..."
    wget -q \
        "https://github.com/AppImage/AppImageKit/releases/download/continuous/appimagetool-x86_64.AppImage" \
        -O "$APPIMAGETOOL_PATH"
    chmod +x "$APPIMAGETOOL_PATH"
    APPIMAGETOOL="$APPIMAGETOOL_PATH"
fi

echo "===== Step 8: Create AppImage ====="
ARCH=x86_64 "$APPIMAGETOOL" "$APPDIR" "$OUT_APPIMAGE"

echo ""
echo "=========================================="
echo "  Done!  AppImage: $OUT_APPIMAGE"
echo "  Usage on SCC:"
echo "    chmod +x EnrichmentAnalysis-x86_64.AppImage"
echo "    ./EnrichmentAnalysis-x86_64.AppImage"
echo ""
echo "  If FUSE is unavailable on the cluster:"
echo "    ./EnrichmentAnalysis-x86_64.AppImage --appimage-extract"
echo "    ./squashfs-root/AppRun"
echo "=========================================="
