import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { buildChunkGeometry } from '../engine/chunkMesher';
import { getTextureAtlas } from '../engine/textures';
import { VoxelWorld } from '../engine/worldGen';

export function TitleBackgroundCanvas({ textureVersion = 0 }: { textureVersion?: number }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const refreshRef = useRef<() => void>(() => {});

  useEffect(() => {
    refreshRef.current();
  }, [textureVersion]);

  useEffect(() => {
    const container = containerRef.current;
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
      powerPreference: 'high-performance',
    });
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.08;
    renderer.setPixelRatio(isSoftwareGl ? 1 : Math.min(window.devicePixelRatio, 2));
    renderer.setSize(container.clientWidth, container.clientHeight);
    container.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const skyColor = new THREE.Color('#74b9ff');
    scene.background = skyColor;
    scene.fog = new THREE.FogExp2(0x74b9ff, 0.01);

    const pmrem = new THREE.PMREMGenerator(renderer);
    scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    pmrem.dispose();

    const hemi = new THREE.HemisphereLight(0xdbeafe, 0x3b4d30, 0.9);
    scene.add(hemi);

    const sun = new THREE.DirectionalLight(0xfff1d0, 1.35);
    sun.position.set(45, 95, 35);
    scene.add(sun);

    const camera = new THREE.PerspectiveCamera(
      60,
      container.clientWidth / Math.max(1, container.clientHeight),
      0.1,
      260,
    );

    const atlas = getTextureAtlas();
    const opaqueMat = new THREE.MeshStandardMaterial({
      map: atlas.texture,
      vertexColors: true,
      roughness: 0.85,
      metalness: 0.04,
    });
    const transMat = new THREE.MeshStandardMaterial({
      map: atlas.texture,
      vertexColors: true,
      transparent: true,
      alphaTest: 0.15,
      roughness: 0.4,
      side: THREE.DoubleSide,
    });

    const world = new VoxelWorld(4242, 'normal');
    const centerSurf = world.getSurfaceHeight(0, 0);
    const lookY = Math.max(36, centerSurf + 4);
    const orbitY = lookY + 22;

    const worldGroup = new THREE.Group();
    let geos: THREE.BufferGeometry[] = [];
    const buildAll = () => {
      const latestAtlas = getTextureAtlas();
      opaqueMat.map = latestAtlas.texture;
      opaqueMat.needsUpdate = true;
      transMat.map = latestAtlas.texture;
      transMat.needsUpdate = true;
      geos.forEach((g) => g.dispose());
      geos = [];
      while (worldGroup.children.length > 0) {
        worldGroup.remove(worldGroup.children[0]);
      }
      for (let cx = -3; cx <= 3; cx++) {
        for (let cz = -3; cz <= 3; cz++) {
          const res = buildChunkGeometry(world, cx, cz, latestAtlas);
          if (res.opaqueGeo) {
            geos.push(res.opaqueGeo);
            worldGroup.add(new THREE.Mesh(res.opaqueGeo, opaqueMat));
          }
          if (res.transparentGeo) {
            geos.push(res.transparentGeo);
            worldGroup.add(new THREE.Mesh(res.transparentGeo, transMat));
          }
        }
      }
    };
    buildAll();
    refreshRef.current = buildAll;
    scene.add(worldGroup);

    const handleResize = () => {
      if (!container) return;
      camera.aspect = container.clientWidth / Math.max(1, container.clientHeight);
      camera.updateProjectionMatrix();
      renderer.setSize(container.clientWidth, container.clientHeight);
    };
    window.addEventListener('resize', handleResize);

    let frameId = 0;
    let disposed = false;
    let angle = 0;
    let lastTime = performance.now();

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
      const dt = Math.min((now - lastTime) / 1000, 0.05);
      lastTime = now;
      angle += dt * 0.1;

      camera.position.set(
        Math.cos(angle) * 38,
        orbitY + Math.sin(angle * 0.7) * 4,
        Math.sin(angle) * 38,
      );
      camera.lookAt(0, lookY, 0);

      renderer.render(scene, camera);
      if (isSoftwareGl) afterDraw(tick);
      else frameId = requestAnimationFrame(tick);
    }

    tick();

    return () => {
      disposed = true;
      cancelAnimationFrame(frameId);
      clearTimeout(frameId);
      window.removeEventListener('resize', handleResize);
      geos.forEach((g) => g.dispose());
      opaqueMat.dispose();
      transMat.dispose();
      renderer.dispose();
      if (renderer.domElement.parentNode === container) {
        container.removeChild(renderer.domElement);
      }
    };
  }, []);

  return <div ref={containerRef} className="absolute inset-0 w-full h-full" />;
}
