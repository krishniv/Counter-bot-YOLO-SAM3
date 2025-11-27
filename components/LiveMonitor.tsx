import React, { useRef, useEffect, useState, useCallback } from 'react';
import { Camera, RefreshCw, AlertTriangle, CheckCircle, VideoOff, Upload, Play, Pause, Video } from 'lucide-react';
import { analyzeImageFrame, DetectionBox } from '../services/visionService';
import { CountLog } from '../types';

type FeedMode = 'camera' | 'video';

// Helper function to generate UUID (with fallback for older environments)
const generateUUID = (): string => {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  // Fallback UUID v4 generation
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
};

interface LiveMonitorProps {
  onNewLog: (log: CountLog) => void;
}

const LiveMonitor: React.FC<LiveMonitorProps> = ({ onNewLog }) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const overlayCanvasRef = useRef<HTMLCanvasElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const [feedMode, setFeedMode] = useState<FeedMode>('camera');
  const [streamActive, setStreamActive] = useState(false); // Indicates if a stream (camera/video) is playing/ready
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [lastAnalysis, setLastAnalysis] = useState<{count: number, defects: number, reasoning: string} | null>(null);
  const [currentDetections, setCurrentDetections] = useState<DetectionBox[]>([]);
  const [annotatedImage, setAnnotatedImage] = useState<string | null>(null); // Backend-annotated image
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [videoLoaded, setVideoLoaded] = useState(false); // Only for video file loaded state

  // Auto-analysis interval ref
  const intervalRef = useRef<number | null>(null);

  // Helper to stop any active media stream
  const stopMediaStream = useCallback(() => {
    if (videoRef.current && videoRef.current.srcObject instanceof MediaStream) {
      const tracks = videoRef.current.srcObject.getTracks();
      tracks.forEach(track => track.stop());
      videoRef.current.srcObject = null;
    }
  }, []);

  const revokeVideoURL = useCallback(() => {
    if (videoRef.current?.src && videoRef.current.src.startsWith('blob:')) {
      URL.revokeObjectURL(videoRef.current.src);
      videoRef.current.src = ""; // Clear src to prevent memory leak
    }
  }, []);

  const startCamera = useCallback(async () => {
    // 1. Cleanup before starting new stream
    stopMediaStream(); 
    revokeVideoURL(); // Ensure old video URL is revoked

    // 2. Clear interval if running
    if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ 
        video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } } 
      });
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        setStreamActive(true);
        setVideoLoaded(false);
      }
    } catch (err) {
      console.error("Camera access denied:", err);
      setStreamActive(false);
      setVideoLoaded(false);
    }
  }, [stopMediaStream, revokeVideoURL]); // Added helpers to dependency array

  const handleVideoUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file && file.type.startsWith('video/')) {
      // Cleanup existing streams/URLs before setting a new file
      stopMediaStream();
      revokeVideoURL(); 

      setVideoFile(file);
      const videoUrl = URL.createObjectURL(file);
      
      if (videoRef.current) {
        videoRef.current.srcObject = null;
        videoRef.current.src = videoUrl;
        videoRef.current.load();
        setStreamActive(true); // Stream is active once video is loaded/playing
        setVideoLoaded(false); // Will be set to true in handleVideoLoaded
      }
    } else {
      alert('Please select a valid video file');
      setStreamActive(false);
      setVideoLoaded(false);
    }
  };

  const handleVideoLoaded = useCallback(() => {
    setVideoLoaded(true);
    setStreamActive(true);
  }, []);

  const togglePlayPause = () => {
    if (videoRef.current) {
      if (videoRef.current.paused) {
        videoRef.current.play();
        setIsPlaying(true);
      } else {
        videoRef.current.pause();
        setIsPlaying(false);
      }
    }
  };

  // Function to draw bounding boxes on overlay canvas
  const drawBoundingBoxes = useCallback(() => {
    // Skip drawing if we have annotated image from backend
    if (annotatedImage) return;
    
    if (!overlayCanvasRef.current || !videoRef.current || currentDetections.length === 0) {
      // Clear canvas if no detections
      if (overlayCanvasRef.current) {
        const ctx = overlayCanvasRef.current.getContext('2d');
        if (ctx) {
          ctx.clearRect(0, 0, overlayCanvasRef.current.width, overlayCanvasRef.current.height);
        }
      }
      return;
    }

    const overlay = overlayCanvasRef.current;
    const video = videoRef.current;
    const ctx = overlay.getContext('2d');
    
    if (!ctx) return;

    // Get video display dimensions (may differ from videoWidth/Height due to CSS object-fit)
    const rect = video.getBoundingClientRect();
    const displayWidth = rect.width;
    const displayHeight = rect.height;
    const videoWidth = video.videoWidth;
    const videoHeight = video.videoHeight;

    if (videoWidth === 0 || videoHeight === 0) return;

    // Set canvas size to match video display size
    overlay.width = displayWidth;
    overlay.height = displayHeight;

    // Calculate scale factors based on how the video is displayed
    // The video uses object-cover, so we need to account for aspect ratio
    const videoAspect = videoWidth / videoHeight;
    const displayAspect = displayWidth / displayHeight;
    
    let scaleX: number, scaleY: number, offsetX: number, offsetY: number;
    
    if (videoAspect > displayAspect) {
      // Video is wider - letterboxing on top/bottom
      scaleX = displayWidth / videoWidth;
      scaleY = scaleX;
      offsetX = 0;
      offsetY = (displayHeight - videoHeight * scaleY) / 2;
    } else {
      // Video is taller - letterboxing on left/right
      scaleY = displayHeight / videoHeight;
      scaleX = scaleY;
      offsetX = (displayWidth - videoWidth * scaleX) / 2;
      offsetY = 0;
    }

    // Clear previous drawings
    ctx.clearRect(0, 0, displayWidth, displayHeight);

    // Draw each detection box
    currentDetections.forEach((detection) => {
      const x1 = detection.x1 * scaleX + offsetX;
      const y1 = detection.y1 * scaleY + offsetY;
      const x2 = detection.x2 * scaleX + offsetX;
      const y2 = detection.y2 * scaleY + offsetY;
      const width = x2 - x1;
      const height = y2 - y1;

      // Determine box color based on confidence
      // Low confidence or misclassified items in red, others in green/cyan
      const isLowConfidence = detection.confidence < 0.3;
      const boxColor = isLowConfidence ? '#ef4444' : '#06b6d4'; // red for low confidence, cyan for good
      const labelBgColor = isLowConfidence ? 'rgba(239, 68, 68, 0.8)' : 'rgba(6, 182, 212, 0.8)';

      // Draw bounding box
      ctx.strokeStyle = boxColor;
      ctx.lineWidth = 2;
      ctx.strokeRect(x1, y1, width, height);

      // Prepare label text
      const label = `${detection.class_name} ${detection.confidence.toFixed(2)}`;
      
      // Measure text for background
      ctx.font = 'bold 12px monospace';
      const textMetrics = ctx.measureText(label);
      const textWidth = textMetrics.width;
      const textHeight = 16;
      const padding = 4;

      // Draw label background
      ctx.fillStyle = labelBgColor;
      ctx.fillRect(
        x1,
        y1 - textHeight - padding * 2,
        textWidth + padding * 2,
        textHeight + padding * 2
      );

      // Draw label text
      ctx.fillStyle = '#ffffff';
      ctx.fillText(label, x1 + padding, y1 - padding);
    });
  }, [currentDetections, annotatedImage]);

  const captureAndAnalyze = useCallback(async () => {
    // Validate prerequisites
    if (!videoRef.current || !canvasRef.current || isAnalyzing || !streamActive) return;
    
    // For video mode, only analyze if video is loaded, playing, and not ended
    if (feedMode === 'video' && (!videoLoaded || videoRef.current.paused || videoRef.current.ended)) {
      return;
    }

    // Ensure video has valid dimensions (ready state)
    const videoWidth = videoRef.current.videoWidth;
    const videoHeight = videoRef.current.videoHeight;
    
    if (!videoWidth || !videoHeight || videoWidth === 0 || videoHeight === 0) {
      console.warn("Video dimensions not ready:", { videoWidth, videoHeight });
      return;
    }

    setIsAnalyzing(true);
    const context = canvasRef.current.getContext('2d', { 
      willReadFrequently: false, // Optimize for drawing, not reading
      alpha: false // No transparency needed for JPEG
    });
    
    if (!context) {
      console.error("Failed to get canvas context");
      setIsAnalyzing(false);
      return;
    }

    try {
      // Set canvas dimensions to match video frame exactly
      canvasRef.current.width = videoWidth;
      canvasRef.current.height = videoHeight;
      
      // Draw current video frame to canvas
      // This captures the frame as it appears in the video element
      context.drawImage(
        videoRef.current, 
        0, 0, 
        videoWidth, 
        videoHeight
      );
      
      // Convert canvas to base64 JPEG (quality 0.9 for better quality, backend can handle it)
      // Format: "data:image/jpeg;base64,<base64data>"
      const imageData = canvasRef.current.toDataURL('image/jpeg', 0.9);
      
      // Validate that we got image data
      if (!imageData || imageData.length < 100) {
        throw new Error("Failed to capture image data from canvas");
      }
      
      // Call Backend Service - backend expects base64 string (handles data URL format)
      const result = await analyzeImageFrame(imageData);
      
      setLastAnalysis(result);
      setCurrentDetections(result.coordinates || []);
      
      // Store annotated image from backend if available (like results.plot_im)
      if (result.annotated_image) {
        setAnnotatedImage(result.annotated_image);
      }
      
      // Log the result
      onNewLog({
        id: generateUUID(),
        timestamp: new Date().toISOString(),
        totalCount: result.count,
        goodCount: Math.max(0, result.count - result.defects),
        defectCount: result.defects,
        imageUrl: result.annotated_image || imageData // Use annotated image if available
      });
    } catch (error) {
      console.error("Analysis failed:", error);
      // Optionally set an error state here
    } finally {
      setIsAnalyzing(false);
    }
  }, [isAnalyzing, onNewLog, feedMode, videoLoaded, streamActive]);

  // Initialize camera/video when feedMode changes. Main cleanup on unmount.
  useEffect(() => {
    if (feedMode === 'camera') {
      startCamera();
    } else if (feedMode === 'video') {
      // If switching to video mode, stop camera stream and ensure UI reflects 'ready for upload'
      stopMediaStream();
      setStreamActive(false);
      setVideoLoaded(false);
      setIsPlaying(false);
    }

    // Comprehensive component unmount cleanup
    return () => {
      stopMediaStream();
      revokeVideoURL();
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [feedMode, startCamera, stopMediaStream, revokeVideoURL]); // Added helpers to dependency array

  // Auto-sampling: Runs every 2000ms (2s) when active
  useEffect(() => {
    // Clear any existing interval when dependencies change
    if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
    }

    const shouldAnalyze = streamActive && !isAnalyzing && 
                        (feedMode === 'camera' || (feedMode === 'video' && isPlaying));
    
    if (shouldAnalyze) {
      intervalRef.current = window.setInterval(() => {
        captureAndAnalyze();
      }, 2000);
    }

    // Cleanup when effect re-runs or component unmounts
    return () => { 
        if (intervalRef.current) clearInterval(intervalRef.current); 
    };
  }, [streamActive, captureAndAnalyze, isAnalyzing, feedMode, isPlaying]); // Added key dependencies

  // Handle video events (ended, play, pause, loadeddata)
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const handleEnded = () => setIsPlaying(false);
    const handlePlay = () => setIsPlaying(true);
    const handlePause = () => setIsPlaying(false);
    
    // Use the memoized handleVideoLoaded
    video.addEventListener('ended', handleEnded);
    video.addEventListener('play', handlePlay);
    video.addEventListener('pause', handlePause);
    video.addEventListener('loadeddata', handleVideoLoaded);

    return () => {
      video.removeEventListener('ended', handleEnded);
      video.removeEventListener('play', handlePlay);
      video.removeEventListener('pause', handlePause);
      video.removeEventListener('loadeddata', handleVideoLoaded);
    };
  }, [handleVideoLoaded]); // Removed videoFile as a dependency, as it's not strictly necessary here

  // Redraw bounding boxes when detections change or video resizes
  useEffect(() => {
    if (!streamActive) {
      // Clear detections and annotated image when stream stops
      setCurrentDetections([]);
      setAnnotatedImage(null);
      if (overlayCanvasRef.current) {
        const ctx = overlayCanvasRef.current.getContext('2d');
        if (ctx) {
          ctx.clearRect(0, 0, overlayCanvasRef.current.width, overlayCanvasRef.current.height);
        }
      }
      return;
    }

    drawBoundingBoxes();

    // Redraw on window resize
    const handleResize = () => {
      drawBoundingBoxes();
    };
    window.addEventListener('resize', handleResize);

    // Redraw periodically to keep boxes aligned with video (in case of CSS transforms)
    // Only if not using annotated image from backend
    const redrawInterval = setInterval(() => {
      if (streamActive && currentDetections.length > 0 && !annotatedImage) {
        drawBoundingBoxes();
      }
    }, 100);

    return () => {
      window.removeEventListener('resize', handleResize);
      clearInterval(redrawInterval);
    };
  }, [currentDetections, streamActive, drawBoundingBoxes, annotatedImage]);

  return (
    <div className="space-y-4">
      {/* Mode Selector */}
      <div className="flex items-center gap-2 bg-slate-800 p-1 rounded-lg border border-slate-700 w-fit">
        <button
          onClick={() => setFeedMode('camera')}
          className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-all ${
            feedMode === 'camera'
              ? 'bg-blue-600 text-white shadow'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <Camera className="w-4 h-4" />
          Live Camera
        </button>
        <button
          onClick={() => setFeedMode('video')}
          className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-all ${
            feedMode === 'video'
              ? 'bg-blue-600 text-white shadow'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <Video className="w-4 h-4" />
          Upload Video
        </button>
      </div>

      <div className="relative w-full aspect-video bg-black rounded-xl overflow-hidden shadow-2xl border border-slate-700 group">
        <video 
          ref={videoRef}
          autoPlay={feedMode === 'camera'}
          playsInline 
          muted 
          // Use streamActive || videoLoaded to determine if video element should be visible
          className={`w-full h-full object-cover ${streamActive ? 'block' : 'hidden'}`}
        />
        
        {/* Backend-annotated image overlay (like results.plot_im) */}
        {annotatedImage && (
          <img 
            src={annotatedImage}
            alt="Annotated detection"
            className="absolute inset-0 w-full h-full object-cover pointer-events-none"
            style={{ zIndex: 9 }}
          />
        )}
        
        {/* Overlay canvas for drawing bounding boxes (fallback if no annotated image) */}
        <canvas 
          ref={overlayCanvasRef}
          className={`absolute inset-0 w-full h-full pointer-events-none ${annotatedImage ? 'hidden' : ''}`}
          style={{ zIndex: 10 }}
        />
        
        <canvas ref={canvasRef} className="hidden" />
        <input
          ref={fileInputRef}
          type="file"
          accept="video/*"
          onChange={handleVideoUpload}
          className="hidden"
        />

        {/* Camera Feed Unavailable */}
        {!streamActive && feedMode === 'camera' && (
          <div className="absolute inset-0 flex flex-col items-center justify-center text-slate-500">
            <VideoOff className="w-12 h-12 mb-2" />
            <p>Camera feed unavailable</p>
            <button onClick={startCamera} className="mt-4 px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-500">
              Retry Connection
            </button>
          </div>
        )}

        {/* Upload Video Prompt */}
        {feedMode === 'video' && !videoLoaded && (
          <div className="absolute inset-0 flex flex-col items-center justify-center text-slate-500">
            <Upload className="w-12 h-12 mb-2" />
            <p>No video uploaded</p>
            <button 
              onClick={() => fileInputRef.current?.click()} 
              className="mt-4 px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-500 flex items-center gap-2"
            >
              <Upload className="w-4 h-4" />
              Upload Video File
            </button>
          </div>
        )}

        {/* Overlay HUD */}
        <div className="absolute inset-0 pointer-events-none p-4 flex flex-col justify-between">
          <div className="flex justify-between items-start">
            <div className="bg-black/60 backdrop-blur-md px-3 py-1 rounded border border-slate-700 text-xs text-green-400 font-mono animate-pulse">
              ● {feedMode === 'camera' ? 'LIVE FEED' : 'VIDEO PLAYBACK'} • BACKEND CONNECTED
            </div>
            <div className="bg-black/60 backdrop-blur-md px-3 py-1 rounded border border-slate-700 text-xs text-blue-300 font-mono">
              MODEL: YOLO11-NANO
            </div>
          </div>

          {/* Detection Box (Visual Decoration) */}
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none opacity-30">
            <div className="w-64 h-64 border-2 border-dashed border-green-500 rounded-lg"></div>
          </div>

          {/* Results Toast */}
          {lastAnalysis && (
            <div className="self-center mb-8 bg-slate-900/90 backdrop-blur border border-slate-600 p-4 rounded-lg shadow-xl max-w-md transition-all duration-300">
              <div className="flex items-center gap-3 mb-2">
                {lastAnalysis.defects > 0 ? <AlertTriangle className="text-yellow-500 w-5 h-5"/> : <CheckCircle className="text-green-500 w-5 h-5"/>}
                <span className="font-bold text-lg text-white">Count: {lastAnalysis.count}</span>
                <span className="text-sm text-slate-400">({lastAnalysis.defects} defects)</span>
              </div>
              <p className="text-xs text-slate-300 border-t border-slate-700 pt-2">
                System: {lastAnalysis.reasoning}
              </p>
            </div>
          )}

          {/* Controls */}
          <div className="flex justify-end gap-2 pointer-events-auto">
            {feedMode === 'video' && videoLoaded && (
              <button 
                onClick={togglePlayPause}
                className="flex items-center gap-2 px-4 py-2 rounded-lg font-semibold shadow-lg transition-colors bg-purple-600 hover:bg-purple-500 text-white"
              >
                {isPlaying ? <Pause className="w-4 h-4"/> : <Play className="w-4 h-4"/>}
                {isPlaying ? 'Pause' : 'Play'}
              </button>
            )}
            {feedMode === 'video' && !videoLoaded && (
              <button 
                onClick={() => fileInputRef.current?.click()}
                className="flex items-center gap-2 px-4 py-2 rounded-lg font-semibold shadow-lg transition-colors bg-green-600 hover:bg-green-500 text-white"
              >
                <Upload className="w-4 h-4"/>
                Upload Video
              </button>
            )}
            <button 
              onClick={captureAndAnalyze}
              disabled={isAnalyzing || !streamActive}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg font-semibold shadow-lg transition-colors ${
                isAnalyzing || !streamActive
                  ? 'bg-slate-700 text-slate-400 cursor-not-allowed'
                  : 'bg-blue-600 hover:bg-blue-500 text-white'
              }`}
            >
              {isAnalyzing ? <RefreshCw className="w-4 h-4 animate-spin"/> : <Camera className="w-4 h-4"/>}
              {isAnalyzing ? 'Processing...' : 'Manual Audit'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default LiveMonitor;