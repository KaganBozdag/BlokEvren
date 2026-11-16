import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react';
import * as THREE from 'three';
import { getBucketForLiquid, getItemDef } from '../data/blocksAndRecipes';
import { voxelAudio } from '../engine/audio';
import { buildChunkGeometry } from '../engine/chunkMesher';
import {
  createMobVisualRig,
  getMeleeDamage,
  getMobDrops,
  getMobLabel,
  getMobMaxHp,
  isBreedingFoodFor,
  MOB_SPECS,
  MobEntity,
  raycastMobs,
} from '../engine/mobSystem';
import {
  createFirstPersonArm,
  createVoxelCharacterRig,
  VoxelCharacterRig,
} from '../engine/playerMesh';
import { getTextureAtlas, setOnPngTextureReadyCallback } from '../engine/textures';
import { CHUNK_SIZE, chunkKey, VoxelWorld, WATER_LEVEL, WORLD_HEIGHT } from '../engine/worldGen';
import { CottonLuaWorldBridge } from '../cottonlua/cottonLuaEngine';
import {
  setCottonLuaWorldBridge,
  triggerCottonLuaItemHook,
  triggerCottonLuaWorldTicks,
} from '../cottonlua/cottonLuaRuntime';
import { BiomeType, GameMode, MobKind, RemotePlayer, SkinData, WeaponSpec, WorldType } from '../types/game';

export type WeatherType = 'clear' | 'rain' | 'snow';
export type WeatherMode = 'auto' | WeatherType;

export interface VoxelViewportHandle {
  teleport: (x: number, y: number, z: number) => void;
  respawnToSurface: () => void;
  setTimeOfDay: (time: number) => void;
  setWeather: (mode: WeatherMode) => void;
  getWeather: () => { mode: WeatherMode; active: WeatherType; wetness: number };
  toggleFly: () => boolean;
  applyRemoteBlock: (x: number, y: number, z: number, blockId: string) => void;
  rebuildAllChunks: () => void;
  requestLock: () => void;
  unlockPointer: () => void;
  getPlayerPosition: () => { x: number; y: number; z: number; yaw: number; pitch: number };
}

interface VoxelViewportProps {
  seed: number;
  worldType: WorldType;
  gameMode: GameMode;
  skin: SkinData;
  heldItemId: string;
  initialPosition?: { x: number; y: number; z: number };
  initialTimeOfDay?: number;
  remotePlayers: RemotePlayer[];
  localUid?: string;
  isModalOpen: boolean;
  onPointerLockChange: (locked: boolean) => void;
  onBlockBreak: (x: number, y: number, z: number, blockId: string, dropId: string, dropCount: number) => void;
  onBlockPlace: (x: number, y: number, z: number, blockId: string) => boolean;
  onScoopLiquid?: (x: number, y: number, z: number, liquidId: string, filledBucketId: string) => void;
  onInteractBlock: (blockId: string) => void;
  onEatFood: (itemId: string, foodValue: number) => void;
  onConsumeHeldItem?: (count: number) => void;
  onMobDrops?: (drops: { id: string; count: number }[]) => void;
  onMobKilled?: (kind: MobKind, isBaby: boolean) => void;
  onMobBred?: (kind: MobKind) => void;
  onDamagePlayer: (amount: number) => void;
  onHealPlayer?: (amount: number) => void;
  onGiveItem?: (itemId: string, count: number) => void;
  onSetGameMode?: (gm: GameMode) => void;
  onSystemMessage?: (text: string) => void;
  onCottonLuaAchievement?: (code: string, amount?: number) => void;
  onPositionUpdate: (pos: { x: number; y: number; z: number; yaw: number; pitch: number; flying: boolean; thirdPerson: boolean; biome?: BiomeType }) => void;
  onTimeUpdate: (time: number) => void;
  onWeatherChange?: (weather: WeatherType, mode: WeatherMode, wetness: number) => void;
  onTargetBlockChange: (targetName: string | null) => void;
}

const DEFAULT_RENDER_RADIUS = 5; // 11x11 chunks (176x176 blocks) balanced for high FPS
const PLAYER_WIDTH = 0.6;
const PLAYER_HEIGHT = 1.78;
const EYE_HEIGHT = 1.62;

interface RaycastHit {
  x: number;
  y: number;
  z: number;
  nx: number;
  ny: number;
  nz: number;
  blockId: string;
}

function raycastVoxel(
  world: VoxelWorld,
  origin: THREE.Vector3,
  dir: THREE.Vector3,
  maxDist = 6.0,
  includeLiquids = false,
): RaycastHit | null {
  let x = Math.floor(origin.x);
  let y = Math.floor(origin.y);
  let z = Math.floor(origin.z);

  const stepX = dir.x >= 0 ? 1 : -1;
  const stepY = dir.y >= 0 ? 1 : -1;
  const stepZ = dir.z >= 0 ? 1 : -1;

  const tDeltaX = dir.x !== 0 ? Math.abs(1 / dir.x) : 1e9;
  const tDeltaY = dir.y !== 0 ? Math.abs(1 / dir.y) : 1e9;
  const tDeltaZ = dir.z !== 0 ? Math.abs(1 / dir.z) : 1e9;

  let tMaxX = dir.x !== 0 ? ((dir.x > 0 ? x + 1 - origin.x : origin.x - x) * tDeltaX) : 1e9;
  let tMaxY = dir.y !== 0 ? ((dir.y > 0 ? y + 1 - origin.y : origin.y - y) * tDeltaY) : 1e9;
  let tMaxZ = dir.z !== 0 ? ((dir.z > 0 ? z + 1 - origin.z : origin.z - z) * tDeltaZ) : 1e9;

  let nx = 0;
  let ny = 0;
  let nz = 0;
  let dist = 0;

  for (let i = 0; i < 64; i++) {
    const id = world.getBlock(x, y, z);
    if (id !== 'air') {
      const def = getItemDef(id);
      const isLiq = Boolean(def?.liquid) || id === 'water' || id === 'lava';
      if (includeLiquids || !isLiq) {
        return { x, y, z, nx, ny, nz, blockId: id };
      }
    }

    if (tMaxX < tMaxY) {
      if (tMaxX < tMaxZ) {
        dist = tMaxX;
        x += stepX;
        tMaxX += tDeltaX;
        nx = -stepX;
        ny = 0;
        nz = 0;
      } else {
        dist = tMaxZ;
        z += stepZ;
        tMaxZ += tDeltaZ;
        nx = 0;
        ny = 0;
        nz = -stepZ;
      }
    } else {
      if (tMaxY < tMaxZ) {
        dist = tMaxY;
        y += stepY;
        tMaxY += tDeltaY;
        nx = 0;
        ny = -stepY;
        nz = 0;
      } else {
        dist = tMaxZ;
        z += stepZ;
        tMaxZ += tDeltaZ;
        nx = 0;
        ny = 0;
        nz = -stepZ;
      }
    }

    if (dist > maxDist) break;
  }
  return null;
}

