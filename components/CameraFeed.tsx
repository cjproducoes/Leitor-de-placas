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
  const [isRateLimited, setIsRateLimited] = useState(false);

  // Constants
  const MOTION_THRESHOLD = 15; // Sensitivity (lower = more sensitive)
  const COOLDOWN_MS = 5000; // Increased to 5s to fit within free tier limits (approx 12 RPM)

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
        // If successful, ensure rate limit flag is cleared
        if (isRateLimited) setIsRateLimited(false);
        
      } catch (e: any) {
        if (e.message === "RATE_LIMIT") {
            console.warn("Quota exceeded. Pausing scans for 15s.");
            setIsRateLimited(true);
            // Apply Penalty: Push the "last scan time" into the future.
            // This tricks the motion loop into thinking we just scanned, preventing triggers.
            lastScanTimeRef.current = Date.now() + 15000; 
            
            // Auto-clear visual flag after penalty
            setTimeout(() => setIsRateLimited(false), 15000);
        } else {
            console.error("Frame analysis failed", e);
        }
      }
    }

    setIsProcessing(false);
  }, [status, onPlateDetected, isRateLimited]);

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
          
          for (let i = 0; i < currentData.length; i += 4) {
            const rDiff = Math.abs(currentData[i] - prevData[i]);
            const gDiff = Math.abs(currentData[i+1] - prevData[i+1]);
            const bDiff = Math.abs(currentData[i+2] - prevData[i+2]);
            
            if ((rDiff + gDiff + bDiff) / 3 > 20) {
              diffScore++;
            }
          }
          
          const normalizedScore = Math.min(100, Math.floor((diffScore / (w * h)) * 100));
          setMotionScore(normalizedScore);

          const now = Date.now();
          // If we are rate limited (lastScanTime is in future), this will be negative, keeping checks false
          const timeSinceLastScan = now - lastScanTimeRef.current;
          
          if (!isProcessing && !isRateLimited) {
            const hasSignificantMotion = normalizedScore > MOTION_THRESHOLD;
            const cooldownPassed = timeSinceLastScan > COOLDOWN_MS;
            // Failsafe: force scan every 10s if no motion detected, provided cooldown passed
            const forceScan = timeSinceLastScan > 10000; 

            if ((hasSignificantMotion && cooldownPassed) || forceScan) {
               performAnalysis();
            }
          }
        }
        
        previousFrameDataRef.current = currentData;
      }
    }

    requestRef.current = requestAnimationFrame(checkMotionAndScan);
  }, [isAutoScanning, isProcessing, performAnalysis, isRateLimited]);

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
          <ScannerOverlay isScanning={isAutoScanning && !isRateLimited} />
          
          {/* Rate Limit Overlay */}
          {isRateLimited && (
            <div className="absolute inset-0 flex items-center justify-center z-40 bg-black/40 backdrop-blur-sm animate-in fade-in duration-300">
               <div className="bg-red-950/90 border border-red-500/30 px-6 py-4 rounded-xl flex flex-col items-center shadow-2xl">
                 <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8 text-red-400 mb-2 animate-bounce" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                   <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                 </svg>
                 <span className="font-bold text-red-100">Cota Excedida</span>
                 <span className="text-xs text-red-300 mt-1">Aguardando 15s...</span>
               </div>
            </div>
          )}

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