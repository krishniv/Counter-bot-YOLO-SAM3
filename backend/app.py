import time
import base64
import io
import numpy as np
import cv2
from PIL import Image
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from ultralytics import solutions
from typing import Optional, List, Dict

# --- CONFIGURATION ---
MODEL_PATH = "yolo11n.pt" 
# Define a simple region line for counting objects as they cross it
# Example line at y=400 across the width of a standard 1280x720 video:
# (Note: This region assumes objects are moving horizontally or crossing a vertical line)
# We will use a line counting region here for simplicity, similar to the Colab example.
# Let's assume a 640-pixel wide image for this generic region:
REGION_POINTS = [(50, 400), (590, 400)]  


# Initialize FastAPI app
app = FastAPI(
    title="Simple YOLO Object Counter API",
    description="Minimal API to run Ultralytics ObjectCounter on a single frame.",
    version="1.0"
)

# Apply CORS middleware (essential for frontend integration)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], # Allow all origins for simplicity in this example
    allow_methods=["*"],
    allow_headers=["*"],
)


model_counter: Optional[solutions.ObjectCounter] = None
model_names: Optional[Dict[int, str]] = None  # Class ID to name mapping


# --- DATA MODELS ---
class ImageRequest(BaseModel):
    # Accepts Base64 encoded image string (with or without 'data:image/jpeg;base64,' prefix)
    image: str  

class DetectionBox(BaseModel):
    x1: float
    y1: float
    x2: float
    y2: float
    confidence: float
    class_id: int
    class_name: str

class AnalysisResponse(BaseModel):
    count: int
    defects: int
    reasoning: str
    coordinates: List[DetectionBox]
    annotated_image: Optional[str] = None  # Base64 encoded annotated image
    latency_ms: float


# --- INIT MODEL ---
@app.on_event("startup")
def load_model():
    """Initializes the ObjectCounter instance when the FastAPI server starts."""
    global model_counter, model_names
    print(f"Loading model: {MODEL_PATH}")
    model_counter = solutions.ObjectCounter(
        model=MODEL_PATH,
        region=REGION_POINTS,
        show=False,    # Do not show video output
        verbose=False  # Keep console output clean
    )
    # Get class names from the underlying YOLO model
    if hasattr(model_counter, 'model') and hasattr(model_counter.model, 'names'):
        model_names = model_counter.model.names
    else:
        # Fallback: try to get from the model directly
        from ultralytics import YOLO
        temp_model = YOLO(MODEL_PATH)
        model_names = temp_model.names if hasattr(temp_model, 'names') else {}
    print("Model loaded successfully.")
    print(f"Available classes: {model_names}")


# --- UTILITY FUNCTION FOR IMAGE DECODING ---
def decode_base64_image(image_str: str) -> np.ndarray:
    """Decodes a Base64 string to an OpenCV BGR image array."""
    # Strip data URL prefix if present
    if "," in image_str:
        image_str = image_str.split(",")[-1]

    try:
        image_bytes = base64.b64decode(image_str)
        # Use PIL to open image from bytes
        image = Image.open(io.BytesIO(image_bytes)).convert("RGB")
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Invalid image data format: {e}")

    # PIL (RGB) -> OpenCV (BGR) format required by Ultralytics/cv2
    im_bgr = cv2.cvtColor(np.array(image), cv2.COLOR_RGB2BGR)
    return im_bgr

# --- UTILITY FUNCTION FOR IMAGE ENCODING ---
def encode_image_to_base64(image_bgr: np.ndarray) -> str:
    """Encodes an OpenCV BGR image array to Base64 JPEG string."""
    # Convert BGR to RGB for PIL
    image_rgb = cv2.cvtColor(image_bgr, cv2.COLOR_BGR2RGB)
    pil_image = Image.fromarray(image_rgb)
    
    # Convert to bytes
    buffer = io.BytesIO()
    pil_image.save(buffer, format='JPEG', quality=90)
    image_bytes = buffer.getvalue()
    
    # Encode to base64
    base64_str = base64.b64encode(image_bytes).decode('utf-8')
    return f"data:image/jpeg;base64,{base64_str}"


