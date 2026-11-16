import { TexturePackDef } from '../types/game';

function makeNeonGrid(bg: string, edge: string, core: string): string {
  const arr: string[] = [];
  for (let y = 0; y < 16; y++) {
    for (let x = 0; x < 16; x++) {
      const border = x === 0 || x === 15 || y === 0 || y === 15;
      const cross = (x === 7 || x === 8) && (y === 7 || y === 8);
      const circuit = (x === 3 && y >= 3 && y <= 12) || (y === 12 && x >= 3 && x <= 12);
      if (border) arr.push(edge);
      else if (cross) arr.push(core);
      else if (circuit) arr.push(edge);
      else arr.push(bg);
    }
  }
  return arr.join(',');
}

function makeWinterGrassSide(): string {
  const lip = [4, 5, 4, 3, 4, 5, 6, 4, 3, 4, 5, 4, 4, 5, 3, 4];
  const arr: string[] = [];
  for (let y = 0; y < 16; y++) {
    for (let x = 0; x < 16; x++) {
      if (y < lip[x]) {
        arr.push(y === lip[x] - 1 ? '#bae6fd' : (x + y) % 3 === 0 ? '#e0f2fe' : '#f8fafc');
      } else if (y === lip[x]) {
        arr.push('#475569');
      } else {
        arr.push((x * 7 + y * 13) % 5 === 0 ? '#5c4b40' : '#715b4c');
      }
    }
  }
  return arr.join(',');
}

export const BUILTIN_TEXTURE_PACKS: TexturePackDef[] = [
  {
    id: 'pack_classic',
    name: 'Klasik BlokEvren (Varsayılan)',
    description: 'Orijinal piksel sanatlı Minecraft tarzı blok dokuları ve doğal renk dengesi.',
    author: 'BlokEvren',
    builtIn: true,
    previewColors: ['#4da83b', '#7d838a', '#b78952', '#22d3ee'],
    palette: {
      contrast: 1.0,
      brightness: 0,
    },
    blockOverrides: {},
  },
  {
    id: 'pack_pastel',
    name: 'Pastel & Tatlı Dünya',
    description: 'Yumuşak, aydınlık ve sıcak tonlara sahip minimalist pastel dokular.',
    author: 'BlokEvren',
    builtIn: true,
    previewColors: ['#86efac', '#cbd5e1', '#fcd34d', '#f9a8d4'],
    palette: {
      grassTop: '#7dd87d',
      dirt: '#b08968',
      stone: '#b8c0cc',
      deepslate: '#7c8594',
      cobblestone: '#a6b0bd',
      wood: '#e6ccb2',
      leaves: '#95d5b2',
      sand: '#faedcd',
      water: '#72efdd',
      brick: '#f28482',
      contrast: 0.85,
      brightness: 16,
    },
    blockOverrides: {},
  },
  {
    id: 'pack_medieval',
    name: 'Karanlık Ortaçağ (RPG)',
    description: 'Yüksek kontrastlı yontulmuş taşlar, koyu meşe keresteler ve zengin kale dokuları.',
    author: 'BlokEvren',
    builtIn: true,
    previewColors: ['#3f6212', '#52525b', '#6b4226', '#ca8a04'],
    palette: {
      grassTop: '#4d7c0f',
      dirt: '#5c4033',
      stone: '#57534e',
      deepslate: '#292524',
      cobblestone: '#44403c',
      wood: '#7c4a2d',
      leaves: '#365314',
      sand: '#c2b280',
      water: '#1e3a8a',
      brick: '#7f1d1d',
      contrast: 1.24,
      brightness: -10,
    },
    blockOverrides: {},
  },
  {
    id: 'pack_neon',
    name: 'Neon Siberpunk (Grid)',
    description: 'Fütüristik devre hatlı bloklar, parlak camlar ve neon kenar çizgileri.',
    author: 'BlokEvren',
    builtIn: true,
    previewColors: ['#06b6d4', '#1e1b4b', '#ec4899', '#22d3ee'],
    palette: {
      grassTop: '#10b981',
      dirt: '#1e1b4b',
      stone: '#1e293b',
      deepslate: '#090d16',
      cobblestone: '#172554',
      wood: '#4c1d95',
      leaves: '#06b6d4',
      sand: '#312e81',
      water: '#0284c7',
      brick: '#be185d',
      contrast: 1.28,
      brightness: 4,
    },
    blockOverrides: {
      stone: { side: makeNeonGrid('#0f172a', '#06b6d4', '#38bdf8') },
      cobblestone: { side: makeNeonGrid('#1e1b4b', '#ec4899', '#f472b6') },
      oak_planks: { side: makeNeonGrid('#311042', '#a855f7', '#e879f9') },
      glowstone: { side: makeNeonGrid('#422006', '#facc15', '#fef08a') },
    },
  },
  {
    id: 'pack_winter',
    name: 'Kış Krallığı (Frostcraft)',
    description: 'Bembeyaz kar kaplı çimenler, buz mavisi taşlar ve donmuş çam ormanları.',
    author: 'BlokEvren',
    builtIn: true,
    previewColors: ['#f8fafc', '#93c5fd', '#475569', '#0284c7'],
    palette: {
      grassTop: '#f1f5f9',
      dirt: '#6b5b53',
      stone: '#8b9bb4',
      deepslate: '#475569',
      cobblestone: '#7b8ca6',
      wood: '#8b735b',
      leaves: '#bae6fd',
      sand: '#e2e8f0',
      water: '#38bdf8',
      brick: '#64748b',
      contrast: 1.05,
      brightness: 10,
    },
    blockOverrides: {
      grass: { side: makeWinterGrassSide() },
    },
  },
];

let activeTexturePack: TexturePackDef = BUILTIN_TEXTURE_PACKS[0];
let texturePackVersion = 0;

export function applyActiveTexturePack(pack: TexturePackDef | null | undefined) {
  activeTexturePack = pack || BUILTIN_TEXTURE_PACKS[0];
  texturePackVersion++;
}

export function getActiveTexturePack(): TexturePackDef {
  return activeTexturePack;
}

export function getTexturePackVersion(): number {
  return texturePackVersion;
}
