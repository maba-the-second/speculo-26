import React, { useEffect, useRef } from 'react';

// Define types for pointer and animation state
interface PointerState {
    x: number;
    y: number;
    tx: number;
    ty: number;
    active: number;
    activeTarget: number;
}

interface LogoState {
    currentX: number;
    currentY: number;
    currentScale: number;
}

const logoVsSource = `#version 300 es
in vec2 position;
in vec2 uv;
out vec2 vUv;
void main() {
    vUv = uv;
    gl_Position = vec4(position, 0.0, 1.0);
}`;

const logoFsSource = `#version 300 es
precision highp float;

uniform sampler2D uTextTexture;
uniform vec2 uResolution;
uniform vec2 uPointer;
uniform float uPointerActive;
uniform float uTime;
uniform float uWarpStrength;
uniform float uWarpScale;
uniform float uSpeed;
uniform float uPointerInfluence;
uniform float uPointerStrength;
uniform float uRefraction;
uniform float uRipple;
uniform float uMotion;

in vec2 vUv;
out vec4 fragColor;

float hash(vec2 p) {
    p = fract(p * vec2(123.34, 456.21));
    p += dot(p, p + 45.32);
    return fract(p.x * p.y);
}

float noise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);

    float a = hash(i);
    float b = hash(i + vec2(1.0, 0.0));
    float c = hash(i + vec2(0.0, 1.0));
    float d = hash(i + vec2(1.0, 1.0));

    return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}

float fbm(vec2 p) {
    float value = 0.0;
    float amplitude = 0.5;
    for (int i = 0; i < 4; i++) {
        value += amplitude * noise(p);
        p *= 2.02;
        amplitude *= 0.5;
    }
    return value;
}

vec4 sampleText(vec2 uv) {
    if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) {
        return vec4(0.0);
    }
    return texture(uTextTexture, uv);
}

void main() {
    vec2 uv = vUv;
    float aspect = uResolution.x / max(uResolution.y, 1.0);
    float time = uTime * uSpeed;
    float scale = max(uWarpScale, 0.001);

    vec2 drift = vec2(time * 0.055, -time * 0.045);
    float n1 = fbm(uv * scale * 3.1 + drift);
    float n2 = fbm((uv + 19.17) * scale * 3.4 - drift.yx);
    vec2 ambient = (vec2(n1, n2) - 0.5) * uWarpStrength * 0.045 * uMotion;

    vec2 pointerDelta = uv - uPointer;
    vec2 aspectDelta = vec2(pointerDelta.x * aspect, pointerDelta.y);
    float dist = length(aspectDelta);
    float radius = max(uPointerInfluence, 0.001);
    float t = clamp(dist / radius, 0.0, 1.0);
    float lens = smoothstep(radius, 0.0, dist) * uPointerActive;
    float bulge = t * (1.0 - t) * (1.0 - t) * 6.75 * uPointerActive;
    vec2 dir = dist > 0.0001 ? vec2(aspectDelta.x / aspect, aspectDelta.y) / dist : vec2(0.0);

    float rippleWave = sin(dist * 28.0 - time * 4.2) * 0.5 + 0.5;
    float rippleRing = (rippleWave - 0.5) * uRipple;
    vec2 pointerWarp = -dir * bulge * uPointerStrength * 0.045;
    pointerWarp += dir * rippleRing * bulge * uPointerStrength * 0.016;

    vec2 displaced = uv + ambient + pointerWarp;
    vec2 splitDir = ambient + pointerWarp;
    float splitLen = length(splitDir);
    splitDir = splitLen > 0.00001 ? splitDir / splitLen : vec2(0.7071, 0.7071);
    vec2 split = splitDir * uRefraction * 0.16 * (0.35 + lens * 1.65);

    vec4 base = sampleText(displaced);
    float r = sampleText(displaced + split).r;
    float g = base.g;
    float b = sampleText(displaced - split).b;
    float a = max(max(sampleText(displaced + split).a, base.a), sampleText(displaced - split).a);

    vec3 color = vec3(r, g, b) + lens * base.a * 0.055;
    fragColor = vec4(color, a);
}`;

interface InteractiveLogoProps {
    className?: string;
    scaleMultiplier?: number;
}

