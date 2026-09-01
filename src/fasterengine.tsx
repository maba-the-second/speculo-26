/**
 * ============================================================================
 * SPECULO SCROLL-DRIVEN CINEMATIC CANVAS ENGINE
 * ============================================================================
 * Clean, lightweight, crystal-clear 1080p scroll-scrubbing engine
 * using direct WebP Image Sequences and Linear Interpolation (Lerp).
 * ============================================================================
 */

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";

/* ============================================================================
   ASSET SOURCES & CONSTANTS
   ============================================================================ */

export const CDN_HOST = "https://vz-9cead47f-89d.b-cdn.net";

export const PC_FRAME_COUNT = 194;
export const MOBILE_FRAME_COUNT = 267;

export const CRITICAL_LOGOS = [
  `${import.meta.env.BASE_URL}logo-white.png`,
  "https://raw.githubusercontent.com/dulajbandara28-sketch/Rajans-Media-unit/main/Logo%20White.png",
];

export const GALLERY_BACKGROUND_IMAGES = [
  "https://raw.githubusercontent.com/rajansphotography/spec/main/Speculo%20_26%20white.png",
  "https://raw.githubusercontent.com/rajansphotography/spec/main/Speculo%20_26%20lens.png",
  "https://raw.githubusercontent.com/rajansphotography/spec/main/1%20(1).jpg",
  "https://raw.githubusercontent.com/rajansphotography/spec/main/1%20(2).jpg",
  "https://raw.githubusercontent.com/rajansphotography/spec/main/1%20(3).jpg",
  "https://raw.githubusercontent.com/rajansphotography/spec/main/1%20(4).jpg",
  "https://raw.githubusercontent.com/rajansphotography/spec/main/1%20(5).jpg",
  "https://raw.githubusercontent.com/rajansphotography/spec/main/1%20(6).jpg",
  "https://raw.githubusercontent.com/rajansphotography/spec/main/1%20(7).jpg",
  "https://raw.githubusercontent.com/rajansphotography/spec/main/1%20(8).jpg",
  "https://raw.githubusercontent.com/rajansphotography/spec/main/1%20(9).jpg",
  "https://raw.githubusercontent.com/rajansphotography/spec/main/1.png",
  "https://raw.githubusercontent.com/rajansphotography/spec/main/2.png",
];

export const EXHIBITION_PAGES = [
  `${import.meta.env.BASE_URL}themes.html`,
  `${import.meta.env.BASE_URL}Submissions.html`,
];

/* ============================================================================
   TUNING CONSTANTS
   ============================================================================ */

/** Lerp interpolation factor for smooth scrubbing (0–1, lower = smoother). */
const LERP_FACTOR = 0.08;

/** Wheel scroll sensitivity (fraction-per-pixel of deltaY). */
const WHEEL_SENSITIVITY = 0.0006;

/** Touch swipe sensitivity (fraction-per-pixel of deltaY). */
const TOUCH_SENSITIVITY = 0.0015;

/** Scroll fraction at which the crossfade to main exhibition begins. */
const FADE_OUT_THRESHOLD = 0.90;

/** Scroll fraction at which the video-to-main transition completes. */
const COMPLETION_THRESHOLD = 0.995;

/** Maximum wait (ms) before forcing loading to complete. */
const LOADING_FALLBACK_MS = 15000;

/** Lerp rate for the loading progress bar animation. */
const PROGRESS_LERP_RATE = 0.15;

export type EngineStage = "video" | "main";
export type LoadingPhase = "loading" | "transition" | "ready";

/* ============================================================================
   ASSET PRELOADING HELPERS
   ============================================================================ */

const loadedImages = new Set<string>();

export async function fastPreloadImage(src: string): Promise<boolean> {
  if (loadedImages.has(src)) return true;

  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.decoding = "async";
    img.onload = () => {
      loadedImages.add(src);
      resolve(true);
    };
    img.onerror = () => resolve(false);
    img.src = src;
  });
}

