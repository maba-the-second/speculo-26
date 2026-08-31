import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';

interface FaceFollowerProps {
  isActive: boolean;
  videoRef: React.RefObject<HTMLVideoElement | null>;
  isHalfPressed?: boolean;
  frameCount?: number;
  onTrackingStateChange?: (
    isTracking: boolean,
    confidence: number
  ) => void;
  mirrored?: boolean;
}

export type EngineState =
  | 'SEARCHING'
  | 'ACQUIRING'
  | 'TRACKING'
  | 'LOCKED'
  | 'LOST';

export interface FaceBox {
  x: number;
  y: number;
  w: number;
  h: number;
  xCenter: number;
  yCenter: number;
}

export interface SceneState {
  face: {
    detected: boolean;
    depth: number;
    box: FaceBox | null;
  };
  hands: {
    left: any;
    right: any;
  };
  gesture: 'NONE' | 'FRAME';
}

/* =========================================================
   MEDIAPIPE LAZY LOADER
========================================================= */

const mediaPipeLoaded = { current: false };
let mediaPipeLoadPromise: Promise<void> | null = null;

function loadMediaPipeScripts(): Promise<void> {
  if (mediaPipeLoaded.current) return Promise.resolve();
  if (mediaPipeLoadPromise) return mediaPipeLoadPromise;

  const scripts = [
    'https://cdn.jsdelivr.net/npm/@mediapipe/camera_utils/camera_utils.js',
    'https://cdn.jsdelivr.net/npm/@mediapipe/control_utils/control_utils.js',
    'https://cdn.jsdelivr.net/npm/@mediapipe/holistic/holistic.js',
  ];

  mediaPipeLoadPromise = scripts
    .reduce((chain, src) => {
      return chain.then(
        () =>
          new Promise<void>((resolve, reject) => {
            if (document.querySelector(`script[src="${src}"]`)) {
              resolve();
              return;
            }
            const script = document.createElement('script');
            script.src = src;
            script.crossOrigin = 'anonymous';
            script.onload = () => resolve();
            script.onerror = () => reject(new Error(`Failed to load ${src}`));
            document.head.appendChild(script);
          })
      );
    }, Promise.resolve())
    .then(() => {
      mediaPipeLoaded.current = true;
    })
    .catch((err) => {
      console.error('[FaceFollower] MediaPipe load error:', err);
      mediaPipeLoadPromise = null;
      throw err;
    });

  return mediaPipeLoadPromise;
}

/* =========================================================
   1. EVENT BUS
========================================================= */

class EventBus {
  private listeners: Record<
    string,
    Array<(data: any) => void>
  > = {};

  on(
    event: string,
    callback: (data: any) => void
  ) {
    if (!this.listeners[event]) {
      this.listeners[event] = [];
    }

    this.listeners[event].push(callback);
  }

  off(
    event: string,
    callback: (data: any) => void
  ) {
    if (!this.listeners[event]) return;

    this.listeners[event] =
      this.listeners[event].filter(
        (cb) => cb !== callback
      );
  }

  emit(
    event: string,
    data?: any
  ) {
    if (this.listeners[event]) {
      this.listeners[event].forEach(
        (cb) => cb(data)
      );
    }
  }

  clear() {
    this.listeners = {};
  }
}

/* =========================================================
   2. TARGET ENGINE
========================================================= */

class TargetEngine {
  state: EngineState = 'SEARCHING';

  framesVisible = 0;
  framesLost = 0;

  lastPos: FaceBox | null = null;

  velocity = {
    x: 0,
    y: 0,
  };

  readonly LOCKED_THRESHOLD = 15;
  readonly LOST_THRESHOLD = 20;

  constructor(
    private bus: EventBus
  ) {}

  update(
    faceBox: FaceBox | null
  ) {
    if (faceBox) {
      this.framesLost = 0;
      this.framesVisible++;

      if (this.lastPos) {
        this.velocity.x =
          faceBox.xCenter -
          this.lastPos.xCenter;

        this.velocity.y =
          faceBox.yCenter -
          this.lastPos.yCenter;
      }

      this.lastPos = {
        ...faceBox,
      };

      const speed = Math.hypot(
        this.velocity.x,
        this.velocity.y
      );

      /*
       * SEARCHING -> ACQUIRING
       */
      if (
        this.state === 'SEARCHING' ||
        this.state === 'LOST'
      ) {
        this.transition(
          'ACQUIRING'
        );
      }

      /*
       * ACQUIRING -> LOCKED
       */
      else if (
        this.state === 'ACQUIRING' &&
        this.framesVisible >
          this.LOCKED_THRESHOLD
      ) {
        this.transition(
          'LOCKED'
        );
      }

      /*
       * LOCKED -> TRACKING
       */
      else if (
        this.state === 'LOCKED' &&
        speed > 0.05
      ) {
        this.transition(
          'TRACKING'
        );
      }

      /*
       * TRACKING -> LOCKED
       */
      else if (
        this.state === 'TRACKING' &&
        speed < 0.02
      ) {
        this.transition(
          'LOCKED'
        );
      }

      this.bus.emit(
        'targetUpdate',
        {
          box: faceBox,
          velocity: this.velocity,
          state: this.state,
        }
      );
    } else {
      this.framesVisible = 0;
      this.framesLost++;

      /*
       * Lose target
       */
      if (
        (
          this.state === 'LOCKED' ||
          this.state === 'TRACKING' ||
          this.state === 'ACQUIRING'
        ) &&
        this.framesLost > 5
      ) {
        this.transition(
          'LOST'
        );
      }

      /*
       * Completely restart search
       */
      else if (
        this.state === 'LOST' &&
        this.framesLost >
          this.LOST_THRESHOLD
      ) {
        this.transition(
          'SEARCHING'
        );
      }
    }
  }

