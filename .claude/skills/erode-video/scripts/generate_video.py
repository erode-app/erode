#!/usr/bin/env python3
"""
Erode product pitch video generator.

Creates an MP4 from a folder of screenshots with text overlays,
Ken Burns zoom, smooth transitions, and branded intro/outro.

Usage:
    python generate_video.py --input-dir ./screenshots

Requires: pillow, ffmpeg
"""

import argparse
import json
import os
import shutil
import subprocess
import sys
import tempfile

from PIL import Image, ImageDraw, ImageFilter, ImageFont

# ── Defaults ──────────────────────────────────────────────────────────────────

DEFAULT_CONFIG = {
    "intro": {
        "title": "erode",
        "tagline": "Detect architectural drift before it ships",
        "duration_sec": 2.5,
    },
    "slides": [],
    "outro": {
        "headline": "Stop drift. Ship with confidence.",
        "url": "erode.dev",
        "tags": "Open source \u2022 Architecture as Code \u2022 LikeC4",
        "duration_sec": 3.0,
    },
    "settings": {
        "width": 1920,
        "height": 1080,
        "fps": 30,
        "transition_sec": 0.6,
        "crf": 23,
    },
}

BG_COLOR = (13, 13, 20)


# ── Font resolution ───────────────────────────────────────────────────────────


def find_font(style="Bold"):
    """Try Poppins first, fall back to Arial/DejaVu Sans, then default."""
    candidates = [
        # macOS - Poppins via Homebrew google-fonts cask
        f"/Users/Shared/SystemFonts/Poppins-{style}.ttf",
        os.path.expanduser(f"~/Library/Fonts/Poppins-{style}.ttf"),
        # macOS - Arial
        f"/System/Library/Fonts/Supplemental/Arial {style}.ttf",
        f"/Library/Fonts/Arial {style}.ttf",
        # macOS - Arial fallback (no style variant)
        "/System/Library/Fonts/Supplemental/Arial.ttf",
        "/Library/Fonts/Arial.ttf",
        # Linux
        f"/usr/share/fonts/truetype/google-fonts/Poppins-{style}.ttf",
        f"/usr/share/fonts/truetype/dejavu/DejaVuSans-{style}.ttf",
        "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
    ]
    for path in candidates:
        if os.path.exists(path):
            return path
    return None


FONT_BOLD = find_font("Bold")
FONT_MEDIUM = find_font("Medium") or find_font("Bold")
FONT_REGULAR = find_font("Regular") or find_font("Bold")


def load_font(path, size):
    if path:
        return ImageFont.truetype(path, size)
    return ImageFont.load_default()


# ── Color helpers ─────────────────────────────────────────────────────────────


def hex_to_rgb(hex_str):
    """Convert '#FF6B35' to (255, 107, 53)."""
    hex_str = hex_str.lstrip("#")
    return tuple(int(hex_str[i : i + 2], 16) for i in (0, 2, 4))


DEFAULT_ACCENTS = [
    (255, 107, 53),  # Orange-red
    (0, 209, 178),  # Teal
    (138, 92, 246),  # Purple
    (255, 200, 55),  # Yellow
]


# ── Easing ────────────────────────────────────────────────────────────────────


def ease_out_cubic(t):
    return 1 - (1 - t) ** 3


def ease_out_back(t):
    c1 = 1.70158
    c3 = c1 + 1
    return 1 + c3 * (t - 1) ** 3 + c1 * (t - 1) ** 2


# ── Drawing helpers ───────────────────────────────────────────────────────────


def draw_gradient_bg(draw, w, h):
    for y in range(h):
        t = y / h
        r = int(13 + (20 - 13) * t)
        g = int(13 + (15 - 13) * t)
        b = int(20 + (35 - 20) * t)
        draw.line([(0, y), (w, y)], fill=(r, g, b))


def draw_glow_circle(img, cx, cy, radius, color, alpha=20):
    overlay = Image.new("RGBA", img.size, (0, 0, 0, 0))
    d = ImageDraw.Draw(overlay)
    for r in range(radius, 0, -4):
        a = int(alpha * (r / radius) ** 0.5)
        c = (*color, a)
        d.ellipse([cx - r, cy - r, cx + r, cy + r], fill=c)
    overlay_blurred = overlay.filter(ImageFilter.GaussianBlur(radius=20))
    composited = Image.alpha_composite(img.convert("RGBA"), overlay_blurred)
    return composited.convert("RGB")


