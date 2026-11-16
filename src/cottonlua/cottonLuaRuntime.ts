import { ModDefinition } from '../types/game';
import {
  compileCottonLuaMod,
  CompiledCottonLuaResult,
  CottonLuaHookContext,
  CottonLuaItemHooks,
  CottonLuaWorldBridge,
  LuaFnValue,
} from './cottonLuaEngine';

interface RegisteredItemHookEntry {
  modId: string;
  hooks: CottonLuaItemHooks;
  invokeHook: CompiledCottonLuaResult['invokeHook'];
}

interface RegisteredCommandHookEntry {
  modId: string;
  fn: LuaFnValue;
  invokeHook: CompiledCottonLuaResult['invokeHook'];
}

interface RegisteredTickHookEntry {
  modId: string;
  fn: LuaFnValue;
  invokeHook: CompiledCottonLuaResult['invokeHook'];
}

const activeItemHooks = new Map<string, RegisteredItemHookEntry>();
const activeCommandHooks = new Map<string, RegisteredCommandHookEntry>();
let activeTickHooks: RegisteredTickHookEntry[] = [];
let activeWorldBridge: CottonLuaWorldBridge | null = null;

export function setCottonLuaWorldBridge(bridge: CottonLuaWorldBridge | null) {
  activeWorldBridge = bridge;
}

export function getCottonLuaWorldBridge(): CottonLuaWorldBridge | null {
  return activeWorldBridge;
}

export function clearCottonLuaRuntime() {
  activeItemHooks.clear();
  activeCommandHooks.clear();
  activeTickHooks = [];
}

export function registerCottonLuaModRuntime(
  mod: ModDefinition,
  allAvailableMods: ModDefinition[],
): CompiledCottonLuaResult | null {
  if (!mod.isCottonLua || !mod.luaSource || mod.isApi) return null;
  const res = compileCottonLuaMod(mod.luaSource, {
    modId: mod.id,
    modName: mod.name,
    modVersion: mod.version,
    modDescription: mod.description,
    pngTextures: mod.pngTextures || {},
    models3d: mod.models3d || {},
    availableMods: allAvailableMods,
  });

  if (!res.ok) return res;

  res.itemHooks.forEach((hooks, itemId) => {
    activeItemHooks.set(itemId, {
      modId: mod.id,
      hooks,
      invokeHook: res.invokeHook,
    });
  });

  res.commandHandlers.forEach((fn, cmdName) => {
    activeCommandHooks.set(cmdName, {
      modId: mod.id,
      fn,
      invokeHook: res.invokeHook,
    });
  });

  res.worldTickHooks.forEach((fn) => {
    activeTickHooks.push({
      modId: mod.id,
      fn,
      invokeHook: res.invokeHook,
    });
  });

  return res;
}

export function hasCottonLuaItemHook(
  itemId: string,
  eventName: keyof CottonLuaItemHooks,
): boolean {
  const entry = activeItemHooks.get(itemId);
  return Boolean(entry?.hooks[eventName]);
}

export function triggerCottonLuaItemHook(
  itemId: string,
  eventName: keyof CottonLuaItemHooks,
  ctx: CottonLuaHookContext,
): boolean {
  const entry = activeItemHooks.get(itemId);
  const fn = entry?.hooks[eventName];
  if (!entry || !fn || !activeWorldBridge) return false;
  const out = entry.invokeHook(fn, activeWorldBridge, ctx);
  if (!out.ok && out.error) {
    activeWorldBridge.say(`[CottonLua Hata] ${out.error}`);
  }
  return true;
}

export function triggerCottonLuaCommand(
  cmdName: string,
  args: string[],
): boolean {
  const entry = activeCommandHooks.get(cmdName.toLowerCase());
  if (!entry || !activeWorldBridge) return false;
  const pos = activeWorldBridge.getPlayerPos();
  const out = entry.invokeHook(entry.fn, activeWorldBridge, {
    x: Math.floor(pos.x),
    y: Math.floor(pos.y),
    z: Math.floor(pos.z),
    dx: 0,
    dy: 0,
    dz: -1,
    playerX: pos.x,
    playerY: pos.y,
    playerZ: pos.z,
    args,
  });
  if (!out.ok && out.error) {
    activeWorldBridge.say(`[CottonLua Komut Hatası] ${out.error}`);
  }
  return true;
}

