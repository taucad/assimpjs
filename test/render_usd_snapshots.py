#!/usr/bin/env python3
"""
Render deterministic PNG snapshots of USD files for visual validation.

Uses OpenUSD's Storm renderer (GPU/Metal) via UsdAppUtils.FrameRecorder
to produce consistent images of exported USDA and USDZ files.

Features:
  - IBL environment lighting via DomeLight for proper PBR rendering
  - UsdValidation pre-render checks (usdchecker integration)
  - Animation detection with GIF output for animated stages
  - HTML comparison report with reference screenshots

Requires:
  - OpenUSD Python bindings (pxr)
  - PySide6 (for offscreen OpenGL context)
  - imageio (for GIF creation)
  - Pillow (for GIF reference conversion)

Usage:
  python test/render_usd_snapshots.py
  python test/render_usd_snapshots.py --filter "Box*"
  python test/render_usd_snapshots.py --reference-dir repos/glTF-Sample-Assets/Models
"""

from pxr import Usd, UsdGeom, UsdLux, UsdAppUtils, Gf, Sdf
import argparse
import glob
import json
import math
import os
import shutil
import sys

HDR_ENV_PATH = None


def find_hdr_environment():
    """Locate an HDR environment map for IBL lighting."""
    script_dir = os.path.dirname(os.path.abspath(__file__))
    project_root = os.path.dirname(script_dir)
    candidates = [
        os.path.join(project_root, "test", "environments", "neutral.hdr"),
        os.path.join(project_root, "repos", "OpenUSD", "pxr", "imaging", "hdx",
                     "textures", "StinsonBeach.hdr"),
    ]
    for c in candidates:
        if os.path.isfile(c):
            return c
    return None


def setup_opengl_context():
    from PySide6.QtOpenGL import QOpenGLFramebufferObject, QOpenGLFramebufferObjectFormat
    from PySide6.QtCore import QSize
    from PySide6.QtGui import QOffscreenSurface, QOpenGLContext, QSurfaceFormat
    from PySide6.QtWidgets import QApplication

    app = QApplication.instance() or QApplication(sys.argv)
    fmt = QSurfaceFormat()
    fmt.setSamples(4)
    surface = QOffscreenSurface()
    surface.setFormat(fmt)
    surface.create()
    ctx = QOpenGLContext()
    ctx.setFormat(fmt)
    ctx.create()
    ctx.makeCurrent(surface)
    fbo = QOpenGLFramebufferObject(QSize(1, 1), QOpenGLFramebufferObjectFormat())
    fbo.bind()
    return app, surface, ctx


def validate_usd_file(stage):
    """Run UsdValidation checks and return list of error messages."""
    try:
        from pxr import UsdValidation
        registry = UsdValidation.ValidationRegistry()
        validators = registry.GetOrLoadAllValidators()
        ctx = UsdValidation.ValidationContext(validators)
        errors = ctx.Validate(stage)
        return [err.GetMessage() for err in errors]
    except ImportError:
        return []
    except Exception as e:
        return [f"validation error: {e}"]


def compute_framing(stage):
    """Compute scene framing matching the glTF-Sample-Viewer algorithm.

    The glTF viewer's getExtentsFromAccessor expands each mesh primitive's
    world-space AABB to a bounding sphere (center ± half-diagonal), then
    accumulates across all primitives.  fitDistanceToExtents computes
    distance = max(X_extent, Y_extent) / 2 / tan(yfov/2), using only the
    X and Y dimensions (Z is depth).  We replicate this here so that
    camera framing matches exactly.
    """
    cache = UsdGeom.BBoxCache(Usd.TimeCode.Default(), ["default", "render", "proxy"])

    scene_min = [float('inf')] * 3
    scene_max = [float('-inf')] * 3
    found_any = False

    for prim in stage.Traverse():
        if not prim.IsA(UsdGeom.Mesh):
            continue
        bounds = cache.ComputeWorldBound(prim)
        rng = bounds.ComputeAlignedRange()
        if rng.IsEmpty():
            continue

        bmin = rng.GetMin()
        bmax = rng.GetMax()
        cx = (bmin[0] + bmax[0]) * 0.5
        cy = (bmin[1] + bmax[1]) * 0.5
        cz = (bmin[2] + bmax[2]) * 0.5
        hx = (bmax[0] - bmin[0]) * 0.5
        hy = (bmax[1] - bmin[1]) * 0.5
        hz = (bmax[2] - bmin[2]) * 0.5
        radius = math.sqrt(hx * hx + hy * hy + hz * hz)

        for i, (c, r) in enumerate([(cx, radius), (cy, radius), (cz, radius)]):
            scene_min[i] = min(scene_min[i], c - r)
            scene_max[i] = max(scene_max[i], c + r)
        found_any = True

    if not found_any:
        return None

    center = Gf.Vec3d(
        (scene_min[0] + scene_max[0]) * 0.5,
        (scene_min[1] + scene_max[1]) * 0.5,
        (scene_min[2] + scene_max[2]) * 0.5,
    )
    extent_x = scene_max[0] - scene_min[0]
    extent_y = scene_max[1] - scene_min[1]
    max_half = max(extent_x, extent_y) * 0.5
    if max_half < 1e-6:
        return None

    return center, max_half


