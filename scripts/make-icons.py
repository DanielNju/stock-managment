"""Generates the app icons and store icon from the brand colours. Re-run after changing the look: python3 scripts/make-icons.py"""
from PIL import Image, ImageDraw
import math, os

TOP, BOTTOM = (232, 62, 140), (192, 40, 107)   # #E83E8C -> #C0286B
os.makedirs("public/icons", exist_ok=True); os.makedirs("store", exist_ok=True)

def star(draw, cx, cy, R, k=0.24, fill="white"):
    r = R * k
    pts = [(0, -R), (r, -r), (R, 0), (r, r), (0, R), (-r, r), (-R, 0), (-r, -r)]
    draw.polygon([(cx + x, cy + y) for x, y in pts], fill=fill)

def icon(size, star_scale):
    S = size * 4                                       # draw big, then shrink for smooth edges
    img = Image.new("RGB", (S, S))
    px = img.load()
    for y in range(S):
        for x in range(S):
            t = (x + y) / (2 * S)
            px[x, y] = tuple(round(TOP[i] + (BOTTOM[i] - TOP[i]) * t) for i in range(3))
    d = ImageDraw.Draw(img)
    star(d, S / 2, S / 2, S * star_scale)
    star(d, S * 0.74, S * 0.27, S * star_scale * 0.26, 0.26, (255, 255, 255))
    return img.resize((size, size), Image.LANCZOS)

icon(512, 0.31).save("public/icons/icon-512.png", optimize=True)       # full-bleed: Google Play and Android apply their own shape
icon(192, 0.31).save("public/icons/icon-192.png", optimize=True)
icon(180, 0.31).save("public/icons/apple-touch-icon.png", optimize=True)
icon(512, 0.27).save("public/icons/icon-maskable-512.png", optimize=True)  # artwork kept inside the central safe zone (a circle of 80%)
icon(512, 0.31).save("store/icon-512.png", optimize=True)               # Google Play store icon
for f in ["public/icons/icon-512.png", "store/icon-512.png"]:
    print(f, os.path.getsize(f) // 1024, "KB")
