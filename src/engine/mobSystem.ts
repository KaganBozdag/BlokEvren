import * as THREE from 'three';
import { getItemDef } from '../data/blocksAndRecipes';
import { MobKind } from '../types/game';

export interface MobSpec {
  kind: MobKind;
  name: string;
  babyName: string;
  maxHp: number;
  walkSpeed: number;
  fleeSpeed: number;
  hitboxRadius: number;
  hitboxHeight: number;
}

export const MOB_SPECS: Record<MobKind, MobSpec> = {
  cow: {
    kind: 'cow',
    name: 'İnek',
    babyName: 'Yavru İnek',
    maxHp: 10,
    walkSpeed: 2.0,
    fleeSpeed: 4.3,
    hitboxRadius: 0.58,
    hitboxHeight: 1.38,
  },
  pig: {
    kind: 'pig',
    name: 'Domuz',
    babyName: 'Yavru Domuz',
    maxHp: 8,
    walkSpeed: 2.25,
    fleeSpeed: 4.6,
    hitboxRadius: 0.5,
    hitboxHeight: 0.96,
  },
  sheep: {
    kind: 'sheep',
    name: 'Koyun',
    babyName: 'Yavru Koyun',
    maxHp: 8,
    walkSpeed: 2.1,
    fleeSpeed: 4.4,
    hitboxRadius: 0.54,
    hitboxHeight: 1.26,
  },
};

export function getMobLabel(kind: MobKind, isBaby: boolean): string {
  const spec = MOB_SPECS[kind];
  return isBaby ? spec.babyName : spec.name;
}

export function getMobMaxHp(kind: MobKind): number {
  return MOB_SPECS[kind].maxHp;
}

export function isBreedingFoodFor(kind: MobKind, itemId: string): boolean {
  if (kind === 'cow' || kind === 'sheep') {
    return itemId === 'wheat' || itemId === 'hay_bale' || itemId === 'bread';
  }
  return (
    itemId === 'apple' ||
    itemId === 'melon_slice' ||
    itemId === 'wheat' ||
    itemId === 'bread'
  );
}

export function getMobDrops(kind: MobKind, isBaby: boolean): { id: string; count: number }[] {
  if (isBaby) return [];
  if (kind === 'cow') {
    return [
      { id: 'raw_beef', count: 1 + Math.floor(Math.random() * 3) },
      { id: 'leather', count: 1 + Math.floor(Math.random() * 2) },
    ];
  }
  if (kind === 'pig') {
    return [{ id: 'raw_porkchop', count: 1 + Math.floor(Math.random() * 3) }];
  }
  return [
    { id: 'white_wool', count: 1 },
    { id: 'raw_mutton', count: 1 + Math.floor(Math.random() * 2) },
  ];
}

export function getMeleeDamage(heldItemId: string): number {
  const def = getItemDef(heldItemId);
  if (!def || !def.toolType) return 1.5;
  const tier = def.toolTier || 1;
  if (def.toolType === 'sword') return 3.5 + tier * 1.2;
  if (def.toolType === 'axe') return 2.5 + tier;
  if (def.toolType === 'pickaxe' || def.toolType === 'shovel') return 1.8 + tier * 0.6;
  return 1.5;
}

export interface MobVisualRig {
  group: THREE.Group;
  headPivot: THREE.Group;
  setBabyVisual: (isBaby: boolean) => void;
  setHurtFlash: (active: boolean) => void;
  animate: (dt: number, speed: number) => void;
  dispose: () => void;
}

export interface MobEntity {
  id: string;
  kind: MobKind;
  isBaby: boolean;
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  yaw: number;
  hp: number;
  maxHp: number;
  onGround: boolean;
  rig: MobVisualRig;
  aiTimer: number;
  moveDirX: number;
  moveDirZ: number;
  moving: boolean;
  hurtTimer: number;
  panicTimer: number;
  loveTimer: number;
  heartEmitTimer: number;
  breedCooldown: number;
  growTimer: number;
  soundTimer: number;
}

function makePixelTexture(
  size: number,
  draw: (ctx: CanvasRenderingContext2D, size: number) => void,
  textures: THREE.Texture[],
): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  draw(ctx, size);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  tex.generateMipmaps = false;
  tex.needsUpdate = true;
  textures.push(tex);
  return tex;
}