export default function InteractiveLogo({ className = '', scaleMultiplier = 0.85 }: InteractiveLogoProps) {
    const containerRef = useRef<HTMLDivElement>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);
    
    // Animation and State Refs
    const rafIdRef = useRef<number>(0);
    const timeStartRef = useRef<number>(0);
    const pointerRef = useRef<PointerState>({ x: 0.5, y: 0.5, tx: 0.5, ty: 0.5, active: 0, activeTarget: 0 });
    const logoStateRef = useRef<LogoState>({ currentX: 0.5, currentY: 0.5, currentScale: scaleMultiplier });
    
    // Interaction Refs
    const isHoveredRef = useRef<boolean>(false);
    const shineStateRef = useRef({ progress: -0.5, speed: 0.018, alpha: 0 });
    const currentAngleRef = useRef<number>(0);
    
    // Asset Refs
    const logoBaseRef = useRef<HTMLImageElement | null>(null);
    const logoLensRef = useRef<HTMLImageElement | null>(null);
    const lensCenterRef = useRef({ x: 0, y: 0 });
    const isLoadedRef = useRef<boolean>(false);

    // Offscreen Canvas Refs
    const offscreenCanvasRef = useRef<HTMLCanvasElement | null>(null);
    const offscreenCtxRef = useRef<CanvasRenderingContext2D | null>(null);
    const shineCanvasRef = useRef<HTMLCanvasElement | null>(null);
    const shineCtxRef = useRef<CanvasRenderingContext2D | null>(null);

    // WebGL Setup Refs
    const glRef = useRef<WebGL2RenderingContext | null>(null);
    const programRef = useRef<WebGLProgram | null>(null);
    const uniformsRef = useRef<Record<string, WebGLUniformLocation | null>>({});
    const textureRef = useRef<WebGLTexture | null>(null);

    const createShader = (gl: WebGL2RenderingContext, type: number, source: string) => {
        const shader = gl.createShader(type);
        if (!shader) return null;
        gl.shaderSource(shader, source);
        gl.compileShader(shader);
        if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
            gl.deleteShader(shader);
            return null;
        }
        return shader;
    };

    const createProgram = (gl: WebGL2RenderingContext, vsSource: string, fsSource: string) => {
        const vs = createShader(gl, gl.VERTEX_SHADER, vsSource);
        const fs = createShader(gl, gl.FRAGMENT_SHADER, fsSource);
        if (!vs || !fs) return null;
        const program = gl.createProgram();
        if (!program) return null;
        gl.attachShader(program, vs);
        gl.attachShader(program, fs);
        gl.linkProgram(program);
        if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
            return null;
        }
        return program;
    };

    const calculateLensCenter = (img: HTMLImageElement) => {
        try {
            const tempCanvas = document.createElement('canvas');
            tempCanvas.width = img.naturalWidth;
            tempCanvas.height = img.naturalHeight;
            const tempCtx = tempCanvas.getContext('2d');
            if (!tempCtx) return { x: img.naturalWidth / 2, y: img.naturalHeight / 2 };
            
            tempCtx.drawImage(img, 0, 0);
            const imgData = tempCtx.getImageData(0, 0, tempCanvas.width, tempCanvas.height);
            const data = imgData.data;

            let minX = tempCanvas.width, maxX = 0, minY = tempCanvas.height, maxY = 0;
            let foundPixels = false;

            for (let y = 0; y < tempCanvas.height; y += 2) {
                for (let x = 0; x < tempCanvas.width; x += 2) {
                    const alpha = data[(y * tempCanvas.width + x) * 4 + 3];
                    if (alpha > 30) {
                        foundPixels = true;
                        if (x < minX) minX = x;
                        if (x > maxX) maxX = x;
                        if (y < minY) minY = y;
                        if (y > maxY) maxY = y;
                    }
                }
            }
            if (foundPixels) {
                return { x: (minX + maxX) / 2, y: (minY + maxY) / 2 };
            }
        } catch {
            // fallback
        }
        return { x: img.naturalWidth / 2, y: img.naturalHeight / 2 };
    };

    const initWebGL = (canvas: HTMLCanvasElement) => {
        const gl = canvas.getContext('webgl2', { alpha: true, antialias: true, premultipliedAlpha: false });
        if (!gl) return false;
        glRef.current = gl;

        const program = createProgram(gl, logoVsSource, logoFsSource);
        if (!program) return false;
        programRef.current = program;
        gl.useProgram(program);

        const positionsUV = new Float32Array([
            -1, -1, 0, 0,
             1, -1, 1, 0,
            -1,  1, 0, 1,
            -1,  1, 0, 1,
             1, -1, 1, 0,
             1,  1, 1, 1
        ]);

        const vbo = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
        gl.bufferData(gl.ARRAY_BUFFER, positionsUV, gl.STATIC_DRAW);

        const posLoc = gl.getAttribLocation(program, 'position');
        const uvLoc = gl.getAttribLocation(program, 'uv');

        gl.enableVertexAttribArray(posLoc);
        gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, 16, 0);

        gl.enableVertexAttribArray(uvLoc);
        gl.vertexAttribPointer(uvLoc, 2, gl.FLOAT, false, 16, 8);

        const getU = (name: string) => gl.getUniformLocation(program, name);
        uniformsRef.current = {
            uTextTexture: getU('uTextTexture'),
            uResolution: getU('uResolution'),
            uPointer: getU('uPointer'),
            uPointerActive: getU('uPointerActive'),
            uTime: getU('uTime'),
            uWarpStrength: getU('uWarpStrength'),
            uWarpScale: getU('uWarpScale'),
            uSpeed: getU('uSpeed'),
            uPointerInfluence: getU('uPointerInfluence'),
            uPointerStrength: getU('uPointerStrength'),
            uRefraction: getU('uRefraction'),
            uRipple: getU('uRipple'),
            uMotion: getU('uMotion')
        };

        const texture = gl.createTexture();
        if (texture) {
            gl.bindTexture(gl.TEXTURE_2D, texture);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
            textureRef.current = texture;
        }

        gl.uniform1f(uniformsRef.current.uWarpStrength, 0.08);
        gl.uniform1f(uniformsRef.current.uWarpScale, 1.7);
        gl.uniform1f(uniformsRef.current.uSpeed, 0.55);
        gl.uniform1f(uniformsRef.current.uPointerInfluence, 0.42);
        gl.uniform1f(uniformsRef.current.uPointerStrength, 0.38);
        gl.uniform1f(uniformsRef.current.uRefraction, 0.018);
        gl.uniform1f(uniformsRef.current.uRipple, 1.0);
        gl.uniform1f(uniformsRef.current.uMotion, 1.0);

        return true;
    };

    const renderOffscreenLogo = () => {
        const logoBase = logoBaseRef.current;
        const logoLens = logoLensRef.current;
        const canvas = offscreenCanvasRef.current;
        const ctx = offscreenCtxRef.current;
        const sCanvas = shineCanvasRef.current;
        const sCtx = shineCtxRef.current;

        if (!logoBase || !logoLens || !canvas || !ctx || !sCanvas || !sCtx) return;

        const w = canvas.width;
        const h = canvas.height;
        ctx.clearRect(0, 0, w, h);

        if (!logoBase.naturalWidth) return;

        const isMobile = window.innerWidth < 768;
        const isTablet = window.innerWidth >= 768 && window.innerWidth < 1024;
        const baseTargetScale = logoStateRef.current.currentScale * (isMobile ? 0.68 : (isTablet ? 0.82 : 0.95));
        
        const maxSafeWidthRatio = isMobile ? 0.85 : 0.88;
        const maxSafeHeightRatio = 0.82;
        const scale = Math.min(
            (w * baseTargetScale) / logoBase.naturalWidth, 
            (h * baseTargetScale) / logoBase.naturalHeight,
            (w * maxSafeWidthRatio) / logoBase.naturalWidth,
            (h * maxSafeHeightRatio) / logoBase.naturalHeight
        );
        
        const drawW = logoBase.naturalWidth * scale;
        const drawH = logoBase.naturalHeight * scale;

        const sideMargin = isMobile ? w * 0.05 : w * 0.035;
        const rawDrawX = (w * logoStateRef.current.currentX) - (drawW / 2);
        const rawDrawY = (h * logoStateRef.current.currentY) - (drawH / 2);
        const drawX = Math.max(sideMargin, Math.min(w - drawW - sideMargin, rawDrawX));
        const drawY = Math.max(12, Math.min(h - drawH - 12, rawDrawY));

        const scaleX = drawW / logoBase.naturalWidth;
        const scaleY = drawH / logoBase.naturalHeight;
        const currentLensCenterX = drawX + lensCenterRef.current.x * scaleX;
        const currentLensCenterY = drawY + lensCenterRef.current.y * scaleY;

        // Draw Base
        ctx.drawImage(logoBase, drawX, drawY, drawW, drawH);

        // Draw Rotating Lens
        const activeRotSpeed = isHoveredRef.current ? 0.012 : 0.0035;
        currentAngleRef.current += activeRotSpeed;
        ctx.save();
        ctx.translate(currentLensCenterX, currentLensCenterY);
        ctx.rotate(currentAngleRef.current);
        ctx.translate(-currentLensCenterX, -currentLensCenterY);
        ctx.drawImage(logoLens, drawX, drawY, drawW, drawH);
        ctx.restore();

        // Draw Dynamic Shine
        const shine = shineStateRef.current;
        if (isHoveredRef.current || shine.alpha > 0.01) {
            if (isHoveredRef.current) {
                shine.alpha = Math.min(1, shine.alpha + 0.12);
                shine.progress += (shine.speed * 1.5);
                if (shine.progress > 1.8) shine.progress = -0.5;
            } else {
                shine.alpha = Math.max(0, shine.alpha - 0.05);
                shine.progress += shine.speed;
            }

            if (shine.alpha > 0) {
                const shineWidth = drawW * 0.45;
                const currentX = drawX + shine.progress * (drawW + shineWidth) - shineWidth;

                const gradient = sCtx.createLinearGradient(
                    currentX, drawY, 
                    currentX + shineWidth, drawY + drawH
                );
                
                gradient.addColorStop(0, 'rgba(0, 0, 0, 0)');
                gradient.addColorStop(0.2, 'rgba(15, 30, 40, 0.75)');
                gradient.addColorStop(0.5, 'rgba(100, 223, 223, 0.95)');
                gradient.addColorStop(0.8, 'rgba(15, 30, 40, 0.75)');
                gradient.addColorStop(1, 'rgba(0, 0, 0, 0)');

                sCtx.clearRect(0, 0, w, h);
                sCtx.globalCompositeOperation = 'source-over';
                sCtx.fillStyle = gradient;
                sCtx.fillRect(drawX, drawY, drawW, drawH);

                sCtx.globalCompositeOperation = 'destination-in';
                sCtx.drawImage(logoBase, drawX, drawY, drawW, drawH);

                ctx.save();
                ctx.globalAlpha = shine.alpha * 0.85;
                ctx.globalCompositeOperation = 'source-over';
                ctx.drawImage(sCanvas, 0, 0);
                ctx.restore();
            }
        } else {
            shine.progress = -0.5;
        }
    };

    const renderLoop = (now: number) => {
        if (!timeStartRef.current) timeStartRef.current = now;
        const timeSec = (now - timeStartRef.current) * 0.001;

        // Smooth Pointer Interpolation
        const p = pointerRef.current;
        const idleX = 0.5 + Math.sin(timeSec * 0.33) * 0.12;
        const idleY = 0.5 + Math.cos(timeSec * 0.27) * 0.1;
        const targetX = p.activeTarget > 0 ? p.tx : idleX;
        const targetY = p.activeTarget > 0 ? p.ty : idleY;
        const damping = p.activeTarget > 0 ? 0.12 : 0.035;

        p.x += (targetX - p.x) * damping;
        p.y += (targetY - p.y) * damping;
        p.active += ((p.activeTarget > 0 ? 1.0 : 0.18) - p.active) * 0.06;

        const gl = glRef.current;
        const program = programRef.current;
        const uniforms = uniformsRef.current;
        const offCanvas = offscreenCanvasRef.current;

        if (gl && program && offCanvas && isLoadedRef.current) {
            renderOffscreenLogo();

            gl.useProgram(program);
            gl.activeTexture(gl.TEXTURE0);
            gl.bindTexture(gl.TEXTURE_2D, textureRef.current);
            gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
            gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, offCanvas);

            gl.uniform1i(uniforms.uTextTexture, 0);
            gl.uniform2f(uniforms.uPointer, p.x, p.y);
            gl.uniform1f(uniforms.uPointerActive, p.active);
            gl.uniform1f(uniforms.uTime, timeSec);

            gl.clearColor(0, 0, 0, 0);
            gl.clear(gl.COLOR_BUFFER_BIT);
            gl.drawArrays(gl.TRIANGLES, 0, 6);
        }

        rafIdRef.current = requestAnimationFrame(renderLoop);
    };

    const resizeAll = () => {
        const canvas = canvasRef.current;
        const gl = glRef.current;
        const program = programRef.current;
        
        if (!canvas || !gl || !program) return;

        const rect = canvas.getBoundingClientRect();
        const w = rect.width || window.innerWidth;
        const h = rect.height || window.innerHeight;
        const dpr = Math.min(window.devicePixelRatio || 1, 2);

        canvas.width = Math.floor(w * dpr);
        canvas.height = Math.floor(h * dpr);
        gl.viewport(0, 0, canvas.width, canvas.height);

        gl.useProgram(program);
        if (uniformsRef.current.uResolution) {
            gl.uniform2f(uniformsRef.current.uResolution, canvas.width, canvas.height);
        }

        if (offscreenCanvasRef.current) {
            offscreenCanvasRef.current.width = canvas.width;
            offscreenCanvasRef.current.height = canvas.height;
        }
        if (shineCanvasRef.current) {
            shineCanvasRef.current.width = canvas.width;
            shineCanvasRef.current.height = canvas.height;
        }
    };

    useEffect(() => {
        offscreenCanvasRef.current = document.createElement('canvas');
        offscreenCtxRef.current = offscreenCanvasRef.current.getContext('2d');
        shineCanvasRef.current = document.createElement('canvas');
        shineCtxRef.current = shineCanvasRef.current.getContext('2d');

        const logoBase = new Image();
        const logoLens = new Image();
        logoBase.crossOrigin = "Anonymous";
        logoLens.crossOrigin = "Anonymous";

        let loadedCount = 0;
        const checkReady = () => {
            loadedCount++;
            if (loadedCount === 2 && canvasRef.current) {
                lensCenterRef.current = calculateLensCenter(logoLens);
                if (initWebGL(canvasRef.current)) {
                    resizeAll();
                    isLoadedRef.current = true;
                    rafIdRef.current = requestAnimationFrame(renderLoop);
                }
            }
        };

        logoBase.onload = checkReady;
        logoLens.onload = checkReady;
        
        logoBase.src = "https://raw.githubusercontent.com/rajansphotography/spec/main/Speculo%20_26%20white.png";
        logoLens.src = "https://raw.githubusercontent.com/rajansphotography/spec/main/Speculo%20_26%20lens.png";

        logoBaseRef.current = logoBase;
        logoLensRef.current = logoLens;

        window.addEventListener('resize', resizeAll);

        return () => {
            window.removeEventListener('resize', resizeAll);
            if (rafIdRef.current) cancelAnimationFrame(rafIdRef.current);
            if (glRef.current && programRef.current) {
                glRef.current.deleteProgram(programRef.current);
            }
        };
    }, []);

    const handlePointerUpdate = (clientX: number, clientY: number) => {
        if (!canvasRef.current) return;
        const rect = canvasRef.current.getBoundingClientRect();
        if (rect.width <= 0 || rect.height <= 0) return;
        pointerRef.current.tx = (clientX - rect.left) / rect.width;
        // Invert Y for WebGL UV space
        pointerRef.current.ty = 1.0 - ((clientY - rect.top) / rect.height);
        pointerRef.current.activeTarget = 1;
    };

    const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
        isHoveredRef.current = true;
        handlePointerUpdate(e.clientX, e.clientY);
    };

    const handleMouseLeave = () => {
        isHoveredRef.current = false;
        pointerRef.current.activeTarget = 0;
    };

    const handleTouchStart = (e: React.TouchEvent<HTMLCanvasElement>) => {
        isHoveredRef.current = true;
        if (e.touches.length > 0) handlePointerUpdate(e.touches[0].clientX, e.touches[0].clientY);
    };

    const handleTouchMove = (e: React.TouchEvent<HTMLCanvasElement>) => {
        if (e.touches.length > 0) handlePointerUpdate(e.touches[0].clientX, e.touches[0].clientY);
    };

    const handleTouchEnd = () => {
        isHoveredRef.current = false;
        pointerRef.current.activeTarget = 0;
    };

    return (
        <div 
            ref={containerRef}
            className={`w-full h-full overflow-hidden relative m-0 p-0 select-none ${className}`}
        >
            <canvas 
                ref={canvasRef} 
                className="absolute inset-0 w-full h-full block z-10 cursor-pointer touch-none"
                onMouseMove={handleMouseMove}
                onMouseLeave={handleMouseLeave}
                onTouchStart={handleTouchStart}
                onTouchMove={handleTouchMove}
                onTouchEnd={handleTouchEnd}
            />
        </div>
    );
}
