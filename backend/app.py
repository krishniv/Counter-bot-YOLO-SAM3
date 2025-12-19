import time
import base64
import io
import numpy as np
import cv2
from PIL import Image
from fastapi import FastAPI, HTTPException, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from ultralytics import solutions
from typing import Optional, Dict
import asyncio
import json

# --- CONFIGURATION ---
MODEL_PATH = "/Users/krishnaniveditha/Desktop/qualityvision-ai/backend/best.pt" 

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
5. Mark cookies with confidence below 0.3 as potential defects
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
    # Initialize ObjectCounter with standard parameters
    # Note: ObjectCounter maintains tracking state internally via global instance
    model_counter = solutions.ObjectCounter(
        model=MODEL_PATH,
        region=REGION_POINTS,
        show=False,    # Do not show video output
        verbose=False  # Keep console output clean
    )
    
    # Disable label drawing to avoid redundant annotations
    if hasattr(model_counter, 'show_labels'):
        model_counter.show_labels = False
    if hasattr(model_counter, 'show_conf'):
        model_counter.show_conf = False
    if hasattr(model_counter, 'show_in'):
        model_counter.show_in = False
    if hasattr(model_counter, 'show_out'):
        model_counter.show_out = False
    
    # Configure tracking parameters for smoother video propagation if available
    if hasattr(model_counter, 'track_add_args'):
        # Update tracking args for better continuity
        model_counter.track_add_args.update({
            'conf': 0.25,  # Lower confidence threshold for more detections
            'iou': 0.7,  # IoU threshold for NMS
            'max_det': 300,  # Maximum detections per frame
        })
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
    
    # 3. Run object detection (use a copy to ensure original is not modified)
    im_bgr_copy = im_bgr.copy()
    results = model_counter(im_bgr_copy)

    object_count = 0
    try:
        if hasattr(results, 'total_tracks'):
            object_count = int(results.total_tracks)
    except Exception as e:
        print(f"Warning: Could not extract total_tracks: {e}")
        object_count = 0
    
    # 4. Calculate defects based on confidence scores only
    defects_count = 0
    defect_reasons = []
    confidence_scores = []
    boxes_xyxy = None
    defect_flags = []
    
    try:
        # Access track_data from ObjectCounter which contains boxes, confidence, and tracking info
        if hasattr(model_counter, 'track_data') and model_counter.track_data is not None:
            track_data = model_counter.track_data
            
            # Extract confidence scores
            if hasattr(track_data, 'conf') and track_data.conf is not None:
                conf_tensor = track_data.conf
                # Convert tensor to list
                if hasattr(conf_tensor, 'cpu'):
                    confidence_scores = conf_tensor.cpu().numpy().tolist()
                elif isinstance(conf_tensor, np.ndarray):
                    confidence_scores = conf_tensor.tolist()
                else:
                    confidence_scores = [float(c) for c in conf_tensor]
                
                print(f"Extracted {len(confidence_scores)} confidence scores: {confidence_scores}")
            
            # Extract bounding boxes - try xyxy first, then fall back to data
            if hasattr(track_data, 'xyxy') and track_data.xyxy is not None:
                xyxy_tensor = track_data.xyxy
                if hasattr(xyxy_tensor, 'cpu'):
                    boxes_xyxy = xyxy_tensor.cpu().numpy()
                elif isinstance(xyxy_tensor, np.ndarray):
                    boxes_xyxy = xyxy_tensor
            elif hasattr(track_data, 'data') and track_data.data is not None:
                # Extract from data tensor: [x1, y1, x2, y2, track_id, conf, cls]
                data_tensor = track_data.data
                if hasattr(data_tensor, 'cpu'):
                    data_array = data_tensor.cpu().numpy()
                elif isinstance(data_tensor, np.ndarray):
                    data_array = data_tensor
                else:
                    data_array = np.array(data_tensor)
                
                if len(data_array) > 0 and data_array.shape[1] >= 4:
                    boxes_xyxy = data_array[:, :4]  # Extract first 4 columns (x1, y1, x2, y2)
            
            # Simple defect detection: confidence < 0.3
            if len(confidence_scores) > 0:
                defect_flags = [conf < 0.3 for conf in confidence_scores]
                defects_count = sum(defect_flags)
                if defects_count > 0:
                    defect_reasons.append(f"{defects_count} low confidence (<0.3)")
    
    except Exception as e:
        print(f"Warning: Error calculating defects: {e}")
        import traceback
        traceback.print_exc()
        defects_count = 0
    
    # 5. Create annotated image with colored boxes only (no labels)
    annotated_image_bgr = None
    try:
        # Start from a fresh copy of original image (not plot_im which has labels)
        annotated_image_bgr = im_bgr.copy()
        
        # Draw colored boxes based on defect flags
        if boxes_xyxy is not None and len(boxes_xyxy) > 0 and len(defect_flags) > 0:
            for i, box in enumerate(boxes_xyxy):
                if i < len(defect_flags):
                    x1, y1, x2, y2 = int(box[0]), int(box[1]), int(box[2]), int(box[3])
                    
                    # Determine color: red for defects, green for good
                    is_defect = defect_flags[i]
                    color = (0, 0, 255) if is_defect else (0, 255, 0)  # BGR: red or green
                    thickness = 3 if is_defect else 2
                    
                    # Draw bounding box
                    cv2.rectangle(annotated_image_bgr, (x1, y1), (x2, y2), color, thickness)
        
    except Exception as e:
        print(f"Warning: Could not create annotated image: {e}")
        import traceback
        traceback.print_exc()
        annotated_image_bgr = None
    
    # Convert annotated image to base64 (optimized: lower quality for speed)
    annotated_image_base64 = None
    if annotated_image_bgr is not None:
        try:
            # Use lower quality JPEG for faster encoding/decoding (85 instead of 90)
            image_rgb = cv2.cvtColor(annotated_image_bgr, cv2.COLOR_BGR2RGB)
            pil_image = Image.fromarray(image_rgb)
            buffer = io.BytesIO()
            pil_image.save(buffer, format='JPEG', quality=85, optimize=True)
            image_bytes = buffer.getvalue()
            base64_str = base64.b64encode(image_bytes).decode('utf-8')
            annotated_image_base64 = f"data:image/jpeg;base64,{base64_str}"
        except Exception as e:
            print(f"Warning: Could not encode annotated image: {e}")
            annotated_image_base64 = None
    
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


