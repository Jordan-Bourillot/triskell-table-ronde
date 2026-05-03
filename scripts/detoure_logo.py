"""Détoure le logo Suite des Heros (retire le fond clair) et ajoute un halo blanc."""
from PIL import Image, ImageFilter, ImageChops
import os

SRC = r"C:\Users\jorda\OneDrive\Bureau\Triskell Studio\Triskell 4 - Suite des Heros\landing-pack\public\img\suite-des-heros-logo.png"
OUT = r"C:\Users\jorda\OneDrive\Bureau\Triskell Studio\Triskell 4 - Suite des Heros\landing-pack\public\img\suite-des-heros-logo-halo.png"

# Tolerance: tout pixel "presque blanc" (>= seuil sur R, G, B) devient transparent.
WHITE_THRESHOLD = 235

def remove_white_background(img):
    img = img.convert("RGBA")
    pixels = img.load()
    w, h = img.size
    for y in range(h):
        for x in range(w):
            r, g, b, a = pixels[x, y]
            if r >= WHITE_THRESHOLD and g >= WHITE_THRESHOLD and b >= WHITE_THRESHOLD:
                pixels[x, y] = (255, 255, 255, 0)
            else:
                # Anti-aliasing soft : reduit l'alpha sur les pixels presque blancs
                lightness = (r + g + b) / 3
                if lightness > 215:
                    fade = max(0, int(255 - (lightness - 215) * 6))
                    pixels[x, y] = (r, g, b, min(a, fade))
    return img

def add_white_halo(img, halo_radius=12, halo_strength=180):
    """Ajoute un halo blanc autour des zones non transparentes."""
    # Recupere le canal alpha
    alpha = img.split()[3]
    # Flou pour creer le halo
    blurred = alpha.filter(ImageFilter.GaussianBlur(radius=halo_radius))
    # Creer une image blanche de la taille du logo, modulee par le flou
    halo = Image.new("RGBA", img.size, (255, 255, 255, 0))
    halo_alpha = blurred.point(lambda p: min(halo_strength, p))
    halo.putalpha(halo_alpha)
    # Compose : halo en dessous, logo au dessus
    result = Image.alpha_composite(halo, img)
    return result

def main():
    img = Image.open(SRC)
    print(f"Source: {SRC} ({img.size}, {img.mode})")
    img = remove_white_background(img)
    img = add_white_halo(img, halo_radius=15, halo_strength=160)
    # Padding pour que le halo ne soit pas coupe au bord
    pad = 30
    final = Image.new("RGBA", (img.width + pad*2, img.height + pad*2), (0, 0, 0, 0))
    final.paste(img, (pad, pad), img)
    final.save(OUT, "PNG")
    print(f"Saved: {OUT} ({final.size})")

if __name__ == "__main__":
    main()
