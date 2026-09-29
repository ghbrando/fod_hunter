"""Stand-in for the Unity drone: pans over a flight deck built from the team's
simulator frame and posts each view to the vision server, like Unity does."""
import io, sys, time, urllib.request
from PIL import Image, ImageOps

SRC = sys.argv[1]
base = Image.open(SRC).convert("RGB")                      # 640x640 Unity frame
W = 640
# Debris crops from the frame (x0, y0, x1, y1): two hammers and a screw.
hammer_a = base.crop((452, 140, 500, 206))
hammer_b = base.crop((428, 452, 482, 544))
screw = base.crop((198, 244, 222, 270))

# Clean tile: paint over the debris with deck taken from just above each item.
clean = base.copy()
for box in [(452, 140, 500, 206), (428, 452, 482, 544), (198, 244, 222, 270)]:
    x0, y0, x1, y1 = box
    clean.paste(base.crop((x0, y0 - (y1 - y0) - 20, x1, y0 - 20)), (x0, y0))

TILES = 4
deck = Image.new("RGB", (W, W * TILES))
for i in range(TILES):
    deck.paste(clean, (0, i * W))

def drop(img, x, y, angle=0):
    piece = img.rotate(angle, expand=True, fillcolor=(0, 0, 0))
    mask = piece.convert("L").point(lambda v: 255 if v > 8 else 0)
    deck.paste(piece, (x, y), mask)

drop(hammer_b, 450, 300)
drop(hammer_a, 180, 640)
drop(screw, 470, 900, 30)
drop(hammer_a, 470, 1180, -20)
drop(hammer_b, 200, 1560, 15)
drop(hammer_a, 430, 2080)

from concurrent.futures import ThreadPoolExecutor

def post(jpeg):
    try:
        urllib.request.urlopen(urllib.request.Request("http://localhost:5000/", data=jpeg, method="POST"), timeout=10).read()
    except Exception as e:
        print("post failed:", e, flush=True)

# The server spends ~0.4 s per frame on inference, so post concurrently to keep
# the video feed smooth; detections trail the picture by one inference.
step, fps = 3, 10
pool = ThreadPoolExecutor(max_workers=6)
y = 0
while True:
    frame = deck.crop((0, y, W, y + W))
    buf = io.BytesIO(); frame.save(buf, "JPEG", quality=88)
    pool.submit(post, buf.getvalue())
    y += step
    if y > deck.height - W:
        y = 0
    time.sleep(1 / fps)