export const VoxelViewport = forwardRef<VoxelViewportHandle, VoxelViewportProps>(
  function VoxelViewport(props, ref) {
    const mountRef = useRef<HTMLDivElement>(null);

    // Latest props stored in refs so WebGL loop never tears down
    const propsRef = useRef(props);
    propsRef.current = props;

    const worldRef = useRef<VoxelWorld | null>(null);
    const playerRef = useRef({
      x: props.initialPosition?.x ?? 0.5,
      y: props.initialPosition?.y ?? 28,
      z: props.initialPosition?.z ?? 0.5,
      vx: 0,
      vy: 0,
      vz: 0,
      yaw: 0,
      pitch: -0.15,
      onGround: false,
      flying: props.gameMode === 'creative',
      thirdPerson: false,
    });
    const timeRef = useRef(props.initialTimeOfDay ?? 4000);
    const weatherModeRef = useRef<WeatherMode>('auto');
    const weatherAutoKindRef = useRef<WeatherType>('clear');
    const weatherTimerRef = useRef(36);
    const activeWeatherRef = useRef<WeatherType>('clear');
    const wetnessRef = useRef(0);
    const rainStopDirtyRef = useRef(false);
    const rebuildQueueRef = useRef<Set<string>>(new Set());
    const fluidSyncRef = useRef<{
      onLiquidPlaced: (x: number, y: number, z: number, id: string) => void;
      onBlockChanged: (x: number, y: number, z: number) => void;
    } | null>(null);
    const forceRebuildAllRef = useRef<() => void>(() => {});
    const updateSkinRef = useRef<(s: SkinData) => void>(() => {});
    const updateHeldRef = useRef<(id: string) => void>(() => {});
    const syncRemotePlayersRef = useRef<(list: RemotePlayer[]) => void>(() => {});
    const canvasRef = useRef<HTMLCanvasElement | null>(null);

    useImperativeHandle(ref, () => ({
      teleport: (x: number, y: number, z: number) => {
        playerRef.current.x = x;
        playerRef.current.y = y;
        playerRef.current.z = z;
        playerRef.current.vx = 0;
        playerRef.current.vy = 0;
        playerRef.current.vz = 0;
        playerRef.current.onGround = false;
      },
      respawnToSurface: () => {
        const w = worldRef.current;
        const safe = w ? w.findSafeSpawn(0, 0) : { x: 0.5, y: 50, z: 0.5 };
        playerRef.current.x = safe.x;
        playerRef.current.y = safe.y;
        playerRef.current.z = safe.z;
        playerRef.current.vx = 0;
        playerRef.current.vy = 0;
        playerRef.current.vz = 0;
        playerRef.current.onGround = false;
      },
      setTimeOfDay: (t: number) => {
        timeRef.current = ((t % 24000) + 24000) % 24000;
      },
      setWeather: (mode: WeatherMode) => {
        weatherModeRef.current = mode;
        if (mode === 'auto') {
          weatherTimerRef.current = 12;
        } else {
          activeWeatherRef.current = mode;
        }
      },
      getWeather: () => ({
        mode: weatherModeRef.current,
        active: activeWeatherRef.current,
        wetness: wetnessRef.current,
      }),
      toggleFly: () => {
        playerRef.current.flying = !playerRef.current.flying;
        playerRef.current.vy = 0;
        return playerRef.current.flying;
      },
      applyRemoteBlock: (x: number, y: number, z: number, blockId: string) => {
        const w = worldRef.current;
        if (!w) return;
        if (w.getBlock(x, y, z) === blockId) return;
        w.setOverride(x, y, z, blockId);
        rainStopDirtyRef.current = true;
        if (getItemDef(blockId)?.liquid) {
          fluidSyncRef.current?.onLiquidPlaced(x, y, z, blockId);
        } else {
          fluidSyncRef.current?.onBlockChanged(x, y, z);
        }
        const cx = Math.floor(x / CHUNK_SIZE);
        const cz = Math.floor(z / CHUNK_SIZE);
        const lx = ((x % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;
        const lz = ((z % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;
        rebuildQueueRef.current.add(chunkKey(cx, cz));
        if (lx === 0) rebuildQueueRef.current.add(chunkKey(cx - 1, cz));
        if (lx === CHUNK_SIZE - 1) rebuildQueueRef.current.add(chunkKey(cx + 1, cz));
        if (lz === 0) rebuildQueueRef.current.add(chunkKey(cx, cz - 1));
        if (lz === CHUNK_SIZE - 1) rebuildQueueRef.current.add(chunkKey(cx, cz + 1));
      },
      rebuildAllChunks: () => {
        forceRebuildAllRef.current();
      },
      requestLock: () => {
        canvasRef.current?.requestPointerLock?.();
      },
      unlockPointer: () => {
        if (document.pointerLockElement) {
          document.exitPointerLock();
        }
      },
      getPlayerPosition: () => ({
        x: playerRef.current.x,
        y: playerRef.current.y,
        z: playerRef.current.z,
        yaw: playerRef.current.yaw,
        pitch: playerRef.current.pitch,
      }),
    }));

    // Sync skin & held item updates cleanly without recreating scene
    useEffect(() => {
      updateSkinRef.current(props.skin);
    }, [props.skin]);

    useEffect(() => {
      updateHeldRef.current(props.heldItemId);
    }, [props.heldItemId]);

    useEffect(() => {
      if (props.gameMode === 'survival') {
        playerRef.current.flying = false;
      }
    }, [props.gameMode]);

    useEffect(() => {
      syncRemotePlayersRef.current(props.remotePlayers);
    }, [props.remotePlayers]);

    useEffect(() => {
      const container = mountRef.current;
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
      renderer.toneMappingExposure = 1.05;
      renderer.setPixelRatio(isSoftwareGl ? 1 : Math.min(window.devicePixelRatio, 1.5));
      renderer.setSize(container.clientWidth, container.clientHeight);
      renderer.shadowMap.enabled = false;
      container.appendChild(renderer.domElement);
      canvasRef.current = renderer.domElement;

      const renderRadius = isSoftwareGl ? 4 : DEFAULT_RENDER_RADIUS;
      const fogFar = renderRadius * CHUNK_SIZE - 4;
      const fogNear = Math.max(22, Math.round(fogFar * 0.45));

      const scene = new THREE.Scene();
      const skyColor = new THREE.Color('#78b9ff');
      const nightColor = new THREE.Color('#0c1428');
      const sunsetColor = new THREE.Color('#ea8c55');
      const rainSkyDayColor = new THREE.Color('#4d5f73');
      const rainSkyNightColor = new THREE.Color('#070c17');
      const snowSkyDayColor = new THREE.Color('#c5d4e6');
      const snowSkyNightColor = new THREE.Color('#141e33');
      const lightningSkyColor = new THREE.Color('#dbeafe');
      const waterFogColor = new THREE.Color('#163b7a');
      const activeSky = new THREE.Color('#78b9ff');
      const _weatherSkyTarget = new THREE.Color();
      scene.background = activeSky;
      const fog = new THREE.Fog(0x78b9ff, fogNear, fogFar);
      scene.fog = fog;

      const hemiLight = new THREE.HemisphereLight(0xe0f2fe, 0x4b5c42, 0.95);
      scene.add(hemiLight);

      const sunLight = new THREE.DirectionalLight(0xfff4d6, 1.15);
      sunLight.castShadow = false;
      scene.add(sunLight);
      scene.add(sunLight.target);

      // Orbiting Sun, Moon, and Drifting Blocky Clouds
      const sunGeo = new THREE.PlaneGeometry(18, 18);
      const sunMat = new THREE.MeshBasicMaterial({
        color: 0xfef08a,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 1,
        fog: false,
      });
      const sunMesh = new THREE.Mesh(sunGeo, sunMat);
      scene.add(sunMesh);

      const moonGeo = new THREE.PlaneGeometry(13, 13);
      const moonMat = new THREE.MeshBasicMaterial({
        color: 0xe2e8f0,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 1,
        fog: false,
      });
      const moonMesh = new THREE.Mesh(moonGeo, moonMat);
      scene.add(moonMesh);

      const cloudGeo = new THREE.BoxGeometry(1, 2.2, 1);
      const cloudMat = new THREE.MeshBasicMaterial({
        color: 0xffffff,
        transparent: true,
        opacity: 0.78,
      });
      const cloudData: { mesh: THREE.Mesh; bx: number; bz: number }[] = [];
      for (let i = 0; i < 24; i++) {
        const cw = 10 + ((i * 7) % 14);
        const cd = 8 + ((i * 11) % 12);
        const m = new THREE.Mesh(cloudGeo, cloudMat);
        m.scale.set(cw, 1, cd);
        const bx = ((i * 47) % 240) - 120;
        const bz = ((i * 83) % 240) - 120;
        m.position.set(bx, 112 + (i % 3) * 1.5, bz);
        scene.add(m);
        cloudData.push({ mesh: m, bx, bz });
      }

      const camera = new THREE.PerspectiveCamera(
        74,
        container.clientWidth / Math.max(1, container.clientHeight),
        0.08,
        300,
      );
      scene.add(camera);

      // First-person custom-skinned arm attached to camera
      const fpArm = createFirstPersonArm(propsRef.current.skin);
      fpArm.updateHeldItem(propsRef.current.heldItemId);
      camera.add(fpArm.group);

      // Third-person full character rig
      const selfRig = createVoxelCharacterRig(propsRef.current.skin);
      selfRig.updateHeldItem(propsRef.current.heldItemId);
      selfRig.group.visible = false;
      scene.add(selfRig.group);

      updateSkinRef.current = (s: SkinData) => {
        fpArm.updateSkin(s);
        selfRig.updateSkin(s);
      };
      updateHeldRef.current = (id: string) => {
        fpArm.updateHeldItem(id);
        selfRig.updateHeldItem(id);
      };

      // World & Safe Spawn Height
      const world = new VoxelWorld(propsRef.current.seed, propsRef.current.worldType);
      worldRef.current = world;
      if (!propsRef.current.initialPosition) {
        const safe = world.findSafeSpawn(0, 0);
        playerRef.current.x = safe.x;
        playerRef.current.y = safe.y;
        playerRef.current.z = safe.z;
      }

      // Chunk Materials & Storage (Lambert terrain shader extended with GLSL wetness & snow frost)
      let currentAtlas = getTextureAtlas();
      const weatherUniforms = {
        uWetness: { value: 0 },
        uSnowFrost: { value: 0 },
        uWeatherTime: { value: 0 },
        uSunDir: { value: new THREE.Vector3(0.45, 0.85, 0.25).normalize() },
        uCameraWorldPos: { value: new THREE.Vector3() },
      };

      const applyWeatherShader = (mat: THREE.MeshLambertMaterial) => {
        mat.customProgramCacheKey = () => 'voxel-weather-v1';
        mat.onBeforeCompile = (shader) => {
          shader.uniforms.uWetness = weatherUniforms.uWetness;
          shader.uniforms.uSnowFrost = weatherUniforms.uSnowFrost;
          shader.uniforms.uWeatherTime = weatherUniforms.uWeatherTime;
          shader.uniforms.uSunDir = weatherUniforms.uSunDir;
          shader.uniforms.uCameraWorldPos = weatherUniforms.uCameraWorldPos;

          shader.vertexShader = shader.vertexShader
            .replace(
              '#include <common>',
              `#include <common>
varying vec3 vWeatherWorldPos;
varying vec3 vWeatherWorldNorm;`,
            )
            .replace(
              '#include <worldpos_vertex>',
              `#include <worldpos_vertex>
vWeatherWorldPos = (modelMatrix * vec4(transformed, 1.0)).xyz;
vWeatherWorldNorm = normalize(mat3(modelMatrix) * objectNormal);`,
            );

          shader.fragmentShader = shader.fragmentShader
            .replace(
              '#include <common>',
              `#include <common>
uniform float uWetness;
uniform float uSnowFrost;
uniform float uWeatherTime;
uniform vec3 uSunDir;
uniform vec3 uCameraWorldPos;
varying vec3 vWeatherWorldPos;
varying vec3 vWeatherWorldNorm;

float wHash2(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
}
float wNoise2(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  float a = wHash2(i);
  float b = wHash2(i + vec2(1.0, 0.0));
  float c = wHash2(i + vec2(0.0, 1.0));
  float d = wHash2(i + vec2(1.0, 1.0));
  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}`,
            )
            .replace(
              '#include <color_fragment>',
              `#include <color_fragment>
float wUpMask = smoothstep(0.35, 0.9, vWeatherWorldNorm.y);
float wSideMask = 1.0 - abs(vWeatherWorldNorm.y);
float wExposed = clamp(wUpMask + wSideMask * 0.48, 0.0, 1.0);
float wPuddle = 0.0;
if (uWetness > 0.002) {
  wPuddle = smoothstep(0.45, 0.72, wNoise2(vWeatherWorldPos.xz * 0.38)) * wUpMask;
  diffuseColor.rgb *= mix(1.0, mix(0.72, 0.56, wPuddle), uWetness * wExposed);
}
if (uSnowFrost > 0.002 && wUpMask > 0.01) {
  float wFrostPatch = smoothstep(0.25, 0.78, wNoise2(vWeatherWorldPos.xz * 0.65 + 7.1));
  diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.90, 0.95, 1.0), uSnowFrost * wUpMask * (0.16 + 0.28 * wFrostPatch));
}`,
            )
            .replace(
              '#include <envmap_fragment>',
              `if (uWetness > 0.005 && wExposed > 0.01) {
  vec2 wCell = floor(vWeatherWorldPos.xz * 2.2);
  float wPhase = fract(uWeatherTime * 1.45 + wHash2(wCell));
  vec2 wLocal = fract(vWeatherWorldPos.xz * 2.2) - (0.25 + 0.5 * vec2(wHash2(wCell + 3.1), wHash2(wCell + 9.7)));
  float wRing = smoothstep(0.08, 0.0, abs(length(wLocal) - wPhase * 0.42)) * (1.0 - wPhase) * wUpMask;
  float wTrickle = smoothstep(0.78, 0.98, wNoise2(vec2(vWeatherWorldPos.x + vWeatherWorldPos.z, vWeatherWorldPos.y * 0.65 + uWeatherTime * 3.8) * 1.4)) * wSideMask;
  vec3 wViewDir = normalize(uCameraWorldPos - vWeatherWorldPos);
  vec3 wWetNorm = normalize(vWeatherWorldNorm + vec3(wRing * 0.16, 0.0, wRing * 0.16));
  float wFresnel = pow(1.0 - clamp(dot(wWetNorm, wViewDir), 0.0, 1.0), 3.0);
  vec3 wHalf = normalize(uSunDir + wViewDir);
  float wSpec = pow(max(dot(wWetNorm, wHalf), 0.0), mix(18.0, 56.0, wPuddle));
  float wGlint = (wSpec * (0.26 + 0.54 * wPuddle) + wFresnel * 0.18 * wUpMask + wRing * 0.22 + wTrickle * 0.11) * uWetness * wExposed;
  outgoingLight += vec3(0.76, 0.89, 1.0) * wGlint;
}
#include <envmap_fragment>`,
            );
        };
      };

      const opaqueMat = new THREE.MeshLambertMaterial({
        map: currentAtlas.texture,
        vertexColors: true,
      });
      applyWeatherShader(opaqueMat);

      const transMat = new THREE.MeshLambertMaterial({
        map: currentAtlas.texture,
        vertexColors: true,
        transparent: true,
        alphaTest: 0.15,
        side: THREE.DoubleSide,
      });
      applyWeatherShader(transMat);

      const chunkGroups = new Map<
        string,
        {
          group: THREE.Group;
          opaqueMesh?: THREE.Mesh;
          transMesh?: THREE.Mesh;
        }
      >();

      const buildChunk = (cx: number, cz: number) => {
        const key = chunkKey(cx, cz);
        const existing = chunkGroups.get(key);
        if (existing) {
          if (existing.opaqueMesh) {
            existing.opaqueMesh.geometry.dispose();
            existing.group.remove(existing.opaqueMesh);
          }
          if (existing.transMesh) {
            existing.transMesh.geometry.dispose();
            existing.group.remove(existing.transMesh);
          }
          scene.remove(existing.group);
        }

        const res = buildChunkGeometry(world, cx, cz, currentAtlas);
        const group = new THREE.Group();
        let opaqueMesh: THREE.Mesh | undefined;
        let transMesh: THREE.Mesh | undefined;

        if (res.opaqueGeo) {
          opaqueMesh = new THREE.Mesh(res.opaqueGeo, opaqueMat);
          group.add(opaqueMesh);
        }
        if (res.transparentGeo) {
          transMesh = new THREE.Mesh(res.transparentGeo, transMat);
          group.add(transMesh);
        }

        scene.add(group);
        chunkGroups.set(key, { group, opaqueMesh, transMesh });
      };

      forceRebuildAllRef.current = () => {
        currentAtlas = getTextureAtlas();
        opaqueMat.map = currentAtlas.texture;
        opaqueMat.needsUpdate = true;
        transMat.map = currentAtlas.texture;
        transMat.needsUpdate = true;
        fpArm.updateHeldItem(propsRef.current.heldItemId);
        const keys = Array.from(chunkGroups.keys());
        for (const k of keys) {
          rebuildQueueRef.current.add(k);
        }
      };

      // Block Selection Outline & Mining Crack Box
      const selGeo = new THREE.EdgesGeometry(new THREE.BoxGeometry(1.006, 1.006, 1.006));
      const selMat = new THREE.LineBasicMaterial({ color: 0x0f172a, linewidth: 2 });
      const selBox = new THREE.LineSegments(selGeo, selMat);
      selBox.visible = false;
      scene.add(selBox);

      const crackGeo = new THREE.BoxGeometry(1.008, 1.008, 1.008);
      const crackMat = new THREE.MeshBasicMaterial({
        color: 0x000000,
        transparent: true,
        opacity: 0,
        wireframe: true,
      });
      const crackBox = new THREE.Mesh(crackGeo, crackMat);
      crackBox.visible = false;
      scene.add(crackBox);

      // Pooled Particle Bursts for Block Breaking
      const particleGeo = new THREE.BoxGeometry(0.14, 0.14, 0.14);
      const particlePool: {
        mesh: THREE.Mesh;
        mat: THREE.MeshStandardMaterial;
        vx: number;
        vy: number;
        vz: number;
        life: number;
      }[] = [];
      for (let i = 0; i < 36; i++) {
        const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.8 });
        const mesh = new THREE.Mesh(particleGeo, mat);
        mesh.visible = false;
        scene.add(mesh);
        particlePool.push({ mesh, mat, vx: 0, vy: 0, vz: 0, life: 0 });
      }

      const spawnBreakParticles = (x: number, y: number, z: number, colorHex: string) => {
        let spawned = 0;
        for (const p of particlePool) {
          if (p.life <= 0) {
            p.mat.color.set(colorHex);
            p.mesh.position.set(
              x + 0.25 + Math.random() * 0.5,
              y + 0.25 + Math.random() * 0.5,
              z + 0.25 + Math.random() * 0.5,
            );
            p.vx = (Math.random() - 0.5) * 4.5;
            p.vy = 1.5 + Math.random() * 3.5;
            p.vz = (Math.random() - 0.5) * 4.5;
            p.life = 0.45 + Math.random() * 0.25;
            p.mesh.visible = true;
            spawned++;
            if (spawned >= 10) break;
          }
        }
      };

      // Floating Heart Particles for Mob Feeding & Breeding
      const heartGeo = new THREE.BoxGeometry(0.18, 0.16, 0.07);
      const heartMat = new THREE.MeshBasicMaterial({ color: 0xf43f5e });
      const heartPool: {
        mesh: THREE.Mesh;
        vx: number;
        vy: number;
        vz: number;
        life: number;
      }[] = [];
      for (let i = 0; i < 24; i++) {
        const mesh = new THREE.Mesh(heartGeo, heartMat);
        mesh.visible = false;
        scene.add(mesh);
        heartPool.push({ mesh, vx: 0, vy: 0, vz: 0, life: 0 });
      }
      const spawnHeartParticles = (x: number, y: number, z: number, count = 5) => {
        let spawned = 0;
        for (const h of heartPool) {
          if (h.life <= 0) {
            h.mesh.position.set(
              x + (Math.random() - 0.5) * 0.7,
              y + 0.9 + Math.random() * 0.4,
              z + (Math.random() - 0.5) * 0.7,
            );
            h.vx = (Math.random() - 0.5) * 0.4;
            h.vy = 1.1 + Math.random() * 0.6;
            h.vz = (Math.random() - 0.5) * 0.4;
            h.life = 0.85 + Math.random() * 0.35;
            h.mesh.visible = true;
            spawned++;
            if (spawned >= count) break;
          }
        }
      };

      const enqueueChunkArea = (bx: number, bz: number) => {
        rainStopDirtyRef.current = true;
        const cx = Math.floor(bx / CHUNK_SIZE);
        const cz = Math.floor(bz / CHUNK_SIZE);
        const lx = ((bx % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;
        const lz = ((bz % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;
        rebuildQueueRef.current.add(chunkKey(cx, cz));
        if (lx === 0) rebuildQueueRef.current.add(chunkKey(cx - 1, cz));
        if (lx === CHUNK_SIZE - 1) rebuildQueueRef.current.add(chunkKey(cx + 1, cz));
        if (lz === 0) rebuildQueueRef.current.add(chunkKey(cx, cz - 1));
        if (lz === CHUNK_SIZE - 1) rebuildQueueRef.current.add(chunkKey(cx, cz + 1));
      };

      // Flowing Fluid Simulation State (depth: 0 = source, 1..maxSpread = flowing)
      const fluidDepthMap = new Map<string, number>();
      const fluidQueue = new Map<string, number>();
      const fKey = (x: number, y: number, z: number) => `${x},${y},${z}`;
      const scheduleFluidCell = (x: number, y: number, z: number, delayMs: number) => {
        if (y < 1 || y >= WORLD_HEIGHT) return;
        const k = fKey(x, y, z);
        const due = performance.now() + Math.max(40, delayMs);
        const prev = fluidQueue.get(k);
        if (prev === undefined || due < prev) {
          fluidQueue.set(k, due);
        }
      };
      const notifyNeighborFluids = (bx: number, by: number, bz: number) => {
        const dirs = [
          [0, 0, 0],
          [1, 0, 0],
          [-1, 0, 0],
          [0, 1, 0],
          [0, -1, 0],
          [0, 0, 1],
          [0, 0, -1],
        ];
        for (const [dx, dy, dz] of dirs) {
          const nx = bx + dx;
          const ny = by + dy;
          const nz = bz + dz;
          if (ny < 1 || ny >= WORLD_HEIGHT) continue;
          const nid = world.getBlock(nx, ny, nz);
          const ndef = getItemDef(nid);
          if (ndef?.liquid) {
            scheduleFluidCell(nx, ny, nz, ndef.liquidFlowDelayMs ?? 170);
          }
        }
      };
      fluidSyncRef.current = {
        onLiquidPlaced: (x, y, z, id) => {
          const def = getItemDef(id);
          fluidDepthMap.set(fKey(x, y, z), 0);
          scheduleFluidCell(x, y, z, def?.liquidFlowDelayMs ?? 170);
          notifyNeighborFluids(x, y, z);
        },
        onBlockChanged: (x, y, z) => {
          fluidDepthMap.delete(fKey(x, y, z));
          notifyNeighborFluids(x, y, z);
        },
      };

      const setWorldBlock = (
        bx: number,
        by: number,
        bz: number,
        blockId: string,
        notifyFluids = true,
      ) => {
        if (by < 0 || by >= WORLD_HEIGHT) return;
        const ix = Math.floor(bx);
        const iy = Math.floor(by);
        const iz = Math.floor(bz);
        if (world.getBlock(ix, iy, iz) === blockId) return;
        world.setOverride(ix, iy, iz, blockId);
        enqueueChunkArea(ix, iz);
        if (notifyFluids) {
          if (getItemDef(blockId)?.liquid) {
            const def = getItemDef(blockId);
            fluidDepthMap.set(fKey(ix, iy, iz), 0);
            scheduleFluidCell(ix, iy, iz, def?.liquidFlowDelayMs ?? 170);
          } else {
            fluidDepthMap.delete(fKey(ix, iy, iz));
          }
          notifyNeighborFluids(ix, iy, iz);
        }
      };

      // Dynamic Weather Particle Systems (Instanced Rain Streaks + Rain Splashes + Procedural Snowflake Points)
      const WEATHER_BOX_XZ = 28;
      const WEATHER_BOX_Y = 20;
      const RAIN_COUNT = isSoftwareGl ? 260 : 500;
      const SNOW_COUNT = isSoftwareGl ? 220 : 420;
      const SPLASH_COUNT = isSoftwareGl ? 28 : 52;

      const rainStopCache = new Map<number, number>();
      let rainCacheResetTimer = 0;
      const getColumnRainStopY = (wx: number, wz: number): number => {
        const ix = Math.floor(wx);
        const iz = Math.floor(wz);
        const key = (ix + 1048576) * 2097152 + (iz + 1048576);
        const cached = rainStopCache.get(key);
        if (cached !== undefined) return cached;
        let top = world.getSurfaceHeight(ix, iz);
        if (world.overrides.size > 0) {
          const scanMax = Math.min(WORLD_HEIGHT - 1, Math.max(top + 20, Math.floor(playerRef.current.y) + 14));
          for (let y = scanMax; y > top; y--) {
            if (world.getBlock(ix, y, iz) !== 'air') {
              top = y;
              break;
            }
          }
        }
        const stopY = top + 1;
        if (rainStopCache.size > 4000) rainStopCache.clear();
        rainStopCache.set(key, stopY);
        return stopY;
      };

      const rainGeo = new THREE.BoxGeometry(0.032, 0.78, 0.032);
      const rainMat = new THREE.MeshBasicMaterial({
        color: 0xa5d8ff,
        transparent: true,
        opacity: 0,
        depthWrite: false,
      });
      const rainMesh = new THREE.InstancedMesh(rainGeo, rainMat, RAIN_COUNT);
      rainMesh.frustumCulled = false;
      rainMesh.visible = false;
      scene.add(rainMesh);

      const rainDrops = Array.from({ length: RAIN_COUNT }, () => ({
        x: (Math.random() - 0.5) * WEATHER_BOX_XZ,
        y: Math.random() * WEATHER_BOX_Y,
        z: (Math.random() - 0.5) * WEATHER_BOX_XZ,
        speed: 22 + Math.random() * 9,
        stopY: -999,
      }));

      const splashGeo = new THREE.BoxGeometry(0.11, 0.06, 0.11);
      const splashMat = new THREE.MeshBasicMaterial({
        color: 0xdbeafe,
        transparent: true,
        opacity: 0.72,
        depthWrite: false,
      });
      const splashMesh = new THREE.InstancedMesh(splashGeo, splashMat, SPLASH_COUNT);
      splashMesh.frustumCulled = false;
      splashMesh.visible = false;
      scene.add(splashMesh);

      const splashPool = Array.from({ length: SPLASH_COUNT }, () => ({
        x: 0,
        y: 0,
        z: 0,
        vx: 0,
        vy: 0,
        vz: 0,
        life: 0,
      }));
      let splashCursor = 0;

      const spawnRainSplash = (x: number, y: number, z: number) => {
        const s = splashPool[splashCursor];
        splashCursor = (splashCursor + 1) % SPLASH_COUNT;
        s.x = x;
        s.y = y + 0.04;
        s.z = z;
        s.vx = (Math.random() - 0.5) * 1.8;
        s.vy = 1.2 + Math.random() * 1.4;
        s.vz = (Math.random() - 0.5) * 1.8;
        s.life = 0.22;
      };

      const snowCanvas = document.createElement('canvas');
      snowCanvas.width = 16;
      snowCanvas.height = 16;
      const snowCtx = snowCanvas.getContext('2d');
      if (snowCtx) {
        snowCtx.clearRect(0, 0, 16, 16);
        snowCtx.fillStyle = 'rgba(255,255,255,0.95)';
        snowCtx.fillRect(6, 2, 4, 12);
        snowCtx.fillRect(2, 6, 12, 4);
        snowCtx.fillStyle = 'rgba(219,234,254,0.8)';
        snowCtx.fillRect(4, 4, 8, 8);
      }
      const snowTex = new THREE.CanvasTexture(snowCanvas);
      snowTex.colorSpace = THREE.SRGBColorSpace;
      snowTex.magFilter = THREE.NearestFilter;
      snowTex.minFilter = THREE.NearestFilter;

      const snowPositions = new Float32Array(SNOW_COUNT * 3);
      const snowFlakes = Array.from({ length: SNOW_COUNT }, (_, idx) => {
        const x = (Math.random() - 0.5) * WEATHER_BOX_XZ;
        const y = Math.random() * WEATHER_BOX_Y;
        const z = (Math.random() - 0.5) * WEATHER_BOX_XZ;
        snowPositions[idx * 3] = x;
        snowPositions[idx * 3 + 1] = y;
        snowPositions[idx * 3 + 2] = z;
        return {
          x,
          y,
          z,
          speed: 2.1 + Math.random() * 1.6,
          phase: Math.random() * Math.PI * 2,
          sway: 0.7 + Math.random() * 0.9,
          stopY: -999,
        };
      });
      const snowGeo = new THREE.BufferGeometry();
      snowGeo.setAttribute('position', new THREE.BufferAttribute(snowPositions, 3));
      const snowMat = new THREE.PointsMaterial({
        size: 0.34,
        map: snowTex,
        transparent: true,
        opacity: 0,
        depthWrite: false,
        fog: true,
        sizeAttenuation: true,
      });
      const snowPoints = new THREE.Points(snowGeo, snowMat);
      snowPoints.frustumCulled = false;
      snowPoints.visible = false;
      scene.add(snowPoints);

      const _weatherDummy = new THREE.Object3D();
      const _zeroScaleMat = new THREE.Matrix4().makeScale(0, 0, 0);

      // Pooled Lightning Beams for Staffs & ParticleFXAPI
      const lightningGeo = new THREE.CylinderGeometry(0.16, 0.28, 22, 6);
      const lightningPool: { mesh: THREE.Mesh; mat: THREE.MeshBasicMaterial; life: number }[] = [];
      for (let i = 0; i < 4; i++) {
        const mat = new THREE.MeshBasicMaterial({
          color: 0x38bdf8,
          transparent: true,
          opacity: 0.9,
        });
        const mesh = new THREE.Mesh(lightningGeo, mat);
        mesh.visible = false;
        scene.add(mesh);
        lightningPool.push({ mesh, mat, life: 0 });
      }

      const spawnLightningBeam = (x: number, y: number, z: number, colorHex = '#38bdf8') => {
        const slot = lightningPool.find((l) => l.life <= 0) || lightningPool[0];
        slot.mat.color.set(colorHex);
        slot.mat.opacity = 0.95;
        slot.mesh.position.set(x, y + 11, z);
        slot.mesh.visible = true;
        slot.life = 0.32;
        spawnBreakParticles(x - 0.3, y + 0.3, z - 0.3, colorHex);
        voxelAudio.playBreak(true);
      };

      // Pooled Projectiles for CottonLua Guns, Bows & Staffs
      const projGeo = new THREE.BoxGeometry(0.22, 0.22, 0.36);
      const projPool: {
        mesh: THREE.Mesh;
        mat: THREE.MeshBasicMaterial;
        vx: number;
        vy: number;
        vz: number;
        life: number;
        damage: number;
        knockback: number;
        explosionPower: number;
        lightning: boolean;
        color: string;
      }[] = [];
      for (let i = 0; i < 24; i++) {
        const mat = new THREE.MeshBasicMaterial({ color: 0x22d3ee });
        const mesh = new THREE.Mesh(projGeo, mat);
        mesh.visible = false;
        scene.add(mesh);
        projPool.push({
          mesh,
          mat,
          vx: 0,
          vy: 0,
          vz: 0,
          life: 0,
          damage: 8,
          knockback: 4,
          explosionPower: 0,
          lightning: false,
          color: '#22d3ee',
        });
      }

      const spawnProjectile = (opts: {
        x: number;
        y: number;
        z: number;
        dx: number;
        dy: number;
        dz: number;
        speed: number;
        damage: number;
        color: string;
        explosionPower?: number;
        lightning?: boolean;
        knockback?: number;
      }) => {
        const slot = projPool.find((pr) => pr.life <= 0) || projPool[0];
        const len = Math.hypot(opts.dx, opts.dy, opts.dz) || 1;
        const spd = Math.max(4, Math.min(80, opts.speed || 32));
        slot.mat.color.set(opts.color || '#22d3ee');
        slot.mesh.position.set(opts.x, opts.y, opts.z);
        slot.mesh.lookAt(opts.x + opts.dx, opts.y + opts.dy, opts.z + opts.dz);
        slot.vx = (opts.dx / len) * spd;
        slot.vy = (opts.dy / len) * spd;
        slot.vz = (opts.dz / len) * spd;
        slot.life = 2.4;
        slot.damage = opts.damage || 8;
        slot.knockback = opts.knockback ?? 4;
        slot.explosionPower = opts.explosionPower || 0;
        slot.lightning = Boolean(opts.lightning);
        slot.color = opts.color || '#22d3ee';
        slot.mesh.visible = true;
      };

      // Living Mobs State (Cow, Pig, Sheep)
      const mobs: MobEntity[] = [];
      let nextMobSeq = 1;
      let mobSpawnTimer = 0.6;
      const MOB_CAP = 20;
      const MOB_KINDS: MobKind[] = ['cow', 'pig', 'sheep'];

      const spawnMobEntity = (
        kind: MobKind,
        x: number,
        y: number,
        z: number,
        isBaby = false,
      ): MobEntity => {
        const rig = createMobVisualRig(kind, isBaby);
        const yaw = Math.random() * Math.PI * 2;
        rig.group.position.set(x, y, z);
        rig.group.rotation.y = yaw;
        scene.add(rig.group);

        const maxHp = getMobMaxHp(kind);
        const mob: MobEntity = {
          id: `mob_${nextMobSeq++}`,
          kind,
          isBaby,
          x,
          y,
          z,
          vx: 0,
          vy: 0,
          vz: 0,
          yaw,
          hp: maxHp,
          maxHp,
          onGround: false,
          rig,
          aiTimer: 1.0 + Math.random() * 2.5,
          moveDirX: 0,
          moveDirZ: 0,
          moving: false,
          hurtTimer: 0,
          panicTimer: 0,
          loveTimer: 0,
          heartEmitTimer: 0,
          breedCooldown: 0,
          growTimer: isBaby ? 110 : 0,
          soundTimer: 4 + Math.random() * 10,
        };
        mobs.push(mob);
        return mob;
      };

      const removeMobAt = (idx: number) => {
        const mob = mobs[idx];
        scene.remove(mob.rig.group);
        mob.rig.dispose();
        mobs.splice(idx, 1);
      };

      const attackMob = (mob: MobEntity, overrideDmg?: number, knockbackMult = 5.2) => {
        const dmg = overrideDmg ?? getMeleeDamage(propsRef.current.heldItemId);
        mob.hp -= dmg;
        mob.hurtTimer = 0.28;
        mob.panicTimer = 3.6;

        const dx = mob.x - playerRef.current.x;
        const dz = mob.z - playerRef.current.z;
        const dist = Math.hypot(dx, dz) || 1;
        mob.vx = (dx / dist) * knockbackMult;
        mob.vz = (dz / dist) * knockbackMult;
        mob.vy = Math.min(8, 3.2 + knockbackMult * 0.2);
        mob.moveDirX = dx / dist;
        mob.moveDirZ = dz / dist;
        mob.moving = true;

        voxelAudio.playHurt();
        voxelAudio.playMobSound(mob.kind, mob.isBaby);

        if (mob.hp <= 0) {
          const idx = mobs.indexOf(mob);
          if (idx !== -1) {
            const burstColor =
              mob.kind === 'cow' ? '#7c4f2b' : mob.kind === 'pig' ? '#f4a2ad' : '#f1f5f9';
            spawnBreakParticles(mob.x - 0.4, mob.y + 0.4, mob.z - 0.4, burstColor);
            removeMobAt(idx);
            if (propsRef.current.gameMode === 'survival') {
              const drops = getMobDrops(mob.kind, mob.isBaby);
              if (drops.length > 0) {
                propsRef.current.onMobDrops?.(drops);
              }
              propsRef.current.onMobKilled?.(mob.kind, mob.isBaby);
            }
          }
        }
      };

      const explodeAt = (cx: number, cy: number, cz: number, radius: number) => {
        const r = Math.max(1, Math.min(6, Math.round(radius)));
        const rSq = r * r;
        const bx0 = Math.floor(cx);
        const by0 = Math.floor(cy);
        const bz0 = Math.floor(cz);
        for (let dy = -r; dy <= r; dy++) {
          for (let dz = -r; dz <= r; dz++) {
            for (let dx = -r; dx <= r; dx++) {
              if (dx * dx + dy * dy + dz * dz > rSq) continue;
              const bx = bx0 + dx;
              const by = by0 + dy;
              const bz = bz0 + dz;
              if (by <= 1 || by >= WORLD_HEIGHT) continue;
              const bid = world.getBlock(bx, by, bz);
              if (bid === 'air') continue;
              const bdef = getItemDef(bid);
              if (bdef && bdef.hardness >= 0) {
                setWorldBlock(bx, by, bz, 'air');
              }
            }
          }
        }
        for (let i = mobs.length - 1; i >= 0; i--) {
          const m = mobs[i];
          const d = Math.hypot(m.x - cx, m.y - cy, m.z - cz);
          if (d <= r + 1.5) {
            attackMob(m, Math.max(4, Math.round((r + 2 - d) * 4)), 7.5);
          }
        }
        spawnBreakParticles(cx, cy + 0.5, cz, '#f97316');
        spawnBreakParticles(cx - 0.4, cy + 0.8, cz + 0.4, '#facc15');
        voxelAudio.playBreak(true);
      };

      const worldBridge: CottonLuaWorldBridge = {
        getBlock: (x, y, z) => world.getBlock(Math.floor(x), Math.floor(y), Math.floor(z)),
        setBlock: (x, y, z, blockId) => setWorldBlock(x, y, z, blockId),
        fill: (x1, y1, z1, x2, y2, z2, blockId) => {
          const minX = Math.floor(Math.min(x1, x2));
          const maxX = Math.floor(Math.max(x1, x2));
          const minY = Math.max(0, Math.floor(Math.min(y1, y2)));
          const maxY = Math.min(WORLD_HEIGHT - 1, Math.floor(Math.max(y1, y2)));
          const minZ = Math.floor(Math.min(z1, z2));
          const maxZ = Math.floor(Math.max(z1, z2));
          let count = 0;
          for (let y = minY; y <= maxY; y++) {
            for (let z = minZ; z <= maxZ; z++) {
              for (let x = minX; x <= maxX; x++) {
                setWorldBlock(x, y, z, blockId);
                if (++count > 4096) return;
              }
            }
          }
        },
        explode: (x, y, z, radius) => explodeAt(x, y, z, radius),
        spawnParticles: (x, y, z, color, count) => {
          const loops = Math.max(1, Math.min(3, Math.ceil((count || 8) / 8)));
          for (let i = 0; i < loops; i++) spawnBreakParticles(x, y, z, color || '#fbbf24');
        },
        spawnHearts: (x, y, z, count) => spawnHeartParticles(x, y, z, count || 6),
        spawnLightning: (x, y, z, color) => spawnLightningBeam(x, y, z, color || '#38bdf8'),
        spawnMob: (kind, x, y, z, isBaby) => {
          const safeKind: MobKind = kind === 'pig' || kind === 'sheep' ? kind : 'cow';
          spawnMobEntity(safeKind, x, y, z, Boolean(isBaby));
        },
        fireProjectile: (opts) => spawnProjectile(opts),
        getTime: () => Math.round(timeRef.current),
        setTime: (t) => {
          timeRef.current = ((t % 24000) + 24000) % 24000;
        },
        getPlayerPos: () => ({
          x: playerRef.current.x,
          y: playerRef.current.y,
          z: playerRef.current.z,
          yaw: playerRef.current.yaw,
          pitch: playerRef.current.pitch,
        }),
        teleportPlayer: (x, y, z) => {
          playerRef.current.x = x;
          playerRef.current.y = y;
          playerRef.current.z = z;
          playerRef.current.vx = 0;
          playerRef.current.vy = 0;
          playerRef.current.vz = 0;
        },
        launchPlayer: (vx, vy, vz) => {
          playerRef.current.vx += vx;
          playerRef.current.vy = vy;
          playerRef.current.vz += vz;
          playerRef.current.onGround = false;
        },
        healPlayer: (amount) => propsRef.current.onHealPlayer?.(amount),
        giveItem: (itemId, count) => propsRef.current.onGiveItem?.(itemId, count),
        setGameMode: (gm) => propsRef.current.onSetGameMode?.(gm),
        say: (text) => propsRef.current.onSystemMessage?.(text),
        playSound: (kind) => {
          if (kind === 'hurt') voxelAudio.playHurt();
          else if (kind === 'heart') voxelAudio.playHeart();
          else if (kind === 'place') voxelAudio.playPlace();
          else voxelAudio.playBreak(true);
        },
        triggerAchievement: (code, amount) => {
          propsRef.current.onCottonLuaAchievement?.(code, amount);
        },
      };
      setCottonLuaWorldBridge(worldBridge);
      setOnPngTextureReadyCallback(() => forceRebuildAllRef.current());

      // Remote Multiplayer Rigs
      const remoteRigs = new Map<
        string,
        {
          rig: VoxelCharacterRig;
          targetX: number;
          targetY: number;
          targetZ: number;
          targetYaw: number;
          lastSkinId: string;
          lastHeld: string;
        }
      >();

      syncRemotePlayersRef.current = (players: RemotePlayer[]) => {
        const localUid = propsRef.current.localUid;
        const seen = new Set<string>();
        for (const rp of players) {
          if (rp.uid === localUid) continue;
          seen.add(rp.uid);
          const existing = remoteRigs.get(rp.uid);
          if (!existing) {
            const rig = createVoxelCharacterRig(rp.skinData, rp.displayName);
            rig.group.position.set(rp.x, rp.y, rp.z);
            rig.updateHeldItem(rp.heldItemId);
            scene.add(rig.group);
            remoteRigs.set(rp.uid, {
              rig,
              targetX: rp.x,
              targetY: rp.y,
              targetZ: rp.z,
              targetYaw: rp.yaw,
              lastSkinId: JSON.stringify(rp.skinData),
              lastHeld: rp.heldItemId,
            });
          } else {
            existing.targetX = rp.x;
            existing.targetY = rp.y;
            existing.targetZ = rp.z;
            existing.targetYaw = rp.yaw;
            const skinKey = JSON.stringify(rp.skinData);
            if (skinKey !== existing.lastSkinId) {
              existing.rig.updateSkin(rp.skinData);
              existing.lastSkinId = skinKey;
            }
            if (rp.heldItemId !== existing.lastHeld) {
              existing.rig.updateHeldItem(rp.heldItemId);
              existing.lastHeld = rp.heldItemId;
            }
          }
        }
        for (const [uid, entry] of remoteRigs.entries()) {
          if (!seen.has(uid)) {
            scene.remove(entry.rig.group);
            entry.rig.dispose();
            remoteRigs.delete(uid);
          }
        }
      };

      // Input Management
      const heldKeys = new Set<string>();
      let mouseLeftDown = false;
      let lastSpaceTap = 0;
      let lastWTap = 0;
      let sprinting = false;
      let lockTimestamp = 0;
      let coyoteTimer = 0;
      let jumpBufferTimer = 0;
      let miningTargetKey = '';
      let miningProgress = 0;
      let miningSoundTimer = 0;
      let armSwingTimer = 0;
      let recoilTimer = 0;
      let weaponCooldownTimer = 0;
      let luaTickTimer = 0;
      let stepTimer = 0;
      let currentEyeOffset = EYE_HEIGHT;
      let lastTargetBlockName: string | null = null;

      const fireWeapon = (weapon: WeaponSpec, itemColor: string) => {
        if (weaponCooldownTimer > 0) return false;
        weaponCooldownTimer = Math.max(0.06, weapon.cooldown || 0.25);
        recoilTimer = 0.16;
        armSwingTimer = 0.14;

        const dir = new THREE.Vector3(0, 0, -1).applyEuler(
          new THREE.Euler(playerRef.current.pitch, playerRef.current.yaw, 0, 'YXZ'),
        );
        const eye = new THREE.Vector3(
          playerRef.current.x,
          playerRef.current.y + currentEyeOffset - 0.08,
          playerRef.current.z,
        );
        const bursts = Math.max(1, Math.min(8, weapon.burstCount || 1));
        const spread = weapon.spread || 0.02;

        for (let b = 0; b < bursts; b++) {
          const sx = dir.x + (b > 0 ? (Math.random() - 0.5) * spread : 0);
          const sy = dir.y + (b > 0 ? (Math.random() - 0.5) * spread : 0);
          const sz = dir.z + (b > 0 ? (Math.random() - 0.5) * spread : 0);
          spawnProjectile({
            x: eye.x + sx * 0.7,
            y: eye.y + sy * 0.7,
            z: eye.z + sz * 0.7,
            dx: sx,
            dy: sy,
            dz: sz,
            speed: weapon.projectileSpeed || 38,
            damage: weapon.damage || 10,
            color: weapon.projectileColor || itemColor || '#22d3ee',
            explosionPower: weapon.explosionPower || 0,
            lightning: Boolean(weapon.lightning),
            knockback: weapon.knockback ?? 5,
          });
        }
        voxelAudio.playBreak(true);
        return true;
      };

      const onKeyDown = (e: KeyboardEvent) => {
        if (propsRef.current.isModalOpen) return;
        if (e.code === 'KeyV' && !e.repeat) {
          playerRef.current.thirdPerson = !playerRef.current.thirdPerson;
          selfRig.group.visible = playerRef.current.thirdPerson;
          fpArm.group.visible = !playerRef.current.thirdPerson;
        }
        if (e.code === 'KeyW' && !e.repeat) {
          const now = performance.now();
          if (now - lastWTap < 280) {
            sprinting = true;
          }
          lastWTap = now;
        }
        if (e.code === 'Space' && !e.repeat) {
          const now = performance.now();
          jumpBufferTimer = 0.13;
          if (propsRef.current.gameMode === 'creative' && now - lastSpaceTap < 280) {
            playerRef.current.flying = !playerRef.current.flying;
            playerRef.current.vy = 0;
            jumpBufferTimer = 0;
          }
          lastSpaceTap = now;
        }
        heldKeys.add(e.code);
      };

      const onKeyUp = (e: KeyboardEvent) => {
        heldKeys.delete(e.code);
        if (e.code === 'KeyW') {
          sprinting = false;
        }
      };

      const onWindowBlur = () => {
        heldKeys.clear();
        mouseLeftDown = false;
        sprinting = false;
      };

      const onMouseMove = (e: MouseEvent) => {
        if (document.pointerLockElement !== renderer.domElement) return;
        if (performance.now() - lockTimestamp < 80) return;
        if (Math.abs(e.movementX) > 120 || Math.abs(e.movementY) > 120) return;
        const sens = 0.0021;
        playerRef.current.yaw -= e.movementX * sens;
        playerRef.current.pitch = THREE.MathUtils.clamp(
          playerRef.current.pitch - e.movementY * sens,
          -Math.PI / 2 + 0.03,
          Math.PI / 2 - 0.03,
        );
      };

      const performBlockBreak = (hit: RaycastHit) => {
        const def = getItemDef(hit.blockId);
        if (!def || def.hardness < 0) return;

        world.setOverride(hit.x, hit.y, hit.z, 'air');
        enqueueChunkArea(hit.x, hit.z);

        spawnBreakParticles(hit.x, hit.y, hit.z, def.topColor || def.color);
        voxelAudio.playBreak(def.preferredTool === 'pickaxe');
        const dropId = def.dropId || def.id;
        const dropCount = def.dropCount || 1;
        propsRef.current.onBlockBreak(hit.x, hit.y, hit.z, hit.blockId, dropId, dropCount);

        if (def.hasLuaHooks) {
          triggerCottonLuaItemHook(hit.blockId, 'onBreak', {
            x: hit.x,
            y: hit.y,
            z: hit.z,
            dx: 0,
            dy: 0,
            dz: 0,
            playerX: playerRef.current.x,
            playerY: playerRef.current.y,
            playerZ: playerRef.current.z,
            blockId: hit.blockId,
          });
        }
      };

      const performRightClick = () => {
        const dir = new THREE.Vector3(0, 0, -1).applyEuler(
          new THREE.Euler(playerRef.current.pitch, playerRef.current.yaw, 0, 'YXZ'),
        );
        const eye = new THREE.Vector3(
          playerRef.current.x,
          playerRef.current.y + EYE_HEIGHT,
          playerRef.current.z,
        );
        const hit = raycastVoxel(world, eye, dir, 6.0);
        const mobHit = raycastMobs(eye, dir, mobs, 4.6);
        const voxelDist = hit
          ? Math.hypot(hit.x + 0.5 - eye.x, hit.y + 0.5 - eye.y, hit.z + 0.5 - eye.z)
          : Infinity;
        const heldDef = getItemDef(propsRef.current.heldItemId);

        // 1. Direct Mob Interactions (Feed/Breed or Spawn Baby with Spawn Egg)
        if (mobHit && mobHit.dist <= voxelDist + 0.2) {
          const mob = mobHit.mob;
          if (heldDef?.spawnMobKind) {
            const sameSpecies = heldDef.spawnMobKind === mob.kind;
            const sx = mob.x + (Math.random() - 0.5) * 0.65;
            const sz = mob.z + (Math.random() - 0.5) * 0.65;
            spawnMobEntity(heldDef.spawnMobKind, sx, mob.y + 0.15, sz, sameSpecies);
            if (propsRef.current.gameMode === 'survival') {
              propsRef.current.onConsumeHeldItem?.(1);
            }
            voxelAudio.playMobSound(heldDef.spawnMobKind, sameSpecies);
            voxelAudio.playPlace();
            armSwingTimer = 0.22;
            return;
          }

          if (heldDef && isBreedingFoodFor(mob.kind, heldDef.id)) {
            if (mob.isBaby) {
              mob.growTimer = Math.max(0, mob.growTimer - 35);
              spawnHeartParticles(mob.x, mob.y, mob.z, 4);
              voxelAudio.playHeart();
              if (propsRef.current.gameMode === 'survival') {
                propsRef.current.onConsumeHeldItem?.(1);
              }
              armSwingTimer = 0.22;
              return;
            }
            if (mob.breedCooldown <= 0 && mob.loveTimer <= 0) {
              mob.loveTimer = 18;
              mob.heartEmitTimer = 0;
              spawnHeartParticles(mob.x, mob.y, mob.z, 6);
              voxelAudio.playHeart();
              if (propsRef.current.gameMode === 'survival') {
                propsRef.current.onConsumeHeldItem?.(1);
              }
              armSwingTimer = 0.22;
              return;
            }
          }
        }

        // 2. Spawn Mob from Egg onto targeted block
        if (heldDef?.spawnMobKind && hit) {
          const sx = hit.x + hit.nx + 0.5;
          const sy = hit.y + hit.ny + (hit.ny < 0 ? -1.35 : 0.05);
          const sz = hit.z + hit.nz + 0.5;
          const spawnBaby = Math.random() < 0.15;
          spawnMobEntity(heldDef.spawnMobKind, sx, sy, sz, spawnBaby);
          if (propsRef.current.gameMode === 'survival') {
            propsRef.current.onConsumeHeldItem?.(1);
          }
          voxelAudio.playMobSound(heldDef.spawnMobKind, spawnBaby);
          voxelAudio.playPlace();
          armSwingTimer = 0.22;
          return;
        }

        // 3. Interact with Crafting Table, Furnace, or CottonLua Interactive Block
        if (hit && (hit.blockId === 'crafting_table' || hit.blockId === 'furnace')) {
          document.exitPointerLock?.();
          propsRef.current.onInteractBlock(hit.blockId);
          return;
        }
        if (hit) {
          const hitDef = getItemDef(hit.blockId);
          if (hitDef?.hasLuaHooks) {
            const handled = triggerCottonLuaItemHook(hit.blockId, 'onUse', {
              x: hit.x,
              y: hit.y,
              z: hit.z,
              dx: hit.nx,
              dy: hit.ny,
              dz: hit.nz,
              playerX: playerRef.current.x,
              playerY: playerRef.current.y,
              playerZ: playerRef.current.z,
              blockId: hit.blockId,
            });
            if (handled) {
              armSwingTimer = 0.22;
              return;
            }
          }
        }

        // 4. CottonLua Ranged Weapon / Custom Use Item Hook
        if (heldDef?.weapon && heldDef.weapon.weaponKind !== 'melee') {
          fireWeapon(heldDef.weapon, heldDef.color);
          if (heldDef.hasLuaHooks) {
            triggerCottonLuaItemHook(heldDef.id, 'onUse', {
              x: hit?.x ?? Math.floor(playerRef.current.x),
              y: hit?.y ?? Math.floor(playerRef.current.y),
              z: hit?.z ?? Math.floor(playerRef.current.z),
              dx: dir.x,
              dy: dir.y,
              dz: dir.z,
              playerX: playerRef.current.x,
              playerY: playerRef.current.y,
              playerZ: playerRef.current.z,
              itemId: heldDef.id,
            });
          }
          return;
        }

        if (heldDef && !heldDef.isBlock && heldDef.hasLuaHooks) {
          const used = triggerCottonLuaItemHook(heldDef.id, 'onUse', {
            x: hit?.x ?? Math.floor(playerRef.current.x),
            y: hit?.y ?? Math.floor(playerRef.current.y),
            z: hit?.z ?? Math.floor(playerRef.current.z),
            dx: dir.x,
            dy: dir.y,
            dz: dir.z,
            playerX: playerRef.current.x,
            playerY: playerRef.current.y,
            playerZ: playerRef.current.z,
            itemId: heldDef.id,
          });
          if (used) {
            armSwingTimer = 0.22;
            return;
          }
        }

        // 5. Eat Food Item
        if (heldDef && heldDef.foodValue) {
          propsRef.current.onEatFood(heldDef.id, heldDef.foodValue);
          armSwingTimer = 0.22;
          return;
        }

        // 5b. Empty Bucket -> Scoop Liquid Source/Block
        if (heldDef?.isEmptyBucket) {
          const liqHit = raycastVoxel(world, eye, dir, 6.0, true);
          if (liqHit) {
            const liqDef = getItemDef(liqHit.blockId);
            if (liqDef?.liquid) {
              const filledBucket = getBucketForLiquid(liqHit.blockId);
              if (filledBucket) {
                setWorldBlock(liqHit.x, liqHit.y, liqHit.z, 'air');
                propsRef.current.onScoopLiquid?.(
                  liqHit.x,
                  liqHit.y,
                  liqHit.z,
                  liqHit.blockId,
                  filledBucket.id,
                );
                armSwingTimer = 0.22;
                voxelAudio.playPlace();
                return;
              }
            }
          }
          return;
        }

        // 5c. Liquid Bucket -> Right-Click Ground to Pour Flowing Liquid
        if (heldDef?.placesLiquidId) {
          if (!hit) return;
          const liquidId = heldDef.placesLiquidId;
          const liquidDef = getItemDef(liquidId);
          if (!liquidDef) return;
          const hitDef = getItemDef(hit.blockId);
          const replaceHit = Boolean(hitDef?.nonSolid && !hitDef?.liquid);
          const px = replaceHit ? hit.x : hit.x + hit.nx;
          const py = replaceHit ? hit.y : hit.y + hit.ny;
          const pz = replaceHit ? hit.z : hit.z + hit.nz;
          if (py < 1 || py >= WORLD_HEIGHT) return;

          const allowed = propsRef.current.onBlockPlace(px, py, pz, liquidId);
          if (!allowed) return;

          setWorldBlock(px, py, pz, liquidId);
          armSwingTimer = 0.22;
          voxelAudio.playPlace();

          if (heldDef.hasLuaHooks) {
            triggerCottonLuaItemHook(heldDef.id, 'onUse', {
              x: px,
              y: py,
              z: pz,
              dx: hit.nx,
              dy: hit.ny,
              dz: hit.nz,
              playerX: playerRef.current.x,
              playerY: playerRef.current.y,
              playerZ: playerRef.current.z,
              itemId: heldDef.id,
              blockId: liquidId,
            });
          }
          if (liquidDef.hasLuaHooks) {
            triggerCottonLuaItemHook(liquidDef.id, 'onPlace', {
              x: px,
              y: py,
              z: pz,
              dx: hit.nx,
              dy: hit.ny,
              dz: hit.nz,
              playerX: playerRef.current.x,
              playerY: playerRef.current.y,
              playerZ: playerRef.current.z,
              blockId: liquidId,
            });
          }
          return;
        }

        // 6. Place Block
        if (!hit || !heldDef || !heldDef.isBlock) return;
        const px = hit.x + hit.nx;
        const py = hit.y + hit.ny;
        const pz = hit.z + hit.nz;
        if (py < 0 || py >= WORLD_HEIGHT) return;

        // Prevent placing solid block overlapping player AABB
        const p = playerRef.current;
        const hw = PLAYER_WIDTH * 0.45;
        const overlapsPlayer =
          !heldDef.nonSolid &&
          px + 1 > p.x - hw &&
          px < p.x + hw &&
          pz + 1 > p.z - hw &&
          pz < p.z + hw &&
          py + 1 > p.y &&
          py < p.y + PLAYER_HEIGHT;
        if (overlapsPlayer) return;

        const allowed = propsRef.current.onBlockPlace(px, py, pz, heldDef.id);
        if (!allowed) return;

        setWorldBlock(px, py, pz, heldDef.id);

        armSwingTimer = 0.22;
        voxelAudio.playPlace();

        if (heldDef.hasLuaHooks) {
          triggerCottonLuaItemHook(heldDef.id, 'onPlace', {
            x: px,
            y: py,
            z: pz,
            dx: hit.nx,
            dy: hit.ny,
            dz: hit.nz,
            playerX: playerRef.current.x,
            playerY: playerRef.current.y,
            playerZ: playerRef.current.z,
            blockId: heldDef.id,
          });
        }
      };

      const onMouseDown = (e: MouseEvent) => {
        if (propsRef.current.isModalOpen) return;
        if (document.pointerLockElement !== renderer.domElement) {
          renderer.domElement.requestPointerLock?.();
          return;
        }
        if (e.button === 0) {
          mouseLeftDown = true;
          armSwingTimer = 0.22;

          const dir = new THREE.Vector3(0, 0, -1).applyEuler(
            new THREE.Euler(playerRef.current.pitch, playerRef.current.yaw, 0, 'YXZ'),
          );
          const eye = new THREE.Vector3(
            playerRef.current.x,
            playerRef.current.y + EYE_HEIGHT,
            playerRef.current.z,
          );
          const heldDef = getItemDef(propsRef.current.heldItemId);

          if (heldDef?.weapon && heldDef.weapon.weaponKind !== 'melee') {
            fireWeapon(heldDef.weapon, heldDef.color);
            if (heldDef.hasLuaHooks) {
              triggerCottonLuaItemHook(heldDef.id, 'onAttack', {
                x: Math.floor(eye.x),
                y: Math.floor(eye.y),
                z: Math.floor(eye.z),
                dx: dir.x,
                dy: dir.y,
                dz: dir.z,
                playerX: playerRef.current.x,
                playerY: playerRef.current.y,
                playerZ: playerRef.current.z,
                itemId: heldDef.id,
              });
            }
            return;
          }

          const mobHit = raycastMobs(eye, dir, mobs, heldDef?.weapon?.range || 4.6);
          const hit = raycastVoxel(world, eye, dir, 6.0);
          const voxelDist = hit
            ? Math.hypot(hit.x + 0.5 - eye.x, hit.y + 0.5 - eye.y, hit.z + 0.5 - eye.z)
            : Infinity;

          if (mobHit && mobHit.dist <= voxelDist + 0.2) {
            attackMob(mobHit.mob, heldDef?.weapon?.damage, heldDef?.weapon?.knockback ?? 5.2);
            if (heldDef?.hasLuaHooks) {
              triggerCottonLuaItemHook(heldDef.id, 'onAttack', {
                x: Math.floor(mobHit.mob.x),
                y: Math.floor(mobHit.mob.y),
                z: Math.floor(mobHit.mob.z),
                dx: dir.x,
                dy: dir.y,
                dz: dir.z,
                playerX: playerRef.current.x,
                playerY: playerRef.current.y,
                playerZ: playerRef.current.z,
                itemId: heldDef.id,
                targetMobKind: mobHit.mob.kind,
              });
            }
            return;
          }

          if (heldDef?.hasLuaHooks) {
            triggerCottonLuaItemHook(heldDef.id, 'onAttack', {
              x: hit?.x ?? Math.floor(eye.x),
              y: hit?.y ?? Math.floor(eye.y),
              z: hit?.z ?? Math.floor(eye.z),
              dx: dir.x,
              dy: dir.y,
              dz: dir.z,
              playerX: playerRef.current.x,
              playerY: playerRef.current.y,
              playerZ: playerRef.current.z,
              itemId: heldDef.id,
            });
          }

          if (propsRef.current.gameMode === 'creative' && hit) {
            performBlockBreak(hit);
          }
        } else if (e.button === 2) {
          performRightClick();
        }
      };

      const onMouseUp = (e: MouseEvent) => {
        if (e.button === 0) {
          mouseLeftDown = false;
          miningProgress = 0;
          miningTargetKey = '';
          crackBox.visible = false;
        }
      };

      const onContextMenu = (e: MouseEvent) => e.preventDefault();

      const onPointerLockChange = () => {
        const locked = document.pointerLockElement === renderer.domElement;
        if (locked) {
          lockTimestamp = performance.now();
        } else {
          heldKeys.clear();
          mouseLeftDown = false;
          sprinting = false;
        }
        propsRef.current.onPointerLockChange(locked);
      };

      const onContextLost = (e: Event) => {
        e.preventDefault();
      };

      window.addEventListener('keydown', onKeyDown);
      window.addEventListener('keyup', onKeyUp);
      window.addEventListener('blur', onWindowBlur);
      window.addEventListener('mousemove', onMouseMove);
      renderer.domElement.addEventListener('mousedown', onMouseDown);
      window.addEventListener('mouseup', onMouseUp);
      renderer.domElement.addEventListener('contextmenu', onContextMenu);
      document.addEventListener('pointerlockchange', onPointerLockChange);
      renderer.domElement.addEventListener('webglcontextlost', onContextLost);

      const onResize = () => {
        if (!container) return;
        camera.aspect = container.clientWidth / Math.max(1, container.clientHeight);
        camera.updateProjectionMatrix();
        renderer.setSize(container.clientWidth, container.clientHeight);
      };
      window.addEventListener('resize', onResize);

      // Collision helpers (with epsilon guards so exact block-top landings never snag X/Z)
      const isSolidBlock = (bx: number, by: number, bz: number): boolean => {
        const id = world.getBlock(bx, by, bz);
        if (id === 'air' || id === 'water' || id === 'lava' || id === 'torch') return false;
        const def = getItemDef(id);
        if (def?.nonSolid || def?.liquid) return false;
        return true;
      };

      const collidesAABB = (x: number, y: number, z: number): boolean => {
        const hw = PLAYER_WIDTH / 2;
        const eps = 0.002;
        const minX = Math.floor(x - hw + eps);
        const maxX = Math.floor(x + hw - eps);
        const minY = Math.floor(y + eps);
        const maxY = Math.floor(y + PLAYER_HEIGHT - eps);
        const minZ = Math.floor(z - hw + eps);
        const maxZ = Math.floor(z + hw - eps);

        for (let by = minY; by <= maxY; by++) {
          for (let bz = minZ; bz <= maxZ; bz++) {
            for (let bx = minX; bx <= maxX; bx++) {
              if (isSolidBlock(bx, by, bz)) return true;
            }
          }
        }
        return false;
      };

      // Pre-allocated math objects (Zero GC in loop)
      const _rayOrigin = new THREE.Vector3();
      const _rayDir = new THREE.Vector3();
      const _camEuler = new THREE.Euler(0, 0, 0, 'YXZ');
      const _fwd = new THREE.Vector3();
      const _right = new THREE.Vector3();

      let frameId = 0;
      let disposed = false;
      let lastTime = performance.now();
      let hudSyncTimer = 0;

      // Initial surrounding chunks: instant 3x3 core, outer rings streamed smoothly within frame budget
      const wantedSet = new Set<string>();
      const sortedPending: { k: string; cx: number; cz: number; distSq: number }[] = [];
      let lastWantedPcx = Number.NaN;
      let lastWantedPcz = Number.NaN;

      const initCx = Math.floor(playerRef.current.x / CHUNK_SIZE);
      const initCz = Math.floor(playerRef.current.z / CHUNK_SIZE);
      for (let dx = -renderRadius; dx <= renderRadius; dx++) {
        for (let dz = -renderRadius; dz <= renderRadius; dz++) {
          const key = chunkKey(initCx + dx, initCz + dz);
          wantedSet.add(key);
          if (Math.abs(dx) <= 1 && Math.abs(dz) <= 1) {
            buildChunk(initCx + dx, initCz + dz);
          } else {
            rebuildQueueRef.current.add(key);
          }
        }
      }
      lastWantedPcx = initCx;
      lastWantedPcz = initCz;

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

      let rainIntensity = 0;
      let snowIntensity = 0;
      let wetnessLevel = 0;
      let frostLevel = 0;
      let thunderTimer = 9;
      let thunderFlash = 0;
      let weatherElapsed = 0;
      let lastFluidTickMs = 0;
      let liquidBurnTimer = 0;

      function tick() {
        if (disposed) return;
        const now = performance.now();
        const dt = Math.min((now - lastTime) / 1000, 0.05);
        lastTime = now;
        weatherElapsed += dt;

        const p = playerRef.current;

        // 1. Dynamic Weather Controller, Day/Night Cycle, Sky/Fog Colors & Lighting
        const playerBiome = world.getBiome(Math.floor(p.x), Math.floor(p.z));
        if (weatherModeRef.current === 'auto') {
          weatherTimerRef.current -= dt;
          if (weatherTimerRef.current <= 0) {
            if (weatherAutoKindRef.current === 'clear') {
              const coldBiome = playerBiome === 'snow' || playerBiome === 'taiga';
              const dryBiome = playerBiome === 'desert' || playerBiome === 'mesa';
              if (coldBiome) {
                weatherAutoKindRef.current = 'snow';
                weatherTimerRef.current = 42 + Math.random() * 28;
              } else if (dryBiome && Math.random() < 0.72) {
                weatherAutoKindRef.current = 'clear';
                weatherTimerRef.current = 45 + Math.random() * 25;
              } else {
                weatherAutoKindRef.current = 'rain';
                weatherTimerRef.current = 40 + Math.random() * 28;
              }
            } else {
              weatherAutoKindRef.current = 'clear';
              weatherTimerRef.current = 55 + Math.random() * 35;
            }
          }
          // Seamlessly transition between rain & snow if crossing into cold biome during precipitation
          if (weatherAutoKindRef.current !== 'clear') {
            weatherAutoKindRef.current =
              playerBiome === 'snow' || playerBiome === 'taiga' ? 'snow' : 'rain';
          }
          activeWeatherRef.current = weatherAutoKindRef.current;
        } else {
          activeWeatherRef.current = weatherModeRef.current;
        }

        const targetRain = activeWeatherRef.current === 'rain' ? 1 : 0;
        const targetSnow = activeWeatherRef.current === 'snow' ? 1 : 0;
        rainIntensity = THREE.MathUtils.damp(rainIntensity, targetRain, 1.15, dt);
        snowIntensity = THREE.MathUtils.damp(snowIntensity, targetSnow, 1.15, dt);

        if (rainIntensity > 0.12) {
          wetnessLevel = Math.min(1, wetnessLevel + dt * 0.11 * rainIntensity);
        } else {
          wetnessLevel = Math.max(0, wetnessLevel - dt * 0.055);
        }
        wetnessRef.current = wetnessLevel;

        if (snowIntensity > 0.12) {
          frostLevel = Math.min(1, frostLevel + dt * 0.09 * snowIntensity);
        } else {
          frostLevel = Math.max(0, frostLevel - dt * 0.06);
        }

        // Occasional distant thunder & sky flash during heavy rain
        if (rainIntensity > 0.65) {
          thunderTimer -= dt;
          if (thunderTimer <= 0) {
            thunderTimer = 11 + Math.random() * 14;
            thunderFlash = 0.85;
            voxelAudio.playThunder();
          }
        }
        thunderFlash = Math.max(0, thunderFlash - dt * 2.8);

        timeRef.current = (timeRef.current + dt * 24) % 24000;
        const dayRatio = timeRef.current / 24000;
        const sunAngle = dayRatio * Math.PI * 2;
        const sunY = Math.sin(sunAngle);
        const sunCos = Math.cos(sunAngle);
        sunLight.position.set(p.x + sunCos * 45, p.y + sunY * 50 + 12, p.z + 20);
        sunLight.target.position.set(p.x, p.y, p.z);
        sunLight.target.updateMatrixWorld();

        weatherUniforms.uSunDir.value.set(sunCos * 45, sunY * 50 + 12, 20).normalize();
        weatherUniforms.uWetness.value = wetnessLevel;
        weatherUniforms.uSnowFrost.value = frostLevel;
        weatherUniforms.uWeatherTime.value = weatherElapsed;
        weatherUniforms.uCameraWorldPos.value.copy(camera.position);

        sunMesh.position.set(p.x + sunCos * 155, p.y + sunY * 155, p.z + 30);
        sunMesh.lookAt(p.x, p.y, p.z);
        moonMesh.position.set(p.x - sunCos * 155, p.y - sunY * 155, p.z - 30);
        moonMesh.lookAt(p.x, p.y, p.z);

        const cloudDriftRate = 0.0018 + (rainIntensity + snowIntensity) * 0.0022;
        const cloudDrift = (now * cloudDriftRate) % 240;
        for (let i = 0; i < cloudData.length; i++) {
          const cd = cloudData[i];
          const wx = ((((cd.bx + cloudDrift - p.x + 120) % 240) + 240) % 240) - 120 + p.x;
          const wz = ((((cd.bz - p.z + 120) % 240) + 240) % 240) - 120 + p.z;
          cd.mesh.position.x = wx;
          cd.mesh.position.z = wz;
        }

        const overcast = Math.min(1, rainIntensity * 0.92 + snowIntensity * 0.8);
        const daylight = THREE.MathUtils.clamp((sunY + 0.25) / 0.85, 0, 1);
        sunLight.intensity =
          (0.2 + daylight * 1.3) * (1 - overcast * 0.45) + thunderFlash * 0.9;
        hemiLight.intensity =
          (0.25 + daylight * 0.65) * (1 - overcast * 0.22) + thunderFlash * 0.35;
        sunLight.color.setRGB(
          1.0 - overcast * 0.18,
          0.96 - overcast * 0.12,
          0.84 + overcast * 0.14,
        );

        sunMat.opacity = Math.max(0.06, 1 - overcast * 0.94);
        moonMat.opacity = Math.max(0.08, 1 - overcast * 0.9);
        cloudMat.opacity = 0.78 + overcast * 0.16;
        const cR = (0.35 + daylight * 0.65) * (1 - rainIntensity * 0.48 - snowIntensity * 0.1);
        const cG = (0.38 + daylight * 0.62) * (1 - rainIntensity * 0.45 - snowIntensity * 0.06);
        const cB = (0.48 + daylight * 0.52) * (1 - rainIntensity * 0.38);
        cloudMat.color.setRGB(
          Math.min(1, cR + thunderFlash * 0.35),
          Math.min(1, cG + thunderFlash * 0.38),
          Math.min(1, cB + thunderFlash * 0.45),
        );

        const camBlockId = world.getBlock(
          Math.floor(camera.position.x),
          Math.floor(camera.position.y),
          Math.floor(camera.position.z),
        );
        const camBlockDef = getItemDef(camBlockId);
        const cameraSubmerged = Boolean(camBlockDef?.liquid);

        if (cameraSubmerged) {
          if (camBlockId === 'water') {
            activeSky.copy(waterFogColor);
          } else {
            activeSky.set(camBlockDef?.color || '#163b7a').multiplyScalar(0.55);
          }
          fog.near = 2;
          fog.far = 24;
        } else {
          const weatherFogShrink = 1 - rainIntensity * 0.34 - snowIntensity * 0.46;
          fog.near = Math.max(5, fogNear * (1 - overcast * 0.68));
          fog.far = Math.max(24, fogFar * weatherFogShrink);
          if (sunY > 0.15) {
            activeSky.copy(skyColor);
          } else if (sunY > -0.15) {
            const t = (sunY + 0.15) / 0.3;
            activeSky.copy(nightColor).lerp(sunsetColor, 0.6).lerp(skyColor, t);
          } else {
            activeSky.copy(nightColor);
          }
          if (rainIntensity > 0.01) {
            _weatherSkyTarget.copy(rainSkyNightColor).lerp(rainSkyDayColor, daylight);
            activeSky.lerp(_weatherSkyTarget, rainIntensity * 0.82);
          }
          if (snowIntensity > 0.01) {
            _weatherSkyTarget.copy(snowSkyNightColor).lerp(snowSkyDayColor, daylight);
            activeSky.lerp(_weatherSkyTarget, snowIntensity * 0.85);
          }
          if (thunderFlash > 0.01) {
            activeSky.lerp(lightningSkyColor, Math.min(0.65, thunderFlash * 0.55));
          }
        }
        fog.color.copy(activeSky);

        // 1b. Update Rain Streaks, Splash Droplets & Snowflakes with Shelter Occlusion
        if (rainStopDirtyRef.current || rainCacheResetTimer > 1.4) {
          rainStopCache.clear();
          rainStopDirtyRef.current = false;
          rainCacheResetTimer = 0;
        }
        rainCacheResetTimer += dt;

        if (rainIntensity > 0.02 && !cameraSubmerged) {
          rainMesh.visible = true;
          rainMat.opacity = Math.min(0.62, rainIntensity * 0.62);
          const halfXZ = WEATHER_BOX_XZ * 0.5;
          const activeCount = Math.max(12, Math.round(RAIN_COUNT * rainIntensity));
          const windX = 2.4;
          const windZ = 0.8;
          for (let i = 0; i < RAIN_COUNT; i++) {
            if (i >= activeCount) {
              rainMesh.setMatrixAt(i, _zeroScaleMat);
              continue;
            }
            const d = rainDrops[i];
            d.x += windX * dt;
            d.z += windZ * dt;
            d.y -= d.speed * dt;

            let wrapped = false;
            if (d.x < p.x - halfXZ || d.x > p.x + halfXZ) {
              d.x = p.x + (Math.random() - 0.5) * WEATHER_BOX_XZ;
              wrapped = true;
            }
            if (d.z < p.z - halfXZ || d.z > p.z + halfXZ) {
              d.z = p.z + (Math.random() - 0.5) * WEATHER_BOX_XZ;
              wrapped = true;
            }
            if (d.y < p.y - 6 || d.y > p.y + WEATHER_BOX_Y) {
              d.x = p.x + (Math.random() - 0.5) * WEATHER_BOX_XZ;
              d.z = p.z + (Math.random() - 0.5) * WEATHER_BOX_XZ;
              d.y = p.y + 8 + Math.random() * (WEATHER_BOX_Y - 6);
              wrapped = true;
            }
            if (wrapped || d.stopY < -100) {
              d.stopY = getColumnRainStopY(d.x, d.z);
            }
            if (d.y <= d.stopY) {
              if (Math.random() < 0.35 && Math.hypot(d.x - p.x, d.z - p.z) < 12) {
                spawnRainSplash(d.x, d.stopY, d.z);
              }
              d.x = p.x + (Math.random() - 0.5) * WEATHER_BOX_XZ;
              d.z = p.z + (Math.random() - 0.5) * WEATHER_BOX_XZ;
              d.y = p.y + 9 + Math.random() * (WEATHER_BOX_Y - 7);
              d.stopY = getColumnRainStopY(d.x, d.z);
            }
            _weatherDummy.position.set(d.x, d.y, d.z);
            _weatherDummy.rotation.set(0.03, 0, -0.09);
            _weatherDummy.scale.set(1, 1, 1);
            _weatherDummy.updateMatrix();
            rainMesh.setMatrixAt(i, _weatherDummy.matrix);
          }
          rainMesh.instanceMatrix.needsUpdate = true;
        } else {
          rainMesh.visible = false;
        }

        let anySplashAlive = false;
        for (let i = 0; i < SPLASH_COUNT; i++) {
          const sp = splashPool[i];
          if (sp.life > 0) {
            anySplashAlive = true;
            sp.life -= dt;
            sp.vy -= 11 * dt;
            sp.x += sp.vx * dt;
            sp.y += sp.vy * dt;
            sp.z += sp.vz * dt;
            const sScale = Math.max(0.01, sp.life / 0.22);
            _weatherDummy.position.set(sp.x, sp.y, sp.z);
            _weatherDummy.rotation.set(0, 0, 0);
            _weatherDummy.scale.set(sScale, sScale, sScale);
            _weatherDummy.updateMatrix();
            splashMesh.setMatrixAt(i, _weatherDummy.matrix);
          } else {
            splashMesh.setMatrixAt(i, _zeroScaleMat);
          }
        }
        splashMesh.visible = anySplashAlive && !cameraSubmerged;
        if (splashMesh.visible) {
          splashMesh.instanceMatrix.needsUpdate = true;
        }

        if (snowIntensity > 0.02 && !cameraSubmerged) {
          snowPoints.visible = true;
          snowMat.opacity = Math.min(0.92, snowIntensity * 0.92);
          const halfXZ = WEATHER_BOX_XZ * 0.5;
          const posAttr = snowGeo.attributes.position as THREE.BufferAttribute;
          const arr = posAttr.array as Float32Array;
          const activeSnow = Math.max(12, Math.round(SNOW_COUNT * snowIntensity));
          for (let i = 0; i < SNOW_COUNT; i++) {
            const fl = snowFlakes[i];
            if (i >= activeSnow) {
              arr[i * 3 + 1] = -9999;
              continue;
            }
            fl.x += Math.sin(weatherElapsed * fl.sway + fl.phase) * 0.95 * dt + 0.35 * dt;
            fl.z += Math.cos(weatherElapsed * (fl.sway * 0.85) + fl.phase) * 0.95 * dt;
            fl.y -= fl.speed * dt;

            let wrapped = false;
            if (fl.x < p.x - halfXZ || fl.x > p.x + halfXZ) {
              fl.x = p.x + (Math.random() - 0.5) * WEATHER_BOX_XZ;
              wrapped = true;
            }
            if (fl.z < p.z - halfXZ || fl.z > p.z + halfXZ) {
              fl.z = p.z + (Math.random() - 0.5) * WEATHER_BOX_XZ;
              wrapped = true;
            }
            if (fl.y < p.y - 5 || fl.y > p.y + WEATHER_BOX_Y) {
              fl.x = p.x + (Math.random() - 0.5) * WEATHER_BOX_XZ;
              fl.z = p.z + (Math.random() - 0.5) * WEATHER_BOX_XZ;
              fl.y = p.y + 8 + Math.random() * (WEATHER_BOX_Y - 6);
              wrapped = true;
            }
            if (wrapped || fl.stopY < -100) {
              fl.stopY = getColumnRainStopY(fl.x, fl.z);
            }
            if (fl.y <= fl.stopY) {
              fl.x = p.x + (Math.random() - 0.5) * WEATHER_BOX_XZ;
              fl.z = p.z + (Math.random() - 0.5) * WEATHER_BOX_XZ;
              fl.y = p.y + 9 + Math.random() * (WEATHER_BOX_Y - 7);
              fl.stopY = getColumnRainStopY(fl.x, fl.z);
            }
            arr[i * 3] = fl.x;
            arr[i * 3 + 1] = fl.y;
            arr[i * 3 + 2] = fl.z;
          }
          posAttr.needsUpdate = true;
        } else {
          snowPoints.visible = false;
        }

        // 2. Player Movement & Crisp Physics
        const locked = document.pointerLockElement === renderer.domElement;
        const sneaking =
          locked &&
          !p.flying &&
          (heldKeys.has('ShiftLeft') || heldKeys.has('ShiftRight'));
        const wantSprint =
          locked &&
          !sneaking &&
          (sprinting ||
            heldKeys.has('ControlLeft') ||
            heldKeys.has('ControlRight') ||
            heldKeys.has('KeyR'));

        let moveX = 0;
        let moveZ = 0;
        let isMovingInput = false;
        if (locked && !propsRef.current.isModalOpen) {
          const forwardInput =
            (heldKeys.has('KeyW') || heldKeys.has('ArrowUp') ? 1 : 0) -
            (heldKeys.has('KeyS') || heldKeys.has('ArrowDown') ? 1 : 0);
          const strafeInput =
            (heldKeys.has('KeyD') || heldKeys.has('ArrowRight') ? 1 : 0) -
            (heldKeys.has('KeyA') || heldKeys.has('ArrowLeft') ? 1 : 0);
          _fwd.set(-Math.sin(p.yaw), 0, -Math.cos(p.yaw));
          _right.set(Math.cos(p.yaw), 0, -Math.sin(p.yaw));

          if (forwardInput !== 0 || strafeInput !== 0) {
            isMovingInput = true;
            const len = Math.hypot(forwardInput, strafeInput);
            const nf = forwardInput / len;
            const nr = strafeInput / len;
            const speed = p.flying
              ? wantSprint
                ? 20.0
                : 13.0
              : sneaking
                ? 2.4
                : wantSprint
                  ? 7.8
                  : 5.2;
            moveX = (_fwd.x * nf + _right.x * nr) * speed;
            moveZ = (_fwd.z * nf + _right.z * nr) * speed;
          }
        }

        // Dynamic sprint FOV kick
        const targetFov = wantSprint && isMovingInput ? 81 : 74;
        if (Math.abs(camera.fov - targetFov) > 0.05) {
          camera.fov = THREE.MathUtils.damp(camera.fov, targetFov, 12, dt);
          camera.updateProjectionMatrix();
        }

        const bodyBlockId = world.getBlock(
          Math.floor(p.x),
          Math.floor(p.y + 0.4),
          Math.floor(p.z),
        );
        const bodyBlockDef = getItemDef(bodyBlockId);
        const inWater = Boolean(bodyBlockDef?.liquid);

        if (bodyBlockDef?.liquid && bodyBlockDef.liquidHarmful && propsRef.current.gameMode === 'survival') {
          liquidBurnTimer += dt;
          if (liquidBurnTimer >= 0.65) {
            liquidBurnTimer = 0;
            voxelAudio.playHurt();
            propsRef.current.onDamagePlayer(3);
          }
        } else {
          liquidBurnTimer = Math.max(0, liquidBurnTimer - dt);
        }

        if (p.onGround) {
          coyoteTimer = 0.11;
        } else {
          coyoteTimer = Math.max(0, coyoteTimer - dt);
        }
        jumpBufferTimer = Math.max(0, jumpBufferTimer - dt);

        if (p.flying) {
          p.vx = THREE.MathUtils.damp(p.vx, moveX, 16, dt);
          p.vz = THREE.MathUtils.damp(p.vz, moveZ, 16, dt);
          let flyY = 0;
          if (locked && heldKeys.has('Space')) flyY += 10.5;
          if (locked && (heldKeys.has('ShiftLeft') || heldKeys.has('ShiftRight'))) flyY -= 10.5;
          p.vy = THREE.MathUtils.damp(p.vy, flyY, 16, dt);
        } else {
          const accel = p.onGround ? 22 : 10;
          p.vx = THREE.MathUtils.damp(p.vx, moveX, accel, dt);
          p.vz = THREE.MathUtils.damp(p.vz, moveZ, accel, dt);
          if (inWater) {
            p.vy -= 10 * dt;
            if (locked && heldKeys.has('Space')) p.vy = 4.6;
            p.vy = Math.max(-4.5, p.vy);
          } else {
            p.vy -= 28 * dt;
            const wantsJump = (locked && heldKeys.has('Space')) || jumpBufferTimer > 0;
            if (wantsJump && coyoteTimer > 0) {
              p.vy = 9.25;
              p.onGround = false;
              coyoteTimer = 0;
              jumpBufferTimer = 0;
            }
          }
        }

        // Sub-stepped AABB collision with clean block-top snapping & sneak edge-guard
        const subSteps = Math.max(
          1,
          Math.ceil(
            Math.max(Math.abs(p.vx * dt), Math.abs(p.vy * dt), Math.abs(p.vz * dt)) / 0.22,
          ),
        );
        const subDt = dt / subSteps;

        for (let s = 0; s < subSteps; s++) {
          const nextX = p.x + p.vx * subDt;
          if (!collidesAABB(nextX, p.y, p.z)) {
            if (sneaking && p.onGround && !collidesAABB(nextX, p.y - 0.55, p.z)) {
              p.vx = 0; // Sneak prevents walking off ledge
            } else {
              p.x = nextX;
            }
          } else {
            p.vx = 0;
          }

          const nextZ = p.z + p.vz * subDt;
          if (!collidesAABB(p.x, p.y, nextZ)) {
            if (sneaking && p.onGround && !collidesAABB(p.x, p.y - 0.55, nextZ)) {
              p.vz = 0;
            } else {
              p.z = nextZ;
            }
          } else {
            p.vz = 0;
          }

          const prevVy = p.vy;
          const nextY = p.y + p.vy * subDt;
          if (!collidesAABB(p.x, nextY, p.z)) {
            p.y = nextY;
            p.onGround = false;
          } else {
            if (p.vy < 0) {
              p.y = Math.floor(nextY + 0.002) + 1;
              if (
                !p.flying &&
                !inWater &&
                propsRef.current.gameMode === 'survival' &&
                prevVy < -14.5
              ) {
                const dmg = Math.floor((-prevVy - 13.5) * 1.4);
                if (dmg > 0) {
                  voxelAudio.playHurt();
                  propsRef.current.onDamagePlayer(dmg);
                }
              }
              p.onGround = true;
            } else if (p.vy > 0) {
              p.y = Math.floor(nextY + PLAYER_HEIGHT - 0.002) - PLAYER_HEIGHT;
            }
            p.vy = 0;
          }
        }

        // Prevent falling into void
        if (p.y < -10) {
          const safe = world.findSafeSpawn(Math.floor(p.x), Math.floor(p.z));
          p.x = safe.x;
          p.y = safe.y;
          p.z = safe.z;
          p.vy = 0;
        }

        const horizSpeed = Math.hypot(p.vx, p.vz);
        if (p.onGround && horizSpeed > 1.2 && !p.flying && !sneaking) {
          stepTimer += dt * horizSpeed;
          if (stepTimer > 2.2) {
            stepTimer = 0;
            voxelAudio.playStep();
          }
        }

        weaponCooldownTimer = Math.max(0, weaponCooldownTimer - dt);
        recoilTimer = Math.max(0, recoilTimer - dt);

        // 3. Camera & Self Rig Positioning (with 3rd-person terrain collision pull-in)
        const targetEye = sneaking ? EYE_HEIGHT - 0.24 : EYE_HEIGHT;
        currentEyeOffset = THREE.MathUtils.damp(currentEyeOffset, targetEye, 18, dt);

        _camEuler.set(p.pitch, p.yaw, 0, 'YXZ');
        if (p.thirdPerson) {
          selfRig.group.position.set(p.x, p.y, p.z);
          selfRig.group.rotation.y = p.yaw + Math.PI;
          selfRig.head.rotation.x = -p.pitch * 0.75;
          selfRig.animate(dt, horizSpeed, armSwingTimer > 0);

          _rayOrigin.set(p.x, p.y + currentEyeOffset + 0.2, p.z);
          _rayDir.set(0, 0, 1).applyEuler(_camEuler);
          const camHit = raycastVoxel(world, _rayOrigin, _rayDir, 4.2);
          let camDist = 3.8;
          if (camHit) {
            const hitCenterDist = Math.hypot(
              camHit.x + 0.5 - _rayOrigin.x,
              camHit.y + 0.5 - _rayOrigin.y,
              camHit.z + 0.5 - _rayOrigin.z,
            );
            camDist = Math.max(0.9, Math.min(3.8, hitCenterDist - 0.7));
          }
          camera.position.set(
            _rayOrigin.x + _rayDir.x * camDist,
            _rayOrigin.y + _rayDir.y * camDist,
            _rayOrigin.z + _rayDir.z * camDist,
          );
          camera.quaternion.setFromEuler(_camEuler);
        } else {
          const bob = p.onGround && horizSpeed > 0.6 ? Math.sin(now * 0.011) * 0.042 : 0;
          camera.position.set(p.x, p.y + currentEyeOffset + bob, p.z);
          camera.quaternion.setFromEuler(_camEuler);

          if (armSwingTimer > 0) {
            armSwingTimer = Math.max(0, armSwingTimer - dt);
          }
          const heldDefAnim = getItemDef(propsRef.current.heldItemId)?.animation;
          fpArm.applyAnimation(now, dt, horizSpeed, armSwingTimer, recoilTimer, heldDefAnim);
        }

        // 4. Voxel & Mob Raycast & Progressive Mining
        _rayOrigin.set(p.x, p.y + currentEyeOffset, p.z);
        _rayDir.set(0, 0, -1).applyEuler(_camEuler);
        const hit = raycastVoxel(world, _rayOrigin, _rayDir, 6.0);
        const mobHit = raycastMobs(_rayOrigin, _rayDir, mobs, 4.6);
        const voxelDist = hit
          ? Math.hypot(
              hit.x + 0.5 - _rayOrigin.x,
              hit.y + 0.5 - _rayOrigin.y,
              hit.z + 0.5 - _rayOrigin.z,
            )
          : Infinity;
        const isMobTargeted = Boolean(mobHit && mobHit.dist <= voxelDist + 0.2);

        if (isMobTargeted && mobHit && locked) {
          selBox.visible = false;
          crackBox.visible = false;
          miningProgress = 0;
          const m = mobHit.mob;
          const tName = `${getMobLabel(m.kind, m.isBaby)} ❤️ ${Math.ceil(m.hp)}/${m.maxHp}${
            m.loveTimer > 0 ? ' 💕' : ''
          }`;
          if (tName !== lastTargetBlockName) {
            lastTargetBlockName = tName;
            propsRef.current.onTargetBlockChange(tName);
          }
        } else if (hit && locked) {
          selBox.position.set(hit.x + 0.5, hit.y + 0.5, hit.z + 0.5);
          selBox.visible = true;
          const tDef = getItemDef(hit.blockId);
          const tName = tDef ? tDef.name : hit.blockId;
          if (tName !== lastTargetBlockName) {
            lastTargetBlockName = tName;
            propsRef.current.onTargetBlockChange(tName);
          }

          if (mouseLeftDown && propsRef.current.gameMode === 'survival' && tDef && tDef.hardness >= 0) {
            const targetKey = `${hit.x}_${hit.y}_${hit.z}`;
            if (targetKey !== miningTargetKey) {
              miningTargetKey = targetKey;
              miningProgress = 0;
            }
            const heldDef = getItemDef(propsRef.current.heldItemId);
            const requiredTier = tDef.minToolTier || 0;
            const heldTier = heldDef?.toolTier || 0;
            let mult = 1.0;
            if (
              heldDef &&
              heldDef.toolType &&
              heldDef.toolType === tDef.preferredTool &&
              heldTier >= requiredTier
            ) {
              mult = heldDef.miningSpeed || 2.0;
            } else if (requiredTier > 0) {
              mult = 0.28; // Under-tiered or wrong tool penalty
            }
            const breakDuration = Math.max(0.15, tDef.hardness / mult);
            miningProgress += dt / breakDuration;
            armSwingTimer = 0.18;

            miningSoundTimer += dt;
            if (miningSoundTimer > 0.22) {
              miningSoundTimer = 0;
              voxelAudio.playDigTick(tDef.preferredTool === 'pickaxe');
            }

            crackBox.position.set(hit.x + 0.5, hit.y + 0.5, hit.z + 0.5);
            crackBox.visible = true;
            crackMat.opacity = Math.min(0.85, miningProgress * 0.85);

            if (miningProgress >= 1.0) {
              miningProgress = 0;
              miningTargetKey = '';
              crackBox.visible = false;
              performBlockBreak(hit);
            }
          } else {
            crackBox.visible = false;
            miningProgress = 0;
          }
        } else {
          selBox.visible = false;
          crackBox.visible = false;
          if (lastTargetBlockName !== null) {
            lastTargetBlockName = null;
            propsRef.current.onTargetBlockChange(null);
          }
        }

        // 5. Particle & Heart Pool Physics Update
        for (const pt of particlePool) {
          if (pt.life > 0) {
            pt.life -= dt;
            pt.vy -= 14 * dt;
            pt.mesh.position.x += pt.vx * dt;
            pt.mesh.position.y += pt.vy * dt;
            pt.mesh.position.z += pt.vz * dt;
            pt.mesh.rotation.x += dt * 6;
            pt.mesh.rotation.y += dt * 5;
            if (pt.life <= 0) pt.mesh.visible = false;
          }
        }
        for (const hp of heartPool) {
          if (hp.life > 0) {
            hp.life -= dt;
            hp.mesh.position.x += hp.vx * dt;
            hp.mesh.position.y += hp.vy * dt;
            hp.mesh.position.z += hp.vz * dt;
            hp.mesh.rotation.y += dt * 3;
            if (hp.life <= 0) hp.mesh.visible = false;
          }
        }

        // 5a. CottonLua Projectiles, Lightning & World Ticks
        for (const pr of projPool) {
          if (pr.life <= 0) continue;
          pr.life -= dt;
          const nx = pr.mesh.position.x + pr.vx * dt;
          const ny = pr.mesh.position.y + pr.vy * dt;
          const nz = pr.mesh.position.z + pr.vz * dt;
          pr.mesh.position.set(nx, ny, nz);

          let hitStop = false;
          for (let mi = mobs.length - 1; mi >= 0; mi--) {
            const m = mobs[mi];
            const distMob = Math.hypot(m.x - nx, m.y + 0.7 - ny, m.z - nz);
            if (distMob < 0.95) {
              attackMob(m, pr.damage, pr.knockback);
              if (pr.explosionPower > 0) explodeAt(nx, ny, nz, pr.explosionPower);
              if (pr.lightning) spawnLightningBeam(nx, ny, nz, pr.color);
              spawnBreakParticles(nx - 0.3, ny, nz - 0.3, pr.color);
              hitStop = true;
              break;
            }
          }

          if (!hitStop && isSolidBlock(Math.floor(nx), Math.floor(ny), Math.floor(nz))) {
            if (pr.explosionPower > 0) explodeAt(nx, ny, nz, pr.explosionPower);
            if (pr.lightning) spawnLightningBeam(nx, ny, nz, pr.color);
            spawnBreakParticles(nx - 0.3, ny, nz - 0.3, pr.color);
            hitStop = true;
          }

          if (hitStop || pr.life <= 0) {
            pr.life = 0;
            pr.mesh.visible = false;
          }
        }

        for (const lb of lightningPool) {
          if (lb.life <= 0) continue;
          lb.life -= dt;
          lb.mat.opacity = Math.max(0, lb.life / 0.32);
          if (lb.life <= 0) lb.mesh.visible = false;
        }

        luaTickTimer += dt;
        if (luaTickTimer >= 0.1) {
          triggerCottonLuaWorldTicks(luaTickTimer);
          luaTickTimer = 0;
        }

        // 5b. Living Mobs Spawning, AI, Breeding & Physics
        mobSpawnTimer -= dt;
        if (mobSpawnTimer <= 0) {
          mobSpawnTimer = mobs.length < 6 ? 1.1 : 2.8;
          if (mobs.length < MOB_CAP) {
            const angle = Math.random() * Math.PI * 2;
            const dist = 12 + Math.random() * 24;
            const sx = Math.floor(p.x + Math.cos(angle) * dist);
            const sz = Math.floor(p.z + Math.sin(angle) * dist);
            const sy = world.getSurfaceHeight(sx, sz);
            const groundId = world.getBlock(sx, sy, sz);
            const validGround =
              groundId === 'grass' ||
              groundId === 'dirt' ||
              groundId === 'podzol' ||
              groundId === 'coarse_dirt' ||
              groundId === 'snow_grass';
            const surfaceAboveWater = world.worldType === 'flat' || sy >= WATER_LEVEL;
            if (
              validGround &&
              surfaceAboveWater &&
              !isSolidBlock(sx, sy + 1, sz) &&
              !isSolidBlock(sx, sy + 2, sz)
            ) {
              const kind = MOB_KINDS[Math.floor(Math.random() * MOB_KINDS.length)];
              const herdCount = Math.min(MOB_CAP - mobs.length, 1 + Math.floor(Math.random() * 3));
              for (let h = 0; h < herdCount; h++) {
                const ox = Math.floor(sx + (h === 0 ? 0 : (Math.random() - 0.5) * 4));
                const oz = Math.floor(sz + (h === 0 ? 0 : (Math.random() - 0.5) * 4));
                const oy = world.getSurfaceHeight(ox, oz);
                if (!isSolidBlock(ox, oy + 1, oz) && !isSolidBlock(ox, oy + 2, oz)) {
                  spawnMobEntity(kind, ox + 0.5, oy + 1.02, oz + 0.5, Math.random() < 0.16);
                }
              }
            }
          }
        }

        const mobCollidesAt = (mx: number, my: number, mz: number, r: number, h: number): boolean => {
          const eps = 0.02;
          const minX = Math.floor(mx - r + eps);
          const maxX = Math.floor(mx + r - eps);
          const minY = Math.floor(my + eps);
          const maxY = Math.floor(my + h - eps);
          const minZ = Math.floor(mz - r + eps);
          const maxZ = Math.floor(mz + r - eps);
          for (let by = minY; by <= maxY; by++) {
            for (let bz = minZ; bz <= maxZ; bz++) {
              for (let bx = minX; bx <= maxX; bx++) {
                if (isSolidBlock(bx, by, bz)) return true;
              }
            }
          }
          return false;
        };

        const heldNow = propsRef.current.heldItemId;
        for (let i = mobs.length - 1; i >= 0; i--) {
          const mob = mobs[i];
          const spec = MOB_SPECS[mob.kind];
          const distToPlayer = Math.hypot(mob.x - p.x, mob.z - p.z);

          // Despawn far mobs so world stays populated near player
          if (distToPlayer > 68) {
            removeMobAt(i);
            continue;
          }

          if (mob.hurtTimer > 0) mob.hurtTimer = Math.max(0, mob.hurtTimer - dt);
          mob.rig.setHurtFlash(mob.hurtTimer > 0);
          if (mob.panicTimer > 0) mob.panicTimer = Math.max(0, mob.panicTimer - dt);
          if (mob.breedCooldown > 0) mob.breedCooldown = Math.max(0, mob.breedCooldown - dt);

          // Baby growth timer -> adult
          if (mob.isBaby) {
            mob.growTimer -= dt;
            if (mob.growTimer <= 0) {
              mob.isBaby = false;
              mob.rig.setBabyVisual(false);
              spawnHeartParticles(mob.x, mob.y, mob.z, 5);
              voxelAudio.playMobSound(mob.kind, false);
            }
          }

          // Love mode & Breeding
          let mateMob: MobEntity | null = null;
          if (mob.loveTimer > 0) {
            mob.loveTimer = Math.max(0, mob.loveTimer - dt);
            mob.heartEmitTimer -= dt;
            if (mob.heartEmitTimer <= 0) {
              mob.heartEmitTimer = 0.65;
              spawnHeartParticles(mob.x, mob.y, mob.z, 2);
            }
            for (let j = 0; j < mobs.length; j++) {
              if (i === j) continue;
              const other = mobs[j];
              if (other.kind === mob.kind && !other.isBaby && other.loveTimer > 0) {
                const d = Math.hypot(other.x - mob.x, other.z - mob.z);
                if (d < 2.2 && mobs.length < MOB_CAP + 4) {
                  // Produce baby between parents
                  const bx = (mob.x + other.x) * 0.5;
                  const by = Math.max(mob.y, other.y) + 0.1;
                  const bz = (mob.z + other.z) * 0.5;
                  spawnMobEntity(mob.kind, bx, by, bz, true);
                  mob.loveTimer = 0;
                  other.loveTimer = 0;
                  mob.breedCooldown = 35;
                  other.breedCooldown = 35;
                  spawnHeartParticles(bx, by, bz, 8);
                  voxelAudio.playHeart();
                  voxelAudio.playMobSound(mob.kind, true);
                  if (propsRef.current.gameMode === 'survival') {
                    propsRef.current.onMobBred?.(mob.kind);
                  }
                  mateMob = null;
                  break;
                } else if (d < 12) {
                  mateMob = other;
                  break;
                }
              }
            }
          }

          // AI Steering
          const attractedToPlayer =
            mob.panicTimer <= 0 &&
            !mateMob &&
            distToPlayer < 10.5 &&
            distToPlayer > 1.9 &&
            isBreedingFoodFor(mob.kind, heldNow);

          let desiredVx = 0;
          let desiredVz = 0;
          if (mateMob) {
            const dx = mateMob.x - mob.x;
            const dz = mateMob.z - mob.z;
            const d = Math.hypot(dx, dz) || 1;
            const sp = spec.walkSpeed * 1.15;
            desiredVx = (dx / d) * sp;
            desiredVz = (dz / d) * sp;
          } else if (attractedToPlayer) {
            const dx = p.x - mob.x;
            const dz = p.z - mob.z;
            const d = Math.hypot(dx, dz) || 1;
            const sp = spec.walkSpeed * 1.12;
            desiredVx = (dx / d) * sp;
            desiredVz = (dz / d) * sp;
          } else if (mob.panicTimer > 0) {
            desiredVx = mob.moveDirX * spec.fleeSpeed;
            desiredVz = mob.moveDirZ * spec.fleeSpeed;
          } else {
            mob.aiTimer -= dt;
            if (mob.aiTimer <= 0) {
              mob.moving = Math.random() < 0.62;
              if (mob.moving) {
                const a = Math.random() * Math.PI * 2;
                mob.moveDirX = Math.sin(a);
                mob.moveDirZ = Math.cos(a);
                mob.aiTimer = 1.6 + Math.random() * 2.8;
              } else {
                mob.moveDirX = 0;
                mob.moveDirZ = 0;
                mob.aiTimer = 1.5 + Math.random() * 2.5;
              }
            }
            if (mob.moving) {
              const babyBoost = mob.isBaby ? 1.18 : 1.0;
              desiredVx = mob.moveDirX * spec.walkSpeed * babyBoost;
              desiredVz = mob.moveDirZ * spec.walkSpeed * babyBoost;
            }
          }

          mob.vx = THREE.MathUtils.damp(mob.vx, desiredVx, 8, dt);
          mob.vz = THREE.MathUtils.damp(mob.vz, desiredVz, 8, dt);

          const mobScale = mob.isBaby ? 0.62 : 1.0;
          const r = spec.hitboxRadius * 0.62 * mobScale;
          const h = spec.hitboxHeight * mobScale;
          const mobBlockDef = getItemDef(
            world.getBlock(Math.floor(mob.x), Math.floor(mob.y + 0.2), Math.floor(mob.z)),
          );
          const inWaterMob = Boolean(mobBlockDef?.liquid);

          if (inWaterMob) {
            mob.vy = Math.max(mob.vy - 10 * dt, 2.2);
          } else {
            mob.vy -= 24 * dt;
          }

          // Horizontal step + auto-jump over 1-block ledges
          let blockedXZ = false;
          const nx = mob.x + mob.vx * dt;
          if (!mobCollidesAt(nx, mob.y, mob.z, r, h)) {
            mob.x = nx;
          } else {
            blockedXZ = true;
            mob.vx = 0;
          }

          const nz = mob.z + mob.vz * dt;
          if (!mobCollidesAt(mob.x, mob.y, nz, r, h)) {
            mob.z = nz;
          } else {
            blockedXZ = true;
            mob.vz = 0;
          }

          if (blockedXZ && mob.onGround && (Math.abs(desiredVx) > 0.1 || Math.abs(desiredVz) > 0.1)) {
            mob.vy = 6.9;
            mob.onGround = false;
          }

          const ny = mob.y + mob.vy * dt;
          if (!mobCollidesAt(mob.x, ny, mob.z, r, h)) {
            mob.y = ny;
            mob.onGround = false;
          } else {
            if (mob.vy < 0) {
              mob.y = Math.floor(ny + 0.02) + 1;
              mob.onGround = true;
            }
            mob.vy = 0;
          }

          if (mob.y < -10) {
            removeMobAt(i);
            continue;
          }

          const hSpeed = Math.hypot(mob.vx, mob.vz);
          if (hSpeed > 0.18) {
            const targetYaw = Math.atan2(mob.vx, mob.vz);
            let diff = targetYaw - mob.yaw;
            while (diff > Math.PI) diff -= Math.PI * 2;
            while (diff < -Math.PI) diff += Math.PI * 2;
            mob.yaw += diff * Math.min(1, dt * 10);
          }

          mob.rig.group.position.set(mob.x, mob.y, mob.z);
          mob.rig.group.rotation.y = mob.yaw;
          mob.rig.animate(dt, hSpeed);

          // Ambient soft animal sounds nearby
          mob.soundTimer -= dt;
          if (mob.soundTimer <= 0) {
            mob.soundTimer = 8 + Math.random() * 10;
            if (distToPlayer < 17) {
              voxelAudio.playMobSound(mob.kind, mob.isBaby);
            }
          }
        }

        // 6. Remote Player Smooth Interpolation
        for (const entry of remoteRigs.values()) {
          const dx = entry.targetX - entry.rig.group.position.x;
          const dz = entry.targetZ - entry.rig.group.position.z;
          const distSpeed = Math.hypot(dx, dz) * 8;
          entry.rig.group.position.x = THREE.MathUtils.damp(entry.rig.group.position.x, entry.targetX, 10, dt);
          entry.rig.group.position.y = THREE.MathUtils.damp(entry.rig.group.position.y, entry.targetY, 10, dt);
          entry.rig.group.position.z = THREE.MathUtils.damp(entry.rig.group.position.z, entry.targetZ, 10, dt);
          entry.rig.group.rotation.y = THREE.MathUtils.damp(
            entry.rig.group.rotation.y,
            entry.targetYaw + Math.PI,
            10,
            dt,
          );
          entry.rig.animate(dt, distSpeed, false);
        }

        // 6b. Cellular Automata Flowing Fluid Simulation (Water, Lava & Custom Mod Liquids)
        if (fluidQueue.size > 0 && now - lastFluidTickMs >= 70) {
          lastFluidTickMs = now;
          const dueKeys: string[] = [];
          for (const [fk, dueMs] of fluidQueue.entries()) {
            if (dueMs <= now) {
              dueKeys.push(fk);
              if (dueKeys.length >= 44) break;
            }
          }

          const tryFlowInto = (
            tx: number,
            ty: number,
            tz: number,
            liquidId: string,
            srcDef: ReturnType<typeof getItemDef>,
            nextDepth: number,
            flowDelay: number,
          ): 'placed' | 'reacted' | 'blocked' => {
            const tid = world.getBlock(tx, ty, tz);
            if (tid === 'air') {
              setWorldBlock(tx, ty, tz, liquidId, false);
              fluidDepthMap.set(fKey(tx, ty, tz), nextDepth);
              scheduleFluidCell(tx, ty, tz, flowDelay);
              return 'placed';
            }
            const tDef = getItemDef(tid);
            if (tDef?.nonSolid && !tDef.liquid) {
              setWorldBlock(tx, ty, tz, liquidId, false);
              fluidDepthMap.set(fKey(tx, ty, tz), nextDepth);
              scheduleFluidCell(tx, ty, tz, flowDelay);
              return 'placed';
            }
            // Water vs Lava (or Safe vs Harmful Liquid) Reaction -> Cobblestone / Obsidian
            if (tDef?.liquid && tid !== liquidId) {
              const srcHarm = Boolean(srcDef?.liquidHarmful);
              const tgtHarm = Boolean(tDef.liquidHarmful);
              if (srcHarm !== tgtHarm) {
                const tk = fKey(tx, ty, tz);
                const tDepth = fluidDepthMap.get(tk) ?? 0;
                const stoneId = tgtHarm && tDepth === 0 ? 'obsidian' : 'cobblestone';
                setWorldBlock(tx, ty, tz, stoneId, false);
                fluidDepthMap.delete(tk);
                return 'reacted';
              }
            }
            return 'blocked';
          };

          for (const fk of dueKeys) {
            fluidQueue.delete(fk);
            const [fxStr, fyStr, fzStr] = fk.split(',');
            const fx = parseInt(fxStr, 10);
            const fy = parseInt(fyStr, 10);
            const fz = parseInt(fzStr, 10);
            if (Math.abs(fx - p.x) > 56 || Math.abs(fz - p.z) > 56) continue;

            const lid = world.getBlock(fx, fy, fz);
            const ldef = getItemDef(lid);
            if (!ldef?.liquid) {
              fluidDepthMap.delete(fk);
              continue;
            }

            const curDepth = fluidDepthMap.get(fk);
            const depth = curDepth ?? 0;
            const maxSpread = ldef.liquidSpread ?? (lid === 'lava' ? 3 : 5);
            const flowDelay = ldef.liquidFlowDelayMs ?? (lid === 'lava' ? 520 : 170);

            // Clean up player-created flowing tail (`depth > 0`) if its parent source was scooped or blocked
            if (curDepth !== undefined && curDepth > 0) {
              const aboveId = fy + 1 < WORLD_HEIGHT ? world.getBlock(fx, fy + 1, fz) : 'air';
              let hasParent = aboveId === lid;
              if (!hasParent) {
                const horiz = [
                  [1, 0],
                  [-1, 0],
                  [0, 1],
                  [0, -1],
                ];
                for (const [dx, dz] of horiz) {
                  if (world.getBlock(fx + dx, fy, fz + dz) === lid) {
                    const nd = fluidDepthMap.get(fKey(fx + dx, fy, fz + dz)) ?? 0;
                    if (nd < curDepth) {
                      hasParent = true;
                      break;
                    }
                  }
                }
              }
              if (!hasParent) {
                setWorldBlock(fx, fy, fz, 'air', false);
                fluidDepthMap.delete(fk);
                notifyNeighborFluids(fx, fy, fz);
                continue;
              }
            }

            // 1. Prioritize flowing downward (infinite fall depth resets to 1 so it fans out on landing)
            let spreadSideways = false;
            if (fy > 1) {
              const belowId = world.getBlock(fx, fy - 1, fz);
              const belowDef = getItemDef(belowId);
              if (belowId === 'air' || (belowDef?.nonSolid && !belowDef.liquid)) {
                tryFlowInto(fx, fy - 1, fz, lid, ldef, 1, flowDelay);
                // Sources spread sideways as well if resting, or wait until falling lands;
                // spreading only downwards while suspended prevents floating liquid umbrellas
                if (depth > 0) continue;
              } else if (belowId === lid) {
                if (depth > 0) continue;
                spreadSideways = true;
              } else {
                const res =
                  belowDef?.liquid && belowId !== lid
                    ? tryFlowInto(fx, fy - 1, fz, lid, ldef, 1, flowDelay)
                    : 'blocked';
                if (res === 'blocked') spreadSideways = true;
              }
            }

            // 2. Spread horizontally onto solid ground within maxSpread
            if (spreadSideways && depth < maxSpread) {
              const cardinals = [
                [1, 0],
                [-1, 0],
                [0, 1],
                [0, -1],
              ];
              for (const [dx, dz] of cardinals) {
                const nx = fx + dx;
                const nz = fz + dz;
                const nid = world.getBlock(nx, fy, nz);
                if (nid === lid) {
                  const nk = fKey(nx, fy, nz);
                  const existingD = fluidDepthMap.get(nk);
                  if (existingD !== undefined && existingD > depth + 1) {
                    fluidDepthMap.set(nk, depth + 1);
                    scheduleFluidCell(nx, fy, nz, flowDelay);
                  }
                } else {
                  tryFlowInto(nx, fy, nz, lid, ldef, depth + 1, flowDelay);
                }
              }
            }
          }
        }

        // 7. Chunk Streaming & Dirty Chunk Rebuilds (cached chunk boundary check + 5ms frame budget)
        const pcx = Math.floor(p.x / CHUNK_SIZE);
        const pcz = Math.floor(p.z / CHUNK_SIZE);
        if (pcx !== lastWantedPcx || pcz !== lastWantedPcz) {
          lastWantedPcx = pcx;
          lastWantedPcz = pcz;
          wantedSet.clear();
          for (let dx = -renderRadius; dx <= renderRadius; dx++) {
            for (let dz = -renderRadius; dz <= renderRadius; dz++) {
              const key = chunkKey(pcx + dx, pcz + dz);
              wantedSet.add(key);
              if (!chunkGroups.has(key)) {
                rebuildQueueRef.current.add(key);
              }
            }
          }
          // Unload far chunks
          for (const [k, cg] of chunkGroups.entries()) {
            if (!wantedSet.has(k)) {
              if (cg.opaqueMesh) cg.opaqueMesh.geometry.dispose();
              if (cg.transMesh) cg.transMesh.geometry.dispose();
              scene.remove(cg.group);
              chunkGroups.delete(k);
            }
          }
        }

        // Build nearest pending chunks within a strict 5ms per-frame time budget
        if (rebuildQueueRef.current.size > 0) {
          sortedPending.length = 0;
          for (const k of rebuildQueueRef.current) {
            if (!wantedSet.has(k)) {
              rebuildQueueRef.current.delete(k);
              continue;
            }
            const [cxStr, czStr] = k.split(',');
            const cx = parseInt(cxStr, 10);
            const cz = parseInt(czStr, 10);
            sortedPending.push({
              k,
              cx,
              cz,
              distSq: (cx - pcx) * (cx - pcx) + (cz - pcz) * (cz - pcz),
            });
          }
          sortedPending.sort((a, b) => a.distSq - b.distSq);
          const budgetEnd = performance.now() + 5.0;
          const limit = Math.min(3, sortedPending.length);
          for (let i = 0; i < limit; i++) {
            if (i > 0 && performance.now() > budgetEnd) break;
            const item = sortedPending[i];
            rebuildQueueRef.current.delete(item.k);
            buildChunk(item.cx, item.cz);
          }
        }

        // 8. Throttled HUD & Multiplayer Sync Callback
        hudSyncTimer += dt;
        if (hudSyncTimer >= 0.16) {
          hudSyncTimer = 0;
          propsRef.current.onPositionUpdate({
            x: p.x,
            y: p.y,
            z: p.z,
            yaw: p.yaw,
            pitch: p.pitch,
            flying: p.flying,
            thirdPerson: p.thirdPerson,
            biome: world.getBiome(Math.floor(p.x), Math.floor(p.z)),
          });
          propsRef.current.onTimeUpdate(Math.round(timeRef.current));
          propsRef.current.onWeatherChange?.(
            activeWeatherRef.current,
            weatherModeRef.current,
            wetnessRef.current,
          );
        }

        renderer.render(scene, camera);
        if (isSoftwareGl) afterDraw(tick);
        else frameId = requestAnimationFrame(tick);
      }

      tick();

      return () => {
        disposed = true;
        cancelAnimationFrame(frameId);
        clearTimeout(frameId);
        window.removeEventListener('keydown', onKeyDown);
        window.removeEventListener('keyup', onKeyUp);
        window.removeEventListener('blur', onWindowBlur);
        window.removeEventListener('mousemove', onMouseMove);
        renderer.domElement.removeEventListener('mousedown', onMouseDown);
        window.removeEventListener('mouseup', onMouseUp);
        renderer.domElement.removeEventListener('contextmenu', onContextMenu);
        document.removeEventListener('pointerlockchange', onPointerLockChange);
        renderer.domElement.removeEventListener('webglcontextlost', onContextLost);
        window.removeEventListener('resize', onResize);

        if (document.pointerLockElement === renderer.domElement) {
          document.exitPointerLock();
        }

        for (const cg of chunkGroups.values()) {
          if (cg.opaqueMesh) cg.opaqueMesh.geometry.dispose();
          if (cg.transMesh) cg.transMesh.geometry.dispose();
        }
        for (const entry of remoteRigs.values()) {
          entry.rig.dispose();
        }
        for (const mob of mobs) {
          mob.rig.dispose();
        }
        fpArm.dispose();
        selfRig.dispose();
        selGeo.dispose();
        selMat.dispose();
        sunGeo.dispose();
        sunMat.dispose();
        moonGeo.dispose();
        moonMat.dispose();
        cloudGeo.dispose();
        cloudMat.dispose();
        rainGeo.dispose();
        rainMat.dispose();
        splashGeo.dispose();
        splashMat.dispose();
        snowGeo.dispose();
        snowMat.dispose();
        snowTex.dispose();
        crackGeo.dispose();
        crackMat.dispose();
        particleGeo.dispose();
        particlePool.forEach((pt) => pt.mat.dispose());
        projGeo.dispose();
        projPool.forEach((pr) => pr.mat.dispose());
        lightningGeo.dispose();
        lightningPool.forEach((lb) => lb.mat.dispose());
        heartGeo.dispose();
        heartMat.dispose();
        opaqueMat.dispose();
        transMat.dispose();
        setCottonLuaWorldBridge(null);
        setOnPngTextureReadyCallback(null);
        renderer.dispose();
        if (renderer.domElement.parentNode === container) {
          container.removeChild(renderer.domElement);
        }
      };
    }, []);

    return <div ref={mountRef} className="w-full h-full relative" />;
  },
);
