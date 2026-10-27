# Regenerates the app icons: wine S + dot on powder blue.
from PIL import Image, ImageDraw, ImageFont
import glob
BG, FG = "#9DB3D3", "#3F1521"
font_path = (glob.glob("/usr/share/fonts/opentype/inter/Inter-Bold.otf") + glob.glob("/usr/share/fonts/**/Inter*Bold*.ttf", recursive=True))[0]

def icon(size, scale=1.0):
    im = Image.new("RGB", (size, size), BG)
    d = ImageDraw.Draw(im)
    f = ImageFont.truetype(font_path, int(size * 0.72 * scale))
    l, t, r, b = d.textbbox((0, 0), "S", font=f)
    w, h = r - l, b - t
    x = (size - w) / 2 - l - size * 0.04 * scale
    y = (size - h) / 2 - t + size * 0.02 * scale
    d.text((x, y), "S", font=f, fill=FG)
    rad = size * 0.058 * scale
    cx, cy = x + l + w + size * 0.07 * scale, y + t + rad
    d.ellipse([cx - rad, cy - rad, cx + rad, cy + rad], fill=FG)
    return im

for name, size, scale in (("icon-192.png", 192, 1), ("icon-512.png", 512, 1), ("apple-touch-icon.png", 180, 1), ("icon-maskable-512.png", 512, 0.8)):
    icon(size, scale).save("public/" + name)