# --- MAIN ENDPOINT ---
@app.post("/analyze", response_model=AnalysisResponse)
async def analyze(request: ImageRequest):
    """Receives an image, runs ObjectCounter, and returns the total count."""

    start_time = time.time()

    # 1. Decode Image
    im_bgr = decode_base64_image(request.image)
    
    # 2. Run object detection
    results = model_counter(im_bgr)

    # 3. Get the annotated image (like results.plot_im in video processing)
    annotated_image_bgr = None
    try:
        if hasattr(results, 'plot_im'):
            # ObjectCounter returns plot_im with bounding boxes drawn (BGR format)
            annotated_image_bgr = results.plot_im
        elif hasattr(results, 'plot'):
            # Alternative: use plot() method if available
            annotated_image_bgr = results.plot()
        elif hasattr(results, 'orig_img'):
            # Fallback: use original image if plotting not available
            annotated_image_bgr = results.orig_img.copy()
        # If results is a list (some YOLO versions), get first element
        elif isinstance(results, list) and len(results) > 0:
            first_result = results[0]
            if hasattr(first_result, 'plot_im'):
                annotated_image_bgr = first_result.plot_im
            elif hasattr(first_result, 'plot'):
                annotated_image_bgr = first_result.plot()
    except Exception as e:
        print(f"Warning: Could not extract annotated image: {e}")
        annotated_image_bgr = None
    
    # Convert annotated image to base64
    annotated_image_base64 = None
    if annotated_image_bgr is not None:
        try:
            annotated_image_base64 = encode_image_to_base64(annotated_image_bgr)
        except Exception as e:
            print(f"Warning: Could not encode annotated image: {e}")
            annotated_image_base64 = None

    # 4. Extract bounding boxes, confidences, and class IDs
    detection_boxes = []
    object_count = 0
    defects_count = 0
    
    if hasattr(results, 'boxes') and results.boxes is not None:
        boxes = results.boxes
        
        # Get arrays from tensor/numpy format
        if hasattr(boxes, 'xyxy'):
            xyxy = boxes.xyxy.cpu().numpy() if hasattr(boxes.xyxy, 'cpu') else boxes.xyxy
        else:
            xyxy = np.array([])
            
        if hasattr(boxes, 'conf'):
            confidences = boxes.conf.cpu().numpy() if hasattr(boxes.conf, 'cpu') else boxes.conf
        else:
            confidences = np.array([])
            
        if hasattr(boxes, 'cls'):
            class_ids = boxes.cls.cpu().numpy().astype(int) if hasattr(boxes.cls, 'cpu') else boxes.cls.astype(int)
        else:
            class_ids = np.array([])
        
        object_count = len(xyxy) if len(xyxy.shape) > 0 else 0
        
        # Build detection boxes list
        for i in range(object_count):
            if len(xyxy.shape) == 2 and i < len(xyxy):
                x1, y1, x2, y2 = float(xyxy[i][0]), float(xyxy[i][1]), float(xyxy[i][2]), float(xyxy[i][3])
                confidence = float(confidences[i]) if i < len(confidences) else 0.0
                class_id = int(class_ids[i]) if i < len(class_ids) else 0
                class_name = model_names.get(class_id, f"class_{class_id}") if model_names else f"class_{class_id}"
                
                detection_boxes.append(DetectionBox(
                    x1=x1,
                    y1=y1,
                    x2=x2,
                    y2=y2,
                    confidence=confidence,
                    class_id=class_id,
                    class_name=class_name
                ))
                
                # Count defects: low confidence detections or specific defect classes
                # You can customize this logic based on your use case
                if confidence < 0.3:  # Low confidence = potential defect
                    defects_count += 1
    
    # 5. Generate reasoning
    reasoning = f"Detected {object_count} object(s)"
    if defects_count > 0:
        reasoning += f", {defects_count} with low confidence or flagged as defects"
    if object_count == 0:
        reasoning = "No objects detected in frame"
    
    latency_ms = (time.time() - start_time) * 1000

    return AnalysisResponse(
        count=object_count,
        defects=defects_count,
        reasoning=reasoning,
        coordinates=detection_boxes,
        annotated_image=annotated_image_base64,
        latency_ms=latency_ms,
    )


# --- HEALTH CHECK ---
@app.get("/")
async def health_check():
    """Simple health check endpoint."""
    return {"status": "ok", "model_loaded": model_counter is not None}


if __name__ == "__main__":
    import uvicorn
    # To run this server: uvicorn app:app --reload --host 0.0.0.0 --port 8000
    uvicorn.run(app, host="0.0.0.0", port=8000)