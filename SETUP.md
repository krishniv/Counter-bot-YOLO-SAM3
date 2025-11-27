# QualityVision AI - Setup Guide

Complete setup instructions for the AI Potato Count & Quality Verification System.

## System Requirements

- **Backend**: Python 3.11+
- **Frontend**: Node.js 18+
- **Model**: YOLO11 nano (auto-downloaded on first run)

## Quick Start

### 1. Backend Setup

```bash
cd backend

# Install Python dependencies
pip install -r requirements.txt

# Set up environment variables
# Create a .env file with your Gemini API key (optional, for report generation)
echo "GEMINI_API_KEY=your_api_key_here" > .env

# Run the FastAPI server
python app.py
# Or with auto-reload:
uvicorn app:app --host 0.0.0.0 --port 8000 --reload
```

The backend will be available at `http://localhost:8000`

**Note**: On first run, YOLO11 nano model (`yolo11n.pt`) will be automatically downloaded (~6MB).

### 2. Frontend Setup

```bash
# Install Node.js dependencies
npm install

# Start the development server
npm run dev
```

The frontend will be available at `http://localhost:5173` (or the port shown in terminal)

### 3. Verify Setup

1. Open the frontend in your browser
2. Grant camera permissions when prompted
3. The system should automatically start analyzing frames every 2 seconds
4. Check the backend terminal for inference logs

## Configuration

### Backend Configuration

- **Port**: Default is 8000 (change in `app.py` or via `uvicorn --port`)
- **Model**: YOLO11 nano (`yolo11n.pt`) - auto-downloaded
- **CORS**: Configured for `localhost:5173` and `localhost:3000`

### Frontend Configuration

- **API URL**: Configured in `services/visionService.ts` (default: `http://localhost:8000`)
- **Auto-sampling**: 2 seconds interval (configurable in `components/LiveMonitor.tsx`)

### Gemini API (Optional)

Required only for the `/report` endpoint (hourly summaries).

1. Get API key from: https://makersuite.google.com/app/apikey
2. Add to `backend/.env`:
   ```
   GEMINI_API_KEY=your_key_here
   ```

Without the API key, the report endpoint will return a basic summary.

## API Endpoints

### `POST /analyze`
Analyze image and return count with coordinates.

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
  "reasoning": "Detected 5 items...",
  "coordinates": [...],
  "latency_ms": 95.2
}
```

### `POST /report`
Generate AI summary from logs (requires Gemini API key).

### `GET /health`
Check backend health and model status.

### `GET /stats`
Get aggregate statistics.

## Performance Targets

- **Inference Latency**: <= 100ms ✅
- **Frontend Update**: <= 500ms ✅
- **Counting Accuracy**: >= 98% (depends on training data)

## Troubleshooting

### Backend Issues

**Model not loading:**
- Check internet connection (first-time download)
- Verify `ultralytics` package is installed
- Check disk space (~6MB for model)

**Port already in use:**
```bash
# Use a different port
uvicorn app:app --port 8001
```

**CORS errors:**
- Verify frontend origin is in `app.py` CORS configuration
- Check that backend is running on correct port

### Frontend Issues

**Camera not working:**
- Grant browser permissions
- Check HTTPS requirement (some browsers)
- Try different browser

**Backend connection failed:**
- Verify backend is running on port 8000
- Check browser console for errors
- Verify CORS configuration

## Docker Deployment

### Build and Run

```bash
cd backend
docker build -t qualityvision-backend .
docker run -p 8000:8000 --env-file .env qualityvision-backend
```

### Google Cloud Run

```bash
gcloud run deploy qualityvision-backend \
  --source ./backend \
  --platform managed \
  --region us-central1 \
  --allow-unauthenticated \
  --set-env-vars GEMINI_API_KEY=your_key_here
```

## Development

### Backend Development

```bash
# Install dev dependencies (if any)
pip install -r requirements.txt

# Run with auto-reload
uvicorn app:app --reload --host 0.0.0.0 --port 8000

# Check logs
tail -f count_logs.log
```

### Frontend Development

```bash
# Start dev server with hot reload
npm run dev

# Build for production
npm run build
```

## Testing

### Manual Testing

1. **Count Accuracy**: Place known number of items, verify count matches
2. **Latency**: Check browser network tab for `/analyze` response time
3. **Real-time Updates**: Verify counter updates within 500ms

### API Testing

```bash
# Health check
curl http://localhost:8000/health

# Test analyze (with base64 image)
curl -X POST http://localhost:8000/analyze \
  -H "Content-Type: application/json" \
  -d '{"image": "data:image/jpeg;base64,..."}'
```

## Production Checklist

- [ ] Set `GEMINI_API_KEY` environment variable
- [ ] Configure proper CORS origins
- [ ] Set up logging/monitoring
- [ ] Optimize model inference (GPU/VPU if available)
- [ ] Configure reverse proxy (nginx) if needed
- [ ] Set up SSL/TLS certificates
- [ ] Configure rate limiting
- [ ] Set up backup for count logs

## Support

For issues or questions, check:
- Backend logs: `backend/count_logs.log`
- Browser console for frontend errors
- FastAPI docs: `http://localhost:8000/docs` (when running)

