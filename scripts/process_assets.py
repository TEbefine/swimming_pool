import os
import shutil
import json
from PIL import Image
import numpy as np

# Resolve paths relative to project root
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
WORKSPACE_DIR = os.path.dirname(SCRIPT_DIR)
PUBLIC_DIR = os.path.join(WORKSPACE_DIR, "public")
MAPS_DIR = os.path.join(PUBLIC_DIR, "maps")
SPRITES_DIR = os.path.join(PUBLIC_DIR, "sprites")
LAND_DIR = os.path.join(SPRITES_DIR, "land")
WATER_DIR = os.path.join(SPRITES_DIR, "water")
MANIFEST_PATH = os.path.join(SPRITES_DIR, "character_manifest.json")

# 4x4 Action Sprite Sheet source
SRC_CANDIDATES = [
    os.path.join(WORKSPACE_DIR, "src", "assets", "spritesheet.png"),
    "/Users/teerathongbai/.gemini/antigravity-ide/brain/aa89b6d8-2609-4ee2-83fc-dc5a6f86246a/.user_uploaded/media_1790171789714.png"
]
SPRITE_SRC = next((p for p in SRC_CANDIDATES if os.path.exists(p)), SRC_CANDIDATES[-1])

os.makedirs(MAPS_DIR, exist_ok=True)
os.makedirs(LAND_DIR, exist_ok=True)
os.makedirs(WATER_DIR, exist_ok=True)

im = Image.open(SPRITE_SRC)

# Specs for all 16 cells in the 4x4 action grid
specs = {
    'idle': (110, 60, 180, 205),
    'side_idle': (355, 60, 425, 205),
    'back_idle': (590, 60, 665, 205),
    'walk1': (840, 60, 915, 205),
    'walk2': (110, 245, 185, 390),
    'wave': (350, 245, 445, 390),
    'talk': (585, 245, 685, 390),
    'happy': (820, 245, 935, 390),
    'thinking': (110, 430, 180, 585),
    'sit': (340, 460, 435, 585),
    'lie': (555, 500, 715, 585),
    'jump': (830, 420, 925, 585),
    'swim1': (55, 630, 240, 735),
    'swim2': (310, 630, 470, 735),
    'tread': (545, 630, 705, 735),
    'splash': (785, 630, 970, 735),
}

# Scale factor: standard standing idle height = 50px
idle_crop = im.crop(specs['idle'])
idle_tight = idle_crop.crop(idle_crop.getbbox())
scale = 50.0 / idle_tight.height

manifest = {
    "land": {},
    "water": {},
    "floatColors": ["red", "blue", "pink", "yellow", "black", "green", "purple", "gray"]
}

# Load existing water float variations if present
if os.path.exists(MANIFEST_PATH):
    try:
        with open(MANIFEST_PATH, "r") as f:
            old_manifest = json.load(f)
            manifest["water"] = old_manifest.get("water", {})
    except Exception:
        pass

# Extract and save land sprites
land_actions = ['idle', 'side_idle', 'back_idle', 'walk1', 'walk2', 'wave', 'talk', 'happy', 'thinking', 'sit', 'lie', 'jump']
walk_stand_actions = {'idle', 'side_idle', 'back_idle', 'walk1', 'walk2', 'thinking'}

for name in land_actions:
    box = specs[name]
    crop = im.crop(box)
    tight = crop.crop(crop.getbbox())
    target_w = max(1, int(round(tight.width * scale)))
    target_h = max(1, int(round(tight.height * scale)))
    scaled = tight.resize((target_w, target_h), Image.LANCZOS)
    
    if name in walk_stand_actions:
        # Pad to uniform 32x52 canvas, centered horizontally and aligned to bottom
        canvas = Image.new('RGBA', (32, 52), (0, 0, 0, 0))
        canvas.paste(scaled, ((32 - scaled.width) // 2, 52 - scaled.height), scaled)
        final_img = canvas
    else:
        final_img = scaled
        
    dst_path = os.path.join(LAND_DIR, f"{name}.webp")
    final_img.save(dst_path, "WEBP", lossless=True)
    manifest["land"][name] = {
        "width": final_img.width,
        "height": final_img.height,
        "path": f"/sprites/land/{name}.webp"
    }

# Extract and save base swimming sprites in public/sprites/water/
# Note: swim1 is flipped horizontally so both swim1 and swim2 face RIGHT consistently.
swim_actions = ['swim1', 'swim2', 'tread', 'splash']
SWIM_CANVAS_W = 66
SWIM_CANVAS_H = 38

for name in swim_actions:
    box = specs[name]
    crop = im.crop(box)
    tight = crop.crop(crop.getbbox())
    
    if name == 'swim1':
        # Flip swim1 horizontally to match swim2's facing direction
        tight = tight.transpose(Image.FLIP_LEFT_RIGHT)
        
    target_w = max(1, int(round(tight.width * scale)))
    target_h = max(1, int(round(tight.height * scale)))
    scaled = tight.resize((target_w, target_h), Image.LANCZOS)
    
    if name in ('swim1', 'swim2'):
        # Align on uniform 66x38 canvas so stroke cycle doesn't jitter
        canvas = Image.new('RGBA', (SWIM_CANVAS_W, SWIM_CANVAS_H), (0, 0, 0, 0))
        offset_x = 1 if name == 'swim1' else 2
        offset_y = 1
        canvas.paste(scaled, (offset_x, offset_y), scaled)
        final_img = canvas
    else:
        final_img = scaled

    dst_path = os.path.join(WATER_DIR, f"{name}.webp")
    final_img.save(dst_path, "WEBP", lossless=True)

# Propagate swimming actions to all float colors
for color in manifest["floatColors"]:
    c_dir = os.path.join(WATER_DIR, color)
    os.makedirs(c_dir, exist_ok=True)
    if color not in manifest["water"]:
        manifest["water"][color] = {}
    for act in swim_actions:
        src = os.path.join(WATER_DIR, f"{act}.webp")
        dst = os.path.join(c_dir, f"{act}.webp")
        shutil.copyfile(src, dst)
        im_act = Image.open(dst)
        manifest["water"][color][act] = {
            "width": im_act.width,
            "height": im_act.height,
            "path": f"/sprites/water/{color}/{act}.webp"
        }

with open(MANIFEST_PATH, "w") as f:
    json.dump(manifest, f, indent=2)

print("process_assets.py completed successfully!")
