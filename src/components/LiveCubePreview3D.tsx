import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { BlockPattern, CubeFaceKey } from '../types/game';

interface LiveCubePreview3DProps {
  facePixels: Record<CubeFaceKey, string[]>;
  fallbackColor: string;
  pattern?: BlockPattern;
  transparent?: boolean;
  glow?: boolean;
  heightClass?: string;
}

// Three.js BoxGeometry face order: +X (right), -X (left), +Y (top), -Y (bottom), +Z (front), -Z (back)
const BOX_FACE_ORDER: CubeFaceKey[] = ['right', 'left', 'top', 'bottom', 'front', 'back'];

export function LiveCubePreview3D({
  facePixels,
  fallbackColor,
  pattern = 'solid',
  transparent = false,
  glow = false,
  heightClass = 'h-48',
}: LiveCubePreview3DProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const rootGroupRef = useRef<THREE.Group | null>(null);
  const boxMeshRef = useRef<THREE.Mesh | null>(null);
  const crossGroupRef = useRef<THREE.Group | null>(null);
  const crossMatRef = useRef<THREE.MeshStandardMaterial | null>(null);
  const matsRef = useRef<THREE.MeshStandardMaterial[]>([]);
  const canvasesRef = useRef<HTMLCanvasElement[]>([]);
  const texturesRef = useRef<THREE.CanvasTexture[]>([]);
  const rotYRef = useRef(0.6);
  const rotXRef = useRef(0.35);
  const draggingRef = useRef(false);
  const lastMouseRef = useRef({ x: 0, y: 0 });

  useEffect(() => {
    const container = hostRef.current;
    if (!container) return;

    const isSoftwareGl = (() => {
      const gl = document.createElement('canvas').getContext('webgl2');
      if (!gl) return true;
      const ext = gl.getExtension('WEBGL_debug_renderer_info');
      const param = ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER;
      const gpu = String(gl.getParameter(param));
      gl.getExtension('WEBGL_lose_context')?.loseContext();
      return /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(gpu);
    })();

    const renderer = new THREE.WebGLRenderer({
      antialias: !isSoftwareGl,
      alpha: true,
      powerPreference: 'high-performance',
    });
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.setPixelRatio(isSoftwareGl ? 1 : Math.min(window.devicePixelRatio, 2));
    renderer.setSize(container.clientWidth, container.clientHeight);
    container.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const pmrem = new THREE.PMREMGenerator(renderer);
    scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    pmrem.dispose();

    scene.add(new THREE.HemisphereLight(0xe0f2fe, 0x334155, 1.05));
    const dir = new THREE.DirectionalLight(0xfff7ed, 1.45);
    dir.position.set(3, 5, 4);
    scene.add(dir);

    const camera = new THREE.PerspectiveCamera(
      36,
      container.clientWidth / Math.max(1, container.clientHeight),
      0.1,
      20,
    );
    camera.position.set(0, 0.25, 3.0);
    camera.lookAt(0, 0, 0);

    const canvases: HTMLCanvasElement[] = [];
    const textures: THREE.CanvasTexture[] = [];
    const mats: THREE.MeshStandardMaterial[] = [];

    for (let i = 0; i < 6; i++) {
      const c = document.createElement('canvas');
      c.width = 16;
      c.height = 16;
      const tex = new THREE.CanvasTexture(c);
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.magFilter = THREE.NearestFilter;
      tex.minFilter = THREE.NearestFilter;
      tex.generateMipmaps = false;
      const mat = new THREE.MeshStandardMaterial({
        map: tex,
        roughness: 0.72,
        metalness: 0.08,
        transparent: true,
        alphaTest: 0.1,
      });
      canvases.push(c);
      textures.push(tex);
      mats.push(mat);
    }

    canvasesRef.current = canvases;
    texturesRef.current = textures;
    matsRef.current = mats;

    const rootGroup = new THREE.Group();
    rootGroupRef.current = rootGroup;
    scene.add(rootGroup);

    const geo = new THREE.BoxGeometry(1.22, 1.22, 1.22);
    const boxMesh = new THREE.Mesh(geo, mats);
    boxMeshRef.current = boxMesh;
    rootGroup.add(boxMesh);

    // Crossed plant/bamboo planes (index 4 = front texture)
    const crossGroup = new THREE.Group();
    const planeGeo = new THREE.PlaneGeometry(1.26, 1.26);
    const crossMat = new THREE.MeshStandardMaterial({
      map: textures[4],
      roughness: 0.75,
      metalness: 0.02,
      transparent: true,
      alphaTest: 0.15,
      side: THREE.DoubleSide,
    });
    crossMatRef.current = crossMat;
    const p1 = new THREE.Mesh(planeGeo, crossMat);
    p1.rotation.y = Math.PI / 4;
    const p2 = new THREE.Mesh(planeGeo, crossMat);
    p2.rotation.y = -Math.PI / 4;
    crossGroup.add(p1, p2);
    crossGroup.visible = false;
    crossGroupRef.current = crossGroup;
    rootGroup.add(crossGroup);

    let frameId = 0;
    let disposed = false;
    let last = performance.now();

    function afterDraw(cb: () => void) {
      const gl = renderer.getContext() as WebGL2RenderingContext;
      const sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
      gl.flush();
      const poll = () => {
        if (disposed) return;
        const state = sync && gl.getSyncParameter(sync, gl.SYNC_STATUS);
        if (state === gl.UNSIGNALED) {
          frameId = window.setTimeout(poll, 5);
        } else {
          if (sync) gl.deleteSync(sync);
          frameId = window.setTimeout(cb, 80);
        }
      };
      frameId = window.setTimeout(poll, 5);
    }

    function tick() {
      if (disposed) return;
      const now = performance.now();
      const dt = Math.min((now - last) / 1000, 0.05);
      last = now;
      if (!draggingRef.current) {
        rotYRef.current += dt * 0.65;
      }
      rootGroup.rotation.y = rotYRef.current;
      rootGroup.rotation.x = rotXRef.current;
      renderer.render(scene, camera);
      if (isSoftwareGl) afterDraw(tick);
      else frameId = requestAnimationFrame(tick);
    }
    tick();

    return () => {
      disposed = true;
      cancelAnimationFrame(frameId);
      clearTimeout(frameId);
      geo.dispose();
      planeGeo.dispose();
      crossMat.dispose();
      mats.forEach((m) => m.dispose());
      textures.forEach((t) => t.dispose());
      renderer.dispose();
      if (renderer.domElement.parentNode === container) {
        container.removeChild(renderer.domElement);
      }
    };
  }, []);

  useEffect(() => {
    const canvases = canvasesRef.current;
    const textures = texturesRef.current;
    const mats = matsRef.current;
    const boxMesh = boxMeshRef.current;
    const crossGroup = crossGroupRef.current;
    const crossMat = crossMatRef.current;
    if (canvases.length !== 6 || textures.length !== 6 || mats.length !== 6) return;

    const isCross = pattern === 'foliage_cross' || pattern === 'bamboo';
    const isLantern = pattern === 'lantern';
    const isTorch = pattern === 'torch';

    if (boxMesh && crossGroup) {
      boxMesh.visible = !isCross;
      crossGroup.visible = isCross;
      if (isLantern) {
        boxMesh.scale.set(0.58, 0.86, 0.58);
      } else if (isTorch) {
        boxMesh.scale.set(0.28, 0.9, 0.28);
      } else {
        boxMesh.scale.set(1, 1, 1);
      }
    }

    BOX_FACE_ORDER.forEach((faceKey, idx) => {
      const pixels = facePixels[faceKey] || [];
      const ctx = canvases[idx].getContext('2d')!;
      ctx.clearRect(0, 0, 16, 16);
      for (let y = 0; y < 16; y++) {
        for (let x = 0; x < 16; x++) {
          const val = pixels[y * 16 + x] || fallbackColor;
          if (val === 'transparent') {
            ctx.clearRect(x, y, 1, 1);
          } else if (val === 'rgba_glass') {
            ctx.fillStyle = fallbackColor;
            ctx.globalAlpha = 0.35;
            ctx.fillRect(x, y, 1, 1);
            ctx.globalAlpha = 1;
          } else {
            ctx.fillStyle = val;
            ctx.fillRect(x, y, 1, 1);
          }
        }
      }
      textures[idx].needsUpdate = true;
      mats[idx].transparent = transparent || isLantern || isTorch;
      mats[idx].alphaTest = transparent || isLantern || isTorch ? 0.08 : 0.15;
      mats[idx].emissive = new THREE.Color(glow ? fallbackColor : '#000000');
      mats[idx].emissiveIntensity = glow ? 0.35 : 0;
      mats[idx].needsUpdate = true;
    });

    if (crossMat) {
      crossMat.emissive = new THREE.Color(glow ? fallbackColor : '#000000');
      crossMat.emissiveIntensity = glow ? 0.35 : 0;
      crossMat.needsUpdate = true;
    }
  }, [facePixels, fallbackColor, pattern, transparent, glow]);

  return (
    <div
      ref={hostRef}
      onMouseDown={(e) => {
        draggingRef.current = true;
        lastMouseRef.current = { x: e.clientX, y: e.clientY };
      }}
      onMouseMove={(e) => {
        if (!draggingRef.current) return;
        const dx = e.clientX - lastMouseRef.current.x;
        const dy = e.clientY - lastMouseRef.current.y;
        lastMouseRef.current = { x: e.clientX, y: e.clientY };
        rotYRef.current += dx * 0.012;
        rotXRef.current = Math.max(-1.1, Math.min(1.1, rotXRef.current + dy * 0.01));
      }}
      onMouseUp={() => {
        draggingRef.current = false;
      }}
      onMouseLeave={() => {
        draggingRef.current = false;
      }}
      className={`w-full ${heightClass} rounded-xl bg-slate-900/90 border border-slate-700/80 cursor-grab active:cursor-grabbing`}
      title="3D Bloğu döndürmek için sürükle (Sağ, Sol, Ön, Arka, Üst, Alt)"
    />
  );
}