def inject_camera(stage, center, radius, yaw_deg=30.0, pitch_deg=20.0):
    """Inject a camera using orbit parametrization matching glTF-Sample-Viewer.

    The camera orbits around the scene center at the given yaw (rotation
    around Y axis) and pitch (elevation) angles.  ``radius`` is the
    max(X_extent, Y_extent)/2 from the sphere-expanded scene bounds,
    matching glTF-Sample-Viewer's fitDistanceToExtents which computes
    distance = maxAxisLength/2 / tan(yfov/2).
    Camera apertures are authored on the root layer via DefinePrim
    since session-layer aperture overrides are ignored by Storm.
    """
    yfov = math.radians(45)
    dist = radius / math.tan(yfov / 2.0)

    yaw = math.radians(yaw_deg)
    pitch = math.radians(pitch_deg)

    eye = Gf.Vec3d(
        center[0] - dist * math.sin(yaw) * math.cos(pitch),
        center[1] + dist * math.sin(pitch),
        center[2] + dist * math.cos(yaw) * math.cos(pitch),
    )
    target = Gf.Vec3d(center[0], center[1], center[2])

    view = Gf.Matrix4d()
    view.SetLookAt(eye, target, Gf.Vec3d(0, 1, 0))
    cam_xform = view.GetInverse()

    existing = stage.GetPrimAtPath("/RenderCam")
    if existing:
        stage.RemovePrim("/RenderCam")

    prim = stage.DefinePrim("/RenderCam", "Camera")
    cam = UsdGeom.Camera(prim)
    UsdGeom.Xformable(prim).AddTransformOp().Set(cam_xform)
    cam.GetClippingRangeAttr().Set(Gf.Vec2f(max(0.01, dist * 0.01), dist * 20))

    focal_length = 50.0
    vert_aperture = 2.0 * focal_length * math.tan(yfov / 2.0)
    cam.GetFocalLengthAttr().Set(focal_length)
    cam.GetVerticalApertureAttr().Set(vert_aperture)
    cam.GetHorizontalApertureAttr().Set(vert_aperture)

    return cam


def inject_dome_light(stage, hdr_path=None, intensity=1.0):
    """Inject a DomeLight into the session layer for IBL environment lighting.

    Rotates the environment 90 degrees around Y to match the glTF-Sample-Viewer's
    default environmentRotation=90 setting.
    """
    session = stage.GetSessionLayer()
    with Sdf.ChangeBlock():
        spec = Sdf.CreatePrimInLayer(session, "/RenderDomeLight")
        spec.specifier = Sdf.SpecifierDef
        spec.typeName = "DomeLight"

    prim = stage.GetPrimAtPath("/RenderDomeLight")
    dome = UsdLux.DomeLight(prim)
    dome.GetIntensityAttr().Set(intensity)

    xformable = UsdGeom.Xformable(prim)
    xformable.AddRotateYOp().Set(90.0)

    if hdr_path and os.path.isfile(hdr_path):
        dome.GetTextureFileAttr().Set(hdr_path)
    else:
        dome.GetColorAttr().Set(Gf.Vec3f(0.85, 0.85, 0.9))

    return dome


def detect_animation(stage):
    """Check if stage has animation time samples. Returns (has_anim, start, end)."""
    start = stage.GetStartTimeCode()
    end = stage.GetEndTimeCode()
    if start < end:
        return True, start, end
    return False, 0, 0


def create_recorder(image_width, use_dome_light):
    recorder = UsdAppUtils.FrameRecorder("", True, True)
    recorder.SetImageWidth(image_width)
    recorder.SetColorCorrectionMode("sRGB")
    recorder.SetCameraLightEnabled(not use_dome_light)
    recorder.SetIncludedPurposes(["default", "render", "proxy"])
    return recorder


