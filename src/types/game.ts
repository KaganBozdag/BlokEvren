export type GameMode = 'survival' | 'creative';
export type WorldType = 'normal' | 'flat';
export type BiomeType =
  | 'plains'
  | 'desert'
  | 'forest'
  | 'snow'
  | 'cherry_grove'
  | 'taiga'
  | 'mesa'
  | 'savanna';

export type MobKind = 'cow' | 'pig' | 'sheep';

export type BlockCategory =
  | 'natural'
  | 'ore'
  | 'wood'
  | 'building'
  | 'glass'
  | 'utility'
  | 'tool'
  | 'material'
  | 'food'
  | 'mob'
  | 'mod';

export type ToolType = 'pickaxe' | 'axe' | 'shovel' | 'sword' | 'none';

export type CubeFaceKey = 'right' | 'left' | 'front' | 'back' | 'top' | 'bottom';

export type BlockPattern =
  | 'solid'
  | 'grass_top'
  | 'dirt'
  | 'stone'
  | 'cobble'
  | 'brick'
  | 'ore'
  | 'plank'
  | 'log'
  | 'leaves'
  | 'glass'
  | 'tile'
  | 'glow'
  | 'craft'
  | 'furnace'
  | 'chest'
  | 'tnt'
  | 'bookshelf'
  | 'sand'
  | 'water'
  | 'lava'
  | 'torch'
  | 'wool'
  | 'metal_block'
  | 'cactus'
  | 'pumpkin'
  | 'foliage_cross'
  | 'lantern'
  | 'pillar'
  | 'chiseled'
  | 'cracked'
  | 'mossy'
  | 'terracotta'
  | 'concrete'
  | 'magma'
  | 'prismarine'
  | 'netherrack'
  | 'hay'
  | 'melon'
  | 'bamboo';

export interface CuboidPart {
  id: string;
  name: string;
  x: number; // 0..16 units
  y: number; // 0..16 units
  z: number; // 0..16 units
  w: number; // 1..16 units
  h: number; // 1..16 units
  d: number; // 1..16 units
  color: string;
  rotX?: number; // degrees
  rotY?: number;
  rotZ?: number;
}

export interface CustomModel3D {
  parts: CuboidPart[];
  thumbnailPng?: string;
}

export type AnimationStyle = 'swing' | 'recoil' | 'spin' | 'pulse' | 'thrust' | 'hover';

export interface AnimationConfig {
  style: AnimationStyle;
  speed: number;
  amplitude: number;
  recoil?: number;
  bob?: number;
}

export type WeaponKind = 'melee' | 'gun' | 'bow' | 'staff';

export interface WeaponSpec {
  weaponKind: WeaponKind;
  damage: number;
  cooldown: number; // seconds
  range: number;
  projectileSpeed?: number;
  projectileColor?: string;
  explosionPower?: number;
  lightning?: boolean;
  knockback?: number;
  burstCount?: number;
  spread?: number;
}

export interface ItemDef {
  id: string;
  name: string;
  category: BlockCategory;
  isBlock: boolean;
  pattern: BlockPattern;
  color: string;
  secondaryColor?: string;
  topColor?: string;
  hardness: number; // seconds with bare hand; -1 = unbreakable (bedrock)
  preferredTool: ToolType;
  minToolTier?: number; // 0 = hand, 1 = wood, 2 = stone, 3 = iron, 4 = diamond
  toolType?: ToolType;
  toolTier?: number; // 1..5
  miningSpeed?: number;
  durability?: number;
  blastResistance?: number;
  foodValue?: number;
  transparent?: boolean;
  nonSolid?: boolean; // walk-through plants, flowers, torches
  liquid?: boolean;
  hiddenInInventory?: boolean;
  placesLiquidId?: string;
  isEmptyBucket?: boolean;
  liquidSpread?: number;
  liquidFlowDelayMs?: number;
  liquidHarmful?: boolean;
  lightLevel?: number;
  dropId?: string;
  dropCount?: number;
  spawnMobKind?: MobKind;
  stackSize: number;
  modId?: string;
  customTexture?: string; // 16x16 comma-separated hex string (256 entries) OR PNG data URL
  faceTextures?: Partial<Record<CubeFaceKey, string>>; // optional per-face 16x16 or PNG data URL overrides
  customModel?: CustomModel3D;
  animation?: AnimationConfig;
  weapon?: WeaponSpec;
  hasLuaHooks?: boolean;
  minSpawnY?: number;
  maxSpawnY?: number;
  spawnBiomes?: BiomeType[];
}