export function prewarmCDNSockets() {
  if (typeof document === "undefined") return;
  const hosts = [
    CDN_HOST,
    "https://raw.githubusercontent.com",
    "https://cdnjs.cloudflare.com",
    "https://fonts.googleapis.com",
  ];
  hosts.forEach((href) => {
    if (!document.querySelector(`link[rel="preconnect"][href="${href}"]`)) {
      const link = document.createElement("link");
      link.rel = "preconnect";
      link.href = href;
      link.crossOrigin = "anonymous";
      document.head.appendChild(link);
    }
  });
}

export function startBackgroundAssetPipeline() {
  if (typeof window === "undefined") return;
  EXHIBITION_PAGES.forEach((page) => {
    if (!document.querySelector(`link[rel="prefetch"][href="${page}"]`)) {
      const link = document.createElement("link");
      link.rel = "prefetch";
      link.href = page;
      document.head.appendChild(link);
    }
  });
  GALLERY_BACKGROUND_IMAGES.forEach((url) => {
    fastPreloadImage(url);
  });
}

/* ============================================================================
   ENGINE CONTEXT & PROVIDER
   ============================================================================ */

interface FasterEngineContextValue {
  progress: number;
  phase: LoadingPhase;
  stage: EngineStage;
  setStage: (stage: EngineStage) => void;
  isMobile: boolean;
  frameCount: number;
  framesRef: React.MutableRefObject<HTMLImageElement[]>;
  registerProgressRef: (element: HTMLElement | null) => void;
  registerBarRef: (element: HTMLElement | null) => void;
}

const FasterEngineContext = createContext<FasterEngineContextValue | null>(null);

export function useFasterEngine() {
  const ctx = useContext(FasterEngineContext);
  if (!ctx) {
    throw new Error("useFasterEngine must be used within a FasterEngineProvider");
  }
  return ctx;
}

