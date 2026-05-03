"""Détoure un logo (retire le fond clair + ombres connectees) et ajoute un halo blanc.
Usage : python detoure_logo.py <src.png> <out.png> [halo_radius] [halo_strength] [white_threshold]
"""
from PIL import Image, ImageFilter
from collections import deque
import colorsys
import sys

def repaint_red_to_violet(img, target_hex="#a78bfa"):
    """Detecte les pixels 'rouges dominants' et leur applique la teinte violette
    en preservant la luminosite et la saturation (ombres et lumieres de la cape 3D
    restent intactes).
    """
    target = tuple(int(target_hex.lstrip('#')[i:i+2], 16) for i in (0, 2, 4))
    target_h, target_s, target_v = colorsys.rgb_to_hsv(target[0]/255, target[1]/255, target[2]/255)
    img = img.convert("RGBA")
    pixels = img.load()
    w, h = img.size
    for y in range(h):
        for x in range(w):
            r, g, b, a = pixels[x, y]
            if a == 0:
                continue
            hh, ss, vv = colorsys.rgb_to_hsv(r/255, g/255, b/255)
            # Selectionne les vrais rouges via la teinte (HSV) :
            # - rouge pur = teinte autour de 0/360 (donc < 25/360 ou > 335/360)
            # - le jaune est a ~60/360, donc exclu naturellement
            # On exige aussi une saturation minimum pour eviter de toucher les blancs/gris
            hue_deg = hh * 360
            is_red = (hue_deg < 22 or hue_deg > 338) and ss > 0.35 and vv > 0.18
            if is_red:
                new_s = min(1.0, ss * 0.85)
                nr, ng, nb = colorsys.hsv_to_rgb(target_h, new_s, vv)
                pixels[x, y] = (int(nr*255), int(ng*255), int(nb*255), a)
    return img

def remove_white_background(img, threshold=235, soft_zone=20):
    """Flood-fill depuis les 4 coins : retire tout ce qui est clair ET connecte au fond.
    Ca attrape aussi les ombres portees gris clair sans manger l'interieur du logo.
    """
    img = img.convert("RGBA")
    pixels = img.load()
    w, h = img.size
    soft_start = threshold - soft_zone

    # 1. BFS depuis les 4 coins, marquer tout pixel "fond" (clair) connecte
    visited = [[False]*h for _ in range(w)]
    queue = deque()
    for cx, cy in [(0, 0), (w-1, 0), (0, h-1), (w-1, h-1)]:
        queue.append((cx, cy))

    def is_background(px):
        r, g, b, a = px
        return (r + g + b) / 3 >= soft_start

    while queue:
        x, y = queue.popleft()
        if x < 0 or x >= w or y < 0 or y >= h or visited[x][y]:
            continue
        if not is_background(pixels[x, y]):
            continue
        visited[x][y] = True
        queue.append((x+1, y))
        queue.append((x-1, y))
        queue.append((x, y+1))
        queue.append((x, y-1))

    # 2. Pour chaque pixel marque, calculer son alpha selon sa luminosite
    for y in range(h):
        for x in range(w):
            if not visited[x][y]:
                continue
            r, g, b, a = pixels[x, y]
            lightness = (r + g + b) / 3
            if lightness >= threshold:
                pixels[x, y] = (255, 255, 255, 0)
            else:
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

def process(src, out, halo_radius=15, halo_strength=160, threshold=235, pad=30, repaint_violet=False):
    img = Image.open(src)
    print(f"Source: {src} ({img.size}, {img.mode})")
    img = remove_white_background(img, threshold=threshold)
    if repaint_violet:
        img = repaint_red_to_violet(img)
        print("  -> rouge repeint en violet Triskell (#a78bfa)")
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
        repaint_violet = (len(sys.argv) > 6 and sys.argv[6] in ("1", "true", "violet"))
        process(src, out, halo_radius, halo_strength, threshold, repaint_violet=repaint_violet)
