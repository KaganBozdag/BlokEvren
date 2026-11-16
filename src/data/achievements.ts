import {
  AchievementCategory,
  AchievementDef,
  AchievementProgressState,
  AchievementTier,
  BiomeType,
  GameMode,
  MobKind,
  RecipeDef,
} from '../types/game';
import { getItemDef } from './blocksAndRecipes';

export const ACHIEVEMENT_CATEGORIES: { key: 'all' | AchievementCategory; label: string }[] = [
  { key: 'all', label: 'Tümü' },
  { key: 'mining', label: 'Madencilik' },
  { key: 'crafting', label: 'Zanaat' },
  { key: 'building', label: 'İnşaat' },
  { key: 'survival', label: 'Hayatta Kalma' },
  { key: 'exploration', label: 'Keşif' },
  { key: 'mods', label: 'Modlar' },
];

export const ACHIEVEMENT_TIER_META: Record<
  AchievementTier,
  { label: string; border: string; badgeBg: string; badgeText: string; bar: string }
> = {
  bronze: {
    label: 'Bronz',
    border: 'border-amber-700/60',
    badgeBg: 'bg-amber-900/50',
    badgeText: 'text-amber-300',
    bar: 'bg-amber-500',
  },
  silver: {
    label: 'Gümüş',
    border: 'border-slate-400/60',
    badgeBg: 'bg-slate-700/70',
    badgeText: 'text-slate-200',
    bar: 'bg-slate-300',
  },
  gold: {
    label: 'Altın',
    border: 'border-yellow-400/70',
    badgeBg: 'bg-yellow-500/20',
    badgeText: 'text-yellow-300',
    bar: 'bg-yellow-400',
  },
  diamond: {
    label: 'Elmas',
    border: 'border-cyan-400/80',
    badgeBg: 'bg-cyan-500/20',
    badgeText: 'text-cyan-300',
    bar: 'bg-cyan-400',
  },
};

