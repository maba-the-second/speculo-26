import React, { useState, useEffect, useRef } from 'react';
import { FaceFollower } from './FaceFollower';
import { MenuItem, menuData } from './CameraMenu';

const SPECULO_MAIN_LOGO = "https://raw.githubusercontent.com/rajansphotography/spec/main/Speculo%20_26%20white.png";
const SPECULO_LENS_LOGO = "https://raw.githubusercontent.com/rajansphotography/spec/main/Speculo%20_26%20lens.png";
const SPECULO_CAMERA_LOGO = "https://raw.githubusercontent.com/rajansphotography/spec/main/Logo%20White.png";

function SpeculoLogoStackLandscape({ className = "" }: { className?: string; animated?: boolean }) {
  return (
    <div className={`relative w-full h-full flex items-center justify-center logo-hover-animate ${className}`} aria-label="Speculo '26">
      <img
        className="absolute inset-0 w-full h-full object-contain select-none pointer-events-none drop-shadow-[0_0_8px_rgba(255,255,255,0.4)]"
        src={SPECULO_MAIN_LOGO}
        alt="Speculo '26"
        draggable={false}
      />
      <img
        className="absolute inset-0 w-full h-full object-contain pointer-events-none"
        src={SPECULO_LENS_LOGO}
        alt=""
        draggable={false}
      />
    </div>
  );
}

export interface CameraMenuLandscapeProps {
  isOpen: boolean;
  onClose: () => void;
  onNavigate: (item: MenuItem) => void;
  onSwitchToPortrait?: () => void;
}

export type CameraMenuMobileProps = CameraMenuLandscapeProps;
export type CameraMobileLandscapeProps = CameraMenuLandscapeProps;

