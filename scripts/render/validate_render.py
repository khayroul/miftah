#!/usr/bin/env python3
"""
Miftah — Render Validation Pipeline

Compares rendered mushaf pages against quran.com reference screenshots.
Uses SSIM (Structural Similarity Index) to score visual fidelity.

Reports:
  - Per-page SSIM score (0-1, higher = more similar)
  - Per-page visual diff image (highlights differences)
  - Summary with issues flagged

Usage:
  python3 validate_render.py --pages 1,2,6,586,604
  python3 validate_render.py --round 1
"""

import sys
import json
import argparse
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFont
from skimage.metrics import structural_similarity as ssim
from skimage.transform import resize as sk_resize

PROJECT_ROOT = Path(__file__).parent.parent.parent
TEST_DIR = PROJECT_ROOT / "test"
RENDER_DIR = TEST_DIR / "pages"
REF_DIR = TEST_DIR / "references"
DIFF_DIR = TEST_DIR / "diffs"
REPORT_DIR = TEST_DIR / "reports"


def load_and_crop_text_area(img_path, is_reference=False):
    """Load image and crop to text area (remove header, nav chrome, and page number)."""
    img = Image.open(img_path).convert("RGB")
    w, h = img.size

    # Crop aggressively to just the text region
    if is_reference:
        # quran.com Reading mode: ~8% top nav, ~3% bottom
        top_crop = int(h * 0.08)
        bot_crop = int(h * 0.03)
        # Also crop side margins where quran.com has different padding
        left_crop = int(w * 0.03)
        right_crop = int(w * 0.03)
    else:
        # Our render: ~5% header, ~4% page number
        top_crop = int(h * 0.05)
        bot_crop = int(h * 0.04)
        left_crop = int(w * 0.03)
        right_crop = int(w * 0.03)

    cropped = img.crop((left_crop, top_crop, w - right_crop, h - bot_crop))
    return cropped


def compute_ssim(img1, img2):
    """Compute SSIM between two PIL images, resizing to match if needed."""
    # Convert to grayscale numpy arrays
    arr1 = np.array(img1.convert("L"), dtype=np.float64)
    arr2 = np.array(img2.convert("L"), dtype=np.float64)

    # Resize img2 to match img1's dimensions if they differ
    if arr1.shape != arr2.shape:
        arr2 = sk_resize(arr2, arr1.shape, preserve_range=True, anti_aliasing=True)

    # Compute SSIM with full image (returns score + diff image)
    score, diff_map = ssim(arr1, arr2, full=True, data_range=255)
    return score, diff_map


