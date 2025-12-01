import { CountLog } from "../types";

// Configuration for the local FastAPI backend
const API_BASE_URL = "http://localhost:8000";
const WS_BASE_URL = "ws://localhost:8000";

export interface AnalysisResult {
  count: number;
  defects: number;
  reasoning: string;
  annotated_image?: string; // Base64 encoded annotated image from backend
  latency_ms: number;
}

// WebSocket connection manager for video streaming
export class VideoStreamWebSocket {
  private ws: WebSocket | null = null;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private reconnectDelay = 1000;
  private messageQueue: string[] = [];
  private isConnecting = false;
  private onMessageCallback: ((result: AnalysisResult) => void) | null = null;
  private onErrorCallback: ((error: string) => void) | null = null;
  private onConnectCallback: (() => void) | null = null;
  private onDisconnectCallback: (() => void) | null = null;

  constructor() {
    // Initialize connection lazily
  }

  async connect(
    onMessage: (result: AnalysisResult) => void,
    onError?: (error: string) => void,
    onConnect?: () => void,
    onDisconnect?: () => void
  ) {
    this.onMessageCallback = onMessage;
    this.onErrorCallback = onError;
    this.onConnectCallback = onConnect;
    this.onDisconnectCallback = onDisconnect;

    if (this.ws?.readyState === WebSocket.OPEN) {
      if (onConnect) onConnect();
      return;
    }

    if (this.isConnecting) {
      return;
    }

    // Check if backend is reachable before attempting WebSocket connection
    try {
      const healthCheck = await fetch(`${API_BASE_URL}/`);
      if (!healthCheck.ok) {
        throw new Error(`Backend health check failed: ${healthCheck.status}`);
      }
      console.log("✅ Backend health check passed");
    } catch (error) {
      console.error("❌ Backend not reachable:", error);
      if (this.onErrorCallback) {
        this.onErrorCallback(`Backend not reachable at ${API_BASE_URL}. Please ensure the backend is running.`);
      }
      return;
    }

    this.isConnecting = true;
    
    try {
      const wsUrl = `${WS_BASE_URL}/ws/video`;
      console.log(`Attempting WebSocket connection to: ${wsUrl}`);
      this.ws = new WebSocket(wsUrl);

      this.ws.onopen = () => {
        console.log("✅ WebSocket connected successfully for video streaming");
        this.isConnecting = false;
        this.reconnectAttempts = 0;
        
        // Send any queued messages
        while (this.messageQueue.length > 0) {
          const message = this.messageQueue.shift();
          if (message && this.ws?.readyState === WebSocket.OPEN) {
            this.ws.send(message);
          }
        }

        if (this.onConnectCallback) {
          this.onConnectCallback();
        }
      };

      this.ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          
          if (data.type === "result") {
            const result: AnalysisResult = {
              count: data.count || 0,
              defects: data.defects || 0,
              reasoning: data.reasoning || `Detected ${data.count || 0} tracked cookie(s)`,
              annotated_image: data.annotated_image,
              latency_ms: data.latency_ms || 0
            };
            
            if (this.onMessageCallback) {
              this.onMessageCallback(result);
            }
          } else if (data.error) {
            console.error("WebSocket server error:", data.error);
            if (this.onErrorCallback) {
              this.onErrorCallback(data.error);
            }
          }
        } catch (error) {
          console.error("Error parsing WebSocket message:", error);
          if (this.onErrorCallback) {
            this.onErrorCallback("Failed to parse server response");
          }
        }
      };

      this.ws.onerror = (error) => {
        console.error("❌ WebSocket connection error:", error);
        console.error("   Make sure the backend is running on port 8000");
        console.error("   URL attempted:", `${WS_BASE_URL}/ws/video`);
        this.isConnecting = false;
        if (this.onErrorCallback) {
          this.onErrorCallback(`WebSocket connection failed. Ensure backend is running at ${WS_BASE_URL}`);
        }
      };

