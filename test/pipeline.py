#!/usr/bin/env python3
"""
Unified pipeline for USD export validation.

Orchestrates: export -> render-gltf -> render-usd -> compare -> report

Usage:
  python test/pipeline.py                                # full run, all models
  python test/pipeline.py --filter "Glass*"              # only Glass* models
  python test/pipeline.py --filter "Iridescence*,Trans*" # multiple globs
  python test/pipeline.py --step render-usd              # only USD rendering
  python test/pipeline.py --step export,render-usd       # specific steps
  python test/pipeline.py --step report                  # regenerate dashboard
"""

import argparse
import datetime
import fnmatch
import json
import os
import shutil
import subprocess
import sys

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
PROJECT_ROOT = os.path.dirname(SCRIPT_DIR)

ALL_STEPS = ["export", "render-gltf", "render-usd", "compare", "report"]

PATHS = {
    "export_results": os.path.join(PROJECT_ROOT, "output", "usd", "export-results.json"),
    "usd_render_results": os.path.join(PROJECT_ROOT, "output", "usd", "renders", "render-results.json"),
    "gltf_render_results": os.path.join(PROJECT_ROOT, "output", "gltf", "renders", "render-results.json"),
    "comparison_results": os.path.join(PROJECT_ROOT, "output", "comparison", "comparison-results.json"),
    "report_dir": os.path.join(PROJECT_ROOT, "output", "report"),
    "report_images": os.path.join(PROJECT_ROOT, "output", "report", "images"),
    "usd_renders": os.path.join(PROJECT_ROOT, "output", "usd", "renders"),
    "gltf_renders": os.path.join(PROJECT_ROOT, "output", "gltf", "renders"),
    "comparison_dir": os.path.join(PROJECT_ROOT, "output", "comparison"),
    "reference_dir": os.path.join(PROJECT_ROOT, "repos", "glTF-Sample-Assets", "Models"),
    "template": os.path.join(SCRIPT_DIR, "report-template.html"),
}


def find_python313():
    candidates = [
        shutil.which("python3.13"),
        "/opt/homebrew/bin/python3.13",
        "/opt/homebrew/opt/python@3.13/bin/python3.13",
        "/usr/local/bin/python3.13",
    ]
    for c in candidates:
        if c and os.path.isfile(c):
            return c
    return None


def run_step(cmd, label):
    print(f"\n{'='*60}")
    print(f"  {label}")
    print(f"{'='*60}\n")
    result = subprocess.run(cmd, cwd=PROJECT_ROOT)
    if result.returncode != 0:
        print(f"\nWARNING: {label} exited with code {result.returncode}")
    return result.returncode


def split_filters(filters):
    """Split comma-separated filter string into individual patterns."""
    if not filters:
        return [None]
    return [p.strip() for p in filters.split(",") if p.strip()]


def step_export(filters):
    rc = 0
    for pat in split_filters(filters):
        cmd = ["bash", os.path.join(SCRIPT_DIR, "export_usd_native.sh")]
        if pat:
            cmd += ["--filter", pat]
        rc |= run_step(cmd, f"Export USD ({pat or 'all'})")
    return rc


def step_render_gltf(filters):
    rc = 0
    for pat in split_filters(filters):
        cmd = ["node", os.path.join(SCRIPT_DIR, "render_gltf_snapshots.js")]
        if pat:
            cmd += ["--filter", pat]
        rc |= run_step(cmd, f"Render glTF ({pat or 'all'})")
    return rc


def step_render_usd(filters):
    py13 = find_python313()
    if not py13:
        print("ERROR: Python 3.13 not found (required for OpenUSD bindings)")
        return 1
    rc = 0
    for pat in split_filters(filters):
        cmd = [
            py13, os.path.join(SCRIPT_DIR, "render_usd_snapshots.py"),
            "--reference-dir", PATHS["reference_dir"],
            "--gltf-render-dir", PATHS["gltf_renders"],
            "--no-validate",
        ]
        if pat:
            cmd += ["--filter", pat]
        rc |= run_step(cmd, f"Render USD ({pat or 'all'})")
    return rc


