import * as THREE from 'three';
import { getAllItems, getItemDef, getRegistryVersion } from '../data/blocksAndRecipes';
import { getActiveTexturePack, getTexturePackVersion } from '../data/texturePacks';
import { BlockPattern, CubeFaceKey, ItemDef, TexturePackBlockOverride, TexturePackDef } from '../types/game';

const TILE_PX = 16;
const ATLAS_COLS = 16;

export const ALL_CUBE_FACES: CubeFaceKey[] = ['right', 'left', 'front', 'back', 'top', 'bottom'];

export const CUBE_FACE_META: { key: CubeFaceKey; label: string; axis: string }[] = [
  { key: 'right', label: 'Sağ', axis: '+X' },
  { key: 'left', label: 'Sol', axis: '-X' },
  { key: 'front', label: 'Ön', axis: '+Z' },
  { key: 'back', label: 'Arka', axis: '-Z' },
  { key: 'top', label: 'Üst', axis: '+Y' },
  { key: 'bottom', label: 'Alt', axis: '-Y' },
];

export interface BlockTileIndices {
  right: number;
  left: number;
  front: number;
  back: number;
  top: number;
  bottom: number;
  side: number;
}

export interface TextureAtlasBundle {
  texture: THREE.CanvasTexture;
  cols: number;
  rows: number;
  tileMap: Map<string, BlockTileIndices>;
  whiteTileIdx: number;
  version: string;
}

const iconCache = new Map<string, string>();
const pngPixelCache = new Map<string, string[]>();
const pngLoadingSet = new Set<string>();
let cachedAtlas: TextureAtlasBundle | null = null;
let atlasPngVersion = 0;
let onPngDecodedCallback: (() => void) | null = null;

export function setOnPngTextureReadyCallback(cb: (() => void) | null) {
  onPngDecodedCallback = cb;
}

function decodePngDataUrlToPixels(dataUrl: string): string[] | null {
  const hit = pngPixelCache.get(dataUrl);
  if (hit) return hit;
  if (pngLoadingSet.has(dataUrl) || typeof Image === 'undefined') return null;
  pngLoadingSet.add(dataUrl);
  const img = new Image();
  img.onload = () => {
    try {
      const c = document.createElement('canvas');
      c.width = TILE_PX;
      c.height = TILE_PX;
      const ctx = c.getContext('2d')!;
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(img, 0, 0, TILE_PX, TILE_PX);
      const data = ctx.getImageData(0, 0, TILE_PX, TILE_PX).data;
      const arr: string[] = new Array(256);
      for (let i = 0; i < 256; i++) {
        const r = data[i * 4];
        const g = data[i * 4 + 1];
        const b = data[i * 4 + 2];
        const a = data[i * 4 + 3];
        if (a < 28) arr[i] = 'transparent';
        else arr[i] = rgbToHex(r, g, b);
      }
      pngPixelCache.set(dataUrl, arr);
      atlasPngVersion++;
      cachedAtlas = null;
      iconCache.clear();
      onPngDecodedCallback?.();
    } catch {
      // ignore invalid PNG
    } finally {
      pngLoadingSet.delete(dataUrl);
    }
  };
  img.onerror = () => {
    pngLoadingSet.delete(dataUrl);
  };
  img.src = dataUrl;
  return null;
}

export function hashStringSeed(str: string): number {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0) % 100000;
}

function hash2d(x: number, y: number, seed: number): number {
  let n = Math.imul(x, 374761393) + Math.imul(y, 668265263) + Math.imul(seed, 1442695041);
  n = (n ^ (n >>> 13)) * 1274126177;
  return ((n ^ (n >>> 16)) >>> 0) / 4294967295;
}

function hexToRgb(hex: string): [number, number, number] {
  const clean = hex.replace('#', '');
  const full = clean.length === 3 ? clean.replace(/(.)/g, '$1$1') : clean;
  const num = parseInt(full, 16);
  if (Number.isNaN(num)) return [148, 163, 184];
  return [(num >> 16) & 255, (num >> 8) & 255, num & 255];
}

function rgbToHex(r: number, g: number, b: number): string {
  const clamp = (v: number) => Math.max(0, Math.min(255, Math.round(v)));
  return (
    '#' +
    [clamp(r), clamp(g), clamp(b)]
      .map((v) => v.toString(16).padStart(2, '0'))
      .join('')
  );
}

function shadeHex(hex: string, delta: number): string {
  const [r, g, b] = hexToRgb(hex);
  return rgbToHex(r + delta, g + delta, b + delta);
}

function mixHex(hexA: string, hexB: string, t: number): string {
  const [r1, g1, b1] = hexToRgb(hexA);
  const [r2, g2, b2] = hexToRgb(hexB);
  return rgbToHex(r1 + (r2 - r1) * t, g1 + (g2 - g1) * t, b1 + (b2 - b1) * t);
}

// Handcrafted MC-inspired 16x16 cobblestone cell map (0 = mortar, 1 = shadow, 2 = base, 3 = highlight)
const COBBLE_MASK = [
  [0, 3, 3, 2, 2, 0, 3, 3, 3, 2, 0, 3, 2, 2, 1, 0],
  [3, 2, 2, 2, 1, 0, 2, 2, 2, 1, 0, 2, 2, 1, 1, 0],
  [2, 2, 1, 1, 0, 0, 2, 1, 1, 0, 3, 2, 1, 0, 0, 0],
  [0, 0, 0, 0, 3, 3, 0, 0, 0, 3, 2, 1, 0, 3, 3, 2],
  [3, 3, 2, 0, 2, 2, 2, 1, 0, 2, 2, 0, 3, 2, 2, 1],
  [2, 2, 1, 0, 2, 1, 1, 0, 3, 2, 1, 0, 2, 2, 1, 0],
  [2, 1, 0, 0, 0, 0, 0, 3, 2, 1, 0, 0, 1, 1, 0, 0],
  [0, 0, 3, 3, 3, 2, 0, 2, 2, 0, 3, 3, 2, 0, 3, 2],
  [3, 2, 2, 2, 2, 1, 0, 1, 1, 0, 2, 2, 1, 0, 2, 1],
  [2, 2, 1, 1, 1, 0, 0, 0, 0, 3, 2, 1, 0, 0, 1, 0],
  [0, 0, 0, 0, 0, 3, 3, 2, 0, 2, 2, 0, 3, 3, 2, 0],
  [3, 3, 2, 1, 0, 2, 2, 1, 0, 1, 0, 3, 2, 2, 1, 0],
  [2, 2, 2, 1, 0, 2, 1, 0, 0, 0, 0, 2, 2, 1, 0, 0],
  [2, 1, 1, 0, 3, 2, 0, 3, 3, 2, 0, 1, 1, 0, 3, 2],
  [1, 1, 0, 0, 2, 1, 0, 2, 2, 1, 0, 0, 0, 0, 2, 1],
  [0, 0, 0, 0, 1, 0, 0, 1, 1, 0, 0, 3, 2, 1, 1, 0],
];