def generate_diff_image(img1, img2, diff_map, score, page_num):
    """Generate a side-by-side diff visualization."""
    # Resize images to same dimensions
    target_w, target_h = img1.size

    img2_resized = img2.resize((target_w, target_h), Image.LANCZOS)

    # Create diff highlight image
    diff_norm = ((1 - diff_map) * 255).astype(np.uint8)
    diff_img = Image.fromarray(diff_norm).convert("RGB")
    diff_img = diff_img.resize((target_w, target_h), Image.LANCZOS)

    # Create side-by-side comparison: [Ours | Reference | Diff]
    panel_w = target_w // 2  # Scale down each panel
    panel_h = target_h // 2

    img1_small = img1.resize((panel_w, panel_h), Image.LANCZOS)
    img2_small = img2_resized.resize((panel_w, panel_h), Image.LANCZOS)
    diff_small = diff_img.resize((panel_w, panel_h), Image.LANCZOS)

    canvas_w = panel_w * 3 + 20  # 3 panels + gaps
    canvas_h = panel_h + 60  # panels + label space
    canvas = Image.new("RGB", (canvas_w, canvas_h), (255, 255, 255))

    canvas.paste(img1_small, (0, 50))
    canvas.paste(img2_small, (panel_w + 10, 50))
    canvas.paste(diff_small, (panel_w * 2 + 20, 50))

    # Add labels
    draw = ImageDraw.Draw(canvas)
    try:
        font = ImageFont.truetype("/System/Library/Fonts/Helvetica.ttc", 20)
    except:
        font = ImageFont.load_default()

    draw.text((panel_w // 2 - 30, 10), "Ours", fill=(0, 0, 0), font=font)
    draw.text((panel_w + 10 + panel_w // 2 - 50, 10), "Reference", fill=(0, 0, 0), font=font)
    draw.text((panel_w * 2 + 20 + panel_w // 2 - 60, 10),
              f"Diff (SSIM: {score:.4f})", fill=(200, 0, 0), font=font)

    return canvas


def validate_page(page_num, round_num=1):
    """Validate a single rendered page against its reference."""
    render_path = RENDER_DIR / f"page_{page_num:03d}.png"
    ref_path = REF_DIR / f"ref_page_{page_num:03d}.png"

    if not render_path.exists():
        return {"page": page_num, "status": "missing_render", "ssim": 0}
    if not ref_path.exists():
        return {"page": page_num, "status": "missing_reference", "ssim": 0}

    # Load images
    our_img = load_and_crop_text_area(render_path, is_reference=False)
    ref_img = load_and_crop_text_area(ref_path, is_reference=True)

    # Compute SSIM
    score, diff_map = compute_ssim(our_img, ref_img)

    # Generate diff image
    diff_img = generate_diff_image(our_img, ref_img, diff_map, score, page_num)
    diff_dir = DIFF_DIR / f"round{round_num}"
    diff_dir.mkdir(parents=True, exist_ok=True)
    diff_path = diff_dir / f"diff_page_{page_num:03d}.png"
    diff_img.save(str(diff_path))

    # Determine quality level
    if score >= 0.85:
        quality = "excellent"
    elif score >= 0.70:
        quality = "good"
    elif score >= 0.50:
        quality = "fair"
    else:
        quality = "poor"

    result = {
        "page": page_num,
        "status": "validated",
        "ssim": round(score, 4),
        "quality": quality,
        "diff_path": str(diff_path),
    }

    # Additional checks
    issues = []

    # Check for missing glyphs (large white/blank areas in text region)
    our_arr = np.array(our_img.convert("L"))
    # Only flag if nearly ALL pixels are white (>95%) — suggests missing content
    # Normal pages with white bg typically have 60-85% white (text fills the rest)
    white_ratio = np.mean(our_arr > 240)
    if white_ratio > 0.95:
        issues.append("excessive_whitespace")

    # Check render dimensions
    full_img = Image.open(render_path)
    if full_img.size != (1536, 2560):  # Expected 2x DPI of 768x1280
        issues.append(f"unexpected_dimensions_{full_img.size}")

    if issues:
        result["issues"] = issues

    return result


def run_validation(pages, round_num=1):
    """Run validation on a list of pages and generate a report."""
    print(f"\n{'='*60}")
    print(f"  VALIDATION ROUND {round_num}")
    print(f"{'='*60}\n")

    results = []
    for p in pages:
        print(f"  Validating page {p}...", end=" ")
        result = validate_page(p, round_num)
        status = result.get("quality", result["status"])
        score = result.get("ssim", 0)
        issues = result.get("issues", [])
        issue_str = f" ⚠ {', '.join(issues)}" if issues else ""
        print(f"SSIM={score:.4f} [{status}]{issue_str}")
        results.append(result)

    # Summary
    valid = [r for r in results if r["status"] == "validated"]
    avg_ssim = np.mean([r["ssim"] for r in valid]) if valid else 0
    min_ssim = min((r["ssim"] for r in valid), default=0)
    max_ssim = max((r["ssim"] for r in valid), default=0)

    quality_counts = {}
    for r in valid:
        q = r.get("quality", "unknown")
        quality_counts[q] = quality_counts.get(q, 0) + 1

    print(f"\n{'─'*60}")
    print(f"  ROUND {round_num} SUMMARY")
    print(f"{'─'*60}")
    print(f"  Pages validated: {len(valid)}/{len(pages)}")
    print(f"  Avg SSIM: {avg_ssim:.4f}")
    print(f"  Min SSIM: {min_ssim:.4f}")
    print(f"  Max SSIM: {max_ssim:.4f}")
    print(f"  Quality distribution: {quality_counts}")

    issue_pages = [r for r in valid if r.get("issues")]
    if issue_pages:
        print(f"\n  ⚠ Pages with issues:")
        for r in issue_pages:
            print(f"    Page {r['page']}: {', '.join(r['issues'])}")

    # Pages needing attention (below good threshold)
    attention = [r for r in valid if r["ssim"] < 0.70]
    if attention:
        print(f"\n  🔧 Pages needing attention (SSIM < 0.70):")
        for r in attention:
            print(f"    Page {r['page']}: SSIM={r['ssim']:.4f}")

    # Save report
    report_dir = REPORT_DIR
    report_dir.mkdir(parents=True, exist_ok=True)
    report_path = report_dir / f"round{round_num}_report.json"
    report = {
        "round": round_num,
        "pages_count": len(pages),
        "validated_count": len(valid),
        "avg_ssim": round(avg_ssim, 4),
        "min_ssim": round(min_ssim, 4),
        "max_ssim": round(max_ssim, 4),
        "quality_distribution": quality_counts,
        "results": results,
    }
    with open(report_path, "w") as f:
        json.dump(report, f, indent=2)
    print(f"\n  Report saved: {report_path}")

    return report


def main():
    parser = argparse.ArgumentParser(description="Validate mushaf renders against quran.com references")
    parser.add_argument("--pages", type=str, default="1,2,3,6,586,590,604",
                       help="Comma-separated page numbers or range (e.g., 1,2,6 or 1-10)")
    parser.add_argument("--round", type=int, default=1, help="Validation round number")
    args = parser.parse_args()

    # Parse pages
    pages = []
    for part in args.pages.split(","):
        if "-" in part:
            s, e = part.split("-")
            pages.extend(range(int(s), int(e) + 1))
        else:
            pages.append(int(part))

    run_validation(pages, args.round)


if __name__ == "__main__":
    main()
