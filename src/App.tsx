import React, {
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";

import { TargetCursor } from "./components/TargetCursor";
import { MagicRings } from "./components/MagicRings";
import {
  CameraMenu,
  MenuItem,
} from "./components/CameraMenu";
import { CameraMenuMobile } from "./components/CameraMenuMobile";
import { CameraMobileLandscape } from "./components/CameraMobileLandscape";
import {
  FasterEngineProvider,
  useFasterEngine,
  useFasterScrubber,
} from "./fasterengine";

/* ============================================================================
   SPECULO APP INNER
   ============================================================================ */

function SpeculoAppInner() {
  const {
    phase,
    stage,
    markVideoReady,
    markVideoFirstFrame,
    isMobile,
    activeVideoSrc,
    registerProgressRef,
    registerBarRef,
  } = useFasterEngine();

  const [gsapLoaded, setGsapLoaded] = useState(false);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [hasScrolled, setHasScrolled] = useState(false);

  const [isLandscape, setIsLandscape] = useState(() => {
    if (typeof window === "undefined") return false;
    return window.innerWidth > window.innerHeight;
  });

  const [isMobileDevice, setIsMobileDevice] = useState(() => {
    if (typeof window === "undefined") return false;
    return (
      window.innerWidth <= 768 ||
      (window.innerWidth <= 1024 && window.innerHeight <= 600) ||
      window.matchMedia("(pointer: coarse)").matches
    );
  });

  useEffect(() => {
    const handleOrientation = () => {
      setIsLandscape(window.innerWidth > window.innerHeight);
      setIsMobileDevice(
        window.innerWidth <= 768 ||
        (window.innerWidth <= 1024 && window.innerHeight <= 600) ||
        window.matchMedia("(pointer: coarse)").matches
      );
    };
    window.addEventListener("resize", handleOrientation, { passive: true });
    window.addEventListener("orientationchange", handleOrientation, { passive: true });
    return () => {
      window.removeEventListener("resize", handleOrientation);
      window.removeEventListener("orientationchange", handleOrientation);
    };
  }, []);

  // Stage & Video DOM Refs
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const videoStageRef = useRef<HTMLDivElement | null>(null);
  const homeStageRef = useRef<HTMLDivElement | null>(null);
  const mainIframeRef = useRef<HTMLIFrameElement | null>(null);

  // Faster Engine Scrubbing & Physics Engine
  const {
    handleWheel,
    handleTouchStart,
    handleTouchMove,
    onSeeked,
    navigateInstant,
  } = useFasterScrubber({
    videoRef,
    videoStageRef,
    homeStageRef,
    mainIframeRef,
    onScrolled: () => {
      if (!hasScrolled) setHasScrolled(true);
    },
  });

  /* ============================================================================
     GSAP DYNAMIC LOADER
     ============================================================================ */

  useEffect(() => {
    if ((window as any).gsap) {
      setGsapLoaded(true);
      return;
    }

    const existing = document.querySelector("script[data-speculo-gsap]");
    if (existing) {
      existing.addEventListener("load", () => setGsapLoaded(true), {
        once: true,
      });
      return;
    }

    const script = document.createElement("script");
    script.src = "https://cdnjs.cloudflare.com/ajax/libs/gsap/3.12.5/gsap.min.js";
    script.async = true;
    script.dataset.speculoGsap = "true";
    script.onload = () => setGsapLoaded(true);
    document.head.appendChild(script);
  }, []);

  /* ============================================================================
     FIRST FRAME & READY DETECTION
     ============================================================================ */

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const videoAny = video as HTMLVideoElement & {
      requestVideoFrameCallback?: (
        callback: (now: number, metadata: any) => void
      ) => number;
      cancelVideoFrameCallback?: (handle: number) => void;
    };

    let callbackId: number | null = null;

    if (typeof videoAny.requestVideoFrameCallback === "function") {
      callbackId = videoAny.requestVideoFrameCallback(() => {
        markVideoFirstFrame();
        markVideoReady();
      });
    }

    return () => {
      if (
        callbackId !== null &&
        typeof videoAny.cancelVideoFrameCallback === "function"
      ) {
        try {
          videoAny.cancelVideoFrameCallback(callbackId);
        } catch {}
      }
    };
  }, [activeVideoSrc, markVideoFirstFrame, markVideoReady]);

  /* ============================================================================
     IFRAME EVENT FORWARDING
     ============================================================================ */

  const handleIframeLoad = useCallback(() => {
    try {
      const iframe = mainIframeRef.current;
      const iframeWindow = iframe?.contentWindow;
      if (!iframeWindow) return;

      iframeWindow.addEventListener("mousemove", (e: MouseEvent) => {
        const rect = mainIframeRef.current?.getBoundingClientRect();
        if (!rect) return;

        window.dispatchEvent(
          new MouseEvent("mousemove", {
            clientX: e.clientX + rect.left,
            clientY: e.clientY + rect.top,
            bubbles: true,
          })
        );
      });
    } catch {}
  }, []);

  /* ============================================================================
     NAVIGATION HANDLER
     ============================================================================ */

  const handleNavigateToSection = useCallback(
    (item: MenuItem) => {
      setIsMenuOpen(false);
      navigateInstant(item.targetId);
    },
    [navigateInstant]
  );

  return (
    <div
      className="w-full h-screen bg-[#020508] overflow-hidden relative font-sans select-none"
      onWheel={handleWheel}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
    >
      {/* ======================================================================
          HIGH-PERFORMANCE TARGET CURSOR
          ====================================================================== */}

      {gsapLoaded && (
        <TargetCursor
          spinDuration={3.5}
          hideDefaultCursor={false}
          parallaxOn={true}
          hoverDuration={0.25}
          cursorColorOnTarget="#64DFDF"
        />
      )}

      {/* ======================================================================
          GLOBAL STYLES & PERFORMANCE MATRICES
          ====================================================================== */}

      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Orbitron:wght@400;700;900&family=Share+Tech+Mono&display=swap');

        .orbitron-font {
          font-family: 'Orbitron', sans-serif;
        }

        .target-cursor-wrapper {
          position: fixed;
          top: 0;
          left: 0;
          width: 0;
          height: 0;
          pointer-events: none;
          z-index: 999999;
          transform: translate(-50%, -50%);
        }

        .target-cursor-dot {
          position: absolute;
          left: 50%;
          top: 50%;
          width: 4px;
          height: 4px;
          background: #64DFDF;
          border-radius: 50%;
          transform: translate(-50%, -50%);
          will-change: transform;
          box-shadow: 0 0 8px rgba(100,223,223,0.8);
          pointer-events: none;
        }

        .target-cursor-corner {
          position: absolute;
          left: 50%;
          top: 50%;
          width: 12px;
          height: 12px;
          border: 2px solid #64DFDF;
          will-change: transform;
          filter: drop-shadow(0 0 4px rgba(100,223,223,0.5));
          pointer-events: none;
        }

        .corner-tl {
          border-right: none;
          border-bottom: none;
        }

        .corner-tr {
          border-left: none;
          border-bottom: none;
        }

        .corner-br {
          border-left: none;
          border-top: none;
        }

        .corner-bl {
          border-right: none;
          border-top: none;
        }

        .cursor-follower,
        .mouse-circle,
        .cursor-circle,
        .cursor-light {
          display: none !important;
          opacity: 0 !important;
          visibility: hidden !important;
          pointer-events: none !important;
        }

        .speculo-video {
          transform: translate3d(0,0,0);
          backface-visibility: hidden;
          -webkit-backface-visibility: hidden;
          will-change: transform;
          contain: layout paint;
          object-position: center center;
        }

        .speculo-video-stage {
          isolation: isolate;
          contain: layout paint;
          backface-visibility: hidden;
          -webkit-backface-visibility: hidden;
        }

        video {
          user-select: none;
          -webkit-user-drag: none;
        }

        .speculo-video-stage,
        .speculo-video-stage video {
          transition: none !important;
        }
      `}</style>

      {/* ======================================================================
          FASTER LOADING SCREEN (ZERO-JANK DIRECT-DOM HUD)
          ====================================================================== */}

      {phase !== "ready" && (
        <div
          className={`
            absolute inset-0 z-50
            flex items-center justify-center
            bg-[#020508]
            transition-all
            duration-500
            ease-out
            ${
              phase === "transition"
                ? "scale-125 opacity-0 blur-xl brightness-150 pointer-events-none"
                : "scale-100 opacity-100"
            }
          `}
        >
          <div className="absolute inset-0 w-full h-full">
            <MagicRings
              color="#ffffff"
              colorTwo="#0595b6"
              ringCount={6}
              speed={1.2}
              opacity={1}
              noiseAmount={0.12}
              followMouse={true}
            />
          </div>

          <div className="absolute z-10 flex flex-col items-center pointer-events-none drop-shadow-2xl">
            <img
              src="/logo-white.png"
              alt="Speculo Logo"
              className="w-48 sm:w-64 mb-10 object-contain drop-shadow-[0_0_20px_rgba(255,255,255,0.35)]"
              onError={(e) => {
                e.currentTarget.src =
                  "https://raw.githubusercontent.com/dulajbandara28-sketch/Rajans-Media-unit/main/Logo%20White.png";
              }}
            />

            <div className="flex flex-col items-center gap-2">
              <div
                className="text-white text-5xl sm:text-7xl orbitron-font tracking-widest font-black flex items-baseline gap-1"
                style={{
                  textShadow: "0 0 20px rgba(5,149,182,0.8)",
                }}
              >
                <span ref={registerProgressRef}>0</span>
                <span className="text-cyan-500 text-4xl">%</span>
              </div>

              <div className="text-cyan-400/80 text-xs sm:text-sm tracking-[0.3em] uppercase font-mono mt-4 animate-pulse">
                Initializing ...
              </div>

              <div className="w-64 h-1 bg-gray-800 mt-4 rounded-full overflow-hidden relative">
                <div
                  ref={registerBarRef}
                  className="h-full bg-cyan-400 shadow-[0_0_10px_#0595b6] transition-none w-0"
                />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ======================================================================
          DIRECT VIDEO STAGE
          ====================================================================== */}

      <div
        ref={videoStageRef}
        style={{
          display: stage === "main" ? "none" : "block",
          opacity: stage === "main" ? 0 : 1,
          visibility: stage === "main" ? "hidden" : "visible",
        }}
        className="speculo-video-stage absolute inset-0 w-full h-full bg-[#020508] will-change-transform will-change-opacity z-10"
      >
        <video
          ref={videoRef}
          key={activeVideoSrc}
          src={activeVideoSrc}
          preload="auto"
          muted
          playsInline
          controls={false}
          disablePictureInPicture
          className="speculo-video w-full h-full object-cover select-none pointer-events-none"
          onLoadedMetadata={(e) => {
            const vid = e.currentTarget;
            if (Number.isFinite(vid.duration) && vid.duration > 0) {
              try {
                vid.currentTime = 0;
              } catch {}
            }
            markVideoReady();
          }}
          onLoadedData={() => {
            markVideoReady();
            markVideoFirstFrame();
          }}
          onCanPlay={() => {
            markVideoReady();
          }}
          onSeeked={onSeeked}
          onError={(e) => {
            console.error("[SPECULO] Video streaming notice", e.currentTarget.error);
          }}
          onContextMenu={(e) => e.preventDefault()}
        />

        {/* Scroll Indicator & Tap to Enter */}
        {!hasScrolled && !isMenuOpen && phase === "ready" && (
          <div 
            onClick={() => navigateInstant()}
            className="absolute bottom-8 sm:bottom-10 inset-x-0 z-20 flex flex-col items-center justify-center cursor-pointer pointer-events-auto group select-none transition-transform hover:scale-105"
            title="Scroll or Tap to Enter Exhibition"
          >
            <div className="w-6 h-10 border-2 border-white/40 group-hover:border-[#64DFDF] rounded-full flex justify-center pt-2 mb-2 bg-black/40 backdrop-blur-md shadow-[0_0_20px_rgba(0,0,0,0.6)] transition-colors">
              <div className="w-1.5 h-3 bg-[#64DFDF] rounded-full animate-bounce shadow-[0_0_8px_#64DFDF]" />
            </div>
            <span className="text-white/80 group-hover:text-[#64DFDF] text-[11px] font-mono tracking-[0.3em] uppercase drop-shadow-md transition-colors">
              Scroll 
            </span>
          </div>
        )}
      </div>

      {/* ======================================================================
          MAIN EXHIBITION STAGE
          ====================================================================== */}

      <div
        ref={homeStageRef}
        style={{
          opacity: stage === "main" ? 1 : 0,
          visibility: stage === "main" ? "visible" : "hidden",
          pointerEvents: stage === "main" ? "auto" : "none",
        }}
        className={`
          absolute inset-0
          w-full h-full
          bg-[#020508]
          will-change-transform
          will-change-opacity
          ${stage === "main" ? "z-20" : "z-0"}
        `}
      >
        <iframe
          ref={mainIframeRef}
          src="/main.html"
          title="Speculo Main Exhibition"
          onLoad={handleIframeLoad}
          className="w-full h-full border-0 bg-[#020508]"
        />
      </div>

      {/* ======================================================================
          CAMERAOS MENU BUTTON
          ====================================================================== */}

      {phase === "ready" && !isMenuOpen && (
        <button
          onClick={() => setIsMenuOpen(true)}
          aria-label="Open CameraOS Menu"
          className="cursor-target fixed top-6 left-6 sm:top-8 sm:left-8 z-40 w-13 h-13 sm:w-14 sm:h-14 rounded-full bg-black/40 backdrop-blur-xl border border-white/20 flex flex-col items-center justify-center gap-1.5 cursor-pointer hover:bg-white/20 hover:scale-105 shadow-[0_8px_32px_rgba(0,0,0,0.5)] transition-all duration-300"
        >
          <span className="w-5 sm:w-6 h-0.5 bg-white shadow-sm" />
          <span className="w-5 sm:w-6 h-0.5 bg-white shadow-sm" />
          <span className="w-5 sm:w-6 h-0.5 bg-white shadow-sm" />
        </button>
      )}

      {/* ======================================================================
          CAMERAOS MENU DIALOG
          ====================================================================== */}

      {phase === "ready" &&
        (isMobile || isMobileDevice ? (
          isLandscape ? (
            <CameraMobileLandscape
              isOpen={isMenuOpen}
              onClose={() => setIsMenuOpen(false)}
              onNavigate={handleNavigateToSection}
              onSwitchToPortrait={() => setIsLandscape(false)}
            />
          ) : (
            <CameraMenuMobile
              isOpen={isMenuOpen}
              onClose={() => setIsMenuOpen(false)}
              onNavigate={handleNavigateToSection}
              onSwitchToLandscape={() => setIsLandscape(true)}
            />
          )
        ) : (
          <CameraMenu
            isOpen={isMenuOpen}
            onClose={() => setIsMenuOpen(false)}
            onNavigate={handleNavigateToSection}
          />
        ))}
    </div>
  );
}

/* ============================================================================
   EXPORT ROOT APP WITH FASTER ENGINE PROVIDER
   ============================================================================ */

export default function App() {
  return (
    <FasterEngineProvider>
      <SpeculoAppInner />
    </FasterEngineProvider>
  );
}