def create_bg(w, h, accent):
    img = Image.new("RGB", (w, h), BG_COLOR)
    draw = ImageDraw.Draw(img)
    draw_gradient_bg(draw, w, h)
    img = draw_glow_circle(img, 200, 200, 300, accent, alpha=20)
    img = draw_glow_circle(img, w - 250, h - 200, 250, accent, alpha=15)
    return img


def draw_accent_bar(draw, x, y, width, height, color):
    if width > 0:
        draw.rounded_rectangle([x, y, x + width, y + height], radius=height // 2, fill=color)


def fit_screenshot(img_path, max_w, max_h):
    """Load screenshot, resize to fit, add drop shadow."""
    img = Image.open(img_path).convert("RGBA")
    ratio = min(max_w / img.width, max_h / img.height)
    new_w = int(img.width * ratio)
    new_h = int(img.height * ratio)
    img = img.resize((new_w, new_h), Image.LANCZOS)

    pad = 12
    shadow = Image.new("RGBA", (new_w + pad * 2 + 20, new_h + pad * 2 + 20), (0, 0, 0, 0))
    sd = ImageDraw.Draw(shadow)
    sd.rounded_rectangle(
        [pad, pad, new_w + pad + 20, new_h + pad + 20],
        radius=16,
        fill=(0, 0, 0, 100),
    )
    shadow = shadow.filter(ImageFilter.GaussianBlur(radius=15))
    shadow.paste(img, (10, 10), img)
    return shadow


def draw_step_dots(draw, current, total, accent, y, canvas_w):
    dot_r = 6
    spacing = 30
    total_w = (total - 1) * spacing
    sx = canvas_w // 2 - total_w // 2
    for i in range(total):
        cx = sx + i * spacing
        if i == current:
            draw.ellipse([cx - dot_r, y - dot_r, cx + dot_r, y + dot_r], fill=accent)
        else:
            draw.ellipse(
                [cx - dot_r + 2, y - dot_r + 2, cx + dot_r - 2, y + dot_r - 2],
                fill=(80, 80, 100),
            )


# ── Frame generation ──────────────────────────────────────────────────────────


def generate_frames(config, input_dir, frames_dir):
    """Generate all video frames and return total count."""

    settings = config["settings"]
    W = settings["width"]
    H = settings["height"]
    FPS = settings["fps"]
    intro_cfg = config["intro"]
    outro_cfg = config["outro"]
    slides = config["slides"]

    frame_num = 0

    def save(img):
        nonlocal frame_num
        img.save(os.path.join(frames_dir, f"frame_{frame_num:05d}.png"))
        frame_num += 1

    # ── Intro ──
    print("  Generating intro...")
    font_logo = load_font(FONT_BOLD, 96)
    font_tagline = load_font(FONT_MEDIUM, 40)
    intro_accent = hex_to_rgb(slides[0]["accent"]) if slides else DEFAULT_ACCENTS[1]

    intro_frames = int(intro_cfg["duration_sec"] * FPS)
    for i in range(intro_frames):
        t = i / max(intro_frames - 1, 1)
        img = create_bg(W, H, intro_accent)
        draw = ImageDraw.Draw(img, "RGBA")

        logo_t = ease_out_back(min(t * 2, 1.0))
        alpha = int(255 * min(t * 3, 1.0))

        text = intro_cfg["title"]
        bbox = draw.textbbox((0, 0), text, font=font_logo)
        tw = bbox[2] - bbox[0]
        tx = W // 2 - tw // 2
        ty = int(H // 2 - 80 + (1 - logo_t) * 50)
        draw.text((tx, ty), text, font=font_logo, fill=(255, 255, 255, alpha))

        bar_w = int(tw * 0.6 * logo_t)
        draw_accent_bar(draw, W // 2 - bar_w // 2, ty + 110, bar_w, 6, intro_accent)

        if t > 0.4:
            tag_alpha = int(255 * min((t - 0.4) * 3, 1.0))
            tagline = intro_cfg["tagline"]
            tbbox = draw.textbbox((0, 0), tagline, font=font_tagline)
            ttw = tbbox[2] - tbbox[0]
            draw.text(
                (W // 2 - ttw // 2, ty + 140),
                tagline,
                font=font_tagline,
                fill=(180, 180, 200, tag_alpha),
            )

        save(img)

    # ── Slides ──
    font_title = load_font(FONT_BOLD, 72)
    font_sub = load_font(FONT_REGULAR, 38)
    font_step = load_font(FONT_BOLD, 30)

    for idx, slide in enumerate(slides):
        print(f"  Generating slide {idx + 1}/{len(slides)}: {slide['title']}")
        accent = hex_to_rgb(slide["accent"])

        img_path = os.path.join(input_dir, slide["image"])
        if not os.path.exists(img_path):
            print(f"    WARNING: {img_path} not found, skipping")
            continue

        screenshot = fit_screenshot(img_path, W - 200, H - 380)
        sc_w, sc_h = screenshot.size
        slide_frames = int(slide["duration_sec"] * FPS)

        for i in range(slide_frames):
            t = i / max(slide_frames - 1, 1)
            img = create_bg(W, H, accent)
            draw = ImageDraw.Draw(img, "RGBA")

            entry_t = ease_out_cubic(min(t * 3, 1.0))
            exit_t = ease_out_cubic(max((t - 0.85) / 0.15, 0.0)) if t > 0.85 else 0.0
            alpha = int(255 * entry_t * (1 - exit_t))

            # Step label
            step_label = f"STEP {idx + 1} of {len(slides)}"
            step_y = int(40 + (1 - entry_t) * 20)
            draw.text((60, step_y), step_label, font=font_step, fill=(*accent, alpha))

            # Title
            title_y = int(85 + (1 - entry_t) * 30)
            draw.text(
                (60, title_y),
                slide["title"],
                font=font_title,
                fill=(255, 255, 255, alpha),
            )

            # Accent bar
            bar_w = int(80 * entry_t)
            draw_accent_bar(draw, 60, title_y + 86, bar_w, 4, (*accent, alpha))

            # Subtitle
            sub_y = int(190 + (1 - entry_t) * 30)
            draw.text(
                (60, sub_y),
                slide["subtitle"],
                font=font_sub,
                fill=(170, 170, 190, alpha),
            )

            # Screenshot with Ken Burns
            zoom = 1.0 + t * 0.03
            zw = int(sc_w * zoom)
            zh = int(sc_h * zoom)
            zoomed = screenshot.resize((zw, zh), Image.LANCZOS)
            cx = (zw - sc_w) // 2
            cy = (zh - sc_h) // 2
            cropped = zoomed.crop((cx, cy, cx + sc_w, cy + sc_h))

            sc_x = (W - sc_w) // 2
            sc_y = int(260 + (1 - entry_t) * 40)

            if alpha < 255:
                faded = cropped.copy()
                r, g, b, a = faded.split()
                a = a.point(lambda x, _alpha=alpha: int(x * _alpha / 255))
                faded = Image.merge("RGBA", (r, g, b, a))
                img.paste(faded, (sc_x, sc_y), faded)
            else:
                img.paste(cropped, (sc_x, sc_y), cropped)

            draw_step_dots(draw, idx, len(slides), accent, H - 30, W)
            save(img)

    # ── Outro ──
    print("  Generating outro...")
    font_cta = load_font(FONT_BOLD, 72)
    font_url = load_font(FONT_MEDIUM, 44)
    font_tags = load_font(FONT_REGULAR, 28)
    outro_accent = (0, 209, 178)

    outro_frames = int(outro_cfg["duration_sec"] * FPS)
    for i in range(outro_frames):
        t = i / max(outro_frames - 1, 1)
        img = create_bg(W, H, outro_accent)
        draw = ImageDraw.Draw(img, "RGBA")

        entry_t = ease_out_back(min(t * 2.5, 1.0))
        alpha = int(255 * min(t * 4, 1.0))

        cta = outro_cfg["headline"]
        bbox = draw.textbbox((0, 0), cta, font=font_cta)
        tw = bbox[2] - bbox[0]
        ty = int(H // 2 - 100 + (1 - entry_t) * 40)
        draw.text((W // 2 - tw // 2, ty), cta, font=font_cta, fill=(255, 255, 255, alpha))

        if t > 0.3:
            url_alpha = int(255 * min((t - 0.3) * 4, 1.0))
            url = outro_cfg["url"]
            ubbox = draw.textbbox((0, 0), url, font=font_url)
            uw = ubbox[2] - ubbox[0]
            uy = ty + 110
            draw.text(
                (W // 2 - uw // 2, uy),
                url,
                font=font_url,
                fill=(*outro_accent, url_alpha),
            )
            bw = int(uw * min((t - 0.3) * 3, 1.0))
            draw_accent_bar(draw, W // 2 - bw // 2, uy + 60, bw, 4, (*outro_accent, url_alpha))

        if t > 0.5:
            os_alpha = int(255 * min((t - 0.5) * 4, 1.0))
            tags = outro_cfg["tags"]
            osbbox = draw.textbbox((0, 0), tags, font=font_tags)
            osw = osbbox[2] - osbbox[0]
            draw.text(
                (W // 2 - osw // 2, ty + 200),
                tags,
                font=font_tags,
                fill=(150, 150, 170, os_alpha),
            )

        save(img)

    return frame_num


# ── Encoding ──────────────────────────────────────────────────────────────────


def encode_video(frames_dir, output_path, fps, crf):
    """Encode frames to MP4 using ffmpeg."""
    print(f"  Encoding to {output_path}...")
    cmd = [
        "ffmpeg",
        "-y",
        "-framerate",
        str(fps),
        "-i",
        os.path.join(frames_dir, "frame_%05d.png"),
        "-c:v",
        "libx264",
        "-pix_fmt",
        "yuv420p",
        "-crf",
        str(crf),
        "-preset",
        "fast",
        output_path,
    ]
    result = subprocess.run(cmd, capture_output=True, text=True)
    if result.returncode != 0:
        print(f"  FFmpeg error:\n{result.stderr[-500:]}", file=sys.stderr)
        sys.exit(1)

    size_mb = os.path.getsize(output_path) / (1024 * 1024)
    print(f"  Done! {output_path} ({size_mb:.1f} MB)")


def encode_gif(frames_dir, output_path, fps):
    """Encode frames to GIF using ffmpeg two-pass palette approach."""
    print(f"  Encoding to {output_path}...")
    palette_path = os.path.join(frames_dir, "palette.png")
    frame_pattern = os.path.join(frames_dir, "frame_%05d.png")
    vf = "fps=12,scale=960:-1:flags=lanczos"

    # Pass 1: generate optimal palette
    cmd_palette = [
        "ffmpeg",
        "-y",
        "-framerate",
        str(fps),
        "-i",
        frame_pattern,
        "-vf",
        f"{vf},palettegen=stats_mode=diff",
        palette_path,
    ]
    result = subprocess.run(cmd_palette, capture_output=True, text=True)
    if result.returncode != 0:
        print(f"  FFmpeg palette error:\n{result.stderr[-500:]}", file=sys.stderr)
        sys.exit(1)

    # Pass 2: encode GIF using the palette
    cmd_gif = [
        "ffmpeg",
        "-y",
        "-framerate",
        str(fps),
        "-i",
        frame_pattern,
        "-i",
        palette_path,
        "-lavfi",
        f"{vf}[x];[x][1:v]paletteuse=dither=sierra2_4a",
        output_path,
    ]
    result = subprocess.run(cmd_gif, capture_output=True, text=True)
    if result.returncode != 0:
        print(f"  FFmpeg GIF error:\n{result.stderr[-500:]}", file=sys.stderr)
        sys.exit(1)

    size_mb = os.path.getsize(output_path) / (1024 * 1024)
    print(f"  Done! {output_path} ({size_mb:.1f} MB)")


# ── Main ──────────────────────────────────────────────────────────────────────


def main():
    parser = argparse.ArgumentParser(
        description="Generate Erode product pitch video from screenshots."
    )
    parser.add_argument(
        "--input-dir",
        default="./screenshots",
        help="Folder with screenshots and video_config.json (default: ./screenshots)",
    )
    parser.add_argument(
        "--output",
        default="packages/web/public/videos/erode_pitch.mp4",
        help="Output video file path (default: packages/web/public/videos/erode_pitch.mp4)",
    )
    parser.add_argument(
        "--config",
        default="video_config.json",
        help="Config filename inside input-dir (default: video_config.json)",
    )
    parser.add_argument("--width", type=int, default=None, help="Video width")
    parser.add_argument("--height", type=int, default=None, help="Video height")
    parser.add_argument("--fps", type=int, default=None, help="Frames per second")
    parser.add_argument("--crf", type=int, default=None, help="FFmpeg CRF quality (lower=better)")
    parser.add_argument(
        "--output-gif",
        default=None,
        help="Output GIF file path (default: same as --output with .gif extension)",
    )
    args = parser.parse_args()

    # Load config
    config_path = os.path.join(args.input_dir, args.config)
    if os.path.exists(config_path):
        with open(config_path) as f:
            config = json.load(f)
        # Merge with defaults
        for key in DEFAULT_CONFIG:
            if key not in config:
                config[key] = DEFAULT_CONFIG[key]
        if "settings" not in config:
            config["settings"] = {}
        for k, v in DEFAULT_CONFIG["settings"].items():
            config["settings"].setdefault(k, v)
    else:
        print(f"  No config found at {config_path}, using defaults.")
        print(f"  Scanning {args.input_dir} for images...")
        config = dict(DEFAULT_CONFIG)
        # Auto-discover images
        exts = {".png", ".jpg", ".jpeg", ".webp"}
        images = sorted(
            f for f in os.listdir(args.input_dir) if os.path.splitext(f)[1].lower() in exts
        )
        config["slides"] = [
            {
                "image": img,
                "title": os.path.splitext(img)[0].replace("_", " ").replace("-", " ").title(),
                "subtitle": "",
                "accent": "#{:02X}{:02X}{:02X}".format(*DEFAULT_ACCENTS[i % len(DEFAULT_ACCENTS)]),
                "duration_sec": 4.0,
            }
            for i, img in enumerate(images)
        ]

    # CLI overrides
    if args.width:
        config["settings"]["width"] = args.width
    if args.height:
        config["settings"]["height"] = args.height
    if args.fps:
        config["settings"]["fps"] = args.fps
    if args.crf:
        config["settings"]["crf"] = args.crf

    if not config["slides"]:
        print("ERROR: No slides configured and no images found.", file=sys.stderr)
        sys.exit(1)

    # Validate images exist
    for slide in config["slides"]:
        p = os.path.join(args.input_dir, slide["image"])
        if not os.path.exists(p):
            print(f"  WARNING: Image not found: {p}")

    settings = config["settings"]
    total_sec = (
        config["intro"]["duration_sec"]
        + sum(s["duration_sec"] for s in config["slides"])
        + config["outro"]["duration_sec"]
    )
    print("Erode Video Generator")
    print(f"  Resolution: {settings['width']}x{settings['height']} @ {settings['fps']}fps")
    print(f"  Slides: {len(config['slides'])}")
    print(f"  Duration: ~{total_sec:.1f}s")
    print()

    # Resolve output paths
    gif_path = args.output_gif
    if gif_path is None:
        base, _ = os.path.splitext(args.output)
        gif_path = base + ".gif"

    # Ensure output directories exist
    for path in (args.output, gif_path):
        d = os.path.dirname(path)
        if d:
            os.makedirs(d, exist_ok=True)

    # Generate frames in temp dir, then encode both formats
    frames_dir = tempfile.mkdtemp(prefix="erode_frames_")
    try:
        total_frames = generate_frames(config, args.input_dir, frames_dir)
        print(f"  Generated {total_frames} frames")
        encode_video(frames_dir, args.output, settings["fps"], settings["crf"])
        encode_gif(frames_dir, gif_path, settings["fps"])
    finally:
        shutil.rmtree(frames_dir, ignore_errors=True)


if __name__ == "__main__":
    main()
