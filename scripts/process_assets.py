import os
import shutil
from PIL import Image
import numpy as np
from collections import deque
import json

UPLOAD_DIR = "/home/teera/.gemini/antigravity-ide/brain/8007d00f-86b0-4c39-b48e-f9d67b30b469/.user_uploaded"
MAP_SRC = os.path.join(UPLOAD_DIR, "media_1790058135483.png")
SPRITE_SRC = os.path.join(UPLOAD_DIR, "media_1790058135396.png")

PUBLIC_DIR = "/home/teera/Documents/oldd/swimming_pool/public"
MAPS_DIR = os.path.join(PUBLIC_DIR, "maps")
SPRITES_DIR = os.path.join(PUBLIC_DIR, "sprites")
LAND_DIR = os.path.join(SPRITES_DIR, "land")
WATER_DIR = os.path.join(SPRITES_DIR, "water")

os.makedirs(MAPS_DIR, exist_ok=True)
os.makedirs(LAND_DIR, exist_ok=True)
os.makedirs(WATER_DIR, exist_ok=True)

# 1. Copy map
shutil.copy(MAP_SRC, os.path.join(MAPS_DIR, "poolside.png"))
print("Map copied to public/maps/poolside.png")

# 2. Process Sprites
sprite_img = Image.open(SPRITE_SRC).convert("RGBA")
sprite_arr = np.array(sprite_img)
bg_ref = np.array([63, 120, 210], dtype=float)

def extract_transparent_crop(box, pad=4):
    """
    Extract a bounding box (x1, y1, x2, y2) with padding,
    and make the background blue transparent.
    """
    x1, y1, x2, y2 = box
    x1 = max(0, x1 - pad)
    y1 = max(0, y1 - pad)
    x2 = min(sprite_arr.shape[1] - 1, x2 + pad)
    y2 = min(sprite_arr.shape[0] - 1, y2 + pad)
    
    crop = sprite_arr[y1:y2+1, x1:x2+1].copy()
    ch, cw, _ = crop.shape
    rgb = crop[:, :, :3].astype(float)
    
    # Distance to background blue
    dist = np.linalg.norm(rgb - bg_ref, axis=2)
    is_bg_candidate = dist < 28
    
    # Flood fill from exterior borders to find connected background
    visited = np.zeros((ch, cw), dtype=bool)
    is_bg = np.zeros((ch, cw), dtype=bool)
    q = deque()
    
    for x in range(cw):
        q.append((0, x))
        q.append((ch - 1, x))
    for y in range(ch):
        q.append((y, 0))
        q.append((y, cw - 1))
        
    while q:
        y, x = q.popleft()
        if visited[y, x]:
            continue
        visited[y, x] = True
        if is_bg_candidate[y, x]:
            is_bg[y, x] = True
            for dy, dx in [(-1, 0), (1, 0), (0, -1), (0, 1)]:
                ny, nx = y + dy, x + dx
                if 0 <= ny < ch and 0 <= nx < cw and not visited[ny, nx]:
                    q.append((ny, nx))
                    
    # Also clear enclosed isolated background pockets if color is within dist < 22
    for y in range(ch):
        for x in range(cw):
            if dist[y, x] < 22:
                is_bg[y, x] = True

    crop[is_bg, 3] = 0
    
    # Tight crop to non-zero alpha
    alpha = crop[:, :, 3]
    non_zero = np.where(alpha > 0)
    if len(non_zero[0]) > 0:
        min_y, max_y = non_zero[0].min(), non_zero[0].max()
        min_x, max_x = non_zero[1].min(), non_zero[1].max()
        crop = crop[min_y:max_y+1, min_x:max_x+1]
        
    return Image.fromarray(crop)

# Land frame bounding boxes:
land_boxes = {
    "idle": (67, 334, 96, 393),
    "walk1": (161, 333, 192, 393),
    "walk2": (250, 336, 283, 393),
    "wave": (346, 333, 381, 393),
    "talk": (441, 336, 479, 393),
    "happy": (531, 334, 578, 393),
    "thinking": (642, 317, 673, 393),
    "sit": (739, 358, 773, 396),
    "lie": (826, 363, 884, 390),
    "jump": (933, 317, 969, 372)
}

print("Extracting Land sprites...")
manifest = {"land": {}, "water": {}}
for name, box in land_boxes.items():
    img = extract_transparent_crop(box)
    save_path = os.path.join(LAND_DIR, f"{name}.png")
    img.save(save_path)
    manifest["land"][name] = {
        "width": img.width,
        "height": img.height,
        "path": f"/sprites/land/{name}.png"
    }
    print(f"Saved {name}: {img.size}")