def render_file(filepath, output_path, image_width, hdr_path=None, dome_intensity=1.0):
    try:
        stage = Usd.Stage.Open(filepath)
    except Exception as e:
        return {"ok": False, "error": f"cannot open stage: {e}",
                "validation_errors": [], "animated": False}
    if not stage:
        return {"ok": False, "error": "cannot open stage",
                "validation_errors": [], "animated": False}

    validation_errors = validate_usd_file(stage)

    framing = compute_framing(stage)
    if framing is None:
        return {"ok": False, "error": "empty scene or zero-size bounds",
                "validation_errors": validation_errors, "animated": False}
    center, radius = framing
    cam = inject_camera(stage, center, radius)

    use_dome = hdr_path is not None
    if use_dome:
        inject_dome_light(stage, hdr_path, dome_intensity)

    recorder = create_recorder(image_width, use_dome)

    try:
        recorder.Record(stage, cam, Usd.TimeCode.Default(), output_path)
    except Exception as e:
        return {"ok": False, "error": str(e),
                "validation_errors": validation_errors, "animated": False}

    has_anim, start_time, end_time = detect_animation(stage)
    gif_path = None

    if has_anim:
        gif_path = render_animation_gif(
            stage, cam, recorder, output_path, start_time, end_time, image_width)

    return {"ok": True, "error": None,
            "validation_errors": validation_errors,
            "animated": has_anim, "gif_path": gif_path}


def render_animation_gif(stage, cam, recorder, base_output_path, start_time, end_time, image_width):
    """Render animation frames and compose into a GIF."""
    try:
        import imageio.v3 as iio
        from PIL import Image
        import io
    except ImportError:
        return None

    num_frames = 24
    duration = end_time - start_time
    if duration <= 0:
        return None

    step = duration / num_frames
    frames = []
    temp_dir = os.path.dirname(base_output_path)

    for i in range(num_frames):
        time_code = Usd.TimeCode(start_time + i * step)
        frame_path = os.path.join(temp_dir, f"_anim_frame_{i:04d}.png")
        try:
            recorder.Record(stage, cam, time_code, frame_path)
            img = Image.open(frame_path)
            img = img.convert("RGBA")
            frames.append(img)
        except Exception:
            pass
        finally:
            if os.path.exists(frame_path):
                os.remove(frame_path)

    if len(frames) < 2:
        return None

    gif_path = base_output_path.replace(".png", ".gif")
    frame_duration_ms = max(40, int(1000 * duration / (num_frames * 24.0)))
    try:
        frames[0].save(
            gif_path,
            save_all=True,
            append_images=frames[1:],
            duration=frame_duration_ms,
            loop=0,
            disposal=2,
            optimize=True,
        )
        return gif_path
    except Exception:
        return None


def find_reference_screenshot(model_name, reference_dir):
    """Find the reference screenshot for a model in glTF-Sample-Assets."""
    if not reference_dir:
        return None
    model_dir = os.path.join(reference_dir, model_name, "screenshot")
    if not os.path.isdir(model_dir):
        return None
    for ext in ["png", "jpg", "jpeg", "gif"]:
        candidate = os.path.join(model_dir, f"screenshot.{ext}")
        if os.path.isfile(candidate):
            return candidate
    return None


def convert_gif_to_png(gif_path, output_dir):
    """Convert GIF reference to PNG (first frame) for comparison."""
    try:
        from PIL import Image
        img = Image.open(gif_path)
        img.seek(0)
        png_path = os.path.join(output_dir,
                                os.path.basename(gif_path).replace(".gif", ".png"))
        img.convert("RGBA").save(png_path)
        return png_path
    except Exception:
        return gif_path


def load_comparison_scores(project_root):
    """Load FLIP and SSIM scores from comparison-results.json if available."""
    path = os.path.join(project_root, "output", "comparison", "comparison-results.json")
    if not os.path.isfile(path):
        return {}
    try:
        with open(path) as f:
            data = json.load(f)
        scores = {}
        for r in data:
            name = r.get("name")
            if not name:
                continue
            scores[name] = {
                "ssim": r.get("ssim"),
                "flip": r.get("flip_mean"),
            }
        return scores
    except Exception:
        return {}