def step_compare(filters):
    py13 = find_python313()
    interpreter = py13 or sys.executable
    rc = 0
    for pat in split_filters(filters):
        cmd = [interpreter, os.path.join(SCRIPT_DIR, "compare_renders.py")]
        if pat:
            cmd += ["--filter", pat]
        rc |= run_step(cmd, f"Compare Renders ({pat or 'all'})")
    return rc


def load_json(path):
    if os.path.isfile(path):
        with open(path) as f:
            return json.load(f)
    return []


def step_report(filters):
    print(f"\n{'='*60}")
    print(f"  Generate Report")
    print(f"{'='*60}\n")

    export_data = load_json(PATHS["export_results"])
    usd_render_data = load_json(PATHS["usd_render_results"])
    gltf_render_data = load_json(PATHS["gltf_render_results"])
    comparison_data = load_json(PATHS["comparison_results"])

    export_by_name = {}
    for r in export_data:
        name = r.get("name", "")
        fmt = r.get("format", "")
        if name not in export_by_name:
            export_by_name[name] = {}
        export_by_name[name][fmt] = r.get("status", "unknown")

    render_by_name = {}
    for r in usd_render_data:
        name = r.get("name", r.get("model", ""))
        if not name:
            continue
        if name not in render_by_name:
            render_by_name[name] = {
                "animated": False,
                "validation_errors": 0,
                "validation_messages": [],
                "usda": "unknown",
                "usdz": "unknown",
            }
        fmt = r.get("format", "")
        status = "ok" if r.get("ok", False) else r.get("status", "ok")
        render_by_name[name][fmt] = status
        if r.get("animated"):
            render_by_name[name]["animated"] = True
        val_errors = r.get("validation_errors", r.get("val_errors", 0))
        if isinstance(val_errors, list):
            render_by_name[name]["validation_messages"].extend(val_errors)
            render_by_name[name]["validation_errors"] += len(val_errors)
        elif isinstance(val_errors, int):
            render_by_name[name]["validation_errors"] = max(
                render_by_name[name]["validation_errors"], val_errors
            )

    comparison_by_name = {}
    for r in comparison_data:
        name = r.get("name", "")
        comparison_by_name[name] = {
            "flip": r.get("flip_mean", r.get("flip", None)),
            "ssim": r.get("ssim", None),
            "status": r.get("status", "unknown"),
        }

    all_names = sorted(
        set(export_by_name.keys())
        | set(render_by_name.keys())
        | set(comparison_by_name.keys())
    )

    models = []
    total_rendered = 0
    total_animated = 0

    for name in all_names:
        exp = export_by_name.get(name, {})
        ren = render_by_name.get(name, {})
        comp = comparison_by_name.get(name, {})

        images = {}
        ref_screenshot = find_reference_image(name)
        if ref_screenshot:
            images["ref"] = copy_image(ref_screenshot, f"{name}_ref", filters, name)
        gltf_img = os.path.join(PATHS["gltf_renders"], f"{name}.png")
        if not os.path.isfile(gltf_img):
            gltf_img = os.path.join(PATHS["gltf_renders"], f"{name}_gltf.png")
        if os.path.isfile(gltf_img):
            images["gltf"] = copy_image(gltf_img, f"{name}_gltf", filters, name)
        for fmt in ["usda", "usdz"]:
            usd_img = os.path.join(PATHS["usd_renders"], f"{name}_{fmt}.png")
            if os.path.isfile(usd_img):
                images[fmt] = copy_image(usd_img, f"{name}_{fmt}", filters, name)
                total_rendered += 1
        flip_img = os.path.join(PATHS["comparison_dir"], f"{name}_flip.png")
        if os.path.isfile(flip_img):
            images["flip"] = copy_image(flip_img, f"{name}_flip", filters, name)

        anim_gif = os.path.join(PATHS["usd_renders"], f"{name}_usda.gif")
        if os.path.isfile(anim_gif):
            images["gif"] = copy_image(anim_gif, f"{name}_usda", filters, name)

        if ren.get("animated"):
            total_animated += 1

        model_entry = {
            "name": name,
            "animated": ren.get("animated", False),
            "validation_errors": ren.get("validation_errors", 0),
            "flip": comp.get("flip"),
            "ssim": comp.get("ssim"),
            "images": images,
            "export": {"usda": exp.get("usda", "unknown"), "usdz": exp.get("usdz", "unknown")},
            "render": {"usda": ren.get("usda", "unknown"), "usdz": ren.get("usdz", "unknown")},
        }
        models.append(model_entry)

    data = {
        "generated": datetime.datetime.now(datetime.timezone.utc).isoformat(),
        "summary": {
            "total": len(all_names),
            "rendered": total_rendered,
            "animated": total_animated,
        },
        "models": models,
    }

    os.makedirs(PATHS["report_dir"], exist_ok=True)
    data_path = os.path.join(PATHS["report_dir"], "data.json")

    if filters:
        filter_names = set()
        for pat in filters.split(","):
            pat = pat.strip()
            for n in all_names:
                if fnmatch.fnmatch(n, pat):
                    filter_names.add(n)
        if os.path.isfile(data_path):
            with open(data_path) as f:
                existing = json.load(f)
            existing_models = {m["name"]: m for m in existing.get("models", [])}
            for m in models:
                if m["name"] in filter_names:
                    existing_models[m["name"]] = m
            data["models"] = sorted(existing_models.values(), key=lambda m: m["name"])
            data["summary"]["total"] = len(data["models"])

    with open(data_path, "w") as f:
        json.dump(data, f, indent=2)

    template_src = PATHS["template"]
    template_dst = os.path.join(PATHS["report_dir"], "report.html")
    if os.path.isfile(template_src):
        shutil.copy2(template_src, template_dst)
        print(f"Dashboard: {template_dst}")
    else:
        print(f"WARNING: Template not found at {template_src}")

    print(f"Data JSON:  {data_path}")
    print(f"Models:     {len(data['models'])}")
    print(f"Rendered:   {total_rendered}")
    print(f"Animated:   {total_animated}")
    return 0