export function triggerCottonLuaWorldTicks(dt: number) {
  if (activeTickHooks.length === 0 || !activeWorldBridge) return;
  const pos = activeWorldBridge.getPlayerPos();
  for (const entry of activeTickHooks) {
    entry.invokeHook(entry.fn, activeWorldBridge, {
      x: Math.floor(pos.x),
      y: Math.floor(pos.y),
      z: Math.floor(pos.z),
      dx: dt,
      dy: 0,
      dz: 0,
      playerX: pos.x,
      playerY: pos.y,
      playerZ: pos.z,
    });
  }
}

export interface CottonLuaTemplate {
  id: string;
  title: string;
  subtitle: string;
  code: string;
}

export const COTTONLUA_TEMPLATES: CottonLuaTemplate[] = [
  {
    id: 'giresun_block',
    title: 'GiresunAPI Örnek Blok',
    subtitle: 'wantedMods ID bağımlılığı + 6 yüz PNG doku atama',
    code: `-- CottonLua: Bağımlılıklar yayınlanmış Mod ID ile çağrılır!
local ModName = "Giresun Hatıra Modu"
local ModVersion = "1.0.0"
local ModDescription = "GiresunAPI (api_giresun_sample) kullanarak özel blok ve tarif ekler."
local world = script.parent

-- Yayınlanmış API ID ile bağımlılığı yükle:
local giresunApi = requireMod("api_giresun_sample")
local wantedMods = {"api_giresun_sample"}

Addthing{
  local thingType = block
  local thingName = "Güzel Blok"
  local thingStyle = normalBlock
  local hardness = 1.4
  local glow = true
  local lightLevel = 12
  local thingTextures{
    left,right,front,back,up,down = giresunApi.child("Giresun Fotoğrafı")
  }
  recipe = {
    count = 4,
    shape = {
      "AAA",
      "ABA",
      "AAA"
    },
    keys = {
      A = "oak_planks",
      B = "emerald"
    }
  }
}`,
  },
  {
    id: 'laser_weapon',
    title: 'Plazma Lazer Silahı + 3D Model',
    subtitle: 'WeaponForgeAPI + AnimationConfigAPI + 3D Cuboid Silah',
    code: `local ModName = "Plazma Silah Paketi"
local ModVersion = "1.2.0"
local ModDescription = "3D modelli lazer tüfeği ve yıldırımlı yıldız asası ekler."
local world = script.parent

local wantedMods = {"api_weapon_forge", "api_animation_config", "api_particle_fx"}
local weaponApi = requireMod("api_weapon_forge")
local animApi = requireMod("api_animation_config")
local fxApi = requireMod("api_particle_fx")

Addthing{
  local thingType = gun
  local thingName = "Plazma Lazer Tüfeği"
  local thingColor = "#22d3ee"
  local weapon = weaponApi.gun({
    damage = 14,
    cooldown = 0.18,
    range = 52,
    projectileSpeed = 48,
    projectileColor = "#22d3ee",
    explosionPower = 1.8,
    knockback = 6
  })
  local animation = animApi.recoilPreset(1.1)
  local thingModel = {
    { name = "Kabza", x = 6, y = 2, z = 6, w = 4, h = 6, d = 4, color = "#1e293b" },
    { name = "Gövde", x = 5, y = 7, z = 3, w = 6, h = 4, d = 11, color = "#0f172a" },
    { name = "Namlu", x = 6, y = 8, z = 0, w = 4, h = 2, d = 14, color = "#22d3ee" },
    { name = "Dürbün", x = 7, y = 11, z = 6, w = 2, h = 2, d = 5, color = "#f43f5e" }
  }
  onUse = function(ctx)
    fxApi.burst(world, ctx.playerX, ctx.playerY + 1.5, ctx.playerZ, "#38bdf8", 8)
  end
}`,
  },
  {
    id: 'house_builder',
    title: 'Anında Ev İnşa Bloğu + Komut',
    subtitle: 'WorldBuilderAPI + Bağıl Koordinat İnşaatı + /kale Komutu',
    code: `local ModName = "Mimari İnşaat Modu"
local ModVersion = "1.0.0"
local ModDescription = "Yere koyunca anında kulübe kuran blok ve /kale komutu ekler."
local world = script.parent

local wantedMods = {"api_world_builder", "api_particle_fx", "api_entity_control"}
local builder = requireMod("api_world_builder")
local fx = requireMod("api_particle_fx")
local entityApi = requireMod("api_entity_control")

Addthing{
  local thingType = block
  local thingName = "Anında Kulübe Bloğu"
  local thingStyle = tileBlock
  local thingColor = "#f59e0b"
  local glow = true
  onPlace = function(ctx)
    -- Bloğun konduğu yere göre 7x5x7 ahşap kulübe inşa et!
    builder.hollowBox(world, ctx.x, ctx.y, ctx.z, 7, 5, 7, "oak_planks", "cobblestone")
    -- Ön köşelere meşale & ışıktaşı koy
    world.setBlockRel(ctx.x, ctx.y, ctx.z, -2, 3, 2, "glowstone")
    world.setBlockRel(ctx.x, ctx.y, ctx.z, 2, 3, 2, "glowstone")
    fx.ring(world, ctx.x, ctx.y + 1, ctx.z, 3.5, "#fbbf24", 12)
    entityApi.say(ctx, "Anında kulübe inşa edildi!")
  end
}

AddCommand{
  name = "kuleyap",
  desc = "Bulunduğun konumun yanına taş kule inşa eder",
  run = function(ctx)
    builder.tower(world, math.floor(ctx.playerX) + 6, math.floor(ctx.playerY), math.floor(ctx.playerZ), 3, 10, "stone_bricks", "glowstone")
    fx.lightning(world, math.floor(ctx.playerX) + 6, math.floor(ctx.playerY) + 10, math.floor(ctx.playerZ), "#a855f7")
    world.say("Kule 6 blok yanında yükseldi!")
  end
}`,
  },
  {
    id: 'custom_achievement_mod',
    title: 'Özel Başarım + achievementTake',
    subtitle: 'Hayatta Kalma modunda açılan ve Google hesabına kaydedilen başarım',
    code: `local ModName = "Efsane Başarım Modu"
local ModVersion = "1.0.0"
local ModDescription = "Hayatta kalmada özel başarım tanımlar ve achievementTake ile tetikler."
local world = script.parent

-- 1) Yeni başarımı tanımla (Yalnızca Hayatta Kalma modunda açılır!)
Addthing{
  local thingType = achievement
  local achievementCode = altin_kasif
  local thingName = "Altın Kaşif"
  local description = "Altın Kaşif Bloğunu dünyaya yerleştirerek özel başarımı kazan."
  local tier = gold
  local points = 50
  local target = 1
}

-- 2) Başarımı tetikleyen blok
Addthing{
  local thingType = block
  local thingName = "Altın Kaşif Bloğu"
  local thingStyle = glowBlock
  local thingColor = "#facc15"
  local glow = true
  onPlace = function(ctx)
    world.spawnParticles(ctx.x, ctx.y + 1, ctx.z, "#facc15", 16)
    -- Hayatta kalma modundaysan başarımı kazandırır & Google hesabına kaydeder:
    achievementTake(altin_kasif)
    world.say("Altın Kaşif Bloğu yerleştirildi!")
  end
}`,
  },
  {
    id: 'custom_liquid_bucket',
    title: 'Akışkan Sıvı + Kova Modu',
    subtitle: 'Renkli & PNG dokulu akan sıvı + otomatik Kova eşyası',
    code: `local ModName = "Zehirli Asit & İksir Sıvıları"
local ModVersion = "1.0.0"
local ModDescription = "Özel renkli, dokulu akışkan sıvılar ve kovalar ekler."
local world = script.parent

-- 1) Hasar veren parlak yeşil Asit sıvısı + "Radyoaktif Asit Kovası"
Addthing{
  local thingType = liquid
  local thingName = "Radyoaktif Asit"
  local bucketName = "Asit Kovası"
  local thingColor = "#84cc16"
  local secondaryColor = "#3f6212"
  local thingStyle = water
  -- Özel PNG texture eklemek istersen: local thingTexture = mod.texture("AsitDokusu")
  local transparent = true
  local glow = true
  local lightLevel = 12
  local harmful = true
  local flowRange = 6
  local flowSpeed = fast
  recipe = {
    count = 1,
    shape = {
      " A ",
      "ABA",
      " C "
    },
    keys = {
      A = "emerald",
      B = "water_bucket",
      C = "bucket"
    }
  }
  onPlace = function(ctx)
    world.spawnParticles(ctx.x, ctx.y + 1, ctx.z, "#a3e635", 10)
  end
}`,
  },
];

