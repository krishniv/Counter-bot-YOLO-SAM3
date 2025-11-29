import React, { useRef, useEffect, useState, useCallback } from 'react';
import { Camera, RefreshCw, AlertTriangle, CheckCircle, VideoOff, Upload, Play, Pause, Video, RotateCcw } from 'lucide-react';
import { analyzeImageFrame } from '../services/visionService';
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
  onResetSession?: () => void;
}

const LiveMonitor: React.FC<LiveMonitorProps> = ({ onNewLog, onResetSession }) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const [feedMode, setFeedMode] = useState<FeedMode>('camera');
  const [streamActive, setStreamActive] = useState(false); // Indicates if a stream (camera/video) is playing/ready
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [lastAnalysis, setLastAnalysis] = useState<{count: number, defects: number, reasoning: string} | null>(null);
  const [annotatedImage, setAnnotatedImage] = useState<string | null>(null); // Backend-annotated image
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [videoLoaded, setVideoLoaded] = useState(false); // Only for video file loaded state
  const [annotationOpacity, setAnnotationOpacity] = useState(0.95); // Smooth annotation overlay

  // Refs for frame capture optimization
  const frameRequestRef = useRef<number | null>(null);
  const lastCaptureTimeRef = useRef<number>(0);
  const pendingAnalysisRef = useRef<boolean>(false);
  const annotationTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const MIN_CAPTURE_INTERVAL = 100; // Minimum 100ms between captures (10 FPS max)

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

  // Reset session - clear all state and stop streams
  const resetSession = useCallback(() => {
    // Stop all media streams
    stopMediaStream();
    revokeVideoURL();
    
    // Cancel frame requests
    if (frameRequestRef.current !== null) {
      if ('cancelVideoFrameCallback' in HTMLVideoElement.prototype) {
        (HTMLVideoElement.prototype as any).cancelVideoFrameCallback(frameRequestRef.current);
      } else {
        cancelAnimationFrame(frameRequestRef.current);
      }
      frameRequestRef.current = null;
    }
    
    // Clear annotation timeout
    if (annotationTimeoutRef.current) {
      clearTimeout(annotationTimeoutRef.current);
      annotationTimeoutRef.current = null;
    }
    
    // Reset all state
    setStreamActive(false);
    setIsAnalyzing(false);
    setLastAnalysis(null);
    setAnnotatedImage(null);
    setVideoFile(null);
    setIsPlaying(false);
    setVideoLoaded(false);
    pendingAnalysisRef.current = false;
    lastCaptureTimeRef.current = 0;
    
    // Clear file input
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
    
    // Notify parent to reset logs
    if (onResetSession) {
      onResetSession();
    }
  }, [stopMediaStream, revokeVideoURL, onResetSession]);

  const startCamera = useCallback(async () => {
    // 1. Cleanup before starting new stream
    stopMediaStream(); 
    revokeVideoURL(); // Ensure old video URL is revoked

    // 2. Cancel any pending frame requests
    if (frameRequestRef.current !== null) {
      if ('cancelVideoFrameCallback' in HTMLVideoElement.prototype) {
        (HTMLVideoElement.prototype as any).cancelVideoFrameCallback(frameRequestRef.current);
      } else {
        cancelAnimationFrame(frameRequestRef.current);
      }
      frameRequestRef.current = null;
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


  const captureAndAnalyze = useCallback(async (skipThrottle = false) => {
    // Validate prerequisites
    if (!videoRef.current || !canvasRef.current || !streamActive) return;
    
    // For video mode, only analyze if video is loaded, playing, and not ended
    if (feedMode === 'video' && (!videoLoaded || videoRef.current.paused || videoRef.current.ended)) {
      return;
    }

    // Throttle captures to prevent overwhelming the backend
    const now = Date.now();
    if (!skipThrottle && now - lastCaptureTimeRef.current < MIN_CAPTURE_INTERVAL) {
      return;
    }
    
    // Skip if already processing (but allow queue for smoother flow)
    if (pendingAnalysisRef.current && !skipThrottle) {
      return;
    }

    // Ensure video has valid dimensions (ready state)
    const videoWidth = videoRef.current.videoWidth;
    const videoHeight = videoRef.current.videoHeight;
    
    if (!videoWidth || !videoHeight || videoWidth === 0 || videoHeight === 0) {
      return;
    }

    lastCaptureTimeRef.current = now;
    pendingAnalysisRef.current = true;
    setIsAnalyzing(true);

    try {
      const context = canvasRef.current.getContext('2d', { 
        willReadFrequently: false,
        alpha: false
      });
      
      if (!context) {
        throw new Error("Failed to get canvas context");
      }

      // Set canvas dimensions to match video frame exactly
      canvasRef.current.width = videoWidth;
      canvasRef.current.height = videoHeight;
      
      // Draw current video frame to canvas (non-blocking)
      context.drawImage(videoRef.current, 0, 0, videoWidth, videoHeight);
      
      // Convert canvas to base64 JPEG (lower quality for speed: 0.7)
      const imageData = canvasRef.current.toDataURL('image/jpeg', 0.7);
      
      if (!imageData || imageData.length < 100) {
        throw new Error("Failed to capture image data from canvas");
      }
      
      // Call Backend Service asynchronously (don't await immediately to keep stream flowing)
      analyzeImageFrame(imageData).then((result) => {
        setLastAnalysis(result);
        
        // Store annotated image from backend if available with smooth transition
        if (result.annotated_image) {
          // Clear previous timeout
          if (annotationTimeoutRef.current) {
            clearTimeout(annotationTimeoutRef.current);
          }
          // Smooth fade-in for annotation
          setAnnotationOpacity(0);
          setAnnotatedImage(result.annotated_image);
          // Trigger fade-in after a brief delay
          setTimeout(() => setAnnotationOpacity(0.95), 10);
        }
        
        // Only log if there are defects (as per requirement)
        if (result.defects > 0) {
          onNewLog({
            id: generateUUID(),
            timestamp: new Date().toISOString(),
            totalCount: result.count,
            goodCount: Math.max(0, result.count - result.defects),
            defectCount: result.defects,
            imageUrl: result.annotated_image || imageData
          });
        }
      }).catch((error) => {
        console.error("Analysis failed:", error);
      }).finally(() => {
        setIsAnalyzing(false);
        pendingAnalysisRef.current = false;
      });
      
    } catch (error) {
      console.error("Capture failed:", error);
      setIsAnalyzing(false);
      pendingAnalysisRef.current = false;
    }
  }, [onNewLog, feedMode, videoLoaded, streamActive]);

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
      if (frameRequestRef.current !== null) {
        const video = videoRef.current;
        if (video && 'cancelVideoFrameCallback' in HTMLVideoElement.prototype) {
          (HTMLVideoElement.prototype as any).cancelVideoFrameCallback.call(video, frameRequestRef.current);
        } else {
          cancelAnimationFrame(frameRequestRef.current);
        }
        frameRequestRef.current = null;
      }
    };
  }, [feedMode, startCamera, stopMediaStream, revokeVideoURL]); // Added helpers to dependency array

  // Optimized frame capture using requestVideoFrameCallback (for camera) or timeupdate (for video)
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !streamActive) {
      // Cancel any pending frame requests
      if (frameRequestRef.current !== null) {
        if ('cancelVideoFrameCallback' in HTMLVideoElement.prototype) {
          (HTMLVideoElement.prototype as any).cancelVideoFrameCallback(frameRequestRef.current);
        } else {
          cancelAnimationFrame(frameRequestRef.current);
        }
        frameRequestRef.current = null;
      }
      return;
    }

    // Type-safe wrapper for requestVideoFrameCallback
    const requestVideoFrame = (callback: (now: number, metadata: any) => void): number => {
      if ('requestVideoFrameCallback' in HTMLVideoElement.prototype) {
        return (HTMLVideoElement.prototype as any).requestVideoFrameCallback.call(video, callback);
      } else {
        // Fallback: use requestAnimationFrame
        return requestAnimationFrame(() => callback(performance.now(), {})) as unknown as number;
      }
    };

    const cancelVideoFrame = (handle: number) => {
      if ('cancelVideoFrameCallback' in HTMLVideoElement.prototype) {
        (HTMLVideoElement.prototype as any).cancelVideoFrameCallback.call(video, handle);
      } else {
        cancelAnimationFrame(handle);
      }
    };

    // For camera feed: use requestVideoFrameCallback for smooth, frame-synced capture
    if (feedMode === 'camera') {
      if ('requestVideoFrameCallback' in HTMLVideoElement.prototype) {
        // Use native requestVideoFrameCallback for frame-synced capture
        const captureFrame = (now: number, metadata: any) => {
          captureAndAnalyze();
          // Request next frame
          if (video && streamActive) {
            frameRequestRef.current = requestVideoFrame(captureFrame);
          }
        };
        frameRequestRef.current = requestVideoFrame(captureFrame);
      } else {
        // Fallback: use requestAnimationFrame for smooth capture (60fps, but throttled by MIN_CAPTURE_INTERVAL)
        const fallbackCapture = () => {
          if (video && streamActive) {
            captureAndAnalyze();
            frameRequestRef.current = requestAnimationFrame(fallbackCapture) as unknown as number;
          }
        };
        frameRequestRef.current = requestAnimationFrame(fallbackCapture) as unknown as number;
      }
    } 
    // For video file: use timeupdate event for frame-accurate capture with throttling
    else if (feedMode === 'video' && videoLoaded && isPlaying) {
      let lastTimeUpdate = 0;
      const TIME_UPDATE_THROTTLE = 0.1; // Capture every 100ms (10 FPS max for video)
      
      const handleTimeUpdate = () => {
        const currentTime = video.currentTime;
        // Throttle to prevent too frequent captures
        if (currentTime - lastTimeUpdate >= TIME_UPDATE_THROTTLE) {
          lastTimeUpdate = currentTime;
          captureAndAnalyze();
        }
      };
      
      // Capture on timeupdate (fires during playback)
      video.addEventListener('timeupdate', handleTimeUpdate);
      
      return () => {
        video.removeEventListener('timeupdate', handleTimeUpdate);
        if (frameRequestRef.current !== null) {
          cancelVideoFrame(frameRequestRef.current);
          frameRequestRef.current = null;
        }
      };
    }

    // Cleanup
    return () => {
      if (frameRequestRef.current !== null) {
        if ('cancelVideoFrameCallback' in HTMLVideoElement.prototype) {
          (HTMLVideoElement.prototype as any).cancelVideoFrameCallback.call(video, frameRequestRef.current);
        } else {
          cancelAnimationFrame(frameRequestRef.current);
        }
        frameRequestRef.current = null;
      }
    };
  }, [streamActive, captureAndAnalyze, feedMode, videoLoaded, isPlaying]);

  // Handle video events (ended, play, pause, loadeddata)
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const handleEnded = () => {
      setIsPlaying(false);
      // Graceful exit when video ends - stop analysis and cleanup
      if (frameRequestRef.current !== null) {
        if ('cancelVideoFrameCallback' in HTMLVideoElement.prototype) {
          (HTMLVideoElement.prototype as any).cancelVideoFrameCallback(frameRequestRef.current);
        } else {
          cancelAnimationFrame(frameRequestRef.current);
        }
        frameRequestRef.current = null;
      }
      pendingAnalysisRef.current = false;
      setIsAnalyzing(false);
      // Fade out annotation smoothly
      setAnnotationOpacity(0);
      setTimeout(() => setAnnotatedImage(null), 300);
    };
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

  // Clear annotated image when stream stops
  useEffect(() => {
    if (!streamActive) {
      setAnnotatedImage(null);
    }
  }, [streamActive]);

  return (
    <div className="space-y-4">
      {/* Mode Selector and Reset Button */}
      <div className="flex items-center justify-between gap-2">
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
        <button
          onClick={resetSession}
          className="flex items-center gap-2 px-4 py-2 rounded-lg bg-red-600 hover:bg-red-500 text-white text-sm font-medium transition-colors shadow-lg"
          title="Reset session and clear all data"
        >
          <RotateCcw className="w-4 h-4" />
          Reset Session
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
        
        {/* Backend-annotated image overlay (like results.plot_im) - blend with video with smooth transitions */}
        {annotatedImage && (
          <img 
            src={annotatedImage}
            alt="Annotated detection"
            className="absolute inset-0 w-full h-full object-cover pointer-events-none transition-opacity duration-300 ease-in-out"
            style={{ zIndex: 9, opacity: annotationOpacity }}
            onError={() => setAnnotatedImage(null)} // Fallback if image fails to load
          />
        )}
        
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