export function FasterEngineProvider({ children }: { children: React.ReactNode }) {
  const [phase, setPhase] = useState<LoadingPhase>("loading");
  const [stage, setStage] = useState<EngineStage>("video");
  const [progressState, setProgressState] = useState(0);

  const progressTextRef = useRef<HTMLElement | null>(null);
  const progressBarRef = useRef<HTMLElement | null>(null);

  const [isMobile, setIsMobile] = useState(() => {
    if (typeof window === "undefined") return false;
    return window.innerWidth <= 768 || window.matchMedia("(pointer: coarse)").matches;
  });

  const frameCount = isMobile ? MOBILE_FRAME_COUNT : PC_FRAME_COUNT;
  
  const base = import.meta.env.BASE_URL;
  const framePrefix = isMobile ? `${base}hero_mobile/ezgif-frame-` : `${base}hero_pc/ezgif-frame-`;
  
  const framesRef = useRef<HTMLImageElement[]>([]);
  const framesLoadedCount = useRef(0);

  const logoReadyRef = useRef(false);
  const targetProgressRef = useRef(10);
  const currentProgressRef = useRef(0);
  const completedRef = useRef(false);

  useEffect(() => {
    prewarmCDNSockets();
  }, []);

  useEffect(() => {
    const handleResize = () => {
      setIsMobile(window.innerWidth <= 768 || window.matchMedia("(pointer: coarse)").matches);
    };
    window.addEventListener("resize", handleResize, { passive: true });
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  const finalizeLoading = useCallback(() => {
    setPhase("transition");
    startBackgroundAssetPipeline();
    setTimeout(() => {
      setPhase("ready");
    }, 400);
  }, []);

  // Animate progress smoothly to 100%
  useEffect(() => {
    let rafId = 0;
    const tick = () => {
      const target = targetProgressRef.current;
      const current = currentProgressRef.current;

      if (current < target) {
        const step = Math.max(0.5, (target - current) * PROGRESS_LERP_RATE);
        currentProgressRef.current = Math.min(target, current + step);

        const intVal = Math.round(currentProgressRef.current);
        if (progressTextRef.current) {
          progressTextRef.current.textContent = String(intVal);
        }
        if (progressBarRef.current) {
          progressBarRef.current.style.width = `${currentProgressRef.current.toFixed(1)}%`;
        }
        if (intVal !== progressState && (intVal % 5 === 0 || intVal >= 100)) {
          setProgressState(intVal);
        }
      }

      if (completedRef.current && currentProgressRef.current >= 99.5) {
        currentProgressRef.current = 100;
        if (progressTextRef.current) progressTextRef.current.textContent = "100";
        if (progressBarRef.current) progressBarRef.current.style.width = "100%";
        setProgressState(100);
        finalizeLoading();
        return;
      }

      rafId = requestAnimationFrame(tick);
    };

    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, [finalizeLoading, progressState]);

  // Preload logo and frame sequence
  useEffect(() => {
    let mounted = true;
    fastPreloadImage(CRITICAL_LOGOS[0]).then((ok) => {
      if (!mounted) return;
      if (!ok && CRITICAL_LOGOS[1]) {
        fastPreloadImage(CRITICAL_LOGOS[1]);
      }
      logoReadyRef.current = true;
      targetProgressRef.current = Math.max(targetProgressRef.current, 15);
    });

    framesRef.current = new Array(frameCount);
    framesLoadedCount.current = 0;

    for (let i = 1; i <= frameCount; i++) {
      const num = String(i).padStart(3, '0');
      const src = `${framePrefix}${num}.webp`;
      const img = new Image();
      img.src = src;
      img.onload = () => {
        if (!mounted) return;
        framesLoadedCount.current++;
        
        const progressPercentage = 15 + (framesLoadedCount.current / frameCount) * 85;
        targetProgressRef.current = Math.max(targetProgressRef.current, progressPercentage);

        if (framesLoadedCount.current === frameCount) {
          completedRef.current = true;
          targetProgressRef.current = 100;
        }
      };
      img.onerror = () => {
        if (!mounted) return;
        framesLoadedCount.current++;
        if (framesLoadedCount.current === frameCount) {
          completedRef.current = true;
          targetProgressRef.current = 100;
        }
      };
      framesRef.current[i - 1] = img;
    }

    const fallbackTimeout = setTimeout(() => {
      if (!completedRef.current) {
        completedRef.current = true;
        targetProgressRef.current = 100;
      }
    }, LOADING_FALLBACK_MS);

    return () => {
      mounted = false;
      clearTimeout(fallbackTimeout);
    };
  }, [frameCount, framePrefix]);

  const registerProgressRef = useCallback((el: HTMLElement | null) => {
    progressTextRef.current = el;
    if (el) el.textContent = String(Math.round(currentProgressRef.current));
  }, []);

  const registerBarRef = useCallback((el: HTMLElement | null) => {
    progressBarRef.current = el;
    if (el) el.style.width = `${currentProgressRef.current}%`;
  }, []);

  return (
    <FasterEngineContext.Provider
      value={{
        progress: progressState,
        phase,
        stage,
        setStage,
        isMobile,
        frameCount,
        framesRef,
        registerProgressRef,
        registerBarRef,
      }}
    >
      {children}
    </FasterEngineContext.Provider>
  );
}

/* ============================================================================
   SMOOTH SCRUBBER HOOK (useFasterScrubber)
   ============================================================================ */

export interface VideoScrubberOptions {
  canvasRef: React.RefObject<HTMLCanvasElement | null>;
  videoStageRef: React.RefObject<HTMLDivElement | null>;
  homeStageRef: React.RefObject<HTMLDivElement | null>;
  mainIframeRef: React.RefObject<HTMLIFrameElement | null>;
  onScrolled?: () => void;
}

export function useFasterScrubber({
  canvasRef,
  videoStageRef,
  homeStageRef,
  mainIframeRef,
  onScrolled,
}: VideoScrubberOptions) {
  const { stage, setStage, phase, frameCount, framesRef } = useFasterEngine();

  // Scroll Timeline State
  const scrollFractionRef = useRef(0); // 0.0 to 1.0
  const targetFrameRef = useRef(0);
  const currentFrameRef = useRef(0);
  const isCompletedRef = useRef(false);
  const touchStartYRef = useRef(0);

  // Resize Canvas
  useEffect(() => {
    const resizeCanvas = () => {
      const canvas = canvasRef.current;
      if (canvas) {
        canvas.width = window.innerWidth;
        canvas.height = window.innerHeight;
        // Paint immediate frame on resize so it doesn't flicker black
        const frameIndex = Math.min(frameCount - 1, Math.max(0, Math.round(currentFrameRef.current)));
        const ctx = canvas.getContext("2d", { alpha: false });
        const img = framesRef.current[frameIndex];
        if (ctx && img && img.complete && img.naturalWidth > 0) {
          const canvasRatio = canvas.width / canvas.height;
          const imgRatio = img.width / img.height;
          let drawWidth, drawHeight, offsetX, offsetY;
          if (canvasRatio > imgRatio) {
            drawWidth = canvas.width;
            drawHeight = canvas.width / imgRatio;
            offsetX = 0;
            offsetY = (canvas.height - drawHeight) / 2;
          } else {
            drawWidth = canvas.height * imgRatio;
            drawHeight = canvas.height;
            offsetX = (canvas.width - drawWidth) / 2;
            offsetY = 0;
          }
          if (drawWidth > 0 && drawHeight > 0) {
            ctx.drawImage(img, offsetX, offsetY, drawWidth, drawHeight);
          }
        }
      }
    };
    
    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);
    return () => window.removeEventListener('resize', resizeCanvas);
  }, [canvasRef, frameCount, framesRef]);

  // Complete Transition to Main Exhibition
  const handleCompletion = useCallback(() => {
    if (isCompletedRef.current) return;
    isCompletedRef.current = true;

    const vStage = videoStageRef.current;
    const hStage = homeStageRef.current;

    if (vStage) {
      vStage.style.opacity = "0";
      vStage.style.visibility = "hidden";
      vStage.style.display = "none";
      vStage.style.pointerEvents = "none";
    }

    if (hStage) {
      hStage.style.opacity = "1";
      hStage.style.visibility = "visible";
      hStage.style.display = "block";
      hStage.style.pointerEvents = "auto";
    }

    setStage("main");
    onScrolled?.();
  }, [homeStageRef, onScrolled, setStage, videoStageRef]);

  // Main Smooth Lerp Render Loop (runs on requestAnimationFrame)
  useEffect(() => {
    let rafId = 0;

    const renderLoop = () => {
      const vStage = videoStageRef.current;
      const hStage = homeStageRef.current;

      if (stage === "video" && !isCompletedRef.current) {
        if (frameCount > 0) {
          // Linear Interpolation (Lerp 0.08) for ultra smooth scrubbing
          currentFrameRef.current += (targetFrameRef.current - currentFrameRef.current) * LERP_FACTOR;

          const frameIndex = Math.min(frameCount - 1, Math.max(0, Math.round(currentFrameRef.current)));
          const canvas = canvasRef.current;
          
          if (canvas) {
            const ctx = canvas.getContext("2d", { alpha: false });
            const img = framesRef.current[frameIndex];
            
            if (ctx && img && img.complete && img.naturalWidth > 0) {
              const canvasRatio = canvas.width / canvas.height;
              const imgRatio = img.width / img.height;
              
              let drawWidth, drawHeight, offsetX, offsetY;

              if (canvasRatio > imgRatio) {
                drawWidth = canvas.width;
                drawHeight = canvas.width / imgRatio;
                offsetX = 0;
                offsetY = (canvas.height - drawHeight) / 2;
              } else {
                drawWidth = canvas.height * imgRatio;
                drawHeight = canvas.height;
                offsetX = (canvas.width - drawWidth) / 2;
                offsetY = 0;
              }
              
              if (drawWidth > 0 && drawHeight > 0) {
                ctx.drawImage(img, offsetX, offsetY, drawWidth, drawHeight);
              }
            }
          }
        }

        // Fade out video and dissolve in main exhibition for the last 10% of scroll
        const scrollFraction = scrollFractionRef.current;
        const fadeOutThreshold = FADE_OUT_THRESHOLD;

        if (vStage && hStage) {
          if (scrollFraction >= fadeOutThreshold) {
            const opacityFraction = Math.max(0, Math.min(1, (scrollFraction - fadeOutThreshold) / (1 - fadeOutThreshold)));
            const opacity = 1 - opacityFraction;

            vStage.style.opacity = opacity.toString();
            hStage.style.opacity = opacityFraction.toString();

            if (scrollFraction >= COMPLETION_THRESHOLD) {
              handleCompletion();
            }
          } else {
            vStage.style.opacity = "1";
            hStage.style.opacity = "0";
          }
        }
      }

      rafId = requestAnimationFrame(renderLoop);
    };

    rafId = requestAnimationFrame(renderLoop);
    return () => cancelAnimationFrame(rafId);
  }, [frameCount, framesRef, handleCompletion, homeStageRef, stage, canvasRef, videoStageRef]);

  // Wheel input handler
  const handleWheel = useCallback(
    (e: React.WheelEvent) => {
      if (phase !== "ready" || stage !== "video" || isCompletedRef.current) return;

      const rawDelta = e.deltaY;
      if (!rawDelta) return;

      const sensitivity = WHEEL_SENSITIVITY;
      const nextFraction = Math.max(0, Math.min(1, scrollFractionRef.current + rawDelta * sensitivity));
      scrollFractionRef.current = nextFraction;

      targetFrameRef.current = nextFraction * (frameCount - 1);

      onScrolled?.();
    },
    [frameCount, onScrolled, phase, stage]
  );

  // Touch input handlers (mobile & tablet swipe scrubbing)
  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    const touch = e.touches[0];
    if (touch) {
      touchStartYRef.current = touch.clientY;
    }
  }, []);

  const handleTouchMove = useCallback(
    (e: React.TouchEvent) => {
      if (phase !== "ready" || stage !== "video" || isCompletedRef.current) return;

      const touch = e.touches[0];
      if (!touch) return;

      const deltaY = touchStartYRef.current - touch.clientY;
      touchStartYRef.current = touch.clientY;

      const sensitivity = TOUCH_SENSITIVITY;
      const nextFraction = Math.max(0, Math.min(1, scrollFractionRef.current + deltaY * sensitivity));
      scrollFractionRef.current = nextFraction;

      targetFrameRef.current = nextFraction * (frameCount - 1);

      onScrolled?.();
    },
    [frameCount, onScrolled, phase, stage]
  );

  // Instant Section Navigation
  const navigateInstant = useCallback(
    (targetId?: string) => {
      scrollFractionRef.current = 1.0;
      handleCompletion();

      const iframe = mainIframeRef.current;
      if (!iframe) return;

      if (targetId === "themes") {
        iframe.src = "/themes.html";
        return;
      }
      if (targetId === "submissions") {
        iframe.src = "/Submissions.html";
        return;
      }

      const currentSrc = iframe.src || "";
      if (!currentSrc.includes("main.html")) {
        iframe.src = targetId ? `/main.html#${targetId}` : "/main.html";
        return;
      }

      try {
        const win = iframe.contentWindow;
        if (!win) return;

        if (
          targetId === "committeeSection" ||
          targetId === "committee" ||
          targetId === "committeeRoot"
        ) {
          try {
            (win as any).unlockCommittee?.();
          } catch {}
        }

        if (targetId) {
          const el = iframe.contentDocument?.getElementById(targetId);
          if (el) {
            el.scrollIntoView({ behavior: "smooth", block: "start" });
          }
          win.postMessage({ type: "NAVIGATE", targetId }, "*");
        }
      } catch {
        if (targetId) {
          iframe.src = `/main.html#${targetId}`;
        }
      }
    },
    [handleCompletion, mainIframeRef]
  );

  const onSeeked = useCallback(() => {}, []);

  return {
    handleWheel,
    handleTouchStart,
    handleTouchMove,
    onSeeked,
    navigateInstant,
  };
}

export function PBSSDevOverlay() {
  return null;
}