export function createMobVisualRig(kind: MobKind, initialBaby: boolean): MobVisualRig {
  const group = new THREE.Group();
  const textures: THREE.Texture[] = [];
  const materials: THREE.MeshStandardMaterial[] = [];
  const geometries: THREE.BufferGeometry[] = [];

  const makeMat = (texOrColor: THREE.Texture | number, roughness = 0.85) => {
    const mat =
      typeof texOrColor === 'number'
        ? new THREE.MeshStandardMaterial({ color: texOrColor, roughness, metalness: 0.03 })
        : new THREE.MeshStandardMaterial({ map: texOrColor, roughness, metalness: 0.03 });
    materials.push(mat);
    return mat;
  };

  const headPivot = new THREE.Group();
  let legFL = new THREE.Group();
  let legFR = new THREE.Group();
  let legBL = new THREE.Group();
  let legBR = new THREE.Group();

  const createLegPivot = (
    geo: THREE.BufferGeometry,
    mat: THREE.Material,
    x: number,
    y: number,
    z: number,
  ) => {
    const pivot = new THREE.Group();
    pivot.position.set(x, y, z);
    const mesh = new THREE.Mesh(geo, mat);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    pivot.add(mesh);
    group.add(pivot);
    return pivot;
  };

  if (kind === 'cow') {
    const hideTex = makePixelTexture(
      16,
      (ctx) => {
        ctx.fillStyle = '#5c3c24';
        ctx.fillRect(0, 0, 16, 16);
        // Subtle fur speckles
        ctx.fillStyle = '#4e321d';
        ctx.fillRect(2, 1, 2, 2);
        ctx.fillRect(10, 12, 2, 2);
        // Cream/white cow patches
        ctx.fillStyle = '#f1efe8';
        ctx.fillRect(1, 3, 5, 6);
        ctx.fillRect(4, 4, 4, 4);
        ctx.fillRect(10, 1, 5, 5);
        ctx.fillRect(8, 9, 6, 5);
        ctx.fillStyle = '#d6d2c4';
        ctx.fillRect(2, 4, 2, 2);
        ctx.fillRect(11, 2, 2, 2);
      },
      textures,
    );
    const faceTex = makePixelTexture(
      16,
      (ctx) => {
        ctx.fillStyle = '#5c3c24';
        ctx.fillRect(0, 0, 16, 16);
        // Forehead blaze
        ctx.fillStyle = '#f1efe8';
        ctx.fillRect(6, 0, 4, 6);
        ctx.fillRect(5, 2, 6, 3);
        // Eyes
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(1, 5, 3, 2);
        ctx.fillRect(12, 5, 3, 2);
        ctx.fillStyle = '#111827';
        ctx.fillRect(2, 5, 2, 2);
        ctx.fillRect(12, 5, 2, 2);
        // Snout muzzle
        ctx.fillStyle = '#d9b5a6';
        ctx.fillRect(2, 9, 12, 7);
        ctx.fillStyle = '#c49684';
        ctx.fillRect(2, 14, 12, 2);
        // Nostrils
        ctx.fillStyle = '#4a2e23';
        ctx.fillRect(4, 11, 2, 2);
        ctx.fillRect(10, 11, 2, 2);
      },
      textures,
    );

    const hideMat = makeMat(hideTex, 0.88);
    const faceMat = makeMat(faceTex, 0.82);
    const hornMat = makeMat(0xe5e0d3, 0.7);
    const udderMat = makeMat(0xf4a9b8, 0.78);
    const hoofMat = makeMat(0x3f2918, 0.9);

    // Legs (height 0.56)
    const legGeo = new THREE.BoxGeometry(0.22, 0.56, 0.22);
    legGeo.translate(0, -0.28, 0);
    geometries.push(legGeo);
    legFL = createLegPivot(legGeo, hoofMat, -0.21, 0.56, 0.39);
    legFR = createLegPivot(legGeo, hoofMat, 0.21, 0.56, 0.39);
    legBL = createLegPivot(legGeo, hideMat, -0.21, 0.56, -0.39);
    legBR = createLegPivot(legGeo, hideMat, 0.21, 0.56, -0.39);

    // Body
    const bodyGeo = new THREE.BoxGeometry(0.68, 0.58, 1.06);
    geometries.push(bodyGeo);
    const body = new THREE.Mesh(bodyGeo, hideMat);
    body.position.set(0, 0.85, 0);
    body.castShadow = true;
    body.receiveShadow = true;
    group.add(body);

    // Udder
    const udderGeo = new THREE.BoxGeometry(0.28, 0.1, 0.34);
    geometries.push(udderGeo);
    const udder = new THREE.Mesh(udderGeo, udderMat);
    udder.position.set(0, 0.52, -0.22);
    group.add(udder);

    // Head
    headPivot.position.set(0, 1.04, 0.52);
    const headGeo = new THREE.BoxGeometry(0.48, 0.48, 0.44);
    geometries.push(headGeo);
    const headMesh = new THREE.Mesh(headGeo, [
      hideMat,
      hideMat,
      hideMat,
      hideMat,
      faceMat,
      hideMat,
    ]);
    headMesh.position.set(0, 0.06, 0.22);
    headMesh.castShadow = true;
    headPivot.add(headMesh);

    const hornGeo = new THREE.BoxGeometry(0.08, 0.18, 0.08);
    geometries.push(hornGeo);
    const hornL = new THREE.Mesh(hornGeo, hornMat);
    hornL.position.set(-0.24, 0.31, 0.14);
    const hornR = new THREE.Mesh(hornGeo, hornMat);
    hornR.position.set(0.24, 0.31, 0.14);
    headPivot.add(hornL, hornR);
    group.add(headPivot);
  } else if (kind === 'pig') {
    const skinTex = makePixelTexture(
      16,
      (ctx) => {
        ctx.fillStyle = '#f3a4ae';
        ctx.fillRect(0, 0, 16, 16);
        ctx.fillStyle = '#e88b98';
        ctx.fillRect(2, 2, 3, 2);
        ctx.fillRect(10, 9, 4, 3);
        ctx.fillStyle = '#f8bcc4';
        ctx.fillRect(6, 5, 3, 3);
      },
      textures,
    );
    const faceTex = makePixelTexture(
      16,
      (ctx) => {
        ctx.fillStyle = '#f3a4ae';
        ctx.fillRect(0, 0, 16, 16);
        // Eyes at outer sides (authentic MC pig eyes)
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 6, 4, 2);
        ctx.fillRect(12, 6, 4, 2);
        ctx.fillStyle = '#111827';
        ctx.fillRect(0, 6, 2, 2);
        ctx.fillRect(14, 6, 2, 2);
        ctx.fillStyle = '#e88b98';
        ctx.fillRect(4, 2, 8, 2);
      },
      textures,
    );
    const snoutTex = makePixelTexture(
      8,
      (ctx) => {
        ctx.fillStyle = '#f7b7c0';
        ctx.fillRect(0, 0, 8, 8);
        ctx.fillStyle = '#9d434f';
        ctx.fillRect(1, 3, 2, 3);
        ctx.fillRect(5, 3, 2, 3);
      },
      textures,
    );

    const skinMat = makeMat(skinTex, 0.82);
    const faceMat = makeMat(faceTex, 0.8);
    const snoutMat = makeMat(snoutTex, 0.78);

    // Short legs (height 0.36)
    const legGeo = new THREE.BoxGeometry(0.2, 0.36, 0.2);
    legGeo.translate(0, -0.18, 0);
    geometries.push(legGeo);
    legFL = createLegPivot(legGeo, skinMat, -0.18, 0.36, 0.31);
    legFR = createLegPivot(legGeo, skinMat, 0.18, 0.36, 0.31);
    legBL = createLegPivot(legGeo, skinMat, -0.18, 0.36, -0.31);
    legBR = createLegPivot(legGeo, skinMat, 0.18, 0.36, -0.31);

    // Body
    const bodyGeo = new THREE.BoxGeometry(0.58, 0.48, 0.88);
    geometries.push(bodyGeo);
    const body = new THREE.Mesh(bodyGeo, skinMat);
    body.position.set(0, 0.6, 0);
    body.castShadow = true;
    body.receiveShadow = true;
    group.add(body);

    // Head
    headPivot.position.set(0, 0.68, 0.42);
    const headGeo = new THREE.BoxGeometry(0.46, 0.44, 0.42);
    geometries.push(headGeo);
    const headMesh = new THREE.Mesh(headGeo, [
      skinMat,
      skinMat,
      skinMat,
      skinMat,
      faceMat,
      skinMat,
    ]);
    headMesh.position.set(0, 0.04, 0.21);
    headMesh.castShadow = true;
    headPivot.add(headMesh);

    const snoutGeo = new THREE.BoxGeometry(0.24, 0.16, 0.1);
    geometries.push(snoutGeo);
    const snoutMesh = new THREE.Mesh(snoutGeo, [
      skinMat,
      skinMat,
      skinMat,
      skinMat,
      snoutMat,
      skinMat,
    ]);
    snoutMesh.position.set(0, -0.04, 0.46);
    headPivot.add(snoutMesh);
    group.add(headPivot);
  } else {
    // Sheep
    const woolTex = makePixelTexture(
      16,
      (ctx) => {
        ctx.fillStyle = '#f8fafc';
        ctx.fillRect(0, 0, 16, 16);
        ctx.fillStyle = '#e2e8f0';
        ctx.fillRect(1, 2, 3, 3);
        ctx.fillRect(9, 1, 4, 2);
        ctx.fillRect(5, 8, 4, 3);
        ctx.fillRect(11, 11, 3, 3);
        ctx.fillStyle = '#cbd5e1';
        ctx.fillRect(2, 12, 2, 2);
        ctx.fillRect(12, 5, 2, 2);
      },
      textures,
    );
    const faceTex = makePixelTexture(
      16,
      (ctx) => {
        ctx.fillStyle = '#e8cbb1';
        ctx.fillRect(0, 0, 16, 16);
        // Fluffy wool hairline
        ctx.fillStyle = '#f8fafc';
        ctx.fillRect(0, 0, 16, 4);
        ctx.fillRect(0, 4, 2, 2);
        ctx.fillRect(14, 4, 2, 2);
        // Classic wide sheep eyes
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(2, 6, 4, 2);
        ctx.fillRect(10, 6, 4, 2);
        ctx.fillStyle = '#111827';
        ctx.fillRect(2, 6, 2, 2);
        ctx.fillRect(12, 6, 2, 2);
        // Pink nose/mouth
        ctx.fillStyle = '#e2959d';
        ctx.fillRect(6, 11, 4, 3);
      },
      textures,
    );

    const woolMat = makeMat(woolTex, 0.95);
    const skinMat = makeMat(0xdfc0a5, 0.85);
    const faceMat = makeMat(faceTex, 0.85);

    // Legs (height 0.5)
    const legGeo = new THREE.BoxGeometry(0.18, 0.5, 0.18);
    legGeo.translate(0, -0.25, 0);
    geometries.push(legGeo);
    legFL = createLegPivot(legGeo, skinMat, -0.19, 0.5, 0.34);
    legFR = createLegPivot(legGeo, skinMat, 0.19, 0.5, 0.34);
    legBL = createLegPivot(legGeo, skinMat, -0.19, 0.5, -0.34);
    legBR = createLegPivot(legGeo, skinMat, 0.19, 0.5, -0.34);

    // Fluffy Wool Body
    const bodyGeo = new THREE.BoxGeometry(0.66, 0.58, 0.98);
    geometries.push(bodyGeo);
    const body = new THREE.Mesh(bodyGeo, woolMat);
    body.position.set(0, 0.79, 0);
    body.castShadow = true;
    body.receiveShadow = true;
    group.add(body);

    // Head
    headPivot.position.set(0, 0.96, 0.46);
    const collarGeo = new THREE.BoxGeometry(0.46, 0.44, 0.22);
    geometries.push(collarGeo);
    const collarMesh = new THREE.Mesh(collarGeo, woolMat);
    collarMesh.position.set(0, 0.05, 0.1);
    collarMesh.castShadow = true;
    headPivot.add(collarMesh);

    const headGeo = new THREE.BoxGeometry(0.38, 0.36, 0.34);
    geometries.push(headGeo);
    const headMesh = new THREE.Mesh(headGeo, [
      skinMat,
      skinMat,
      woolMat,
      skinMat,
      faceMat,
      skinMat,
    ]);
    headMesh.position.set(0, 0.04, 0.25);
    headMesh.castShadow = true;
    headPivot.add(headMesh);
    group.add(headPivot);
  }

  const setBabyVisual = (isBaby: boolean) => {
    if (isBaby) {
      group.scale.setScalar(0.56);
      headPivot.scale.setScalar(1.56);
    } else {
      group.scale.setScalar(1.0);
      headPivot.scale.setScalar(1.0);
    }
  };
  setBabyVisual(initialBaby);

  let walkCycle = Math.random() * Math.PI * 2;
  let hurtActive = false;

  const setHurtFlash = (active: boolean) => {
    if (hurtActive === active) return;
    hurtActive = active;
    for (const mat of materials) {
      mat.emissive.setHex(active ? 0xdc2626 : 0x000000);
      mat.emissiveIntensity = active ? 0.58 : 0;
    }
  };

  const animate = (dt: number, speed: number) => {
    if (speed > 0.2) {
      walkCycle += dt * (4.2 + speed * 2.4);
      const amp = Math.min(0.65, speed * 0.24);
      legFL.rotation.x = Math.sin(walkCycle) * amp;
      legBR.rotation.x = Math.sin(walkCycle) * amp;
      legFR.rotation.x = -Math.sin(walkCycle) * amp;
      legBL.rotation.x = -Math.sin(walkCycle) * amp;
      headPivot.rotation.x = THREE.MathUtils.damp(
        headPivot.rotation.x,
        Math.sin(walkCycle * 0.5) * 0.06,
        10,
        dt,
      );
    } else {
      walkCycle += dt * 1.4;
      legFL.rotation.x = THREE.MathUtils.damp(legFL.rotation.x, 0, 12, dt);
      legFR.rotation.x = THREE.MathUtils.damp(legFR.rotation.x, 0, 12, dt);
      legBL.rotation.x = THREE.MathUtils.damp(legBL.rotation.x, 0, 12, dt);
      legBR.rotation.x = THREE.MathUtils.damp(legBR.rotation.x, 0, 12, dt);
      // Subtle grazing / idle head bob
      const idleNod = Math.sin(walkCycle) > 0.65 ? 0.28 : 0.03;
      headPivot.rotation.x = THREE.MathUtils.damp(headPivot.rotation.x, idleNod, 4, dt);
    }
  };

  const dispose = () => {
    geometries.forEach((g) => g.dispose());
    materials.forEach((m) => m.dispose());
    textures.forEach((t) => t.dispose());
  };

  return { group, headPivot, setBabyVisual, setHurtFlash, animate, dispose };
}

