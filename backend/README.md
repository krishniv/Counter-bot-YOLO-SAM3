# QualityVision AI Backend

FastAPI backend for AI Potato Count & Quality Verification System using YOLO11 nano.

## Features

- **YOLO11 Nano Model**: Real-time object detection and counting
- **Ultralytics ObjectCounter**: Accurate tracking and counting
- **FastAPI**: High-performance async API
- **Gemini API Integration**: AI-powered summary generation
- **CORS Enabled**: Ready for React frontend integration

## Prerequisites

- Python 3.11+
- pip

## Setup

1. Install dependencies:
```bash
pip install -r requirements.txt
```

2. Set up environment variables:
```bash
# Create .env file in backend directory
echo "GEMINI_API_KEY=your_api_key_here" > .env
```

3. Run the server:
```bash
python app.py
# Or with uvicorn directly:
uvicorn app:app --host 0.0.0.0 --port 8000 --reload
```

The API will be available at `http://localhost:8000`

## API Endpoints

### `GET /`
Health check endpoint.

### `GET /health`
Detailed health check with model status.

### `POST /analyze`
Analyze an image and return count with coordinates.

**Request:**
```json
{
  "image": "data:image/jpeg;base64,..."
}
```

**Response:**
```json
{
  "count": 5,
  "defects": 1,
  "reasoning": "Detected 5 items. 1 items flagged for quality review...",
  "coordinates": [
    {
      "x1": 100.0,
      "y1": 200.0,
      "x2": 150.0,
      "y2": 250.0,
      "confidence": 0.85,
      "class_id": 0
    }
  ],
  "latency_ms": 95.2
}
```

### `POST /report`
Generate hourly summary using Gemini API.

**Request:**
```json
{
  "logs": [
    {
      "timestamp": "2024-01-01T12:00:00",
      "totalCount": 10,
      "defectCount": 1
    }
  ]
}
```

**Response:**
```json
{
  "summary": "Production Summary: ..."
}
```

### `GET /stats`
Get aggregate statistics from logged data.

## Model

The YOLO11 nano model (`yolo11n.pt`) will be automatically downloaded on first run if not present.

## Performance Targets

- **Inference Latency**: <= 100ms (from image receipt to count response)
- **Counting Accuracy**: >= 98%
- **Frontend Update Latency**: <= 500ms

## Deployment

### Docker

```bash
docker build -t qualityvision-backend .
docker run -p 8000:8000 --env-file .env qualityvision-backend
```

### Google Cloud Run

```bash
gcloud run deploy qualityvision-backend \
  --source . \
  --platform managed \
  --region us-central1 \
  --allow-unauthenticated \
  --set-env-vars GEMINI_API_KEY=your_key_here
```

## Logging

Logs are written to both:
- Console (stdout)
- File: `count_logs.log`

Aggregate count data is stored in-memory for hourly summary generation.