def generate_html_report(output_dir, results, reference_dir, gltf_render_dir=None):
    """Generate an HTML comparison report with side-by-side images."""
    html_path = os.path.join(output_dir, "report.html")
    script_dir = os.path.dirname(os.path.abspath(__file__))
    project_root = os.path.dirname(script_dir)
    ssim_scores = load_comparison_scores(project_root)

    models = {}
    for r in results:
        name = r["name"]
        if name not in models:
            models[name] = {"name": name, "ref": None, "gltf": None,
                            "usda": None, "usdz": None,
                            "validation_errors": [], "animated": False}
        fmt = r.get("format", "")
        if fmt == "usda":
            models[name]["usda"] = r
        elif fmt == "usdz":
            models[name]["usdz"] = r
        if r.get("validation_errors"):
            models[name]["validation_errors"].extend(r["validation_errors"])
        if r.get("animated"):
            models[name]["animated"] = True

    for name, info in models.items():
        ref_src = find_reference_screenshot(name, reference_dir)
        if ref_src:
            ext = os.path.splitext(ref_src)[1]
            ref_dest = os.path.join(output_dir, f"{name}_reference{ext}")
            shutil.copy2(ref_src, ref_dest)
            if ext == ".gif":
                png_dest = convert_gif_to_png(ref_src, output_dir)
                info["ref"] = os.path.basename(png_dest)
                info["ref_gif"] = f"{name}_reference{ext}"
            else:
                info["ref"] = f"{name}_reference{ext}"

        if gltf_render_dir:
            gltf_png = os.path.join(gltf_render_dir, f"{name}.png")
            if os.path.isfile(gltf_png):
                dest = os.path.join(output_dir, f"{name}_gltf.png")
                shutil.copy2(gltf_png, dest)
                info["gltf"] = f"{name}_gltf.png"

        model_scores = ssim_scores.get(name, {})
        info["ssim"] = model_scores.get("ssim") if isinstance(model_scores, dict) else model_scores
        info["flip"] = model_scores.get("flip") if isinstance(model_scores, dict) else None

    sorted_models = sorted(models.values(), key=lambda x: x["name"])
    ok_count = sum(1 for r in results if r.get("ok"))

    has_gltf = any(m.get("gltf") for m in sorted_models)

    rows = []
    for m in sorted_models:
        name = m["name"]
        ref_img = f'<img src="{m["ref"]}">' if m.get("ref") else '<span class="na">none</span>'

        gltf_cell = ""
        if has_gltf:
            if m.get("gltf"):
                gltf_cell = f'<td><img src="{m["gltf"]}"></td>'
            else:
                gltf_cell = '<td><span class="na">-</span></td>'

        def render_cell(key, fmt_name):
            r = m.get(key, {})
            if not r:
                return '<td><span class="na">-</span></td>'
            if r.get("ok"):
                gif_file = r.get("gif_path")
                if gif_file and os.path.isfile(gif_file):
                    gif_basename = os.path.basename(gif_file)
                    return f'<td><img src="{gif_basename}"></td>'
                return f'<td><img src="{name}_{fmt_name}.png"></td>'
            else:
                err = r.get("error", "N/A")[:60]
                return f'<td><span class="err">{err}</span></td>'

        usda_cell = render_cell("usda", "usda")
        usdz_cell = render_cell("usdz", "usdz")

        val_errs = m.get("validation_errors", [])
        val_count = len(val_errs)
        val_cell = f'<td class="val-ok">0</td>' if val_count == 0 else \
            f'<td class="val-err" title="{"; ".join(val_errs[:5])}">{val_count}</td>'

        flip_val = m.get("flip")
        if flip_val is not None:
            css = "metric-good" if flip_val <= 0.15 else "metric-bad"
            flip_cell = f'<td class="{css}">{flip_val:.2f}</td>'
        else:
            flip_cell = '<td class="na">-</td>'

        ssim_val = m.get("ssim")
        if ssim_val is not None:
            css = "metric-good" if ssim_val >= 0.85 else "metric-bad"
            ssim_cell = f'<td class="{css}">{ssim_val:.2f}</td>'
        else:
            ssim_cell = '<td class="na">-</td>'

        anim_marker = ' <span class="anim">A</span>' if m.get("animated") else ''

        rows.append(
            f'<tr><td class="name">{name}{anim_marker}</td>'
            f'<td>{ref_img}</td>'
            f'{gltf_cell}'
            f'{usda_cell}{usdz_cell}{val_cell}{flip_cell}{ssim_cell}</tr>'
        )

    gltf_header = '<th>glTF</th>' if has_gltf else ''
    has_flip = any(m.get("flip") is not None for m in sorted_models)
    has_ssim = any(m.get("ssim") is not None for m in sorted_models)
    flip_header = '<th title="NVIDIA FLIP perceptual error (lower=better)">FLIP</th>' if has_flip else ''
    ssim_header = '<th title="Structural Similarity Index (higher=better)">SSIM</th>' if has_ssim else ''

    html = f"""<!DOCTYPE html>
<html><head><meta charset="utf-8">
<title>USD Export Validation Report</title>
<style>
:root {{ --img-size: 150px; }}
* {{ box-sizing: border-box; }}
body {{ font-family: -apple-system, sans-serif; margin: 10px; background: #1a1a1a; color: #eee; }}
table {{ border-collapse: collapse; width: 100%; table-layout: fixed; }}
th, td {{ border: 1px solid #333; padding: 4px; text-align: center; vertical-align: middle; overflow: hidden; }}
th {{ background: #2a2a2a; position: sticky; top: 0; z-index: 1; font-size: 0.85em; }}
th:first-child, td.name {{ width: 130px; text-align: left; font-size: 0.72em; word-break: break-all; }}
tr:nth-child(even) {{ background: #222; }}
td img {{ width: 100%; height: auto; max-height: var(--img-size); object-fit: contain; border: 1px solid #444; background: #333; display: block; }}
h1 {{ color: #fff; font-size: 1.2em; margin: 5px 0; }}
.summary {{ margin: 5px 0; font-size: 0.9em; }}
.na {{ color: #666; font-size: 0.7em; }}
.err {{ color: #f55; font-size: 0.6em; display: block; word-break: break-all; }}
.val-ok {{ color: #4a4; font-size: 0.8em; width: 36px; }}
.val-err {{ color: #f55; font-size: 0.8em; cursor: help; width: 36px; }}
.metric-good {{ color: #4a4; font-size: 0.8em; width: 44px; }}
.metric-bad {{ color: #f55; font-size: 0.8em; width: 44px; }}
.anim {{ color: #5af; font-size: 0.65em; font-weight: bold; }}
.legend {{ margin: 8px 0; font-size: 0.75em; color: #999; line-height: 1.6; }}
.legend b {{ color: #ccc; }}
</style></head><body>
<h1>USD Export Validation Report</h1>
<p class="summary">{len(sorted_models)} models | {ok_count} / {len(results)} renders OK | <span class="anim">A</span> = animated</p>
<p class="legend">
<b>Val</b> = USD validation errors (usdchecker). 0 = spec-compliant file.<br>
<b>FLIP</b> = NVIDIA FLIP perceptual error (0.0 = identical, 1.0 = max difference). Purpose-built for rendered image comparison. Lower is better. <span class="metric-good">Green &le; 0.15</span> | <span class="metric-bad">Red &gt; 0.15</span><br>
<b>SSIM</b> = Structural Similarity Index (0.0 = different, 1.0 = identical). Traditional metric for reference. Higher is better. <span class="metric-good">Green &ge; 0.85</span> | <span class="metric-bad">Red &lt; 0.85</span>
</p>
<table>
<tr><th>Model</th><th>Reference</th>{gltf_header}<th>USDA</th><th>USDZ</th><th>Val</th>{flip_header}{ssim_header}</tr>
{"".join(rows)}
</table>
</body></html>"""

    with open(html_path, "w") as f:
        f.write(html)
    return html_path


