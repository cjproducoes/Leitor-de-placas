import React, { useState, useCallback } from 'react';
import { CameraFeed } from './components/CameraFeed';
import { ScannedPlate } from './types';

export default function App() {
  const [scannedPlates, setScannedPlates] = useState<ScannedPlate[]>([]);
  const [isAutoScanning, setIsAutoScanning] = useState(true);
  
  // Use a Set to prevent duplicate recent scans effectively in the UI logic if needed,
  // but for state we simply check existence.
  const handlePlateDetected = useCallback((plateText: string, image: string) => {
    setScannedPlates(prev => {
      // Clean up text
      const cleanText = plateText.replace(/[^A-Z0-9-]/gi, '').toUpperCase();
      
      // Avoid duplicate entries if the exact same plate was just scanned recently
      const exists = prev.some(p => p.text === cleanText);
      if (exists) {
        // Optional: Move to top or update timestamp? For now, we just ignore duplicates to keep list clean
        return prev;
      }

      const newPlate: ScannedPlate = {
        id: crypto.randomUUID(),
        text: cleanText,
        timestamp: new Date(),
        imageUrl: image
      };

      // Keep only last 10
      return [newPlate, ...prev].slice(0, 10);
    });
  }, []);

  const clearHistory = () => setScannedPlates([]);

  return (
    <div className="min-h-screen bg-slate-950 flex flex-col md:flex-row text-white overflow-hidden">
      
      {/* Left Panel: Camera */}
      <div className="flex-1 flex flex-col h-[60vh] md:h-screen relative p-4">
        <header className="absolute top-4 left-4 z-40 bg-black/40 backdrop-blur-md p-2 rounded-lg">
          <h1 className="text-xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-blue-400 to-indigo-400">
            AutoPlate AI
          </h1>
          <p className="text-xs text-gray-300">Detecção Automática</p>
        </header>

        <div className="w-full h-full rounded-2xl overflow-hidden border border-slate-800 relative bg-black shadow-2xl">
          <CameraFeed 
            onPlateDetected={handlePlateDetected} 
            isAutoScanning={isAutoScanning}
          />
        </div>

        {/* Floating Controls */}
        <div className="absolute bottom-8 left-0 right-0 flex justify-center z-40">
           <div className="bg-slate-900/80 backdrop-blur-lg border border-slate-700 rounded-full p-2 flex gap-4 shadow-xl">
             <button
               onClick={() => setIsAutoScanning(!isAutoScanning)}
               className={`flex items-center gap-2 px-6 py-3 rounded-full font-semibold transition-all duration-300 ${
                 isAutoScanning 
                   ? 'bg-blue-600 hover:bg-blue-500 text-white shadow-[0_0_15px_rgba(37,99,235,0.5)]' 
                   : 'bg-slate-700 hover:bg-slate-600 text-gray-300'
               }`}
             >
               {isAutoScanning ? (
                 <>
                   <span className="relative flex h-3 w-3">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-white opacity-75"></span>
                      <span className="relative inline-flex rounded-full h-3 w-3 bg-white"></span>
                    </span>
                   AUTO SCAN ON
                 </>
               ) : (
                 <>
                   <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM9.555 7.168A1 1 0 008 8v4a1 1 0 001.555.832l3-2a1 1 0 000-1.664l-3-2z" clipRule="evenodd" />
                  </svg>
                   START
                 </>
               )}
             </button>
           </div>
        </div>
      </div>

      {/* Right Panel: History List */}
      <div className="w-full md:w-96 bg-slate-900 border-l border-slate-800 flex flex-col h-[40vh] md:h-screen">
        <div className="p-4 border-b border-slate-800 flex justify-between items-center bg-slate-900 sticky top-0 z-10">
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-indigo-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" />
            </svg>
            Histórico ({scannedPlates.length})
          </h2>
          {scannedPlates.length > 0 && (
            <button 
              onClick={clearHistory}
              className="text-xs text-red-400 hover:text-red-300 hover:bg-red-400/10 px-2 py-1 rounded transition-colors"
            >
              Limpar
            </button>
          )}
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {scannedPlates.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-slate-600 space-y-4">
              <div className="w-16 h-16 rounded-full bg-slate-800/50 flex items-center justify-center border border-slate-700">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
              </div>
              <p className="text-center text-sm px-8">
                Aponte a câmera para a frente ou traseira de um veículo para detectar a placa automaticamente.
              </p>
            </div>
          ) : (
            scannedPlates.map((plate) => (
              <div 
                key={plate.id} 
                className="bg-slate-800 rounded-xl overflow-hidden border border-slate-700 shadow-sm animate-[fadeIn_0.5s_ease-out]"
              >
                <div className="flex p-3 gap-3">
                  <div className="w-20 h-20 bg-black rounded-lg overflow-hidden shrink-0 border border-slate-600">
                     {plate.imageUrl && (
                       <img src={plate.imageUrl} alt="Plate" className="w-full h-full object-cover" />
                     )}
                  </div>
                  <div className="flex-1 flex flex-col justify-center">
                    <p className="text-xs text-slate-400 mb-1">
                      {plate.timestamp.toLocaleTimeString()}
                    </p>
                    {/* License Plate Graphic Simulation */}
                    <div className="bg-white text-black border-2 border-black rounded px-3 py-1 inline-block self-start shadow-sm">
                      <div className="flex flex-col items-center leading-none">
                         <span className="text-[8px] font-bold text-blue-800 w-full flex justify-between uppercase border-b border-gray-300 pb-0.5 mb-0.5">
                           <span>BRASIL</span>
                           <img src="https://upload.wikimedia.org/wikipedia/commons/thumb/0/05/Flag_of_Brazil.svg/20px-Flag_of_Brazil.svg.png" alt="BR" className="h-2 w-auto"/>
                         </span>
                         <span className="font-mono text-xl font-bold tracking-wider">
                           {plate.text}
                         </span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}