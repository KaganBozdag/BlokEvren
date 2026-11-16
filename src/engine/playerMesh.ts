import * as THREE from 'three';
import { getItemDef } from '../data/blocksAndRecipes';
import { gridToArray } from '../data/presetSkins';
import { AnimationConfig, CuboidPart, SkinData } from '../types/game';
import { createHeldBlockTextures } from './textures';

function buildCuboidPartsGroup(
  target: THREE.Group,
  parts: CuboidPart[],
  scaleFactor: number,
  cleanupGeos: THREE.BufferGeometry[],
  cleanupMats: THREE.Material[],
) {
  const s = scaleFactor / 16;
  for (const part of parts) {
    const w = Math.max(0.01, part.w * s);
    const h = Math.max(0.01, part.h * s);
    const d = Math.max(0.01, part.d * s);
    const geo = new THREE.BoxGeometry(w, h, d);
    const mat = new THREE.MeshStandardMaterial({
      color: part.color || '#94a3b8',
      roughness: 0.55,
      metalness: 0.15,
    });
    cleanupGeos.push(geo);
    cleanupMats.push(mat);
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(
      (part.x + part.w * 0.5 - 8) * s,
      (part.y + part.h * 0.5 - 8) * s,
      (part.z + part.d * 0.5 - 8) * s,
    );
    mesh.rotation.set(
      THREE.MathUtils.degToRad(part.rotX || 0),
      THREE.MathUtils.degToRad(part.rotY || 0),
      THREE.MathUtils.degToRad(part.rotZ || 0),
      'XYZ',
    );
    target.add(mesh);
  }
}

function getFallbackWeaponParts(kind: 'gun' | 'staff' | 'bow' | 'melee', color: string): CuboidPart[] {
  if (kind === 'gun') {
    return [
      { id: 'w1', name: 'Kabza', x: 6, y: 2, z: 7, w: 4, h: 6, d: 3, color: '#1e293b' },
      { id: 'w2', name: 'Govde', x: 5, y: 7, z: 3, w: 6, h: 4, d: 10, color: '#0f172a' },
      { id: 'w3', name: 'Namlu', x: 6, y: 8, z: 0, w: 4, h: 2, d: 14, color },
      { id: 'w4', name: 'Nisangah', x: 7, y: 11, z: 6, w: 2, h: 2, d: 4, color: '#facc15' },
    ];
  }
  if (kind === 'staff') {
    return [
      { id: 's1', name: 'Sopa', x: 7, y: 0, z: 7, w: 2, h: 12, d: 2, color: '#78350f' },
      { id: 's2', name: 'Kristal', x: 5, y: 11, z: 5, w: 6, h: 5, d: 6, color },
    ];
  }
  if (kind === 'bow') {
    return [
      { id: 'b1', name: 'Yay', x: 7, y: 2, z: 6, w: 2, h: 12, d: 3, color: '#92400e' },
      { id: 'b2', name: 'UçÜst', x: 7, y: 12, z: 8, w: 2, h: 3, d: 4, color },
      { id: 'b3', name: 'UçAlt', x: 7, y: 1, z: 8, w: 2, h: 3, d: 4, color },
    ];
  }
  return [
    { id: 'm1', name: 'Sap', x: 7, y: 1, z: 7, w: 2, h: 5, d: 2, color: '#78350f' },
    { id: 'm2', name: 'Koruma', x: 5, y: 5, z: 6, w: 6, h: 2, d: 4, color: '#475569' },
    { id: 'm3', name: 'Namlu', x: 6, y: 7, z: 7, w: 4, h: 9, d: 2, color },
  ];
}