def main():
    script_dir = os.path.dirname(os.path.abspath(__file__))
    project_root = os.path.dirname(script_dir)

    parser = argparse.ArgumentParser(
        description="Render USD files to PNG snapshots for visual validation"
    )
    parser.add_argument(
        "--input-dir",
        default=os.path.join(project_root, "output", "usd"),
        help="Directory containing USD files (default: output/usd)",
    )
    parser.add_argument(
        "--output-dir", default=None,
        help="Where to write PNGs (default: <input-dir>/renders)",
    )
    parser.add_argument(
        "--width", type=int, default=512,
        help="Image width in pixels (default: 512)",
    )
    parser.add_argument(
        "--filter", default=None,
        help='Glob filter for filenames (e.g. "Box*")',
    )
    parser.add_argument(
        "--formats", default="usda,usdz",
        help="Comma-separated formats to render (default: usda,usdz)",
    )
    parser.add_argument(
        "--reference-dir", default=None,
        help="Path to glTF-Sample-Assets/Models for reference screenshots",
    )
    parser.add_argument(
        "--gltf-render-dir", default=None,
        help="Path to glTF render output for comparison",
    )
    parser.add_argument(
        "--hdr", default=None,
        help="Path to HDR environment map for IBL lighting",
    )
    parser.add_argument(
        "--dome-intensity", type=float, default=1.35,
        help="DomeLight intensity for IBL (default: 1.35, tuned to match glTF-Sample-Viewer output)",
    )
    parser.add_argument(
        "--no-validate", action="store_true",
        help="Skip UsdValidation checks",
    )
    args = parser.parse_args()

    if args.output_dir is None:
        args.output_dir = os.path.join(args.input_dir, "renders")

    if args.reference_dir is None:
        candidate = os.path.join(project_root, "repos", "glTF-Sample-Assets", "Models")
        if os.path.isdir(candidate):
            args.reference_dir = candidate

    hdr_path = args.hdr
    if hdr_path is None:
        hdr_path = find_hdr_environment()
    if hdr_path:
        print(f"Using HDR environment: {hdr_path}")
    else:
        print("No HDR environment found, using camera light only")

    formats = [f.strip() for f in args.formats.split(",")]

    files = []
    for fmt in formats:
        if args.filter:
            files.extend(sorted(glob.glob(os.path.join(args.input_dir, f"{args.filter}.{fmt}"))))
            files.extend(sorted(glob.glob(os.path.join(args.input_dir, "*", f"{args.filter}.{fmt}"))))
        else:
            files.extend(sorted(glob.glob(os.path.join(args.input_dir, f"*.{fmt}"))))
            files.extend(sorted(glob.glob(os.path.join(args.input_dir, "*", f"*.{fmt}"))))
    seen = set()
    unique = []
    for f in files:
        if f not in seen:
            seen.add(f)
            unique.append(f)
    files = unique

    if not files:
        print(f"No USD files found in {args.input_dir}")
        return 1

    os.makedirs(args.output_dir, exist_ok=True)

    print("Initializing OpenGL context...")
    app, surface, ctx = setup_opengl_context()
    print(f"Rendering {len(files)} files at {args.width}px width\n")

    total = len(files)
    passed = 0
    failed = 0
    failures = []
    results = []
    animated_count = 0

    for filepath in files:
        basename = os.path.basename(filepath)
        name, ext = os.path.splitext(basename)
        fmt = ext.lstrip(".")
        out_name = f"{name}_{fmt}.png"
        out_path = os.path.join(args.output_dir, out_name)

        result = render_file(filepath, out_path, args.width, hdr_path, args.dome_intensity)

        entry = {"name": name, "format": fmt, "file": basename,
                 "ok": result["ok"],
                 "validation_errors": result.get("validation_errors", []),
                 "animated": result.get("animated", False)}

        if result["ok"]:
            size_kb = os.path.getsize(out_path) / 1024
            anim_tag = " [ANIM]" if result.get("animated") else ""
            val_tag = f" [{len(result.get('validation_errors', []))} warnings]" \
                if result.get("validation_errors") else ""
            print(f"  OK    {basename} -> {out_name} ({size_kb:.1f} KB){anim_tag}{val_tag}")
            passed += 1
            if result.get("animated"):
                animated_count += 1
            if result.get("gif_path"):
                entry["gif_path"] = result["gif_path"]
        else:
            print(f"  FAIL  {basename}: {result['error']}")
            failed += 1
            failures.append(basename)
            entry["error"] = result["error"]
        results.append(entry)

    print(f"\n{'=' * 60}")
    print(f"Results: {passed}/{total} rendered, {failed} failed, {animated_count} animated")
    if failures:
        print(f"\nFailed ({len(failures)}):")
        for f in failures:
            print(f"  - {f}")

    json_path = os.path.join(args.output_dir, "render-results.json")
    if args.filter and os.path.isfile(json_path):
        with open(json_path) as f:
            existing = json.load(f)
        updated_names = {(r["name"], r.get("format", "")) for r in results}
        merged = [r for r in existing if (r["name"], r.get("format", "")) not in updated_names]
        merged.extend(results)
        results = sorted(merged, key=lambda r: (r["name"], r.get("format", "")))
    with open(json_path, "w") as f:
        json.dump(results, f, indent=2)

    print(f"Output: {args.output_dir}")
    return 1 if failed > 0 else 0


if __name__ == "__main__":
    sys.exit(main())
