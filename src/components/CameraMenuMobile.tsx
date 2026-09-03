import React, { useState, useEffect, useRef } from 'react';
import { Meters } from './Meters';
import { FaceFollower } from './FaceFollower';
import { MenuItem, menuData } from './CameraMenu';

const SPECULO_MAIN_LOGO = "https://raw.githubusercontent.com/rajansphotography/spec/main/Speculo%20_26%20white.png";
const SPECULO_LENS_LOGO = "https://raw.githubusercontent.com/rajansphotography/spec/main/Speculo%20_26%20lens.png";
const SPECULO_CAMERA_LOGO = "https://raw.githubusercontent.com/rajansphotography/spec/main/Logo%20White.png";

/* ---------------------------------------------------------
   Static Speculo logo mark on mobile with fixed lens
   (matches main webpage logo aesthetic without rotation).
--------------------------------------------------------- */
function SpeculoLogoMobile({ className = '' }: { className?: string }) {
  return (
    <div className={`relative w-full h-full flex items-center justify-center logo-hover-animate ${className}`}>
      <img
        src={SPECULO_MAIN_LOGO}
        alt="Speculo '26"
        draggable={false}
        className="w-[85%] h-[85%] object-contain drop-shadow-[0_0_10px_rgba(255,255,255,0.35)]"
      />
      <img
        src={SPECULO_LENS_LOGO}
        alt=""
        draggable={false}
        className="absolute w-[85%] h-[85%] object-contain pointer-events-none"
      />
    </div>
  );
}

export interface CameraMenuMobileProps {
  isOpen: boolean;
  onClose: () => void;
  onNavigate: (item: MenuItem) => void;
  onSwitchToLandscape?: () => void;
}

