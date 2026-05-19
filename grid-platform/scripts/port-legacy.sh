#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
LEGACY="/Users/develop/wfh/starui"

rewrite() {
  local dir="$1"
  find "$dir" -type f \( -name '*.ts' -o -name '*.tsx' \) -print0 | while IFS= read -r -d '' f; do
    sed -i '' \
      -e 's/@starui\/config-service/@stargrid\/host-config/g' \
      -e 's/@starui\/shared-types/@stargrid\/types/g' \
      -e 's/@starui\/core/@stargrid\/engine/g' \
      -e 's/@starui\/markets-grid/@stargrid\/grid/g' \
      -e 's/@starui\/grid-react/@stargrid\/grid\/customizer/g' \
      -e 's/@starui\/data-services-react/@stargrid\/host-data-react/g' \
      -e 's/@starui\/data-services/@stargrid\/host-data/g' \
      -e 's/@starui\/runtime-port/@stargrid\/host/g' \
      -e 's/@starui\/runtime-browser/@stargrid\/host-browser/g' \
      -e 's/@starui\/runtime-openfin/@stargrid\/host-openfin/g' \
      -e 's/@starui\/design-system/@stargrid\/design-system/g' \
      -e 's/@starui\/ui/@stargrid\/ui/g' \
      -e 's/@starui\/openfin-platform/@stargrid\/openfin-platform/g' \
      -e 's/@starui\/widgets-react/@stargrid\/widgets/g' \
      -e 's/@starui\/icons-svg\/react/@stargrid\/config-browser\/icons/g' \
      -e 's/@starui\/icons-svg/@stargrid\/config-browser\/icons/g' \
      "$f"
  done
}

# openfin-platform
rm -rf "$ROOT/packages/openfin-platform"
cp -R "$LEGACY/packages/shared/platform/openfin-platform" "$ROOT/packages/openfin-platform"
rewrite "$ROOT/packages/openfin-platform/src"

# host-data-react
rm -rf "$ROOT/packages/host-data-react"
mkdir -p "$ROOT/packages/host-data-react/src/runtime"
cp "$LEGACY/packages/react/providers/data-services-react/src/runtime/index.tsx" "$ROOT/packages/host-data-react/src/runtime/index.tsx"
cp "$LEGACY/packages/react/providers/data-services-react/src/index.ts" "$ROOT/packages/host-data-react/src/index.ts" 2>/dev/null || echo "export * from './runtime/index.js';" > "$ROOT/packages/host-data-react/src/index.ts"
rewrite "$ROOT/packages/host-data-react/src"

# widgets: hosted + markets-grid-container
rm -rf "$ROOT/packages/widgets"
mkdir -p "$ROOT/packages/widgets/src"
cp -R "$LEGACY/packages/react/widgets/widgets-react/src/hosted" "$ROOT/packages/widgets/src/hosted"
cp -R "$LEGACY/packages/react/widgets/widgets-react/src/v2/markets-grid-container" "$ROOT/packages/widgets/src/markets-grid-container"
rewrite "$ROOT/packages/widgets/src"

# config-browser
rm -rf "$ROOT/packages/config-browser"
cp -R "$LEGACY/packages/react/tools/config-browser-react" "$ROOT/packages/config-browser"
rewrite "$ROOT/packages/config-browser/src"

echo "Port complete"