# --- WEBSOCKET ENDPOINT FOR REAL-TIME VIDEO STREAMING ---
@app.websocket("/ws/video")
async def websocket_video_stream(websocket: WebSocket):
    """
    WebSocket endpoint for real-time video frame processing.
    Similar to the YOLO webcam example - processes frames in real-time with minimal latency.
    """
    await websocket.accept()
    print("WebSocket connection established for video streaming")
    
    try:
        while True:
            # Receive frame data from client
            data = await websocket.receive_text()
            frame_data = json.loads(data)
            
            if frame_data.get("type") == "frame":
                # Decode base64 image
                image_str = frame_data.get("image", "")
                if not image_str:
                    continue
                
                # Decode image
                try:
                    if "," in image_str:
                        image_str = image_str.split(",")[-1]
                    image_bytes = base64.b64decode(image_str)
                    image = Image.open(io.BytesIO(image_bytes)).convert("RGB")
                    im_bgr = cv2.cvtColor(np.array(image), cv2.COLOR_RGB2BGR)
                except Exception as e:
                    await websocket.send_json({"error": f"Image decode error: {e}"})
                    continue
                
                # Process frame with ObjectCounter
                start_time = time.time()
                results = model_counter(im_bgr)
                
                # Get object count
                object_count = 0
                try:
                    if hasattr(results, 'total_tracks'):
                        object_count = int(results.total_tracks)
                except:
                    object_count = 0
                
                # Extract confidence scores and boxes for defect detection
                defects_count = 0
                confidence_scores = []
                boxes_xyxy = None
                defect_flags = []
                
                try:
                    if hasattr(model_counter, 'track_data') and model_counter.track_data is not None:
                        track_data = model_counter.track_data
                        
                        # Extract confidence scores
                        if hasattr(track_data, 'conf') and track_data.conf is not None:
                            conf_tensor = track_data.conf
                            if hasattr(conf_tensor, 'cpu'):
                                confidence_scores = conf_tensor.cpu().numpy().tolist()
                            elif isinstance(conf_tensor, np.ndarray):
                                confidence_scores = conf_tensor.tolist()
                            else:
                                confidence_scores = [float(c) for c in conf_tensor]
                        
                        # Extract bounding boxes
                        if hasattr(track_data, 'xyxy') and track_data.xyxy is not None:
                            xyxy_tensor = track_data.xyxy
                            if hasattr(xyxy_tensor, 'cpu'):
                                boxes_xyxy = xyxy_tensor.cpu().numpy()
                            elif isinstance(xyxy_tensor, np.ndarray):
                                boxes_xyxy = xyxy_tensor
                        elif hasattr(track_data, 'data') and track_data.data is not None:
                            data_tensor = track_data.data
                            if hasattr(data_tensor, 'cpu'):
                                data_array = data_tensor.cpu().numpy()
                            elif isinstance(data_tensor, np.ndarray):
                                data_array = data_tensor
                            else:
                                data_array = np.array(data_tensor)
                            
                            if len(data_array) > 0 and data_array.shape[1] >= 4:
                                boxes_xyxy = data_array[:, :4]
                        
                        # Simple defect detection: confidence < 0.3
                        if len(confidence_scores) > 0:
                            defect_flags = [conf < 0.3 for conf in confidence_scores]
                            defects_count = sum(defect_flags)
                except Exception as e:
                    print(f"Error in defect detection: {e}")
                
                # Create annotated image with colored boxes
                annotated_image_bgr = im_bgr.copy()
                if boxes_xyxy is not None and len(boxes_xyxy) > 0 and len(defect_flags) > 0:
                    for i, box in enumerate(boxes_xyxy):
                        if i < len(defect_flags):
                            x1, y1, x2, y2 = int(box[0]), int(box[1]), int(box[2]), int(box[3])
                            is_defect = defect_flags[i]
                            color = (0, 0, 255) if is_defect else (0, 255, 0)  # BGR: red or green
                            thickness = 3 if is_defect else 2
                            cv2.rectangle(annotated_image_bgr, (x1, y1), (x2, y2), color, thickness)
                
                # Encode annotated image
                image_rgb = cv2.cvtColor(annotated_image_bgr, cv2.COLOR_BGR2RGB)
                pil_image = Image.fromarray(image_rgb)
                buffer = io.BytesIO()
                pil_image.save(buffer, format='JPEG', quality=75, optimize=True)  # Lower quality for speed
                image_bytes = buffer.getvalue()
                base64_str = base64.b64encode(image_bytes).decode('utf-8')
                
                # Build reasoning string
                reasoning = f"Detected {object_count} tracked cookie(s)"
                if defects_count > 0:
                    reasoning += f", {defects_count} defective"
                if object_count == 0:
                    reasoning = "No cookies detected in frame"
                
                latency_ms = (time.time() - start_time) * 1000
                
                # Send response back to client
                await websocket.send_json({
                    "type": "result",
                    "count": object_count,
                    "defects": defects_count,
                    "reasoning": reasoning,
                    "annotated_image": f"data:image/jpeg;base64,{base64_str}",
                    "latency_ms": latency_ms
                })
            
            elif frame_data.get("type") == "close":
                break
                
    except WebSocketDisconnect:
        print("WebSocket client disconnected")
    except Exception as e:
        print(f"WebSocket error: {e}")
        import traceback
        traceback.print_exc()
        try:
            await websocket.send_json({"error": str(e)})
        except:
            pass


# --- HEALTH CHECK ---
@app.get("/")
async def health_check():
    """Simple health check endpoint."""
    return {"status": "ok", "model_loaded": model_counter is not None}


if __name__ == "__main__":
    import uvicorn
    # To run this server: uvicorn app:app --reload --host 0.0.0.0 --port 8000
    uvicorn.run(app, host="0.0.0.0", port=8000)