# Water base frames (Row 1, with red float)
water_boxes = {
    "idle": (59, 141, 130, 186),
    "swim": (197, 144, 270, 189),
    "wave": (340, 138, 404, 187),
    "talk": (477, 141, 543, 186),
    "happy": (623, 145, 684, 187),
    "relax": (761, 130, 837, 187),
    "surprise": (904, 130, 967, 189)
}

# Row 3 float variation crops
float_boxes = {
    "red": (47, 542, 112, 585),
    "blue": (169, 542, 233, 584),
    "pink": (291, 542, 358, 584),
    "yellow": (416, 542, 477, 584),
    "black": (535, 542, 602, 584),
    "green": (663, 542, 722, 585),
    "purple": (786, 542, 850, 584),
    "gray": (910, 542, 975, 584)
}

# Precise curated palettes matching the retro pixel art style
FLOAT_PALETTES = {
    "red": {"shadow": [140, 30, 45], "mid": [195, 48, 65], "high": [230, 75, 95]},
    "blue": {"shadow": [20, 80, 180], "mid": [40, 130, 220], "high": [80, 180, 245]},
    "pink": {"shadow": [175, 45, 95], "mid": [225, 90, 145], "high": [245, 140, 190]},
    "yellow": {"shadow": [185, 120, 30], "mid": [235, 175, 45], "high": [255, 215, 80]},
    "black": {"shadow": [30, 30, 35], "mid": [65, 65, 75], "high": [110, 110, 120]},
    "green": {"shadow": [35, 100, 65], "mid": [55, 155, 95], "high": [90, 205, 135]},
    "purple": {"shadow": [95, 35, 130], "mid": [140, 65, 180], "high": [185, 110, 225]},
    "gray": {"shadow": [95, 95, 100], "mid": [145, 145, 150], "high": [190, 190, 195]}
}

base_water_crops = {}
for name, box in water_boxes.items():
    base_water_crops[name] = extract_transparent_crop(box)

# Extract direct row 3 idle crops for each color
row3_idle_crops = {}
for color_name, box in float_boxes.items():
    row3_idle_crops[color_name] = extract_transparent_crop(box)

def recolor_water_sprite(base_img, target_color):
    if target_color == "red":
        return base_img.copy()
    
    arr = np.array(base_img).copy()
    pal = FLOAT_PALETTES.get(target_color)
    if not pal:
        return base_img.copy()
        
    t_shadow = np.array(pal["shadow"], dtype=np.uint8)
    t_mid = np.array(pal["mid"], dtype=np.uint8)
    t_high = np.array(pal["high"], dtype=np.uint8)
    
    h_c, w_c, _ = arr.shape
    for y in range(h_c):
        for x in range(w_c):
            if arr[y, x, 3] > 50:
                c = arr[y, x, :3].astype(int)
                # Red float stripe pixels: high red, low green and blue
                is_red = (c[0] > 110 and c[1] < 85 and c[2] < 85 and c[0] > c[1] * 1.5 and c[0] > c[2] * 1.5)
                if is_red:
                    lum = c[0] * 0.299 + c[1] * 0.587 + c[2] * 0.114
                    if lum < 80:
                        arr[y, x, :3] = t_shadow
                    elif lum < 130:
                        arr[y, x, :3] = t_mid
                    else:
                        arr[y, x, :3] = t_high
                    
    return Image.fromarray(arr)

print("Generating water sprites for all float color variations...")
manifest["floatColors"] = list(float_boxes.keys())
for color_name in float_boxes.keys():
    c_dir = os.path.join(WATER_DIR, color_name)
    os.makedirs(c_dir, exist_ok=True)
    manifest["water"][color_name] = {}
    
    for action_name, base_img in base_water_crops.items():
        if action_name == "idle" and color_name in row3_idle_crops:
            img = row3_idle_crops[color_name]
        else:
            img = recolor_water_sprite(base_img, color_name)
            
        save_path = os.path.join(c_dir, f"{action_name}.png")
        img.save(save_path)
        manifest["water"][color_name][action_name] = {
            "width": img.width,
            "height": img.height,
            "path": f"/sprites/water/{color_name}/{action_name}.png"
        }
    print(f"Generated water animations for {color_name}")

manifest_path = os.path.join(SPRITES_DIR, "character_manifest.json")
with open(manifest_path, "w") as f:
    json.dump(manifest, f, indent=2)
print("Saved character_manifest.json")
