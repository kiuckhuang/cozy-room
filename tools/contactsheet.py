#!/usr/bin/env python3
"""Compose a contact sheet from a directory of screenshots.

Usage:
  python3 tools/contactsheet.py <dir> <out.png> [name ...]

Requires Pillow: pip install pillow

If names are omitted, every *.png in <dir> is included in sorted order.
Each tile is scaled to 480x270 with a caption bar; layout is 2 columns.
"""
import glob
import os
import sys

from PIL import Image, ImageDraw, ImageFont

TILE_W, TILE_H = 480, 270
CAP_H = 24
GAP = 10
COLS = 2
BG = (27, 24, 48)
FG = (244, 236, 255)
ACCENT = (247, 184, 204)

FONT_PATHS = [
    "/usr/share/fonts/liberation-sans/LiberationSans-Bold.ttf",
    "/usr/share/fonts/google-noto-vf/NotoSans[wght].ttf",
]


def load_font(size):
    for p in FONT_PATHS:
        if os.path.exists(p):
            try:
                return ImageFont.truetype(p, size)
            except OSError:
                continue
    return ImageFont.load_default()


def main():
    if len(sys.argv) < 3:
        print(__doc__)
        return 2
    src, out = sys.argv[1], sys.argv[2]
    names = sys.argv[3:]
    if names:
        files = [os.path.join(src, n if n.endswith(".png") else n + ".png") for n in names]
    else:
        files = sorted(glob.glob(os.path.join(src, "*.png")))
    files = [f for f in files if os.path.exists(f)]
    if not files:
        print("contactsheet: no images in", src)
        return 1

    font = load_font(15)
    rows = (len(files) + COLS - 1) // COLS
    width = COLS * TILE_W + (COLS + 1) * GAP
    height = rows * (TILE_H + CAP_H) + (rows + 1) * GAP
    sheet = Image.new("RGB", (width, height), BG)
    draw = ImageDraw.Draw(sheet)

    for i, f in enumerate(files):
        r, c = divmod(i, COLS)
        x = GAP + c * (TILE_W + GAP)
        y = GAP + r * (TILE_H + CAP_H + GAP)
        try:
            im = Image.open(f).convert("RGB")
        except Exception as exc:  # noqa: BLE001
            print("contactsheet: skip", f, exc)
            continue
        im = im.resize((TILE_W, TILE_H), Image.LANCZOS)
        sheet.paste(im, (x, y))
        draw.rectangle([x, y + TILE_H, x + TILE_W, y + TILE_H + CAP_H], fill=(16, 14, 30))
        label = os.path.splitext(os.path.basename(f))[0]
        draw.text((x + 8, y + TILE_H + 4), label, font=font, fill=FG)
        # accent dot
        draw.ellipse([x + TILE_W - 16, y + TILE_H + 9, x + TILE_W - 8, y + TILE_H + 17], fill=ACCENT)
        draw.rectangle([x, y, x + TILE_W - 1, y + TILE_H - 1], outline=(70, 60, 100))

    os.makedirs(os.path.dirname(out) or ".", exist_ok=True)
    sheet.save(out)
    print("contactsheet:", out, sheet.size, len(files), "tiles")
    return 0


if __name__ == "__main__":
    sys.exit(main())