export interface RecipeIngredient {
  id: string;
  count: number;
}

export interface RecipeDef {
  id: string;
  name: string;
  ingredients: RecipeIngredient[];
  pattern?: (string | null)[]; // optional 9-slot 3x3 layout for visual crafting
  output: { id: string; count: number };
  requiresFurnace?: boolean;
  modId?: string;
}

export interface InventorySlot {
  id: string;
  count: number;
}

export type SkinPartKey =
  | 'headFront'
  | 'headSide'
  | 'headTop'
  | 'torso'
  | 'arm'
  | 'leg';

export interface SkinData {
  id: string;
  name: string;
  headFront: string; // 64 comma-separated hex colors (8x8)
  headSide: string;
  headTop: string;
  torso: string;
  arm: string;
  leg: string;
}

export interface ModBlockSpec {
  id: string;
  name: string;
  color: string;
  secondaryColor: string;
  pattern: BlockPattern;
  customTexture?: string; // 16x16 comma-separated hex colors (256 entries) or PNG data URL
  faceTextures?: Partial<Record<CubeFaceKey, string>>; // optional per-face 16x16 or PNG data URL overrides
  customModel?: CustomModel3D;
  animation?: AnimationConfig;
  hardness: number;
  blastResistance: number;
  minToolTier: number; // 0..4
  preferredTool: ToolType;
  transparent: boolean;
  nonSolid?: boolean;
  isLiquid?: boolean;
  liquidSpread?: number;
  liquidFlowDelayMs?: number;
  liquidHarmful?: boolean;
  bucketItemId?: string;
  glow: boolean;
  lightLevel?: number;
  spawnAsOre: boolean;
  spawnOnSurface?: boolean;
  spawnBiomes?: BiomeType[];
  minSpawnY?: number;
  maxSpawnY?: number;
  craftIngredientId: string;
  craftIngredientCount: number;
  craftOutputCount: number;
  craftPattern?: (string | null)[]; // optional 9-slot 3x3 crafting grid
}

export interface ModItemSpec {
  id: string;
  name: string;
  itemKind: 'material' | 'food' | 'gem' | 'weapon' | 'bucket';
  color: string;
  secondaryColor?: string;
  placesLiquidId?: string;
  liquidSecondaryColor?: string;
  customTexture?: string; // 16x16 comma-separated hex/transparent colors OR PNG data URL
  customModel?: CustomModel3D;
  animation?: AnimationConfig;
  weapon?: WeaponSpec;
  foodValue?: number;
  stackSize: number;
  craftPattern?: (string | null)[]; // optional 9-slot 3x3 crafting grid
  craftOutputCount?: number;
}

export interface ModToolSpec {
  id: string;
  name: string;
  color: string;
  toolType: ToolType;
  miningSpeed: number;
  toolTier: number;
  durability: number;
  customTexture?: string;
  customModel?: CustomModel3D;
  animation?: AnimationConfig;
  weapon?: WeaponSpec;
  craftIngredientId: string;
  craftIngredientCount: number;
  craftPattern?: (string | null)[]; // optional 9-slot 3x3 crafting grid
}

export interface ModRecipeSpec {
  id: string;
  name: string;
  ingredientA?: string;
  countA?: number;
  ingredientB?: string;
  countB?: number;
  pattern?: (string | null)[]; // 9-slot 3x3 crafting grid
  ingredients?: RecipeIngredient[]; // flattened ingredient counts
  outputId: string;
  outputCount: number;
  requiresFurnace?: boolean;
}

export type ModCommandAction =
  | 'give_item'
  | 'gamemode'
  | 'time'
  | 'heal'
  | 'teleport_up'
  | 'broadcast'
  | 'cottonlua';

