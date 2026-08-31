import React, { useEffect, useRef } from 'react';

interface MetersProps {
  className?: string;
  fps?: number;
  frameCount?: number;
  evOffset?: number;
}

export function Meters({ className = '', fps = 60, frameCount = 126, evOffset = 0 }: MetersProps) {
  const isoRef = useRef<HTMLSpanElement | null>(null);
  const apertureRef = useRef<HTMLSpanElement | null>(null);
  const shutterRef = useRef<HTMLSpanElement | null>(null);
  const evPointerRef = useRef<HTMLDivElement | null>(null);
  const histogramBarsRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    let animId: number;
    let lastTime = performance.now();
    let currentIsoIndex = 0;
    let currentApertureIndex = 1;
    let currentShutterIndex = 1;

    const isos = ['ISO 100', 'ISO 200', 'ISO 400', 'ISO 800', 'ISO 1600'];
    const apertures = ['F1.4', 'F1.8', 'F2.0', 'F2.8', 'F4.0'];
    const shutters = ['1/60', '1/125', '1/250', '1/500', '1/1000'];

    const updateTelemetry = (now: number) => {
      if (now - lastTime > 1200) {
        lastTime = now;
        // Jitter / update meters without React re-rendering
        if (Math.random() > 0.4) {
          currentIsoIndex = Math.floor(Math.random() * isos.length);
          currentApertureIndex = Math.floor(Math.random() * apertures.length);
          currentShutterIndex = Math.floor(Math.random() * shutters.length);

          if (isoRef.current) isoRef.current.textContent = isos[currentIsoIndex];
          if (apertureRef.current) apertureRef.current.textContent = apertures[currentApertureIndex];
          if (shutterRef.current) shutterRef.current.textContent = shutters[currentShutterIndex];
        }

        // Update histogram bars randomly
        if (histogramBarsRef.current) {
          const bars = histogramBarsRef.current.children;
          for (let i = 0; i < bars.length; i++) {
            const bar = bars[i] as HTMLElement;
            const h = 20 + Math.random() * 80;
            bar.style.height = `${h}%`;
          }
        }
      }

      animId = requestAnimationFrame(updateTelemetry);
    };

    animId = requestAnimationFrame(updateTelemetry);
    return () => cancelAnimationFrame(animId);
  }, []);

  return (
    <div className={`flex flex-col gap-2 w-full mt-auto select-none ${className}`}>
      {/* EV Gauge */}
      <div className="flex justify-center items-center text-[10px] camera-font text-white/80 gap-2">
        <span>-3</span>
        <span>-2</span>
        <span>-1</span>
        <span className="text-cyan-300 font-bold">0</span>
        <span>+1</span>
        <span>+2</span>
        <span>+3</span>
      </div>
      <div className="flex justify-center items-center w-full relative h-2">
        <div className="w-48 h-[1px] bg-cyan-300/40 relative">
          <div className="absolute top-[-2px] left-1/2 w-1 h-1.5 bg-cyan-300 -translate-x-1/2"></div>
          <div 
            ref={evPointerRef}
            className="absolute top-[-3px] left-1/2 w-[2px] h-[7px] bg-cyan-200 transition-transform duration-500" 
            style={{ transform: `translateX(${evOffset}px)` }}
          ></div>
        </div>
      </div>

      {/* Main Exposure Telemetry Bar */}
      <div className="flex justify-between items-end w-full text-[12px] camera-font text-white drop-shadow-md bg-gradient-to-t from-black/80 to-transparent pt-3 pb-1 px-2 rounded">
        <div className="flex gap-4 font-mono font-bold tracking-wider">
          <span ref={apertureRef} className="text-white hover:text-cyan-300 transition-colors">F1.8</span>
          <span className="text-cyan-300/40">|</span>
          <span ref={shutterRef} className="text-white hover:text-cyan-300 transition-colors">1/125</span>
          <span className="text-cyan-300/40">|</span>
          <span ref={isoRef} className="text-cyan-300 font-semibold hover:text-white transition-colors">ISO 100</span>
          <span className="text-cyan-300/40">|</span>
          <span className="text-cyan-300/70">24mm</span>
        </div>

        <div className="flex flex-col items-end gap-1">
          <div ref={histogramBarsRef} className="flex items-end gap-[1px] h-6 bg-black/40 p-1 rounded border border-cyan-300/20">
            {Array.from({ length: 16 }).map((_, i) => (
              <div 
                key={i} 
                className="w-1 bg-cyan-300/70 rounded-t-sm transition-all duration-300" 
                style={{ height: `${30 + (i % 4) * 15}%` }}
              ></div>
            ))}
          </div>
          <span className="text-cyan-200 text-[10px] tracking-wider">
            FPS: {fps} | FRM [ 000{frameCount} ]
          </span>
        </div>
      </div>
    </div>
  );
}

export default Meters;