function getBucketParts(color: string, secondaryColor: string, isEmpty: boolean): CuboidPart[] {
  const parts: CuboidPart[] = [
    { id: 'b_base', name: 'Taban', x: 4, y: 2, z: 4, w: 8, h: 2, d: 8, color: '#475569' },
    { id: 'b_body', name: 'Govde', x: 3, y: 4, z: 3, w: 10, h: 8, d: 10, color: '#94a3b8' },
    { id: 'b_rim', name: 'Agiz', x: 2, y: 11, z: 2, w: 12, h: 2, d: 12, color: '#64748b' },
    { id: 'b_handle', name: 'Sap', x: 4, y: 13, z: 7, w: 8, h: 2, d: 2, color: '#cbd5e1' },
  ];
  if (isEmpty) {
    parts.push({ id: 'b_void', name: 'Bos', x: 4, y: 12, z: 4, w: 8, h: 1, d: 8, color: '#0f172a' });
  } else {
    parts.push({ id: 'b_liq', name: 'Sivi', x: 4, y: 12, z: 4, w: 8, h: 1, d: 8, color });
    parts.push({ id: 'b_hl', name: 'Parlama', x: 5, y: 12, z: 5, w: 4, h: 1, d: 3, color: secondaryColor });
  }
  return parts;
}

function gridToCanvasTexture(grid: string): THREE.CanvasTexture {
  const arr = gridToArray(grid);
  const canvas = document.createElement('canvas');
  canvas.width = 8;
  canvas.height = 8;
  const ctx = canvas.getContext('2d')!;
  for (let y = 0; y < 8; y++) {
    for (let x = 0; x < 8; x++) {
      ctx.fillStyle = arr[y * 8 + x] || '#94a3b8';
      ctx.fillRect(x, y, 1, 1);
    }
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  tex.generateMipmaps = false;
  tex.needsUpdate = true;
  return tex;
}

function makeNameplateSprite(name: string): THREE.Sprite {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 64;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = 'rgba(15, 23, 42, 0.78)';
  ctx.beginPath();
  ctx.roundRect(12, 12, 232, 40, 8);
  ctx.fill();
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.18)';
  ctx.lineWidth = 2;
  ctx.stroke();

  ctx.fillStyle = '#f8fafc';
  ctx.font = 'bold 24px "Plus Jakarta Sans", sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(name.slice(0, 18), 128, 33);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false });
  const sprite = new THREE.Sprite(mat);
  sprite.scale.set(1.5, 0.375, 1);
  sprite.position.set(0, 2.25, 0);
  return sprite;
}

export interface VoxelCharacterRig {
  group: THREE.Group;
  head: THREE.Mesh;
  torso: THREE.Mesh;
  leftArmPivot: THREE.Group;
  rightArmPivot: THREE.Group;
  leftLegPivot: THREE.Group;
  rightLegPivot: THREE.Group;
  heldMesh: THREE.Mesh;
  updateSkin: (skin: SkinData) => void;
  updateHeldItem: (itemId: string) => void;
  animate: (dt: number, speed: number, swinging: boolean) => void;
  dispose: () => void;
}

