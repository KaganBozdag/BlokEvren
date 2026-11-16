import { SkinData, SkinPartKey } from '../types/game';

export function createSolidGrid(hex: string): string {
  return Array.from({ length: 64 }, () => hex).join(',');
}

export function gridToArray(grid: string): string[] {
  const parts = grid ? grid.split(',') : [];
  if (parts.length === 64) return parts;
  const fallback = parts[0] || '#94a3b8';
  return Array.from({ length: 64 }, (_, i) => parts[i] || fallback);
}

export function arrayToGrid(arr: string[]): string {
  return arr.slice(0, 64).join(',');
}

function makeFace(
  base: string,
  skinTone: string,
  eyeColor: string,
  hairColor: string,
  mouthColor: string,
): string {
  const g = Array.from({ length: 64 }, () => skinTone);
  // Top 2 rows hair
  for (let y = 0; y < 2; y++) {
    for (let x = 0; x < 8; x++) g[y * 8 + x] = hairColor;
  }
  // Sideburns
  g[2 * 8 + 0] = hairColor;
  g[2 * 8 + 7] = hairColor;
  // Eyes row 3
  g[3 * 8 + 1] = '#ffffff';
  g[3 * 8 + 2] = eyeColor;
  g[3 * 8 + 5] = eyeColor;
  g[3 * 8 + 6] = '#ffffff';
  // Nose/beard/mouth
  g[5 * 8 + 3] = mouthColor;
  g[5 * 8 + 4] = mouthColor;
  if (base) {
    g[6 * 8 + 2] = base;
    g[6 * 8 + 5] = base;
  }
  return g.join(',');
}

function makeTorso(shirt: string, trim: string, belt: string): string {
  const g = Array.from({ length: 64 }, () => shirt);
  // Collar
  g[0 * 8 + 3] = trim;
  g[0 * 8 + 4] = trim;
  g[1 * 8 + 3] = trim;
  g[1 * 8 + 4] = trim;
  // Pocket / stripe
  for (let y = 2; y < 5; y++) {
    g[y * 8 + 1] = trim;
    g[y * 8 + 6] = trim;
  }
  // Belt
  for (let x = 0; x < 8; x++) {
    g[6 * 8 + x] = belt;
  }
  g[6 * 8 + 3] = '#eab308';
  g[6 * 8 + 4] = '#eab308';
  return g.join(',');
}

function makeLimb(topColor: string, bottomColor: string, splitRow = 5): string {
  const g = Array.from({ length: 64 }, (_, idx) => {
    const y = Math.floor(idx / 8);
    return y < splitRow ? topColor : bottomColor;
  });
  return g.join(',');
}

export const PRESET_SKINS: SkinData[] = [
  {
    id: 'preset_explorer',
    name: 'Klasik Kaşif',
    headFront: makeFace('#8b5a2b', '#e6b89c', '#2563eb', '#4a2c18', '#b97a57'),
    headSide: makeLimb('#4a2c18', '#e6b89c', 3),
    headTop: createSolidGrid('#4a2c18'),
    torso: makeTorso('#0ea5e9', '#0284c7', '#451a03'),
    arm: makeLimb('#0ea5e9', '#e6b89c', 4),
    leg: makeLimb('#1e3a8a', '#334155', 6),
  },
  {
    id: 'preset_miner',
    name: 'Usta Madenci',
    headFront: makeFace('#78350f', '#eab696', '#10b981', '#eab308', '#92400e'),
    headSide: makeLimb('#eab308', '#eab696', 3),
    headTop: createSolidGrid('#eab308'),
    torso: makeTorso('#b45309', '#78350f', '#1c1917'),
    arm: makeLimb('#b45309', '#eab696', 4),
    leg: makeLimb('#292524', '#1c1917', 6),
  },
  {
    id: 'preset_knight',
    name: 'Elmas Şövalye',
    headFront: makeFace('#38bdf8', '#94a3b8', '#22d3ee', '#475569', '#334155'),
    headSide: makeLimb('#475569', '#64748b', 4),
    headTop: createSolidGrid('#38bdf8'),
    torso: makeTorso('#64748b', '#38bdf8', '#0f172a'),
    arm: makeLimb('#475569', '#38bdf8', 5),
    leg: makeLimb('#475569', '#1e293b', 6),
  },
  {
    id: 'preset_ranger',
    name: 'Orman Muhafızı',
    headFront: makeFace('#166534', '#f1c27d', '#15803d', '#14532d', '#a16207'),
    headSide: makeLimb('#14532d', '#f1c27d', 3),
    headTop: createSolidGrid('#14532d'),
    torso: makeTorso('#15803d', '#854d0e', '#451a03'),
    arm: makeLimb('#166534', '#f1c27d', 4),
    leg: makeLimb('#713f12', '#422006', 6),
  },
  {
    id: 'preset_astronaut',
    name: 'Yıldız Gezgini',
    headFront: makeFace('#0284c7', '#1e293b', '#38bdf8', '#f8fafc', '#38bdf8'),
    headSide: makeLimb('#e2e8f0', '#cbd5e1', 4),
    headTop: createSolidGrid('#f8fafc'),
    torso: makeTorso('#f8fafc', '#f97316', '#475569'),
    arm: makeLimb('#f8fafc', '#f97316', 5),
    leg: makeLimb('#e2e8f0', '#475569', 6),
  },
];

export const DEFAULT_SKIN: SkinData = PRESET_SKINS[0];

export const SKIN_PART_LABELS: Record<SkinPartKey, string> = {
  headFront: 'Yüz (Ön)',
  headSide: 'Kafa (Yan)',
  headTop: 'Kafa (Üst)',
  torso: 'Gövde',
  arm: 'Kollar',
  leg: 'Bacaklar',
};
