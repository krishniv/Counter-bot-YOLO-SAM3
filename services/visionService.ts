import { CountLog } from "../types";

// Configuration for the local FastAPI backend
const API_BASE_URL = "http://localhost:8000";

export interface AnalysisResult {
  count: number;
  defects: number;
  reasoning: string;
  annotated_image?: string; // Base64 encoded annotated image from backend
  latency_ms: number;
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