export const ACHIEVEMENTS: AchievementDef[] = [
  {
    id: 'first_mine',
    title: 'İlk Kazı',
    description: 'Hayatta kalma modunda ilk bloğunu kaz.',
    category: 'mining',
    tier: 'bronze',
    statKey: 'blocks_broken',
    target: 1,
    points: 10,
  },
  {
    id: 'lumberjack',
    title: 'Oduncu',
    description: 'Ağaçlardan en az 5 kütük topla.',
    category: 'mining',
    tier: 'bronze',
    statKey: 'wood_broken',
    target: 5,
    points: 15,
  },
  {
    id: 'stone_miner',
    title: 'Taş Devri',
    description: '8 adet taş veya kırıktaş bloğu çıkar.',
    category: 'mining',
    tier: 'bronze',
    statKey: 'stone_mined',
    target: 8,
    points: 15,
  },
  {
    id: 'workbench_master',
    title: 'Zanaat Başlangıcı',
    description: 'Bir Çalışma Masası üret.',
    category: 'crafting',
    tier: 'bronze',
    statKey: 'crafted_crafting_table',
    target: 1,
    points: 15,
  },
  {
    id: 'tool_maker',
    title: 'Alet Ustası',
    description: 'Herhangi bir kazma, balta, kürek veya kılıç üret.',
    category: 'crafting',
    tier: 'bronze',
    statKey: 'tools_crafted',
    target: 1,
    points: 20,
  },
  {
    id: 'furnace_builder',
    title: 'Sıcak Demirci',
    description: 'Maden eritmek için bir Ocak üret.',
    category: 'crafting',
    tier: 'silver',
    statKey: 'crafted_furnace',
    target: 1,
    points: 25,
  },
  {
    id: 'iron_smelter',
    title: 'Demir Çağı',
    description: 'Ocakta ilk Demir Külçeni erit.',
    category: 'crafting',
    tier: 'silver',
    statKey: 'iron_smelted',
    target: 1,
    points: 30,
  },
  {
    id: 'ore_prospector',
    title: 'Maden Avcısı',
    description: 'Toplam 12 adet cevher bloğu kaz.',
    category: 'mining',
    tier: 'silver',
    statKey: 'ores_mined',
    target: 12,
    points: 30,
  },
  {
    id: 'diamond_hunter',
    title: 'Elmas Peşinde!',
    description: 'Nadir bir Elmas Cevheri çıkar veya Elmas elde et.',
    category: 'mining',
    tier: 'diamond',
    statKey: 'diamond_found',
    target: 1,
    points: 75,
  },
  {
    id: 'first_builder',
    title: 'Çırak Mimar',
    description: 'Dünyaya 25 blok yerleştir.',
    category: 'building',
    tier: 'bronze',
    statKey: 'blocks_placed',
    target: 25,
    points: 15,
  },
  {
    id: 'master_architect',
    title: 'Usta Mimar',
    description: 'Dünyaya toplam 100 blok yerleştir.',
    category: 'building',
    tier: 'gold',
    statKey: 'blocks_placed',
    target: 100,
    points: 45,
  },
  {
    id: 'torch_bearer',
    title: 'Karanlığı Aydınlat',
    description: 'Yolunu aydınlatmak için 5 meşale yerleştir.',
    category: 'building',
    tier: 'bronze',
    statKey: 'torches_placed',
    target: 5,
    points: 15,
  },
  {
    id: 'first_meal',
    title: 'Karnım Doydu',
    description: 'Açlığını gidermek için ilk yiyeceğini ye.',
    category: 'survival',
    tier: 'bronze',
    statKey: 'foods_eaten',
    target: 1,
    points: 15,
  },
  {
    id: 'mob_hunter',
    title: 'Vahşi Doğa Avcısı',
    description: 'Hayatta kalma modunda bir canlıyı avla.',
    category: 'survival',
    tier: 'silver',
    statKey: 'mobs_killed',
    target: 1,
    points: 25,
  },
  {
    id: 'animal_breeder',
    title: 'Çiftlik Kurucusu',
    description: 'İki hayvanı besleyip yeni bir yavru dünyaya getir.',
    category: 'survival',
    tier: 'gold',
    statKey: 'mobs_bred',
    target: 1,
    points: 40,
  },
  {
    id: 'deep_diver',
    title: 'Derinlere Yolculuk',
    description: 'Y: 16 seviyesinin altına kadar in.',
    category: 'exploration',
    tier: 'silver',
    statKey: 'deep_miner',
    target: 1,
    points: 30,
  },
  {
    id: 'sky_climber',
    title: 'Bulutlara Dokun',
    description: 'Y: 80 yüksekliğine veya daha yukarısına çık.',
    category: 'exploration',
    tier: 'silver',
    statKey: 'sky_climber',
    target: 1,
    points: 30,
  },
  {
    id: 'biome_explorer',
    title: 'Kaşif Ruhu',
    description: 'En az 3 farklı biyom keşfet.',
    category: 'exploration',
    tier: 'gold',
    statKey: 'biomes_visited',
    target: 3,
    points: 45,
  },
  {
    id: 'storm_survivor',
    title: 'Fırtına Yolcusu',
    description: 'Yağmur veya kar yağışı altında hayatta kal.',
    category: 'exploration',
    tier: 'silver',
    statKey: 'storm_survived',
    target: 1,
    points: 25,
  },
  {
    id: 'mod_pioneer',
    title: 'Mod Kaşifi',
    description: 'Hayatta kalma modunda özel bir mod bloğu veya eşyası kullan.',
    category: 'mods',
    tier: 'gold',
    statKey: 'mod_items_used',
    target: 1,
    points: 40,
  },
];

const BIOME_BIT_INDEX: Record<BiomeType, number> = {
  plains: 0,
  desert: 1,
  forest: 2,
  snow: 3,
  cherry_grove: 4,
  taiga: 5,
  mesa: 6,
  savanna: 7,
};

function countBits(n: number): number {
  let count = 0;
  let v = n | 0;
  while (v > 0) {
    count += v & 1;
    v >>= 1;
  }
  return count;
}

export const EMPTY_ACHIEVEMENT_STATE: AchievementProgressState = {
  unlocked: {},
  stats: {},
};

