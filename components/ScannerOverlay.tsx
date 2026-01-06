import React from 'react';

interface ScannerOverlayProps {
  isScanning: boolean;
}

export const ScannerOverlay: React.FC<ScannerOverlayProps> = ({ isScanning }) => {
  return (
    <div className="absolute inset-0 pointer-events-none z-20 overflow-hidden">
      {/* HUD Corners - Full Screen */}
      <div className="absolute top-4 left-4 w-12 h-12 border-t-4 border-l-4 border-blue-500/80 rounded-tl-xl"></div>
      <div className="absolute top-4 right-4 w-12 h-12 border-t-4 border-r-4 border-blue-500/80 rounded-tr-xl"></div>
      <div className="absolute bottom-4 left-4 w-12 h-12 border-b-4 border-l-4 border-blue-500/80 rounded-bl-xl"></div>
      <div className="absolute bottom-4 right-4 w-12 h-12 border-b-4 border-r-4 border-blue-500/80 rounded-br-xl"></div>

      {/* Grid Overlay (Subtle) */}
      <div className="absolute inset-0 bg-[linear-gradient(rgba(0,150,255,0.05)_1px,transparent_1px),linear-gradient(90deg,rgba(0,150,255,0.05)_1px,transparent_1px)] bg-[size:40px_40px]"></div>

      {/* Full Screen Scanning Line */}
      {isScanning && (
        <div className="absolute left-0 right-0 h-1 bg-gradient-to-r from-transparent via-blue-500 to-transparent shadow-[0_0_20px_rgba(59,130,246,0.8)] animate-scan"></div>
      )}
      
      {/* Status Text */}
      <div className="absolute bottom-10 left-0 right-0 text-center">
         <span className="inline-block bg-black/60 backdrop-blur-sm text-blue-200 text-xs uppercase tracking-widest px-4 py-1 rounded-full border border-blue-500/30 shadow-lg">
            Monitorando Campo Visual Completo
         </span>
      </div>
    </div>
  );
};