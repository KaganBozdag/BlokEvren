import { getItemDef, getModOreSpawns, getModSurfaceSpawns } from '../data/blocksAndRecipes';
import { BiomeType, WorldType } from '../types/game';

export type { BiomeType };

export const CHUNK_SIZE = 16;
export const WORLD_HEIGHT = 128;
export const WATER_LEVEL = 34;

export function chunkKey(cx: number, cz: number): string {
  return `${cx},${cz}`;
}

export function blockKey(x: number, y: number, z: number): string {
  return `${x}_${y}_${z}`;
}

function colNumKey(x: number, z: number): number {
  return (x + 1048576) * 2097152 + (z + 1048576);
}

function chunkNumKey(cx: number, cz: number): number {
  return (cx + 65536) * 131072 + (cz + 65536);
}

function hashInt(x: number, y: number, z: number, seed: number): number {
  let n =
    Math.imul(x, 374761393) +
    Math.imul(y, 668265263) +
    Math.imul(z, 2147483647) +
    Math.imul(seed, 1597334677);
  n = (n ^ (n >>> 13)) * 1274126177;
  return ((n ^ (n >>> 16)) >>> 0) / 4294967295;
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function smooth(t: number): number {
  return t * t * (3 - 2 * t);
}

function valueNoise2D(x: number, z: number, seed: number): number {
  const xi = Math.floor(x);
  const zi = Math.floor(z);
  const xf = smooth(x - xi);
  const zf = smooth(z - zi);

  const n00 = hashInt(xi, 0, zi, seed);
  const n10 = hashInt(xi + 1, 0, zi, seed);
  const n01 = hashInt(xi, 0, zi + 1, seed);
  const n11 = hashInt(xi + 1, 0, zi + 1, seed);

  return lerp(lerp(n00, n10, xf), lerp(n01, n11, xf), zf);
}

function valueNoise3D(x: number, y: number, z: number, seed: number): number {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const zi = Math.floor(z);
  const xf = smooth(x - xi);
  const yf = smooth(y - yi);
  const zf = smooth(z - zi);

  const c000 = hashInt(xi, yi, zi, seed);
  const c100 = hashInt(xi + 1, yi, zi, seed);
  const c010 = hashInt(xi, yi + 1, zi, seed);
  const c110 = hashInt(xi + 1, yi + 1, zi, seed);
  const c001 = hashInt(xi, yi, zi + 1, seed);
  const c101 = hashInt(xi + 1, yi, zi + 1, seed);
  const c011 = hashInt(xi, yi + 1, zi + 1, seed);
  const c111 = hashInt(xi + 1, yi + 1, zi + 1, seed);

  const x00 = lerp(c000, c100, xf);
  const x10 = lerp(c010, c110, xf);
  const x01 = lerp(c001, c101, xf);
  const x11 = lerp(c011, c111, xf);

  return lerp(lerp(x00, x10, yf), lerp(x01, x11, yf), zf);
}

function fbm2D(x: number, z: number, seed: number): number {
  let total = 0;
  let amp = 0.5;
  let freq = 1;
  for (let i = 0; i < 4; i++) {
    total += valueNoise2D(x * freq, z * freq, seed + i * 97) * amp;
    freq *= 2.02;
    amp *= 0.5;
  }
  return total;
}

const MESA_TERRACOTTA_BANDS = [
  'terracotta',
  'orange_terracotta',
  'red_terracotta',
  'terracotta',
  'yellow_terracotta',
  'white_terracotta',
  'orange_terracotta',
];

export class VoxelWorld {
  public seed: number;
  public worldType: WorldType;
  public overrides = new Map<string, string>();
  private overrideChunks = new Set<number>();
  private maxOverrideY = 0;
  private columnHeightCache = new Map<number, number>();
  private biomeCache = new Map<number, BiomeType>();

  constructor(seed: number, worldType: WorldType) {
    this.seed = seed;
    this.worldType = worldType;
  }

  public setOverride(x: number, y: number, z: number, blockId: string) {
    if (y < 0 || y >= WORLD_HEIGHT) return;
    this.overrides.set(blockKey(x, y, z), blockId);
    this.overrideChunks.add(chunkNumKey(x >> 4, z >> 4));
    if (y > this.maxOverrideY) this.maxOverrideY = y;
  }

  public getBiome(x: number, z: number): BiomeType {
    if (this.worldType === 'flat') return 'plains';
    const key = colNumKey(x, z);
    const cached = this.biomeCache.get(key);
    if (cached !== undefined) return cached;

    const temp = valueNoise2D(x * 0.0042, z * 0.0042, this.seed + 999);
    const humid = valueNoise2D(x * 0.0046, z * 0.0046, this.seed + 1441);
    const weird = valueNoise2D(x * 0.0055, z * 0.0055, this.seed + 2713);

    let biome: BiomeType = 'plains';
    if (temp < 0.24) {
      biome = 'snow';
    } else if (temp < 0.42 && humid >= 0.46) {
      biome = 'taiga';
    } else if (temp > 0.67 && weird > 0.56) {
      biome = 'mesa';
    } else if (temp > 0.66 && humid < 0.42) {
      biome = 'desert';
    } else if (temp > 0.58 && humid >= 0.42 && weird <= 0.56) {
      biome = 'savanna';
    } else if (temp >= 0.36 && temp <= 0.64 && weird > 0.62) {
      biome = 'cherry_grove';
    } else if (humid > 0.54) {
      biome = 'forest';
    }

    if (this.biomeCache.size < 90000) {
      this.biomeCache.set(key, biome);
    }
    return biome;
  }

  public getSurfaceHeight(x: number, z: number): number {
    if (this.worldType === 'flat') return 16;
    const key = colNumKey(x, z);
    const cached = this.columnHeightCache.get(key);
    if (cached !== undefined) return cached;

    const biome = this.getBiome(x, z);
    const continent = fbm2D(x * 0.0075, z * 0.0075, this.seed);
    const mountainFactor = Math.max(0, fbm2D(x * 0.011, z * 0.011, this.seed + 511) - 0.44) * 2.25;
    const detail = fbm2D(x * 0.038, z * 0.038, this.seed + 313);
    const ridge = Math.abs(fbm2D(x * 0.015, z * 0.015, this.seed + 777) - 0.5) * 2;

    let h = 25 + continent * 25 + mountainFactor * 34 + detail * 7 + ridge * 11;
    if (biome === 'mesa') {
      const plateau = Math.floor((h - 32) / 4) * 4 + 34;
      h = lerp(h, plateau + 6, 0.78);
    } else if (biome === 'plains' || biome === 'savanna') {
      h = lerp(h, 36 + detail * 7, 0.35);
    } else if (biome === 'desert') {
      h = lerp(h, 35 + Math.sin(x * 0.06 + z * 0.03) * 3 + detail * 6, 0.42);
    }

    const clamped = Math.max(8, Math.min(WORLD_HEIGHT - 20, Math.floor(h)));
    if (this.columnHeightCache.size < 90000) {
      this.columnHeightCache.set(key, clamped);
    }
    return clamped;
  }

  public getProceduralBlock(x: number, y: number, z: number): string {
    if (y < 0 || y >= WORLD_HEIGHT) return 'air';
    if (y === 0) return 'bedrock';

    if (this.worldType === 'flat') {
      if (y <= 11) return 'stone';
      if (y <= 15) return 'dirt';
      if (y === 16) return 'grass';
      return 'air';
    }

    const biome = this.getBiome(x, z);

    // 1. Deterministic cross-chunk structures (y <= 84)
    if (y <= 85) {
      const structBlock = this.getStructureAt(x, y, z);
      if (structBlock !== null) {
        return structBlock;
      }
    }

    const surfaceY = this.getSurfaceHeight(x, z);

    // 2. Above surface: water, ice sheets, trees, cacti, flowers, sugar cane, bamboo
    if (y > surfaceY) {
      if (y <= WATER_LEVEL) {
        if (y === WATER_LEVEL && biome === 'snow') {
          return 'ice';
        }
        return 'water';
      }
      if (surfaceY >= WATER_LEVEL && y <= surfaceY + 10) {
        const flora = this.getFloraAt(x, y, z, surfaceY, biome);
        if (flora) return flora;
      }
      return 'air';
    }

    // 3. Amethyst Crystal Geodes (y = 10..32)
    if (y >= 10 && y <= 32) {
      const geodeBlock = this.getGeodeAt(x, y, z);
      if (geodeBlock !== null) {
        return geodeBlock;
      }
    }

    // 4. Winding Caves, Caverns & Lush Pockets
    if (y > 3 && y < surfaceY - 2) {
      const cave1 = valueNoise3D(x * 0.072, y * 0.095, z * 0.072, this.seed + 555);
      const cave2 = valueNoise3D(x * 0.048, y * 0.065, z * 0.048, this.seed + 911);
      const tunnel = Math.abs(cave2 - 0.5);
      const isCave =
        (cave1 > 0.71 && surfaceY > WATER_LEVEL) ||
        (tunnel < 0.055 && cave1 > 0.56 && y < surfaceY - 5);
      if (isCave) {
        if (y <= 5) return 'lava';
        if (y === 6 && hashInt(x, y, z, this.seed + 33) > 0.72) return 'magma_block';
        return 'air';
      }
    }

    // 5. Surface Layer
    if (y === surfaceY) {
      if (surfaceY < WATER_LEVEL - 8) {
        return hashInt(x, y, z, this.seed + 41) > 0.88 ? 'prismarine' : 'gravel';
      }
      if (surfaceY <= WATER_LEVEL + 1) {
        return hashInt(x, y, z, this.seed + 42) > 0.8
          ? 'clay'
          : biome === 'mesa'
            ? 'red_sand'
            : 'sand';
      }
      if (biome === 'desert') return 'sand';
      if (biome === 'mesa') {
        return surfaceY > 45 ? MESA_TERRACOTTA_BANDS[y % MESA_TERRACOTTA_BANDS.length] : 'red_sand';
      }
      if (biome === 'snow') {
        if (surfaceY >= 58 && hashInt(x, 0, z, this.seed + 81) > 0.55) {
          return surfaceY >= 66 ? 'blue_ice' : 'packed_ice';
        }
        return 'snow';
      }
      if (surfaceY >= 72) return 'snow';
      if (biome === 'taiga') {
        return valueNoise2D(x * 0.14, z * 0.14, this.seed + 601) > 0.54 ? 'podzol' : 'grass';
      }
      return 'grass';
    }

    // 6. Sub-surface Strata
    if (y >= surfaceY - 4) {
      if (biome === 'mesa') {
        return MESA_TERRACOTTA_BANDS[y % MESA_TERRACOTTA_BANDS.length];
      }
      if (biome === 'desert') {
        return y >= surfaceY - 2 ? 'sand' : 'sandstone';
      }
      if (surfaceY <= WATER_LEVEL + 1) return 'sand';
      if (biome === 'snow' && surfaceY >= 58) return 'packed_ice';
      if (y >= surfaceY - 3) return 'dirt';
    }

    // 7. Underground Deepslate Boundary (noisy transition around y = 20..23)
    const deepslateTop = 20 + Math.floor(valueNoise2D(x * 0.14, z * 0.14, this.seed + 71) * 4);
    const inDeepslate = y <= deepslateTop;

    // 8. Underground Ores & Mod Ore Spawns
    const oreRoll = hashInt(x, y, z, this.seed + 2026);
    const allModOres = getModOreSpawns();
    if (allModOres.length > 0 && oreRoll > 0.986) {
      const modOres = allModOres.filter(
        (m) =>
          y >= (m.minSpawnY ?? 4) &&
          y <= (m.maxSpawnY ?? 52) &&
          (!m.spawnBiomes || m.spawnBiomes.length === 0 || m.spawnBiomes.includes(biome)),
      );
      if (modOres.length > 0) {
        const idx = Math.floor(hashInt(x + 3, y, z + 5, this.seed) * modOres.length);
        return modOres[idx].id;
      }
    }

    if (inDeepslate) {
      if (y >= 3 && y <= 12 && oreRoll > 0.9972) return 'ancient_debris';
      if (y <= 18 && oreRoll > 0.989) return 'deepslate_diamond_ore';
      if (y <= 22 && oreRoll > 0.986) return 'deepslate_emerald_ore';
      if (oreRoll > 0.981) return 'deepslate_gold_ore';
      if (oreRoll > 0.975) return 'deepslate_redstone_ore';
      if (oreRoll > 0.971) return 'deepslate_lapis_ore';
      if (oreRoll > 0.958) return 'deepslate_iron_ore';
      if (oreRoll > 0.946) return 'deepslate_coal_ore';
      return 'deepslate';
    }

    if (y <= 24 && oreRoll > 0.988) return 'emerald_ore';
    if (y <= 32 && oreRoll > 0.982) return 'gold_ore';
    if (y <= 34 && oreRoll > 0.978) return 'redstone_ore';
    if (y <= 40 && oreRoll > 0.975) return 'lapis_ore';
    if (y <= 58 && oreRoll > 0.961) return 'iron_ore';
    if (y <= 68 && oreRoll > 0.953) return 'copper_ore';
    if (y <= 84 && oreRoll > 0.941) return 'coal_ore';

    // 9. Stone Rock Varieties (Lush Moss Pockets, Granite, Diorite, Andesite, Tuff)
    if (y >= 24 && y <= 44) {
      const lushCheck = valueNoise3D(x * 0.085, y * 0.11, z * 0.085, this.seed + 3030);
      if (lushCheck > 0.78) {
        return lushCheck > 0.855 ? 'shroomlight' : 'moss_block';
      }
    }

    const rockNoise = valueNoise3D(x * 0.09, y * 0.09, z * 0.09, this.seed + 1701);
    if (rockNoise > 0.79) return 'granite';
    if (rockNoise < 0.21) return 'diorite';
    if (rockNoise > 0.67 && rockNoise <= 0.74) return 'andesite';
    if (y <= 29 && rockNoise < 0.34) return 'tuff';

    return 'stone';
  }

  /**
   * High-speed column-buffered chunk sampler (18x128x18 with 1-block neighbor padding).
   * Eliminates redundant column/biome/structure/height recalculations during chunk meshing.
   * Layout: index = (pz * 18 + px) * WORLD_HEIGHT + y
   * Returns highest non-air Y inside the padded chunk.
   */
  public fillPaddedChunk(
    cx: number,
    cz: number,
    outIds: string[],
    outOpaque: Uint8Array,
  ): number {
    outIds.fill('air');
    outOpaque.fill(0);

    const PADDED = 18;
    const baseWx = cx * CHUNK_SIZE - 1;
    const baseWz = cz * CHUNK_SIZE - 1;
    const hasOverrides = this.overrides.size > 0;
    const allModOres = getModOreSpawns();
    const allModSurfaces = getModSurfaceSpawns();
    let maxNonAirY = 0;

    for (let pz = 0; pz < PADDED; pz++) {
      const wz = baseWz + pz;
      const czBlock = wz >> 4;
      for (let px = 0; px < PADDED; px++) {
        const wx = baseWx + px;
        const cxBlock = wx >> 4;
        const colOffset = (pz * PADDED + px) * WORLD_HEIGHT;
        const colHasOverride = hasOverrides && this.overrideChunks.has(chunkNumKey(cxBlock, czBlock));

        if (this.worldType === 'flat') {
          const topY = colHasOverride ? Math.max(16, this.maxOverrideY) : 16;
          for (let y = 0; y <= topY; y++) {
            let id: string;
            if (colHasOverride) {
              const ov = this.overrides.get(blockKey(wx, y, wz));
              if (ov !== undefined) {
                id = ov;
              } else {
                id = y === 0 ? 'bedrock' : y <= 11 ? 'stone' : y <= 15 ? 'dirt' : y === 16 ? 'grass' : 'air';
              }
            } else {
              id = y === 0 ? 'bedrock' : y <= 11 ? 'stone' : y <= 15 ? 'dirt' : 'grass';
            }
            outIds[colOffset + y] = id;
            if (id !== 'air') {
              const def = getItemDef(id);
              outOpaque[colOffset + y] = def && !def.transparent && !def.liquid ? 1 : 0;
              if (y > maxNonAirY) maxNonAirY = y;
            }
          }
          continue;
        }

        // Precompute column invariants ONCE per (wx, wz)
        const biome = this.getBiome(wx, wz);
        const surfaceY = this.getSurfaceHeight(wx, wz);
        const deepslateTop =
          20 + Math.floor(valueNoise2D(wx * 0.14, wz * 0.14, this.seed + 71) * 4);

        // Pre-check structure cell once per column
        const sCellX = Math.floor(wx / 52);
        const sCellZ = Math.floor(wz / 52);
        const sRoll = hashInt(sCellX, 77, sCellZ, this.seed + 4242);
        let colHasStruct = false;
        if (sRoll <= 0.42) {
          const ax = sCellX * 52 + 24 + Math.floor(hashInt(sCellX, 11, sCellZ, this.seed + 42) * 6);
          const az = sCellZ * 52 + 24 + Math.floor(hashInt(sCellX, 12, sCellZ, this.seed + 43) * 6);
          if (Math.abs(wx - ax) <= 6 && Math.abs(wz - az) <= 6) {
            colHasStruct = true;
          }
        }

        // Pre-check geode cell once per column
        const gCellX = Math.floor(wx / 32);
        const gCellZ = Math.floor(wz / 32);
        let colHasGeode = false;
        if (hashInt(gCellX, 99, gCellZ, this.seed + 6161) <= 0.28) {
          const gx = gCellX * 32 + 12 + Math.floor(hashInt(gCellX, 1, gCellZ, this.seed + 62) * 8);
          const gz = gCellZ * 32 + 12 + Math.floor(hashInt(gCellX, 2, gCellZ, this.seed + 63) * 8);
          if (Math.abs(wx - gx) <= 5 && Math.abs(wz - gz) <= 5) {
            colHasGeode = true;
          }
        }

        const modOresForBiome =
          allModOres.length > 0
            ? allModOres.filter((m) => !m.spawnBiomes || m.spawnBiomes.length === 0 || m.spawnBiomes.includes(biome))
            : null;
        const modSurfacesForBiome =
          allModSurfaces.length > 0
            ? allModSurfaces.filter((m) => !m.spawnBiomes || m.spawnBiomes.length === 0 || m.spawnBiomes.includes(biome))
            : null;

        let colMaxY = Math.max(surfaceY + 10, WATER_LEVEL);
        if (colHasStruct) colMaxY = Math.max(colMaxY, 85);
        if (colHasOverride) colMaxY = Math.max(colMaxY, this.maxOverrideY);
        if (colMaxY >= WORLD_HEIGHT) colMaxY = WORLD_HEIGHT - 1;

        for (let y = 0; y <= colMaxY; y++) {
          let id: string | null = null;

          if (colHasOverride) {
            const ov = this.overrides.get(blockKey(wx, y, wz));
            if (ov !== undefined) id = ov;
          }

          if (id === null) {
            if (y === 0) {
              id = 'bedrock';
            } else {
              if (colHasStruct && y <= 85) {
                id = this.getStructureAt(wx, y, wz);
              }
              if (id === null) {
                if (y > surfaceY) {
                  if (y <= WATER_LEVEL) {
                    id = y === WATER_LEVEL && biome === 'snow' ? 'ice' : 'water';
                  } else if (surfaceY >= WATER_LEVEL && y <= surfaceY + 10) {
                    id = this.getFloraAt(wx, y, wz, surfaceY, biome, modSurfacesForBiome) || 'air';
                  } else {
                    id = 'air';
                  }
                } else {
                  if (colHasGeode && y >= 10 && y <= 32) {
                    id = this.getGeodeAt(wx, y, wz);
                  }
                  if (id === null) {
                    // Caves
                    let isCave = false;
                    if (y > 3 && y < surfaceY - 2) {
                      const cave1 = valueNoise3D(wx * 0.072, y * 0.095, wz * 0.072, this.seed + 555);
                      if (cave1 > 0.56) {
                        if (cave1 > 0.71 && surfaceY > WATER_LEVEL) {
                          isCave = true;
                        } else if (y < surfaceY - 5) {
                          const cave2 = valueNoise3D(wx * 0.048, y * 0.065, wz * 0.048, this.seed + 911);
                          if (Math.abs(cave2 - 0.5) < 0.055) {
                            isCave = true;
                          }
                        }
                      }
                    }

                    if (isCave) {
                      if (y <= 5) id = 'lava';
                      else if (y === 6 && hashInt(wx, y, wz, this.seed + 33) > 0.72) id = 'magma_block';
                      else id = 'air';
                    } else if (y === surfaceY) {
                      if (surfaceY < WATER_LEVEL - 8) {
                        id = hashInt(wx, y, wz, this.seed + 41) > 0.88 ? 'prismarine' : 'gravel';
                      } else if (surfaceY <= WATER_LEVEL + 1) {
                        id =
                          hashInt(wx, y, wz, this.seed + 42) > 0.8
                            ? 'clay'
                            : biome === 'mesa'
                              ? 'red_sand'
                              : 'sand';
                      } else if (biome === 'desert') {
                        id = 'sand';
                      } else if (biome === 'mesa') {
                        id =
                          surfaceY > 45
                            ? MESA_TERRACOTTA_BANDS[y % MESA_TERRACOTTA_BANDS.length]
                            : 'red_sand';
                      } else if (biome === 'snow') {
                        if (surfaceY >= 58 && hashInt(wx, 0, wz, this.seed + 81) > 0.55) {
                          id = surfaceY >= 66 ? 'blue_ice' : 'packed_ice';
                        } else {
                          id = 'snow';
                        }
                      } else if (surfaceY >= 72) {
                        id = 'snow';
                      } else if (biome === 'taiga') {
                        id =
                          valueNoise2D(wx * 0.14, wz * 0.14, this.seed + 601) > 0.54
                            ? 'podzol'
                            : 'grass';
                      } else {
                        id = 'grass';
                      }
                    } else if (y >= surfaceY - 4) {
                      if (biome === 'mesa') {
                        id = MESA_TERRACOTTA_BANDS[y % MESA_TERRACOTTA_BANDS.length];
                      } else if (biome === 'desert') {
                        id = y >= surfaceY - 2 ? 'sand' : 'sandstone';
                      } else if (surfaceY <= WATER_LEVEL + 1) {
                        id = 'sand';
                      } else if (biome === 'snow' && surfaceY >= 58) {
                        id = 'packed_ice';
                      } else if (y >= surfaceY - 3) {
                        id = 'dirt';
                      }
                    }

                    if (id === null) {
                      const inDeepslate = y <= deepslateTop;
                      const oreRoll = hashInt(wx, y, wz, this.seed + 2026);
                      if (modOresForBiome && modOresForBiome.length > 0 && oreRoll > 0.986) {
                        const matched = modOresForBiome.filter(
                          (m) => y >= (m.minSpawnY ?? 4) && y <= (m.maxSpawnY ?? 52),
                        );
                        if (matched.length > 0) {
                          const idx = Math.floor(hashInt(wx + 3, y, wz + 5, this.seed) * matched.length);
                          id = matched[idx].id;
                        }
                      }

                      if (id === null) {
                        if (inDeepslate) {
                          if (y >= 3 && y <= 12 && oreRoll > 0.9972) id = 'ancient_debris';
                          else if (y <= 18 && oreRoll > 0.989) id = 'deepslate_diamond_ore';
                          else if (y <= 22 && oreRoll > 0.986) id = 'deepslate_emerald_ore';
                          else if (oreRoll > 0.981) id = 'deepslate_gold_ore';
                          else if (oreRoll > 0.975) id = 'deepslate_redstone_ore';
                          else if (oreRoll > 0.971) id = 'deepslate_lapis_ore';
                          else if (oreRoll > 0.958) id = 'deepslate_iron_ore';
                          else if (oreRoll > 0.946) id = 'deepslate_coal_ore';
                          else id = 'deepslate';
                        } else {
                          if (y <= 24 && oreRoll > 0.988) id = 'emerald_ore';
                          else if (y <= 32 && oreRoll > 0.982) id = 'gold_ore';
                          else if (y <= 34 && oreRoll > 0.978) id = 'redstone_ore';
                          else if (y <= 40 && oreRoll > 0.975) id = 'lapis_ore';
                          else if (y <= 58 && oreRoll > 0.961) id = 'iron_ore';
                          else if (y <= 68 && oreRoll > 0.953) id = 'copper_ore';
                          else if (y <= 84 && oreRoll > 0.941) id = 'coal_ore';
                          else {
                            if (y >= 24 && y <= 44) {
                              const lushCheck = valueNoise3D(
                                wx * 0.085,
                                y * 0.11,
                                wz * 0.085,
                                this.seed + 3030,
                              );
                              if (lushCheck > 0.78) {
                                id = lushCheck > 0.855 ? 'shroomlight' : 'moss_block';
                              }
                            }
                            if (id === null) {
                              const rockNoise = valueNoise3D(
                                wx * 0.09,
                                y * 0.09,
                                wz * 0.09,
                                this.seed + 1701,
                              );
                              if (rockNoise > 0.79) id = 'granite';
                              else if (rockNoise < 0.21) id = 'diorite';
                              else if (rockNoise > 0.67 && rockNoise <= 0.74) id = 'andesite';
                              else if (y <= 29 && rockNoise < 0.34) id = 'tuff';
                              else id = 'stone';
                            }
                          }
                        }
                      }
                    }
                  }
                }
              }
            }
          }

          outIds[colOffset + y] = id;
          if (id !== 'air') {
            const def = getItemDef(id);
            outOpaque[colOffset + y] = def && !def.transparent && !def.liquid ? 1 : 0;
            if (y > maxNonAirY) maxNonAirY = y;
          }
        }
      }
    }

    return maxNonAirY;
  }

  private getGeodeAt(x: number, y: number, z: number): string | null {
    if (y < 10 || y > 32) return null;
    const cellX = Math.floor(x / 32);
    const cellZ = Math.floor(z / 32);
    if (hashInt(cellX, 99, cellZ, this.seed + 6161) > 0.28) return null;

    const gx = cellX * 32 + 12 + Math.floor(hashInt(cellX, 1, cellZ, this.seed + 62) * 8);
    const gz = cellZ * 32 + 12 + Math.floor(hashInt(cellX, 2, cellZ, this.seed + 63) * 8);
    const gy = 16 + Math.floor(hashInt(cellX, 3, cellZ, this.seed + 64) * 10);

    const dx = x - gx;
    const dy = y - gy;
    const dz = z - gz;
    if (Math.abs(dx) > 5 || Math.abs(dy) > 5 || Math.abs(dz) > 5) return null;

    const dist = Math.hypot(dx, dy, dz);
    if (dist > 4.6) return null;
    if (dist >= 3.7) return 'obsidian';
    if (dist >= 2.8) return 'calcite';
    if (dist >= 1.9) return 'amethyst_block';
    if (dx === 0 && dz === 0 && dy === -1) return 'amethyst_block';
    return 'air';
  }

  private getStructureAt(x: number, y: number, z: number): string | null {
    const CELL = 52;
    const cellX = Math.floor(x / CELL);
    const cellZ = Math.floor(z / CELL);
    const roll = hashInt(cellX, 77, cellZ, this.seed + 4242);
    if (roll > 0.42) return null;

    const ax = cellX * CELL + 24 + Math.floor(hashInt(cellX, 11, cellZ, this.seed + 42) * 6);
    const az = cellZ * CELL + 24 + Math.floor(hashInt(cellX, 12, cellZ, this.seed + 43) * 6);

    const rx = x - ax;
    const rz = z - az;
    if (Math.abs(rx) > 6 || Math.abs(rz) > 6) return null;

    // Type A: Underground Mossy Dungeon Vault (at y = 14..19)
    if (roll > 0.28 && roll <= 0.42) {
      const dBaseY = 14;
      const dy = y - dBaseY;
      if (dy < 0 || dy > 5 || Math.abs(rx) > 3 || Math.abs(rz) > 3) return null;
      const wall = Math.abs(rx) === 3 || Math.abs(rz) === 3 || dy === 0 || dy === 5;
      if (wall) {
        const brickRoll = hashInt(x, y, z, this.seed + 505);
        if (dy === 0) return brickRoll > 0.45 ? 'mossy_cobblestone' : 'cobblestone';
        if (brickRoll > 0.65) return 'mossy_stone_bricks';
        if (brickRoll > 0.35) return 'cracked_stone_bricks';
        return 'stone_bricks';
      }
      if (dy === 1 && rx === 0 && rz === 0) return 'chest';
      if (dy === 1 && rx === -2 && rz === -2) return 'lantern';
      return 'air';
    }

    const baseY = this.getSurfaceHeight(ax, az);
    const biome = this.getBiome(ax, az);

    if (baseY <= WATER_LEVEL + 1 || baseY > 78) return null;

    // Type B: Ruined Nether Portal
    if (roll <= 0.08) {
      const dy = y - baseY;
      if (dy < -1 || dy > 6 || Math.abs(rx) > 3 || Math.abs(rz) > 3) return null;
      if (dy <= 0) {
        const r = hashInt(x, y, z, this.seed + 909);
        if (r > 0.65) return 'netherrack';
        if (r > 0.5) return 'magma_block';
        return 'mossy_stone_bricks';
      }
      if (rz === 0 && Math.abs(rx) <= 2 && dy >= 1 && dy <= 5) {
        const isFrame = Math.abs(rx) === 2 || dy === 1 || dy === 5;
        if (isFrame) {
          if (rx === 2 && dy === 5) return 'air';
          if (rx === 0 && dy === 5) return 'gold_block';
          return hashInt(x, y, z, this.seed + 13) > 0.65 ? 'crying_obsidian' : 'obsidian';
        }
        return 'air';
      }
      if (dy === 1 && rx === -1 && rz === 2) return 'chest';
      if (dy === 1 && rx === 1 && rz === 2) return 'lantern';
      return 'air';
    }

    // Type C: Desert / Mesa Sandstone Pyramid Shrine
    if (biome === 'desert' || biome === 'mesa') {
      const dy = y - baseY;
      if (dy < -2 || dy > 6 || Math.abs(rx) > 4 || Math.abs(rz) > 4) return null;
      if (dy <= 0) return biome === 'mesa' ? 'red_terracotta' : 'sandstone';
      const layerRadius = Math.max(0, 4 - Math.floor(dy));
      if (Math.abs(rx) > layerRadius || Math.abs(rz) > layerRadius) return null;
      if (rz === layerRadius && rx === 0 && (dy === 1 || dy === 2)) return 'air';
      const isShell = Math.abs(rx) === layerRadius || Math.abs(rz) === layerRadius || dy === 5;
      if (isShell) {
        if (dy === 3 && (rx === 0 || rz === 0)) return 'chiseled_stone_bricks';
        return biome === 'mesa' ? 'terracotta' : 'sandstone';
      }
      if (dy === 1 && rx === 0 && rz === 0) return 'gold_block';
      if (dy === 2 && rx === 0 && rz === 0) return 'amethyst_block';
      if (dy === 1 && rx === -1 && rz === -1) return 'chest';
      if (dy === 1 && rx === 1 && rz === -1) return 'torch';
      return 'air';
    }

    // Type D: Biome Explorer Cottage / Cabin
    const dy = y - baseY;
    if (dy < -3 || dy > 6 || Math.abs(rx) > 3 || Math.abs(rz) > 3) return null;

    if (dy <= 0) {
      return (Math.abs(rx) + Math.abs(rz)) % 2 === 0 ? 'stone_bricks' : 'cobblestone';
    }

    const plank =
      biome === 'cherry_grove'
        ? 'cherry_planks'
        : biome === 'taiga' || biome === 'snow'
          ? 'spruce_planks'
          : biome === 'savanna'
            ? 'acacia_planks'
            : 'oak_planks';
    const pillar =
      biome === 'cherry_grove'
        ? 'cherry_log'
        : biome === 'taiga' || biome === 'snow'
          ? 'spruce_log'
          : biome === 'savanna'
            ? 'acacia_log'
            : 'oak_log';

    const onEdgeX = Math.abs(rx) === 3;
    const onEdgeZ = Math.abs(rz) === 3;

    if (dy >= 4) {
      const roofHalf = 6 - dy;
      if (dy === 4 && (onEdgeX || onEdgeZ)) {
        return plank;
      }
      if (Math.abs(rx) <= roofHalf + 1 && dy <= 5) {
        return Math.abs(rx) === roofHalf + 1 ? pillar : plank;
      }
      if (dy === 6 && rx === 0) return 'stone_bricks';
      return null;
    }

    if (onEdgeX || onEdgeZ) {
      if (rz === 3 && rx === 0 && (dy === 1 || dy === 2)) return 'air';
      if (onEdgeX && onEdgeZ) return pillar;
      if (dy === 2 && (rx === 0 || rz === 0) && rz !== 3) return 'glass';
      return plank;
    }

    if (dy === 1) {
      if (rx === -2 && rz === -2) return 'crafting_table';
      if (rx === -1 && rz === -2) return 'furnace';
      if (rx === 2 && rz === -2) return 'chest';
      if (rx === 2 && rz === 2) return 'lantern';
    }
    return 'air';
  }

  private getFloraAt(
    x: number,
    y: number,
    z: number,
    surfaceY: number,
    biome: BiomeType,
    preFilteredModSurfaces?: ReturnType<typeof getModSurfaceSpawns> | null,
  ): string | null {
    // 1. Shoreline Sugar Cane
    if (surfaceY === WATER_LEVEL || surfaceY === WATER_LEVEL + 1) {
      if (biome !== 'snow' && biome !== 'mesa') {
        const caneRoll = hashInt(x, 19, z, this.seed + 707);
        if (caneRoll > 0.945 && y > surfaceY && y <= surfaceY + 3) {
          return 'sugar_cane';
        }
      }
    }

    // 2. Trees & Giant Flora on deterministic 6x6 cells
    const cellX = Math.floor(x / 6);
    const cellZ = Math.floor(z / 6);
    const treeChance =
      biome === 'forest'
        ? 0.68
        : biome === 'cherry_grove'
          ? 0.44
          : biome === 'taiga'
            ? 0.48
            : biome === 'savanna'
              ? 0.24
              : biome === 'snow'
                ? 0.22
                : biome === 'plains'
                  ? 0.18
                  : 0.16;

    const cellRoll = hashInt(cellX, 0, cellZ, this.seed + 888);
    if (cellRoll <= treeChance) {
      const tx = cellX * 6 + 2 + Math.floor(hashInt(cellX, 1, cellZ, this.seed) * 3);
      const tz = cellZ * 6 + 2 + Math.floor(hashInt(cellX, 2, cellZ, this.seed) * 3);
      const baseSurface = this.getSurfaceHeight(tx, tz);

      if (baseSurface >= WATER_LEVEL + 1 && baseSurface <= 82) {
        if (biome === 'desert') {
          if (x === tx && z === tz && y > baseSurface && y <= baseSurface + 3) {
            return 'cactus';
          }
          return null;
        }

        if (biome === 'mesa') {
          if (x === tx && z === tz && y === baseSurface + 1) {
            return 'dead_bush';
          }
          return null;
        }

        if (biome === 'plains' && cellRoll < 0.025) {
          if (x === tx && z === tz && y === baseSurface + 1) {
            return 'pumpkin';
          }
          return null;
        }

        if ((biome === 'savanna' || biome === 'forest') && cellRoll < 0.028) {
          if (x === tx && z === tz && y === baseSurface + 1) {
            return 'melon';
          }
          return null;
        }

        const dx = Math.abs(x - tx);
        const dz = Math.abs(z - tz);
        const dy = y - baseSurface;

        if (biome === 'savanna') {
          const trunkH = 5;
          if (dx === 0 && dz === 0 && dy >= 1 && dy <= 3) return 'acacia_log';
          if (x === tx + 1 && dz === 0 && dy >= 3 && dy <= trunkH) return 'acacia_log';
          if (dy === trunkH && Math.abs(x - (tx + 1)) <= 2 && dz <= 2) return 'acacia_leaves';
          if (dy === trunkH + 1 && Math.abs(x - (tx + 1)) <= 1 && dz <= 1) return 'acacia_leaves';
          return null;
        }

        if (biome === 'taiga' || biome === 'snow') {
          const trunkH = 6 + Math.floor(hashInt(cellX, 3, cellZ, this.seed) * 3);
          if (dx === 0 && dz === 0 && dy >= 1 && dy <= trunkH) return 'spruce_log';
          if (dy >= 2 && dy <= trunkH + 2) {
            const radius = dy >= trunkH + 1 ? 0 : dy % 2 === 0 ? 2 : 1;
            if (dx <= radius && dz <= radius && !(dx === 2 && dz === 2)) {
              return 'spruce_leaves';
            }
          }
          return null;
        }

        if (biome === 'cherry_grove') {
          const trunkH = 5 + Math.floor(hashInt(cellX, 3, cellZ, this.seed) * 2);
          if (dx === 0 && dz === 0 && dy >= 1 && dy <= trunkH) return 'cherry_log';
          if (dy >= trunkH - 1 && dy <= trunkH + 2) {
            const radius = dy === trunkH || dy === trunkH + 1 ? 3 : 2;
            const dist = dx + dz;
            if (dx <= radius && dz <= radius && dist <= radius + 1) {
              return 'cherry_leaves';
            }
          }
          return null;
        }

        let logType = 'oak_log';
        let leafType = 'oak_leaves';
        let trunkHeight = 4 + Math.floor(hashInt(cellX, 3, cellZ, this.seed) * 3);
        if (biome === 'forest') {
          if (cellRoll < 0.16) {
            logType = 'birch_log';
            leafType = 'birch_leaves';
          } else if (cellRoll < 0.32) {
            logType = 'dark_oak_log';
            leafType = 'dark_oak_leaves';
            trunkHeight = 5;
          } else if (cellRoll > 0.54) {
            logType = 'jungle_log';
            leafType = 'jungle_leaves';
            trunkHeight = 7;
          }
        } else if (cellRoll < 0.06) {
          logType = 'birch_log';
          leafType = 'birch_leaves';
        }

        if (dx === 0 && dz === 0 && dy >= 1 && dy <= trunkHeight) {
          return logType;
        }
        if (dy >= trunkHeight - 1 && dy <= trunkHeight + 2) {
          const radius = dy >= trunkHeight + 1 ? 1 : 2;
          if (dx <= radius && dz <= radius && !(dx === 2 && dz === 2 && dy === trunkHeight + 2)) {
            return leafType;
          }
        }
        return null;
      }
    }

    // 3. Ground Cover
    if (surfaceY >= WATER_LEVEL + 1 && surfaceY < 70) {
      if (y === surfaceY + 1) {
        const modSurfaces =
          preFilteredModSurfaces !== undefined
            ? preFilteredModSurfaces
            : getModSurfaceSpawns().filter(
                (m) => !m.spawnBiomes || m.spawnBiomes.length === 0 || m.spawnBiomes.includes(biome),
              );
        if (modSurfaces && modSurfaces.length > 0) {
          const modSurfRoll = hashInt(x, 47, z, this.seed + 3131);
          if (modSurfRoll > 0.964) {
            const idx = Math.floor(hashInt(x + 7, 13, z + 11, this.seed + 77) * modSurfaces.length);
            return modSurfaces[idx].id;
          }
        }
        const gRoll = hashInt(x, 31, z, this.seed + 1111);
        if (biome === 'desert' || biome === 'mesa') {
          return gRoll > 0.985 ? 'dead_bush' : null;
        }
        if (biome === 'snow') return null;

        if (biome === 'cherry_grove') {
          if (gRoll > 0.94) return 'pink_tulip';
          if (gRoll > 0.87) return 'tall_grass';
          return null;
        }
        if (biome === 'taiga') {
          if (gRoll > 0.975) return 'red_mushroom';
          if (gRoll > 0.955) return 'brown_mushroom';
          if (gRoll > 0.88) return 'tall_grass';
          return null;
        }
        if (biome === 'forest') {
          if (gRoll > 0.97) return 'blue_orchid';
          if (gRoll > 0.955) return 'poppy';
          if (gRoll > 0.84) return 'tall_grass';
          return null;
        }
        if (biome === 'savanna') {
          return gRoll > 0.82 ? 'tall_grass' : null;
        }
        if (gRoll > 0.972) return 'poppy';
        if (gRoll > 0.95) return 'dandelion';
        if (gRoll > 0.85) return 'tall_grass';
      } else if (biome === 'forest' && y > surfaceY && y <= surfaceY + 5) {
        const bNoise = valueNoise2D(x * 0.06, z * 0.06, this.seed + 2424);
        if (bNoise > 0.72 && hashInt(x, 5, z, this.seed + 2425) > 0.93) {
          return 'bamboo';
        }
      }
    }

    return null;
  }

  public getBlock(x: number, y: number, z: number): string {
    if (y < 0 || y >= WORLD_HEIGHT) return 'air';
    if (this.overrides.size > 0 && this.overrideChunks.has(chunkNumKey(x >> 4, z >> 4))) {
      const ov = this.overrides.get(blockKey(x, y, z));
      if (ov !== undefined) return ov;
    }
    return this.getProceduralBlock(x, y, z);
  }

  public findSafeSpawn(startX = 0, startZ = 0): { x: number; y: number; z: number } {
    if (this.worldType === 'flat') {
      return { x: startX + 0.5, y: 17.05, z: startZ + 0.5 };
    }

    let bestX = startX;
    let bestZ = startZ;
    let foundDry = false;

    for (let r = 0; r <= 48 && !foundDry; r += 4) {
      for (let dx = -r; dx <= r && !foundDry; dx += 4) {
        for (let dz = -r; dz <= r && !foundDry; dz += 4) {
          const tx = startX + dx;
          const tz = startZ + dz;
          const sy = this.getSurfaceHeight(tx, tz);
          if (sy >= WATER_LEVEL + 1 && sy < WORLD_HEIGHT - 12) {
            bestX = tx;
            bestZ = tz;
            foundDry = true;
          }
        }
      }
    }

    const sy = this.getSurfaceHeight(bestX, bestZ);
    let safeY = Math.max(WATER_LEVEL + 2, sy + 1);
    for (let y = safeY; y < WORLD_HEIGHT - 3; y++) {
      if (this.getBlock(bestX, y, bestZ) === 'air' && this.getBlock(bestX, y + 1, bestZ) === 'air') {
        safeY = y;
        break;
      }
    }
    return { x: bestX + 0.5, y: safeY + 0.05, z: bestZ + 0.5 };
  }
}
