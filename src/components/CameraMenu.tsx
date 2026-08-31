import React, { useState, useEffect, useRef } from 'react';
import { Meters } from './Meters';
import { FaceFollower } from './FaceFollower';

export interface MenuItem {
  title: string;
  themeColor: string;
  targetId: string;
}

export const menuData: MenuItem[] = [
  { title: "HOME", themeColor: "#64dfdf", targetId: "heroSection" },
  { title: "ABOUT", themeColor: "#64dfdf", targetId: "textSection1" },
  { title: "THEMES", themeColor: "#64dfdf", targetId: "themes" },
  { title: "SUBMIT", themeColor: "#64dfdf", targetId: "submissions" },
  { title: "COMMITTEE", themeColor: "#64dfdf", targetId: "committeeSection" }
];

const SPECULO_MAIN_LOGO = "https://raw.githubusercontent.com/rajansphotography/spec/main/Speculo%20_26%20white.png";
const SPECULO_LENS_LOGO = "https://raw.githubusercontent.com/rajansphotography/spec/main/Speculo%20_26%20lens.png";
const SPECULO_CAMERA_LOGO = "https://raw.githubusercontent.com/rajansphotography/spec/main/Logo%20White.png";

function SpeculoLogoStack({ className = "", compact = false, animated = false }: { className?: string; compact?: boolean; animated?: boolean }) {
  return (
    <div className={`speculo-logo-stack ${compact ? "speculo-logo-stack--compact" : ""} ${animated ? "speculo-logo-stack--animated" : ""} logo-hover-animate ${className}`} aria-label="Speculo '26">
      <img className="speculo-logo-main" src={SPECULO_MAIN_LOGO} alt="Speculo '26" draggable={false} />
      <img className="speculo-logo-lens" src={SPECULO_LENS_LOGO} alt="" draggable={false} />
    </div>
  );
}

interface CameraMenuProps {
  isOpen: boolean;
  onClose: () => void;
  onNavigate: (item: MenuItem) => void;
}

