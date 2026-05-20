#!/usr/bin/env bash
# Bulk-rewrite legacy @starui/* import paths to the refactored @starui/* layout.
set -euo pipefail

rewrite() {
  find "$1" -type f \( -name '*.ts' -o -name '*.tsx' \) -print0 \
    | xargs -0 sed -i '' \
      -e 's/@starui\/config-service/@starui\/host-config/g' \
      -e 's/@starui\/shared-types/@starui\/types/g' \
      -e 's/@starui\/core/@starui\/engine/g' \
      -e 's/@starui\/markets-grid/@starui\/grid/g' \
      -e 's/@starui\/grid-react/@starui\/grid\/customizer/g' \
      -e 's/@starui\/data-services-react/@starui\/host-data-react/g' \
      -e 's/@starui\/data-services/@starui\/host-data/g' \
      -e 's/@starui\/runtime-port/@starui\/host/g' \
      -e 's/@starui\/runtime-browser/@starui\/host-browser/g' \
      -e 's/@starui\/runtime-openfin/@starui\/host-openfin/g' \
      -e 's/@starui\/widgets-react/@starui\/widgets/g' \
      -e 's/@starui\/icons-svg\/react/@starui\/config-browser\/icons/g' \
      -e 's/@starui\/icons-svg/@starui\/config-browser\/icons/g'
}

rewrite "${1:?usage: port-legacy.sh <dir>}"
