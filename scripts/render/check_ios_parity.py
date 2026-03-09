#!/usr/bin/env python3
"""
Check pixel parity between Miftah page assets and Quran.com iOS page images.

Compares:
  Rendered:  assets/pages/page_{NNN}.png
  Reference: hafs_1405/images_1920/width_1920/pageNNN.png

The checker reports per-page pixel mismatch ratio and writes a JSON summary.
By default, it writes diff overlays only for failing pages.
"""

from __future__ import annotations

import argparse
import json
import sys
from datetime import datetime, timezone
from pathlib import Path

from PIL import Image, ImageChops, ImageOps


SCRIPT_DIR = Path(__file__).resolve().parent
PROJECT_ROOT = SCRIPT_DIR.parent.parent

TOTAL_PAGES = 604

DEFAULT_SOURCE_ROOT = Path("/tmp/quran-ios/Example/QuranEngineApp/Resources/hafs_1405")
DEFAULT_REFERENCE_DIR = DEFAULT_SOURCE_ROOT / "images_1920" / "width_1920"
DEFAULT_RENDERED_DIR = PROJECT_ROOT / "assets" / "pages"
DEFAULT_REPORT_PATH = PROJECT_ROOT / "test" / "reports" / "ios_parity_report.json"
DEFAULT_DIFF_DIR = PROJECT_ROOT / "test" / "diffs" / "ios_parity"


def parse_pages_spec(spec: str) -> list[int]:
    pages: set[int] = set()
    for part in spec.split(","):
        token = part.strip()
        if not token:
            continue
        if "-" in token:
            start_str, end_str = token.split("-", 1)
            start = int(start_str.strip())
            end = int(end_str.strip())
            if start > end:
                start, end = end, start
            for page in range(start, end + 1):
                pages.add(page)
        else:
            pages.add(int(token))

    valid = sorted(page for page in pages if 1 <= page <= TOTAL_PAGES)
    if not valid:
        raise ValueError("No valid pages found in --pages.")
    return valid


def get_paths_for_page(page: int, rendered_dir: Path, reference_dir: Path) -> tuple[Path, Path]:
    rendered_path = rendered_dir / f"page_{page:03d}.png"
    reference_path = reference_dir / f"page{page:03d}.png"
    return rendered_path, reference_path


def to_binary_mask(diff_image: Image.Image) -> Image.Image:
    channels = diff_image.split()
    if not channels:
        return Image.new("L", diff_image.size, 0)
    mask = channels[0]
    for channel in channels[1:]:
        mask = ImageChops.lighter(mask, channel)
    return mask


def compute_mismatch(
    rendered_path: Path,
    reference_path: Path,
) -> dict:
    with Image.open(rendered_path) as rendered_img, Image.open(reference_path) as reference_img:
        rendered_rgba = rendered_img.convert("RGBA")
        reference_rgba = reference_img.convert("RGBA")

        rendered_size = rendered_rgba.size
        reference_size = reference_rgba.size
        if rendered_size != reference_size:
            return {
                "status": "size_mismatch",
                "rendered_size": [rendered_size[0], rendered_size[1]],
                "reference_size": [reference_size[0], reference_size[1]],
            }

        diff = ImageChops.difference(rendered_rgba, reference_rgba)
        mask = to_binary_mask(diff)

        histogram = mask.histogram()
        total_pixels = rendered_size[0] * rendered_size[1]
        mismatch_pixels = total_pixels - histogram[0]
        mismatch_ratio = mismatch_pixels / total_pixels if total_pixels else 0.0

        max_channel_diff = 0
        weighted_sum = 0
        for value, count in enumerate(histogram):
            if count > 0 and value > max_channel_diff:
                max_channel_diff = value
            weighted_sum += value * count
        mean_channel_diff = weighted_sum / total_pixels if total_pixels else 0.0

        return {
            "status": "ok",
            "width": rendered_size[0],
            "height": rendered_size[1],
            "mismatch_pixels": mismatch_pixels,
            "total_pixels": total_pixels,
            "mismatch_ratio": mismatch_ratio,
            "max_channel_diff": max_channel_diff,
            "mean_channel_diff": mean_channel_diff,
            "mask": mask,
            "reference_rgb": reference_rgba.convert("RGB"),
        }