export function sanitizeAchievementState(raw: unknown): AchievementProgressState {
  if (!raw || typeof raw !== 'object') {
    return { unlocked: {}, stats: {} };
  }
  const obj = raw as { unlocked?: unknown; stats?: unknown };
  const unlocked: Record<string, number> = {};
  const stats: Record<string, number> = {};

  if (obj.unlocked && typeof obj.unlocked === 'object') {
    for (const [k, v] of Object.entries(obj.unlocked as Record<string, unknown>)) {
      if (typeof v === 'number' && Number.isFinite(v) && v > 0) {
        unlocked[k] = v;
      }
    }
  }
  if (obj.stats && typeof obj.stats === 'object') {
    for (const [k, v] of Object.entries(obj.stats as Record<string, unknown>)) {
      if (typeof v === 'number' && Number.isFinite(v) && v >= 0) {
        stats[k] = Math.floor(v);
      }
    }
  }
  if (typeof stats.biome_mask === 'number') {
    stats.biomes_visited = countBits(stats.biome_mask);
  }
  return { unlocked, stats };
}

export function mergeAchievementStates(
  a: AchievementProgressState,
  b: AchievementProgressState,
  extraAchievements: AchievementDef[] = [],
): AchievementProgressState {
  const unlocked: Record<string, number> = { ...a.unlocked };
  for (const [k, ts] of Object.entries(b.unlocked)) {
    if (typeof ts === 'number' && ts > 0) {
      unlocked[k] = unlocked[k] ? Math.min(unlocked[k], ts) : ts;
    }
  }

  const stats: Record<string, number> = { ...a.stats };
  for (const [k, val] of Object.entries(b.stats)) {
    if (typeof val !== 'number' || !Number.isFinite(val)) continue;
    if (k === 'biome_mask') {
      stats[k] = (stats[k] || 0) | (val | 0);
    } else {
      stats[k] = Math.max(stats[k] || 0, Math.floor(val));
    }
  }
  if (typeof stats.biome_mask === 'number') {
    stats.biomes_visited = countBits(stats.biome_mask);
  }

  // Ensure any stat thresholds already met also mark unlocked
  const now = Date.now();
  for (const ach of [...ACHIEVEMENTS, ...extraAchievements]) {
    if (!unlocked[ach.id] && (stats[ach.statKey] || 0) >= ach.target) {
      unlocked[ach.id] = now;
    }
  }

  return { unlocked, stats };
}

export type SurvivalAchievementEvent =
  | { type: 'block_break'; blockId: string; dropId: string }
  | { type: 'block_place'; blockId: string }
  | { type: 'craft'; recipe: RecipeDef }
  | { type: 'eat_food'; itemId: string }
  | { type: 'mob_kill'; kind: MobKind }
  | { type: 'mob_breed'; kind: MobKind }
  | { type: 'world_tick'; y: number; biome?: BiomeType; weather?: 'clear' | 'rain' | 'snow' }
  | { type: 'custom_achievement'; code: string; amount?: number };