  transition(
    newState: EngineState
  ) {
    if (
      this.state !== newState
    ) {
      this.state = newState;

      this.bus.emit(
        'stateChange',
        this.state
      );
    }
  }

  reset() {
    this.state =
      'SEARCHING';

    this.framesVisible = 0;
    this.framesLost = 0;

    this.lastPos = null;

    this.velocity = {
      x: 0,
      y: 0,
    };
  }
}

/* =========================================================
   3. SPATIAL ENGINE
========================================================= */

class SpatialEngine {
  sceneState: SceneState = {
    face: {
      detected: false,
      depth: 0,
      box: null,
    },

    hands: {
      left: null,
      right: null,
    },

    gesture: 'NONE',
  };

  constructor(
    private bus: EventBus
  ) {}

  processHolistic(
    results: any
  ) {
    /*
     * -----------------------------------------------------
     * FACE
     * -----------------------------------------------------
     */

    if (
      results?.faceLandmarks &&
      results.faceLandmarks.length > 0
    ) {
      const lms =
        results.faceLandmarks;

      let minX = 1;
      let minY = 1;
      let maxX = 0;
      let maxY = 0;

      for (
        let i = 0;
        i < lms.length;
        i++
      ) {
        const lm = lms[i];

        if (lm.x < minX)
          minX = lm.x;

        if (lm.x > maxX)
          maxX = lm.x;

        if (lm.y < minY)
          minY = lm.y;

        if (lm.y > maxY)
          maxY = lm.y;
      }

      const w =
        maxX - minX;

      const h =
        maxY - minY;

      /*
       * Larger face width means
       * the face is closer.
       */
      const depthEstimate =
        1 / (w + 0.01);

      this.sceneState.face = {
        detected: true,

        depth:
          depthEstimate,

        box: {
          x:
            minX -
            w * 0.2,

          y:
            minY -
            h * 0.2,

          w:
            w * 1.4,

          h:
            h * 1.4,

          xCenter:
            minX +
            w / 2,

          yCenter:
            minY +
            h / 2,
        },
      };
    } else {
      this.sceneState.face.detected =
        false;

      this.sceneState.face.box =
        null;

      this.sceneState.face.depth =
        0;
    }

    /*
     * -----------------------------------------------------
     * HANDS
     * -----------------------------------------------------
     */

    this.sceneState.hands.left =
      results?.leftHandLandmarks ||
      null;

    this.sceneState.hands.right =
      results?.rightHandLandmarks ||
      null;

    this.sceneState.gesture =
      this.detectGestures(
        this.sceneState.hands.left,
        this.sceneState.hands.right
      );

    /*
     * Send processed state
     */
    this.bus.emit(
      'sceneUpdate',
      this.sceneState
    );
  }

  isFingerFolded(
    landmarks: any[],
    tipIdx: number,
    pipIdx: number
  ) {
    if (
      !landmarks ||
      !landmarks[0] ||
      !landmarks[tipIdx] ||
      !landmarks[pipIdx]
    ) {
      return false;
    }

    const wrist =
      landmarks[0];

    const distTip =
      Math.hypot(
        landmarks[tipIdx].x -
          wrist.x,

        landmarks[tipIdx].y -
          wrist.y
      );

    const distPip =
      Math.hypot(
        landmarks[pipIdx].x -
          wrist.x,

        landmarks[pipIdx].y -
          wrist.y
      );

    return (
      distTip <
      distPip
    );
  }

  detectGestures(
    left: any,
    right: any
  ): 'NONE' | 'FRAME' {
    if (!left || !right) {
      return 'NONE';
    }

    let framingHands = 0;

    [left, right].forEach(
      (hand) => {
        const indexExtended =
          !this.isFingerFolded(
            hand,
            8,
            6
          );

        const middleFolded =
          this.isFingerFolded(
            hand,
            12,
            10
          );

        const ringFolded =
          this.isFingerFolded(
            hand,
            16,
            14
          );

        const pinkyFolded =
          this.isFingerFolded(
            hand,
            20,
            18
          );

        if (
          indexExtended &&
          middleFolded &&
          ringFolded &&
          pinkyFolded
        ) {
          framingHands++;
        }
      }
    );

    if (
      framingHands === 2
    ) {
      return 'FRAME';
    }

    return 'NONE';
  }
}

/* =========================================================
   4. RENDER STATE
========================================================= */

