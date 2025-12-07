import React, { useRef, useEffect, useState, useCallback } from 'react';
import { Camera, RefreshCw, AlertTriangle, CheckCircle, VideoOff, Upload, Play, Pause, Video, RotateCcw } from 'lucide-react';
import { VideoStreamWebSocket } from '../services/visionService';
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
  const [showSummary, setShowSummary] = useState(false); // Show summary popup
  const [videoSummary, setVideoSummary] = useState({ totalCount: 0, totalDefects: 0, totalGood: 0 }); // Video summary stats
  const [playbackSpeed, setPlaybackSpeed] = useState(0.75); // Default to 0.75x speed for smoother playback
  const [totalCountDisplay, setTotalCountDisplay] = useState(0); // Total count for display

  // Refs for frame capture optimization
  const frameRequestRef = useRef<number | null>(null);
  const lastCaptureTimeRef = useRef<number>(0);
  const pendingAnalysisRef = useRef<boolean>(false);
  const annotationTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const MIN_CAPTURE_INTERVAL = 50; // Reduced to 50ms for video mode (20 FPS) to reduce lag
  const videoStatsRef = useRef({ totalCount: 0, totalDefects: 0, totalGood: 0 }); // Track video stats
  const wsRef = useRef<VideoStreamWebSocket | null>(null); // WebSocket connection
  const [wsConnected, setWsConnected] = useState(false); // WebSocket connection status
  const MAX_IMAGE_WIDTH = 640; // Optimize: resize images before sending
  const MAX_IMAGE_HEIGHT = 480;

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
    // Disconnect WebSocket
    if (wsRef.current) {
      wsRef.current.disconnect();
      wsRef.current = null;
      setWsConnected(false);
    }
    
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
    setShowSummary(false);
    setTotalCountDisplay(0);
    pendingAnalysisRef.current = false;
    lastCaptureTimeRef.current = 0;
    videoStatsRef.current = { totalCount: 0, totalDefects: 0, totalGood: 0 };
    
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

      // Reset video statistics for new video
      videoStatsRef.current = { totalCount: 0, totalDefects: 0, totalGood: 0 };
      setTotalCountDisplay(0);
      setShowSummary(false);

      setVideoFile(file);
      const videoUrl = URL.createObjectURL(file);
      
      if (videoRef.current) {
        videoRef.current.srcObject = null;
        videoRef.current.src = videoUrl;
        videoRef.current.load();
        // Set playback speed when video is loaded
        videoRef.current.playbackRate = playbackSpeed;
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
    // Set playback speed when video loads
    if (videoRef.current) {
      videoRef.current.playbackRate = playbackSpeed;
    }
  }, [playbackSpeed]);

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

  const handlePlaybackSpeedChange = (speed: number) => {
    setPlaybackSpeed(speed);
    if (videoRef.current) {
      videoRef.current.playbackRate = speed;
    }
  };


  const captureAndAnalyze = useCallback(async (skipThrottle = false) => {
    // Validate prerequisites
    if (!videoRef.current || !canvasRef.current || !streamActive) return;
    
    // For video mode, only analyze if video is loaded, playing, and not ended
    if (feedMode === 'video' && (!videoLoaded || videoRef.current.paused || videoRef.current.ended)) {
      return;
    }

    // Throttle captures - use different interval for video vs camera
    const now = Date.now();
    const captureInterval = feedMode === 'video' ? 50 : MIN_CAPTURE_INTERVAL; // Faster for video
    if (!skipThrottle && now - lastCaptureTimeRef.current < captureInterval) {
      return;
    }
    
    // Skip if WebSocket is not connected
    if (!wsRef.current || !wsRef.current.isConnected()) {
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

      // Optimize: Resize image if larger than max dimensions to reduce payload
      let targetWidth = videoWidth;
      let targetHeight = videoHeight;
      
      if (videoWidth > MAX_IMAGE_WIDTH || videoHeight > MAX_IMAGE_HEIGHT) {
        const scale = Math.min(MAX_IMAGE_WIDTH / videoWidth, MAX_IMAGE_HEIGHT / videoHeight);
        targetWidth = Math.floor(videoWidth * scale);
        targetHeight = Math.floor(videoHeight * scale);
      }

      // Set canvas dimensions to optimized size
      canvasRef.current.width = targetWidth;
      canvasRef.current.height = targetHeight;
      
      // Draw current video frame to canvas (scaled if needed)
      context.drawImage(videoRef.current, 0, 0, targetWidth, targetHeight);
      
      // Convert canvas to base64 JPEG (lower quality for speed: 0.6)
      const imageData = canvasRef.current.toDataURL('image/jpeg', 0.6);
      
      if (!imageData || imageData.length < 100) {
        throw new Error("Failed to capture image data from canvas");
      }
      
      // Send frame via WebSocket (non-blocking, much faster than HTTP)
      if (wsRef.current) {
        wsRef.current.sendFrame(imageData);
      }
      
    } catch (error) {
      console.error("Capture failed:", error);
      setIsAnalyzing(false);
      pendingAnalysisRef.current = false;
    }
  }, [feedMode, videoLoaded, streamActive]);

  // Initialize WebSocket connection for video streaming
  useEffect(() => {
    // Create WebSocket connection instance (but don't connect yet)
    if (!wsRef.current) {
      wsRef.current = new VideoStreamWebSocket();
    }

    // Connect WebSocket when component mounts or when needed
    const connectWebSocket = async () => {
      if (wsRef.current && !wsRef.current.isConnected()) {
        console.log("Initializing WebSocket connection...");
        await wsRef.current.connect(
          (result) => {
            // Handle analysis result
            setLastAnalysis({
              count: result.count,
              defects: result.defects,
              reasoning: result.reasoning
            });
            
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
            
            // Track video statistics for summary
            if (feedMode === 'video') {
              videoStatsRef.current.totalCount += result.count;
              videoStatsRef.current.totalDefects += result.defects;
              videoStatsRef.current.totalGood += Math.max(0, result.count - result.defects);
              // Update total count display for video mode
              setTotalCountDisplay(videoStatsRef.current.totalCount);
            }
            
            // Only log if there are defects (as per requirement)
            if (result.defects > 0) {
              onNewLog({
                id: generateUUID(),
                timestamp: new Date().toISOString(),
                totalCount: result.count,
                goodCount: Math.max(0, result.count - result.defects),
                defectCount: result.defects,
                imageUrl: result.annotated_image || ''
              });
            }
            
            // Reset pending flag
            setIsAnalyzing(false);
            pendingAnalysisRef.current = false;
          },
          (error) => {
            console.error("WebSocket error:", error);
            setIsAnalyzing(false);
            pendingAnalysisRef.current = false;
          },
          () => {
            console.log("✅ WebSocket connected");
            setWsConnected(true);
          },
          () => {
            console.log("⚠️ WebSocket disconnected");
            setWsConnected(false);
          }
        );
      }
    };

    // Connect immediately
    connectWebSocket();

    // Cleanup on unmount
    return () => {
      if (wsRef.current) {
        wsRef.current.disconnect();
        wsRef.current = null;
        setWsConnected(false);
      }
    };
  }, [feedMode, onNewLog]);

  // Initialize camera/video when feedMode changes. Main cleanup on unmount.
  useEffect(() => {
    if (feedMode === 'camera') {
      startCamera();
      // Reset count display when switching to camera
      setTotalCountDisplay(0);
    } else if (feedMode === 'video') {
      // If switching to video mode, stop camera stream and ensure UI reflects 'ready for upload'
      stopMediaStream();
      setStreamActive(false);
      setVideoLoaded(false);
      setIsPlaying(false);
      // Reset count display when switching to video
      setTotalCountDisplay(0);
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
      // Ensure video is paused after ending
      if (videoRef.current && !videoRef.current.paused) {
        videoRef.current.pause();
      }
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
      
      // Show summary popup with total count
      if (feedMode === 'video') {
        setVideoSummary({
          totalCount: videoStatsRef.current.totalCount,
          totalDefects: videoStatsRef.current.totalDefects,
          totalGood: videoStatsRef.current.totalGood
        });
        setShowSummary(true);
      }
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
            <div className={`bg-black/60 backdrop-blur-md px-3 py-1 rounded border border-slate-700 text-xs font-mono ${wsConnected ? 'text-green-400 animate-pulse' : 'text-yellow-400'}`}>
              ● {feedMode === 'camera' ? 'LIVE FEED' : 'VIDEO PLAYBACK'} • {wsConnected ? 'WEBSOCKET CONNECTED' : 'CONNECTING...'}
            </div>
            <div className="bg-black/60 backdrop-blur-md px-3 py-1 rounded border border-slate-700 text-xs text-blue-300 font-mono">
              MODEL: YOLO11-NANO
            </div>
          </div>
          
          {/* WebSocket Connection Error Warning */}
          {!wsConnected && streamActive && (
            <div className="self-center mt-4 bg-yellow-900/90 backdrop-blur border border-yellow-700 p-3 rounded-lg shadow-xl max-w-md pointer-events-auto">
              <div className="flex items-center gap-2 text-yellow-300 text-sm">
                <AlertTriangle className="w-4 h-4" />
                <span className="font-semibold">WebSocket Connecting...</span>
              </div>
              <p className="text-xs text-yellow-400 mt-1">
                Ensure backend is running on port 8000. Check browser console for details.
              </p>
            </div>
          )}

          {/* Total Count Display - Prominent (Video Mode Only) */}
          {feedMode === 'video' && streamActive && totalCountDisplay > 0 && (
            <div className="self-center mb-4 bg-blue-900/90 backdrop-blur border-2 border-blue-500 p-4 rounded-lg shadow-xl">
              <div className="flex items-center gap-3">
                <CheckCircle className="text-blue-300 w-6 h-6"/>
  
              </div>
            </div>
          )}

          {/* Results Toast */}
          {lastAnalysis && (
            <div className="self-center mb-8 bg-slate-900/90 backdrop-blur border border-slate-600 p-4 rounded-lg shadow-xl max-w-md transition-all duration-300">
              <div className="flex items-center gap-3 mb-2">
                {lastAnalysis.defects > 0 ? <AlertTriangle className="text-yellow-500 w-5 h-5"/> : <CheckCircle className="text-green-500 w-5 h-5"/>}
                <span className="font-bold text-lg text-white">Frame Count: {lastAnalysis.count}</span>
              </div>
              <p className="text-xs text-slate-300 border-t border-slate-700 pt-2">
                System: {lastAnalysis.reasoning}
              </p>
            </div>
          )}

          {/* Controls */}
          <div className="flex justify-end gap-2 pointer-events-auto">
            {feedMode === 'video' && videoLoaded && (
              <>
                {/* Playback Speed Control */}
                <div className="flex items-center gap-2 bg-black/60 backdrop-blur-md px-3 py-2 rounded-lg border border-slate-700">
                  <label className="text-xs text-slate-300">Speed:</label>
                  <select
                    value={playbackSpeed}
                    onChange={(e) => handlePlaybackSpeedChange(parseFloat(e.target.value))}
                    className="bg-slate-700 text-white text-xs px-2 py-1 rounded border border-slate-600 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="0.25">0.25x</option>
                    <option value="0.5">0.5x</option>
                    <option value="0.75">0.75x</option>
                    <option value="1.0">1.0x</option>
                    <option value="1.25">1.25x</option>
                    <option value="1.5">1.5x</option>
                    <option value="2.0">2.0x</option>
                  </select>
                </div>
                <button 
                  onClick={togglePlayPause}
                  className="flex items-center gap-2 px-4 py-2 rounded-lg font-semibold shadow-lg transition-colors bg-purple-600 hover:bg-purple-500 text-white"
                >
                  {isPlaying ? <Pause className="w-4 h-4"/> : <Play className="w-4 h-4"/>}
                  {isPlaying ? 'Pause' : 'Play'}
                </button>
              </>
            )}
          </div>
        </div>
      </div>

      
    </div>
  );
};

export default LiveMonitor;