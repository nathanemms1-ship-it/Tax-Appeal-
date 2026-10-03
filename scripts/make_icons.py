#!/usr/bin/env python3
"""
Regenerate the TaxAppeal USA icon set from ONE definition of the mark.

    python3 scripts/make_icons.py

The shape is the shape components/LogoMark.js draws, in the same 24-unit box:
a solid house, roof apex on the centre line, eaves overhanging the body, door
knocked out of the body in the ground colour.

WHY THIS SCRIPT EXISTS AT ALL
-----------------------------
The icons shipped on 1 Aug 2026 already had this shape. Nobody had to design
a mark on 3 Oct -- the brand had one, and it was sitting in public/ the whole
time. It was drawn over twice as a white stroked outline because nobody
opened the file, which is also why the nav lost its only gold element.

What those icons did NOT have was the palette. They were cut before
lib/theme.js existed, so their gold is #C9A84C where C.gold is #FFC940. That
left two bad options: let the tab disagree with the nav, or hard-code a stale
hex into the one component that renders on every page -- two days after
collapsing 24 drifted palettes into one file.

So the colours are READ OUT of lib/theme.js here, and scripts/verify-theme.mjs
reads them back OUT of the generated PNGs. The mark agrees with the palette by
construction, and the build fails if that stops being true.

WHY A COVERAGE MASK, AND NOT ANTIALIASING
-----------------------------------------
First attempt supersampled and let LANCZOS antialias. Files came out 4x the
size of the originals and the 16px one was blurrier -- the size that matters
most, because it is the one in the tab.

Second attempt supersampled and snapped each pixel to the nearer of the two
colours. That tore holes in the 32px roof: a pixel that is half gold and half
navy sits almost equidistant from both in RGB, so the seam where the roof
meets the body fell to whichever side rounding happened to pick.

This renders the gold as a COVERAGE MASK and thresholds the coverage, which
is a decision about geometry rather than about colour and cannot punch a hole
in a shape that is solid. Output is a hard-edged two-colour file the size of
the originals, and the door survives at 16px, which it does not today.
"""
import re
import pathlib
from PIL import Image, ImageDraw

ROOT = pathlib.Path(__file__).resolve().parent.parent
theme = (ROOT / "lib" / "theme.js").read_text(encoding="utf-8")


def token(name):
    m = re.search(r'^\s*' + name + r':\s*"(#[0-9A-Fa-f]{6})"', theme, re.M)
    if not m:
        raise SystemExit("lib/theme.js has no " + name + " token")
    return tuple(bytes.fromhex(m.group(1)[1:]))


NAVY, GOLD = token("navy"), token("gold")
print("navy #%02X%02X%02X   gold #%02X%02X%02X" % (NAVY + GOLD))

SS = 16         # supersample factor for the coverage masks
RADIUS = 0.17   # measured off the 1 Aug apple-touch-icon.png

# The mark, in the 24-unit box. KEEP IN STEP WITH components/LogoMark.js.
ROOF = [(12, 3.2), (1.9, 11.6), (22.1, 11.6)]
BODY = (4.2, 11.0, 19.8, 20.8)   # top is 11.0, not 11.6: it OVERLAPS the roof
DOOR = (9.6, 16.2, 14.4, 20.8)   # so the two never leave a seam to fall through


def mask(px, paint):
    """Draw at SS, box-downscale to px, threshold coverage at half a pixel."""
    n = px * SS
    m = Image.new("L", (n, n), 0)
    paint(ImageDraw.Draw(m), n / 24.0, n)
    return m.resize((px, px), Image.BOX).point(lambda v: 255 if v >= 128 else 0)


def draw(px):
    square = mask(px, lambda d, k, n: d.rounded_rectangle(
        [0, 0, n - 1, n - 1], radius=RADIUS * n, fill=255))

    def house(d, k, _n):
        d.polygon([(x * k, y * k) for x, y in ROOF], fill=255)
        d.rectangle([v * k for v in BODY], fill=255)
        d.rectangle([v * k for v in DOOR], fill=0)   # the door is a hole
    gold = mask(px, house)

    im = Image.new("RGBA", (px, px), NAVY + (255,))
    im.paste(Image.new("RGBA", (px, px), GOLD + (255,)), (0, 0), gold)
    im.putalpha(square)
    return im


out = ROOT / "public"
for px, name in [(180, "apple-touch-icon.png"),
                 (32, "favicon-32x32.png"),
                 (16, "favicon-16x16.png")]:
    draw(px).save(out / name, optimize=True)
    print("wrote", name)

draw(32).save(out / "favicon.ico", sizes=[(16, 16), (32, 32)])
print("wrote favicon.ico")