interface RenderState {
  x: number;
  y: number;
  w: number;
  h: number;
  opacity: number;
  bracketSize: number;
  thickness: number;
}

/* =========================================================
   5. HUD RENDERER
========================================================= */

class HUDRenderer {
  private ctx: CanvasRenderingContext2D;

  w = 0;
  h = 0;

  renderState: RenderState = {
    x: 0,
    y: 0,
    w: 0,
    h: 0,
    opacity: 0,
    bracketSize: 50,
    thickness: 2,
  };

  trail: Array<{
    x: number;
    y: number;
  }> = [];

  currentState: EngineState =
    'SEARCHING';

  private scene: THREE.Scene;

  private camera: THREE.PerspectiveCamera;

  private renderer:
    | THREE.WebGLRenderer
    | null = null;

  private cameraModel:
    THREE.Group;

  private disposed = false;

  constructor(
    private canvas2D: HTMLCanvasElement,
    private canvas3D: HTMLCanvasElement
  ) {
    const ctx =
      canvas2D.getContext(
        '2d'
      );

    if (!ctx) {
      throw new Error(
        '2D context unavailable'
      );
    }

    this.ctx = ctx;

    /*
     * THREE.JS SCENE
     */

    this.scene =
      new THREE.Scene();

    this.camera =
      new THREE.PerspectiveCamera(
        75,
        1,
        0.1,
        1000
      );

    this.camera.position.z =
      5;

    /*
     * WebGL renderer
     */

    try {
      this.renderer =
        new THREE.WebGLRenderer(
          {
            canvas:
              this.canvas3D,

            alpha: true,

            antialias: true,
          }
        );
    } catch (error) {
      console.warn(
        '[FaceFollower] WebGL unavailable:',
        error
      );

      this.renderer = null;
    }

    /*
     * Camera model
     */

    this.cameraModel =
      new THREE.Group();

    this.buildCameraModel();
  }

  resize(
    width: number,
    height: number
  ) {
    this.w = width;
    this.h = height;

    this.canvas2D.width =
      width;

    this.canvas2D.height =
      height;

    this.camera.aspect =
      width /
      (height || 1);

    this.camera.updateProjectionMatrix();

    this.renderer?.setSize(
      width,
      height,
      false
    );
  }

  buildCameraModel() {
    /*
     * CAMERA BODY
     */

    const body =
      new THREE.Mesh(
        new THREE.BoxGeometry(
          2.4,
          1.5,
          1
        ),

        new THREE.MeshStandardMaterial(
          {
            color: 0x111111,
            roughness: 0.9,
          }
        )
      );

    /*
     * CAMERA LENS
     */

    const lens =
      new THREE.Mesh(
        new THREE.CylinderGeometry(
          0.6,
          0.6,
          0.8,
          32
        ),

        new THREE.MeshStandardMaterial(
          {
            color: 0x00ffff,
            roughness: 0.2,
            metalness: 0.8,
          }
        )
      );

    lens.rotation.x =
      Math.PI / 2;

    lens.position.z =
      0.6;

    this.cameraModel.add(
      body
    );

    this.cameraModel.add(
      lens
    );

    /*
     * LIGHTING
     */

    const light =
      new THREE.PointLight(
        0x00ffff,
        1,
        10
      );

    light.position.set(
      0,
      0,
      2
    );

    this.scene.add(
      light
    );

    const ambient =
      new THREE.AmbientLight(
        0xffffff,
        0.3
      );

    this.scene.add(
      ambient
    );

    /*
     * Hidden until FRAME gesture
     */

    this.cameraModel.visible =
      false;

    this.scene.add(
      this.cameraModel
    );
  }

  setState(
    state: EngineState
  ) {
    this.currentState =
      state;
  }