export function CameraMenuLandscape({ isOpen, onClose, onNavigate, onSwitchToPortrait }: CameraMenuLandscapeProps) {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [isWebcamMode, setIsWebcamMode] = useState(false);
  const [dialRotation, setDialRotation] = useState(0);
  const [frameCount, setFrameCount] = useState(225);
  const [isHalfPressed, setIsHalfPressed] = useState(false);
  const [isFocusLocked, setIsFocusLocked] = useState(false);
  const [isBooting, setIsBooting] = useState(false);
  const [batteryLevel, setBatteryLevel] = useState(88);
  const [currentTime, setCurrentTime] = useState('');
  const [deadlineCountdown, setDeadlineCountdown] = useState('00D:00H:00M');
  const [exposureData, setExposureData] = useState({ fstop: 'F1.8', shutter: '1/125', iso: 'ISO 100', focal: '24mm', ev: 0 });
  const [showShutterFlash, setShowShutterFlash] = useState(false);
  const [showReview, setShowReview] = useState(false);
  const [fps, setFps] = useState(60);
  const [focusConfidence, setFocusConfidence] = useState(0);

  // Dynamic Orientation & Real-time Tilt State
  const [tiltAngle, setTiltAngle] = useState(0);
  const [gyroSupported, setGyroSupported] = useState(false);
  const targetTilt = useRef(0);
  const currentTilt = useRef(0);
  const animFrameRef = useRef<number | null>(null);
  const hasTriggeredPortrait = useRef(false);

  const [isDraggingDial, setIsDraggingDial] = useState(false);
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
  const shutterRef = useRef<HTMLButtonElement | null>(null);

  const initAudio = () => {
    if (!audioCtxRef.current) {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (AudioCtx) audioCtxRef.current = new AudioCtx();
    }
  };

  const playSound = (type: 'click' | 'shutter' | 'dial' | 'focus' | 'focus-lock') => {
    if (!audioCtxRef.current) return;
    const ctx = audioCtxRef.current;
    if (ctx.state === 'suspended') ctx.resume();

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
      osc.frequency.setValueAtTime(110, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(10, ctx.currentTime + 0.15);
      gain.gain.setValueAtTime(0.4, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.15);
    } else if (type === 'dial') {
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(460, ctx.currentTime);
      gain.gain.setValueAtTime(0.025, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.02);
    } else if (type === 'focus') {
      osc.type = 'sine';
      osc.frequency.setValueAtTime(750, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(1100, ctx.currentTime + 0.06);
      gain.gain.setValueAtTime(0.04, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.08);
    } else if (type === 'focus-lock') {
      osc.type = 'sine';
      osc.frequency.setValueAtTime(1400, ctx.currentTime);
      gain.gain.setValueAtTime(0.06, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.12);
    }

    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    const dur = type === 'shutter' ? 0.15 : type === 'focus-lock' ? 0.12 : type === 'focus' ? 0.08 : type === 'dial' ? 0.02 : 0.05;
    osc.stop(ctx.currentTime + dur);
  };

  const vibrate = (pattern: number | number[]) => {
    if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
      try { navigator.vibrate(pattern); } catch {}
    }
  };

  // Lifecycle initialization
  useEffect(() => {
    if (isOpen) {
      initAudio();
      setIsBooting(true);
      const timer = setTimeout(() => setIsBooting(false), 900);
      return () => clearTimeout(timer);
    } else if (isWebcamMode) {
      toggleWebcamMode();
    }
  }, [isOpen]);

  // Physical Gyroscope Orientation & Dynamic Roll Tilt Tracking
  useEffect(() => {
    if (!isOpen) return;

    hasTriggeredPortrait.current = false;
    currentTilt.current = 0;
    targetTilt.current = 0;
    setTiltAngle(0);

    const handleOrientation = (e: DeviceOrientationEvent) => {
      if (hasTriggeredPortrait.current) return;
      const gamma = e.gamma; // [-90, 90] left/right
      const beta = e.beta;   // [-180, 180] front/back
      if (gamma === null && beta === null) return;

      setGyroSupported(true);
      const g = gamma || 0;
      const b = beta || 0;

      let screenAngle = 0;
      if (typeof window !== 'undefined' && window.screen?.orientation) {
        screenAngle = window.screen.orientation.angle || 0;
      } else if (typeof window !== 'undefined' && 'orientation' in window) {
        screenAngle = Number((window as any).orientation) || 0;
      }

      let calculatedAngle = 0;
      if (screenAngle === 90) {
        // Landscape with top pointing left
        calculatedAngle = -b;
      } else if (screenAngle === 270 || screenAngle === -90) {
        // Landscape with top pointing right
        calculatedAngle = b;
      } else {
        // Orientation 0 (e.g. tablet, desktop simulator, or unlocked sensor)
        // Use 2D gravity projection
        const radB = (b * Math.PI) / 180;
        const radG = (g * Math.PI) / 180;
        const angle = Math.atan2(Math.sin(radB), Math.sin(radG)) * (180 / Math.PI);
        if (angle > 90) calculatedAngle = 180 - angle;
        else if (angle < -90) calculatedAngle = -180 - angle;
        else calculatedAngle = angle;
      }

      // Clamp target angle within [-90, 90]
      const clamped = Math.max(-90, Math.min(90, calculatedAngle));
      targetTilt.current = clamped;
    };

    // Smooth LERP animation loop
    const updateTiltLoop = () => {
      const diff = targetTilt.current - currentTilt.current;
      currentTilt.current += diff * 0.14;

      if (Math.abs(diff) < 0.05) {
        currentTilt.current = targetTilt.current;
      }

      const rounded = Math.round(currentTilt.current * 10) / 10;
      setTiltAngle(rounded);

      // Check if tilt reaches 90 degrees threshold (e.g., >= 80° or <= -80°)
      if (Math.abs(currentTilt.current) >= 80 && !hasTriggeredPortrait.current) {
        hasTriggeredPortrait.current = true;
        playSound('focus-lock');
        vibrate([20, 40, 20]);
        setTimeout(() => {
          if (onSwitchToPortrait) {
            onSwitchToPortrait();
          }
        }, 180);
        return;
      }

      animFrameRef.current = requestAnimationFrame(updateTiltLoop);
    };

    window.addEventListener('deviceorientation', handleOrientation, { passive: true });
    animFrameRef.current = requestAnimationFrame(updateTiltLoop);

    return () => {
      window.removeEventListener('deviceorientation', handleOrientation);
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    };
  }, [isOpen, onSwitchToPortrait]);

  // Request Gyroscope Permission for iOS 13+
  const requestGyroPermission = async () => {
    if (typeof (DeviceOrientationEvent as any)?.requestPermission === 'function') {
      try {
        const res = await (DeviceOrientationEvent as any).requestPermission();
        if (res === 'granted') setGyroSupported(true);
      } catch {}
    }
  };

  // Simulated Manual Tilt for Testing/Preview on Desktop/Touch
  const setSimulatedTilt = (deg: number) => {
    targetTilt.current = deg;
    if (Math.abs(deg) >= 80) {
      setTimeout(() => {
        if (!hasTriggeredPortrait.current && onSwitchToPortrait) {
          hasTriggeredPortrait.current = true;
          playSound('focus-lock');
          vibrate([20, 40, 20]);
          onSwitchToPortrait();
        }
      }, 350);
    }
  };

  // Battery API
  useEffect(() => {
    if (typeof navigator !== 'undefined' && 'getBattery' in navigator) {
      (navigator as any).getBattery().then((battery: any) => {
        setBatteryLevel(Math.round(battery.level * 100));
        battery.addEventListener('levelchange', () => setBatteryLevel(Math.round(battery.level * 100)));
      }).catch(() => {});
    }
  }, []);

  // Time & Countdown
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
    if (isOpen) interval = setInterval(calculateCountdown, 1000);
    return () => clearInterval(interval);
  }, [isOpen]);

  // Exposure telemetry simulation jitter
  useEffect(() => {
    if (!isOpen) return;
    const interval = setInterval(() => {
      if (Math.random() > 0.6) {
        const fstops = ["F1.4", "F1.8", "F2.0", "F2.8"];
        const isos = ["ISO 100", "ISO 200", "ISO 400"];
        const shutters = ["1/60", "1/125", "1/250", "1/500"];
        setExposureData({
          fstop: fstops[Math.floor(Math.random() * fstops.length)],
          shutter: shutters[Math.floor(Math.random() * shutters.length)],
          iso: isos[Math.floor(Math.random() * isos.length)],
          focal: "24mm",
          ev: Math.round((Math.random() - 0.5) * 4) / 2
        });
        setFps(Math.floor(58 + Math.random() * 4));
      }
    }, 2000);
    return () => clearInterval(interval);
  }, [isOpen]);

  // Synchronize Live Iframe Viewfinder
  useEffect(() => {
    if (isWebcamMode || !previewIframeRef.current) return;
    const target = menuData[selectedIndex];
    const iframe = previewIframeRef.current;
    if (!iframe) return;

    if (target?.targetId === 'themes') {
      if (!iframe.src.endsWith('/themes.html')) iframe.src = '/themes.html';
    } else if (target?.targetId === 'submissions') {
      if (!iframe.src.endsWith('/Submissions.html')) iframe.src = '/Submissions.html';
    } else if (target?.targetId) {
      const isMain = iframe.src.includes('/main.html');
      if (!isMain) {
        iframe.src = `/main.html#${target.targetId}`;
      } else {
        try {
          const doc = iframe.contentDocument;
          if (doc) {
            const el = doc.getElementById(target.targetId);
            if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
          }
          iframe.contentWindow?.postMessage({ type: 'NAVIGATE', targetId: target.targetId }, '*');
        } catch {}
      }
    }
  }, [selectedIndex, isWebcamMode]);

  const triggerFocus = () => {
    playSound('focus');
    setIsHalfPressed(true);
    vibrate(10);
    setTimeout(() => {
      setIsFocusLocked(true);
      playSound('focus-lock');
      vibrate([8, 20]);
    }, 350);
  };

  const releaseFocus = () => {
    setIsHalfPressed(false);
    setTimeout(() => setIsFocusLocked(false), 400);
  };

  const navigateMenu = (direction: number) => {
    setSelectedIndex((prev) => {
      let next = prev + direction;
      if (next < 0) next = menuData.length - 1;
      if (next >= menuData.length) next = 0;
      return next;
    });
    setDialRotation((prev) => prev + direction * 35);
    playSound('dial');
    vibrate(6);

    // Brief focus hunting pulse when switching targets
    setIsFocusLocked(false);
    setIsHalfPressed(true);
    setTimeout(() => {
      setIsHalfPressed(false);
      setIsFocusLocked(true);
      playSound('focus-lock');
      setTimeout(() => setIsFocusLocked(false), 800);
    }, 280);
  };

  const selectIndexDirect = (idx: number) => {
    setSelectedIndex(idx);
    playSound('click');
    vibrate(8);
    if (menuData[idx]) onNavigate(menuData[idx]);
  };

  const executeSelection = () => {
    playSound('shutter');
    vibrate([15, 35, 15]);

    if (!isWebcamMode) {
      setShowShutterFlash(true);
      setTimeout(() => setShowShutterFlash(false), 180);
      setFrameCount((f) => f + 1);
      setShowReview(true);
      setTimeout(() => {
        if (menuData[selectedIndex]) onNavigate(menuData[selectedIndex]);
        onClose();
        setTimeout(() => setShowReview(false), 400);
      }, 750);
      return;
    }

    // Capture photo in webcam mode
    const video = videoRef.current;
    if (video && video.readyState >= 2 && video.videoWidth > 0) {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.save();
          ctx.scale(-1, 1);
          ctx.drawImage(video, -canvas.width, 0, canvas.width, canvas.height);
          ctx.restore();
          canvas.toBlob((blob) => {
            if (!blob) return;
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `speculo-${Date.now()}.png`;
            document.body.appendChild(a);
            a.click();
            a.remove();
            setTimeout(() => URL.revokeObjectURL(url), 2000);
          }, 'image/png');
        }
      } catch {}
    }

    setShowShutterFlash(true);
    setTimeout(() => setShowShutterFlash(false), 180);
    setFrameCount((f) => f + 1);
    setShowReview(true);
    setTimeout(() => {
      onClose();
      setTimeout(() => setShowReview(false), 400);
    }, 850);
  };

  const toggleWebcamMode = async () => {
    initAudio();
    if (!isWebcamMode) {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' }, audio: false });
        if (stream) {
          streamRef.current = stream;
          if (videoRef.current) {
            videoRef.current.srcObject = stream;
          }
          setIsWebcamMode(true);
          playSound('click');
          vibrate(12);
        }
      } catch (err) {
        console.warn('Webcam stream not accessible', err);
      }
    } else {
      if (streamRef.current) streamRef.current.getTracks().forEach((t) => t.stop());
      if (videoRef.current) videoRef.current.srcObject = null;
      setIsWebcamMode(false);
      playSound('click');
      vibrate(8);
    }
  };

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!isOpen) return;
      if (e.key === 'ArrowRight' || e.key === 'ArrowDown') navigateMenu(1);
      if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') navigateMenu(-1);
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        executeSelection();
      }
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, selectedIndex, isWebcamMode]);

  // Rotary jog-dial interaction
  const handleDialPointerDown = (e: React.PointerEvent | React.TouchEvent | React.MouseEvent) => {
    if (!dialRef.current) return;
    const rect = dialRef.current.getBoundingClientRect();
    dialCenter.current = { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };

    const clientX = 'touches' in e ? e.touches[0].clientX : (e as React.MouseEvent).clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : (e as React.MouseEvent).clientY;

    lastAngle.current = Math.atan2(clientY - dialCenter.current.y, clientX - dialCenter.current.x) * (180 / Math.PI);
    setIsDraggingDial(true);
    accumulatedRotation.current = 0;
    if (inertiaFrame.current) cancelAnimationFrame(inertiaFrame.current);
    dialVelocity.current = 0;
    lastTimestamp.current = performance.now();
  };

  useEffect(() => {
    if (!isDraggingDial) return;

    const handlePointerMove = (e: MouseEvent | TouchEvent) => {
      const clientX = 'touches' in e ? e.touches[0].clientX : (e as MouseEvent).clientX;
      const clientY = 'touches' in e ? e.touches[0].clientY : (e as MouseEvent).clientY;

      const angle = Math.atan2(clientY - dialCenter.current.y, clientX - dialCenter.current.x) * (180 / Math.PI);
      let delta = angle - lastAngle.current;
      if (delta > 180) delta -= 360;
      if (delta < -180) delta += 360;

      const now = performance.now();
      const dt = now - lastTimestamp.current;
      if (dt > 0) {
        dialVelocity.current = delta / dt;
        lastTimestamp.current = now;
      }

      setDialRotation((prev) => prev + delta);
      accumulatedRotation.current += delta;

      if (Math.abs(accumulatedRotation.current) > 28) {
        navigateMenu(accumulatedRotation.current > 0 ? 1 : -1);
        accumulatedRotation.current = 0;
      }
      lastAngle.current = angle;
    };

    const handlePointerUp = () => {
      setIsDraggingDial(false);
      let vel = dialVelocity.current;
      const applyInertia = () => {
        if (Math.abs(vel) < 0.04) return;
        setDialRotation((prev) => prev + vel * 14);
        accumulatedRotation.current += vel * 14;

        if (Math.abs(accumulatedRotation.current) > 28) {
          navigateMenu(accumulatedRotation.current > 0 ? 1 : -1);
          accumulatedRotation.current = 0;
        }

        vel *= 0.91;
        dialVelocity.current = vel;
        inertiaFrame.current = requestAnimationFrame(applyInertia);
      };

      if (Math.abs(vel) > 0.08) {
        inertiaFrame.current = requestAnimationFrame(applyInertia);
      }
    };

    window.addEventListener('mousemove', handlePointerMove, { passive: false });
    window.addEventListener('mouseup', handlePointerUp);
    window.addEventListener('touchmove', handlePointerMove, { passive: false });
    window.addEventListener('touchend', handlePointerUp);

    return () => {
      window.removeEventListener('mousemove', handlePointerMove);
      window.removeEventListener('mouseup', handlePointerUp);
      window.removeEventListener('touchmove', handlePointerMove);
      window.removeEventListener('touchend', handlePointerUp);
    };
  }, [isDraggingDial]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-[9999] w-full h-full bg-[#020508]/90 backdrop-blur-md flex items-center justify-center font-mono select-none overflow-hidden"
      style={{
        paddingLeft: 'max(8px, env(safe-area-inset-left))',
        paddingRight: 'max(8px, env(safe-area-inset-right))',
        paddingTop: 'max(4px, env(safe-area-inset-top))',
        paddingBottom: 'max(4px, env(safe-area-inset-bottom))',
      }}
    >
      <style>{`
        .camera-font { font-family: 'Share Tech Mono', monospace; }

        .chassis-outer-shell {
          background: linear-gradient(180deg, #07151b 0%, #030a0d 100%), #040c10;
          box-shadow: 0 25px 60px -15px rgba(0,0,0,0.95), 0 0 0 1.5px rgba(34, 211, 238, 0.3);
        }

        .viewfinder-bezel {
          background: linear-gradient(135deg, #081a22 0%, #02070a 100%);
          box-shadow: 0 0 0 2px rgba(34, 211, 238, 0.45),
                      inset 0 0 25px rgba(0, 0, 0, 0.95),
                      0 0 20px -3px rgba(6, 182, 212, 0.35);
        }

        .lcd-thirds-grid {
          background-image: 
            linear-gradient(to right, transparent 33.3%, rgba(34, 211, 238, 0.12) 33.3%, rgba(34, 211, 238, 0.12) 33.6%, transparent 33.6%, transparent 66.6%, rgba(34, 211, 238, 0.12) 66.6%, rgba(34, 211, 238, 0.12) 66.9%, transparent 66.9%),
            linear-gradient(to bottom, transparent 33.3%, rgba(34, 211, 238, 0.12) 33.3%, rgba(34, 211, 238, 0.12) 33.6%, transparent 33.6%, transparent 66.6%, rgba(34, 211, 238, 0.12) 66.6%, rgba(34, 211, 238, 0.12) 66.9%, transparent 66.9%);
        }

        .green-status-lcd {
          background: linear-gradient(180deg, #021a0d 0%, #010c06 100%),
                      repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(0,0,0,0.35) 2px, rgba(0,0,0,0.35) 4px);
          box-shadow: inset 0 0 15px rgba(34, 197, 94, 0.2), 0 0 0 1.5px #15803d;
        }
        .green-lcd-text {
          color: #4ade80;
          text-shadow: 0 0 8px rgba(74, 222, 128, 0.8), 0 0 14px rgba(74, 222, 128, 0.4);
        }

        .control-cluster-pod {
          background: linear-gradient(180deg, #06151c 0%, #02070a 100%);
          box-shadow: inset 0 0 0 1px rgba(34, 211, 238, 0.3), 0 12px 24px rgba(0,0,0,0.85);
        }

        .knurled-rotary-wheel {
          background: repeating-conic-gradient(from 0deg, #3d2b1f 0deg, #3d2b1f 2.5deg, #120d09 2.5deg, #120d09 5deg);
          box-shadow: inset 0 0 12px rgba(0,0,0,0.95), 0 6px 14px rgba(0,0,0,0.9);
        }
        .inner-rotary-face {
          background: radial-gradient(circle at 45% 45%, #182830 0%, #070d10 80%);
          box-shadow: inset 0 2px 5px rgba(255,255,255,0.1), inset 0 -4px 8px rgba(0,0,0,0.8);
        }

        .focus-bracket-box {
          transition: all 0.22s cubic-bezier(0.2, 0.8, 0.2, 1);
        }

        .btn-press {
          transition: transform 0.12s cubic-bezier(0.2, 0.8, 0.4, 1);
          -webkit-tap-highlight-color: transparent;
        }
        .btn-press:active {
          transform: scale(0.92);
        }
      `}</style>

      {/* Shutter Flash screen */}
      <div className={`fixed inset-0 z-[10000] pointer-events-none transition-opacity duration-100 ${showShutterFlash ? 'opacity-100 bg-cyan-100' : 'opacity-0 bg-transparent'}`} />

      {/* Main Responsive Enclosure (Guaranteed to fit any phone landscape height & aspect) with Dynamic Tilt */}
      <div
        className="relative w-full max-w-[1020px] h-[min(96vh,440px)] flex flex-col justify-end pt-8 transition-transform will-change-transform duration-75"
        style={{
          transform: `rotate(${tiltAngle}deg) scale(${1 - Math.abs(tiltAngle) * 0.0018})`,
          transformOrigin: '50% 55%',
        }}
      >

        {/* ================= TOP SECTION: PENTAPRISM & WORKING METALLIC SHUTTER ON WEBCAM/LEFT SIDE ================= */}
        <div className="w-full flex items-end justify-between px-4 sm:px-8 absolute top-0 left-0 right-0 z-30 pointer-events-auto">
          
          {/* Left Top REAL SHUTTER BUTTON (Directly over Webcam / Viewfinder) */}
          <button
            ref={shutterRef}
            type="button"
            aria-label="DSLR Shutter Button"
            title="Half-press for AF / Full press to Capture & Navigate"
            onMouseDown={triggerFocus}
            onMouseUp={() => { releaseFocus(); executeSelection(); }}
            onTouchStart={triggerFocus}
            onTouchEnd={() => { releaseFocus(); executeSelection(); }}
            className={`w-14 sm:w-16 h-6 appearance-none border border-white/60 bg-gradient-to-b from-white via-neutral-300 to-neutral-600 rounded-t-lg border-t border-x shadow-[0_-3px_10px_rgba(255,255,255,0.3),0_4px_12px_rgba(0,0,0,0.8)] cursor-pointer z-50 flex items-center justify-center transition-all ${
              isHalfPressed
                ? 'h-4 from-neutral-400 via-neutral-500 to-neutral-700 shadow-[inset_0_2px_4px_rgba(0,0,0,0.8)]'
                : 'hover:brightness-110'
            }`}
          >
            <div className="w-8 h-1 bg-[#1a252b] rounded-full opacity-70" />
          </button>

          {/* Center Pentaprism with STILL SPECULO '26 LOGO */}
          <div className="h-8 sm:h-9 px-6 sm:px-8 bg-gradient-to-b from-[#091b24] via-[#051117] to-[#02070a] border-t-2 border-x-2 border-cyan-400/40 rounded-t-xl sm:rounded-t-2xl flex items-center justify-center shadow-[0_-6px_20px_rgba(0,0,0,0.9)] -mb-[1px]">
            <div className="w-32 sm:w-40 h-6 sm:h-7">
              <SpeculoLogoStackLandscape />
            </div>
          </div>

          {/* Right Top Spacer (Other shoulder removed as requested) */}
          <div className="w-14 sm:w-16 h-1 pointer-events-none opacity-0" />
        </div>

        {/* ================= MAIN CAMERA CHASSIS BODY ================= */}
        <div className="chassis-outer-shell w-full flex-1 rounded-[22px] sm:rounded-[26px] p-2 sm:p-3 flex flex-row gap-2 sm:gap-3 overflow-hidden relative z-10">

          {/* ================= LEFT VIEWPORT: EXPANDED LCD / WEBCAM VIEWFINDER ================= */}
          <div
            onWheel={(e) => { if (Math.abs(e.deltaY) > 20) navigateMenu(e.deltaY > 0 ? 1 : -1); }}
            className="viewfinder-bezel relative flex-1 min-w-0 h-full rounded-[16px] sm:rounded-[18px] p-1.5 sm:p-2 flex flex-col justify-between overflow-hidden"
          >
            <div className="relative w-full h-full rounded-[12px] overflow-hidden bg-[#020508] border border-cyan-500/30 flex flex-col justify-between">

              {/* Viewfinder Background: Iframe Section View or Webcam */}
              {!isWebcamMode && (
                <div className="absolute inset-0 w-full h-full overflow-hidden bg-[#020508] pointer-events-none">
                  <iframe
                    ref={previewIframeRef}
                    src="/main.html"
                    title="Speculo Viewfinder Frame"
                    className="absolute left-0 top-0 border-0 pointer-events-none origin-top-left"
                    style={{
                      transform: 'scale(0.52)',
                      width: '192.3%',
                      height: '192.3%',
                      opacity: 0.92,
                    }}
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-[#020508] via-transparent to-[#020508]/60" />
                </div>
              )}

              {/* Real Webcam Stream */}
              <video
                ref={videoRef}
                className={`absolute inset-0 w-full h-full object-cover transition-opacity duration-300 ${isWebcamMode ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
                style={{ transform: 'scaleX(-1)' }}
                autoPlay
                muted
                playsInline
              />

              {/* Rule-of-Thirds Grid */}
              <div className="lcd-thirds-grid absolute inset-0 pointer-events-none z-10" />

              {/* Real Face Tracking Engine (Active in webcam mode) */}
              <FaceFollower
                isActive={isWebcamMode}
                videoRef={videoRef}
                isHalfPressed={isHalfPressed}
                frameCount={frameCount}
                onTrackingStateChange={(isTracking, confidence) => {
                  setFocusConfidence(isTracking ? confidence : 0);
                  if (isTracking && confidence > 70) setIsFocusLocked(true);
                }}
              />

              {/* ---------------- HUD: TOP ROW (Clean, No Scramble) ---------------- */}
              <div className="relative z-20 w-full p-2 sm:p-2.5 flex justify-between items-center pointer-events-none">
                {/* View Target Pill */}
                <div className="flex items-center gap-2 px-2.5 py-1 rounded-full bg-[#030d12]/85 border border-cyan-500/40 backdrop-blur shadow-[0_0_12px_rgba(6,182,212,0.25)]">
                  <span className={`w-2 h-2 rounded-full ${isWebcamMode ? 'bg-cyan-300 animate-pulse shadow-[0_0_8px_#64dfdf]' : 'bg-cyan-400 shadow-[0_0_8px_#22d3ee]'}`} />
                  <span className="camera-font text-[10.5px] sm:text-xs text-cyan-200 tracking-wider font-bold uppercase truncate max-w-[130px]">
                    {isWebcamMode ? 'LIVE WEBCAM' : `VIEW: ${menuData[selectedIndex]?.title || 'HOME'}`}
                  </span>
                </div>

                {/* Center / Right Top: Electronic Gyro Spirit Level & Telemetry */}
                <div className="flex items-center gap-1.5 sm:gap-2 pointer-events-auto">
                  
                  {/* Gyro Level Tilt Gauge Button */}
                  <button
                    type="button"
                    onClick={requestGyroPermission}
                    className={`flex items-center gap-1.5 px-2 py-0.5 rounded border transition-all cursor-pointer ${
                      Math.abs(tiltAngle) < 1.2
                        ? 'border-emerald-400/70 bg-emerald-950/80 text-emerald-300 shadow-[0_0_10px_rgba(52,211,153,0.35)]'
                        : Math.abs(tiltAngle) >= 70
                        ? 'border-cyan-400 bg-cyan-950 text-cyan-200 animate-pulse shadow-[0_0_12px_rgba(34,211,238,0.5)]'
                        : 'border-cyan-500/30 bg-[#030d12]/85 text-cyan-200'
                    }`}
                    title="Electronic Level: Tilt phone to 90° to switch to portrait view"
                  >
                    <span className={`w-1.5 h-1.5 rounded-full ${Math.abs(tiltAngle) < 1.2 ? 'bg-emerald-400 shadow-[0_0_6px_#34d399]' : Math.abs(tiltAngle) >= 70 ? 'bg-cyan-300' : 'bg-cyan-400'}`} />
                    <span className="camera-font text-[9.5px] font-bold tracking-wider">
                      {Math.abs(tiltAngle) < 1.2 ? 'LEVEL 0.0°' : `TILT ${tiltAngle > 0 ? '+' : ''}${tiltAngle.toFixed(1)}°`}
                    </span>
                    {Math.abs(tiltAngle) >= 70 && (
                      <span className="text-[7.5px] bg-cyan-400 text-black font-extrabold px-1 rounded">
                        PORTRAIT 90°
                      </span>
                    )}
                  </button>

                  <div className="bg-[#030d12]/80 px-2 py-0.5 rounded border border-cyan-500/30 text-white camera-font text-[10px] font-bold">
                    {currentTime}
                  </div>
                  <div className="flex items-center gap-1 bg-[#030d12]/80 px-2 py-0.5 rounded border border-cyan-500/30 text-white camera-font text-[10px] font-bold">
                    <span>{batteryLevel}%</span>
                    <div className="w-3.5 h-2 border border-cyan-300/60 rounded-[1px] p-[1px] flex items-center">
                      <div className="h-full bg-cyan-300 transition-all" style={{ width: `${batteryLevel}%` }} />
                    </div>
                  </div>
                  <div className="w-6 h-6 sm:w-7 sm:h-7 rounded bg-[#040e13]/85 border border-cyan-500/30 flex items-center justify-center p-0.5 shadow">
                    <img src={SPECULO_CAMERA_LOGO} alt="Rajans" className="w-full h-full object-contain opacity-90" />
                  </div>
                </div>
              </div>

              {/* ---------------- HUD: CENTER RETICLE, LEVEL LINE & AUTOFOCUS BOX ---------------- */}
              <div
                className="absolute inset-0 z-20 flex items-center justify-center cursor-crosshair"
                onClick={triggerFocus}
              >
                {/* Dynamic Counter-Rotating Gyro Horizon Level Line */}
                <div
                  className="absolute pointer-events-none flex items-center justify-center transition-transform duration-75"
                  style={{
                    transform: `rotate(${-tiltAngle}deg)`,
                    width: 'min(240px, 60%)',
                  }}
                >
                  <div className={`h-[1.5px] flex-1 transition-colors duration-150 ${Math.abs(tiltAngle) < 1.2 ? 'bg-emerald-400 shadow-[0_0_8px_#34d399]' : 'bg-cyan-400/40'}`} />
                  <div className={`w-3 h-3 mx-2 rounded-full border flex items-center justify-center transition-all duration-150 ${Math.abs(tiltAngle) < 1.2 ? 'border-emerald-400 bg-emerald-400/30 shadow-[0_0_10px_#34d399]' : 'border-cyan-400/50 bg-black/40'}`}>
                    <div className={`w-1 h-1 rounded-full ${Math.abs(tiltAngle) < 1.2 ? 'bg-emerald-300' : 'bg-cyan-300'}`} />
                  </div>
                  <div className={`h-[1.5px] flex-1 transition-colors duration-150 ${Math.abs(tiltAngle) < 1.2 ? 'bg-emerald-400 shadow-[0_0_8px_#34d399]' : 'bg-cyan-400/40'}`} />
                </div>

                {!isWebcamMode && (
                  <div
                    className={`focus-bracket-box relative transition-all duration-200 ${
                      isFocusLocked
                        ? 'w-28 h-18 sm:w-36 sm:h-24 border border-[#64dfdf] bg-[#64dfdf]/10 shadow-[0_0_15px_rgba(100,223,223,0.5)]'
                        : isHalfPressed
                        ? 'w-36 h-24 sm:w-44 sm:h-30 border border-cyan-300 animate-pulse'
                        : 'w-32 h-20 sm:w-40 sm:h-26 border border-cyan-400/20'
                    }`}
                  >
                    {/* 4 Corner Brackets */}
                    <div className={`absolute top-0 left-0 w-3 h-3 border-t-2 border-l-2 ${isFocusLocked ? 'border-[#64dfdf] shadow-[0_0_8px_#64dfdf]' : 'border-cyan-400'}`} />
                    <div className={`absolute top-0 right-0 w-3 h-3 border-t-2 border-r-2 ${isFocusLocked ? 'border-[#64dfdf] shadow-[0_0_8px_#64dfdf]' : 'border-cyan-400'}`} />
                    <div className={`absolute bottom-0 left-0 w-3 h-3 border-b-2 border-l-2 ${isFocusLocked ? 'border-[#64dfdf] shadow-[0_0_8px_#64dfdf]' : 'border-cyan-400'}`} />
                    <div className={`absolute bottom-0 right-0 w-3 h-3 border-b-2 border-r-2 ${isFocusLocked ? 'border-[#64dfdf] shadow-[0_0_8px_#64dfdf]' : 'border-cyan-400'}`} />

                    {/* Center Crosshair */}
                    <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                      <div className={`w-2 h-2 rounded-full border ${isFocusLocked ? 'border-[#64dfdf] bg-[#64dfdf]' : 'border-cyan-400/40'}`} />
                    </div>

                    {/* Focus Status Tag */}
                    <div className="absolute -bottom-5 left-1/2 -translate-x-1/2 whitespace-nowrap">
                      <span className={`text-[9px] camera-font font-bold px-1.5 py-0.5 rounded ${isFocusLocked ? 'bg-[#64dfdf] text-black' : isHalfPressed ? 'bg-cyan-950 text-cyan-300 border border-cyan-400' : 'text-cyan-400/60'}`}>
                        {isFocusLocked ? 'AF-LOCKED' : isHalfPressed ? 'AF-HUNTING...' : 'AF-C'}
                      </span>
                    </div>
                  </div>
                )}
              </div>

              {/* ---------------- HUD: BOTTOM TELEMETRY BAR (Clean & Unscrambled) ---------------- */}
              <div className="relative z-20 w-full p-2 sm:p-2.5 flex flex-col gap-1 pointer-events-none bg-gradient-to-t from-[#020508]/90 via-[#020508]/40 to-transparent">
                
                {/* EV Gauge Slider */}
                <div className="w-full flex items-center justify-center gap-2">
                  <div className="flex items-center gap-2 text-[8.5px] camera-font text-neutral-400 font-bold">
                    <span>-2</span>
                    <span>-1</span>
                    <span className="text-white bg-cyan-900/60 px-1 rounded text-cyan-200">0</span>
                    <span>+1</span>
                    <span>+2</span>
                  </div>
                  <div className="w-24 sm:w-32 h-[1px] bg-cyan-400/30 relative">
                    <div className="absolute top-[-2px] left-1/2 w-1 h-1.5 bg-cyan-300 -translate-x-1/2" />
                    <div
                      className="absolute top-[-3px] left-1/2 w-[2px] h-[7px] bg-cyan-200 transition-transform duration-300"
                      style={{ transform: `translateX(${exposureData.ev * 14}px)` }}
                    />
                  </div>
                </div>

                {/* Telemetry Readouts (Strict flex-nowrap) */}
                <div className="w-full flex justify-between items-center text-[9px] sm:text-[10.5px] camera-font text-neutral-300 font-semibold tracking-wider pt-0.5 px-1">
                  {/* Left: Exposure */}
                  <div className="flex items-center gap-1.5 sm:gap-2">
                    <span className="text-white font-bold">{exposureData.fstop}</span>
                    <span className="text-neutral-600">|</span>
                    <span className="text-white font-bold">{exposureData.shutter}</span>
                    <span className="text-neutral-600">|</span>
                    <span>{exposureData.iso}</span>
                    <span className="text-neutral-600">|</span>
                    <span className="text-cyan-300/80">{exposureData.focal}</span>
                  </div>

                  {/* Right: FPS & Frame & Status */}
                  <div className="flex items-center gap-1.5 sm:gap-2">
                    {isWebcamMode && (
                      <>
                        <span className="text-cyan-300 font-bold">AF {focusConfidence}%</span>
                        <span className="text-neutral-600">|</span>
                      </>
                    )}
                    <span>FPS {fps}</span>
                    <span className="text-neutral-600">|</span>
                    <span className="text-cyan-400">FRM 000{frameCount}</span>
                  </div>
                </div>
              </div>

              {/* Boot screen overlay */}
              <div className={`absolute inset-0 bg-[#020508] z-40 flex flex-col items-center justify-center transition-opacity duration-300 ${isBooting ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}>
                <div className="camera-font text-cyan-400 text-xs tracking-widest text-center px-4">
                  <div className="text-base sm:text-lg font-bold text-white mb-2">SPECULO OS // LANDSCAPE</div>
                  <div className="text-cyan-500 animate-pulse">OPTICS CHECK... OK // SENSORS READY</div>
                </div>
              </div>

              {/* Review overlay */}
              <div className={`absolute inset-0 bg-black/85 z-50 flex items-center justify-center transition-opacity duration-200 ${showReview ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}>
                <div className="border border-cyan-400 px-5 py-2 bg-[#030d12] rounded-lg shadow-[0_0_25px_rgba(6,182,212,0.4)] text-center">
                  <span className="text-cyan-300 camera-font text-xs sm:text-sm tracking-widest font-bold block">
                    {isWebcamMode ? 'PHOTO CAPTURED' : 'NAVIGATING TO SECTION...'}
                  </span>
                  <span className="text-neutral-400 text-[10px] mt-1 block">
                    TARGET: {menuData[selectedIndex]?.title} · FRAME 000{frameCount}
                  </span>
                </div>
              </div>

            </div>
          </div>

          {/* ================= RIGHT: COMPACT CONTROLLER PANEL ================= */}
          <div className="w-[155px] sm:w-[175px] md:w-[190px] shrink-0 h-full flex flex-col justify-between gap-1.5 sm:gap-2">

            {/* 1. TOP GREEN LCD STATUS SCREEN */}
            <div className="green-status-lcd w-full rounded-[10px] sm:rounded-[12px] p-1.5 shrink-0 flex flex-col justify-between">
              <div className="flex items-center justify-between px-0.5">
                <button
                  onClick={() => navigateMenu(-1)}
                  aria-label="Previous Section"
                  className="green-lcd-text font-bold text-sm sm:text-base hover:scale-110 active:scale-90 transition-transform btn-press cursor-pointer px-1"
                >
                  &lt;
                </button>
                <span className="green-lcd-text font-extrabold text-[11px] sm:text-xs tracking-[0.14em] uppercase truncate max-w-[100px]">
                  {menuData[selectedIndex]?.title || 'HOME'}
                </span>
                <button
                  onClick={() => navigateMenu(1)}
                  aria-label="Next Section"
                  className="green-lcd-text font-bold text-sm sm:text-base hover:scale-110 active:scale-90 transition-transform btn-press cursor-pointer px-1"
                >
                  &gt;
                </button>
              </div>

              <div className="flex items-center justify-between mt-1 pt-0.5 border-t border-[#14532d]/70 text-[8.5px] sm:text-[9px]">
                <div className="flex items-center gap-1 green-lcd-text font-bold">
                  <span>{batteryLevel}%</span>
                  <div className="w-3.5 h-1.5 border border-[#4ade80] rounded-[1px] p-[1px] flex items-center">
                    <div className="h-full bg-[#4ade80]" style={{ width: `${batteryLevel}%` }} />
                  </div>
                </div>

                <div className="flex items-center gap-1 green-lcd-text font-bold">
                  <span className="w-1.5 h-1.5 rounded-full bg-red-500 shadow-[0_0_8px_#ef4444] animate-pulse" />
                  <span className="tracking-tight">{deadlineCountdown}</span>
                </div>
              </div>
            </div>

            {/* 2. SCULPTED NAVIGATION CLUSTER WITH ROTARY JOG-DIAL */}
            <div className="control-cluster-pod w-full flex-1 rounded-[14px] sm:rounded-[16px] p-1.5 sm:p-2 flex flex-col justify-between relative overflow-hidden">

              {/* TOP ROW: Themes (Molecule) | Home (Pill) | Info (i) */}
              <div className="w-full flex items-center justify-between z-10 shrink-0">
                <button
                  onClick={() => selectIndexDirect(1)}
                  aria-label="Themes"
                  title="Themes"
                  className={`w-7 h-7 sm:w-8 sm:h-8 rounded-[9px] flex items-center justify-center border transition-all btn-press ${
                    selectedIndex === 1
                      ? 'border-cyan-400 bg-cyan-950 text-cyan-300 shadow-[0_0_12px_rgba(34,211,238,0.4)]'
                      : 'border-cyan-500/25 bg-[#051117] text-neutral-400 hover:text-cyan-200'
                  }`}
                >
                  <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
                    <circle cx="12" cy="7" r="3" />
                    <circle cx="6" cy="17" r="3" />
                    <circle cx="18" cy="17" r="3" />
                    <line x1="8.5" y1="15" x2="10.5" y2="9.5" />
                    <line x1="15.5" y1="15" x2="13.5" y2="9.5" />
                  </svg>
                </button>

                <button
                  onClick={() => selectIndexDirect(0)}
                  aria-label="Home"
                  title="Home"
                  className={`w-12 sm:w-14 h-7 sm:h-8 rounded-t-[10px] rounded-b-[5px] flex items-center justify-center border transition-all btn-press ${
                    selectedIndex === 0
                      ? 'border-cyan-400 bg-cyan-950 text-cyan-300 shadow-[0_0_12px_rgba(34,211,238,0.4)]'
                      : 'border-cyan-500/25 bg-[#051117] text-neutral-400 hover:text-cyan-200'
                  }`}
                >
                  <svg className="w-3.5 h-3.5 sm:w-4 sm:h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                    <path d="M3 10.5L12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1v-9.5z" />
                  </svg>
                </button>

                <button
                  onClick={() => selectIndexDirect(2)}
                  aria-label="Information"
                  title="Info"
                  className={`w-7 h-7 sm:w-8 sm:h-8 rounded-[9px] flex items-center justify-center border transition-all btn-press ${
                    selectedIndex === 2
                      ? 'border-cyan-400 bg-cyan-950 text-cyan-300 shadow-[0_0_12px_rgba(34,211,238,0.4)]'
                      : 'border-cyan-500/25 bg-[#051117] text-neutral-400 hover:text-cyan-200'
                  }`}
                >
                  <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                    <circle cx="12" cy="12" r="9" />
                    <line x1="12" y1="8" x2="12" y2="8.5" strokeWidth="2.5" />
                    <line x1="12" y1="11" x2="12" y2="16" />
                  </svg>
                </button>
              </div>

              {/* CENTER: JOG-DIAL WHEEL WITH CENTRAL SET BUTTON */}
              <div className="w-full flex items-center justify-center my-0.5 z-10">
                <div
                  ref={dialRef}
                  onMouseDown={handleDialPointerDown}
                  onTouchStart={handleDialPointerDown}
                  className={`relative w-[84px] h-[84px] sm:w-[96px] sm:h-[96px] rounded-full flex items-center justify-center ${isDraggingDial ? 'cursor-grabbing' : 'cursor-grab'}`}
                >
                  {/* Knurled Outer Ring */}
                  <div
                    className="knurled-rotary-wheel absolute inset-0 rounded-full border-2 border-[#1c2a30] transition-transform duration-75"
                    style={{ transform: `rotate(${dialRotation}deg)` }}
                  >
                    <div className="absolute top-1 left-1/2 -translate-x-1/2 w-1 h-2 bg-cyan-400 rounded-full shadow-[0_0_6px_#22d3ee]" />
                  </div>

                  {/* Inner Dark Face with Directional Arrows */}
                  <div className="inner-rotary-face absolute inset-1.5 sm:inset-2 rounded-full flex items-center justify-center pointer-events-none">
                    <span className="absolute top-0.5 text-cyan-400 text-[7px]">▲</span>
                    <span className="absolute bottom-0.5 text-cyan-400 text-[7px]">▼</span>
                    <span className="absolute left-0.5 text-cyan-400 text-[7px]">◀</span>
                    <span className="absolute right-0.5 text-cyan-400 text-[7px]">▶</span>
                  </div>

                  {/* Center SET Confirmation Button */}
                  <button
                    onMouseDown={triggerFocus}
                    onMouseUp={() => { releaseFocus(); executeSelection(); }}
                    onTouchStart={triggerFocus}
                    onTouchEnd={() => { releaseFocus(); executeSelection(); }}
                    onClick={(e) => {
                      e.stopPropagation();
                      executeSelection();
                    }}
                    aria-label="SET"
                    title="SET — Execute Selection"
                    className="relative z-20 w-8 h-8 sm:w-9 sm:h-9 rounded-full bg-gradient-to-b from-[#091f27] via-[#051116] to-[#010507] border-2 border-cyan-400/50 flex items-center justify-center text-cyan-100 font-extrabold tracking-widest text-[9px] sm:text-[10px] shadow-[0_4px_10px_rgba(0,0,0,0.9),inset_0_2px_4px_rgba(255,255,255,0.2)] btn-press hover:border-cyan-300"
                  >
                    SET
                  </button>
                </div>
              </div>

              {/* BOTTOM ROW: Submissions | Back + Camera Pill | Aperture */}
              <div className="w-full flex items-center justify-between z-10 shrink-0">
                <button
                  onClick={() => selectIndexDirect(3)}
                  aria-label="Submissions"
                  title="Submissions"
                  className={`w-7 h-7 sm:w-8 sm:h-8 rounded-[9px] flex items-center justify-center border transition-all btn-press ${
                    selectedIndex === 3
                      ? 'border-cyan-400 bg-cyan-950 text-cyan-300 shadow-[0_0_12px_rgba(34,211,238,0.4)]'
                      : 'border-cyan-500/25 bg-[#051117] text-neutral-400 hover:text-cyan-200'
                  }`}
                >
                  <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                    <path d="M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" />
                    <polyline points="7 9 12 4 17 9" />
                    <line x1="12" y1="4" x2="12" y2="16" />
                  </svg>
                </button>

                {/* Center Pill: Back (Left) & Camera (Right) */}
                <div className="h-7 sm:h-8 px-0.5 bg-[#051117] border border-cyan-500/25 rounded-full flex items-center gap-0.5">
                  <button
                    onClick={onClose}
                    aria-label="Back"
                    title="Exit CameraOS"
                    className="w-6 h-6 sm:w-7 sm:h-7 rounded-full flex items-center justify-center text-cyan-300 hover:bg-cyan-950 btn-press"
                  >
                    <svg className="w-3 h-3 sm:w-3.5 sm:h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                      <path d="M19 12H5M12 19l-7-7 7-7" />
                    </svg>
                  </button>

                  <button
                    onClick={toggleWebcamMode}
                    aria-label="Toggle Camera"
                    title="Live Camera Sensor"
                    className={`w-6 h-6 sm:w-7 sm:h-7 rounded-full flex items-center justify-center transition-all btn-press ${
                      isWebcamMode
                        ? 'bg-cyan-400 text-black shadow-[0_0_10px_#22d3ee]'
                        : 'text-cyan-300 hover:bg-cyan-950'
                    }`}
                  >
                    <svg className="w-3 h-3 sm:w-3.5 sm:h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                      <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
                      <circle cx="12" cy="13" r="3.5" />
                    </svg>
                  </button>
                </div>

                <button
                  onClick={() => selectIndexDirect(4)}
                  aria-label="Aperture / Committee"
                  title="Committee"
                  className={`w-7 h-7 sm:w-8 sm:h-8 rounded-[9px] flex items-center justify-center border transition-all btn-press ${
                    selectedIndex === 4
                      ? 'border-cyan-400 bg-cyan-950 text-cyan-300 shadow-[0_0_12px_rgba(34,211,238,0.4)]'
                      : 'border-cyan-500/25 bg-[#051117] text-neutral-400 hover:text-cyan-200'
                  }`}
                >
                  <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                    <circle cx="12" cy="8" r="4.5" />
                    <circle cx="8" cy="15" r="4.5" />
                    <circle cx="16" cy="15" r="4.5" />
                  </svg>
                </button>
              </div>

            </div>

          </div>

        </div>
      </div>
    </div>
  );
}

export const CameraMobileLandscape = CameraMenuLandscape;
export const CameraMenuMobile = CameraMenuLandscape;
export default CameraMenuLandscape;
