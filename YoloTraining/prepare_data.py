import os
import shutil
import random

# Paths
base_dir = r"C:\FOD_Hunter_MVP\YoloTraining\datasets"
images_train = os.path.join(base_dir, "images", "train")
labels_train = os.path.join(base_dir, "labels", "train")
images_val = os.path.join(base_dir, "images", "val")
labels_val = os.path.join(base_dir, "labels", "val")

# Create val folders if not exist
os.makedirs(images_val, exist_ok=True)
os.makedirs(labels_val, exist_ok=True)

# Get all images
files = [f for f in os.listdir(images_train) if f.endswith('.jpg')]
random.shuffle(files)

# Move 20% to validation
val_count = int(len(files) * 0.2)
files_to_move = files[:val_count]

print(f"Moving {len(files_to_move)} images to Validation folder...")

for f in files_to_move:
    # Move Image
    src_img = os.path.join(images_train, f)
    dst_img = os.path.join(images_val, f)
    shutil.move(src_img, dst_img)
    
    # Move Label
    label_name = f.replace('.jpg', '.txt')
    src_label = os.path.join(labels_train, label_name)
    dst_label = os.path.join(labels_val, label_name)
    
    if os.path.exists(src_label):
        shutil.move(src_label, dst_label)

print("✅ Success! Data split complete.")
print(f"Train: {len(os.listdir(images_train))} | Val: {len(os.listdir(images_val))}")