export function CameraMenu({ isOpen, onClose, onNavigate }: CameraMenuProps) {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [isWebcamMode, setIsWebcamMode] = useState(false);
  const [dialRotation, setDialRotation] = useState(0);
  const [frameCount, setFrameCount] = useState(126);
  const [isHalfPressed, setIsHalfPressed] = useState(false);
  const [isBooting, setIsBooting] = useState(false);
  const [batteryLevel, setBatteryLevel] = useState(100);
  const [currentTime, setCurrentTime] = useState("");
  const [exposureData, setExposureData] = useState({ fstop: "F1.8", shutter: "1/125", iso: "ISO 100", evOffset: 0 });
  const [showShutterFlash, setShowShutterFlash] = useState(false);
  const [showAberration, setShowAberration] = useState(false);
  const [showReview, setShowReview] = useState(false);
  const [captureStatus, setCaptureStatus] = useState<'idle' | 'saved' | 'error'>('idle');
  const [fps, setFps] = useState(60);
  
  const [wbMode, setWbMode] = useState("AUTO");
  const [wbTemp, setWbTemp] = useState(5600);
  const [focusMode, setFocusMode] = useState("AF-C");
  const [focusConfidence, setFocusConfidence] = useState(94);
  const [isoValue, setIsoValue] = useState(100);
  const [profile, setProfile] = useState("CINEMA");
  const [mediaLevel, setMediaLevel] = useState(82);
  const [sceneLight, setSceneLight] = useState(72);
  const [motionLevel, setMotionLevel] = useState(18);
  const [neuralConfidence, setNeuralConfidence] = useState(94);
  const [timecode, setTimecode] = useState("00:00:00:00");

  const [deadlineRemaining, setDeadlineRemaining] = useState({ days: 0, hours: 0, minutes: 0, seconds: 0 });

  useEffect(() => {
    const calculateCountdown = () => {
      const now = new Date();
      let targetYear = now.getFullYear();
      let targetDate = new Date(targetYear, 8, 30, 23, 59, 59); 
      if (now.getTime() > targetDate.getTime()) {
        targetDate = new Date(targetYear + 1, 8, 30, 23, 59, 59);
      }
      const diff = Math.max(0, targetDate.getTime() - now.getTime());
      const days = Math.floor(diff / (1000 * 60 * 60 * 24));
      const hours = Math.floor((diff / (1000 * 60 * 60)) % 24);
      const minutes = Math.floor((diff / (1000 * 60)) % 60);
      const seconds = Math.floor((diff / 1000) % 60);
      setDeadlineRemaining({ days, hours, minutes, seconds });
    };

    calculateCountdown();
    const timer = setInterval(calculateCountdown, 1000);
    return () => clearInterval(timer);
  }, []);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const camBodyRef = useRef<HTMLDivElement | null>(null);
  const previewIframeRef = useRef<HTMLIFrameElement | null>(null);
  const dialRef = useRef<HTMLDivElement | null>(null);

  const initAudio = () => {
    if (!audioCtxRef.current) {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (AudioCtx) audioCtxRef.current = new AudioCtx();
    }
  };

  const playSound = (type: string) => {
    if (!audioCtxRef.current) return;
    const ctx = audioCtxRef.current;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    if (type === 'click') {
      osc.type = 'square';
      osc.frequency.setValueAtTime(150, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(40, ctx.currentTime + 0.05);
      gain.gain.setValueAtTime(0.05, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.05);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.05);
    } else if (type === 'focus') {
      osc.type = 'sine';
      osc.frequency.setValueAtTime(1200, ctx.currentTime);
      gain.gain.setValueAtTime(0.05, ctx.currentTime);
      gain.gain.setValueAtTime(0, ctx.currentTime + 0.1);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.1);
    } else if (type === 'shutter') {
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(100, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(10, ctx.currentTime + 0.15);
      gain.gain.setValueAtTime(0.3, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.15);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.15);
    }
  };

  const isWebcamModeRef = useRef(false);
  useEffect(() => { isWebcamModeRef.current = isWebcamMode; }, [isWebcamMode]);

  useEffect(() => {
    if (isOpen) {
      initAudio();
      setIsBooting(true);
      const timer = setTimeout(() => setIsBooting(false), 2200);
      return () => clearTimeout(timer);
    } else {
      // Clean up webcam on close without depending on toggleWebcamMode
      if (isWebcamModeRef.current && streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
        streamRef.current = null;
        if (videoRef.current) videoRef.current.srcObject = null;
        setIsWebcamMode(false);
      }
    }
  }, [isOpen]);

  useEffect(() => {
    let interval: any;
    if (isOpen && !isBooting) {
      interval = setInterval(() => {
        const now = new Date();
        setCurrentTime(now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));

        if (Math.random() > 0.7) {
          const fstops = ["F1.4", "F1.8", "F2.0", "F2.8"];
          const isos = ["ISO 100", "ISO 200", "ISO 400"];
          const shutters = ["1/60", "1/125", "1/250"];
          setExposureData({
            fstop: fstops[Math.floor(Math.random() * fstops.length)],
            shutter: shutters[Math.floor(Math.random() * shutters.length)],
            iso: isos[Math.floor(Math.random() * isos.length)],
            evOffset: (Math.random() - 0.5) * 40
          });
        }
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [isOpen, isBooting]);

  useEffect(() => {
    if (!isOpen || isBooting) return;
    let raf = 0;
    const started = performance.now();
    const tick = () => {
      const elapsed = (performance.now() - started) / 1000;
      const totalFrames = Math.floor(elapsed * 60);
      const hh = Math.floor(totalFrames / 216000);
      const mm = Math.floor((totalFrames % 216000) / 3600);
      const ss = Math.floor((totalFrames % 3600) / 60);
      const ff = totalFrames % 60;
      setTimecode([hh, mm, ss].map(v => String(v).padStart(2, '0')).join(':') + ':' + String(ff).padStart(2, '0'));
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [isOpen, isBooting]);

  useEffect(() => {
    if (!isOpen || isBooting) return;
    const id = window.setInterval(() => {
      setNeuralConfidence(v => Math.max(82, Math.min(99, v + Math.round((Math.random() - 0.5) * 4))));
      setFocusConfidence(v => Math.max(76, Math.min(99, v + Math.round((Math.random() - 0.5) * 6))));
      setSceneLight(v => Math.max(35, Math.min(96, v + Math.round((Math.random() - 0.5) * 8))));
      setMotionLevel(v => Math.max(4, Math.min(90, v + Math.round((Math.random() - 0.5) * 10))));
    }, 900);
    return () => window.clearInterval(id);
  }, [isOpen, isBooting]);

  useEffect(() => {
    if ('getBattery' in navigator) {
      (navigator as any).getBattery().then((battery: any) => {
        setBatteryLevel(battery.level * 100);
        battery.addEventListener('levelchange', () => setBatteryLevel(battery.level * 100));
      }).catch(() => {});
    }
  }, []);

  useEffect(() => {
    if (!isOpen || isBooting) return;
    let frame = 0;
    let lastTime = performance.now();
    let animId: number;
    const calcFps = () => {
      const now = performance.now();
      frame++;
      if (now - lastTime >= 1000) {
        setFps(Math.round((frame * 1000) / (now - lastTime)));
        frame = 0;
        lastTime = now;
      }
      animId = requestAnimationFrame(calcFps);
    };
    animId = requestAnimationFrame(calcFps);
    return () => cancelAnimationFrame(animId);
  }, [isOpen, isBooting]);

  useEffect(() => {
    if (isWebcamMode || !previewIframeRef.current) return;
    const target = menuData[selectedIndex];
    const iframe = previewIframeRef.current;
    if (!iframe) return;

    if (target.targetId === 'themes') {
      if (!iframe.src.endsWith('/themes.html')) {
        iframe.src = `${import.meta.env.BASE_URL}themes.html`;
      }
    } else if (target.targetId === 'submissions') {
      if (!iframe.src.endsWith('/Submissions.html')) {
        iframe.src = `${import.meta.env.BASE_URL}Submissions.html`;
      }
    } else {
      const isMain = iframe.src.includes('/main.html');
      if (!isMain) {
        iframe.src = `${import.meta.env.BASE_URL}main.html#${target.targetId}`;
      } else {
        try {
          const doc = iframe.contentDocument;
          if (doc) {
            const el = doc.getElementById(target.targetId);
            if (el) {
              el.scrollIntoView({ behavior: 'smooth', block: 'center' });
            } else if (target.targetId === 'heroSection') {
              iframe.contentWindow?.scrollTo({ top: 0, behavior: 'smooth' });
            }
          }
          iframe.contentWindow?.postMessage({ type: 'NAVIGATE', targetId: target.targetId }, '*');
        } catch {}
      }
    }
  }, [selectedIndex, isWebcamMode]);

  const navigateMenu = (direction: number) => {
    if (!isOpen || isBooting) return;
    setSelectedIndex((prev) => {
      let next = prev + direction;
      if (next < 0) next = menuData.length - 1;
      if (next >= menuData.length) next = 0;
      return next;
    });
    playSound('click');
    setDialRotation((prev) => prev + (direction * 30));
  };

  const handleDialClick = () => {
    if (!isOpen || isBooting) return;
    navigateMenu(1);
  };

  const handleDialDoubleClick = () => {
    if (!isOpen || isBooting) return;
    executeSelection();
  };

  // Captures the current webcam frame and triggers a real file download.
  // Returns true if a photo was actually produced, false otherwise, so the
  // caller can reflect real success/failure instead of assuming it worked.
  const capturePhoto = (): boolean => {
    const video = videoRef.current;
    if (!video || video.readyState < 2 || video.videoWidth === 0) {
      console.warn('[CameraMenu] Capture failed: video not ready.');
      return false;
    }

    try {
      const canvas = document.createElement('canvas');
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const ctx = canvas.getContext('2d');
      if (!ctx) return false;

      // Mirror the capture to match what's shown in the mirrored preview.
      ctx.save();
      ctx.scale(-1, 1);
      ctx.drawImage(video, -canvas.width, 0, canvas.width, canvas.height);
      ctx.restore();

      canvas.toBlob((blob) => {
        if (!blob) {
          console.warn('[CameraMenu] Capture failed: could not encode image.');
          setCaptureStatus('error');
          return;
        }
        const url = URL.createObjectURL(blob);
        const stamp = new Date().toISOString().replace(/[:.]/g, '-');
        const a = document.createElement('a');
        a.href = url;
        a.download = `speculo-capture-${stamp}.png`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 2000);
        setCaptureStatus('saved');
      }, 'image/png');

      return true;
    } catch (err) {
      console.warn('[CameraMenu] Capture threw an error:', err);
      setCaptureStatus('error');
      return false;
    }
  };

  const executeSelection = () => {
    if (!isOpen || isBooting) return;
    playSound('shutter');

    if (!isWebcamMode) {
      onNavigate(menuData[selectedIndex]);
      return;
    }

    setShowShutterFlash(true);
    setShowAberration(true);
    setTimeout(() => {
      setShowShutterFlash(false);
      setShowAberration(false);
    }, 300);

    setCaptureStatus('idle');
    const ok = capturePhoto();
    if (!ok) setCaptureStatus('error');

    setFrameCount(f => f + 1);
    setShowReview(true);

    setTimeout(() => {
      onClose();
      setTimeout(() => setShowReview(false), 500);
    }, 1500);
  };

  const toggleWebcamMode = async () => {
    if (isBooting) return;
    initAudio();
    if (!isWebcamMode) {
      try {
        let stream: MediaStream | null = null;
        try {
          stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
        } catch (e1) {
          try {
            stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user" }, audio: false });
          } catch (e2) {
            stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" }, audio: false });
          }
        }

        if (stream) {
          streamRef.current = stream;
          if (videoRef.current) {
            videoRef.current.srcObject = stream;
            videoRef.current.play().catch(() => {});
          }
          setIsWebcamMode(true);
          playSound('click');
        }
      } catch (err) {
        console.warn("Webcam denied or unavailable:", err);
      }
    } else {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
        streamRef.current = null;
      }
      if (videoRef.current) videoRef.current.srcObject = null;
      setIsWebcamMode(false);
      playSound('click');
    }
  };

  return (
    <>
      <div className={`fixed inset-0 z-[99999] pointer-events-none transition-opacity duration-75 ${showShutterFlash ? 'opacity-100 bg-white' : 'opacity-0 bg-transparent'}`}></div>

      <div 
        className={`fixed inset-0 z-40 flex items-center justify-center p-4 sm:p-8 transition-all duration-700 ease-out ${isOpen ? 'opacity-100 pointer-events-auto bg-black/60 backdrop-blur-md' : 'opacity-0 pointer-events-none'}`}
        onWheel={(e) => {
          e.preventDefault();
          e.stopPropagation();
          if (!isOpen || isBooting) return;
          const direction = e.deltaY > 0 ? 1 : e.deltaY < 0 ? -1 : 0;
          if (direction) navigateMenu(direction);
        }}
        onMouseMove={(e) => {
          if (!isOpen || isBooting || !camBodyRef.current) return;
          const x = (e.clientX / window.innerWidth - 0.5) * 2; 
          const y = (e.clientY / window.innerHeight - 0.5) * 2; 
          camBodyRef.current.style.transform = `rotateY(${x * 3}deg) rotateX(${-y * 3}deg)`;
        }}
        onMouseLeave={() => {
          if (camBodyRef.current) camBodyRef.current.style.transform = `rotateY(0deg) rotateX(0deg)`;
        }}
      >
        {/* Click-out backdrop to close CameraOS */}
        <div className="fixed inset-0 z-[-1] cursor-pointer" onClick={onClose} aria-label="Close CameraOS" />

        <div ref={camBodyRef} className="glass-camera camera-chassis rounded-[3rem] p-6 relative transition-transform duration-200 flex flex-col items-center justify-center">
          
          <button
            type="button"
            aria-label="Camera shutter"
            title="Shutter — click to capture / confirm"
            className={`absolute top-[-13px] right-[40px] w-[54px] h-[22px] appearance-none border border-cyan-300/30 bg-gradient-to-b from-cyan-100/90 via-gray-300 to-gray-500 rounded-t-[12px] rounded-b-[4px] shadow-[0_5px_12px_rgba(0,0,0,0.55),inset_0_1px_1px_rgba(255,255,255,0.9)] cursor-pointer z-30 transition-all outline-none ${isHalfPressed ? 'top-[-9px] h-[18px] from-gray-400 via-gray-500 to-gray-600 shadow-[0_2px_6px_rgba(0,0,0,0.65),inset_0_1px_1px_rgba(255,255,255,0.5)]' : ''}`}
            onMouseDown={() => {
              if (!isOpen || isBooting) return;
              setIsHalfPressed(true);
              setTimeout(() => { if (isHalfPressed) playSound('focus'); }, 600);
            }}
            onMouseUp={() => {
              if (isHalfPressed) executeSelection();
              setIsHalfPressed(false);
            }}
            onMouseLeave={() => setIsHalfPressed(false)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                executeSelection();
              }
            }}
          />

          <div className="camera-pentaprism absolute left-1/2 -translate-x-1/2 z-50 flex items-center justify-center border-t border-l border-r border-cyan-300/20 bg-gradient-to-b from-gray-900/95 to-gray-950/80 backdrop-blur-md shadow-2xl">
            <SpeculoLogoStack compact animated />
          </div>

          <div className="camera-chassis-grid items-center justify-center w-full h-full">
            
            <div className="camera-left-controls z-10">
              <button 
                type="button"
                className="cursor-target w-12 h-12 rounded-full border border-cyan-300/20 bg-cyan-950/20 backdrop-blur shadow-lg flex items-center justify-center text-cyan-200 hover:text-white hover:bg-cyan-900/40 hover:border-cyan-300/60 transition-all cursor-pointer group" 
                onClick={onClose}
                aria-label="Return from CameraOS"
                title="Return"
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="group-hover:-translate-x-0.5 group-hover:text-cyan-300 transition-transform">
                  <path d="M19 12H5" />
                  <path d="M12 19l-7-7 7-7" />
                </svg>
              </button>
              <button className={`cursor-target w-12 h-12 rounded-full border border-cyan-300/20 bg-cyan-950/20 backdrop-blur shadow-lg flex items-center justify-center text-cyan-200 hover:bg-cyan-900/40 transition-colors ${isWebcamMode ? 'bg-cyan-500/40 border-cyan-400' : ''}`} onClick={toggleWebcamMode}>
                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" fill="currentColor" className="-rotate-90" viewBox="0 0 16 16">
                  <path d="M15 12a1 1 0 0 1-1 1H2a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1h1.172a3 3 0 0 0 2.12-.879l.83-.828A1 1 0 0 1 6.827 3h2.344a1 1 0 0 1 .707.293l.828.828A3 3 0 0 0 12.828 5H14a1 1 0 0 1 1 1v6zM2 4a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2h-1.172a2 2 0 0 1-1.414-.586l-.828-.828A2 2 0 0 0 9.172 2H6.828a2 2 0 0 0-1.414.586l-.828.828A2 2 0 0 1 3.172 4H2z"/>
                  <path d="M8 11a2.5 2.5 0 1 1 0-5 2.5 2.5 0 0 1 0 5zm0 1a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7z"/>
                </svg>
              </button>
            </div>

            <div className="camera-center-column relative w-full h-full flex flex-col items-center justify-center">

              <div 
                className={`lcd-screen glowing-outline w-full h-[88%] rounded-2xl relative border-[2px] transition-all duration-300 overflow-hidden`}
                style={{ 
                  borderColor: '#64dfdf',
                  ['--theme-color' as any]: '#64dfdf'
                }}
              >
                {!isWebcamMode && (
                  <div className="absolute inset-0 w-full h-full overflow-hidden bg-[#020508]">
                    <iframe
                      ref={previewIframeRef}
                      src={`${import.meta.env.BASE_URL}main.html`}
                      title="CameraOS Section Preview"
                      className="absolute left-0 top-0 w-[1280px] h-[800px] border-0 pointer-events-none origin-top-left"
                      style={{
                        transform: 'scale(0.58)',
                        width: '172%',
                        height: '172%',
                      }}
                      onLoad={() => {
                        try {
                          const doc = previewIframeRef.current?.contentDocument;
                          const targetId = menuData[selectedIndex]?.targetId;
                          if (doc && targetId) {
                            const el = doc.getElementById(targetId);
                            if (el) el.scrollIntoView({ behavior: 'auto', block: 'center' });
                          }
                        } catch {}
                      }}
                    />
                  </div>
                )}

                <video
                  ref={videoRef}
                  className={`absolute inset-0 w-full h-full object-cover transition-opacity duration-500 ${isWebcamMode ? 'opacity-100' : 'opacity-0'}`}
                  style={{ transform: 'scaleX(-1)' }}
                  autoPlay
                  muted
                  playsInline
                ></video>
                <div className="rule-of-thirds absolute inset-0 pointer-events-none z-10"></div>
                <div className="crt-scanlines absolute inset-0 pointer-events-none z-20 opacity-40"></div>

                <div className={`absolute inset-0 bg-black z-40 flex flex-col justify-center items-center pointer-events-none transition-opacity duration-300 ${isBooting ? 'opacity-100' : 'opacity-0'}`}>
                   <div className="w-full max-w-sm camera-font text-cyan-300 text-sm tracking-widest text-left">
                      <div className="text-xl font-bold text-white mb-4">SPECULO OS 26.08</div>
                      <div>SENSOR CHECK....... <span className="text-white">OK</span></div>
                      <div>LENS CALIBRATION... <span className="text-white">OK</span></div>
                      <div>NETWORK STATUS..... <span className="text-white">ONLINE</span></div>
                      <div className="mt-4 text-white animate-pulse">SYSTEM READY</div>
                   </div>
                </div>

                <div className={`absolute inset-0 z-30 pointer-events-none flex flex-col justify-between p-4 transition-opacity duration-500 ${!isBooting ? 'opacity-100' : 'opacity-0'}`}>
                  <div className="flex justify-between items-start w-full">
                    <div className="flex items-center gap-3 bg-black/60 px-3 py-1 rounded backdrop-blur border border-cyan-300/20">
                      <div className={`w-3 h-3 rounded-full ${isWebcamMode ? 'bg-cyan-300 animate-pulse shadow-[0_0_8px_#64dfdf]' : 'bg-cyan-300 shadow-[0_0_8px_#64dfdf]'}`}></div>
                      <span className="text-white camera-font text-sm font-bold">{isWebcamMode ? 'LIVE' : `VIEW: ${menuData[selectedIndex].title}`}</span>
                    </div>
                    <div className="flex gap-2">
                      <div className="bg-black/60 px-3 py-1 rounded backdrop-blur border border-cyan-300/20 text-white camera-font text-xs font-bold">{currentTime}</div>
                      <div className="flex items-center gap-2 bg-black/60 px-3 py-1 rounded backdrop-blur border border-cyan-300/20">
                        <span className="text-white camera-font text-xs font-bold">{Math.round(batteryLevel)}%</span>
                        <div className="w-6 h-3 border border-cyan-300/50 rounded-[2px] relative p-[1px]">
                          <div className={`h-full rounded-[1px] transition-all bg-cyan-300`} style={{ width: `${batteryLevel}%` }}></div>
                          <div className="absolute right-[-3px] top-1/2 -translate-y-1/2 w-[2px] h-[4px] bg-cyan-300 rounded-r-[1px]"></div>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Face Tracking & Focus Reticle System */}
                  <FaceFollower
                    isActive={isWebcamMode}
                    videoRef={videoRef}
                    isHalfPressed={isHalfPressed}
                    frameCount={frameCount}
                    onTrackingStateChange={(isTracking, confidence) => {
                      // Reflect the real tracking state instead of forcing a
                      // fake confidence floor when nothing is actually locked.
                      if (isTracking) {
                        setFocusConfidence(confidence);
                        setNeuralConfidence(confidence);
                      } else {
                        setFocusConfidence(0);
                      }
                    }}
                  />

                  {/* Dedicated High Performance Meters Component */}
                  <Meters fps={fps} frameCount={frameCount} evOffset={exposureData.evOffset} />
                </div>

                <div className={`absolute inset-0 bg-black/85 z-50 flex flex-col items-center justify-center transition-opacity duration-300 ${showReview ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}>
                  <div className="border border-cyan-300/40 p-3 bg-black rounded-lg">
                    <div className="text-cyan-300 camera-font text-xs tracking-widest mb-2 text-center font-bold">
                      {isWebcamMode ? (captureStatus === 'saved' ? 'PHOTO SAVED' : captureStatus === 'error' ? 'CAPTURE FAILED' : 'CAPTURING') : 'NAVIGATING TO SECTION'}
                    </div>
                    <div className="text-white/80 camera-font text-[10px] text-center">PAGE: {menuData[selectedIndex].title}<br/>FRAME: 000{frameCount}<br/>24mm · F1.8 · ISO100</div>
                  </div>
                </div>

              </div>
            </div>

            <div className="camera-right-column w-full h-full flex flex-col justify-center items-center relative z-10 py-2">
              
              <div className="w-full flex justify-center mb-2 shrink-0">
                <div className="camera-right-logo rounded-xl border border-cyan-300/20 bg-black/30 backdrop-blur-sm">
                  <img
                    src={SPECULO_CAMERA_LOGO}
                    alt="Speculo camera mark"
                    draggable={false}
                    className="camera-right-logo-image logo-hover-animate"
                  />
                </div>
              </div>

              <div className="flex flex-col items-center justify-center gap-1 w-full pb-2 shrink-0">
                {menuData.map((item, index) => (
                  <button 
                    key={index} 
                    type="button"
                    onClick={() => {
                      setSelectedIndex(index);
                      playSound('click');
                      onNavigate(menuData[index]);
                    }}
                    className={`cursor-target camera-font text-[13px] sm:text-[14px] font-bold tracking-[0.25em] uppercase transition-all duration-200 cursor-pointer relative py-1.5 text-center w-full select-none focus:outline-none ${index === selectedIndex ? 'opacity-100 text-white drop-shadow-[0_0_12px_rgba(100,223,223,0.9)]' : 'opacity-40 text-cyan-100/70 hover:opacity-85 hover:text-white'}`}
                  >
                    {item.title}
                    {index === selectedIndex && (
                      <span className="absolute right-[18%] top-1/2 -translate-y-1/2 w-2.5 h-2.5 rounded-full" style={{ backgroundColor: '#64dfdf', boxShadow: `0 0 12px #64dfdf, 0 0 4px #fff` }}></span>
                    )}
                  </button>
                ))}
              </div>

              <div className="w-full pr-2 mb-2 flex flex-col items-center gap-1.5 shrink-0">
                <div className="flex flex-col items-center gap-0.5 bg-cyan-950/30 border border-cyan-300/40 rounded-lg px-3 py-2 backdrop-blur-xl shadow-md w-full max-w-[190px]">
                  <div className="flex items-center gap-1.5 text-[8px] tracking-[0.2em] text-cyan-300 font-mono">
                    <span className="w-1.5 h-1.5 rounded-full bg-cyan-300 animate-ping"></span>
                    <span>DEADLINE</span>
                  </div>
                  <div className="camera-font text-[11px] text-white font-bold tracking-wider text-center">
                    {deadlineRemaining.days}D {String(deadlineRemaining.hours).padStart(2, '0')}H {String(deadlineRemaining.minutes).padStart(2, '0')}M {String(deadlineRemaining.seconds).padStart(2, '0')}S
                  </div>
                </div>
              </div>

              <div 
                ref={dialRef}
                onClick={handleDialClick}
                onDoubleClick={(e) => { e.preventDefault(); handleDialDoubleClick(); }}
                className="camera-dial relative flex items-center justify-center cursor-pointer select-none shrink-0"
                title="Scroll to select • Click to advance • Double-click to confirm"
              >
                <div 
                  className="absolute inset-[-10px] rounded-full shadow-[0_10px_25px_rgba(0,0,0,0.8),inset_0_0_15px_rgba(0,0,0,0.9)] z-0 transition-transform duration-75 ease-out pointer-events-none" 
                  style={{ 
                    background: 'repeating-conic-gradient(from 0deg, #222 0deg, #222 2deg, #050b10 2deg, #050b10 4deg)', 
                    transform: `rotate(${dialRotation * 2}deg)` 
                  }}
                ></div>
                <div 
                  className="absolute inset-[-1px] rounded-full border border-cyan-300/25 bg-gray-900/95 shadow-[inset_0_0_15px_rgba(0,0,0,0.8)] z-10 transition-transform duration-75 ease-out pointer-events-none" 
                  style={{ transform: `rotate(${dialRotation * 1.5}deg)` }}
                ></div>
                <div 
                  className="absolute inset-[9px] rounded-full border border-cyan-300/20 shadow-[inset_0_1px_2px_rgba(100,223,223,0.25),inset_0_0_0_4px_rgba(0,0,0,0.6)] z-20 transition-transform duration-75 ease-out pointer-events-none" 
                  style={{ 
                    background: 'conic-gradient(from 0deg, rgba(100,223,223,0.03), rgba(100,223,223,0.12), rgba(100,223,223,0.03), rgba(100,223,223,0.12), rgba(100,223,223,0.03))', 
                    backgroundImage: 'repeating-conic-gradient(rgba(100,223,223,0.08) 0 3deg, transparent 3deg 6deg)', 
                    transform: `rotate(${dialRotation}deg)` 
                  }}
                >
                  <div className="absolute top-1 left-1/2 -translate-x-1/2 w-1.5 h-3 bg-cyan-300 rounded-full shadow-[0_0_8px_#64dfdf]"></div>
                </div>
                
                <div className="cursor-target absolute z-30 text-cyan-200/70 text-[11px] hover:text-cyan-300 hover:scale-125 cursor-pointer top-[13px] select-none transition-transform" onClick={(e) => { e.stopPropagation(); navigateMenu(-1); }}>▲</div>
                <div className="cursor-target absolute z-30 text-cyan-200/70 text-[11px] hover:text-cyan-300 hover:scale-125 cursor-pointer bottom-[13px] select-none transition-transform" onClick={(e) => { e.stopPropagation(); navigateMenu(1); }}>▼</div>
                <div className="cursor-target absolute z-30 text-cyan-200/70 text-[11px] hover:text-cyan-300 hover:scale-125 cursor-pointer left-[13px] select-none transition-transform" onClick={(e) => { e.stopPropagation(); navigateMenu(-1); }}>◀</div>
                <div className="cursor-target absolute z-30 text-cyan-200/70 text-[11px] hover:text-cyan-300 hover:scale-125 cursor-pointer right-[13px] select-none transition-transform" onClick={(e) => { e.stopPropagation(); navigateMenu(1); }}>▶</div>
                
                <button 
                  type="button"
                  onClick={(e) => { e.stopPropagation(); executeSelection(); }} 
                  className="cursor-target relative z-40 w-12 h-12 rounded-full flex items-center justify-center bg-cyan-950/40 backdrop-blur-md shadow-[0_4px_12px_rgba(0,0,0,0.6),inset_0_1px_1px_rgba(100,223,223,0.5)] border border-cyan-300/40 hover:bg-cyan-900/60 hover:border-cyan-300 active:scale-95 transition-all cursor-pointer"
                  title="Navigate / Execute Selection"
                >
                  <span className="text-white text-[10px] font-bold tracking-widest drop-shadow-md">SET</span>
                </button>
              </div>
            </div>

          </div>
        </div>
      </div>
    </>
  );
}

export default CameraMenu;