  renderOptics(
    targetData:
      | {
          box: FaceBox;
          velocity: any;
          state: EngineState;
        }
      | null,

    sceneData: SceneState
  ) {
    if (
      this.disposed ||
      this.w === 0 ||
      this.h === 0
    ) {
      return;
    }

    this.ctx.clearRect(
      0,
      0,
      this.w,
      this.h
    );

    /*
     * -----------------------------------------------------
     * MOTION TRAIL
     * -----------------------------------------------------
     */

    if (
      targetData &&
      targetData.box &&
      (
        this.currentState ===
          'TRACKING' ||
        this.currentState ===
          'LOCKED'
      )
    ) {
      this.trail.push({
        x:
          targetData.box.xCenter,

        y:
          targetData.box.yCenter,
      });

      if (
        this.trail.length >
        5
      ) {
        this.trail.shift();
      }
    } else if (
      this.trail.length >
      0
    ) {
      this.trail.shift();
    }

    /*
     * -----------------------------------------------------
     * FACE HUD
     * -----------------------------------------------------
     */

    if (
      targetData &&
      targetData.box
    ) {
      const box =
        targetData.box;

      const pxBox = {
        x:
          box.x * this.w,

        y:
          box.y * this.h,

        w:
          box.w * this.w,

        h:
          box.h * this.h,
      };

      /*
       * Smoothing
       */

      const lerpFactor =
        this.currentState ===
        'LOCKED'
          ? 0.4
          : 0.1;

      if (
        this.renderState.w ===
        0
      ) {
        this.renderState = {
          ...pxBox,

          opacity: 0,

          bracketSize: 50,

          thickness: 2,
        };
      }

      this.renderState.x +=
        (
          pxBox.x -
          this.renderState.x
        ) *
        lerpFactor;

      this.renderState.y +=
        (
          pxBox.y -
          this.renderState.y
        ) *
        lerpFactor;

      this.renderState.w +=
        (
          pxBox.w -
          this.renderState.w
        ) *
        lerpFactor;

      this.renderState.h +=
        (
          pxBox.h -
          this.renderState.h
        ) *
        lerpFactor;

      /*
       * Depth / bracket sizing
       */

      const depth =
        sceneData.face.depth ||
        1;

      const targetBracketSize =
        Math.max(
          20,
          Math.min(
            100,
            100 / depth
          )
        );

      this.renderState.bracketSize +=
        (
          targetBracketSize -
          this.renderState.bracketSize
        ) *
        0.1;

      /*
       * ACQUIRING
       */

      if (
        this.currentState ===
        'ACQUIRING'
      ) {
        this.renderState.opacity +=
          (
            0.5 -
            this.renderState.opacity
          ) *
          0.1;

        this.renderState.thickness =
          1;

        this.drawBrackets(
          this.renderState,
          '#00ffff'
        );
      }

      /*
       * LOCKED
       */

      else if (
        this.currentState ===
        'LOCKED'
      ) {
        this.renderState.opacity +=
          (
            1 -
            this.renderState.opacity
          ) *
          0.2;

        this.renderState.thickness =
          3;

        this.drawBrackets(
          this.renderState,
          '#00ffff'
        );

        this.drawCrosshair(
          this.renderState
        );
      }

      /*
       * TRACKING
       */

      else if (
        this.currentState ===
        'TRACKING'
      ) {
        this.renderState.opacity +=
          (
            0.8 -
            this.renderState.opacity
          ) *
          0.1;

        this.renderState.thickness =
          2;

        const shakeX =
          (
            Math.random() -
            0.5
          ) *
          4;

        const shakeY =
          (
            Math.random() -
            0.5
          ) *
          4;

        this.drawBrackets(
          {
            ...this.renderState,

            x:
              this.renderState.x +
              shakeX,

            y:
              this.renderState.y +
              shakeY,
          },

          '#00ffff'
        );

        this.drawMotionTrail();
      }
    }

    /*
     * -----------------------------------------------------
     * LOST
     * -----------------------------------------------------
     */

    else if (
      this.currentState ===
      'LOST'
    ) {
      this.renderState.x -=
        2;

      this.renderState.y -=
        2;

      this.renderState.w +=
        4;

      this.renderState.h +=
        4;

      this.renderState.opacity *=
        0.8;

      if (
        this.renderState.opacity >
        0.05
      ) {
        this.drawBrackets(
          this.renderState,
          '#ff0000'
        );
      }
    }

    /*
     * -----------------------------------------------------
     * RESET
     * -----------------------------------------------------
     */

    else {
      this.renderState.w =
        0;

      this.renderState.h =
        0;
    }

    /*
     * -----------------------------------------------------
     * THREE.JS
     * -----------------------------------------------------
     */

    this.render3DCamera(
      sceneData
    );
  }

  drawBrackets(
    rs: RenderState,
    color: string
  ) {
    const {
      x,
      y,
      w,
      h,
      bracketSize,
      thickness,
      opacity,
    } = rs;

    if (
      w <= 0 ||
      h <= 0 ||
      opacity <= 0.01
    ) {
      return;
    }

    const ctx =
      this.ctx;

    ctx.strokeStyle =
      color;

    ctx.lineWidth =
      thickness;

    ctx.globalAlpha =
      opacity;

    ctx.beginPath();

    /*
     * TOP LEFT
     */

    ctx.moveTo(
      x,
      y + bracketSize
    );

    ctx.lineTo(
      x,
      y
    );

    ctx.lineTo(
      x + bracketSize,
      y
    );

    /*
     * TOP RIGHT
     */

    ctx.moveTo(
      x + w - bracketSize,
      y
    );

    ctx.lineTo(
      x + w,
      y
    );

    ctx.lineTo(
      x + w,
      y + bracketSize
    );

    /*
     * BOTTOM LEFT
     */

    ctx.moveTo(
      x,
      y + h - bracketSize
    );

    ctx.lineTo(
      x,
      y + h
    );

    ctx.lineTo(
      x + bracketSize,
      y + h
    );

    /*
     * BOTTOM RIGHT
     */

    ctx.moveTo(
      x + w,
      y + h - bracketSize
    );

    ctx.lineTo(
      x + w,
      y + h
    );

    ctx.lineTo(
      x + w - bracketSize,
      y + h
    );

    ctx.stroke();

    ctx.globalAlpha =
      1;
  }

