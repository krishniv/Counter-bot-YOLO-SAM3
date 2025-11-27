export interface CountLog {
  id: string;
  timestamp: string;
  totalCount: number;
  goodCount: number;
  defectCount: number;
  imageUrl?: string; // Optional snapshot for the log
}

export interface SystemStatus {
  isLive: boolean;
  latencyMs: number;
  fps: number;
  activeModel: string;
}

export interface AnalysisResult {
  count: number;
  defects: number;
  reasoning: string;
}

export enum Tab {
  OPERATOR = 'OPERATOR',
  MANAGER = 'MANAGER',
}