export function CameraMenuMobile({ isOpen, onClose, onNavigate, onSwitchToLandscape }: CameraMenuMobileProps) {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [isWebcamMode, setIsWebcamMode] = useState(false);
  const [dialRotation, setDialRotation] = useState(0);
  const [frameCount, setFrameCount] = useState(126);
  const [isHalfPressed, setIsHalfPressed] = useState(false);
  const [isBooting, setIsBooting] = useState(false);
  const [batteryLevel, setBatteryLevel] = useState(100);
  const [currentTime, setCurrentTime] = useState('');
  const [deadlineCountdown, setDeadlineCountdown] = useState('00D:00H:00M');
  const [exposureData] = useState({ fstop: 'F2.8', shutter: '1/125', iso: 'ISO 1600', evOffset: 0 });
  const [showShutterFlash, setShowShutterFlash] = useState(false);
  const [showReview, setShowReview] = useState(false);
  const [fps] = useState(30);
  const [focusConfidence, setFocusConfidence] = useState(0);
  const [deviceAngle, setDeviceAngle] = useState(0);

  const [touchStart, setTouchStart] = useState<number | null>(null);
  const [touchEnd, setTouchEnd] = useState<number | null>(null);
  const [isDraggingDial, setIsDraggingDial] = useState(false);

  const [chassisSpring, setChassisSpring] = useState({ scale: 1, y: 0, rotateX: 0 });
  const [dialScale, setDialScale] = useState(1);
  const dialVelocity = useRef(0);
  const lastTimestamp = useRef(0);
  const inertiaFrame = useRef<number | null>(null);

  const dialCenter = useRef({ x: 0, y: 0 });
  const lastAngle = useRef(0);
  const accumulatedRotation = useRef(0);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const previewIframeRef = useRef<HTMLIFrameElement | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
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
      osc.frequency.setValueAtTime(180, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(40, ctx.currentTime + 0.05);
      gain.gain.setValueAtTime(0.08, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.05);
    } else if (type === 'shutter') {
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(100, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(10, ctx.currentTime + 0.15);
      gain.gain.setValueAtTime(0.4, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.15);
    } else if (type === 'dial') {
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(400, ctx.currentTime);
      gain.gain.setValueAtTime(0.02, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.02);
    } else if (type === 'focus') {
      osc.type = 'sine';
      osc.frequency.setValueAtTime(800, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(1200, ctx.currentTime + 0.05);
      gain.gain.setValueAtTime(0.05, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.1);
    }
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + (type === 'shutter' ? 0.15 : type === 'focus' ? 0.1 : type === 'dial' ? 0.02 : 0.05));
  };

  // Haptics — real vibration feedback for touch devices
  const vibrate = (pattern: number | number[]) => {
    if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
      try { navigator.vibrate(pattern); } catch {}
    }
  };

  useEffect(() => {
    if (isOpen) {
      initAudio();
      setIsBooting(true);
      const timer = setTimeout(() => setIsBooting(false), 1600);
      return () => clearTimeout(timer);
    } else if (isWebcamMode) {
      toggleWebcamMode();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  // Listen for device orientation to switch back to landscape if rotated
  useEffect(() => {
    if (!isOpen) return;
    const handleOrientation = () => {
      if (window.innerWidth > window.innerHeight && onSwitchToLandscape) {
        onSwitchToLandscape();
      }
    };
    window.addEventListener('resize', handleOrientation, { passive: true });
    window.addEventListener('orientationchange', handleOrientation, { passive: true });
    return () => {
      window.removeEventListener('resize', handleOrientation);
      window.removeEventListener('orientationchange', handleOrientation);
    };
  }, [isOpen, onSwitchToLandscape]);

  useEffect(() => {
    let interval: any;
    const calculateCountdown = () => {
      const now = new Date();
      setCurrentTime(now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));
      let targetYear = now.getFullYear();
      let targetDate = new Date(targetYear, 8, 30, 23, 59, 59);
      if (now.getTime() > targetDate.getTime()) {
        targetDate = new Date(targetYear + 1, 8, 30, 23, 59, 59);
      }
      const diff = Math.max(0, targetDate.getTime() - now.getTime());
      const days = Math.floor(diff / (1000 * 60 * 60 * 24));
      const hours = Math.floor((diff / (1000 * 60 * 60)) % 24);
      const minutes = Math.floor((diff / (1000 * 60)) % 60);
      setDeadlineCountdown(`${days.toString().padStart(2, '0')}D:${hours.toString().padStart(2, '0')}H:${minutes.toString().padStart(2, '0')}M`);
    };

    calculateCountdown();
    if (isOpen && !isBooting) {
      interval = setInterval(calculateCountdown, 1000);
    }
    return () => clearInterval(interval);
  }, [isOpen, isBooting]);

  // Update preview iframe to show the target section when navigating
  useEffect(() => {
    if (isWebcamMode || !previewIframeRef.current) return;
    const target = menuData[selectedIndex];
    const iframe = previewIframeRef.current;
    if (!iframe) return;

    if (target.targetId === 'themes') {
      if (!iframe.src.endsWith('/themes.html')) {
        iframe.src = '/themes.html';
      }
    } else if (target.targetId === 'submissions') {
      if (!iframe.src.endsWith('/Submissions.html')) {
        iframe.src = '/Submissions.html';
      }
    } else {
      const isMain = iframe.src.includes('/main.html');
      if (!isMain) {
        iframe.src = `/main.html#${target.targetId}`;
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
    vibrate(8);
  };

  // Real capture and instant download for mobile
  const capturePhoto = (): boolean => {
    const video = videoRef.current;
    if (!video || video.readyState < 2 || video.videoWidth === 0) {
      console.warn('[CameraMenuMobile] Capture failed: video not ready.');
      return false;
    }

    try {
      const canvas = document.createElement('canvas');
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const ctx = canvas.getContext('2d');
      if (!ctx) return false;

      // Mirror capture to match viewfinder preview
      ctx.save();
      ctx.scale(-1, 1);
      ctx.drawImage(video, -canvas.width, 0, canvas.width, canvas.height);
      ctx.restore();

      canvas.toBlob((blob) => {
        if (!blob) {
          console.warn('[CameraMenuMobile] Capture failed: could not encode image.');
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
      }, 'image/png');

      return true;
    } catch (err) {
      console.warn('[CameraMenuMobile] Capture error:', err);
      return false;
    }
  };

  const executeSelection = () => {
    if (!isOpen || isBooting) return;
    playSound('shutter');
    vibrate([15, 30, 15]);
    if (!isWebcamMode) {
      onNavigate(menuData[selectedIndex]);
      return;
    }
    capturePhoto();
    setShowShutterFlash(true);
    setTimeout(() => setShowShutterFlash(false), 300);
    setFrameCount((f) => f + 1);
    setShowReview(true);
    setTimeout(() => {
      onClose();
      setTimeout(() => setShowReview(false), 500);
    }, 1200);
  };

  const toggleWebcamMode = async () => {
    if (isBooting) return;
    initAudio();
    if (!isWebcamMode) {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' }, audio: false });
        if (stream) {
          streamRef.current = stream;
          if (videoRef.current) {
            videoRef.current.srcObject = stream;
            videoRef.current.play().catch(() => {});
          }
          setIsWebcamMode(true);
          playSound('click');
          vibrate(10);
        }
      } catch (err) {
        console.warn('Webcam unavailable', err);
      }
    } else {
      if (streamRef.current) streamRef.current.getTracks().forEach((t) => t.stop());
      if (videoRef.current) videoRef.current.srcObject = null;
      setIsWebcamMode(false);
      playSound('click');
    }
  };

  useEffect(() => {
    if ('getBattery' in navigator) {
      (navigator as any)
        .getBattery()
        .then((battery: any) => {
          setBatteryLevel(Math.round(battery.level * 100));
          battery.addEventListener('levelchange', () => setBatteryLevel(Math.round(battery.level * 100)));
        })
        .catch(() => {});
    }
  }, []);

  // Counter-rotate iconography against device orientation
  useEffect(() => {
    const updateAngle = () => {
      let angle = 0;
      if (window.screen?.orientation?.angle !== undefined) {
        angle = window.screen.orientation.angle;
      } else if (typeof (window as any).orientation === 'number') {
        angle = (window as any).orientation;
      }
      setDeviceAngle(angle);
    };
    window.addEventListener('orientationchange', updateAngle);
    window.addEventListener('resize', updateAngle);
    updateAngle();
    return () => {
      window.removeEventListener('orientationchange', updateAngle);
      window.removeEventListener('resize', updateAngle);
    };
  }, []);

  const iconRotationStyle = {
    transform: `rotate(${-deviceAngle}deg)`,
    transition: 'transform 0.4s cubic-bezier(0.4, 0, 0.2, 1)',
  };

  // Swipe-to-navigate across the viewfinder/chassis
  const minSwipeDistance = 50;
  const onTouchStart = (e: React.TouchEvent) => {
    if (isDraggingDial) return;
    setTouchEnd(null);
    setTouchStart(e.targetTouches[0].clientX);
  };
  const onTouchMove = (e: React.TouchEvent) => {
    if (isDraggingDial) return;
    setTouchEnd(e.targetTouches[0].clientX);
  };
  const onTouchEndHandler = () => {
    if (!touchStart || !touchEnd || isDraggingDial) return;
    const distance = touchStart - touchEnd;
    if (distance > minSwipeDistance) navigateMenu(1);
    if (distance < -minSwipeDistance) navigateMenu(-1);
  };

  // Rotary dial physics (pointer + touch, with inertia)
  const handleDialPointerDown = (e: React.PointerEvent | React.TouchEvent | React.MouseEvent) => {
    if (!dialRef.current || isBooting) return;
    const rect = dialRef.current.getBoundingClientRect();
    dialCenter.current = { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };

    let clientX = 0;
    let clientY = 0;
    if ('touches' in e) {
      clientX = e.touches[0].clientX;
      clientY = e.touches[0].clientY;
    } else {
      clientX = (e as React.MouseEvent).clientX;
      clientY = (e as React.MouseEvent).clientY;
    }

    lastAngle.current = Math.atan2(clientY - dialCenter.current.y, clientX - dialCenter.current.x) * (180 / Math.PI);
    setIsDraggingDial(true);
    accumulatedRotation.current = 0;

    if (inertiaFrame.current) cancelAnimationFrame(inertiaFrame.current);
    dialVelocity.current = 0;
    lastTimestamp.current = performance.now();
    setDialScale(0.96);
    vibrate(5);
  };

  useEffect(() => {
    const handlePointerMove = (e: MouseEvent | TouchEvent) => {
      if (!isDraggingDial) return;
      e.preventDefault();

      let clientX = 0;
      let clientY = 0;
      if ('touches' in e) {
        clientX = e.touches[0].clientX;
        clientY = e.touches[0].clientY;
      } else {
        clientX = (e as MouseEvent).clientX;
        clientY = (e as MouseEvent).clientY;
      }

      const angle = Math.atan2(clientY - dialCenter.current.y, clientX - dialCenter.current.x) * (180 / Math.PI);
      let delta = angle - lastAngle.current;
      if (delta > 180) delta -= 360;
      if (delta < -180) delta += 360;

      const now = performance.now();
      const dt = Math.max(1, now - lastTimestamp.current);
      dialVelocity.current = delta / dt;
      lastTimestamp.current = now;

      setDialRotation((prev) => prev + delta);
      accumulatedRotation.current += delta;

      if (Math.abs(accumulatedRotation.current) > 35) {
        const direction = accumulatedRotation.current > 0 ? 1 : -1;
        navigateMenu(direction);
        accumulatedRotation.current = 0;
        setDialScale(1.02);
        setTimeout(() => setDialScale(0.96), 60);
      }
      lastAngle.current = angle;
    };

    const handlePointerUp = () => {
      setIsDraggingDial(false);
      setDialScale(1);

      const friction = 0.94;
      let vel = dialVelocity.current;

      const applyInertia = () => {
        if (Math.abs(vel) < 0.05) return;
        const step = vel * 16;
        setDialRotation((prev) => prev + step);
        accumulatedRotation.current += step;

        if (Math.abs(accumulatedRotation.current) > 35) {
          const direction = accumulatedRotation.current > 0 ? 1 : -1;
          navigateMenu(direction);
          accumulatedRotation.current = 0;
          setDialScale(0.92);
          setTimeout(() => setDialScale(1), 80);
        }

        vel *= friction;
        dialVelocity.current = vel;
        inertiaFrame.current = requestAnimationFrame(applyInertia);
      };

      if (Math.abs(vel) > 0.1) {
        inertiaFrame.current = requestAnimationFrame(applyInertia);
      }
    };

    if (isDraggingDial) {
      window.addEventListener('mousemove', handlePointerMove, { passive: false });
      window.addEventListener('mouseup', handlePointerUp);
      window.addEventListener('touchmove', handlePointerMove, { passive: false });
      window.addEventListener('touchend', handlePointerUp);
    }
    return () => {
      window.removeEventListener('mousemove', handlePointerMove);
      window.removeEventListener('mouseup', handlePointerUp);
      window.removeEventListener('touchmove', handlePointerMove);
      window.removeEventListener('touchend', handlePointerUp);
    };
  }, [isDraggingDial]);

  const MenuIcons = [
    <svg key="0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.2" className="w-6 h-6 sm:w-7 sm:h-7 drop-shadow-[0_0_6px_rgba(100,223,223,0.8)]"><path d="M3 10l9-8 9 8v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path><circle cx="12" cy="14" r="3.5" stroke="currentColor"></circle><path d="M14.5 11.5L12 14l-2.5-2.5M10 16.5l2-2.5 2 2.5" strokeWidth="0.8"></path></svg>,
    <svg key="1" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.2" className="w-6 h-6 sm:w-7 sm:h-7 drop-shadow-[0_0_6px_rgba(100,223,223,0.8)]"><path d="M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10z"></path><circle cx="12" cy="8" r="1.5" fill="currentColor"></circle><path d="M11 12h1v5h1" strokeWidth="1.5"></path><path d="M4 12h3M17 12h3M12 4v3M12 17v3" strokeWidth="0.5" strokeDasharray="1 2"></path></svg>,
    <svg key="2" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.2" className="w-6 h-6 sm:w-7 sm:h-7 drop-shadow-[0_0_6px_rgba(100,223,223,0.8)]"><circle cx="12" cy="10" r="5"></circle><circle cx="8" cy="15" r="5"></circle><circle cx="16" cy="15" r="5"></circle><path d="M12 10v2M10.5 13.5l1.5-1.5M13.5 13.5l-1.5-1.5" strokeWidth="0.8"></path></svg>,
    <svg key="3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.2" className="w-6 h-6 sm:w-7 sm:h-7 drop-shadow-[0_0_6px_rgba(100,223,223,0.8)]"><path d="M20 16v3a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-3"></path><path d="M12 16V4M7 9l5-5 5 5"></path><path d="M9 16h6" strokeWidth="2"></path></svg>,
    <svg key="4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.2" className="w-6 h-6 sm:w-7 sm:h-7 drop-shadow-[0_0_6px_rgba(100,223,223,0.8)]"><circle cx="12" cy="6" r="3"></circle><circle cx="6" cy="17" r="3"></circle><circle cx="18" cy="17" r="3"></circle><path d="M11 9L8 14M13 9l3 5M8 17h8" strokeWidth="0.8" strokeDasharray="2 2"></path></svg>,
  ];

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-[90] w-full h-full bg-[#020508] flex items-center justify-center font-sans text-white overflow-hidden"
      style={{
        paddingTop: 'env(safe-area-inset-top)',
        paddingBottom: 'env(safe-area-inset-bottom)',
      }}
    >
      <style>{`
        .camera-font { font-family: 'Share Tech Mono', monospace; }

        .mobile-camera-chassis {
          width: 100%; max-width: 460px; height: 100%;
          background:
            linear-gradient(135deg, rgba(20, 50, 60, 0.98) 0%, rgba(5, 12, 16, 0.99) 100%),
            url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='1.5' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)' opacity='0.05'/%3E%3C/svg%3E");
          box-shadow: inset 0 0 10px rgba(100,223,223,0.1);
          position: relative; overflow: visible;
          display: flex; flex-direction: column;
        }

        .lcd-screen {
          background-color: #020508;
          box-shadow: inset 0 0 60px rgba(0,0,0,1), 0 0 0 2px rgba(100,223,223,0.25), 0 10px 30px rgba(0,0,0,0.8);
        }

        .rule-of-thirds {
          background:
            linear-gradient(to right, transparent 33.33%, rgba(100,223,223,0.2) 33.33%, rgba(100,223,223,0.2) 33.5%, transparent 33.5%),
            linear-gradient(to right, transparent 66.66%, rgba(100,223,223,0.2) 66.66%, rgba(100,223,223,0.2) 66.83%, transparent 66.83%),
            linear-gradient(to bottom, transparent 33.33%, rgba(100,223,223,0.2) 33.33%, rgba(100,223,223,0.2) 33.5%, transparent 33.5%),
            linear-gradient(to bottom, transparent 66.66%, rgba(100,223,223,0.2) 66.66%, rgba(100,223,223,0.2) 66.83%, transparent 66.83%);
        }

        .green-lcd-panel {
          background:
            linear-gradient(rgba(0, 30, 15, 0.95), rgba(0, 15, 5, 0.98)),
            repeating-linear-gradient(0deg, transparent, transparent 1px, rgba(0,0,0,0.3) 1px, rgba(0,0,0,0.3) 2px);
          border: 2px solid #144f2c;
          box-shadow: inset 0 0 20px rgba(0, 255, 120, 0.2), 0 5px 15px rgba(0,0,0,0.8), 0 0 0 1px #050505;
        }
        .green-text-glow { color: #4ade80; text-shadow: 0 0 8px rgba(74, 222, 128, 0.8), 0 0 15px rgba(74, 222, 128, 0.4); }

        .dial-texture {
          background: repeating-conic-gradient(from 0deg, #182226 0deg, #182226 3deg, #0a1114 3deg, #0a1114 6deg);
          box-shadow: inset 0 0 20px rgba(0,0,0,1), 0 0 0 1px #222;
        }
        .dial-container { touch-action: none; }

        .chassis-spring { transition: transform 0.4s cubic-bezier(0.34, 1.56, 0.64, 1); will-change: transform; }

        .phys-btn {
          transition: transform 0.15s cubic-bezier(0.175, 0.885, 0.32, 1.275), background 0.2s ease, box-shadow 0.2s ease;
          -webkit-tap-highlight-color: transparent;
        }
        .phys-btn:active { transform: scale(0.86) translateY(3px); }
        .spring-anim { transition: transform 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275); }

        /* Landscape mode optimization */
        @media (orientation: landscape) and (max-height: 540px) {
          .mobile-camera-chassis {
            max-width: 96vw !important;
            max-height: 94vh !important;
            flex-direction: row !important;
            padding: 8px 12px !important;
            gap: 10px !important;
          }
          .mobile-chassis-topbar {
            position: absolute !important;
            top: 8px !important;
            left: 12px !important;
            right: 12px !important;
            z-index: 35 !important;
            padding: 0 !important;
            pointer-events: none;
          }
          .mobile-chassis-topbar button {
            pointer-events: auto;
          }
          .mobile-viewfinder-wrap {
            flex: 1 1 58% !important;
            min-height: 0 !important;
            height: 100% !important;
            padding: 0 !important;
          }
          .mobile-controls-wrap {
            flex: 1 1 42% !important;
            max-width: 320px !important;
            height: 100% !important;
            padding: 0 !important;
            gap: 6px !important;
            justify-content: center !important;
          }
          .mobile-controls-row1 {
            gap: 6px !important;
          }
          .dial-container {
            width: 64px !important;
            height: 64px !important;
          }
          .green-lcd-panel {
            height: 64px !important;
            padding: 4px !important;
          }
          .mobile-logo-plate {
            width: 54px !important;
            height: 64px !important;
          }
          .mobile-nav-btn {
            width: 38px !important;
            height: 38px !important;
          }
          .mobile-go-btn {
            height: 38px !important;
            font-size: 11px !important;
          }
        }
      `}</style>

      <div className={`fixed inset-0 z-[100] pointer-events-none transition-opacity duration-75 ${showShutterFlash ? 'opacity-100 bg-cyan-100' : 'opacity-0 bg-transparent'}`}></div>

      <div
        className="mobile-camera-chassis chassis-spring"
        style={{ transform: `scale(${chassisSpring.scale}) translateY(${chassisSpring.y}px) perspective(1000px) rotateX(${chassisSpring.rotateX}deg)` }}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEndHandler}
      >
        {/* Top Bar */}
        <div className="mobile-chassis-topbar relative w-full pt-4 px-5 flex justify-between items-center shrink-0">
          <button
            onClick={onClose}
            aria-label="Close camera menu"
            className="pointer-events-auto w-[44px] h-[44px] rounded-full bg-[#0a151a]/40 border border-cyan-500/30 backdrop-blur-md flex items-center justify-center text-cyan-100 shadow-[inset_0_2px_10px_rgba(255,255,255,0.08),0_4px_10px_rgba(0,0,0,0.6)] active:bg-[#0a151a]/70 phys-btn"
          >
            <svg style={iconRotationStyle} width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M19 12H5" /><path d="M12 19l-7-7 7-7" /></svg>
          </button>

          <div className="w-[130px] h-[52px]">
            <SpeculoLogoMobile />
          </div>

          <button
            onClick={toggleWebcamMode}
            aria-label="Toggle camera preview"
            className="pointer-events-auto w-[44px] h-[44px] rounded-full bg-[#0a151a]/40 border border-cyan-500/30 backdrop-blur-md flex items-center justify-center text-cyan-100 shadow-[inset_0_2px_10px_rgba(255,255,255,0.08),0_4px_10px_rgba(0,0,0,0.6)] active:bg-[#0a151a]/70 phys-btn"
          >
            <svg style={iconRotationStyle} width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"></path><circle cx="12" cy="13" r="4"></circle></svg>
          </button>
        </div>

        {/* Viewfinder with Live Section Preview & Webcam */}
        <div className="mobile-viewfinder-wrap relative w-full px-5 pt-4 pb-3 flex-1 min-h-[40vh] z-20">
          <div className="lcd-screen w-full h-full rounded-2xl relative overflow-hidden flex flex-col border-[3px] border-[#0a151a]">
            
            {/* Live section preview when webcam is off */}
            {!isWebcamMode && (
              <div className="absolute inset-0 w-full h-full overflow-hidden bg-[#020508]">
                <iframe
                  ref={previewIframeRef}
                  src="/main.html"
                  title="CameraOS Mobile Section Preview"
                  className="absolute left-0 top-0 border-0 pointer-events-none origin-top-left"
                  style={{
                    transform: 'scale(0.38)',
                    width: '263.15%',
                    height: '263.15%',
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

            {/* Real tracking engine */}
            <FaceFollower
              isActive={isWebcamMode}
              videoRef={videoRef}
              isHalfPressed={isHalfPressed}
              frameCount={frameCount}
              onTrackingStateChange={(isTracking, confidence) => {
                setFocusConfidence(isTracking ? confidence : 0);
              }}
            />

            <div className="w-full h-full flex flex-col justify-end p-2 z-20 pointer-events-none">
              <div className="w-full flex justify-between items-end pb-1 text-cyan-200 camera-font text-[10px] tracking-wide font-bold drop-shadow-[0_2px_4px_rgba(0,0,0,1)]">
                <div className="flex gap-2 bg-cyan-950/40 px-2 py-1 rounded backdrop-blur border border-cyan-400/20">
                  <span>{exposureData.fstop}</span>|<span>{exposureData.shutter}</span>|<span>{exposureData.iso}</span>|<span>24mm</span>
                </div>
                {isWebcamMode && (
                  <div className="bg-cyan-950/40 px-2 py-1 rounded backdrop-blur border border-cyan-400/20">
                    FOCUS {focusConfidence}%
                  </div>
                )}
              </div>
              <Meters fps={fps} frameCount={frameCount} evOffset={0} />
            </div>

            <div className={`absolute inset-0 bg-black z-40 flex flex-col justify-center items-center transition-opacity duration-300 ${isBooting ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}>
              <div className="w-full max-w-[200px] camera-font text-cyan-400 text-xs tracking-widest text-left">
                <div className="text-base font-bold text-white mb-2 drop-shadow-[0_0_8px_rgba(255,255,255,0.5)]">SPECULO OS</div>
                <div>SYSTEM READY</div>
                <div className="mt-2 text-[10px] text-cyan-500 animate-pulse">SWIPE OR ROTATE DIAL TO NAVIGATE</div>
              </div>
            </div>

            <div className={`absolute inset-0 bg-black/90 z-50 flex flex-col items-center justify-center transition-opacity duration-300 ${showReview ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}>
              <div className="border border-cyan-400/60 p-4 bg-[#020a0a] rounded-xl shadow-[0_0_30px_rgba(100,223,223,0.2)]">
                <div className="text-cyan-300 camera-font text-sm tracking-widest text-center font-bold">NAVIGATING...</div>
              </div>
            </div>
          </div>
        </div>

        {/* Controls */}
        <div className="mobile-controls-wrap w-full flex flex-col px-5 pb-6 gap-4 z-20 shrink-0">
          <div className="mobile-controls-row1 flex flex-row justify-between items-center w-full gap-3">
            {/* Rotary dial */}
            <div
              ref={dialRef}
              onMouseDown={handleDialPointerDown}
              onTouchStart={handleDialPointerDown}
              className={`dial-container relative w-[84px] h-[84px] flex items-center justify-center shrink-0 shadow-[0_15px_30px_rgba(0,0,0,0.9)] rounded-full spring-anim ${isDraggingDial ? 'cursor-grabbing' : 'cursor-grab'}`}
              style={{ transform: `scale(${dialScale})` }}
            >
              <div
                className="absolute inset-0 rounded-full border-[4px] border-[#101b20] dial-texture shadow-[inset_0_0_20px_rgba(0,0,0,1)] z-0 transition-transform duration-75 ease-linear"
                style={{ transform: `rotate(${dialRotation}deg)` }}
              >
                <div className="absolute top-1 left-1/2 -translate-x-1/2 w-1.5 h-3 bg-cyan-400 rounded-full shadow-[0_0_8px_cyan]"></div>
              </div>
              <div className="absolute inset-[10px] rounded-full bg-gradient-to-br from-[#152329] to-[#05090b] z-10 pointer-events-none border border-[#0a1114]"></div>
              <button
                onClick={(e) => { e.stopPropagation(); executeSelection(); }}
                className="relative z-30 w-11 h-11 rounded-full bg-gradient-to-br from-cyan-950 via-[#0a1a1f] to-black border border-cyan-500/40 shadow-[0_4px_10px_rgba(0,0,0,0.9),inset_0_2px_4px_rgba(100,223,223,0.2)] flex items-center justify-center phys-btn"
              >
                <span style={iconRotationStyle} className="text-cyan-100 text-[10px] font-bold tracking-widest">SET</span>
              </button>
            </div>

            {/* Status LCD */}
            <div className="green-lcd-panel flex-1 h-[76px] rounded-[12px] p-2 flex flex-col justify-center items-center font-mono relative overflow-hidden">
              <div className="flex justify-between items-center w-full px-1 text-lg font-bold tracking-[0.1em] mb-1">
                <button aria-label="Previous" className="cursor-pointer green-text-glow active:scale-75 transition-transform select-none phys-btn w-8 h-8 flex items-center justify-center" onClick={() => navigateMenu(-1)}>&lt;</button>
                <span className="green-text-glow text-center truncate px-1 uppercase text-sm">{menuData[selectedIndex].title}</span>
                <button aria-label="Next" className="cursor-pointer green-text-glow active:scale-75 transition-transform select-none phys-btn w-8 h-8 flex items-center justify-center" onClick={() => navigateMenu(1)}>&gt;</button>
              </div>
              <div className="flex justify-center items-center gap-2 mt-0.5 text-[9px] w-full bg-[#00000080] p-1.5 rounded border border-[#144f2c]">
                <div className="flex items-center gap-1 green-text-glow font-bold">
                  <span>{batteryLevel}%</span>
                  <div className="w-5 h-2.5 border border-[#4ade80] rounded-[2px] relative p-[1px]"><div className="h-full bg-[#4ade80]" style={{ width: `${batteryLevel}%` }}></div></div>
                </div>
                <div className="flex items-center gap-1.5 green-text-glow font-bold tracking-wider">
                  <span className="w-1.5 h-1.5 rounded-full bg-red-500 shadow-[0_0_6px_#ef4444] animate-pulse shrink-0"></span>
                  <span className="text-emerald-300 font-mono text-[9px]">{deadlineCountdown}</span>
                </div>
              </div>
            </div>

            {/* Org logo plate */}
            <div className="mobile-logo-plate w-[72px] h-[76px] rounded-xl border border-cyan-900/40 bg-gradient-to-b from-[#111c21] to-[#04080a] flex items-center justify-center p-2 shrink-0 shadow-[inset_0_2px_15px_rgba(0,0,0,0.9),0_8px_15px_rgba(0,0,0,0.7)]">
              <img src={SPECULO_CAMERA_LOGO} style={iconRotationStyle} alt="Rajans Photography" className="w-full h-full object-contain opacity-95" draggable={false} />
            </div>
          </div>

          {/* Nav icon row */}
          <div className="flex justify-between items-center w-full px-1">
            {menuData.map((item, idx) => {
              const isSelected = idx === selectedIndex;
              return (
                <button
                  key={idx}
                  onClick={() => { 
                    setSelectedIndex(idx); 
                    playSound('click'); 
                    vibrate(8); 
                    onNavigate(menuData[idx]);
                  }}
                  className={`mobile-nav-btn w-12 h-12 sm:w-[54px] sm:h-[54px] rounded-[14px] flex items-center justify-center border-2 relative overflow-hidden phys-btn
                    ${isSelected
                      ? 'border-cyan-400 bg-cyan-950/90 text-cyan-300 shadow-[0_0_25px_rgba(100,223,223,0.4),inset_0_0_15px_rgba(100,223,223,0.2)] scale-[1.08]'
                      : 'border-[#1a2b33] bg-gradient-to-b from-[#0f191e] to-[#05090b] text-[#3a6073]'
                    }`}
                >
                  {isSelected && <div className="absolute inset-0 bg-cyan-400/20 animate-pulse pointer-events-none"></div>}
                  <div style={iconRotationStyle} className="w-full h-full flex items-center justify-center">
                    {MenuIcons[idx]}
                  </div>
                </button>
              );
            })}
          </div>

          {/* Big "GO / CAPTURE" action */}
          <button
            onClick={executeSelection}
            className="mobile-go-btn w-full h-12 rounded-xl bg-gradient-to-r from-cyan-500 to-cyan-700 text-black font-bold tracking-widest camera-font text-sm shadow-[0_8px_20px_rgba(100,223,223,0.3)] phys-btn"
          >
            {isWebcamMode ? 'CAPTURE & SAVE' : `GO TO ${menuData[selectedIndex].title}`}
          </button>
        </div>
      </div>
    </div>
  );
}

export default CameraMenuMobile;