  drawCrosshair(
    rs: RenderState
  ) {
    const ctx =
      this.ctx;

    const cx =
      rs.x +
      rs.w / 2;

    const cy =
      rs.y +
      rs.h / 2;

    ctx.globalAlpha =
      0.5;

    ctx.strokeStyle =
      '#00ffff';

    ctx.lineWidth =
      1;

    ctx.beginPath();

    ctx.moveTo(
      cx - 10,
      cy
    );

    ctx.lineTo(
      cx + 10,
      cy
    );

    ctx.moveTo(
      cx,
      cy - 10
    );

    ctx.lineTo(
      cx,
      cy + 10
    );

    ctx.stroke();

    ctx.globalAlpha =
      1;
  }

  drawMotionTrail() {
    if (
      this.trail.length <
      2
    ) {
      return;
    }

    const ctx =
      this.ctx;

    ctx.beginPath();

    ctx.moveTo(
      this.trail[0].x *
        this.w,

      this.trail[0].y *
        this.h
    );

    for (
      let i = 1;
      i < this.trail.length;
      i++
    ) {
      ctx.lineTo(
        this.trail[i].x *
          this.w,

        this.trail[i].y *
          this.h
      );
    }

    ctx.strokeStyle =
      'rgba(0, 255, 255, 0.2)';

    ctx.lineWidth =
      4;

    ctx.stroke();
  }

  render3DCamera(
    sceneData: SceneState
  ) {
    if (!this.renderer) {
      return;
    }

    if (
      sceneData.gesture ===
        'FRAME' &&
      sceneData.hands.left &&
      sceneData.hands.right
    ) {
      const left =
        sceneData.hands.left[0];

      const right =
        sceneData.hands.right[0];

      if (!left || !right) {
        this.cameraModel.visible =
          false;

        this.renderer.render(
          this.scene,
          this.camera
        );

        return;
      }

      this.cameraModel.visible =
        true;

      const midX =
        (left.x + right.x) /
        2;

      const midY =
        (left.y + right.y) /
        2;

      const targetX =
        -(
          (midX - 0.5) *
          12
        );

      const targetY =
        -(
          (midY - 0.5) *
          8
        );

      this.cameraModel.position.x +=
        (
          targetX -
          this.cameraModel.position.x
        ) *
        0.15;

      this.cameraModel.position.y +=
        (
          targetY -
          this.cameraModel.position.y
        ) *
        0.15;

      this.cameraModel.rotation.y =
        Math.sin(
          Date.now() *
            0.002
        ) *
        0.3;
    } else {
      this.cameraModel.visible =
        false;
    }

    this.renderer.render(
      this.scene,
      this.camera
    );
  }

  dispose() {
    this.disposed = true;

    this.renderer?.dispose();

    /*
     * Dispose Three.js resources.
     */

    this.scene.traverse(
      (object) => {
        const mesh =
          object as THREE.Mesh;

        if (
          mesh.geometry
        ) {
          mesh.geometry.dispose();
        }

        if (
          Array.isArray(
            mesh.material
          )
        ) {
          mesh.material.forEach(
            (material) =>
              material.dispose()
          );
        } else if (
          mesh.material
        ) {
          mesh.material.dispose();
        }
      }
    );
  }
}

/* =========================================================
   6. FACE FOLLOWER COMPONENT
========================================================= */

