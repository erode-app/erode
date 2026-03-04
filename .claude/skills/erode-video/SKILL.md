---
name: erode-video
description: Generate product pitch videos for the Erode project from screenshots. Use this skill whenever the user wants to create, update, or regenerate the product demo video, landing page animation, or pitch clip for erode.dev or the GitHub repo. Also trigger when the user mentions "product video", "demo video", "pitch video", "update the video", "regenerate video", or "landing page animation" in the context of Erode.
---

# Erode Video Generator

Generates an MP4 video and an optimized GIF from a folder of screenshots. The video includes animated text overlays, Ken Burns zoom effects, smooth transitions, step indicators, and an intro/outro with Erode branding. The GIF is half-resolution (960px wide) at 12 fps for README embeds and social previews.

## Quick Start

```bash
pip install pillow
python scripts/generate_video.py --input-dir ./screenshots
```

## Dependencies

- Python 3.8+
- Pillow (`pip install pillow`)
- FFmpeg (must be on PATH)
- Poppins font family (falls back to DejaVu Sans Bold if unavailable)

## Input Directory Structure

```
screenshots/
├── video_config.json     # Slide order, titles, subtitles, timing
├── 01_pr_opened.png      # Screenshots named however you like
├── 02_drift_detected.png
└── 04_model_update.png
```

Filenames don't matter for ordering — that comes from `video_config.json`.

## Configuration

Create a `video_config.json` in your screenshots folder. Here's the full schema with defaults:

```json
{
  "intro": {
    "title": "erode",
    "tagline": "See the architectural diff, not just the code diff",
    "duration_sec": 2.5
  },
  "slides": [
    {
      "image": "01_pr_opened.png",
      "title": "A developer opens a pull request",
      "subtitle": "Erode filters the diff and starts its analysis pipeline",
      "accent": "#FF6B35",
      "duration_sec": 4.0
    }
  ],
  "outro": {
    "headline": "Shared understanding that keeps pace with the code.",
    "url": "erode.dev",
    "tags": "Open source • Architecture as Code • LikeC4 • Structurizr",
    "duration_sec": 3.0
  },
  "settings": {
    "width": 1920,
    "height": 1080,
    "fps": 30,
    "transition_sec": 0.6,
    "crf": 23
  }
}
```

Each slide has:

- `image` — filename relative to the input directory
- `title` — bold heading shown above the screenshot
- `subtitle` — smaller text below the title
- `accent` — hex color for the step label, underline bar, and step dot
- `duration_sec` — how long the slide stays on screen

## CLI Arguments

| Argument       | Default                                      | Description                                    |
| -------------- | -------------------------------------------- | ---------------------------------------------- |
| `--input-dir`  | `./screenshots`                              | Folder containing screenshots + config         |
| `--output`     | `packages/web/public/videos/erode_pitch.mp4` | Output MP4 video path (directory auto-created) |
| `--output-gif` | same as `--output` with `.gif` extension     | Output GIF path                                |
| `--config`     | `video_config.json`                          | Config filename inside input-dir               |
| `--width`      | from config or 1920                          | Video width                                    |
| `--height`     | from config or 1080                          | Video height                                   |
| `--fps`        | from config or 30                            | Frames per second                              |
| `--crf`        | from config or 23                            | FFmpeg quality (lower = better, 18-28 range)   |

## Screenshot Editing Tips

Before generating, crop/trim screenshots for a cleaner result:

- **Crop browser chrome** — remove URL bar, tabs, window decorations
- **Focus on the key area** — just the PR comment, terminal output, or diff
- **Consistent sizes** — the script handles mixed sizes, but similar ratios look best
- **Resolution** — aim for 1400px+ wide for crisp 1080p output

Quick crops with ImageMagick:

```bash
# Remove 100px from top (browser chrome)
convert input.png -gravity North -chop 0x100 cropped.png

# Resize to max 1800px wide
convert input.png -resize 1800x resized.png
```

## Updating the Video

When screenshots change:

1. Replace the screenshot files
2. Update `video_config.json` titles/subtitles if needed
3. Re-run the script

Same inputs always produce the same output — fully deterministic and CI-friendly.

## GitHub Actions Example

```yaml
- name: Generate demo video
  run: |
    pip install pillow
    python .claude/skills/erode-video/scripts/generate_video.py \
      --input-dir .claude/skills/erode-video/screenshots
```