// Authentic MC-style ore nugget clusters (1 = shadow rim, 2 = ore base, 3 = bright specular glint)
const ORE_MASK = [
  [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  [0, 0, 0, 0, 0, 0, 0, 0, 0, 3, 2, 0, 0, 0, 0, 0],
  [0, 0, 3, 2, 0, 0, 0, 0, 3, 2, 2, 1, 0, 0, 0, 0],
  [0, 0, 2, 2, 1, 0, 0, 0, 0, 2, 1, 0, 0, 0, 0, 0],
  [0, 0, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 3, 2, 0],
  [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 2, 2, 1, 0],
  [0, 0, 0, 0, 0, 3, 2, 2, 0, 0, 0, 0, 0, 1, 0, 0],
  [0, 0, 0, 0, 0, 2, 3, 2, 1, 0, 0, 0, 0, 0, 0, 0],
  [0, 3, 2, 0, 0, 1, 2, 1, 0, 0, 0, 0, 0, 0, 0, 0],
  [0, 2, 1, 0, 0, 0, 0, 0, 0, 0, 3, 2, 0, 0, 0, 0],
  [0, 0, 0, 0, 0, 0, 0, 0, 0, 3, 2, 2, 1, 0, 0, 0],
  [0, 0, 0, 0, 0, 0, 0, 0, 0, 2, 2, 1, 0, 0, 0, 0],
  [0, 0, 0, 3, 2, 2, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0],
  [0, 0, 2, 2, 1, 1, 0, 0, 0, 0, 0, 0, 3, 2, 0, 0],
  [0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 2, 1, 0, 0],
  [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
];

// Grass side overhang profile per column (height of green turf lip)
const GRASS_LIP = [3, 4, 3, 2, 3, 4, 5, 3, 2, 3, 4, 3, 3, 4, 2, 3];

export function generatePresetPatternPixels(
  pattern: BlockPattern,
  primary: string,
  secondary: string,
  face: CubeFaceKey | 'side' = 'front',
  seed = 17,
  itemId = '',
): string[] {
  const pixels: string[] = new Array(256).fill(primary);
  const isTop = face === 'top';
  const isBottom = face === 'bottom';
  const isHorizontal = !isTop && !isBottom;
  const isFront = face === 'front' || face === 'side';

  for (let py = 0; py < TILE_PX; py++) {
    for (let px = 0; px < TILE_PX; px++) {
      const idx = py * TILE_PX + px;
      const n = hash2d(px, py, seed);
      const streak = hash2d(Math.floor(px / 2), py, seed + 19);
      let color = primary;

      if (pattern === 'grass_top') {
        if (isTop) {
          const clump = hash2d(Math.floor(px / 2), Math.floor(py / 2), seed + 5);
          if (clump > 0.72) color = shadeHex(primary, 18);
          else if (clump < 0.25) color = shadeHex(primary, -18);
          else color = shadeHex(primary, Math.round((n - 0.5) * 18));
        } else if (isHorizontal) {
          const lip = GRASS_LIP[px];
          const isPodzol = itemId === 'podzol';
          if (py < lip) {
            if (isPodzol) {
              color = py === lip - 1 ? '#5c3419' : n > 0.6 ? '#9c5c2e' : '#854b22';
            } else {
              color = py === lip - 1 ? '#367e26' : n > 0.6 ? '#5ec248' : '#4da83b';
            }
          } else if (py === lip) {
            color = '#3b2718'; // subtle turf shadow on dirt
          } else {
            const pebble = n > 0.91 ? '#70747a' : n < 0.16 ? secondary : shadeHex(primary, Math.round((n - 0.5) * 20));
            color = pebble;
          }
        } else {
          color = n > 0.9 ? '#70747a' : n < 0.2 ? secondary : shadeHex(primary, Math.round((n - 0.5) * 22));
        }
      } else if (pattern === 'dirt') {
        if (n > 0.92) color = '#6d7076'; // tiny stone pebbles
        else if (n < 0.2) color = secondary;
        else color = shadeHex(primary, Math.round((n - 0.5) * 24));
      } else if (pattern === 'stone') {
        // Horizontal sedimentary strata lines like classic MC stone
        const band = hash2d(Math.floor(px / 3), py, seed + 11);
        if (band > 0.78) color = shadeHex(primary, 16);
        else if (band < 0.22) color = secondary;
        else color = shadeHex(primary, Math.round((n - 0.5) * 12));
      } else if (pattern === 'cobble') {
        const m = COBBLE_MASK[py][px];
        if (m === 0) color = shadeHex(secondary, -14);
        else if (m === 1) color = secondary;
        else if (m === 2) color = shadeHex(primary, Math.round((n - 0.5) * 10));
        else color = shadeHex(primary, 24);
      } else if (pattern === 'ore') {
        const om = ORE_MASK[py][px];
        if (om === 0) {
          // Stone strata background
          const band = hash2d(Math.floor(px / 3), py, seed + 11);
          color = band > 0.76 ? shadeHex(primary, 14) : band < 0.24 ? shadeHex(primary, -18) : primary;
        } else if (om === 1) {
          color = shadeHex(secondary, -36);
        } else if (om === 2) {
          color = secondary;
        } else {
          color = shadeHex(secondary, 48); // bright ore glint
        }
      } else if (pattern === 'plank') {
        const row = Math.floor(py / 4);
        const yInRow = py % 4;
        const jointX = (row * 6 + 3) % 16;
        if (yInRow === 0 || px === jointX) {
          color = shadeHex(secondary, -18); // crisp plank groove
        } else if (yInRow === 1) {
          color = shadeHex(primary, 14); // top bevel highlight
        } else {
          const grain = hash2d(Math.floor(px / 2), py, seed + 3);
          color = grain > 0.65 ? secondary : shadeHex(primary, Math.round((n - 0.5) * 12));
        }
      } else if (pattern === 'log') {
        if (face === 'top' || face === 'bottom') {
          const dx = Math.abs(px - 7.5);
          const dy = Math.abs(py - 7.5);
          const ring = Math.max(dx, dy);
          if (ring > 6.6) color = secondary; // bark outer edge
          else if (ring > 5.0) color = shadeHex(primary, 22);
          else if (ring > 3.6) color = shadeHex(primary, -12);
          else if (ring > 2.2) color = shadeHex(primary, 16);
          else color = shadeHex(primary, -22);
        } else {
          // Vertical bark striations (special lenticels for birch)
          const isBirch = primary.toLowerCase() === '#e5e7eb';
          if (isBirch) {
            const lenticel = (py % 4 === 1 && px >= 2 && px <= 6) || (py % 5 === 3 && px >= 9 && px <= 14);
            color = lenticel ? secondary : shadeHex(primary, Math.round((n - 0.5) * 14));
          } else {
            const groove = px % 4 === 0 || (px % 4 === 2 && streak > 0.6);
            color = groove ? secondary : shadeHex(primary, Math.round((n - 0.5) * 16));
          }
        }
      } else if (pattern === 'leaves') {
        const cluster = hash2d(Math.floor(px / 2), Math.floor(py / 2), seed + 23);
        if (n < 0.17) {
          color = 'transparent';
        } else if (cluster > 0.72) {
          color = shadeHex(primary, 24);
        } else if (cluster < 0.28) {
          color = secondary;
        } else {
          color = shadeHex(primary, Math.round((n - 0.5) * 20));
        }
      } else if (pattern === 'brick') {
        const row = Math.floor(py / 4);
        const yInRow = py % 4;
        const offset = (row % 2) * 4;
        const xInBrick = (px + offset) % 8;
        if (yInRow === 0 || xInBrick === 0) {
          color = secondary; // mortar
        } else if (yInRow === 1) {
          color = shadeHex(primary, 18); // brick top highlight
        } else {
          const brickTint = hash2d(Math.floor((px + offset) / 8), row, seed + 41);
          color = shadeHex(primary, Math.round((brickTint - 0.5) * 24 + (n - 0.5) * 10));
        }
      } else if (pattern === 'tile' || pattern === 'metal_block') {
        const edge = px === 0 || px === 15 || py === 0 || py === 15;
        const innerBevelTL = (px === 1 || py === 1) && px < 15 && py < 15;
        const innerBevelBR = (px === 14 || py === 14) && px > 0 && py > 0;
        const sheen = px + py >= 7 && px + py <= 9 && px > 2 && px < 13;
        if (edge) color = secondary;
        else if (innerBevelTL) color = shadeHex(primary, 36);
        else if (innerBevelBR) color = shadeHex(primary, -26);
        else if (sheen) color = shadeHex(primary, 24);
        else color = shadeHex(primary, Math.round((n - 0.5) * 8));
      } else if (pattern === 'glass') {
        const border = px === 0 || px === 15 || py === 0 || py === 15;
        const innerBorder = px === 1 || px === 14 || py === 1 || py === 14;
        const glint =
          (px === 3 && py === 3) ||
          (px === 4 && py === 3) ||
          (px === 3 && py === 4) ||
          (px + py === 11 && px >= 4 && px <= 7) ||
          (px + py === 21 && px >= 10 && px <= 12);
        if (border) color = secondary;
        else if (glint) color = '#ffffff';
        else if (innerBorder) color = mixHex(primary, secondary, 0.35);
        else color = 'rgba_glass';
      } else if (pattern === 'water') {
        const wave = ((px + py * 2) % 7 === 0) || (py % 5 === 2 && px % 4 === 1);
        color = wave ? shadeHex(primary, 48) : n > 0.5 ? primary : secondary;
      } else if (pattern === 'lava') {
        const cell = hash2d(Math.floor(px / 2), Math.floor(py / 2), seed + 61);
        color = cell > 0.78 ? mixHex(shadeHex(primary, 75), '#fef08a', 0.45) : cell > 0.45 ? primary : secondary;
      } else if (pattern === 'glow') {
        const vein = (px + py) % 5 === 0 || (px % 4 === 0 && py % 4 === 0);
        color = vein ? secondary : n > 0.62 ? '#fef9c3' : primary;
      } else if (pattern === 'sand') {
        const ripple = (px + py * 2) % 6 === 0 && n > 0.4;
        color = ripple ? shadeHex(primary, 12) : n > 0.78 ? secondary : shadeHex(primary, Math.round((n - 0.5) * 16));
      } else if (pattern === 'wool') {
        const weave = (px + py) % 2 === 0;
        color = weave ? shadeHex(primary, Math.round((n - 0.5) * 14)) : mixHex(primary, secondary, 0.32);
      } else if (pattern === 'craft') {
        if (isTop) {
          const border = px === 0 || px === 15 || py === 0 || py === 15;
          const grid = px === 5 || px === 10 || py === 5 || py === 10;
          color = border ? secondary : grid ? '#3f2612' : shadeHex(primary, Math.round((n - 0.5) * 12));
        } else {
          const border = px === 0 || px === 15 || py === 0 || py === 15;
          const plankSeam = py === 4 || py === 11;
          const sawTool = px >= 3 && px <= 6 && py >= 5 && py <= 10;
          const hammerTool = px >= 10 && px <= 13 && py >= 5 && py <= 10;
          if (border || plankSeam) color = secondary;
          else if (sawTool || hammerTool) color = py === 5 ? '#cbd5e1' : '#78350f';
          else color = shadeHex(primary, Math.round((n - 0.5) * 12));
        }
      } else if (pattern === 'furnace') {
        const border = px === 0 || px === 15 || py === 0 || py === 15;
        if (isFront) {
          const mouth = px >= 4 && px <= 11 && py >= 10 && py <= 14;
          const slot = px >= 4 && px <= 11 && py >= 3 && py <= 6;
          if (border) color = secondary;
          else if (mouth) color = py >= 12 ? '#fb923c' : '#111827';
          else if (slot) color = '#1f2937';
          else color = shadeHex(primary, Math.round((n - 0.5) * 18));
        } else {
          color = border ? secondary : shadeHex(primary, Math.round((n - 0.5) * 18));
        }
      } else if (pattern === 'chest') {
        const border = px === 0 || px === 15 || py === 0 || py === 15;
        const seam = py === 5;
        const latch = isFront && px >= 6 && px <= 9 && py >= 4 && py <= 7;
        if (latch) color = '#facc15';
        else if (border || (isHorizontal && seam)) color = secondary;
        else color = shadeHex(primary, Math.round((n - 0.5) * 12));
      } else if (pattern === 'tnt') {
        if (isHorizontal && py >= 5 && py <= 10) {
          const letter =
            (py >= 6 && py <= 9 && (px === 2 || px === 6 || px === 9 || px === 13)) ||
            (py === 6 && (px === 1 || px === 3 || px === 12 || px === 14)) ||
            (py === 7 && px === 7) ||
            (py === 8 && px === 8);
          color = letter ? '#111827' : '#f8fafc';
        } else {
          color = px % 2 === 0 ? primary : shadeHex(primary, -28);
        }
      } else if (pattern === 'bookshelf') {
        if (isTop || isBottom) {
          color = py % 4 === 0 ? shadeHex(primary, -22) : shadeHex(primary, Math.round((n - 0.5) * 12));
        } else {
          const shelf = py === 0 || py === 1 || py === 7 || py === 8 || py === 14 || py === 15;
          const books = ['#dc2626', '#2563eb', '#16a34a', '#eab308', '#9333ea', '#0ea5e9'];
          if (shelf) color = primary;
          else if (py === 3 || py === 10) color = '#fde68a';
          else color = books[(Math.floor(px / 2) + Math.floor(py / 8) * 3) % books.length];
        }
      } else if (pattern === 'cactus') {
        const rib = px % 4 === 0;
        const spike = (px + py * 3) % 13 === 0;
        color = spike ? '#fef9c3' : rib ? secondary : shadeHex(primary, Math.round((n - 0.5) * 14));
      } else if (pattern === 'pumpkin') {
        const rib = px % 4 === 0;
        const eye = isFront && ((px >= 3 && px <= 5 && py >= 4 && py <= 6) || (px >= 10 && px <= 12 && py >= 4 && py <= 6));
        const mouth = isFront && px >= 4 && px <= 11 && py >= 10 && py <= 12 && (px % 2 === 0 || py === 11);
        color = eye || mouth ? secondary : rib ? shadeHex(primary, -24) : primary;
      } else if (pattern === 'torch') {
        if (px >= 6 && px <= 9 && py >= 3) {
          color = py < 6 ? '#fef08a' : py < 8 ? primary : secondary;
        } else {
          color = 'transparent';
        }
      } else if (pattern === 'lantern') {
        // Hanging/standing iron & glowing amber lantern sprite
        const ring = py === 2 && px >= 6 && px <= 9;
        const capTop = py === 4 && px >= 5 && px <= 10;
        const capBot = py === 14 && px >= 4 && px <= 11;
        const frame =
          (py >= 5 && py <= 13 && (px === 4 || px === 11)) ||
          (py === 5 && px >= 4 && px <= 11) ||
          (py === 13 && px >= 4 && px <= 11);
        const core = py >= 6 && py <= 12 && px >= 5 && px <= 10;
        if (ring || capTop || capBot || frame) {
          color = (px + py) % 2 === 0 ? '#1e293b' : '#334155';
        } else if (core) {
          const center = px >= 7 && px <= 8 && py >= 8 && py <= 10;
          color = center ? '#fef9c3' : py <= 8 ? '#fde047' : '#f59e0b';
        } else {
          color = 'transparent';
        }
      } else if (pattern === 'foliage_cross') {
        if (itemId === 'sugar_cane') {
          const stalkA = (px === 3 || px === 4 || px === 11 || px === 12) && py >= 1;
          const stalkB = (px === 7 || px === 8) && py >= 3;
          if (stalkA || stalkB) {
            color = py % 5 === 0 ? secondary : (px % 2 === 0 ? primary : shadeHex(primary, 16));
          } else {
            color = 'transparent';
          }
        } else if (itemId === 'dead_bush') {
          const stem = (px === 7 || px === 8) && py >= 10;
          const branchL = px >= 3 && px <= 7 && py === 12 - (7 - px);
          const branchR = px >= 8 && px <= 12 && py === 11 - (px - 8);
          const twig = (px === 4 && py >= 5 && py <= 8) || (px === 11 && py >= 4 && py <= 7);
          color = stem || branchL || branchR || twig ? (n > 0.5 ? primary : secondary) : 'transparent';
        } else if (itemId === 'red_mushroom' || itemId === 'brown_mushroom') {
          const cap =
            (py === 6 && px >= 5 && px <= 10) ||
            (py === 7 && px >= 4 && px <= 11) ||
            (py >= 8 && py <= 10 && px >= 3 && px <= 12);
          const spot =
            itemId === 'red_mushroom' &&
            ((px === 5 && py === 8) || (px === 6 && py === 8) || (px === 10 && py === 7) || (px === 9 && py === 9));
          const stem = py >= 11 && py <= 15 && px >= 6 && px <= 9;
          if (spot) color = '#f8fafc';
          else if (cap) color = py === 10 ? shadeHex(primary, -20) : primary;
          else if (stem) color = px === 6 ? '#cbd5e1' : '#f1f5f9';
          else color = 'transparent';
        } else if (itemId === 'tall_grass') {
          const blade1 = px === 3 && py >= 5;
          const blade2 = px === 6 && py >= 3;
          const blade3 = px === 9 && py >= 4;
          const blade4 = px === 12 && py >= 6;
          const blade5 = (px === 5 || px === 10) && py >= 9;
          if (blade1 || blade2 || blade3 || blade4 || blade5) {
            color = py < 7 ? shadeHex(primary, 20) : py > 12 ? secondary : primary;
          } else {
            color = 'transparent';
          }
        } else {
          // Flower (poppy, dandelion, blue_orchid, pink_tulip)
          const stem = (px === 7 || px === 8) && py >= 8;
          const leaf = (py === 12 && px >= 5 && px <= 6) || (py === 11 && px >= 9 && px <= 10);
          const petal =
            (py >= 3 && py <= 7 && px >= 5 && px <= 10) &&
            !((px === 5 || px === 10) && (py === 3 || py === 7));
          const center = py >= 4 && py <= 6 && px >= 7 && px <= 8;
          if (center) color = itemId === 'poppy' ? '#1e293b' : '#fef08a';
          else if (petal) color = py === 3 ? shadeHex(primary, 24) : primary;
          else if (stem || leaf) color = leaf ? '#15803d' : '#16a34a';
          else color = 'transparent';
        }
      } else if (pattern === 'bamboo') {
        if (px >= 5 && px <= 10) {
          const node = py % 6 === 0;
          const edge = px === 5 || px === 10;
          color = node ? secondary : edge ? shadeHex(primary, -20) : px === 7 ? shadeHex(primary, 24) : primary;
        } else if ((py === 3 || py === 9) && ((px >= 2 && px <= 4) || (px >= 11 && px <= 13))) {
          color = secondary;
        } else {
          color = 'transparent';
        }
      } else if (pattern === 'pillar') {
        if (isTop || isBottom) {
          const ring = px === 0 || px === 15 || py === 0 || py === 15 || px === 3 || px === 12 || py === 3 || py === 12;
          color = ring ? secondary : shadeHex(primary, Math.round((n - 0.5) * 10));
        } else {
          const cap = py === 0 || py === 1 || py === 14 || py === 15;
          const flute = px === 2 || px === 5 || px === 8 || px === 11 || px === 14;
          color = cap ? secondary : flute ? shadeHex(primary, -18) : shadeHex(primary, Math.round((n - 0.5) * 8));
        }
      } else if (pattern === 'chiseled') {
        const border = px === 0 || px === 15 || py === 0 || py === 15;
        const innerSq =
          ((px === 3 || px === 12) && py >= 3 && py <= 12) ||
          ((py === 3 || py === 12) && px >= 3 && px <= 12);
        const coreSq = px >= 6 && px <= 9 && py >= 6 && py <= 9;
        color = border || innerSq ? secondary : coreSq ? shadeHex(primary, -22) : shadeHex(primary, Math.round((n - 0.5) * 10));
      } else if (pattern === 'cracked') {
        const row = Math.floor(py / 4);
        const yInRow = py % 4;
        const offset = (row % 2) * 4;
        const xInBrick = (px + offset) % 8;
        const crack =
          (px === 4 && py >= 2 && py <= 6) ||
          (px === 5 && py >= 5 && py <= 8) ||
          (px === 11 && py >= 9 && py <= 13) ||
          (px === 10 && py >= 12 && py <= 14);
        if (crack) color = '#1e293b';
        else if (yInRow === 0 || xInBrick === 0) color = secondary;
        else color = shadeHex(primary, Math.round((n - 0.5) * 14));
      } else if (pattern === 'mossy') {
        const m = COBBLE_MASK[py][px];
        const mossPatch = hash2d(Math.floor(px / 2), Math.floor(py / 2), seed + 91) > 0.64;
        if (mossPatch && (m === 0 || m === 1 || n > 0.55)) {
          color = n > 0.5 ? '#4d7c0f' : '#3f6212';
        } else if (m === 0) color = shadeHex(secondary, -14);
        else if (m === 1) color = secondary;
        else if (m === 2) color = shadeHex(primary, Math.round((n - 0.5) * 10));
        else color = shadeHex(primary, 22);
      } else if (pattern === 'terracotta') {
        const band = Math.floor(py / 3) % 2 === 0;
        color = band ? shadeHex(primary, Math.round((n - 0.5) * 10)) : mixHex(primary, secondary, 0.28);
      } else if (pattern === 'concrete') {
        color = shadeHex(primary, Math.round((n - 0.5) * 8));
      } else if (pattern === 'magma') {
        const cell = hash2d(Math.floor(px / 2), Math.floor(py / 2), seed + 73);
        const crack = (px + py * 2) % 6 === 0 || (px * 2 - py + 16) % 7 === 0;
        if (crack && cell > 0.35) color = cell > 0.7 ? '#fef08a' : '#f97316';
        else if (cell > 0.8) color = '#ea580c';
        else color = shadeHex(primary, Math.round((n - 0.5) * 14));
      } else if (pattern === 'prismarine') {
        const crack = (px + py) % 5 === 0 || (px - py + 16) % 6 === 0;
        color = crack ? secondary : shadeHex(primary, Math.round((n - 0.5) * 20));
      } else if (pattern === 'netherrack') {
        const pocket = hash2d(Math.floor(px / 2), Math.floor(py / 2), seed + 83);
        color = pocket > 0.72 ? secondary : pocket < 0.25 ? shadeHex(primary, 18) : shadeHex(primary, Math.round((n - 0.5) * 18));
      } else if (pattern === 'hay') {
        if (isHorizontal && (py === 4 || py === 5 || py === 11 || py === 12)) {
          color = '#b91c1c';
        } else {
          const straw = isTop || isBottom ? px % 2 === 0 : py % 2 === 0;
          color = straw ? shadeHex(primary, Math.round((n - 0.5) * 16)) : secondary;
        }
      } else if (pattern === 'melon') {
        if (isTop || isBottom) {
          const center = px >= 6 && px <= 9 && py >= 6 && py <= 9;
          color = center ? '#a16207' : px % 3 === 0 ? secondary : primary;
        } else {
          const stripe = px % 4 === 0 || px % 4 === 1;
          color = stripe ? secondary : shadeHex(primary, Math.round((n - 0.5) * 14));
        }
      } else {
        color = n > 0.68 ? secondary : shadeHex(primary, Math.round((n - 0.5) * 18));
      }

      pixels[idx] = color;
    }
  }
  return pixels;
}

function applyToneHex(hex: string, brightness = 0, contrast = 1): string {
  if (hex === 'transparent' || hex === 'rgba_glass') return hex;
  if (brightness === 0 && contrast === 1) return hex;
  const [r, g, b] = hexToRgb(hex);
  const adj = (v: number) => (v - 128) * contrast + 128 + brightness;
  return rgbToHex(adj(r), adj(g), adj(b));
}

function resolvePackColors(
  item: ItemDef,
  face: CubeFaceKey,
  pack: TexturePackDef,
): { primary: string; secondary: string } {
  const pal = pack.palette || {};
  let primary = face === 'top' && item.topColor ? item.topColor : item.color;
  let secondary = item.secondaryColor || shadeHex(primary, -24);

  if (item.id === 'grass') {
    if (face === 'top' && pal.grassTop) {
      primary = pal.grassTop;
      secondary = shadeHex(pal.grassTop, -24);
    } else if (face !== 'top' && pal.dirt) {
      primary = pal.dirt;
      secondary = shadeHex(pal.dirt, -24);
    }
  } else if (item.id === 'dirt' && pal.dirt) {
    primary = pal.dirt;
    secondary = shadeHex(pal.dirt, -24);
  } else if (
    (item.id === 'stone' ||
      (item.category === 'ore' &&
        item.pattern === 'ore' &&
        !item.id.startsWith('deepslate_'))) &&
    pal.stone
  ) {
    primary = pal.stone;
    if (item.id === 'stone') secondary = shadeHex(pal.stone, -24);
  } else if ((item.id === 'deepslate' || (item.id.startsWith('deepslate_') && item.pattern === 'ore')) && pal.deepslate) {
    primary = pal.deepslate;
    if (item.id === 'deepslate') secondary = shadeHex(pal.deepslate, -20);
  } else if (item.id === 'cobblestone' && pal.cobblestone) {
    primary = pal.cobblestone;
    secondary = shadeHex(pal.cobblestone, -30);
  } else if (item.category === 'wood' && item.pattern === 'plank' && pal.wood) {
    primary = pal.wood;
    secondary = shadeHex(pal.wood, -28);
  } else if (item.pattern === 'leaves' && pal.leaves) {
    primary = pal.leaves;
    secondary = shadeHex(pal.leaves, -28);
  } else if (item.id === 'sand' && pal.sand) {
    primary = pal.sand;
    secondary = shadeHex(pal.sand, -20);
  } else if (item.id === 'water' && pal.water) {
    primary = pal.water;
    secondary = shadeHex(pal.water, -24);
  } else if (item.id === 'bricks' && pal.brick) {
    primary = pal.brick;
  }

  return { primary, secondary };
}

export function resolveOverrideFaceString(
  override: TexturePackBlockOverride | undefined,
  face: CubeFaceKey,
  itemId?: string,
): string | undefined {
  if (!override) return undefined;
  const slotId = override.faceMap?.[face];
  if (slotId && override.textures?.[slotId]) {
    return override.textures[slotId];
  }
  const direct = override[face];
  if (direct) return direct;
  const isHorizontal = face === 'right' || face === 'left' || face === 'front' || face === 'back';
  if (isHorizontal && override.side) return override.side;
  if (!isHorizontal && override.side && itemId !== 'grass') return override.side;
  return undefined;
}

export function getResolvedBlockPixels(
  item: ItemDef,
  face: CubeFaceKey | 'side' = 'front',
  seed?: number,
): { pixels: string[]; primary: string } {
  const resolvedFace: CubeFaceKey = face === 'side' ? 'front' : face;
  const effectiveSeed = seed ?? hashStringSeed(item.id);
  const pack = getActiveTexturePack();
  const { primary, secondary } = resolvePackColors(item, resolvedFace, pack);
  const override = pack.blockOverrides?.[item.id];
  const overrideStr = resolveOverrideFaceString(override, resolvedFace, item.id);

  if (overrideStr) {
    const arr = overrideStr.split(',');
    if (arr.length === 256) {
      return { pixels: arr, primary };
    }
  }

  const modFaceStr = item.faceTextures?.[resolvedFace] || item.customTexture;
  if (modFaceStr) {
    if (modFaceStr.startsWith('data:image')) {
      const decoded = decodePngDataUrlToPixels(modFaceStr);
      if (decoded && decoded.length === 256) {
        return { pixels: decoded, primary };
      }
    } else {
      const customArr = modFaceStr.split(',');
      if (customArr.length === 256) {
        return { pixels: customArr, primary };
      }
    }
  }

  let pixels = generatePresetPatternPixels(
    item.pattern,
    primary,
    secondary,
    resolvedFace,
    effectiveSeed,
    item.id,
  );
  const pal = pack.palette;
  if (
    item.id === 'grass' &&
    (resolvedFace === 'right' || resolvedFace === 'left' || resolvedFace === 'front' || resolvedFace === 'back') &&
    pal?.grassTop
  ) {
    const lip = [3, 4, 3, 2, 3, 4, 5, 3, 2, 3, 4, 3, 3, 4, 2, 3];
    const topHex = pal.grassTop;
    pixels = pixels.map((c, idx) => {
      const px = idx % 16;
      const py = Math.floor(idx / 16);
      if (py < lip[px]) {
        return py === lip[px] - 1 ? shadeHex(topHex, -22) : (px + py) % 2 === 0 ? topHex : shadeHex(topHex, 14);
      }
      return c;
    });
  }

  if (pal && ((pal.brightness && pal.brightness !== 0) || (pal.contrast && pal.contrast !== 1))) {
    const b = pal.brightness || 0;
    const con = pal.contrast ?? 1;
    pixels = pixels.map((c) => applyToneHex(c, b, con));
  }

  return { pixels, primary };
}

function paintPixelsToAtlas(
  ctx: CanvasRenderingContext2D,
  ox: number,
  oy: number,
  pixels: string[],
  fallbackColor: string,
  isWater = false,
) {
  for (let py = 0; py < TILE_PX; py++) {
    for (let px = 0; px < TILE_PX; px++) {
      const val = pixels[py * TILE_PX + px] || fallbackColor;
      if (val === 'transparent') {
        ctx.clearRect(ox + px, oy + py, 1, 1);
      } else if (val === 'rgba_glass') {
        ctx.fillStyle = fallbackColor;
        ctx.globalAlpha = 0.28;
        ctx.fillRect(ox + px, oy + py, 1, 1);
        ctx.globalAlpha = 1;
      } else if (isWater) {
        ctx.fillStyle = val;
        ctx.globalAlpha = 0.74;
        ctx.fillRect(ox + px, oy + py, 1, 1);
        ctx.globalAlpha = 1;
      } else {
        ctx.fillStyle = val;
        ctx.fillRect(ox + px, oy + py, 1, 1);
      }
    }
  }
}

export function createHeldBlockTextures(itemId: string): THREE.CanvasTexture[] | null {
  const item = getItemDef(itemId);
  if (!item || !item.isBlock) return null;
  // Matches Three.js BoxGeometry material group order: +X(right), -X(left), +Y(top), -Y(bottom), +Z(front), -Z(back)
  const boxOrder: CubeFaceKey[] = ['right', 'left', 'top', 'bottom', 'front', 'back'];
  const isWater = item.liquid ? Boolean(item.transparent) : item.pattern === 'water';
  return boxOrder.map((face) => {
    const { pixels, primary } = getResolvedBlockPixels(item, face);
    const canvas = document.createElement('canvas');
    canvas.width = TILE_PX;
    canvas.height = TILE_PX;
    const ctx = canvas.getContext('2d')!;
    paintPixelsToAtlas(ctx, 0, 0, pixels, primary, isWater);
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.magFilter = THREE.NearestFilter;
    tex.minFilter = THREE.NearestFilter;
    tex.generateMipmaps = false;
    tex.needsUpdate = true;
    return tex;
  });
}

export function getTextureAtlas(): TextureAtlasBundle {
  const version = `${getRegistryVersion()}_${getTexturePackVersion()}_${atlasPngVersion}`;
  if (cachedAtlas && cachedAtlas.version === version) {
    return cachedAtlas;
  }

  const blocks = getAllItems().filter((item) => item.isBlock);
  const tileMap = new Map<string, BlockTileIndices>();
  const dedupeMap = new Map<string, number>();
  let nextIdx = 0;

  const drawJobs: {
    idx: number;
    pixels: string[];
    primary: string;
    isWater: boolean;
  }[] = [];

  // Reserve a pure white solid tile so 3D custom models tint cleanly via vertexColors
  const whiteTileIdx = nextIdx++;
  drawJobs.push({
    idx: whiteTileIdx,
    pixels: new Array(256).fill('#ffffff'),
    primary: '#ffffff',
    isWater: false,
  });

  for (const item of blocks) {
    const isWater = item.liquid ? Boolean(item.transparent) : item.pattern === 'water';
    const seed = hashStringSeed(item.id);
    const resolvedIndices: Partial<Record<CubeFaceKey, number>> = {};

    for (const face of ALL_CUBE_FACES) {
      const { pixels, primary } = getResolvedBlockPixels(item, face, seed);
      const dedupeKey = `${isWater ? 'w' : 'o'}:${pixels.join(',')}`;
      let tileIdx = dedupeMap.get(dedupeKey);
      if (tileIdx === undefined) {
        tileIdx = nextIdx++;
        dedupeMap.set(dedupeKey, tileIdx);
        drawJobs.push({
          idx: tileIdx,
          pixels,
          primary,
          isWater,
        });
      }
      resolvedIndices[face] = tileIdx;
    }

    tileMap.set(item.id, {
      right: resolvedIndices.right!,
      left: resolvedIndices.left!,
      front: resolvedIndices.front!,
      back: resolvedIndices.back!,
      top: resolvedIndices.top!,
      bottom: resolvedIndices.bottom!,
      side: resolvedIndices.front!,
    });
  }

  const rows = Math.max(1, Math.ceil(nextIdx / ATLAS_COLS));
  const canvas = document.createElement('canvas');
  canvas.width = ATLAS_COLS * TILE_PX;
  canvas.height = rows * TILE_PX;
  const ctx = canvas.getContext('2d')!;
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  for (const job of drawJobs) {
    const col = job.idx % ATLAS_COLS;
    const row = Math.floor(job.idx / ATLAS_COLS);
    const ox = col * TILE_PX;
    const oy = row * TILE_PX;
    paintPixelsToAtlas(ctx, ox, oy, job.pixels, job.primary, job.isWater);
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.magFilter = THREE.NearestFilter;
  texture.minFilter = THREE.NearestFilter;
  texture.generateMipmaps = false;
  texture.needsUpdate = true;

  if (cachedAtlas) {
    cachedAtlas.texture.dispose();
  }

  cachedAtlas = {
    texture,
    cols: ATLAS_COLS,
    rows,
    tileMap,
    whiteTileIdx,
    version,
  };
  iconCache.clear();
  return cachedAtlas;
}

export function getItemIconUrl(itemId: string): string {
  const key = `${getRegistryVersion()}_${getTexturePackVersion()}_${atlasPngVersion}_${itemId}`;
  const cached = iconCache.get(key);
  if (cached) return cached;

  const item = getItemDef(itemId);
  const canvas = document.createElement('canvas');
  canvas.width = 48;
  canvas.height = 48;
  const ctx = canvas.getContext('2d')!;
  ctx.imageSmoothingEnabled = false;

  if (!item) return '';

  // Custom 3D Cuboid Model Icon Render
  if (item.customModel && item.customModel.parts.length > 0) {
    if (item.customModel.thumbnailPng?.startsWith('data:image')) {
      return item.customModel.thumbnailPng;
    }
    const sorted = [...item.customModel.parts].sort((a, b) => a.z + a.y - (b.z + b.y));
    for (const part of sorted) {
      const sx = 8 + (part.x / 16) * 24 + (part.z / 16) * 8;
      const sy = 36 - ((part.y + part.h) / 16) * 26 + (part.z / 16) * 4;
      const sw = Math.max(3, (part.w / 16) * 26);
      const sh = Math.max(3, (part.h / 16) * 26);
      ctx.fillStyle = shadeHex(part.color, -26);
      ctx.fillRect(sx + 2, sy + 2, sw, sh);
      ctx.fillStyle = part.color;
      ctx.fillRect(sx, sy, sw, sh);
      ctx.fillStyle = shadeHex(part.color, 26);
      ctx.fillRect(sx, sy, sw, Math.max(2, sh * 0.25));
    }
    const url = canvas.toDataURL();
    iconCache.set(key, url);
    return url;
  }

  if (item.isBlock) {
    if (
      item.pattern === 'torch' ||
      item.pattern === 'lantern' ||
      item.pattern === 'foliage_cross' ||
      item.pattern === 'bamboo' ||
      item.id === 'torch'
    ) {
      const { pixels, primary } = getResolvedBlockPixels(item, 'front');
      const faceCanvas = document.createElement('canvas');
      faceCanvas.width = TILE_PX;
      faceCanvas.height = TILE_PX;
      paintPixelsToAtlas(faceCanvas.getContext('2d')!, 0, 0, pixels, primary, false);
      ctx.drawImage(faceCanvas, 6, 4, 36, 40);
      const url = canvas.toDataURL();
      iconCache.set(key, url);
      return url;
    }

    const isWater = item.liquid ? Boolean(item.transparent) : item.pattern === 'water';
    const isTransparent = Boolean(item.transparent);
    const makeShadedFaceCanvas = (face: CubeFaceKey, shadeDelta: number): HTMLCanvasElement => {
      const { pixels, primary } = getResolvedBlockPixels(item, face);
      const shadedPixels =
        shadeDelta === 0
          ? pixels
          : pixels.map((px) =>
              px === 'transparent' || px === 'rgba_glass' ? px : shadeHex(px, shadeDelta),
            );
      const fc = document.createElement('canvas');
      fc.width = TILE_PX;
      fc.height = TILE_PX;
      const fctx = fc.getContext('2d')!;
      paintPixelsToAtlas(
        fctx,
        0,
        0,
        shadedPixels,
        shadeDelta === 0 ? primary : shadeHex(primary, shadeDelta),
        isWater,
      );
      return fc;
    };

    const topCanvas = makeShadedFaceCanvas('top', 0);
    const frontCanvas = makeShadedFaceCanvas('front', -16);
    const rightCanvas = makeShadedFaceCanvas('right', -38);
    const pad = isTransparent ? 0 : 0.08;

    // 1. Top isometric face: T(24,3), RU(42,13), M(24,23), LU(6,13)
    ctx.save();
    ctx.setTransform(1.125, 0.625, -1.125, 0.625, 24, 3);
    ctx.drawImage(topCanvas, 0, 0, 16, 16, -pad, -pad, 16 + pad * 2, 16 + pad * 2);
    ctx.restore();

    // 2. Left isometric face (shows block's Front face): LU(6,13), M(24,23), B(24,44), LL(6,34)
    ctx.save();
    ctx.setTransform(1.125, 0.625, 0, 1.3125, 6, 13);
    ctx.drawImage(frontCanvas, 0, 0, 16, 16, -pad, -pad, 16 + pad * 2, 16 + pad * 2);
    ctx.restore();

    // 3. Right isometric face (shows block's Right face): M(24,23), RU(42,13), RL(42,34), B(24,44)
    ctx.save();
    ctx.setTransform(1.125, -0.625, 0, 1.3125, 24, 23);
    ctx.drawImage(rightCanvas, 0, 0, 16, 16, -pad, -pad, 16 + pad * 2, 16 + pad * 2);
    ctx.restore();
  } else if (item.customTexture) {
    if (item.customTexture.startsWith('data:image')) {
      const decoded = decodePngDataUrlToPixels(item.customTexture);
      if (decoded && decoded.length === 256) {
        const itemCanvas = document.createElement('canvas');
        itemCanvas.width = TILE_PX;
        itemCanvas.height = TILE_PX;
        paintPixelsToAtlas(itemCanvas.getContext('2d')!, 0, 0, decoded, item.color, false);
        ctx.drawImage(itemCanvas, 4, 4, 40, 40);
      } else {
        ctx.fillStyle = item.color;
        ctx.fillRect(10, 10, 28, 28);
      }
    } else {
      const pxArr = item.customTexture.split(',');
      const itemCanvas = document.createElement('canvas');
      itemCanvas.width = TILE_PX;
      itemCanvas.height = TILE_PX;
      const ictx = itemCanvas.getContext('2d')!;
      for (let y = 0; y < TILE_PX; y++) {
        for (let x = 0; x < TILE_PX; x++) {
          const val = pxArr[y * TILE_PX + x];
          if (!val || val === 'transparent') continue;
          ictx.fillStyle = val === 'rgba_glass' ? item.color : val;
          ictx.fillRect(x, y, 1, 1);
        }
      }
      ctx.drawImage(itemCanvas, 4, 4, 40, 40);
    }
  } else if (item.weapon && item.weapon.weaponKind !== 'melee') {
    // Gun / Staff icon
    ctx.scale(1.5, 1.5);
    if (item.weapon.weaponKind === 'gun') {
      ctx.fillStyle = '#1e293b';
      ctx.fillRect(6, 10, 18, 5);
      ctx.fillRect(8, 15, 5, 9);
      ctx.fillStyle = item.color;
      ctx.fillRect(10, 11, 16, 3);
      ctx.fillStyle = '#facc15';
      ctx.fillRect(14, 8, 4, 2);
    } else {
      ctx.fillStyle = '#78350f';
      for (let i = 0; i < 10; i++) ctx.fillRect(6 + i * 2, 24 - i * 2, 3, 3);
      ctx.fillStyle = item.color;
      ctx.fillRect(20, 4, 7, 7);
      ctx.fillStyle = '#fef08a';
      ctx.fillRect(22, 6, 3, 3);
    }
  } else if (item.toolType) {
    ctx.scale(1.5, 1.5);
    ctx.fillStyle = '#78350f';
    for (let i = 0; i < 10; i++) {
      ctx.fillRect(6 + i * 2, 24 - i * 2, 3, 3);
    }
    ctx.fillStyle = item.color;
    if (item.toolType === 'pickaxe') {
      ctx.fillRect(12, 4, 12, 3);
      ctx.fillRect(22, 6, 4, 8);
      ctx.fillRect(9, 6, 4, 3);
    } else if (item.toolType === 'axe') {
      ctx.fillRect(16, 4, 10, 9);
      ctx.fillRect(14, 6, 4, 6);
    } else if (item.toolType === 'shovel') {
      ctx.fillRect(20, 4, 8, 8);
    } else if (item.toolType === 'sword') {
      ctx.fillStyle = '#78350f';
      ctx.fillRect(6, 22, 4, 4);
      ctx.fillRect(10, 18, 4, 4);
      ctx.fillStyle = item.color;
      for (let i = 0; i < 8; i++) {
        ctx.fillRect(12 + i * 2, 18 - i * 2, 4, 4);
      }
    }
  } else {
    ctx.scale(1.5, 1.5);
    if (item.placesLiquidId || item.isEmptyBucket) {
      // Crisp Minecraft-style Iron Bucket icon with liquid pool + custom texture support
      // Handle arc
      ctx.fillStyle = '#475569';
      ctx.fillRect(10, 4, 12, 2);
      ctx.fillRect(8, 6, 2, 4);
      ctx.fillRect(22, 6, 2, 4);
      ctx.fillStyle = '#cbd5e1';
      ctx.fillRect(11, 5, 10, 1);

      // Bucket body outline & metallic shading
      const bodyRows = [
        [6, 20],
        [6, 20],
        [7, 18],
        [7, 18],
        [8, 16],
        [8, 16],
        [9, 14],
        [9, 14],
        [10, 12],
      ];
      bodyRows.forEach(([bx, bw], idx) => {
        const by = 9 + idx * 2;
        ctx.fillStyle = idx === bodyRows.length - 1 ? '#334155' : '#94a3b8';
        ctx.fillRect(bx, by, bw, 2);
        if (idx < bodyRows.length - 1) {
          ctx.fillStyle = '#475569';
          ctx.fillRect(bx, by, 2, 2);
          ctx.fillRect(bx + bw - 2, by, 2, 2);
          ctx.fillStyle = '#e2e8f0';
          ctx.fillRect(bx + 2, by, 3, 2);
          ctx.fillStyle = '#64748b';
          ctx.fillRect(bx + bw - 5, by, 3, 2);
        }
      });

      // Top rim highlight
      ctx.fillStyle = '#475569';
      ctx.fillRect(7, 9, 18, 2);

      if (item.isEmptyBucket) {
        ctx.fillStyle = '#1e293b';
        ctx.fillRect(9, 10, 14, 4);
        ctx.fillStyle = '#0f172a';
        ctx.fillRect(11, 11, 10, 2);
      } else {
        const liquidDef = item.placesLiquidId ? getItemDef(item.placesLiquidId) : undefined;
        const texSource = item.customTexture || liquidDef?.customTexture;
        const liqPrimary = item.color || liquidDef?.color || '#2563eb';
        const liqSecondary =
          item.secondaryColor || liquidDef?.secondaryColor || shadeHex(liqPrimary, 45);

        let customPixels: string[] | null = null;
        if (texSource) {
          if (texSource.startsWith('data:image')) {
            customPixels = decodePngDataUrlToPixels(texSource);
          } else {
            const arr = texSource.split(',');
            if (arr.length === 256) customPixels = arr;
          }
        }

        if (customPixels) {
          for (let py = 0; py < 5; py++) {
            for (let px = 0; px < 14; px++) {
              const sample = customPixels[((py * 3) % 16) * 16 + ((px + 1) % 16)];
              ctx.fillStyle = !sample || sample === 'transparent' ? liqPrimary : sample;
              ctx.fillRect(9 + px, 10 + py, 1, 1);
            }
          }
        } else {
          ctx.fillStyle = liqPrimary;
          ctx.fillRect(9, 10, 14, 5);
          ctx.fillStyle = liqSecondary;
          ctx.fillRect(10, 11, 5, 2);
          ctx.fillRect(17, 12, 4, 2);
        }
        // Flowing liquid spill droplet over the bucket lip
        ctx.fillStyle = liqPrimary;
        ctx.fillRect(18, 14, 3, 5);
        ctx.fillStyle = liqSecondary;
        ctx.fillRect(19, 15, 1, 3);
      }
    } else if (item.customTexture) {
      let customPixels: string[] | null = null;
      if (item.customTexture.startsWith('data:image')) {
        customPixels = decodePngDataUrlToPixels(item.customTexture);
      } else {
        const arr = item.customTexture.split(',');
        if (arr.length === 256) customPixels = arr;
      }
      if (customPixels) {
        const itemCanvas = document.createElement('canvas');
        itemCanvas.width = TILE_PX;
        itemCanvas.height = TILE_PX;
        const ictx = itemCanvas.getContext('2d')!;
        for (let py = 0; py < TILE_PX; py++) {
          for (let px = 0; px < TILE_PX; px++) {
            const val = customPixels[py * TILE_PX + px];
            if (!val || val === 'transparent') continue;
            ictx.fillStyle = val === 'rgba_glass' ? item.color : val;
            ictx.fillRect(px, py, 1, 1);
          }
        }
        ctx.drawImage(itemCanvas, 3, 3, 26, 26);
      } else {
        ctx.fillStyle = item.color;
        ctx.fillRect(7, 10, 18, 12);
        ctx.fillStyle = item.secondaryColor || shadeHex(item.color, 35);
        ctx.fillRect(10, 12, 12, 4);
      }
    } else if (item.spawnMobKind) {
      // Minecraft-style speckled Spawn Egg icon (drawn in 32x32 virtual coords)
      const base = item.color;
      const rim = shadeHex(base, -42);
      const spot = item.secondaryColor || shadeHex(base, 45);
      const shine = shadeHex(base, 65);
      const rows = [
        [13, 6],
        [11, 10],
        [9, 14],
        [8, 16],
        [7, 18],
        [7, 18],
        [6, 20],
        [6, 20],
        [7, 18],
        [8, 16],
        [10, 12],
      ];
      rows.forEach(([rx, rw], idx) => {
        const ry = 5 + idx * 2;
        ctx.fillStyle = idx === 0 || idx === rows.length - 1 ? rim : base;
        ctx.fillRect(rx, ry, rw, 2);
        if (idx > 0 && idx < rows.length - 1) {
          ctx.fillStyle = rim;
          ctx.fillRect(rx, ry, 2, 2);
          ctx.fillRect(rx + rw - 2, ry, 2, 2);
        }
      });
      // Characteristic spots
      ctx.fillStyle = spot;
      ctx.fillRect(10, 10, 4, 4);
      ctx.fillRect(18, 12, 4, 4);
      ctx.fillRect(9, 17, 5, 4);
      ctx.fillRect(16, 18, 4, 3);
      ctx.fillRect(13, 14, 3, 3);
      // Specular highlight
      ctx.fillStyle = shine;
      ctx.fillRect(12, 8, 3, 2);
    } else if (item.id === 'wheat') {
      ctx.fillStyle = '#eab308';
      ctx.fillRect(10, 5, 3, 18);
      ctx.fillRect(15, 4, 3, 19);
      ctx.fillRect(20, 6, 3, 17);
      ctx.fillStyle = '#fde047';
      ctx.fillRect(9, 6, 3, 8);
      ctx.fillRect(16, 5, 3, 9);
      ctx.fillStyle = '#78350f';
      ctx.fillRect(8, 18, 16, 3);
      ctx.fillStyle = '#a16207';
      ctx.fillRect(11, 21, 10, 5);
    } else if (item.id === 'leather') {
      ctx.fillStyle = '#78350f';
      ctx.fillRect(7, 7, 18, 18);
      ctx.fillStyle = '#b45309';
      ctx.fillRect(9, 9, 14, 14);
      ctx.fillStyle = '#d97706';
      ctx.fillRect(11, 11, 6, 8);
    } else if (
      item.id === 'raw_beef' ||
      item.id === 'cooked_beef' ||
      item.id === 'raw_porkchop' ||
      item.id === 'cooked_porkchop' ||
      item.id === 'raw_mutton' ||
      item.id === 'cooked_mutton'
    ) {
      const rim = shadeHex(item.color, -36);
      const fat = item.secondaryColor || shadeHex(item.color, 45);
      ctx.fillStyle = rim;
      ctx.fillRect(6, 9, 20, 14);
      ctx.fillRect(8, 7, 15, 18);
      ctx.fillStyle = item.color;
      ctx.fillRect(8, 10, 16, 12);
      ctx.fillRect(10, 9, 11, 14);
      // Fat/bone marbling
      ctx.fillStyle = fat;
      ctx.fillRect(10, 12, 5, 4);
      ctx.fillRect(18, 15, 4, 4);
      ctx.fillRect(14, 10, 3, 2);
    } else if (item.id === 'stick') {
      ctx.fillStyle = '#8b5a2b';
      for (let i = 0; i < 9; i++) {
        ctx.fillRect(7 + i * 2, 23 - i * 2, 3, 3);
      }
    } else if (item.id === 'apple' || item.id === 'golden_apple') {
      const isGold = item.id === 'golden_apple';
      ctx.fillStyle = isGold ? '#facc15' : '#ef4444';
      ctx.fillRect(8, 10, 16, 15);
      ctx.fillRect(10, 8, 12, 18);
      if (isGold) {
        ctx.fillStyle = '#fef9c3';
        ctx.fillRect(10, 11, 4, 4);
      }
      ctx.fillStyle = '#16a34a';
      ctx.fillRect(15, 5, 4, 4);
    } else if (item.id === 'melon_slice') {
      ctx.fillStyle = '#16a34a';
      ctx.fillRect(6, 20, 20, 4);
      ctx.fillStyle = '#ef4444';
      ctx.fillRect(8, 10, 16, 10);
      ctx.fillRect(11, 7, 10, 4);
      ctx.fillStyle = '#111827';
      ctx.fillRect(12, 13, 2, 2);
      ctx.fillRect(17, 15, 2, 2);
    } else if (item.id === 'bread') {
      ctx.fillStyle = '#d97706';
      ctx.fillRect(6, 12, 20, 10);
      ctx.fillStyle = '#f59e0b';
      ctx.fillRect(8, 10, 16, 6);
    } else {
      ctx.fillStyle = item.color;
      ctx.fillRect(7, 10, 18, 12);
      ctx.fillStyle = item.secondaryColor || shadeHex(item.color, 35);
      ctx.fillRect(10, 12, 12, 4);
    }
  }

  const url = canvas.toDataURL();
  iconCache.set(key, url);
  return url;
}
