#!/usr/bin/env bash
# Export all glTF-Sample-Assets models to USDA and USDZ using native assimp_cmd.
# Auto-discovers models from model-index.json. Each model gets its own subdirectory.
#
# Usage:
#   bash test/export_usd_native.sh                    # Export all models
#   bash test/export_usd_native.sh --filter "Box*"    # Export matching models only

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

export ASSIMP_CMD="$PROJECT_ROOT/assimp/build/bin/assimpd"
export SAMPLE_ASSETS="$PROJECT_ROOT/repos/glTF-Sample-Assets/Models"
export MODEL_INDEX="$SAMPLE_ASSETS/model-index.json"
export OUT_DIR="$PROJECT_ROOT/output/usd"
export FILTER=""

while [[ $# -gt 0 ]]; do
    case $1 in
        --filter) export FILTER="$2"; shift 2 ;;
        *) echo "Unknown arg: $1"; exit 1 ;;
    esac
done

if [ ! -f "$ASSIMP_CMD" ]; then
    echo "ERROR: assimp_cmd not found at $ASSIMP_CMD"
    exit 1
fi

if [ ! -f "$MODEL_INDEX" ]; then
    echo "ERROR: model-index.json not found at $MODEL_INDEX"
    exit 1
fi

if [ -z "$FILTER" ]; then
    rm -rf "$OUT_DIR"
fi
mkdir -p "$OUT_DIR"

python3 << 'PYEOF'
import json, subprocess, os, sys, fnmatch

assimp_cmd = os.environ["ASSIMP_CMD"]
sample_assets = os.environ["SAMPLE_ASSETS"]
model_index_path = os.environ["MODEL_INDEX"]
out_dir = os.environ["OUT_DIR"]
name_filter = os.environ.get("FILTER", "")

with open(model_index_path) as f:
    models = json.load(f)

total = 0
passed = 0
failed = 0
skipped = 0
results = []

for m in models:
    name = m["name"]
    variants = m.get("variants", {})
    tags = m.get("tags", [])

    if name_filter and not fnmatch.fnmatch(name, name_filter):
        continue

    src = None
    if "glTF-Binary" in variants:
        candidate = os.path.join(sample_assets, name, "glTF-Binary", variants["glTF-Binary"])
        if os.path.isfile(candidate):
            src = candidate
    if src is None and "glTF" in variants:
        candidate = os.path.join(sample_assets, name, "glTF", variants["glTF"])
        if os.path.isfile(candidate):
            src = candidate

    if src is None:
        skipped += 1
        print(f"  SKIP  {name} (no importable file)")
        results.append({"name": name, "status": "skip", "reason": "no importable file", "tags": tags})
        continue

    model_dir = os.path.join(out_dir, name)
    os.makedirs(model_dir, exist_ok=True)

    for fmt in ["usda", "usdz"]:
        total += 1
        out_path = os.path.join(model_dir, f"{name}.{fmt}")

        try:
            result = subprocess.run(
                [assimp_cmd, "export", src, out_path, f"-f{fmt}"],
                capture_output=True, text=True, timeout=60
            )
            if result.returncode == 0 and os.path.isfile(out_path):
                size = os.path.getsize(out_path)
                sizeK = size // 1024
                print(f"  OK    {name}.{fmt} ({sizeK}K)")
                passed += 1
                results.append({"name": name, "format": fmt, "status": "pass", "size": size, "tags": tags})
            else:
                print(f"  FAIL  {name}.{fmt}")
                failed += 1
                err_msg = (result.stderr or result.stdout or "")[:200]
                results.append({"name": name, "format": fmt, "status": "fail", "error": err_msg, "tags": tags})
        except subprocess.TimeoutExpired:
            print(f"  TOUT  {name}.{fmt}")
            failed += 1
            results.append({"name": name, "format": fmt, "status": "timeout", "tags": tags})
        except Exception as e:
            print(f"  ERR   {name}.{fmt}: {e}")
            failed += 1
            results.append({"name": name, "format": fmt, "status": "error", "error": str(e), "tags": tags})

print()
print("=" * 60)
print(f"Results: {passed} passed, {failed} failed, {skipped} skipped (of {total} exports)")

results_path = os.path.join(out_dir, "export-results.json")
if name_filter and os.path.isfile(results_path):
    with open(results_path) as f:
        existing = json.load(f)
    updated_names = {(r["name"], r.get("format", "")) for r in results}
    merged = [r for r in existing if (r["name"], r.get("format", "")) not in updated_names]
    merged.extend(results)
    results = merged
with open(results_path, "w") as f:
    json.dump(results, f, indent=2)
print(f"Results JSON: {results_path}")
PYEOF