export interface MobRaycastHit {
  mob: MobEntity;
  dist: number;
}

export function raycastMobs(
  origin: THREE.Vector3,
  dir: THREE.Vector3,
  mobs: MobEntity[],
  maxDist = 4.6,
): MobRaycastHit | null {
  let closest: MobRaycastHit | null = null;

  for (let i = 0; i < mobs.length; i++) {
    const mob = mobs[i];
    const spec = MOB_SPECS[mob.kind];
    const scale = mob.isBaby ? 0.62 : 1.0;
    const hw = spec.hitboxRadius * scale;
    const h = spec.hitboxHeight * scale;

    const minX = mob.x - hw;
    const maxX = mob.x + hw;
    const minY = mob.y;
    const maxY = mob.y + h;
    const minZ = mob.z - hw;
    const maxZ = mob.z + hw;

    // Slab intersection
    let tmin = 0;
    let tmax = maxDist;

    const checkAxis = (orig: number, d: number, bmin: number, bmax: number): boolean => {
      if (Math.abs(d) < 1e-6) {
        return orig >= bmin && orig <= bmax;
      }
      let t1 = (bmin - orig) / d;
      let t2 = (bmax - orig) / d;
      if (t1 > t2) {
        const tmp = t1;
        t1 = t2;
        t2 = tmp;
      }
      tmin = Math.max(tmin, t1);
      tmax = Math.min(tmax, t2);
      return tmin <= tmax;
    };

    if (!checkAxis(origin.x, dir.x, minX, maxX)) continue;
    if (!checkAxis(origin.y, dir.y, minY, maxY)) continue;
    if (!checkAxis(origin.z, dir.z, minZ, maxZ)) continue;

    if (tmin >= 0 && tmin <= maxDist && (!closest || tmin < closest.dist)) {
      closest = { mob, dist: tmin };
    }
  }

  return closest;
}