def find_reference_image(model_name):
    ref_dir = PATHS["reference_dir"]
    screenshot_dir = os.path.join(ref_dir, model_name, "screenshot")
    if os.path.isdir(screenshot_dir):
        for f in os.listdir(screenshot_dir):
            if f.lower().endswith((".png", ".jpg", ".jpeg")):
                return os.path.join(screenshot_dir, f)
    for ext in [".png", ".jpg", ".jpeg"]:
        candidate = os.path.join(ref_dir, model_name, f"screenshot{ext}")
        if os.path.isfile(candidate):
            return candidate
    return None


def copy_image(src, dest_stem, filters, model_name):
    os.makedirs(PATHS["report_images"], exist_ok=True)
    ext = os.path.splitext(src)[1]
    dest_name = f"{dest_stem}{ext}"
    dest = os.path.join(PATHS["report_images"], dest_name)
    shutil.copy2(src, dest)
    return f"images/{dest_name}"


def main():
    parser = argparse.ArgumentParser(
        description="Unified USD export validation pipeline"
    )
    parser.add_argument(
        "--filter", default=None,
        help='Glob filter for model names (e.g. "Glass*", "Iridescence*,Trans*")',
    )
    parser.add_argument(
        "--step", default=None,
        help=f'Comma-separated steps to run (default: all). Options: {",".join(ALL_STEPS)}',
    )
    args = parser.parse_args()

    steps = ALL_STEPS
    if args.step:
        steps = [s.strip() for s in args.step.split(",")]
        for s in steps:
            if s not in ALL_STEPS:
                print(f"ERROR: Unknown step '{s}'. Valid: {', '.join(ALL_STEPS)}")
                sys.exit(1)

    filters = args.filter

    print(f"Pipeline: steps={steps}, filter={filters or '(all)'}")

    for step in steps:
        if step == "export":
            step_export(filters)
        elif step == "render-gltf":
            step_render_gltf(filters)
        elif step == "render-usd":
            step_render_usd(filters)
        elif step == "compare":
            step_compare(filters)
        elif step == "report":
            step_report(filters)

    if "report" not in steps:
        step_report(filters)

    print(f"\nPipeline complete.")


if __name__ == "__main__":
    main()
