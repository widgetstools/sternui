#!/usr/bin/env bash
# Re-render every .mmd source to SVG (dark + light) and PNG (high-res dark).
# Usage:   ./docs/diagrams/render.sh
# Run from the repo root.

set -euo pipefail

cd "$(dirname "$0")/../.."

DIAGRAMS=(
  "01-component-hierarchy:1400:0"
  "02-data-flow:2400:2400"
  "03-persistence-model:2400:1600"
)

for entry in "${DIAGRAMS[@]}"; do
  IFS=":" read -r name w h <<< "$entry"
  src="docs/diagrams/${name}.mmd"
  echo "==> $name"

  # Dark SVG
  npx -y -p @mermaid-js/mermaid-cli mmdc \
    -i "$src" \
    -o "docs/diagrams/${name}.svg" \
    -c docs/diagrams/.mermaid-config.json \
    -b "#0d1117" \
    --width "$w" >/dev/null

  # Light SVG
  npx -y -p @mermaid-js/mermaid-cli mmdc \
    -i "$src" \
    -o "docs/diagrams/${name}-light.svg" \
    -c docs/diagrams/.mermaid-config-light.json \
    -b "#ffffff" \
    --width "$w" >/dev/null

  # High-res dark PNG (for slide decks etc.)
  if [[ "$h" -gt 0 ]]; then
    npx -y -p @mermaid-js/mermaid-cli mmdc \
      -i "$src" \
      -o "docs/diagrams/${name}.png" \
      -c docs/diagrams/.mermaid-config.json \
      -b "#0d1117" \
      --width "$w" \
      --height "$h" \
      --scale 2 >/dev/null
  else
    npx -y -p @mermaid-js/mermaid-cli mmdc \
      -i "$src" \
      -o "docs/diagrams/${name}.png" \
      -c docs/diagrams/.mermaid-config.json \
      -b "#0d1117" \
      --width "$w" \
      --scale 2 >/dev/null
  fi
done

echo "Done. Outputs in docs/diagrams/"
