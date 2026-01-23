import os
import shutil
import random
from ultralytics import YOLO

# --- CONFIGURATION ---
project_root = os.getcwd() 
source_folder = os.path.join(project_root, "FOD_Training_Data")
dataset_dir = os.path.join(project_root, "datasets", "FOD_Sim")

# --- STEP 1: ORGANIZE DATA ---
def setup_dataset():
    if not os.path.exists(source_folder):
        print(f"ERROR: Could not find folder at: {source_folder}")
        print("Make sure 'FOD_Training_Data' is in the same folder as this script.")
        return False
    
    print(f"[1/3] Organizing Dataset from: {source_folder}...")
    
    # Create YOLO structure
    for split in ['train', 'val']:
        os.makedirs(os.path.join(dataset_dir, split, 'images'), exist_ok=True)
        os.makedirs(os.path.join(dataset_dir, split, 'labels'), exist_ok=True)

    # Get all images
    images = [f for f in os.listdir(os.path.join(source_folder, 'images')) if f.endswith('.jpg')]
    if not images:
        print("ERROR: No images found in source folder!")
        return False
        
    random.shuffle(images)
    
    # Split: 90% Train, 10% Validation
    split_idx = int(len(images) * 0.9)
    train_imgs = images[:split_idx]
    val_imgs = images[split_idx:]

    def move_files(file_list, split):
        for img in file_list:
            # Move Image
            src_img = os.path.join(source_folder, 'images', img)
            dst_img = os.path.join(dataset_dir, split, 'images', img)
            shutil.copy(src_img, dst_img)
            
            # Move Label (txt)
            label_name = img.replace('.jpg', '.txt')
            src_lbl = os.path.join(source_folder, 'labels', label_name)
            dst_lbl = os.path.join(dataset_dir, split, 'labels', label_name)
            if os.path.exists(src_lbl):
                shutil.copy(src_lbl, dst_lbl)

    move_files(train_imgs, 'train')
    move_files(val_imgs, 'val')
    
    # Create data.yaml
    yaml_content = f"""
        path: {dataset_dir}
        train: train/images
        val: val/images

        nc: 1
        names: ['FOD']
        """
    with open(os.path.join(dataset_dir, "data.yaml"), "w") as f:
        f.write(yaml_content)
    
    print("[2/3] Dataset Organized Successfully.")
    return True

# --- STEP 2: TRAIN ---
def train_model():
    print("[3/3] Starting Training on RTX 4090...")
    # Load the Nano model (smallest and fastest)
    model = YOLO("yolov8n.pt") 
    
    # Train
    results = model.train(
        data=os.path.join(dataset_dir, "data.yaml"),
        epochs=30,           # 30 loops over the data
        imgsz=640,
        batch=16,
        device=0,            # Force GPU (cuda:0)
        project="fod_training",
        name="fod_v1"
    )
    
    # Export to ONNX for C#
    print("\n[SUCCESS] Training Complete. Exporting to ONNX...")
    model.export(format="onnx", opset=12)

if __name__ == "__main__":
    if setup_dataset():
        train_model()