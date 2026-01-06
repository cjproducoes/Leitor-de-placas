import React, { useRef, useEffect, useState, useCallback } from 'react';
import { CameraStatus, ScanResult } from '../types';
import { analyzeFrame } from '../services/geminiService';
import { ScannerOverlay } from './ScannerOverlay';

interface CameraFeedProps {
  onPlateDetected: (plate: string, image: string) => void;
  isAutoScanning: boolean;
}

export const CameraFeed: React.FC<CameraFeedProps> = ({ onPlateDetected, isAutoScanning }) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const motionCanvasRef = useRef<HTMLCanvasElement>(null); // Low-res canvas for motion detection
  const previousFrameDataRef = useRef<Uint8ClampedArray | null>(null);
  const lastScanTimeRef = useRef<number>(0);
  const requestRef = useRef<number>();
  
  const [status, setStatus] = useState<CameraStatus>(CameraStatus.IDLE);
  const [isProcessing, setIsProcessing] = useState(false);
  const [motionScore, setMotionScore] = useState(0);

  // Constants
  const MOTION_THRESHOLD = 15; // Sensitivity (lower = more sensitive)
  const COOLDOWN_MS = 2500; // Minimum time between API calls (prevents 429 errors)

  // Initialize Camera
  useEffect(() => {
    let stream: MediaStream | null = null;

    const startCamera = async () => {
      setStatus(CameraStatus.STARTING);
      try {
        const constraints = {
          video: {
            facingMode: 'environment',
            width: { ideal: 1920 },
            height: { ideal: 1080 },
            frameRate: { ideal: 60 } // High FPS reduces motion blur (shorter exposure)
          },
        };
        stream = await navigator.mediaDevices.getUserMedia(constraints);
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.onloadedmetadata = () => {
            videoRef.current?.play();
            setStatus(CameraStatus.ACTIVE);
          };
        }
      } catch (err) {
        console.error("Error accessing camera:", err);
        if (err instanceof DOMException && err.name === 'NotAllowedError') {
          setStatus(CameraStatus.DENIED);
        } else {
          setStatus(CameraStatus.ERROR);
        }
      }
    };

    startCamera();

    return () => {
      if (stream) {
        stream.getTracks().forEach(track => track.stop());
      }
      if (requestRef.current) {
        cancelAnimationFrame(requestRef.current);
      }
    };
  }, []);

  // Actual Gemini Analysis Call
  const performAnalysis = useCallback(async () => {
    if (!videoRef.current || !canvasRef.current || status !== CameraStatus.ACTIVE) return;

    setIsProcessing(true);
    lastScanTimeRef.current = Date.now();

    const video = videoRef.current;
    const canvas = canvasRef.current;
    const context = canvas.getContext('2d');

    if (context) {
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      context.drawImage(video, 0, 0, canvas.width, canvas.height);
      const imageData = canvas.toDataURL('image/jpeg', 0.8);

      try {
        const result: ScanResult = await analyzeFrame(imageData);
        if (result.plates && result.plates.length > 0) {
           result.plates.forEach(plate => {
             if (plate && plate !== "null") {
               onPlateDetected(plate, imageData);
             }
           });
        }
      } catch (e) {
        console.error("Frame analysis failed", e);
      }
    }

    setIsProcessing(false);
  }, [status, onPlateDetected]);

  // Motion Detection Loop
  const checkMotionAndScan = useCallback(() => {
    if (!videoRef.current || !motionCanvasRef.current || !isAutoScanning) {
      requestRef.current = requestAnimationFrame(checkMotionAndScan);
      return;
    }

    const video = videoRef.current;
    
    // Only process if video is playing and ready
    if (video.readyState === video.HAVE_ENOUGH_DATA) {
      const motionCanvas = motionCanvasRef.current;
      const motionCtx = motionCanvas.getContext('2d', { willReadFrequently: true });
      
      // Use small dimensions for performance (32x32 is enough to detect large movements like cars)
      const w = 32;
      const h = 32;
      
      if (motionCtx) {
        motionCanvas.width = w;
        motionCanvas.height = h;
        motionCtx.drawImage(video, 0, 0, w, h);
        
        const currentFrame = motionCtx.getImageData(0, 0, w, h);
        const currentData = currentFrame.data;
        
        if (previousFrameDataRef.current) {
          const prevData = previousFrameDataRef.current;
          let diffScore = 0;
          
          // Simple pixel diff algorithm
          for (let i = 0; i < currentData.length; i += 4) {
            // Compare average brightness of pixel
            const rDiff = Math.abs(currentData[i] - prevData[i]);
            const gDiff = Math.abs(currentData[i+1] - prevData[i+1]);
            const bDiff = Math.abs(currentData[i+2] - prevData[i+2]);
            
            if ((rDiff + gDiff + bDiff) / 3 > 20) {
              diffScore++;
            }
          }
          
          const normalizedScore = Math.min(100, Math.floor((diffScore / (w * h)) * 100));
          setMotionScore(normalizedScore);

          // TRIGGER LOGIC:
          // 1. Not currently processing
          // 2. Cooldown period passed
          // 3. Motion exceeds threshold OR it's been a long time (force scan every 8s)
          const now = Date.now();
          const timeSinceLastScan = now - lastScanTimeRef.current;
          
          if (!isProcessing) {
            const hasSignificantMotion = normalizedScore > MOTION_THRESHOLD;
            const cooldownPassed = timeSinceLastScan > COOLDOWN_MS;
            const forceScan = timeSinceLastScan > 8000; // Failsafe if no motion detected

            if ((hasSignificantMotion && cooldownPassed) || forceScan) {
               // Trigger!
               performAnalysis();
            }
          }
        }
        
        // Store current frame for next comparison
        previousFrameDataRef.current = currentData;
      }
    }

    requestRef.current = requestAnimationFrame(checkMotionAndScan);
  }, [isAutoScanning, isProcessing, performAnalysis]);

  useEffect(() => {
    requestRef.current = requestAnimationFrame(checkMotionAndScan);
    return () => {
      if (requestRef.current) cancelAnimationFrame(requestRef.current);
    };
  }, [checkMotionAndScan]);

  return (
    <div className="relative w-full h-full bg-black overflow-hidden rounded-xl shadow-2xl">
      <canvas ref={canvasRef} className="hidden" />
      <canvas ref={motionCanvasRef} className="hidden" />

      <video
        ref={videoRef}
        className="w-full h-full object-cover"
        playsInline
        muted
        autoPlay
      />

      {status === CameraStatus.STARTING && (
        <div className="absolute inset-0 flex items-center justify-center bg-slate-900 z-30">
          <div className="flex flex-col items-center">
            <div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mb-2"></div>
            <p className="text-gray-300">Otimizando para movimento...</p>
          </div>
        </div>
      )}

      {status === CameraStatus.DENIED && (
        <div className="absolute inset-0 flex items-center justify-center bg-slate-900 z-30 px-6 text-center">
          <div>
             <h3 className="text-xl font-bold text-white mb-2">Permissão Negada</h3>
          </div>
        </div>
      )}

      {status === CameraStatus.ACTIVE && (
        <>
          <ScannerOverlay isScanning={isAutoScanning} />
          
          {/* HUD Info */}
          <div className="absolute top-4 right-4 flex flex-col items-end gap-2 z-30">
            {isProcessing && (
              <div className="bg-black/60 backdrop-blur-md px-3 py-1 rounded-full flex items-center border border-white/10">
                <span className="w-2 h-2 bg-yellow-400 rounded-full animate-pulse mr-2"></span>
                <span className="text-xs font-semibold text-white">Processando</span>
              </div>
            )}
            
            {/* Motion Meter */}
            <div className="bg-black/40 backdrop-blur-sm px-3 py-1 rounded-full flex items-center border border-white/5">
              <span className="text-[10px] uppercase text-gray-400 mr-2">Movimento</span>
              <div className="w-16 h-1.5 bg-gray-700 rounded-full overflow-hidden">
                <div 
                  className={`h-full transition-all duration-100 ${motionScore > MOTION_THRESHOLD ? 'bg-green-500' : 'bg-blue-500'}`} 
                  style={{ width: `${motionScore}%` }}
                />
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
};