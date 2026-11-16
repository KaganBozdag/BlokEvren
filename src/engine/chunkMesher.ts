import * as THREE from 'three';
import { getItemDef } from '../data/blocksAndRecipes';
import { CubeFaceKey } from '../types/game';
import { TextureAtlasBundle } from './textures';
import { CHUNK_SIZE, VoxelWorld, WORLD_HEIGHT } from './worldGen';

interface FaceSpec {
  dir: [number, number, number];
  corners: [number, number, number][];
  shade: number;
  faceType: CubeFaceKey;
}

const FACES: FaceSpec[] = [
  {
    // +Y Top
    dir: [0, 1, 0],
    corners: [
      [0, 1, 1],
      [1, 1, 1],
      [1, 1, 0],
      [0, 1, 0],
    ],
    shade: 1.0,
    faceType: 'top',
  },
  {
    // -Y Bottom
    dir: [0, -1, 0],
    corners: [
      [0, 0, 0],
      [1, 0, 0],
      [1, 0, 1],
      [0, 0, 1],
    ],
    shade: 0.56,
    faceType: 'bottom',
  },
  {
    // +X Right
    dir: [1, 0, 0],
    corners: [
      [1, 0, 1],
      [1, 0, 0],
      [1, 1, 0],
      [1, 1, 1],
    ],
    shade: 0.82,
    faceType: 'right',
  },
  {
    // -X Left
    dir: [-1, 0, 0],
    corners: [
      [0, 0, 0],
      [0, 0, 1],
      [0, 1, 1],
      [0, 1, 0],
    ],
    shade: 0.78,
    faceType: 'left',
  },
  {
    // +Z Front
    dir: [0, 0, 1],
    corners: [
      [0, 0, 1],
      [1, 0, 1],
      [1, 1, 1],
      [0, 1, 1],
    ],
    shade: 0.9,
    faceType: 'front',
  },
  {
    // -Z Back
    dir: [0, 0, -1],
    corners: [
      [1, 0, 0],
      [0, 0, 0],
      [0, 1, 0],
      [1, 1, 0],
    ],
    shade: 0.72,
    faceType: 'back',
  },
];

const PADDED = CHUNK_SIZE + 2; // 18
const STRIDE_Z = PADDED * WORLD_HEIGHT;
const STRIDE_X = WORLD_HEIGHT;

// Reusable scratch buffers to eliminate per-chunk array allocations
const paddedIds = new Array<string>(PADDED * PADDED * WORLD_HEIGHT).fill('air');
const paddedOpaque = new Uint8Array(PADDED * PADDED * WORLD_HEIGHT);

const _rotEuler = new THREE.Euler();
const _rotQuat = new THREE.Quaternion();
const _tmpVec = new THREE.Vector3();
const _tmpNorm = new THREE.Vector3();

function parseHexColorFloats(hex: string): [number, number, number] {
  const clean = (hex || '#94a3b8').replace('#', '');
  const full = clean.length === 3 ? clean.replace(/(.)/g, '$1$1') : clean;
  const num = parseInt(full, 16);
  if (Number.isNaN(num)) return [0.6, 0.65, 0.72];
  return [((num >> 16) & 255) / 255, ((num >> 8) & 255) / 255, (num & 255) / 255];
}

export interface ChunkMeshResult {
  opaqueGeo: THREE.BufferGeometry | null;
  transparentGeo: THREE.BufferGeometry | null;
}

