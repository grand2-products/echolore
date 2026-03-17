#!/usr/bin/env bash
# Generate motion clips from prompts.yaml using HY-Motion 1.0
#
# Prerequisites:
#   1. HY-Motion CLI: https://github.com/zysilm-ai/hy-motion-fbx-exporter
#   2. fbx2vrma-converter: https://github.com/tk256ailab/fbx2vrma-converter
#   3. yq: https://github.com/mikefarah/yq
#
# License: HY-Motion 1.0 outputs are subject to the Tencent Hunyuan Community License.
# Users must evaluate license compliance for their use case before running this script.
#
# Usage:
#   ./scripts/generate-motions.sh

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
PROMPTS_FILE="$ROOT_DIR/motions/MOTION_GENERATION.md"
FBX_DIR="$ROOT_DIR/motions/generated-fbx"
VRMA_DIR="$ROOT_DIR/apps/web/public/motions"
MANIFEST_FILE="$VRMA_DIR/manifest.json"

if ! command -v yq &>/dev/null; then
  echo "Error: yq is required. Install: https://github.com/mikefarah/yq"
  exit 1
fi

mkdir -p "$FBX_DIR" "$VRMA_DIR"

echo "=== Generating FBX files from prompts ==="
count=$(yq 'length' "$PROMPTS_FILE")
for i in $(seq 0 $((count - 1))); do
  id=$(yq ".[$i].id" "$PROMPTS_FILE")
  prompt=$(yq ".[$i].prompt" "$PROMPTS_FILE")
  duration=$(yq ".[$i].duration" "$PROMPTS_FILE")

  fbx_path="$FBX_DIR/${id}.fbx"
  if [ -f "$fbx_path" ]; then
    echo "  [skip] $id (already exists)"
    continue
  fi

  echo "  [gen]  $id ($duration s)"
  # Uncomment when hy-motion-fbx-exporter is installed:
  # hy-motion-fbx-exporter --prompt "$prompt" --duration "$duration" --output "$fbx_path"
  echo "  NOTE: hy-motion-fbx-exporter not installed, skipping actual generation"
done

echo ""
echo "=== Converting FBX to VRMA ==="
if [ -d "$FBX_DIR" ] && ls "$FBX_DIR"/*.fbx &>/dev/null 2>&1; then
  # Uncomment when fbx2vrma-converter is installed:
  # node /path/to/fbx2vrma-converter.js -i "$FBX_DIR/" -o "$VRMA_DIR/"
  echo "  NOTE: fbx2vrma-converter not installed, skipping conversion"
else
  echo "  No FBX files found to convert"
fi

echo ""
echo "=== Building manifest.json ==="
node -e "
const yaml = require('fs').readFileSync('$PROMPTS_FILE', 'utf8');
// Simple YAML array parser for our flat structure
const clips = [];
let current = null;
for (const line of yaml.split('\n')) {
  if (line.startsWith('- id:')) {
    if (current) clips.push(current);
    current = { id: line.replace('- id:', '').trim() };
  } else if (current && line.match(/^\s+\w+:/)) {
    const [key, ...rest] = line.trim().split(':');
    let val = rest.join(':').trim();
    if (val.startsWith('[')) val = JSON.parse(val.replace(/(\w[\w-]*)/g, '\"$1\"'));
    else if (val === 'true') val = true;
    else if (val === 'false') val = false;
    else if (!isNaN(Number(val))) val = Number(val);
    if (key) current[key] = val;
  }
}
if (current) clips.push(current);

const manifest = {
  clips: clips.map(c => ({
    id: c.id,
    file: c.id + '.vrma',
    category: c.category || '',
    description: c.prompt || '',
    tags: c.tags || [],
    duration: c.duration || 0,
    loop: c.loop || false,
  }))
};
require('fs').writeFileSync('$MANIFEST_FILE', JSON.stringify(manifest, null, 2));
console.log('  Written ' + manifest.clips.length + ' clips to manifest.json');
" 2>/dev/null || echo "  NOTE: manifest generation requires Node.js"

echo ""
echo "Done. Generated files in $VRMA_DIR"
