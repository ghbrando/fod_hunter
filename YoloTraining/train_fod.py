from ultralytics import YOLO

def main():
    # 1. Load the model
    print("📦 Loading YOLOv8 Nano model...")
    model = YOLO('yolov8n.pt') 

    # 2. Train the model
    print("🚀 Starting Training on RTX 4090...")
    results = model.train(
        data="fod_config.yaml",
        epochs=30,
        imgsz=640,
        
        # --- GPU & WINDOWS OPTIMIZATIONS ---
        device=0,        # <--- FORCE GPU 0 (Your 4090)
        batch=128,       # High batch size for speed
        workers=4,       # <--- CRITICAL FIX: Prevents Windows RAM crash
        # -----------------------------------
        
        name='fod_model',
        exist_ok=True    # Overwrite old runs if they exist
    )
    
    # 3. Export for Unity
    print("📦 Exporting to ONNX...")
    model.export(format='onnx', dynamic=False, simplify=True)
    print("✅ Done! ready for Unity.")

if __name__ == '__main__':
    main()