export function createVoxelCharacterRig(
  initialSkin: SkinData,
  nameplate?: string,
): VoxelCharacterRig {
  const group = new THREE.Group();
  const textures: THREE.Texture[] = [];
  const materials: THREE.Material[] = [];
  const geometries: THREE.BufferGeometry[] = [];

  const makeMat = (grid: string) => {
    const tex = gridToCanvasTexture(grid);
    textures.push(tex);
    const mat = new THREE.MeshStandardMaterial({
      map: tex,
      roughness: 0.78,
      metalness: 0.05,
    });
    materials.push(mat);
    return mat;
  };

  let headFrontMat = makeMat(initialSkin.headFront);
  let headSideMat = makeMat(initialSkin.headSide);
  let headTopMat = makeMat(initialSkin.headTop);
  let torsoMat = makeMat(initialSkin.torso);
  let armMat = makeMat(initialSkin.arm);
  let legMat = makeMat(initialSkin.leg);

  // Head (+X, -X, +Y, -Y, +Z front, -Z back)
  const headGeo = new THREE.BoxGeometry(0.5, 0.5, 0.5);
  geometries.push(headGeo);
  const head = new THREE.Mesh(headGeo, [
    headSideMat,
    headSideMat,
    headTopMat,
    headSideMat,
    headFrontMat,
    headSideMat,
  ]);
  head.position.set(0, 1.55, 0);
  head.castShadow = true;
  group.add(head);

  // Torso
  const torsoGeo = new THREE.BoxGeometry(0.5, 0.72, 0.26);
  geometries.push(torsoGeo);
  const torso = new THREE.Mesh(torsoGeo, torsoMat);
  torso.position.set(0, 0.94, 0);
  torso.castShadow = true;
  group.add(torso);

  // Arms (pivoted at shoulder y = 1.28)
  const armGeo = new THREE.BoxGeometry(0.22, 0.68, 0.22);
  armGeo.translate(0, -0.28, 0);
  geometries.push(armGeo);

  const leftArmPivot = new THREE.Group();
  leftArmPivot.position.set(-0.37, 1.24, 0);
  const leftArm = new THREE.Mesh(armGeo, armMat);
  leftArm.castShadow = true;
  leftArmPivot.add(leftArm);
  group.add(leftArmPivot);

  const rightArmPivot = new THREE.Group();
  rightArmPivot.position.set(0.37, 1.24, 0);
  const rightArm = new THREE.Mesh(armGeo, armMat);
  rightArm.castShadow = true;
  rightArmPivot.add(rightArm);
  group.add(rightArmPivot);

  // Held Item in Right Hand
  const heldGeo = new THREE.BoxGeometry(0.22, 0.22, 0.22);
  geometries.push(heldGeo);
  const heldMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.6 });
  materials.push(heldMat);
  const heldMesh = new THREE.Mesh(heldGeo, heldMat);
  heldMesh.position.set(0, -0.58, 0.16);
  heldMesh.visible = false;
  rightArmPivot.add(heldMesh);

  const heldModelGroup = new THREE.Group();
  heldModelGroup.position.set(0, -0.58, 0.18);
  heldModelGroup.visible = false;
  rightArmPivot.add(heldModelGroup);
  let customGeos: THREE.BufferGeometry[] = [];
  let customMats: THREE.Material[] = [];

  const clearCustomGroup = () => {
    heldModelGroup.clear();
    customGeos.forEach((g) => g.dispose());
    customMats.forEach((m) => m.dispose());
    customGeos = [];
    customMats = [];
  };

  // Legs (pivoted at hip y = 0.58)
  const legGeo = new THREE.BoxGeometry(0.23, 0.6, 0.24);
  legGeo.translate(0, -0.3, 0);
  geometries.push(legGeo);

  const leftLegPivot = new THREE.Group();
  leftLegPivot.position.set(-0.13, 0.6, 0);
  const leftLeg = new THREE.Mesh(legGeo, legMat);
  leftLeg.castShadow = true;
  leftLegPivot.add(leftLeg);
  group.add(leftLegPivot);

  const rightLegPivot = new THREE.Group();
  rightLegPivot.position.set(0.13, 0.6, 0);
  const rightLeg = new THREE.Mesh(legGeo, legMat);
  rightLeg.castShadow = true;
  rightLegPivot.add(rightLeg);
  group.add(rightLegPivot);

  if (nameplate) {
    const sprite = makeNameplateSprite(nameplate);
    group.add(sprite);
  }

  let walkPhase = 0;
  let swingPhase = 0;

  const updateSkin = (skin: SkinData) => {
    const swap = (mat: THREE.MeshStandardMaterial, grid: string) => {
      const old = mat.map;
      const next = gridToCanvasTexture(grid);
      textures.push(next);
      mat.map = next;
      mat.needsUpdate = true;
      if (old) old.dispose();
    };
    swap(headFrontMat, skin.headFront);
    swap(headSideMat, skin.headSide);
    swap(headTopMat, skin.headTop);
    swap(torsoMat, skin.torso);
    swap(armMat, skin.arm);
    swap(legMat, skin.leg);
  };

  const updateHeldItem = (itemId: string) => {
    const def = getItemDef(itemId);
    clearCustomGroup();
    if (!def || itemId === 'air') {
      heldMesh.visible = false;
      heldModelGroup.visible = false;
      return;
    }
    if (def.customModel && def.customModel.parts.length > 0) {
      heldMesh.visible = false;
      heldModelGroup.visible = true;
      buildCuboidPartsGroup(heldModelGroup, def.customModel.parts, 0.34, customGeos, customMats);
      return;
    }
    if (def.weapon && def.weapon.weaponKind !== 'melee') {
      heldMesh.visible = false;
      heldModelGroup.visible = true;
      buildCuboidPartsGroup(
        heldModelGroup,
        getFallbackWeaponParts(def.weapon.weaponKind, def.color),
        0.34,
        customGeos,
        customMats,
      );
      return;
    }
    if (def.placesLiquidId || def.isEmptyBucket) {
      heldMesh.visible = false;
      heldModelGroup.visible = true;
      buildCuboidPartsGroup(
        heldModelGroup,
        getBucketParts(def.color, def.secondaryColor || def.color, Boolean(def.isEmptyBucket)),
        0.32,
        customGeos,
        customMats,
      );
      return;
    }
    heldModelGroup.visible = false;
    heldMesh.visible = true;
    heldMat.color.set(def.color);
    heldMesh.scale.set(def.isBlock ? 1 : 0.45, def.isBlock ? 1 : 1.5, def.isBlock ? 1 : 0.3);
  };

  const animate = (dt: number, speed: number, swinging: boolean) => {
    if (speed > 0.15) {
      walkPhase += dt * Math.min(12, speed * 2.1);
      const amp = Math.min(0.75, speed * 0.16);
      leftLegPivot.rotation.x = Math.sin(walkPhase) * amp;
      rightLegPivot.rotation.x = -Math.sin(walkPhase) * amp;
      leftArmPivot.rotation.x = -Math.sin(walkPhase) * amp * 0.85;
      if (!swinging) {
        rightArmPivot.rotation.x = Math.sin(walkPhase) * amp * 0.85;
      }
    } else {
      leftLegPivot.rotation.x = THREE.MathUtils.damp(leftLegPivot.rotation.x, 0, 10, dt);
      rightLegPivot.rotation.x = THREE.MathUtils.damp(rightLegPivot.rotation.x, 0, 10, dt);
      leftArmPivot.rotation.x = THREE.MathUtils.damp(leftArmPivot.rotation.x, 0, 10, dt);
      if (!swinging) {
        rightArmPivot.rotation.x = THREE.MathUtils.damp(rightArmPivot.rotation.x, 0, 10, dt);
      }
    }

    if (swinging) {
      swingPhase += dt * 16;
      rightArmPivot.rotation.x = -0.9 + Math.sin(swingPhase) * 0.7;
    } else {
      swingPhase = 0;
    }
  };

  const dispose = () => {
    clearCustomGroup();
    geometries.forEach((g) => g.dispose());
    materials.forEach((m) => m.dispose());
    textures.forEach((t) => t.dispose());
  };

  return {
    group,
    head,
    torso,
    leftArmPivot,
    rightArmPivot,
    leftLegPivot,
    rightLegPivot,
    heldMesh,
    updateSkin,
    updateHeldItem,
    animate,
    dispose,
  };
}