      this.ws.onclose = (event) => {
        console.log(`WebSocket disconnected (code: ${event.code}, reason: ${event.reason || 'none'})`);
        this.isConnecting = false;
        
        if (this.onDisconnectCallback) {
          this.onDisconnectCallback();
        }

        // Attempt to reconnect if not manually closed and not a normal closure
        if (event.code !== 1000 && this.reconnectAttempts < this.maxReconnectAttempts) {
          this.reconnectAttempts++;
          const delay = this.reconnectDelay * Math.pow(2, this.reconnectAttempts - 1); // Exponential backoff
          console.log(`Retrying WebSocket connection in ${delay}ms (attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts})`);
          setTimeout(() => {
            if (this.onMessageCallback && !this.ws) {
              this.connect(
                this.onMessageCallback,
                this.onErrorCallback || undefined,
                this.onConnectCallback || undefined,
                this.onDisconnectCallback || undefined
              );
            }
          }, delay);
        } else if (this.reconnectAttempts >= this.maxReconnectAttempts) {
          console.error("❌ Max WebSocket reconnection attempts reached. Please check backend connection.");
        }
      };
    } catch (error) {
      console.error("❌ Failed to create WebSocket:", error);
      this.isConnecting = false;
      if (this.onErrorCallback) {
        this.onErrorCallback(`Failed to create WebSocket: ${error}`);
      }
    }
  }

  sendFrame(base64Image: string) {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      // Queue message if not connected
      const message = JSON.stringify({
        type: "frame",
        image: base64Image
      });
      this.messageQueue.push(message);
      
      // Try to reconnect if not already connecting
      if (!this.isConnecting && this.onMessageCallback) {
        this.connect(
          this.onMessageCallback,
          this.onErrorCallback || undefined,
          this.onConnectCallback || undefined,
          this.onDisconnectCallback || undefined
        );
      }
      return;
    }

    try {
      const message = JSON.stringify({
        type: "frame",
        image: base64Image
      });
      this.ws.send(message);
    } catch (error) {
      console.error("Error sending frame:", error);
      if (this.onErrorCallback) {
        this.onErrorCallback("Failed to send frame");
      }
    }
  }

  disconnect() {
    if (this.ws) {
      try {
        this.ws.send(JSON.stringify({ type: "close" }));
      } catch (error) {
        console.error("Error sending close message:", error);
      }
      this.ws.close();
      this.ws = null;
    }
    this.messageQueue = [];
    this.reconnectAttempts = this.maxReconnectAttempts; // Prevent reconnection
  }

  isConnected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }
}

/**
 * Sends the image frame to the local FastAPI/YOLO backend for analysis.
 * Returns count, defects, reasoning, and annotated image.
 */
export const analyzeImageFrame = async (base64Image: string): Promise<{ count: number; defects: number; reasoning: string; annotated_image?: string; latency_ms?: number }> => {
  
  // Prompt to guide the model on what to track
  const trackingPrompt = `You are tracking cookies on a conveyor belt. Your task is to:
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
7. Consider cookies with area significantly smaller than average as defects`;

  try {
    const response = await fetch(`${API_BASE_URL}/analyze`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ 
        image: base64Image,
        prompt: trackingPrompt 
      }),
    });

    if (!response.ok) {
      throw new Error(`Backend Error: ${response.status}`);
    }

    const data: AnalysisResult = await response.json();
    return {
      count: data.count,
      defects: data.defects,
      reasoning: data.reasoning,
      annotated_image: data.annotated_image,
      latency_ms: data.latency_ms
    };
  } catch (error) {
    console.error("Vision System Error:", error);
    return { 
      count: 0, 
      defects: 0, 
      reasoning: "Connection to Backend Failed. Ensure FastAPI is running on port 8000.",
      annotated_image: undefined,
      latency_ms: 0
    };
  }
};

/**
 * Requests a shift summary from the backend using Gemini API.
 */
export const generateShiftReport = async (logs: CountLog[]): Promise<string> => {
  try {
    const response = await fetch(`${API_BASE_URL}/report`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ logs }),
    });

    if (!response.ok) {
      throw new Error("Failed to fetch report");
    }

    const data = await response.json();
    return data.summary;
  } catch (error) {
    console.error("Report Error:", error);
    return "Error: Could not retrieve report from backend system. Ensure FastAPI backend is running and GEMINI_API_KEY is configured.";
  }
};