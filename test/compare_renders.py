#!/usr/bin/env python3
"""
Compare glTF and USD renders using NVIDIA FLIP and SSIM.

FLIP (primary): Perceptual image difference metric purpose-built for rendered
image comparison. Produces a mean error score (0=identical, 1=max difference)
and a per-pixel heatmap showing where differences are.

SSIM (secondary): Traditional Structural Similarity Index kept for reference.

Both images are composited over #333333 grey before comparison to match the
HTML report display and ensure consistent background handling.

Usage:
  python test/compare_renders.py
  python test/compare_renders.py --gltf-dir output/gltf/renders --usd-dir output/usd/renders
  python test/compare_renders.py --threshold 0.15
"""

import argparse
import json
import os
import sys
import tempfile

import numpy as np
from PIL import Image
from skimage.metrics import structural_similarity as ssim_metric

try:
    import flip_evaluator as flip
    HAS_FLIP = True
except ImportError:
    HAS_FLIP = False
    print("WARNING: flip-evaluator not installed. Install with: pip install flip-evaluator")


COMPOSITE_BG = (51, 51, 51, 255)


def load_and_composite(path, target_size=None):
    """Load image, composite RGBA over #333 grey, return RGB numpy array."""
    img = Image.open(path).convert("RGBA")
    bg = Image.new("RGBA", img.size, COMPOSITE_BG)
    composited = Image.alpha_composite(bg, img)
    rgb = composited.convert("RGB")
    if target_size:
        rgb = rgb.resize(target_size, Image.LANCZOS)
    return np.array(rgb)


def ensure_same_size(img_a, img_b):
    """Resize both images to the smaller common dimensions if they differ."""
    if img_a.shape == img_b.shape:
        return img_a, img_b
    h = min(img_a.shape[0], img_b.shape[0])
    w = min(img_a.shape[1], img_b.shape[1])
    pil_a = Image.fromarray(img_a).resize((w, h), Image.LANCZOS)
    pil_b = Image.fromarray(img_b).resize((w, h), Image.LANCZOS)
    return np.array(pil_a), np.array(pil_b)


def compute_flip(img_a, img_b, heatmap_path=None):
    """Compute NVIDIA FLIP perceptual error. Returns (mean_error, error_map)."""
    if not HAS_FLIP:
        return None, None

    img_a, img_b = ensure_same_size(img_a, img_b)
    ref = img_a.astype(np.float32) / 255.0
    test = img_b.astype(np.float32) / 255.0

    error_map, mean_error, _ = flip.evaluate(
        ref, test, "LDR", inputsRGB=True, applyMagma=True, computeMeanError=True
    )

    if heatmap_path and error_map is not None:
        heatmap = (np.clip(error_map, 0, 1) * 255).astype(np.uint8)
        if heatmap.ndim == 3:
            Image.fromarray(heatmap).save(heatmap_path)
        else:
            Image.fromarray(heatmap, mode="L").save(heatmap_path)

    return float(mean_error) if mean_error is not None else None, error_map


def compute_ssim(img_a, img_b):
    """Compute SSIM between two images."""
    img_a, img_b = ensure_same_size(img_a, img_b)
    win_size = min(7, img_a.shape[0], img_a.shape[1])
    if win_size % 2 == 0:
        win_size -= 1
    if win_size < 3:
        return 0.0
    score = ssim_metric(img_a, img_b, win_size=win_size, channel_axis=2, data_range=255)
    return float(score)


def main():
    script_dir = os.path.dirname(os.path.abspath(__file__))
    project_root = os.path.dirname(script_dir)

    parser = argparse.ArgumentParser(
        description="Compare glTF and USD renders using NVIDIA FLIP and SSIM"
    )
    parser.add_argument("--gltf-dir", default=os.path.join(project_root, "output", "gltf", "renders"))
    parser.add_argument("--usd-dir", default=os.path.join(project_root, "output", "usd", "renders"))
    parser.add_argument("--output-dir", default=None)
    parser.add_argument("--threshold", type=float, default=0.15,
                        help="FLIP error threshold for pass/fail (default: 0.15, lower=better)")
    parser.add_argument("--filter", default=None)
    args = parser.parse_args()

    if args.output_dir is None:
        args.output_dir = os.path.join(project_root, "output", "comparison")

    os.makedirs(args.output_dir, exist_ok=True)

    gltf_files = {}
    if os.path.isdir(args.gltf_dir):
        for f in os.listdir(args.gltf_dir):
            if f.endswith(".png"):
                name = os.path.splitext(f)[0]
                gltf_files[name] = os.path.join(args.gltf_dir, f)

    usd_files = {}
    if os.path.isdir(args.usd_dir):
        for f in os.listdir(args.usd_dir):
            if f.endswith("_usda.png"):
                name = f.replace("_usda.png", "")
                usd_files[name] = os.path.join(args.usd_dir, f)

    all_models = sorted(set(gltf_files.keys()) | set(usd_files.keys()))
    if args.filter:
        import fnmatch
        all_models = [m for m in all_models if fnmatch.fnmatch(m, args.filter)]

    results = []
    pass_count = 0
    fail_count = 0
    skip_count = 0

    metric_label = "FLIP" if HAS_FLIP else "SSIM"
    print(f"Comparing {len(all_models)} models | Primary metric: {metric_label} | Threshold: {args.threshold}\n")

    for name in all_models:
        gltf_path = gltf_files.get(name)
        usd_path = usd_files.get(name)

        if not gltf_path or not usd_path:
            skip_count += 1
            results.append({"name": name, "status": "skip",
                            "reason": "missing " + ("glTF" if not gltf_path else "USD")})
            continue

        try:
            img_gltf = load_and_composite(gltf_path)
            img_usd = load_and_composite(usd_path)

            ssim_score = compute_ssim(img_gltf, img_usd)

            heatmap_path = os.path.join(args.output_dir, f"{name}_flip.png")
            flip_score, _ = compute_flip(img_gltf, img_usd, heatmap_path)

            if flip_score is not None:
                passed = flip_score <= args.threshold
            else:
                passed = ssim_score >= (1.0 - args.threshold)

            status = "pass" if passed else "fail"
            if passed:
                pass_count += 1
            else:
                fail_count += 1

            flip_str = f"FLIP={flip_score:.4f}" if flip_score is not None else "FLIP=N/A"
            print(f"  {'OK  ' if passed else 'FAIL'}  {name}: {flip_str}  SSIM={ssim_score:.4f}")

            entry = {
                "name": name, "status": status,
                "ssim": round(ssim_score, 4),
                "gltf": gltf_path, "usd": usd_path,
            }
            if flip_score is not None:
                entry["flip_mean"] = round(flip_score, 4)
                entry["flip_heatmap"] = heatmap_path
            results.append(entry)

        except Exception as e:
            fail_count += 1
            print(f"  ERR   {name}: {e}")
            results.append({"name": name, "status": "error", "error": str(e)})

    print(f"\n{'=' * 60}")
    print(f"Results: {pass_count} pass, {fail_count} fail, {skip_count} skip")

    json_path = os.path.join(args.output_dir, "comparison-results.json")
    with open(json_path, "w") as f:
        json.dump(results, f, indent=2)
    print(f"Results JSON: {json_path}")

    return 0


if __name__ == "__main__":
    sys.exit(main())
