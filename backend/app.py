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
from typing import Optional, Dict

# --- CONFIGURATION ---
MODEL_PATH = "best.pt" 

REGION_POINTS = [(50, 400), (590, 400)]

# Default prompt for cookie tracking
DEFAULT_TRACKING_PROMPT = """You are tracking cookies on a conveyor belt. Your task is to:
1. Detect and count all cookies in the frame
2. Identify damaged or defective cookies based on:
   - Broken or fragmented appearance
   - Irregular shapes (not circular/round)
   - Missing pieces or cracks
   - Discoloration or burn marks
   - Size significantly smaller than normal cookies
3. Track cookies as they move through the detection region
4. Only count cookies that pass through the designated counting line
5. Mark cookies with confidence below 0.6 as potential defects
6. Flag cookies with bounding box aspect ratio outside 0.7-1.3 as potentially damaged (not round)
7. Consider cookies with area significantly smaller than average as defects"""  


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
    prompt: Optional[str] = None  # Optional prompt/instructions for the model  

class AnalysisResponse(BaseModel):
    count: int
    defects: int
    reasoning: str
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
    
    # 2. Get prompt (use provided or default)
    tracking_prompt = request.prompt if request.prompt else DEFAULT_TRACKING_PROMPT
    if tracking_prompt:
        print(f"Tracking prompt: {tracking_prompt[:100]}...")  # Log first 100 chars
    
    # 3. Run object detection
    results = model_counter(im_bgr)

    object_count = 0
    try:
        if hasattr(results, 'total_tracks'):
            object_count = int(results.total_tracks)
    except Exception as e:
        print(f"Warning: Could not extract total_tracks: {e}")
        object_count = 0
    
    # 4. Get the annotated image (like results.plot_im in video processing)
    annotated_image_bgr = None
    try:
        if hasattr(results, 'plot_im'):
            # ObjectCounter returns plot_im with bounding boxes drawn (BGR format)
            annotated_image_bgr = results.plot_im
        
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

    # 5. Calculate defects based on detection results and cookie damage rules
    defects_count = 0
    defect_reasons = []
    
    try:
        # ObjectCounter may return results as a list or single result
        # Try to get the underlying detection results
        detection_results = results
        if isinstance(results, list) and len(results) > 0:
            detection_results = results[0]
        
        # Extract detection data from results
        # ObjectCounter wraps YOLO results, so we need to access the underlying model results
        if hasattr(detection_results, 'boxes') and detection_results.boxes is not None:
            boxes = detection_results.boxes
            confidences = []
            areas = []
            aspect_ratios = []
            
            # Try to get confidences
            if hasattr(boxes, 'conf'):
                try:
                    confidences = boxes.conf.cpu().numpy().tolist() if hasattr(boxes.conf, 'cpu') else []
                except:
                    confidences = []
            
            # Calculate bounding box characteristics for each detection
            if hasattr(boxes, 'xyxy'):
                try:
                    boxes_xyxy = boxes.xyxy.cpu().numpy() if hasattr(boxes.xyxy, 'cpu') else boxes.xyxy
                    for box in boxes_xyxy:
                        x1, y1, x2, y2 = box
                        width = x2 - x1
                        height = y2 - y1
                        area = width * height
                        aspect_ratio = width / height if height > 0 else 1.0
                        areas.append(area)
                        aspect_ratios.append(aspect_ratio)
                except Exception as e:
                    print(f"Warning: Could not extract bounding boxes: {e}")
            
            # Rule 1: Low confidence cookies (< 0.6) are potential defects
            if confidences:
                low_confidence_count = sum(1 for conf in confidences if conf < 0.6)
                if low_confidence_count > 0:
                    defects_count += low_confidence_count
                    defect_reasons.append(f"{low_confidence_count} low confidence")
            
            # Rule 2: Non-circular cookies (aspect ratio outside 0.7-1.3) are damaged
            if aspect_ratios:
                non_circular_count = sum(1 for ar in aspect_ratios if ar < 0.7 or ar > 1.3)
                if non_circular_count > 0:
                    defects_count += non_circular_count
                    defect_reasons.append(f"{non_circular_count} irregular shape")
            
            # Rule 3: Significantly smaller cookies (area < 50% of median) are defects
            if areas and len(areas) > 1:
                median_area = np.median(areas)
                small_cookie_count = sum(1 for area in areas if area < median_area * 0.5)
                if small_cookie_count > 0:
                    defects_count += small_cookie_count
                    defect_reasons.append(f"{small_cookie_count} undersized")
            
            # Rule 4: Very large cookies (area > 150% of median) might be overlapping/broken
            if areas and len(areas) > 1:
                median_area = np.median(areas)
                oversized_count = sum(1 for area in areas if area > median_area * 1.5)
                if oversized_count > 0:
                    defects_count += oversized_count
                    defect_reasons.append(f"{oversized_count} oversized/overlapping")
            
            # Ensure defects_count doesn't exceed total count
            defects_count = min(defects_count, object_count)
        else:
            # Fallback: if we can't access boxes, use a simple heuristic
            # Assume some percentage of low-confidence detections are defects
            if object_count > 0:
                # Conservative estimate: 10% might be defects if we can't analyze
                defects_count = max(0, int(object_count * 0.1))
                if defects_count > 0:
                    defect_reasons.append("estimated defects")
    
    except Exception as e:
        print(f"Warning: Error calculating defects: {e}")
        import traceback
        traceback.print_exc()
        defects_count = 0
    
    # Build reasoning string
    reasoning = f"Detected {object_count} tracked cookie(s)"
    if defects_count > 0:
        reasoning += f", {defects_count} defective ({', '.join(defect_reasons)})"
    if object_count == 0:
        reasoning = "No cookies detected in frame"
    
    latency_ms = (time.time() - start_time) * 1000

    return AnalysisResponse(
        count=object_count,
        defects=defects_count,
        reasoning=reasoning,
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