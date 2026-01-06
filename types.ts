export interface ScannedPlate {
  id: string;
  text: string;
  timestamp: Date;
  confidence?: string; // High, Medium, Low inference
  imageUrl?: string; // Thumbnail of the scan
}

export interface ScanResult {
  plates: string[]; // Changed from single nullable string to array of strings
}

export enum CameraStatus {
  IDLE = 'IDLE',
  STARTING = 'STARTING',
  ACTIVE = 'ACTIVE',
  ERROR = 'ERROR',
  DENIED = 'DENIED'
}