def save_diff_overlay(reference_rgb: Image.Image, mask: Image.Image, output_path: Path) -> None:
    mask_binary = mask.point(lambda px: 255 if px > 0 else 0, mode="L")
    base = ImageOps.grayscale(reference_rgb).convert("RGB")
    base = Image.blend(base, Image.new("RGB", base.size, (255, 255, 255)), 0.25)
    highlight = Image.new("RGB", base.size, (220, 20, 20))
    diff_overlay = Image.composite(highlight, base, mask_binary)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    diff_overlay.save(output_path, format="PNG")


def run_check(
    pages: list[int],
    rendered_dir: Path,
    reference_dir: Path,
    threshold: float,
    diff_dir: Path,
    write_diff_for_pass: bool,
) -> tuple[list[dict], dict]:
    results: list[dict] = []

    for page in pages:
        rendered_path, reference_path = get_paths_for_page(page, rendered_dir, reference_dir)
        if not rendered_path.exists():
            results.append(
                {
                    "page": page,
                    "status": "missing_rendered",
                    "pass": False,
                    "rendered_path": str(rendered_path),
                    "reference_path": str(reference_path),
                }
            )
            continue
        if not reference_path.exists():
            results.append(
                {
                    "page": page,
                    "status": "missing_reference",
                    "pass": False,
                    "rendered_path": str(rendered_path),
                    "reference_path": str(reference_path),
                }
            )
            continue

        mismatch = compute_mismatch(rendered_path, reference_path)
        status = mismatch["status"]
        if status != "ok":
            results.append(
                {
                    "page": page,
                    "status": status,
                    "pass": False,
                    "rendered_path": str(rendered_path),
                    "reference_path": str(reference_path),
                    "rendered_size": mismatch.get("rendered_size"),
                    "reference_size": mismatch.get("reference_size"),
                }
            )
            continue

        mismatch_ratio = float(mismatch["mismatch_ratio"])
        mismatch_pixels = int(mismatch["mismatch_pixels"])
        page_pass = mismatch_ratio <= threshold
        result = {
            "page": page,
            "status": "ok",
            "pass": page_pass,
            "rendered_path": str(rendered_path),
            "reference_path": str(reference_path),
            "width": mismatch["width"],
            "height": mismatch["height"],
            "mismatch_pixels": mismatch_pixels,
            "total_pixels": int(mismatch["total_pixels"]),
            "mismatch_ratio": round(mismatch_ratio, 8),
            "max_channel_diff": int(mismatch["max_channel_diff"]),
            "mean_channel_diff": round(float(mismatch["mean_channel_diff"]), 6),
        }

        should_write_diff = (not page_pass) or write_diff_for_pass
        if should_write_diff:
            diff_path = diff_dir / f"diff_page_{page:03d}.png"
            save_diff_overlay(mismatch["reference_rgb"], mismatch["mask"], diff_path)
            result["diff_overlay"] = str(diff_path)

        results.append(result)

    checked = [item for item in results if item["status"] == "ok"]
    failed = [item for item in results if not item.get("pass", False)]
    exact = [item for item in checked if item.get("mismatch_pixels", 0) == 0]
    avg_ratio = (
        sum(float(item["mismatch_ratio"]) for item in checked) / len(checked)
        if checked
        else 0.0
    )
    max_ratio = max((float(item["mismatch_ratio"]) for item in checked), default=0.0)

    summary = {
        "generated_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "pages_requested": len(pages),
        "pages_checked": len(checked),
        "pages_exact_match": len(exact),
        "pages_passed": len([item for item in results if item.get("pass") is True]),
        "pages_failed": len(failed),
        "missing_rendered": len([item for item in results if item["status"] == "missing_rendered"]),
        "missing_reference": len([item for item in results if item["status"] == "missing_reference"]),
        "size_mismatch": len([item for item in results if item["status"] == "size_mismatch"]),
        "threshold_mismatch_ratio": threshold,
        "avg_mismatch_ratio": round(avg_ratio, 8),
        "max_mismatch_ratio": round(max_ratio, 8),
        "failing_pages": [item["page"] for item in failed],
    }

    return results, summary


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Check pixel parity of Miftah page PNGs against Quran.com iOS source PNGs."
    )
    parser.add_argument(
        "--pages",
        type=str,
        default="1-604",
        help="Pages to check. Example: 1-604,586,589",
    )
    parser.add_argument(
        "--source-root",
        type=Path,
        default=DEFAULT_SOURCE_ROOT,
        help=f"Quran.com iOS hafs_1405 root (default: {DEFAULT_SOURCE_ROOT})",
    )
    parser.add_argument(
        "--reference-dir",
        type=Path,
        default=None,
        help="Override reference images directory (contains pageNNN.png).",
    )
    parser.add_argument(
        "--rendered-dir",
        type=Path,
        default=DEFAULT_RENDERED_DIR,
        help=f"Rendered pages directory (default: {DEFAULT_RENDERED_DIR})",
    )
    parser.add_argument(
        "--threshold",
        type=float,
        default=0.005,
        help="Maximum allowed mismatch ratio per page (default: 0.005 = 0.5%%).",
    )
    parser.add_argument(
        "--report",
        type=Path,
        default=DEFAULT_REPORT_PATH,
        help=f"JSON report output path (default: {DEFAULT_REPORT_PATH})",
    )
    parser.add_argument(
        "--diff-dir",
        type=Path,
        default=DEFAULT_DIFF_DIR,
        help=f"Directory for diff overlays (default: {DEFAULT_DIFF_DIR})",
    )
    parser.add_argument(
        "--write-diff-for-pass",
        action="store_true",
        help="Also write diff overlays for pages that pass.",
    )
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    pages = parse_pages_spec(args.pages)
    if args.threshold < 0:
        raise ValueError("--threshold must be >= 0")

    reference_dir = args.reference_dir or (args.source_root / "images_1920" / "width_1920")
    if not args.rendered_dir.exists():
        raise FileNotFoundError(f"Rendered directory not found: {args.rendered_dir}")
    if not reference_dir.exists():
        raise FileNotFoundError(f"Reference directory not found: {reference_dir}")

    print("=" * 60)
    print("Miftah — Quran.com iOS Pixel Parity Check")
    print(f"Rendered dir:     {args.rendered_dir}")
    print(f"Reference dir:    {reference_dir}")
    print(f"Pages:            {len(pages)} ({pages[0]}..{pages[-1]})")
    print(f"Threshold:        {args.threshold:.6f} ({args.threshold * 100:.3f}%)")
    print("=" * 60)

    results, summary = run_check(
        pages=pages,
        rendered_dir=args.rendered_dir,
        reference_dir=reference_dir,
        threshold=args.threshold,
        diff_dir=args.diff_dir,
        write_diff_for_pass=args.write_diff_for_pass,
    )

    for result in results:
        page = result["page"]
        status = result["status"]
        if status == "ok":
            mismatch_ratio = float(result["mismatch_ratio"]) * 100
            mismatch_pixels = int(result["mismatch_pixels"])
            verdict = "PASS" if result["pass"] else "FAIL"
            print(
                f"[{verdict}] page {page:03d}  mismatch={mismatch_ratio:.6f}% "
                f"({mismatch_pixels} px)"
            )
        else:
            print(f"[FAIL] page {page:03d}  status={status}")

    args.report.parent.mkdir(parents=True, exist_ok=True)
    with open(args.report, "w", encoding="utf-8") as handle:
        json.dump({"summary": summary, "results": results}, handle, indent=2)

    print("-" * 60)
    print(f"Checked:          {summary['pages_checked']} / {summary['pages_requested']}")
    print(f"Exact match:      {summary['pages_exact_match']}")
    print(f"Passed:           {summary['pages_passed']}")
    print(f"Failed:           {summary['pages_failed']}")
    print(f"Avg mismatch:     {summary['avg_mismatch_ratio'] * 100:.6f}%")
    print(f"Max mismatch:     {summary['max_mismatch_ratio'] * 100:.6f}%")
    print(f"Report:           {args.report}")

    return 0 if summary["pages_failed"] == 0 else 1


if __name__ == "__main__":
    sys.exit(main())