export interface ModCommandSpec {
  id: string;
  command: string; // without leading slash, lowercase
  description: string;
  actionType: ModCommandAction;
  itemId?: string;
  itemCount?: number;
  gameMode?: GameMode;
  timeValue?: number;
  healAmount?: number;
  teleportY?: number;
  messageText?: string;
}

export interface ModDefinition {
  id: string;
  name: string;
  description: string;
  version: string;
  authorId: string;
  authorName: string;
  isPublic: boolean;
  likes: number;
  blocks: ModBlockSpec[];
  items?: ModItemSpec[];
  tools: ModToolSpec[];
  recipes: ModRecipeSpec[];
  commands?: ModCommandSpec[];
  achievements?: AchievementDef[];
  isCottonLua?: boolean;
  isApi?: boolean;
  luaSource?: string;
  dependencies?: string[];
  pngTextures?: Record<string, string>;
  models3d?: Record<string, CustomModel3D>;
  assets?: Record<string, string>;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface WorldLaunchConfig {
  mode: 'solo' | 'server';
  worldName: string;
  gameMode: GameMode;
  worldType: WorldType;
  seed: number;
  serverId?: string;
  joinCode?: string;
  ownerId?: string;
  activeModIds: string[];
  initialTimeOfDay?: number;
}

export interface ServerInfo {
  id: string;
  joinCode: string;
  worldName: string;
  ownerId: string;
  ownerName: string;
  worldType: WorldType;
  defaultGameMode: GameMode;
  seed: number;
  isPublic: boolean;
  timeOfDay: number;
  activeModIds: string[];
}

export interface RemotePlayer {
  uid: string;
  displayName: string;
  x: number;
  y: number;
  z: number;
  yaw: number;
  pitch: number;
  gameMode: GameMode;
  heldItemId: string;
  skinData: SkinData;
}

export interface ChatMessage {
  id: string;
  senderId: string;
  senderName: string;
  text: string;
  kind: 'chat' | 'system' | 'command';
  createdAt?: number;
}

export interface TexturePackPaletteOverrides {
  grassTop?: string;
  dirt?: string;
  stone?: string;
  deepslate?: string;
  cobblestone?: string;
  wood?: string;
  leaves?: string;
  sand?: string;
  water?: string;
  brick?: string;
  contrast?: number;
  brightness?: number;
}

export interface TexturePackBlockOverride {
  side?: string; // legacy 4-side fallback (256 comma-separated hex/transparent values)
  right?: string;
  left?: string;
  front?: string;
  back?: string;
  top?: string;
  bottom?: string;
  // Shared/deduplicated texture pool so identical faces count as a single texture
  textures?: Record<string, string>;
  faceMap?: Partial<Record<CubeFaceKey, string>>;
}

export interface TexturePackDef {
  id: string;
  name: string;
  description: string;
  author: string;
  builtIn?: boolean;
  previewColors: [string, string, string, string];
  palette?: TexturePackPaletteOverrides;
  blockOverrides: Record<string, TexturePackBlockOverride>;
}

export type AchievementTier = 'bronze' | 'silver' | 'gold' | 'diamond';

export type AchievementCategory =
  | 'mining'
  | 'crafting'
  | 'building'
  | 'exploration'
  | 'survival'
  | 'mods';

export interface AchievementDef {
  id: string;
  code?: string;
  modId?: string;
  title: string;
  description: string;
  category: AchievementCategory;
  tier: AchievementTier;
  statKey: string;
  target: number;
  points: number;
}

export interface AchievementProgressState {
  unlocked: Record<string, number>;
  stats: Record<string, number>;
}

export interface FriendLink {
  ownerUid: string;
  friendUid: string;
  friendUsername: string;
  addedAt?: number;
}

export interface FriendRequest {
  id: string;
  fromUid: string;
  fromUsername: string;
  toUid: string;
  toUsername: string;
  status: 'pending' | 'accepted' | 'rejected';
  createdAt?: number;
  updatedAt?: number;
}

