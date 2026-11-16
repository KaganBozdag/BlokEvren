import { ModDefinition } from '../types/game';

// Pure-JS 16x16 uncompressed RGBA PNG generator (no DOM dependency, always valid PNG)
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) {
    c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

function adler32(bytes: Uint8Array): number {
  let s1 = 1;
  let s2 = 0;
  for (let i = 0; i < bytes.length; i++) {
    s1 = (s1 + bytes[i]) % 65521;
    s2 = (s2 + s1) % 65521;
  }
  return ((s2 << 16) | s1) >>> 0;
}

function writeU32BE(buf: Uint8Array, offset: number, val: number) {
  buf[offset] = (val >>> 24) & 0xff;
  buf[offset + 1] = (val >>> 16) & 0xff;
  buf[offset + 2] = (val >>> 8) & 0xff;
  buf[offset + 3] = val & 0xff;
}

function makePngChunk(type: string, data: Uint8Array): Uint8Array {
  const out = new Uint8Array(12 + data.length);
  writeU32BE(out, 0, data.length);
  for (let i = 0; i < 4; i++) out[4 + i] = type.charCodeAt(i);
  out.set(data, 8);
  const crcInput = out.subarray(4, 8 + data.length);
  writeU32BE(out, 8 + data.length, crc32(crcInput));
  return out;
}

export function pixelsToPngDataUrl(pixels: string[], size = 16): string {
  const rawRowStride = 1 + size * 4;
  const raw = new Uint8Array(rawRowStride * size);

  for (let y = 0; y < size; y++) {
    const rowStart = y * rawRowStride;
    raw[rowStart] = 0; // PNG filter type 0
    for (let x = 0; x < size; x++) {
      const val = pixels[y * size + x] || 'transparent';
      const pOff = rowStart + 1 + x * 4;
      if (val === 'transparent') {
        raw[pOff] = 0;
        raw[pOff + 1] = 0;
        raw[pOff + 2] = 0;
        raw[pOff + 3] = 0;
      } else if (val === 'rgba_glass') {
        raw[pOff] = 186;
        raw[pOff + 1] = 230;
        raw[pOff + 2] = 253;
        raw[pOff + 3] = 90;
      } else {
        const clean = val.replace('#', '');
        const full = clean.length === 3 ? clean.replace(/(.)/g, '$1$1') : clean;
        const num = parseInt(full, 16);
        if (Number.isNaN(num)) {
          raw[pOff] = 148;
          raw[pOff + 1] = 163;
          raw[pOff + 2] = 184;
          raw[pOff + 3] = 255;
        } else {
          raw[pOff] = (num >> 16) & 0xff;
          raw[pOff + 1] = (num >> 8) & 0xff;
          raw[pOff + 2] = num & 0xff;
          raw[pOff + 3] = 255;
        }
      }
    }
  }

  // Zlib store block (no compression, valid for <= 65535 bytes; 16x16 RGBA is 1040 bytes)
  const zlibData = new Uint8Array(2 + 5 + raw.length + 4);
  zlibData[0] = 0x78;
  zlibData[1] = 0x01;
  zlibData[2] = 0x01; // BFINAL=1, BTYPE=00 (stored)
  zlibData[3] = raw.length & 0xff;
  zlibData[4] = (raw.length >>> 8) & 0xff;
  const nlen = (~raw.length) & 0xffff;
  zlibData[5] = nlen & 0xff;
  zlibData[6] = (nlen >>> 8) & 0xff;
  zlibData.set(raw, 7);
  writeU32BE(zlibData, 7 + raw.length, adler32(raw));

  const ihdr = new Uint8Array(13);
  writeU32BE(ihdr, 0, size);
  writeU32BE(ihdr, 4, size);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type RGBA
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  const sig = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdrChunk = makePngChunk('IHDR', ihdr);
  const idatChunk = makePngChunk('IDAT', zlibData);
  const iendChunk = makePngChunk('IEND', new Uint8Array(0));

  const total = new Uint8Array(
    sig.length + ihdrChunk.length + idatChunk.length + iendChunk.length,
  );
  let pos = 0;
  total.set(sig, pos);
  pos += sig.length;
  total.set(ihdrChunk, pos);
  pos += ihdrChunk.length;
  total.set(idatChunk, pos);
  pos += idatChunk.length;
  total.set(iendChunk, pos);

  let binary = '';
  for (let i = 0; i < total.length; i++) {
    binary += String.fromCharCode(total[i]);
  }
  return `data:image/png;base64,${btoa(binary)}`;
}

// Handcrafted 16x16 Giresun scenery PNG: Black Sea blue, lush green hills, castle/hazelnut accents & sun
function createGiresunPhotoPng(): string {
  const px: string[] = [];
  for (let y = 0; y < 16; y++) {
    for (let x = 0; x < 16; x++) {
      // Sky & Sun
      if (y < 6) {
        if ((x === 12 || x === 13) && (y === 1 || y === 2)) px.push('#fde047');
        else if (y === 0) px.push('#38bdf8');
        else if (y < 4) px.push('#60a5fa');
        else px.push('#93c5fd');
      } else if (y < 9) {
        // Black Sea horizon + Giresun Island silhouette
        if (x >= 9 && x <= 13 && y === 7) px.push('#15803d');
        else if (x >= 10 && x <= 12 && y === 6) px.push('#166534');
        else px.push((x + y) % 3 === 0 ? '#2563eb' : '#1d4ed8');
      } else {
        // Lush Emerald Hills & Hazelnut Groves
        const hill = y === 9 && (x < 3 || x > 7);
        if (hill) px.push('#1e40af');
        else if ((x === 3 || x === 7 || x === 12) && y >= 11 && y <= 13) px.push('#78350f');
        else if ((x === 2 || x === 4 || x === 6 || x === 8) && y === 10) px.push('#16a34a');
        else if ((x + y) % 4 === 0) px.push('#22c55e');
        else px.push('#15803d');
      }
    }
  }
  return pixelsToPngDataUrl(px, 16);
}

function createHazelnutPng(): string {
  const px: string[] = new Array(256).fill('#166534');
  for (let y = 0; y < 16; y++) {
    for (let x = 0; x < 16; x++) {
      const dx = x - 7.5;
      const dy = y - 8.5;
      const d = dx * dx + dy * dy;
      if (d < 16) {
        px[y * 16 + x] = y < 7 ? '#b45309' : '#78350f';
      } else if ((x + y) % 3 === 0) {
        px[y * 16 + x] = '#15803d';
      }
    }
  }
  px[5 * 16 + 7] = '#fbbf24';
  px[5 * 16 + 8] = '#d97706';
  return pixelsToPngDataUrl(px, 16);
}

function createBlackSeaWavePng(): string {
  const px: string[] = [];
  for (let y = 0; y < 16; y++) {
    for (let x = 0; x < 16; x++) {
      const wave = (x + y * 2) % 6 === 0;
      px.push(wave ? '#38bdf8' : y % 4 === 0 ? '#0284c7' : '#0369a1');
    }
  }
  return pixelsToPngDataUrl(px, 16);
}

export const GIRESUN_PHOTO_PNG = createGiresunPhotoPng();
export const GIRESUN_HAZELNUT_PNG = createHazelnutPng();
export const GIRESUN_SEA_PNG = createBlackSeaWavePng();

export interface BuiltinApiEntry {
  mod: ModDefinition;
  exportSymbol: string;
  aliases: string[];
}

export const BUILTIN_API_ENTRIES: BuiltinApiEntry[] = [
  {
    exportSymbol: 'AnimationConfigAPI',
    aliases: ['AnimationConfigAPI', 'animationConfigApi', 'animApi'],
    mod: {
      id: 'api_animation_config',
      name: 'AnimationConfigAPI (Resmi Animasyon API)',
      description:
        'Silah geri tepmesi, dönme, nabız, havada süzülme ve kılıç savurma animasyonlarını tek satırda yapılandırır.',
      version: '1.2.0',
      authorId: 'blokevren_official',
      authorName: 'BlokEvren Çekirdek',
      isPublic: true,
      isApi: true,
      isCottonLua: true,
      likes: 420,
      blocks: [],
      items: [],
      tools: [],
      recipes: [],
      commands: [],
      luaSource: `-- AnimationConfigAPI (Yayınlanmış ID: "api_animation_config")
local ModName = "AnimationConfigAPI"
AnimationConfigAPI = {}

function AnimationConfigAPI.create(style, speed, amplitude, recoil)
  return {
    style = style or "swing",
    speed = speed or 1.4,
    amplitude = amplitude or 1.0,
    recoil = recoil or 0.45
  }
end

function AnimationConfigAPI.recoilPreset(power)
  return AnimationConfigAPI.create("recoil", 2.6, power or 1.2, power or 0.85)
end

function AnimationConfigAPI.swordSlashPreset(speed)
  return AnimationConfigAPI.create("swing", speed or 2.0, 1.35, 0.15)
end

function AnimationConfigAPI.magicFloatPreset()
  return AnimationConfigAPI.create("hover", 1.8, 0.9, 0.2)
end

function AnimationConfigAPI.spinPreset(speed)
  return AnimationConfigAPI.create("spin", speed or 3.0, 1.0, 0)
end`,
    },
  },
  {
    exportSymbol: 'WorldBuilderAPI',
    aliases: ['WorldBuilderAPI', 'worldBuilderApi', 'builderApi'],
    mod: {
      id: 'api_world_builder',
      name: 'WorldBuilderAPI (Yapı & Şema İnşa API)',
      description:
        'Ana bloğa göre bağıl (relative) koordinatlarla ev, kule, küre, sütun ve şematik yapılar inşa eder.',
      version: '1.4.0',
      authorId: 'blokevren_official',
      authorName: 'BlokEvren Çekirdek',
      isPublic: true,
      isApi: true,
      isCottonLua: true,
      likes: 512,
      blocks: [],
      items: [],
      tools: [],
      recipes: [],
      commands: [],
      luaSource: `-- WorldBuilderAPI (Yayınlanmış ID: "api_world_builder")
local ModName = "WorldBuilderAPI"
WorldBuilderAPI = {}

function WorldBuilderAPI.placeRelative(world, ox, oy, oz, dx, dy, dz, blockId)
  world.setBlock(ox + dx, oy + dy, oz + dz, blockId)
end

function WorldBuilderAPI.fillBox(world, ox, oy, oz, x1, y1, z1, x2, y2, z2, blockId)
  local minX = math.min(x1, x2)
  local maxX = math.max(x1, x2)
  local minY = math.min(y1, y2)
  local maxY = math.max(y1, y2)
  local minZ = math.min(z1, z2)
  local maxZ = math.max(z1, z2)
  world.fill(ox + minX, oy + minY, oz + minZ, ox + maxX, oy + maxY, oz + maxZ, blockId)
end

function WorldBuilderAPI.hollowBox(world, ox, oy, oz, w, h, d, wallBlock, floorBlock)
  local hw = math.floor(w / 2)
  local hd = math.floor(d / 2)
  for dy = 0, h - 1 do
    for dx = -hw, hw do
      for dz = -hd, hd do
        local isWall = dx == -hw or dx == hw or dz == -hd or dz == hd or dy == h - 1
        if dy == 0 then
          world.setBlock(ox + dx, oy + dy, oz + dz, floorBlock or wallBlock)
        elseif isWall then
          -- Kapı boşluğu bırak
          if not (dz == hd and dx == 0 and (dy == 1 or dy == 2)) then
            world.setBlock(ox + dx, oy + dy, oz + dz, wallBlock)
          end
        else
          world.setBlock(ox + dx, oy + dy, oz + dz, "air")
        end
      end
    end
  end
end

function WorldBuilderAPI.pillar(world, ox, oy, oz, dx, dz, height, blockId)
  for y = 0, height - 1 do
    world.setBlock(ox + dx, oy + y, oz + dz, blockId)
  end
end

function WorldBuilderAPI.buildSchematic(world, ox, oy, oz, list)
  for _, item in ipairs(list) do
    world.setBlock(ox + (item.dx or 0), oy + (item.dy or 0), oz + (item.dz or 0), item.block)
  end
end`,
    },
  },
  {
    exportSymbol: 'WeaponForgeAPI',
    aliases: ['WeaponForgeAPI', 'weaponForgeApi', 'weaponApi'],
    mod: {
      id: 'api_weapon_forge',
      name: 'WeaponForgeAPI (Silah, Lazer & Patlama API)',
      description:
        'Ateşli silahlar, lazer tabancaları, sihir asaları, patlayıcı mermiler ve yüksek hasarlı kılıçlar üretir.',
      version: '1.3.0',
      authorId: 'blokevren_official',
      authorName: 'BlokEvren Çekirdek',
      isPublic: true,
      isApi: true,
      isCottonLua: true,
      likes: 640,
      blocks: [],
      items: [],
      tools: [],
      recipes: [],
      commands: [],
      luaSource: `-- WeaponForgeAPI (Yayınlanmış ID: "api_weapon_forge")
local ModName = "WeaponForgeAPI"
WeaponForgeAPI = {}

function WeaponForgeAPI.gun(opts)
  opts = opts or {}
  return {
    weaponKind = "gun",
    damage = opts.damage or 8,
    cooldown = opts.cooldown or 0.22,
    range = opts.range or 48,
    projectileSpeed = opts.projectileSpeed or 42,
    projectileColor = opts.projectileColor or "#38bdf8",
    explosionPower = opts.explosionPower or 0,
    lightning = opts.lightning or false,
    knockback = opts.knockback or 4,
    burstCount = opts.burstCount or 1,
    spread = opts.spread or 0.02
  }
end

function WeaponForgeAPI.staff(opts)
  opts = opts or {}
  return {
    weaponKind = "staff",
    damage = opts.damage or 12,
    cooldown = opts.cooldown or 0.45,
    range = opts.range or 40,
    projectileSpeed = opts.projectileSpeed or 32,
    projectileColor = opts.projectileColor or "#c084fc",
    explosionPower = opts.explosionPower or 2.2,
    lightning = opts.lightning ~= false,
    knockback = opts.knockback or 6,
    burstCount = opts.burstCount or 1,
    spread = opts.spread or 0.01
  }
end

function WeaponForgeAPI.sword(opts)
  opts = opts or {}
  return {
    weaponKind = "melee",
    damage = opts.damage or 10,
    cooldown = opts.cooldown or 0.25,
    range = opts.range or 5,
    knockback = opts.knockback or 5
  }
end

function WeaponForgeAPI.explode(world, x, y, z, radius)
  world.explode(x, y, z, radius or 2.5)
end`,
    },
  },
  {
    exportSymbol: 'ParticleFXAPI',
    aliases: ['ParticleFXAPI', 'particleFxApi', 'fxApi'],
    mod: {
      id: 'api_particle_fx',
      name: 'ParticleFXAPI (Parçacık, Şimşek & Efekt API)',
      description:
        'Renkli parçacık patlamaları, kalp efektleri, halkalar ve gökyüzünden yıldırım indirme efektleri sağlar.',
      version: '1.1.0',
      authorId: 'blokevren_official',
      authorName: 'BlokEvren Çekirdek',
      isPublic: true,
      isApi: true,
      isCottonLua: true,
      likes: 315,
      blocks: [],
      items: [],
      tools: [],
      recipes: [],
      commands: [],
      luaSource: `-- ParticleFXAPI (Yayınlanmış ID: "api_particle_fx")
local ModName = "ParticleFXAPI"
ParticleFXAPI = {}

function ParticleFXAPI.burst(world, x, y, z, color, count)
  world.spawnParticles(x, y, z, color or "#fbbf24", count or 12)
end

function ParticleFXAPI.hearts(world, x, y, z, count)
  world.spawnHearts(x, y, z, count or 6)
end

function ParticleFXAPI.lightning(world, x, y, z, color)
  world.spawnLightning(x, y, z, color or "#38bdf8")
end

function ParticleFXAPI.ring(world, x, y, z, radius, color, points)
  local r = radius or 2.5
  local n = points or 10
  for i = 1, n do
    local a = (i / n) * math.pi * 2
    world.spawnParticles(x + math.cos(a) * r, y + 0.3, z + math.sin(a) * r, color or "#22d3ee", 2)
  end
end`,
    },
  },
  {
    exportSymbol: 'EntityControlAPI',
    aliases: ['EntityControlAPI', 'entityControlApi', 'entityApi'],
    mod: {
      id: 'api_entity_control',
      name: 'EntityControlAPI (Canlı & Oyuncu Kontrol API)',
      description:
        'İstediğin koordinatta inek/domuz/koyun/yavru doğurur, oyuncuyu fırlatır, ışınlar, iyileştirir veya eşya verir.',
      version: '1.2.5',
      authorId: 'blokevren_official',
      authorName: 'BlokEvren Çekirdek',
      isPublic: true,
      isApi: true,
      isCottonLua: true,
      likes: 298,
      blocks: [],
      items: [],
      tools: [],
      recipes: [],
      commands: [],
      luaSource: `-- EntityControlAPI (Yayınlanmış ID: "api_entity_control")
local ModName = "EntityControlAPI"
EntityControlAPI = {}

function EntityControlAPI.spawnMob(world, kind, x, y, z, isBaby)
  world.spawnMob(kind or "cow", x, y, z, isBaby == true)
end

function EntityControlAPI.healPlayer(ctx, amount)
  ctx.heal(amount or 10)
end

function EntityControlAPI.launchPlayer(ctx, vx, vy, vz)
  ctx.launch(vx or 0, vy or 12, vz or 0)
end

function EntityControlAPI.teleportPlayer(ctx, x, y, z)
  ctx.teleport(x, y, z)
end

function EntityControlAPI.give(ctx, itemId, count)
  ctx.give(itemId, count or 1)
end

function EntityControlAPI.say(ctx, text)
  ctx.say(text)
end`,
    },
  },
  {
    exportSymbol: 'GiresunAPI',
    aliases: ['GiresunAPI', 'giresunApi'],
    mod: {
      id: 'api_giresun_sample',
      name: 'GiresunAPI (Örnek Doku & Asset API)',
      description:
        'Modlara .child("Giresun Fotoğrafı"), .child("Fındık Dokusu") ve .child("Karadeniz Dalgası") PNG varlıkları sağlar.',
      version: '1.0.0',
      authorId: 'blokevren_official',
      authorName: 'BlokEvren Çekirdek',
      isPublic: true,
      isApi: true,
      isCottonLua: true,
      likes: 777,
      blocks: [],
      items: [],
      tools: [],
      recipes: [],
      commands: [],
      pngTextures: {
        'Giresun Fotoğrafı': GIRESUN_PHOTO_PNG,
        'Fındık Dokusu': GIRESUN_HAZELNUT_PNG,
        'Karadeniz Dalgası': GIRESUN_SEA_PNG,
      },
      assets: {
        'Giresun Fotoğrafı': GIRESUN_PHOTO_PNG,
        'Fındık Dokusu': GIRESUN_HAZELNUT_PNG,
        'Karadeniz Dalgası': GIRESUN_SEA_PNG,
      },
      luaSource: `-- GiresunAPI (Yayınlanmış ID: "api_giresun_sample")
local ModName = "GiresunAPI"
-- Bu API içerisinde gömülü 3 adet 16x16 PNG varlık barındırır:
--   giresunApi.child("Giresun Fotoğrafı")
--   giresunApi.child("Fındık Dokusu")
--   giresunApi.child("Karadeniz Dalgası")
GiresunAPI = {
  assets = {
    ["Giresun Fotoğrafı"] = "PNG_16x16",
    ["Fındık Dokusu"] = "PNG_16x16",
    ["Karadeniz Dalgası"] = "PNG_16x16"
  }
}

function GiresunAPI.child(assetName)
  return mod.asset(assetName)
end`,
    },
  },
];

export const BUILTIN_COTTON_APIS: ModDefinition[] = BUILTIN_API_ENTRIES.map((e) => e.mod);

export function findBuiltinApiById(id: string): BuiltinApiEntry | undefined {
  return BUILTIN_API_ENTRIES.find((e) => e.mod.id === id);
}