export function evaluateSurvivalAchievementEvent(
  prev: AchievementProgressState,
  gameMode: GameMode,
  event: SurvivalAchievementEvent,
  extraAchievements: AchievementDef[] = [],
): {
  next: AchievementProgressState;
  newlyUnlocked: AchievementDef[];
  changed: boolean;
} {
  // STRICT: Achievements ONLY trigger and progress in Survival mode!
  if (gameMode !== 'survival') {
    return { next: prev, newlyUnlocked: [], changed: false };
  }

  const allAchievements = [...ACHIEVEMENTS, ...extraAchievements];
  const nextStats: Record<string, number> = { ...prev.stats };
  const inc = (key: string, amount = 1) => {
    nextStats[key] = (nextStats[key] || 0) + amount;
  };
  let statChanged = false;

  switch (event.type) {
    case 'block_break': {
      inc('blocks_broken', 1);
      statChanged = true;
      const bid = event.blockId;
      if (bid.endsWith('_log') || bid === 'log') {
        inc('wood_broken', 1);
      }
      if (bid === 'stone' || bid === 'cobblestone' || bid === 'deepslate') {
        inc('stone_mined', 1);
      }
      if (bid.includes('ore')) {
        inc('ores_mined', 1);
      }
      if (
        bid === 'diamond_ore' ||
        bid === 'deepslate_diamond_ore' ||
        event.dropId === 'diamond'
      ) {
        inc('diamond_found', 1);
      }
      if (getItemDef(bid)?.modId) {
        inc('mod_items_used', 1);
      }
      break;
    }
    case 'block_place': {
      inc('blocks_placed', 1);
      statChanged = true;
      if (event.blockId === 'torch') {
        inc('torches_placed', 1);
      }
      if (getItemDef(event.blockId)?.modId) {
        inc('mod_items_used', 1);
      }
      break;
    }
    case 'craft': {
      const outId = event.recipe.output.id;
      const outCount = Math.max(1, event.recipe.output.count || 1);
      if (outId === 'crafting_table') {
        inc('crafted_crafting_table', outCount);
        statChanged = true;
      }
      if (outId === 'furnace') {
        inc('crafted_furnace', outCount);
        statChanged = true;
      }
      if (outId === 'iron_ingot' && event.recipe.requiresFurnace) {
        inc('iron_smelted', outCount);
        statChanged = true;
      }
      if (outId === 'diamond') {
        inc('diamond_found', outCount);
        statChanged = true;
      }
      const outDef = getItemDef(outId);
      if (
        outDef &&
        ((outDef.toolType && outDef.toolType !== 'none') ||
          outDef.category === 'tool' ||
          outDef.weapon)
      ) {
        inc('tools_crafted', outCount);
        statChanged = true;
      }
      if (event.recipe.modId || outDef?.modId) {
        inc('mod_items_used', 1);
        statChanged = true;
      }
      break;
    }
    case 'eat_food': {
      inc('foods_eaten', 1);
      statChanged = true;
      if (getItemDef(event.itemId)?.modId) {
        inc('mod_items_used', 1);
      }
      break;
    }
    case 'mob_kill': {
      inc('mobs_killed', 1);
      statChanged = true;
      break;
    }
    case 'mob_breed': {
      inc('mobs_bred', 1);
      statChanged = true;
      break;
    }
    case 'world_tick': {
      if (event.y <= 16 && (nextStats.deep_miner || 0) < 1) {
        nextStats.deep_miner = 1;
        statChanged = true;
      }
      if (event.y >= 80 && (nextStats.sky_climber || 0) < 1) {
        nextStats.sky_climber = 1;
        statChanged = true;
      }
      if (event.biome && event.biome in BIOME_BIT_INDEX) {
        const bit = 1 << BIOME_BIT_INDEX[event.biome];
        const prevMask = nextStats.biome_mask || 0;
        if ((prevMask & bit) === 0) {
          const nextMask = prevMask | bit;
          nextStats.biome_mask = nextMask;
          nextStats.biomes_visited = countBits(nextMask);
          statChanged = true;
        }
      }
      if (
        (event.weather === 'rain' || event.weather === 'snow') &&
        (nextStats.storm_survived || 0) < 1
      ) {
        nextStats.storm_survived = 1;
        statChanged = true;
      }
      break;
    }
    case 'custom_achievement': {
      const rawCode = event.code.trim();
      const normCode = rawCode.toLowerCase();
      if (!normCode) break;
      const amt = Math.max(1, Math.floor(event.amount ?? 1));
      const matched = allAchievements.filter(
        (ach) =>
          ach.id.toLowerCase() === normCode ||
          (ach.code && ach.code.toLowerCase() === normCode),
      );
      if (matched.length > 0) {
        for (const ach of matched) {
          inc(ach.statKey, amt);
        }
        statChanged = true;
      }
      break;
    }
  }

  if (!statChanged) {
    return { next: prev, newlyUnlocked: [], changed: false };
  }

  const nextUnlocked: Record<string, number> = { ...prev.unlocked };
  const newlyUnlocked: AchievementDef[] = [];
  const now = Date.now();

  for (const ach of allAchievements) {
    if (!nextUnlocked[ach.id] && (nextStats[ach.statKey] || 0) >= ach.target) {
      nextUnlocked[ach.id] = now;
      newlyUnlocked.push(ach);
    }
  }

  return {
    next: { unlocked: nextUnlocked, stats: nextStats },
    newlyUnlocked,
    changed: true,
  };
}
