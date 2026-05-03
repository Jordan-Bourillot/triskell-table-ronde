"""Détoure un logo (retire le fond clair) et ajoute un halo blanc.
Usage : python detoure_logo.py <src.png> <out.png> [halo_radius] [halo_strength] [white_threshold]
"""
from PIL import Image, ImageFilter
import sys

def remove_white_background(img, threshold=235, soft_zone=20):
    img = img.convert("RGBA")
    pixels = img.load()
    w, h = img.size
    for y in range(h):
        for x in range(w):
            r, g, b, a = pixels[x, y]
            if r >= threshold and g >= threshold and b >= threshold:
                pixels[x, y] = (255, 255, 255, 0)
            else:
                lightness = (r + g + b) / 3
                soft_start = threshold - soft_zone
                if lightness > soft_start:
                    fade = max(0, int(255 - (lightness - soft_start) * (255 / soft_zone)))
                    pixels[x, y] = (r, g, b, min(a, fade))
    return img

def add_white_halo(img, halo_radius=15, halo_strength=160):
    alpha = img.split()[3]
    blurred = alpha.filter(ImageFilter.GaussianBlur(radius=halo_radius))
    halo = Image.new("RGBA", img.size, (255, 255, 255, 0))
    halo_alpha = blurred.point(lambda p: min(halo_strength, p))
    halo.putalpha(halo_alpha)
    return Image.alpha_composite(halo, img)

def process(src, out, halo_radius=15, halo_strength=160, threshold=235, pad=30):
    img = Image.open(src)
    print(f"Source: {src} ({img.size}, {img.mode})")
    img = remove_white_background(img, threshold=threshold)
    img = add_white_halo(img, halo_radius=halo_radius, halo_strength=halo_strength)
    if pad > 0:
        final = Image.new("RGBA", (img.width + pad*2, img.height + pad*2), (0, 0, 0, 0))
        final.paste(img, (pad, pad), img)
    else:
        final = img
    final.save(out, "PNG")
    print(f"Saved: {out} ({final.size})")

if __name__ == "__main__":
    if len(sys.argv) < 3:
        # Mode par defaut : logo Stripe Suite des Heros
        SRC = r"C:\Users\jorda\OneDrive\Bureau\Triskell Studio\Triskell 4 - Suite des Heros\landing-pack\public\img\suite-des-heros-logo.png"
        OUT = r"C:\Users\jorda\OneDrive\Bureau\Triskell Studio\Triskell 4 - Suite des Heros\landing-pack\public\img\suite-des-heros-logo-halo.png"
        process(SRC, OUT)
    else:
        src = sys.argv[1]
        out = sys.argv[2]
        halo_radius = int(sys.argv[3]) if len(sys.argv) > 3 else 15
        halo_strength = int(sys.argv[4]) if len(sys.argv) > 4 else 160
        threshold = int(sys.argv[5]) if len(sys.argv) > 5 else 235
        process(src, out, halo_radius, halo_strength, threshold)