export function createFirstPersonArm(initialSkin: SkinData) {
  const group = new THREE.Group();
  let armTex = gridToCanvasTexture(initialSkin.arm);
  const armMat = new THREE.MeshStandardMaterial({
    map: armTex,
    roughness: 0.75,
    metalness: 0.05,
  });
  const armGeo = new THREE.BoxGeometry(0.18, 0.56, 0.18);
  const armMesh = new THREE.Mesh(armGeo, armMat);
  armMesh.position.set(0.36, -0.34, -0.52);
  armMesh.rotation.set(0.55, -0.35, 0.2);
  group.add(armMesh);

  let heldBlockTextures: THREE.CanvasTexture[] = [];
  const itemGeo = new THREE.BoxGeometry(0.24, 0.24, 0.24);
  const itemMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.7 });
  const blockFaceMats = Array.from({ length: 6 }, () =>
    new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.72 }),
  );
  const itemMesh = new THREE.Mesh<THREE.BoxGeometry, THREE.Material | THREE.Material[]>(
    itemGeo,
    itemMat,
  );
  itemMesh.position.set(0.34, -0.25, -0.55);
  itemMesh.rotation.set(0.22, 0.48, 0.08);
  group.add(itemMesh);

  const heldModelGroup = new THREE.Group();
  heldModelGroup.position.set(0.34, -0.24, -0.56);
  heldModelGroup.visible = false;
  group.add(heldModelGroup);
  let customGeos: THREE.BufferGeometry[] = [];
  let customMats: THREE.Material[] = [];

  const clearCustomGroup = () => {
    heldModelGroup.clear();
    customGeos.forEach((g) => g.dispose());
    customMats.forEach((m) => m.dispose());
    customGeos = [];
    customMats = [];
  };

  const updateSkin = (skin: SkinData) => {
    armTex.dispose();
    armTex = gridToCanvasTexture(skin.arm);
    armMat.map = armTex;
    armMat.needsUpdate = true;
  };

  const disposeHeldTextures = () => {
    heldBlockTextures.forEach((t) => t.dispose());
    heldBlockTextures = [];
  };

  const updateHeldItem = (itemId: string) => {
    const def = getItemDef(itemId);
    disposeHeldTextures();
    clearCustomGroup();

    if (!def || itemId === 'air') {
      armMesh.visible = true;
      itemMesh.visible = false;
      heldModelGroup.visible = false;
      itemMat.map = null;
      itemMat.needsUpdate = true;
      return;
    }

    // Never show bare arm when holding any block, tool, or item
    armMesh.visible = false;

    if (def.customModel && def.customModel.parts.length > 0) {
      itemMesh.visible = false;
      heldModelGroup.visible = true;
      heldModelGroup.position.set(0.34, -0.24, -0.56);
      heldModelGroup.rotation.set(0.06, -0.22, 0.02);
      heldModelGroup.scale.set(1, 1, 1);
      buildCuboidPartsGroup(heldModelGroup, def.customModel.parts, 0.38, customGeos, customMats);
      return;
    }

    if (def.weapon) {
      itemMesh.visible = false;
      heldModelGroup.visible = true;
      heldModelGroup.position.set(0.35, -0.24, -0.55);
      heldModelGroup.rotation.set(
        def.weapon.weaponKind === 'gun' ? 0.02 : -0.18,
        def.weapon.weaponKind === 'gun' ? -0.06 : 0.2,
        0.04,
      );
      heldModelGroup.scale.set(1, 1, 1);
      buildCuboidPartsGroup(
        heldModelGroup,
        getFallbackWeaponParts(def.weapon.weaponKind, def.color),
        0.38,
        customGeos,
        customMats,
      );
      return;
    }

    if (def.placesLiquidId || def.isEmptyBucket) {
      itemMesh.visible = false;
      heldModelGroup.visible = true;
      heldModelGroup.position.set(0.35, -0.26, -0.54);
      heldModelGroup.rotation.set(0.18, -0.35, 0.05);
      heldModelGroup.scale.set(1, 1, 1);
      buildCuboidPartsGroup(
        heldModelGroup,
        getBucketParts(def.color, def.secondaryColor || def.color, Boolean(def.isEmptyBucket)),
        0.34,
        customGeos,
        customMats,
      );
      return;
    }

    heldModelGroup.visible = false;
    itemMesh.visible = true;

    if (def.isBlock) {
      const faceTextures = createHeldBlockTextures(itemId);
      if (faceTextures && faceTextures.length === 6) {
        heldBlockTextures = faceTextures;
        faceTextures.forEach((tex, idx) => {
          const mat = blockFaceMats[idx];
          mat.map = tex;
          mat.color.set('#ffffff');
          mat.transparent = Boolean(def.transparent);
          mat.alphaTest = def.transparent ? 0.12 : 0;
          mat.needsUpdate = true;
        });
        itemMesh.material = blockFaceMats;
      } else {
        itemMesh.material = itemMat;
      }
      const isFlatSprite =
        def.pattern === 'foliage_cross' ||
        def.pattern === 'bamboo' ||
        def.pattern === 'lantern' ||
        def.pattern === 'torch';
      itemMesh.position.set(0.34, -0.25, -0.55);
      itemMesh.rotation.set(isFlatSprite ? 0.12 : 0.22, isFlatSprite ? -0.22 : 0.48, 0.08);
      itemMesh.scale.set(isFlatSprite ? 0.92 : 1, isFlatSprite ? 0.92 : 1, isFlatSprite ? 0.04 : 1);
    } else {
      itemMesh.material = itemMat;
      itemMat.map = null;
      itemMat.transparent = false;
      itemMat.alphaTest = 0;
      itemMat.color.set(def.color);
      itemMat.needsUpdate = true;
      if (def.toolType) {
        itemMesh.position.set(0.36, -0.22, -0.56);
        itemMesh.rotation.set(-0.35, 0.25, 0.15);
        itemMesh.scale.set(0.28, 1.45, 0.18);
      } else {
        itemMesh.position.set(0.34, -0.24, -0.54);
        itemMesh.rotation.set(0.2, 0.35, 0.1);
        itemMesh.scale.set(0.65, 0.65, 0.22);
      }
    }
  };

  const applyAnimation = (
    now: number,
    dt: number,
    horizSpeed: number,
    armSwingTimer: number,
    recoilTimer: number,
    anim?: AnimationConfig,
  ) => {
    const t = now * 0.001;
    const baseBobX = Math.cos(now * 0.0055) * horizSpeed * 0.003;
    const baseBobY = Math.abs(Math.sin(now * 0.0055)) * horizSpeed * -0.004;

    if (armSwingTimer > 0) {
      const swing = Math.sin((1 - armSwingTimer / 0.22) * Math.PI);
      const recoilPush = recoilTimer > 0 ? Math.min(1, recoilTimer / 0.14) * (anim?.recoil ?? 0.12) : 0;
      group.position.set(baseBobX, -swing * 0.08, -swing * 0.14 + recoilPush);
      group.rotation.set(-swing * 0.65 + recoilPush * 1.4, 0, 0);
      return;
    }

    if (anim) {
      const spd = anim.speed || 2;
      const amp = anim.amplitude || 0.2;
      if (anim.style === 'recoil') {
        const kick = recoilTimer > 0 ? Math.min(1, recoilTimer / 0.16) * (anim.recoil ?? 0.15) : 0;
        group.position.set(baseBobX, baseBobY + (anim.bob ? Math.sin(t * spd) * anim.bob * 0.05 : 0), kick);
        group.rotation.set(kick * 1.6, 0, 0);
        return;
      }
      if (anim.style === 'spin') {
        group.position.set(baseBobX, baseBobY + Math.sin(t * spd) * 0.02, 0);
        group.rotation.set(0, 0, 0);
        heldModelGroup.rotation.y = (t * spd * 1.8) % (Math.PI * 2);
        return;
      }
      if (anim.style === 'pulse') {
        const s = 1 + Math.sin(t * spd * 2) * amp * 0.25;
        group.position.set(baseBobX, baseBobY, 0);
        group.rotation.x = THREE.MathUtils.damp(group.rotation.x, 0, 14, dt);
        heldModelGroup.scale.set(s, s, s);
        return;
      }
      if (anim.style === 'hover') {
        group.position.set(baseBobX, baseBobY + Math.sin(t * spd) * amp * 0.15, 0);
        group.rotation.x = THREE.MathUtils.damp(group.rotation.x, 0, 14, dt);
        return;
      }
      if (anim.style === 'thrust') {
        const thrustZ = recoilTimer > 0 ? -Math.min(1, recoilTimer / 0.15) * amp * 0.35 : 0;
        group.position.set(baseBobX, baseBobY, thrustZ);
        group.rotation.x = THREE.MathUtils.damp(group.rotation.x, 0, 14, dt);
        return;
      }
    }

    group.position.set(baseBobX, baseBobY, 0);
    group.rotation.x = THREE.MathUtils.damp(group.rotation.x, 0, 14, dt);
  };

  const dispose = () => {
    armGeo.dispose();
    armMat.dispose();
    armTex.dispose();
    disposeHeldTextures();
    clearCustomGroup();
    blockFaceMats.forEach((m) => m.dispose());
    itemGeo.dispose();
    itemMat.dispose();
  };

  return { group, armMesh, itemMesh, updateSkin, updateHeldItem, applyAnimation, dispose };
}