export function buildChunkGeometry(
  world: VoxelWorld,
  cx: number,
  cz: number,
  atlas: TextureAtlasBundle,
): ChunkMeshResult {
  const maxNonAirY = world.fillPaddedChunk(cx, cz, paddedIds, paddedOpaque);

  const oPos: number[] = [];
  const oNorm: number[] = [];
  const oUv: number[] = [];
  const oCol: number[] = [];
  const oIdx: number[] = [];

  const tPos: number[] = [];
  const tNorm: number[] = [];
  const tUv: number[] = [];
  const tCol: number[] = [];
  const tIdx: number[] = [];

  const startX = cx * CHUNK_SIZE;
  const startZ = cz * CHUNK_SIZE;
  const maxLoopY = Math.min(WORLD_HEIGHT - 1, maxNonAirY);

  for (let lz = 0; lz < CHUNK_SIZE; lz++) {
    const wz = startZ + lz;
    const pz = lz + 1;
    const zBase = pz * STRIDE_Z;
    for (let lx = 0; lx < CHUNK_SIZE; lx++) {
      const wx = startX + lx;
      const px = lx + 1;
      const colBase = zBase + px * STRIDE_X;

      for (let ly = 0; ly <= maxLoopY; ly++) {
        const idx = colBase + ly;
        const blockId = paddedIds[idx];
        if (blockId === 'air') continue;

        const def = getItemDef(blockId);
        if (!def || !def.isBlock) continue;

        const isTrans = Boolean(def.transparent);

        // Fast 6-neighbor occlusion skip for hidden underground opaque blocks
        if (
          !isTrans &&
          ly > 0 &&
          ly < maxLoopY &&
          paddedOpaque[idx + 1] === 1 &&
          paddedOpaque[idx - 1] === 1 &&
          paddedOpaque[idx + STRIDE_X] === 1 &&
          paddedOpaque[idx - STRIDE_X] === 1 &&
          paddedOpaque[idx + STRIDE_Z] === 1 &&
          paddedOpaque[idx - STRIDE_Z] === 1
        ) {
          continue;
        }

        const tiles = atlas.tileMap.get(blockId);
        if (!tiles) continue;

        const posArr = isTrans ? tPos : oPos;
        const normArr = isTrans ? tNorm : oNorm;
        const uvArr = isTrans ? tUv : oUv;
        const colArr = isTrans ? tCol : oCol;
        const idxArr = isTrans ? tIdx : oIdx;

        // Custom 3D Cuboid Model geometry (0..16 units per block)
        if (def.customModel && def.customModel.parts.length > 0) {
          const wTile = atlas.whiteTileIdx;
          const wtCol = wTile % atlas.cols;
          const wtRow = Math.floor(wTile / atlas.cols);
          const u0 = (wtCol + 0.25) / atlas.cols;
          const u1 = (wtCol + 0.75) / atlas.cols;
          const v1 = 1 - (wtRow + 0.25) / atlas.rows;
          const v0 = 1 - (wtRow + 0.75) / atlas.rows;
          const glowBoost = def.lightLevel ? 1.16 : 1.0;

          for (const part of def.customModel.parts) {
            const s = 1 / 16;
            const pcx = (part.x + part.w * 0.5) * s;
            const pcy = (part.y + part.h * 0.5) * s;
            const pcz = (part.z + part.d * 0.5) * s;
            const hx = Math.max(0.01, part.w * 0.5 * s);
            const hy = Math.max(0.01, part.h * 0.5 * s);
            const hz = Math.max(0.01, part.d * 0.5 * s);
            _rotEuler.set(
              THREE.MathUtils.degToRad(part.rotX || 0),
              THREE.MathUtils.degToRad(part.rotY || 0),
              THREE.MathUtils.degToRad(part.rotZ || 0),
              'XYZ',
            );
            _rotQuat.setFromEuler(_rotEuler);
            const [cr, cg, cb] = parseHexColorFloats(part.color);

            for (let fi = 0; fi < 6; fi++) {
              const face = FACES[fi];
              _tmpNorm.set(face.dir[0], face.dir[1], face.dir[2]).applyQuaternion(_rotQuat);
              const baseVert = posArr.length / 3;
              const shade = face.shade * glowBoost;

              for (let ci = 0; ci < 4; ci++) {
                const c = face.corners[ci];
                _tmpVec.set(
                  (c[0] === 0 ? -1 : 1) * hx,
                  (c[1] === 0 ? -1 : 1) * hy,
                  (c[2] === 0 ? -1 : 1) * hz,
                );
                _tmpVec.applyQuaternion(_rotQuat);
                posArr.push(wx + pcx + _tmpVec.x, ly + pcy + _tmpVec.y, wz + pcz + _tmpVec.z);
                normArr.push(_tmpNorm.x, _tmpNorm.y, _tmpNorm.z);
                colArr.push(cr * shade, cg * shade, cb * shade);
              }

              uvArr.push(u0, v0, u1, v0, u1, v1, u0, v1);
              idxArr.push(baseVert, baseVert + 1, baseVert + 2, baseVert, baseVert + 2, baseVert + 3);
            }
          }
          continue;
        }

        // Special geometry for torch
        if (blockId === 'torch' || def.pattern === 'torch') {
          const baseVert = posArr.length / 3;
          const tileIdx = tiles.side;
          const col = tileIdx % atlas.cols;
          const row = Math.floor(tileIdx / atlas.cols);
          const u0 = col / atlas.cols;
          const u1 = (col + 1) / atlas.cols;
          const v1 = 1 - row / atlas.rows;
          const v0 = 1 - (row + 1) / atlas.rows;

          const minX = wx + 0.4;
          const maxX = wx + 0.6;
          const minY = ly;
          const maxY = ly + 0.72;
          const minZ = wz + 0.4;
          const maxZ = wz + 0.6;

          const torchFaces: { p: number[][]; n: number[] }[] = [
            { p: [[minX, minY, maxZ], [maxX, minY, maxZ], [maxX, maxY, maxZ], [minX, maxY, maxZ]], n: [0, 0, 1] },
            { p: [[maxX, minY, minZ], [minX, minY, minZ], [minX, maxY, minZ], [maxX, maxY, minZ]], n: [0, 0, -1] },
            { p: [[maxX, minY, maxZ], [maxX, minY, minZ], [maxX, maxY, minZ], [maxX, maxY, maxZ]], n: [1, 0, 0] },
            { p: [[minX, minY, minZ], [minX, minY, maxZ], [minX, maxY, maxZ], [minX, maxY, minZ]], n: [-1, 0, 0] },
            { p: [[minX, maxY, maxZ], [maxX, maxY, maxZ], [maxX, maxY, minZ], [minX, maxY, minZ]], n: [0, 1, 0] },
          ];
          torchFaces.forEach((tf, fi) => {
            const vStart = baseVert + fi * 4;
            tf.p.forEach((pt) => {
              posArr.push(pt[0], pt[1], pt[2]);
              normArr.push(tf.n[0], tf.n[1], tf.n[2]);
              colArr.push(1.15, 1.1, 0.95);
            });
            uvArr.push(u0, v0, u1, v0, u1, v1, u0, v1);
            idxArr.push(vStart, vStart + 1, vStart + 2, vStart, vStart + 2, vStart + 3);
          });
          continue;
        }

        // Special compact 3D lantern geometry
        if (def.pattern === 'lantern') {
          const baseVert = posArr.length / 3;
          const tileIdx = tiles.side;
          const col = tileIdx % atlas.cols;
          const row = Math.floor(tileIdx / atlas.cols);
          const u0 = col / atlas.cols;
          const u1 = (col + 1) / atlas.cols;
          const v1 = 1 - row / atlas.rows;
          const v0 = 1 - (row + 1) / atlas.rows;

          const minX = wx + 0.28;
          const maxX = wx + 0.72;
          const minY = ly;
          const maxY = ly + 0.64;
          const minZ = wz + 0.28;
          const maxZ = wz + 0.72;

          const lanternFaces: { p: number[][]; n: number[] }[] = [
            { p: [[minX, minY, maxZ], [maxX, minY, maxZ], [maxX, maxY, maxZ], [minX, maxY, maxZ]], n: [0, 0, 1] },
            { p: [[maxX, minY, minZ], [minX, minY, minZ], [minX, maxY, minZ], [maxX, maxY, minZ]], n: [0, 0, -1] },
            { p: [[maxX, minY, maxZ], [maxX, minY, minZ], [maxX, maxY, minZ], [maxX, maxY, maxZ]], n: [1, 0, 0] },
            { p: [[minX, minY, minZ], [minX, minY, maxZ], [minX, maxY, maxZ], [minX, maxY, minZ]], n: [-1, 0, 0] },
            { p: [[minX, maxY, maxZ], [maxX, maxY, maxZ], [maxX, maxY, minZ], [minX, maxY, minZ]], n: [0, 1, 0] },
            { p: [[minX, minY, minZ], [maxX, minY, minZ], [maxX, minY, maxZ], [minX, minY, maxZ]], n: [0, -1, 0] },
          ];
          lanternFaces.forEach((lf, fi) => {
            const vStart = baseVert + fi * 4;
            lf.p.forEach((pt) => {
              posArr.push(pt[0], pt[1], pt[2]);
              normArr.push(lf.n[0], lf.n[1], lf.n[2]);
              colArr.push(1.18, 1.12, 0.96);
            });
            uvArr.push(u0, v0, u1, v0, u1, v1, u0, v1);
            idxArr.push(vStart, vStart + 1, vStart + 2, vStart, vStart + 2, vStart + 3);
          });
          continue;
        }

        // Crossed diagonal X-quads for flowers, tall grass, mushrooms, sugar cane, bamboo
        if (def.pattern === 'foliage_cross' || def.pattern === 'bamboo') {
          const baseVert = posArr.length / 3;
          const tileIdx = tiles.front;
          const col = tileIdx % atlas.cols;
          const row = Math.floor(tileIdx / atlas.cols);
          const pad = 0.002;
          const u0 = col / atlas.cols + pad;
          const u1 = (col + 1) / atlas.cols - pad;
          const v1 = 1 - row / atlas.rows - pad;
          const v0 = 1 - (row + 1) / atlas.rows + pad;

          const m = 0.14;
          const quads = [
            [
              [wx + m, ly, wz + m],
              [wx + 1 - m, ly, wz + 1 - m],
              [wx + 1 - m, ly + 1, wz + 1 - m],
              [wx + m, ly + 1, wz + m],
            ],
            [
              [wx + 1 - m, ly, wz + m],
              [wx + m, ly, wz + 1 - m],
              [wx + m, ly + 1, wz + 1 - m],
              [wx + 1 - m, ly + 1, wz + m],
            ],
          ];
          quads.forEach((q, qi) => {
            const vStart = baseVert + qi * 4;
            q.forEach((pt) => {
              posArr.push(pt[0], pt[1], pt[2]);
              normArr.push(0, 1, 0);
              colArr.push(0.95, 0.98, 0.95);
            });
            uvArr.push(u0, v0, u1, v0, u1, v1, u0, v1);
            idxArr.push(vStart, vStart + 1, vStart + 2, vStart, vStart + 2, vStart + 3);
          });
          continue;
        }

        const isLiquid = Boolean(def.liquid);
        const glowBoost = def.lightLevel ? 1.18 : 1.0;

        for (let fi = 0; fi < 6; fi++) {
          const face = FACES[fi];
          const dx = face.dir[0];
          const dy = face.dir[1];
          const dz = face.dir[2];
          const npy = ly + dy;

          if (npy >= 0 && npy < WORLD_HEIGHT) {
            const nIdx = (pz + dz) * STRIDE_Z + (px + dx) * STRIDE_X + npy;
            if (paddedOpaque[nIdx] === 1) {
              continue; // Culled by solid opaque neighbor
            }
            if ((isTrans || isLiquid) && paddedIds[nIdx] === blockId) {
              continue; // Don't render internal faces between identical transparent or liquid blocks
            }
          }

          const tileIdx = tiles[face.faceType];
          const tColIdx = tileIdx % atlas.cols;
          const tRowIdx = Math.floor(tileIdx / atlas.cols);
          const pad = 0.001;
          const u0 = tColIdx / atlas.cols + pad;
          const u1 = (tColIdx + 1) / atlas.cols - pad;
          const v1 = 1 - tRowIdx / atlas.rows - pad;
          const v0 = 1 - (tRowIdx + 1) / atlas.rows + pad;

          const baseVert = posArr.length / 3;
          const liquidOffset = isLiquid && face.faceType === 'top' ? -0.14 : 0;

          for (let ci = 0; ci < 4; ci++) {
            const c = face.corners[ci];
            posArr.push(wx + c[0], ly + c[1] + (c[1] === 1 ? liquidOffset : 0), wz + c[2]);
            normArr.push(dx, dy, dz);

            let ao = 1.0;
            if (!isTrans && ly > 0 && npy >= 0 && npy < WORLD_HEIGHT) {
              const npy1 = npy + (c[1] === 0 ? -1 : 1) * (dy === 0 ? 1 : 0);
              if (npy1 >= 0 && npy1 < WORLD_HEIGHT) {
                const npx1 = px + dx + (c[0] === 0 ? -1 : 1) * (dx === 0 ? 1 : 0);
                const npz1 = pz + dz;
                const s1 = paddedOpaque[npz1 * STRIDE_Z + npx1 * STRIDE_X + npy1] === 1;

                const npx2 = px + dx;
                const npz2 = pz + dz + (c[2] === 0 ? -1 : 1) * (dz === 0 ? 1 : 0);
                const s2 = paddedOpaque[npz2 * STRIDE_Z + npx2 * STRIDE_X + npy1] === 1;

                if (s1 && s2) ao = 0.72;
                else if (s1 || s2) ao = 0.86;
              }
            }
            const shade = face.shade * ao * glowBoost;
            colArr.push(shade, shade, shade);
          }

          uvArr.push(u0, v0, u1, v0, u1, v1, u0, v1);
          idxArr.push(
            baseVert,
            baseVert + 1,
            baseVert + 2,
            baseVert,
            baseVert + 2,
            baseVert + 3,
          );
        }
      }
    }
  }

  const makeGeo = (
    pos: number[],
    norm: number[],
    uv: number[],
    col: number[],
    idx: number[],
  ): THREE.BufferGeometry | null => {
    if (pos.length === 0) return null;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('normal', new THREE.Float32BufferAttribute(norm, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    geo.setIndex(idx);
    geo.computeBoundingSphere();
    return geo;
  };

  return {
    opaqueGeo: makeGeo(oPos, oNorm, oUv, oCol, oIdx),
    transparentGeo: makeGeo(tPos, tNorm, tUv, tCol, tIdx),
  };
}
