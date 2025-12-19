import torch
from ultralytics import YOLO

# 1. Load your fine-tuned model
model = YOLO("/Users/krishnaniveditha/Desktop/qualityvision-ai/backend/weights/best.pt") 

# 2. Export the model to ONNX format
# Arguments explained:
# - imgsz: Fixed size (640) is faster for CPU than dynamic sizes
# - dynamic: False (fixed shapes are optimized better by ONNX runtimes)
# - simplify: True (uses onnxslim to remove redundant operations)
# - opset: 12 (wide compatibility for different cloud providers)
success_path = model.export(
    format="onnx", 
    imgsz=640, 
    simplify=True, 
    opset=12
)

print(f"Model successfully converted and saved to: {success_path}")