export function FaceFollower({
  isActive,
  videoRef,
  isHalfPressed = false,
  frameCount = 0,
  onTrackingStateChange,
  mirrored = true,
}: FaceFollowerProps) {
  const containerRef =
    useRef<HTMLDivElement | null>(
      null
    );

  const canvas2DRef =
    useRef<HTMLCanvasElement | null>(
      null
    );

  const canvas3DRef =
    useRef<HTMLCanvasElement | null>(
      null
    );

  const [
    engineState,
    setEngineState,
  ] =
    useState<EngineState>(
      'SEARCHING'
    );

  /*
   * Keep callback in ref so changing
   * the parent callback does not restart
   * MediaPipe.
   */

  const trackingCallbackRef =
    useRef(
      onTrackingStateChange
    );

  useEffect(() => {
    trackingCallbackRef.current =
      onTrackingStateChange;
  }, [
    onTrackingStateChange,
  ]);

  /*
   * -------------------------------------------------------
   * MAIN ENGINE EFFECT
   * -------------------------------------------------------
   */

  useEffect(() => {
    if (!isActive) {
      setEngineState(
        'SEARCHING'
      );

      trackingCallbackRef.current?.(
        false,
        0
      );

      return;
    }

    const container =
      containerRef.current;

    const canvas2D =
      canvas2DRef.current;

    const canvas3D =
      canvas3DRef.current;

    if (
      !container ||
      !canvas2D ||
      !canvas3D
    ) {
      return;
    }

    let isSubscribed =
      true;

    let hudRenderer:
      | HUDRenderer
      | null = null;

    let animFrameId = 0;

    let fallbackRafId = 0;

    let cameraInstance:
      | any = null;

    let holisticInstance:
      | any = null;

    let nativeDetector:
      | any = null;

    let resizeObserver:
      | ResizeObserver | null =
      null;

    /*
     * -----------------------------------------------------
     * ENGINE INSTANCES
     * -----------------------------------------------------
     */

    const bus =
      new EventBus();

    const targetEng =
      new TargetEngine(
        bus
      );

    const spatialEng =
      new SpatialEngine(
        bus
      );

    let lastTargetData:
      | {
          box: FaceBox;
          velocity: any;
          state: EngineState;
        }
      | null = null;

    let lastSceneData:
      SceneState = {
        face: {
          detected: false,
          depth: 0,
          box: null,
        },

        hands: {
          left: null,
          right: null,
        },

        gesture: 'NONE',
      };

    /*
     * -----------------------------------------------------
     * HUD
     * -----------------------------------------------------
     */

    try {
      hudRenderer =
        new HUDRenderer(
          canvas2D,
          canvas3D
        );
    } catch (error) {
      console.warn(
        '[FaceFollower] HUDRenderer initialization error:',
        error
      );
    }

    /*
     * -----------------------------------------------------
     * EVENT BUS
     * -----------------------------------------------------
     */

    bus.on(
      'sceneUpdate',
      (
        sceneData: SceneState
      ) => {
        if (!isSubscribed) {
          return;
        }

        lastSceneData =
          sceneData;

        targetEng.update(
          sceneData.face.box
        );
      }
    );

    bus.on(
      'targetUpdate',
      (
        targetData: {
          box: FaceBox;
          velocity: any;
          state: EngineState;
        }
      ) => {
        if (!isSubscribed) {
          return;
        }

        lastTargetData =
          targetData;
      }
    );

    bus.on(
      'stateChange',
      (
        newState: EngineState
      ) => {
        if (!isSubscribed) {
          return;
        }

        setEngineState(
          newState
        );

        hudRenderer?.setState(
          newState
        );

        const isTracking =
          newState ===
            'LOCKED' ||
          newState ===
            'TRACKING';

        const confidence =
          newState ===
          'LOCKED'
            ? 98
            : newState ===
                'TRACKING'
              ? 88
              : newState ===
                  'ACQUIRING'
                ? 65
                : 0;

        trackingCallbackRef.current?.(
          isTracking,
          confidence
        );
      }
    );

    /*
     * -----------------------------------------------------
     * RESIZE
     * -----------------------------------------------------
     */

    const updateSize =
      () => {
        if (
          !container ||
          !hudRenderer
        ) {
          return;
        }

        const rect =
          container.getBoundingClientRect();

        const width =
          Math.max(
            1,
            Math.round(
              rect.width
            )
          );

        const height =
          Math.max(
            1,
            Math.round(
              rect.height
            )
          );

        hudRenderer.resize(
          width,
          height
        );
      };

    resizeObserver =
      new ResizeObserver(
        updateSize
      );

    resizeObserver.observe(
      container
    );

    updateSize();

    /*
     * -----------------------------------------------------
     * MASTER RENDER LOOP
     * -----------------------------------------------------
     */

    const renderLoop =
      () => {
        if (
          !isSubscribed
        ) {
          return;
        }

        hudRenderer?.renderOptics(
          lastTargetData,
          lastSceneData
        );

        animFrameId =
          requestAnimationFrame(
            renderLoop
          );
      };

    animFrameId =
      requestAnimationFrame(
        renderLoop
      );

    /*
     * -----------------------------------------------------
     * FALLBACK CV CANVAS
     * -----------------------------------------------------
     */

    const cvCanvas =
      document.createElement(
        'canvas'
      );

    cvCanvas.width =
      160;

    cvCanvas.height =
      120;

    const cvCtx =
      cvCanvas.getContext(
        '2d',
        {
          willReadFrequently:
            true,
        }
      );

    /*
     * -----------------------------------------------------
     * NATIVE FACE DETECTOR
     * -----------------------------------------------------
     */

    if (
      typeof window !==
        'undefined' &&
      'FaceDetector' in window
    ) {
      try {
        nativeDetector =
          new (
            window as any
          ).FaceDetector({
            fastMode: true,
            maxDetectedFaces: 1,
          });
      } catch {
        nativeDetector =
          null;
      }
    }

    let lastCvTime = 0;

    /*
     * -----------------------------------------------------
     * FALLBACK FACE DETECTION
     * -----------------------------------------------------
     */

    const runFallbackFrame =
      async (
        video: HTMLVideoElement
      ) => {
        if (
          video.readyState <
            2 ||
          video.videoWidth ===
            0
        ) {
          return;
        }

        /*
         * Native FaceDetector
         */

        if (nativeDetector) {
          try {
            const faces =
              await nativeDetector.detect(
                video
              );

            if (
              faces &&
              faces.length >
                0
            ) {
              const face =
                faces[0];

              const box =
                face.boundingBox;

              const vw =
                video.videoWidth;

              const vh =
                video.videoHeight;

              const minX =
                box.x / vw;

              const minY =
                box.y / vh;

              const width =
                box.width / vw;

              const height =
                box.height / vh;

              spatialEng.processHolistic(
                {
                  faceLandmarks:
                    [
                      {
                        x: minX,
                        y: minY,
                      },

                      {
                        x:
                          minX +
                          width,

                        y:
                          minY +
                          height,
                      },
                    ],
                }
              );

              return;
            }
          } catch {
            /*
             * Continue to
             * skin detection.
             */
          }
        }

        /*
         * Skin clustering fallback
         */

        if (cvCtx) {
          try {
            cvCtx.drawImage(
              video,
              0,
              0,
              160,
              120
            );

            const image =
              cvCtx.getImageData(
                0,
                0,
                160,
                120
              );

            const data =
              image.data;

            let count = 0;

            let minX = 160;
            let maxX = 0;

            let minY = 120;
            let maxY = 0;

            for (
              let y = 8;
              y < 105;
              y += 2
            ) {
              for (
                let x = 16;
                x < 144;
                x += 2
              ) {
                const idx =
                  (
                    y *
                      160 +
                    x
                  ) *
                  4;

                const r =
                  data[idx];

                const g =
                  data[
                    idx + 1
                  ];

                const b =
                  data[
                    idx + 2
                  ];

                const sum =
                  r + g + b;

                if (
                  sum < 60 ||
                  sum > 700
                ) {
                  continue;
                }

                const rn =
                  r / sum;

                const gn =
                  g / sum;

                const cb =
                  128 -
                  0.168736 *
                    r -
                  0.331264 *
                    g +
                  0.5 * b;

                const cr =
                  128 +
                  0.5 * r -
                  0.418688 *
                    g -
                  0.081312 *
                    b;

                if (
                  rn > 0.35 &&
                  rn < 0.58 &&
                  gn > 0.27 &&
                  gn < 0.39 &&
                  cb >= 75 &&
                  cb <= 130 &&
                  cr >= 130 &&
                  cr <= 175 &&
                  r > g &&
                  g > b
                ) {
                  count++;

                  if (
                    x < minX
                  ) {
                    minX = x;
                  }

                  if (
                    x > maxX
                  ) {
                    maxX = x;
                  }

                  if (
                    y < minY
                  ) {
                    minY = y;
                  }

                  if (
                    y > maxY
                  ) {
                    maxY = y;
                  }
                }
              }
            }

            if (
              count > 40
            ) {
              const bboxW =
                (
                  maxX -
                  minX
                ) /
                160;

              const bboxH =
                (
                  maxY -
                  minY
                ) /
                120;

              const normX =
                minX / 160;

              const normY =
                minY / 120;

              spatialEng.processHolistic(
                {
                  faceLandmarks:
                    [
                      {
                        x: normX,
                        y: normY,
                      },

                      {
                        x:
                          normX +
                          bboxW,

                        y:
                          normY +
                          bboxH,
                      },
                    ],
                }
              );

              return;
            }
          } catch {
            /*
             * Continue to no-face state.
             */
          }
        }

        /*
         * No face detected
         */

        spatialEng.processHolistic(
          {}
        );
      };

    /*
     * -----------------------------------------------------
     * MEDIAPIPE INITIALISATION
     * -----------------------------------------------------
     */

    const initPipeline =
      async () => {
        const videoElement =
          videoRef.current;

        if (
          !videoElement
        ) {
          return;
        }

        try {
          await loadMediaPipeScripts();
        } catch (err) {
          console.warn('[FaceFollower] Failed to load MediaPipe:', err);
        }

        const HolisticClass =
          (window as any)
            .Holistic;

        const CameraClass =
          (window as any)
            .Camera;

        /*
         * ---------------------------------------------------
         * MEDIAPIPE HOLISTIC
         * ---------------------------------------------------
         */

        if (
          HolisticClass &&
          CameraClass
        ) {
          try {
            holisticInstance =
              new HolisticClass(
                {
                  locateFile:
                    (
                      file: string
                    ) =>
                      `https://cdn.jsdelivr.net/npm/@mediapipe/holistic/${file}`,
                }
              );

            holisticInstance.setOptions(
              {
                modelComplexity: 1,

                smoothLandmarks:
                  true,

                minDetectionConfidence:
                  0.5,

                minTrackingConfidence:
                  0.5,
              }
            );

            holisticInstance.onResults(
              (
                results: any
              ) => {
                if (
                  !isSubscribed
                ) {
                  return;
                }

                spatialEng.processHolistic(
                  results
                );
              }
            );

            /*
             * Prevent multiple
             * simultaneous frames.
             */

            let processingFrame =
              false;

            /*
             * THIS IS THE CORRECT
             * CAMERA INITIALISATION.
             *
             * width/height belong
             * INSIDE this object.
             */

            cameraInstance =
              new CameraClass(
                videoElement,
                {
                  onFrame:
                    async () => {
                      if (
                        !isSubscribed ||
                        processingFrame ||
                        !holisticInstance
                      ) {
                        return;
                      }

                      processingFrame =
                        true;

                      try {
                        await holisticInstance.send(
                          {
                            image:
                              videoElement,
                          }
                        );
                      } catch (
                        error
                      ) {
                        /*
                         * Ignore transient
                         * MediaPipe frame errors.
                         */
                      } finally {
                        processingFrame =
                          false;
                      }
                    },

                  width: 1280,

                  height: 720,
                }
              );

            /*
             * Start camera ONCE.
             */

            await cameraInstance.start();

            return;
          } catch (
            error
          ) {
            console.warn(
              '[FaceFollower] MediaPipe initialization failed. Using fallback detector.',
              error
            );

            /*
             * Make sure partially
             * initialized MediaPipe
             * is closed.
             */

            try {
              cameraInstance?.stop?.();
            } catch {}

            try {
              holisticInstance?.close?.();
            } catch {}

            cameraInstance =
              null;

            holisticInstance =
              null;
          }
        }

        /*
         * ---------------------------------------------------
         * FALLBACK LOOP
         * ---------------------------------------------------
         */

        const fallbackLoop =
          (time: number) => {
            if (
              !isSubscribed
            ) {
              return;
            }

            if (
              time -
                lastCvTime >
                60
            ) {
              lastCvTime =
                time;

              const video =
                videoRef.current;

              if (video) {
                void runFallbackFrame(
                  video
                );
              }
            }

            fallbackRafId =
              requestAnimationFrame(
                fallbackLoop
              );
          };

        fallbackRafId =
          requestAnimationFrame(
            fallbackLoop
          );
      };

    /*
     * Start pipeline
     */

    void initPipeline();

    /*
     * -----------------------------------------------------
     * CLEANUP
     * -----------------------------------------------------
     */

    return () => {
      isSubscribed =
        false;

      cancelAnimationFrame(
        animFrameId
      );

      cancelAnimationFrame(
        fallbackRafId
      );

      resizeObserver?.disconnect();

      bus.clear();

      targetEng.reset();

      hudRenderer?.dispose();

      try {
        cameraInstance?.stop?.();
      } catch {}

      try {
        holisticInstance?.close?.();
      } catch {}

      cameraInstance =
        null;

      holisticInstance =
        null;

      nativeDetector =
        null;
    };
  }, [
    isActive,
    videoRef,
  ]);

  /*
   * =======================================================
   * INACTIVE CAMERA
   * =======================================================
   */

  if (!isActive) {
    const defaultW =
      isHalfPressed
        ? '120px'
        : '140px';

    const defaultH =
      isHalfPressed
        ? '80px'
        : '90px';

    return (
      <div
        className={`
          absolute
          top-1/2
          left-1/2
          -translate-x-1/2
          -translate-y-1/2
          focus-bracket
          pointer-events-none
          z-30
          transition-all
          duration-200
          ${isHalfPressed ? 'hunting' : ''}
          ${
            isHalfPressed &&
            frameCount % 2 === 0
              ? 'locked'
              : ''
          }
        `}
        style={{
          width: defaultW,
          height: defaultH,
          color: '#00ffff',
        }}
      >
        {/* TOP LEFT */}

        <div
          className="
            absolute
            top-[-1px]
            left-[-1px]
            w-[12px]
            h-[12px]
            border-t-2
            border-l-2
            border-current
          "
        />

        {/* TOP RIGHT */}

        <div
          className="
            absolute
            top-[-1px]
            right-[-1px]
            w-[12px]
            h-[12px]
            border-t-2
            border-r-2
            border-current
          "
        />

        {/* BOTTOM LEFT */}

        <div
          className="
            absolute
            bottom-[-1px]
            left-[-1px]
            w-[12px]
            h-[12px]
            border-b-2
            border-l-2
            border-current
          "
        />

        {/* BOTTOM RIGHT */}

        <div
          className="
            absolute
            bottom-[-1px]
            right-[-1px]
            w-[12px]
            h-[12px]
            border-b-2
            border-r-2
            border-current
          "
        />
      </div>
    );
  }

  /*
   * =======================================================
   * ACTIVE SPECULO VISION ENGINE
   * =======================================================
   */

  return (
    <div
      ref={containerRef}
      className="
        absolute
        inset-0
        pointer-events-none
        z-30
        overflow-hidden
      "
      aria-label="Speculo Vision Engine"
    >
      {/* =================================================
          3D OPTICS
      ================================================= */}

      <canvas
        ref={canvas3DRef}
        className="
          absolute
          inset-0
          w-full
          h-full
          pointer-events-none
        "
        style={
          mirrored
            ? {
                transform:
                  'scaleX(-1)',
              }
            : undefined
        }
      />

      {/* =================================================
          2D TRACKING HUD
      ================================================= */}

      <canvas
        ref={canvas2DRef}
        className="
          absolute
          inset-0
          w-full
          h-full
          pointer-events-none
        "
        style={
          mirrored
            ? {
                transform:
                  'scaleX(-1)',
              }
            : undefined
        }
      />

      {/* =================================================
          STATE INDICATOR
      ================================================= */}

      <div
        id="state-display"
        className="
          absolute
          bottom-10
          left-1/2
          -translate-x-1/2
          z-30
          text-[11px]
          font-mono
          tracking-[4px]
          opacity-80
          text-[#00ffff]
          transition-all
          duration-300
          pointer-events-none
          px-3
          py-1
          bg-black/60
          rounded-full
          border
          border-[#00ffff]/30
          backdrop-blur-sm
          shadow-[0_0_12px_rgba(0,255,255,0.4)]
        "
      >
        {engineState}
      </div>
    </div>
  );
}