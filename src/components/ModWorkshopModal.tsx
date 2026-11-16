import { User } from 'firebase/auth';
import {
  Apple,
  ArrowLeft,
  Check,
  Code2,
  Copy,
  Download,
  Droplets,
  Eraser,
  Eye,
  Flame,
  Globe,
  Grid3X3,
  Hammer,
  Heart,
  Image as ImageIcon,
  Layers,
  Link2,
  PackagePlus,
  PaintBucket,
  Paintbrush,
  Pipette,
  Plus,
  RotateCcw,
  Search,
  Share2,
  Sparkles,
  Terminal,
  Trash2,
  Trees,
  Upload,
  Wand2,
  Wrench,
  X,
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { BUILTIN_COTTON_APIS } from '../cottonlua/builtinApis';
import { getAllItems, patternToIngredients } from '../data/blocksAndRecipes';
import {
  ALL_CUBE_FACES,
  CUBE_FACE_META,
  generatePresetPatternPixels,
  getItemIconUrl,
} from '../engine/textures';
import {
  deleteCommunityMod,
  fetchCommunityMods,
  likeCommunityMod,
  publishModToCloud,
} from '../services/cloudService';
import {
  BiomeType,
  BlockPattern,
  CubeFaceKey,
  GameMode,
  ModBlockSpec,
  ModCommandAction,
  ModCommandSpec,
  ModDefinition,
  ModItemSpec,
  ModRecipeSpec,
  ModToolSpec,
  ToolType,
} from '../types/game';
import { CottonLuaEditorModal } from './CottonLuaEditorModal';
import { LiveCubePreview3D } from './LiveCubePreview3D';

interface ModWorkshopModalProps {
  user: User | null;
  username?: string | null;
  localMods: ModDefinition[];
  enabledModIds: string[];
  onToggleMod: (modId: string) => void;
  onSaveLocalMods: (mods: ModDefinition[]) => void;
  onClose: () => void;
}

type EditorKind = 'block' | 'liquid' | 'item' | 'tool' | 'recipe' | 'furnace' | 'command';

interface PaletteOption {
  id: string;
  name: string;
  iconUrl: string;
  isModLocal?: boolean;
}

const PATTERN_OPTIONS: { value: BlockPattern; label: string }[] = [
  { value: 'ore', label: 'Cevher (MC Damarlı)' },
  { value: 'cobble', label: 'Kırıktaş (Mozaik)' },
  { value: 'brick', label: 'Tuğla Duvar' },
  { value: 'tile', label: 'Cilalı Karo' },
  { value: 'metal_block', label: 'Metal / Mücevher Blok' },
  { value: 'plank', label: 'Ahşap Tahta' },
  { value: 'log', label: 'Ağaç Kütüğü (Halkalı)' },
  { value: 'leaves', label: 'Yarı Şeffaf Yaprak' },
  { value: 'foliage_cross', label: 'Çapraz Bitki / Çiçek' },
  { value: 'bamboo', label: 'Bambu Sapı' },
  { value: 'lantern', label: 'Asılı / Yer Feneri' },
  { value: 'pillar', label: 'Sütun / Kuvars' },
  { value: 'chiseled', label: 'Oymalı Taş' },
  { value: 'cracked', label: 'Çatlak Taş' },
  { value: 'mossy', label: 'Yosunlu Taş' },
  { value: 'terracotta', label: 'Katmanlı Terakota' },
  { value: 'concrete', label: 'Düz Beton' },
  { value: 'magma', label: 'Magma / Kor Damarlı' },
  { value: 'prismarine', label: 'Prizmarin / Okyanus' },
  { value: 'netherrack', label: 'Nether Taşı' },
  { value: 'hay', label: 'Saman Balyası' },
  { value: 'melon', label: 'Karpuz / Kabak Deseni' },
  { value: 'glow', label: 'Parlayan Kristal' },
  { value: 'glass', label: 'Şeffaf Cam' },
  { value: 'solid', label: 'Düz Taş / Katı' },
];

const BIOME_OPTIONS: { id: BiomeType; label: string }[] = [
  { id: 'plains', label: 'Ova' },
  { id: 'forest', label: 'Orman' },
  { id: 'cherry_grove', label: 'Kiraz Korusu' },
  { id: 'taiga', label: 'Tayga' },
  { id: 'snow', label: 'Karlı Dağlar' },
  { id: 'desert', label: 'Çöl' },
  { id: 'mesa', label: 'Mesa' },
  { id: 'savanna', label: 'Savana' },
];

const TEXTURE_PALETTE = [
  '#f8fafc', '#cbd5e1', '#7d838a', '#4c5158', '#1e293b', '#0f172a',
  '#ef4444', '#dc2626', '#f97316', '#facc15', '#fef08a', '#84cc16',
  '#22c55e', '#10b981', '#06b6d4', '#38bdf8', '#2563eb', '#6366f1',
  '#9333ea', '#ec4899', '#d97736', '#a36b3e', '#79553a', '#462c18',
];

const TOOL_TIER_LABELS: { tier: number; label: string }[] = [
  { tier: 0, label: 'El ile Kırılabilir' },
  { tier: 1, label: 'Tahta+ Alet' },
  { tier: 2, label: 'Taş+ Alet' },
  { tier: 3, label: 'Demir+ Alet' },
  { tier: 4, label: 'Elmas+ Alet' },
  { tier: 5, label: 'Netherit+ Alet (Seviye 5)' },
];

const ADD_OPTIONS: {
  kind: EditorKind;
  title: string;
  subtitle: string;
  badge: string;
  accent: string;
  icon: typeof Sparkles;
}[] = [
  {
    kind: 'block',
    title: 'Özel Blok',
    subtitle: '6 yüzlü 16×16 piksel doku, dayanıklılık, ışık ve maden derinliği',
    badge: 'BLOK',
    accent: 'border-amber-500/40 bg-amber-500/10 text-amber-300 hover:border-amber-400',
    icon: Sparkles,
  },
  {
    kind: 'liquid',
    title: 'Akışkan Sıvı + Kova',
    subtitle: 'Özel renk ve PNG/piksel dokulu akan sıvı + otomatik Kova eşyası',
    badge: 'SIVI & KOVA',
    accent: 'border-cyan-500/40 bg-cyan-500/10 text-cyan-300 hover:border-cyan-400',
    icon: Droplets,
  },
  {
    kind: 'item',
    title: 'Özel Eşya / Yiyecek',
    subtitle: '16×16 piksel art ile malzeme, nadir mücevher veya can veren yiyecek',
    badge: 'EŞYA',
    accent: 'border-rose-500/40 bg-rose-500/10 text-rose-300 hover:border-rose-400',
    icon: Apple,
  },
  {
    kind: 'tool',
    title: 'Özel Alet / Silah',
    subtitle: 'Kazma, balta, kürek veya kılıç · Hız ve dayanıklılık ayarları',
    badge: 'ALET',
    accent: 'border-sky-500/40 bg-sky-500/10 text-sky-300 hover:border-sky-400',
    icon: Wrench,
  },
  {
    kind: 'recipe',
    title: '3×3 Craft Tarifi',
    subtitle: 'Çalışma masası 3×3 ızgarasına malzemeleri yerleştirip üretim tarifi kur',
    badge: '3×3 ZANAAT',
    accent: 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300 hover:border-emerald-400',
    icon: Grid3X3,
  },
  {
    kind: 'furnace',
    title: 'Ocak Eritme Tarifi',
    subtitle: 'Fırında ısıtarak yeni bir blok veya eşya elde etme tarifi',
    badge: 'OCAK',
    accent: 'border-orange-500/40 bg-orange-500/10 text-orange-300 hover:border-orange-400',
    icon: Flame,
  },
  {
    kind: 'command',
    title: 'Özel Komut (/komut)',
    subtitle: 'Sohbetten çalıştırılabilir özel slash komutu tanımla',
    badge: '/KOMUT',
    accent: 'border-violet-500/40 bg-violet-500/10 text-violet-300 hover:border-violet-400',
    icon: Terminal,
  },
];

function pixelsToDataUrl(pixels: string[], fallbackColor: string): string {
  const c = document.createElement('canvas');
  c.width = 16;
  c.height = 16;
  const ctx = c.getContext('2d')!;
  for (let y = 0; y < 16; y++) {
    for (let x = 0; x < 16; x++) {
      const val = pixels[y * 16 + x] || fallbackColor;
      if (val === 'transparent') continue;
      if (val === 'rgba_glass') {
        ctx.fillStyle = fallbackColor;
        ctx.globalAlpha = 0.35;
        ctx.fillRect(x, y, 1, 1);
        ctx.globalAlpha = 1;
      } else {
        ctx.fillStyle = val;
        ctx.fillRect(x, y, 1, 1);
      }
    }
  }
  return c.toDataURL();
}

function buildSixFacePixels(
  pattern: BlockPattern,
  primary: string,
  secondary: string,
  seed: number,
): Record<CubeFaceKey, string[]> {
  return {
    right: generatePresetPatternPixels(pattern, primary, secondary, 'right', seed),
    left: generatePresetPatternPixels(pattern, primary, secondary, 'left', seed),
    front: generatePresetPatternPixels(pattern, primary, secondary, 'front', seed),
    back: generatePresetPatternPixels(pattern, primary, secondary, 'back', seed),
    top: generatePresetPatternPixels(pattern, primary, secondary, 'top', seed),
    bottom: generatePresetPatternPixels(pattern, primary, secondary, 'bottom', seed),
  };
}

function buildPresetItemPixels(
  kind: 'material' | 'food' | 'gem',
  primary: string,
  secondary: string,
): string[] {
  const px = Array(256).fill('transparent');
  const set = (x: number, y: number, c: string) => {
    if (x >= 0 && x < 16 && y >= 0 && y < 16) px[y * 16 + x] = c;
  };
  if (kind === 'gem') {
    for (let y = 2; y <= 13; y++) {
      const halfW = y < 8 ? y - 1 : 14 - y;
      for (let x = 8 - halfW; x <= 7 + halfW; x++) {
        const edge = x === 8 - halfW || x === 7 + halfW || y === 2 || y === 13;
        set(x, y, edge ? '#0f172a' : (x + y) % 3 === 0 ? secondary : primary);
      }
    }
    set(6, 5, '#ffffff');
    set(7, 5, '#ffffff');
    set(6, 6, '#ffffff');
  } else if (kind === 'food') {
    for (let y = 4; y <= 13; y++) {
      for (let x = 3; x <= 12; x++) {
        const dx = x - 7.5;
        const dy = y - 8.5;
        const d = dx * dx + dy * dy;
        if (d <= 22) {
          const edge = d >= 16;
          set(x, y, edge ? '#451a03' : y < 8 && x < 7 ? secondary : primary);
        }
      }
    }
    set(7, 2, '#65a30d');
    set(8, 2, '#16a34a');
    set(9, 2, '#22c55e');
    set(7, 3, '#78350f');
    set(5, 6, '#ffffff');
  } else {
    // Ingot / material bar
    for (let y = 5; y <= 11; y++) {
      const shift = Math.floor((11 - y) * 0.4);
      for (let x = 2 + shift; x <= 11 + shift; x++) {
        const border = y === 5 || y === 11 || x === 2 + shift || x === 11 + shift;
        set(x, y, border ? '#1e293b' : y <= 7 ? secondary : primary);
      }
    }
    set(5, 6, '#ffffff');
    set(6, 6, '#ffffff');
  }
  return px;
}

interface SearchablePaletteSelectProps {
  value: string;
  onChange: (id: string) => void;
  options: PaletteOption[];
  placeholder?: string;
}

function SearchablePaletteSelect({
  value,
  onChange,
  options,
  placeholder = 'Eşya veya blok ara...',
}: SearchablePaletteSelectProps) {
  const [query, setQuery] = useState('');
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options;
    return options.filter(
      (o) => o.name.toLowerCase().includes(q) || o.id.toLowerCase().includes(q),
    );
  }, [options, query]);
  const selected = useMemo(() => options.find((o) => o.id === value), [options, value]);

  return (
    <div className="space-y-1.5">
      <div className="relative">
        <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={placeholder}
          className="w-full pl-8 pr-2.5 py-1.5 rounded-lg bg-slate-950 border border-slate-700 text-[11px] text-white focus:outline-none focus:border-emerald-500"
        />
      </div>
      <div className="flex items-center gap-2">
        {selected && (
          <img
            src={selected.iconUrl}
            alt={selected.name}
            className="w-8 h-8 rounded-lg border border-slate-700 bg-slate-950 p-0.5 pixelated shrink-0"
          />
        )}
        <select
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="flex-1 px-3 py-2 rounded-lg bg-slate-950 border border-slate-700 text-xs text-white"
        >
          {filtered.length === 0 ? (
            <option value={value}>{selected?.name || value} (Eşleşme yok)</option>
          ) : (
            filtered.map((o) => (
              <option key={o.id} value={o.id}>
                {o.name}
              </option>
            ))
          )}
        </select>
      </div>
    </div>
  );
}

interface CraftingGrid3x3EditorProps {
  pattern: (string | null)[];
  onChange: (next: (string | null)[]) => void;
  paletteOptions: PaletteOption[];
  title?: string;
}

function CraftingGrid3x3Editor({
  pattern,
  onChange,
  paletteOptions,
  title = '3×3 Çalışma Masası Tarifi',
}: CraftingGrid3x3EditorProps) {
  const [brushId, setBrushId] = useState<string>(paletteOptions[0]?.id || 'oak_planks');
  const [search, setSearch] = useState('');
  const [eraseMode, setEraseMode] = useState(false);

  const optionMap = useMemo(() => {
    const m = new Map<string, PaletteOption>();
    paletteOptions.forEach((o) => m.set(o.id, o));
    return m;
  }, [paletteOptions]);

  const filteredPalette = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return paletteOptions.slice(0, 96);
    return paletteOptions
      .filter((o) => o.name.toLowerCase().includes(q) || o.id.toLowerCase().includes(q))
      .slice(0, 96);
  }, [paletteOptions, search]);

  const activeOption = optionMap.get(brushId);

  const handleCellClick = (idx: number) => {
    const next = [...pattern];
    if (eraseMode || next[idx] === brushId) {
      next[idx] = null;
    } else {
      next[idx] = brushId;
    }
    onChange(next);
  };

  return (
    <div className="p-4 rounded-xl bg-slate-900/90 border border-slate-800 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-xs font-bold text-emerald-400 flex items-center gap-1.5">
          <Grid3X3 className="w-4 h-4" /> {title}
        </span>
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => setEraseMode((v) => !v)}
            className={`flex items-center gap-1 px-2 py-1 rounded text-[11px] font-semibold cursor-pointer ${
              eraseMode
                ? 'bg-rose-600 text-white'
                : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
            }`}
          >
            <Eraser className="w-3 h-3" /> Silgi
          </button>
          <button
            type="button"
            onClick={() => onChange(Array(9).fill(brushId))}
            className="px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 text-[11px] text-slate-300 cursor-pointer"
          >
            9 Slotu Doldur
          </button>
          <button
            type="button"
            onClick={() => onChange(Array(9).fill(null))}
            className="px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 text-[11px] text-rose-300 cursor-pointer"
          >
            Temizle
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-12 gap-4 items-start">
        {/* 3x3 Interactive Grid */}
        <div className="md:col-span-5 flex flex-col items-center gap-2">
          <div className="grid grid-cols-3 gap-1.5 p-2.5 rounded-xl bg-slate-950 border border-slate-700">
            {pattern.map((cellId, idx) => {
              const opt = cellId ? optionMap.get(cellId) : null;
              return (
                <button
                  key={idx}
                  type="button"
                  onClick={() => handleCellClick(idx)}
                  onContextMenu={(e) => {
                    e.preventDefault();
                    const next = [...pattern];
                    next[idx] = null;
                    onChange(next);
                  }}
                  title={opt ? `${opt.name} (Kaldırmak için tekrar tıkla)` : 'Malzeme koymak için tıkla'}
                  className={`w-14 h-14 rounded-lg border flex items-center justify-center cursor-pointer transition-colors ${
                    cellId
                      ? 'bg-slate-900 border-emerald-500/60 hover:border-rose-400'
                      : 'bg-slate-900/60 border-slate-800 hover:border-emerald-500'
                  }`}
                >
                  {opt && (
                    <img
                      src={opt.iconUrl}
                      alt={opt.name}
                      className="w-9 h-9 pixelated"
                    />
                  )}
                </button>
              );
            })}
          </div>
          <div className="text-[11px] text-slate-400 text-center">
            {eraseMode ? (
              <span className="text-rose-300">Silgi aktif — silmek için slota tıkla</span>
            ) : activeOption ? (
              <span>
                Seçili Fırça:{' '}
                <strong className="text-emerald-300">{activeOption.name}</strong>
              </span>
            ) : null}
        </div>
        </div>

        {/* Ingredient Picker Palette */}
        <div className="md:col-span-7 space-y-2">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Malzeme ara (örn: elmas, odun, çubuk, mod eşyası)..."
            className="w-full px-3 py-1.5 rounded-lg bg-slate-950 border border-slate-700 text-xs text-white focus:outline-none focus:border-emerald-500"
          />
          <div className="grid grid-cols-6 sm:grid-cols-8 gap-1.5 max-h-40 overflow-y-auto p-1.5 rounded-xl bg-slate-950 border border-slate-800">
            {filteredPalette.map((item) => {
              const selected = !eraseMode && brushId === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => {
                    setBrushId(item.id);
                    setEraseMode(false);
                  }}
                  title={item.name}
                  className={`p-1.5 rounded-lg border flex flex-col items-center justify-center cursor-pointer transition-colors ${
                    selected
                      ? 'bg-emerald-600/25 border-emerald-400'
                      : item.isModLocal
                        ? 'bg-amber-950/30 border-amber-500/40 hover:border-amber-400'
                        : 'bg-slate-900 border-slate-800 hover:border-slate-600'
                  }`}
                >
                  <img src={item.iconUrl} alt={item.name} className="w-7 h-7 pixelated" />
                </button>
              );
            })}
          </div>
          <p className="text-[10px] text-slate-400">
            Sağdan malzemeyi seçip soldaki 3×3 çalışma masasına yerleştir. Tekrar tıklayınca veya sağ tıklayınca silinir.
          </p>
        </div>
      </div>
    </div>
  );
}

export function ModWorkshopModal({
  user,
  username,
  localMods,
  enabledModIds,
  onToggleMod,
  onSaveLocalMods,
  onClose,
}: ModWorkshopModalProps) {
  const [tab, setTab] = useState<'installed' | 'create' | 'community'>('create');
  const [createMode, setCreateMode] = useState<'choose' | 'lua' | 'visual'>('choose');
  const [editingLuaMod, setEditingLuaMod] = useState<ModDefinition | null>(null);
  const [expandedApiId, setExpandedApiId] = useState<string | null>(null);
  const [activeEditor, setActiveEditor] = useState<EditorKind | null>(null);
  const [showAddPicker, setShowAddPicker] = useState(false);

  const [communityMods, setCommunityMods] = useState<ModDefinition[]>([]);
  const [loadingComm, setLoadingComm] = useState(false);
  const [feedback, setFeedback] = useState('');

  // Mod Package Meta & Contents
  const [modName, setModName] = useState('Süper Evren Modu');
  const [modDesc, setModDesc] = useState(
    'Özel bloklar, eşyalar, 3×3 tarifler ve sohbet komutları içerir.',
  );
  const [modPublic, setModPublic] = useState(true);
  const [blocks, setBlocks] = useState<ModBlockSpec[]>([]);
  const [items, setItems] = useState<ModItemSpec[]>([]);
  const [tools, setTools] = useState<ModToolSpec[]>([]);
  const [recipes, setRecipes] = useState<ModRecipeSpec[]>([]);
  const [commands, setCommands] = useState<ModCommandSpec[]>([]);

  // --- BLOCK EDITOR STATE ---
  const [blkName, setBlkName] = useState('Yakut Cevheri');
  const [blkColor, setBlkColor] = useState('#7d838a');
  const [blkSecColor, setBlkSecColor] = useState('#e11d48');
  const [blkPattern, setBlkPattern] = useState<BlockPattern>('ore');
  const [blkFacePixels, setBlkFacePixels] = useState<Record<CubeFaceKey, string[]>>(() =>
    buildSixFacePixels('ore', '#7d838a', '#e11d48', 29),
  );
  const [activeFace, setActiveFace] = useState<CubeFaceKey>('front');
  const [syncFaces, setSyncFaces] = useState<CubeFaceKey[]>(['right', 'left', 'front', 'back']);
  const [paintColor, setPaintColor] = useState('#fb7185');
  const [paintTool, setPaintTool] = useState<'brush' | 'bucket' | 'replace' | 'eyedropper' | 'eraser'>('brush');
  const [isPainting, setIsPainting] = useState(false);
  const [blkHardness, setBlkHardness] = useState(2.8);
  const [blkResistance, setBlkResistance] = useState(24);
  const [blkMinTier, setBlkMinTier] = useState(2);
  const [blkPrefTool, setBlkPrefTool] = useState<ToolType>('pickaxe');
  const [blkGlow, setBlkGlow] = useState(false);
  const [blkLightLevel, setBlkLightLevel] = useState(14);
  const [blkTrans, setBlkTrans] = useState(false);
  const [blkNonSolid, setBlkNonSolid] = useState(false);
  const [blkOreSpawn, setBlkOreSpawn] = useState(true);
  const [blkSurfaceSpawn, setBlkSurfaceSpawn] = useState(false);
  const [blkBiomes, setBlkBiomes] = useState<BiomeType[]>([]);
  const [blkMinY, setBlkMinY] = useState(4);
  const [blkMaxY, setBlkMaxY] = useState(46);
  const [blkHasCraft, setBlkHasCraft] = useState(false);
  const [blkCraftPattern, setBlkCraftPattern] = useState<(string | null)[]>(Array(9).fill(null));
  const [blkOutCount, setBlkOutCount] = useState(2);

  // --- ITEM / FOOD EDITOR STATE ---
  const [itemName, setItemName] = useState('Kristal Elma');
  const [itemKind, setItemKind] = useState<'material' | 'food' | 'gem'>('food');
  const [itemColor, setItemColor] = useState('#f43f5e');
  const [itemSecColor, setItemSecColor] = useState('#fda4af');
  const [itemPixels, setItemPixels] = useState<string[]>(() =>
    buildPresetItemPixels('food', '#f43f5e', '#fda4af'),
  );
  const [itemPaintColor, setItemPaintColor] = useState('#fde047');
  const [itemPaintTool, setItemPaintTool] = useState<'brush' | 'bucket' | 'replace' | 'eyedropper' | 'eraser'>('brush');
  const [itemFoodValue, setItemFoodValue] = useState(8);
  const [itemStackSize, setItemStackSize] = useState(64);
  const [itemHasCraft, setItemHasCraft] = useState(true);
  const [itemCraftPattern, setItemCraftPattern] = useState<(string | null)[]>([
    null, 'gold_ingot', null,
    'gold_ingot', 'apple', 'gold_ingot',
    null, 'gold_ingot', null,
  ]);
  const [itemOutCount, setItemOutCount] = useState(1);

  // --- LIQUID + BUCKET EDITOR STATE ---
  const [liqName, setLiqName] = useState('Zehirli Asit');
  const [liqBucketName, setLiqBucketName] = useState('Asit Kovası');
  const [liqColor, setLiqColor] = useState('#84cc16');
  const [liqSecColor, setLiqSecColor] = useState('#3f6212');
  const [liqPattern, setLiqPattern] = useState<BlockPattern>('water');
  const [liqPixels, setLiqPixels] = useState<string[]>(() =>
    generatePresetPatternPixels('water', '#84cc16', '#3f6212', 'top', 77),
  );
  const [liqPaintColor, setLiqPaintColor] = useState('#bef264');
  const [liqPaintTool, setLiqPaintTool] = useState<'brush' | 'bucket' | 'replace' | 'eyedropper' | 'eraser'>('brush');
  const [liqTransparent, setLiqTransparent] = useState(true);
  const [liqGlow, setLiqGlow] = useState(true);
  const [liqLightLevel, setLiqLightLevel] = useState(12);
  const [liqHarmful, setLiqHarmful] = useState(false);
  const [liqSpread, setLiqSpread] = useState(5);
  const [liqSpeed, setLiqSpeed] = useState<'fast' | 'medium' | 'slow'>('fast');
  const [liqHasCraft, setLiqHasCraft] = useState(true);
  const [liqCraftPattern, setLiqCraftPattern] = useState<(string | null)[]>([
    null, 'emerald', null,
    'emerald', 'water_bucket', 'emerald',
    null, 'bucket', null,
  ]);
  const [liqOutCount, setLiqOutCount] = useState(1);

  // --- TOOL EDITOR STATE ---
  const [toolName, setToolName] = useState('Plazma Kazma');
  const [toolColor, setToolColor] = useState('#06b6d4');
  const [toolType, setToolType] = useState<ToolType>('pickaxe');
  const [toolSpeed, setToolSpeed] = useState(14);
  const [toolTier, setToolTier] = useState(4);
  const [toolDurability, setToolDurability] = useState(1250);
  const [toolCraftPattern, setToolCraftPattern] = useState<(string | null)[]>([
    'diamond', 'diamond', 'diamond',
    null, 'stick', null,
    null, 'stick', null,
  ]);

  // --- STANDALONE 3x3 RECIPE EDITOR STATE ---
  const [recName, setRecName] = useState('Özel Zanaat Tarifi');
  const [recPattern, setRecPattern] = useState<(string | null)[]>(Array(9).fill(null));
  const [recOutputId, setRecOutputId] = useState('diamond');
  const [recOutputCount, setRecOutputCount] = useState(1);

  // --- FURNACE RECIPE EDITOR STATE ---
  const [furName, setFurName] = useState('Ocakta Eritme Tarifi');
  const [furInputId, setFurInputId] = useState('iron_ore');
  const [furInputCount, setFurInputCount] = useState(1);
  const [furOutputId, setFurOutputId] = useState('iron_ingot');
  const [furOutputCount, setFurOutputCount] = useState(2);

  // --- COMMAND EDITOR STATE ---
  const [cmdTrigger, setCmdTrigger] = useState('baslangic');
  const [cmdDesc, setCmdDesc] = useState('Oyuncuya başlangıç eşyası verir');
  const [cmdAction, setCmdAction] = useState<ModCommandAction>('give_item');
  const [cmdItemId, setCmdItemId] = useState('diamond_pickaxe');
  const [cmdItemCount, setCmdItemCount] = useState(1);
  const [cmdGameMode, setCmdGameMode] = useState<GameMode>('creative');
  const [cmdTimeVal, setCmdTimeVal] = useState(4000);
  const [cmdHealAmt, setCmdHealAmt] = useState(20);
  const [cmdTeleportY, setCmdTeleportY] = useState(30);
  const [cmdMsgText, setCmdMsgText] = useState('Mod komutu çalıştırıldı!');

  // Unified palette options: vanilla items + everything created in this mod package so far!
  const allPaletteOptions: PaletteOption[] = useMemo(() => {
    const list: PaletteOption[] = [];
    blocks.forEach((b) => {
      if (b.isLiquid) return;
      list.push({
        id: b.id,
        name: `${b.name} (Mod Blok)`,
        iconUrl: b.customTexture
          ? pixelsToDataUrl(b.customTexture.split(','), b.color)
          : getItemIconUrl(b.id),
        isModLocal: true,
      });
    });
    items.forEach((it) => {
      list.push({
        id: it.id,
        name: `${it.name} (${it.itemKind === 'bucket' ? 'Mod Kova' : 'Mod Eşya'})`,
        iconUrl: it.customTexture && it.itemKind !== 'bucket'
          ? pixelsToDataUrl(it.customTexture.split(','), it.color)
          : getItemIconUrl(it.id),
        isModLocal: true,
      });
    });
    tools.forEach((t) => {
      list.push({
        id: t.id,
        name: `${t.name} (Mod Alet)`,
        iconUrl: getItemIconUrl(t.id),
        isModLocal: true,
      });
    });
    getAllItems().forEach((it) => {
      if (it.id === 'bedrock' || it.hiddenInInventory || it.liquid) return;
      if (list.some((x) => x.id === it.id)) return;
      list.push({
        id: it.id,
        name: it.name,
        iconUrl: getItemIconUrl(it.id),
      });
    });
    return list;
  }, [blocks, items, tools]);

  const optionById = useMemo(() => {
    const m = new Map<string, PaletteOption>();
    allPaletteOptions.forEach((o) => m.set(o.id, o));
    return m;
  }, [allPaletteOptions]);

  const loadCommunity = async () => {
    if (!user) return;
    setLoadingComm(true);
    try {
      const list = await fetchCommunityMods(user.uid);
      setCommunityMods(list);
    } catch {
      setFeedback('Topluluk modları yüklenemedi.');
    } finally {
      setLoadingComm(false);
    }
  };

  useEffect(() => {
    if (tab === 'community' && user) {
      loadCommunity();
    }
  }, [tab, user]);

  useEffect(() => {
    const stop = () => setIsPainting(false);
    window.addEventListener('mouseup', stop);
    return () => window.removeEventListener('mouseup', stop);
  }, []);

  // Open specific editor from "+ Ekle" picker
  const openEditor = (kind: EditorKind) => {
    setShowAddPicker(false);
    setActiveEditor(kind);
    if (kind === 'recipe') {
      const preferred = blocks[0]?.id || items[0]?.id || tools[0]?.id || 'diamond';
      setRecOutputId(preferred);
    } else if (kind === 'command') {
      const preferred = blocks[0]?.id || items[0]?.id || tools[0]?.id || 'diamond_pickaxe';
      setCmdItemId(preferred);
    }
  };

  // --- BLOCK PAINTER HELPERS ---
  const regeneratePatternPixels = (
    pat = blkPattern,
    pri = blkColor,
    sec = blkSecColor,
  ) => {
    const seed = Math.floor(Math.random() * 500 + 1);
    setBlkFacePixels(buildSixFacePixels(pat, pri, sec, seed));
  };

  const getTargetFaces = (): CubeFaceKey[] => {
    if (syncFaces.includes(activeFace)) {
      return syncFaces;
    }
    return [activeFace];
  };

  const writePixelsToTargets = (nextFaceArr: string[]) => {
    const targets = getTargetFaces();
    setBlkFacePixels((prev) => {
      const copy = { ...prev };
      targets.forEach((f) => {
        copy[f] = [...nextFaceArr];
      });
      return copy;
    });
  };

  const applyBlockPaintAt = (idx: number) => {
    const curPixels = blkFacePixels[activeFace];
    if (paintTool === 'eyedropper') {
      const picked = curPixels[idx];
      if (picked && picked !== 'transparent' && picked !== 'rgba_glass') {
        setPaintColor(picked);
        setPaintTool('brush');
      }
      return;
    }
    if (paintTool === 'replace') {
      const target = curPixels[idx];
      if (!target) return;
      const targetNorm = target.toLowerCase();
      if (targetNorm === paintColor.toLowerCase()) return;
      let count = 0;
      const next = curPixels.map((px) => {
        if (px.toLowerCase() === targetNorm) {
          count++;
          return paintColor;
        }
        return px;
      });
      if (count > 0) {
        writePixelsToTargets(next);
        setFeedback(`Blok yüzündeki aynı renkte ${count} piksel seçili renkle değiştirildi!`);
      }
      return;
    }
    if (paintTool === 'bucket') {
      const targetColor = curPixels[idx];
      if (targetColor === paintColor) return;
      const next = [...curPixels];
      const stack = [idx];
      const visited = new Set<number>();
      while (stack.length > 0) {
        const cur = stack.pop()!;
        if (visited.has(cur) || next[cur] !== targetColor) continue;
        visited.add(cur);
        next[cur] = paintColor;
        const x = cur % 16;
        const y = Math.floor(cur / 16);
        if (x > 0) stack.push(cur - 1);
        if (x < 15) stack.push(cur + 1);
        if (y > 0) stack.push(cur - 16);
        if (y < 15) stack.push(cur + 16);
      }
      writePixelsToTargets(next);
      return;
    }
    const next = [...curPixels];
    const supportsTransparency =
      blkTrans ||
      blkPattern === 'foliage_cross' ||
      blkPattern === 'bamboo' ||
      blkPattern === 'lantern' ||
      blkPattern === 'leaves';
    next[idx] = paintTool === 'eraser' ? (supportsTransparency ? 'transparent' : blkColor) : paintColor;
    writePixelsToTargets(next);
  };

  // --- ITEM PAINTER HELPERS ---
  const applyItemPaintAt = (idx: number) => {
    if (itemPaintTool === 'eyedropper') {
      const picked = itemPixels[idx];
      if (picked && picked !== 'transparent') {
        setItemPaintColor(picked);
        setItemPaintTool('brush');
      }
      return;
    }
    if (itemPaintTool === 'replace') {
      const target = itemPixels[idx];
      if (!target) return;
      const targetNorm = target.toLowerCase();
      if (targetNorm === itemPaintColor.toLowerCase()) return;
      let count = 0;
      const next = itemPixels.map((px) => {
        if (px.toLowerCase() === targetNorm) {
          count++;
          return itemPaintColor;
        }
        return px;
      });
      if (count > 0) {
        setItemPixels(next);
        setFeedback(`Eşya dokusundaki aynı renkte ${count} piksel seçili renkle değiştirildi!`);
      }
      return;
    }
    if (itemPaintTool === 'bucket') {
      const targetColor = itemPixels[idx];
      if (targetColor === itemPaintColor) return;
      const next = [...itemPixels];
      const stack = [idx];
      const visited = new Set<number>();
      while (stack.length > 0) {
        const cur = stack.pop()!;
        if (visited.has(cur) || next[cur] !== targetColor) continue;
        visited.add(cur);
        next[cur] = itemPaintColor;
        const x = cur % 16;
        const y = Math.floor(cur / 16);
        if (x > 0) stack.push(cur - 1);
        if (x < 15) stack.push(cur + 1);
        if (y > 0) stack.push(cur - 16);
        if (y < 15) stack.push(cur + 16);
      }
      setItemPixels(next);
      return;
    }
    const next = [...itemPixels];
    next[idx] = itemPaintTool === 'eraser' ? 'transparent' : itemPaintColor;
    setItemPixels(next);
  };

  // --- LIQUID PAINTER HELPERS ---
  const regenerateLiquidPixels = (
    pat = liqPattern,
    pri = liqColor,
    sec = liqSecColor,
  ) => {
    const seed = Math.floor(Math.random() * 500 + 1);
    setLiqPixels(generatePresetPatternPixels(pat, pri, sec, 'top', seed));
  };

  const applyLiqPaintAt = (idx: number) => {
    if (liqPaintTool === 'eyedropper') {
      const picked = liqPixels[idx];
      if (picked && picked !== 'transparent') {
        setLiqPaintColor(picked);
        setLiqPaintTool('brush');
      }
      return;
    }
    if (liqPaintTool === 'replace') {
      const target = liqPixels[idx];
      if (!target) return;
      const targetNorm = target.toLowerCase();
      if (targetNorm === liqPaintColor.toLowerCase()) return;
      let count = 0;
      const next = liqPixels.map((px) => {
        if (px.toLowerCase() === targetNorm) {
          count++;
          return liqPaintColor;
        }
        return px;
      });
      if (count > 0) {
        setLiqPixels(next);
        setFeedback(`Sıvı dokusundaki ${count} piksel seçili renkle değiştirildi!`);
      }
      return;
    }
    if (liqPaintTool === 'bucket') {
      const targetColor = liqPixels[idx];
      if (targetColor === liqPaintColor) return;
      const next = [...liqPixels];
      const stack = [idx];
      const visited = new Set<number>();
      while (stack.length > 0) {
        const cur = stack.pop()!;
        if (visited.has(cur) || next[cur] !== targetColor) continue;
        visited.add(cur);
        next[cur] = liqPaintColor;
        const x = cur % 16;
        const y = Math.floor(cur / 16);
        if (x > 0) stack.push(cur - 1);
        if (x < 15) stack.push(cur + 1);
        if (y > 0) stack.push(cur - 16);
        if (y < 15) stack.push(cur + 16);
      }
      setLiqPixels(next);
      return;
    }
    const next = [...liqPixels];
    next[idx] = liqPaintTool === 'eraser' ? liqColor : liqPaintColor;
    setLiqPixels(next);
  };

  const handleUploadPng16 = (
    e: React.ChangeEvent<HTMLInputElement>,
    onPixels: (arr: string[]) => void,
  ) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = 16;
        canvas.height = 16;
        const ctx = canvas.getContext('2d')!;
        ctx.imageSmoothingEnabled = false;
        ctx.drawImage(img, 0, 0, 16, 16);
        const data = ctx.getImageData(0, 0, 16, 16).data;
        const arr: string[] = [];
        for (let i = 0; i < 256; i++) {
          const r = data[i * 4];
          const g = data[i * 4 + 1];
          const b = data[i * 4 + 2];
          const a = data[i * 4 + 3];
          if (a < 32) {
            arr.push('transparent');
          } else {
            arr.push('#' + [r, g, b].map((v) => v.toString(16).padStart(2, '0')).join(''));
          }
        }
        onPixels(arr);
      };
      img.src = String(reader.result);
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  // --- ADD HANDLERS (ALL CLOSE activeEditor ON SUCCESS!) ---
  const handleAddBlock = () => {
    if (!blkName.trim()) {
      setFeedback('Lütfen özel bloğun için bir ad yaz.');
      return;
    }
    const slug = blkName
      .toLowerCase()
      .replace(/[^a-z0-9]/g, '_')
      .replace(/_+/g, '_')
      .slice(0, 18);
    const id = `mblk_${slug}_${Math.floor(Math.random() * 900 + 100)}`;

    const frontStr = blkFacePixels.front.join(',');
    const faceTextures: Partial<Record<CubeFaceKey, string>> = {};
    ALL_CUBE_FACES.forEach((f) => {
      const s = blkFacePixels[f].join(',');
      if (s !== frontStr) {
        faceTextures[f] = s;
      }
    });

    const hasPat = blkHasCraft && blkCraftPattern.some(Boolean);
    const firstIng = blkCraftPattern.find(Boolean) || '';
    const firstCount = firstIng ? blkCraftPattern.filter((x) => x === firstIng).length : 0;

    setBlocks((prev) => [
      ...prev,
      {
        id,
        name: blkName.trim().slice(0, 32),
        color: blkColor,
        secondaryColor: blkSecColor,
        pattern: blkPattern,
        customTexture: frontStr,
        ...(Object.keys(faceTextures).length > 0 ? { faceTextures } : {}),
        hardness: blkHardness,
        blastResistance: blkResistance,
        minToolTier: blkMinTier,
        preferredTool: blkPrefTool,
        transparent: blkTrans,
        nonSolid: blkNonSolid,
        glow: blkGlow,
        lightLevel: blkGlow ? blkLightLevel : 0,
        spawnAsOre: blkOreSpawn,
        spawnOnSurface: blkSurfaceSpawn,
        ...(blkBiomes.length > 0 ? { spawnBiomes: [...blkBiomes] } : {}),
        minSpawnY: Math.min(blkMinY, blkMaxY),
        maxSpawnY: Math.max(blkMinY, blkMaxY),
        craftIngredientId: firstIng,
        craftIngredientCount: firstCount,
        craftOutputCount: blkOutCount,
        ...(hasPat ? { craftPattern: [...blkCraftPattern] } : {}),
      },
    ]);
    setFeedback(`"${blkName.trim()}" bloğu mod paketine eklendi! Başka içerik için + Ekle'ye basabilirsin.`);
    setBlkName('');
    setBlkCraftPattern(Array(9).fill(null));
    setActiveEditor(null);
  };

  const handleAddItem = () => {
    if (!itemName.trim()) {
      setFeedback('Lütfen özel eşya için bir ad yaz.');
      return;
    }
    const slug = itemName
      .toLowerCase()
      .replace(/[^a-z0-9]/g, '_')
      .replace(/_+/g, '_')
      .slice(0, 18);
    const id = `mitm_${slug}_${Math.floor(Math.random() * 900 + 100)}`;
    const hasPat = itemHasCraft && itemCraftPattern.some(Boolean);

    setItems((prev) => [
      ...prev,
      {
        id,
        name: itemName.trim().slice(0, 32),
        itemKind,
        color: itemColor,
        secondaryColor: itemSecColor,
        customTexture: itemPixels.join(','),
        ...(itemKind === 'food' ? { foodValue: itemFoodValue } : {}),
        stackSize: itemStackSize,
        ...(hasPat ? { craftPattern: [...itemCraftPattern], craftOutputCount: itemOutCount } : {}),
      },
    ]);
    setFeedback(`"${itemName.trim()}" eşyası mod paketine eklendi!`);
    setItemName('');
    setActiveEditor(null);
  };

  const handleAddLiquid = () => {
    const cleanName = liqName.trim();
    if (!cleanName) {
      setFeedback('Lütfen özel sıvın için bir ad yaz.');
      return;
    }
    const slug = cleanName
      .toLowerCase()
      .replace(/[^a-z0-9]/g, '_')
      .replace(/_+/g, '_')
      .slice(0, 18);
    const suffix = Math.floor(Math.random() * 900 + 100);
    const liquidId = `mliq_${slug}_${suffix}`;
    const bucketId = `mbkt_${slug}_${suffix}`;
    const finalBucketName = (liqBucketName.trim() || `${cleanName} Kovası`).slice(0, 32);
    const texCsv = liqPixels.join(',');
    const flowDelayMs = liqSpeed === 'slow' ? 500 : liqSpeed === 'medium' ? 280 : 170;
    const hasPat = liqHasCraft && liqCraftPattern.some(Boolean);

    setBlocks((prev) => [
      ...prev,
      {
        id: liquidId,
        name: cleanName.slice(0, 32),
        color: liqColor,
        secondaryColor: liqSecColor,
        pattern: liqPattern,
        customTexture: texCsv,
        hardness: -1,
        blastResistance: 100,
        minToolTier: 0,
        preferredTool: 'none',
        transparent: liqTransparent,
        nonSolid: false,
        isLiquid: true,
        liquidSpread: liqSpread,
        liquidFlowDelayMs: flowDelayMs,
        liquidHarmful: liqHarmful,
        bucketItemId: bucketId,
        glow: liqGlow,
        lightLevel: liqGlow ? liqLightLevel : 0,
        spawnAsOre: false,
        spawnOnSurface: false,
        craftIngredientId: '',
        craftIngredientCount: 0,
        craftOutputCount: 1,
      },
    ]);

    setItems((prev) => [
      ...prev,
      {
        id: bucketId,
        name: finalBucketName,
        itemKind: 'bucket',
        color: liqColor,
        secondaryColor: liqSecColor,
        liquidSecondaryColor: liqSecColor,
        placesLiquidId: liquidId,
        customTexture: texCsv,
        stackSize: 1,
        ...(hasPat ? { craftPattern: [...liqCraftPattern], craftOutputCount: liqOutCount } : {}),
      },
    ]);

    setFeedback(`"${cleanName}" akışkan sıvısı ve "${finalBucketName}" kovası mod paketine eklendi!`);
    setActiveEditor(null);
  };

  const handleAddTool = () => {
    if (!toolName.trim()) {
      setFeedback('Lütfen alet için bir ad yaz.');
      return;
    }
    const slug = toolName
      .toLowerCase()
      .replace(/[^a-z0-9]/g, '_')
      .replace(/_+/g, '_')
      .slice(0, 18);
    const id = `mtool_${slug}_${Math.floor(Math.random() * 900 + 100)}`;
    const hasPat = toolCraftPattern.some(Boolean);
    const firstIng = toolCraftPattern.find((x) => x && x !== 'stick') || 'diamond';
    const firstCount = toolCraftPattern.filter((x) => x === firstIng).length || 3;

    setTools((prev) => [
      ...prev,
      {
        id,
        name: toolName.trim().slice(0, 32),
        color: toolColor,
        toolType,
        miningSpeed: toolSpeed,
        toolTier,
        durability: toolDurability,
        craftIngredientId: firstIng,
        craftIngredientCount: firstCount,
        ...(hasPat ? { craftPattern: [...toolCraftPattern] } : {}),
      },
    ]);
    setFeedback(`"${toolName.trim()}" aleti mod paketine eklendi!`);
    setToolName('');
    setActiveEditor(null);
  };

  const handleAddCraftingRecipe = () => {
    if (!recPattern.some(Boolean)) {
      setFeedback('Lütfen 3×3 çalışma masası ızgarasına en az 1 malzeme yerleştir.');
      return;
    }
    const outOpt = optionById.get(recOutputId);
    const finalName = recName.trim() || outOpt?.name || 'Özel Tarif';
    const ings = patternToIngredients(recPattern);
    const id = `mrec_${Date.now()}_${Math.floor(Math.random() * 900 + 100)}`;
    setRecipes((prev) => [
      ...prev,
      {
        id,
        name: finalName.slice(0, 40),
        pattern: [...recPattern],
        ingredients: ings,
        outputId: recOutputId,
        outputCount: Math.max(1, Math.min(64, recOutputCount)),
        requiresFurnace: false,
      },
    ]);
    setFeedback(`3×3 tarif "${finalName}" mod paketine eklendi!`);
    setRecPattern(Array(9).fill(null));
    setActiveEditor(null);
  };

  const handleAddFurnaceRecipe = () => {
    const outOpt = optionById.get(furOutputId);
    const finalName = furName.trim() || `${outOpt?.name || furOutputId} (Eritme)`;
    const id = `mfur_${Date.now()}_${Math.floor(Math.random() * 900 + 100)}`;
    setRecipes((prev) => [
      ...prev,
      {
        id,
        name: finalName.slice(0, 40),
        ingredientA: furInputId,
        countA: Math.max(1, Math.min(16, furInputCount)),
        outputId: furOutputId,
        outputCount: Math.max(1, Math.min(64, furOutputCount)),
        requiresFurnace: true,
      },
    ]);
    setFeedback(`Ocak tarifi "${finalName}" mod paketine eklendi!`);
    setActiveEditor(null);
  };

  const handleAddCommand = () => {
    const clean = cmdTrigger.trim().replace(/^\/+/, '').toLowerCase().replace(/[^a-z0-9_]/g, '');
    if (!clean) {
      setFeedback('Lütfen geçerli bir komut adı yaz (harf/rakam, örn: baslangic).');
      return;
    }
    const id = `mcmd_${clean}_${Math.floor(Math.random() * 900 + 100)}`;
    setCommands((prev) => [
      ...prev,
      {
        id,
        command: clean.slice(0, 24),
        description: cmdDesc.trim().slice(0, 80) || `/${clean} komutu`,
        actionType: cmdAction,
        itemId: cmdAction === 'give_item' ? cmdItemId : undefined,
        itemCount: cmdAction === 'give_item' ? cmdItemCount : undefined,
        gameMode: cmdAction === 'gamemode' ? cmdGameMode : undefined,
        timeValue: cmdAction === 'time' ? cmdTimeVal : undefined,
        healAmount: cmdAction === 'heal' ? cmdHealAmt : undefined,
        teleportY: cmdAction === 'teleport_up' ? cmdTeleportY : undefined,
        messageText: cmdAction === 'broadcast' ? cmdMsgText.trim().slice(0, 120) : undefined,
      },
    ]);
    setFeedback(`"/${clean}" özel komutu mod paketine eklendi!`);
    setCmdTrigger('');
    setActiveEditor(null);
  };

  const totalEntriesCount =
    blocks.length + items.length + tools.length + recipes.length + commands.length;

  const handleSaveMod = async (publish: boolean) => {
    if (!modName.trim() || totalEntriesCount === 0) {
      setFeedback('Lütfen mod adı girin ve + Ekle butonuyla en az 1 içerik ekleyin.');
      return;
    }
    const modId = `mod_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const newMod: ModDefinition = {
      id: modId,
      name: modName.trim().slice(0, 64),
      description: modDesc.trim().slice(0, 300),
      version: '1.0.0',
      authorId: user?.uid || 'local',
      authorName: username || user?.displayName || 'Yerel Yapımcı',
      isPublic: publish && modPublic,
      likes: 0,
      blocks,
      items,
      tools,
      recipes,
      commands,
    };

    if (publish) {
      if (!user) {
        setFeedback('Toplulukla paylaşmak için Google hesabınla giriş yapmalısın.');
        return;
      }
      await publishModToCloud(user, newMod, username);
      setFeedback('Modun buluta yüklendi ve toplulukla paylaşıldı!');
    } else {
      setFeedback('Modun oluşturuldu ve anında aktif edildi!');
    }

    onSaveLocalMods([newMod, ...localMods]);
    if (!enabledModIds.includes(newMod.id)) {
      onToggleMod(newMod.id);
    }
    setTab('installed');
  };

  const handleInstallCommunityMod = (mod: ModDefinition) => {
    const exists = localMods.some((m) => m.id === mod.id);
    if (!exists) {
      onSaveLocalMods([mod, ...localMods]);
    }
    if (!enabledModIds.includes(mod.id)) {
      onToggleMod(mod.id);
    }
    setFeedback(`"${mod.name}" indirildi ve etkinleştirildi!`);
  };

  const handleImportJson = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(String(reader.result)) as ModDefinition;
        if (!parsed.name || !Array.isArray(parsed.blocks)) {
          setFeedback('Geçersiz mod JSON dosyası.');
          return;
        }
        const imported: ModDefinition = {
          ...parsed,
          id: parsed.id || `mod_imp_${Date.now()}`,
        };
        onSaveLocalMods([imported, ...localMods.filter((m) => m.id !== imported.id)]);
        if (!enabledModIds.includes(imported.id)) {
          onToggleMod(imported.id);
        }
        setFeedback(`"${imported.name}" başarıyla içe aktarıldı!`);
      } catch {
        setFeedback('JSON okunamadı.');
      }
    };
    reader.readAsText(file);
  };

  const exportModJson = (mod: ModDefinition) => {
    const blob = new Blob([JSON.stringify(mod, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${mod.name.replace(/\s+/g, '_').toLowerCase()}.blokmod.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/90 p-2 sm:p-4">
      <div className="w-[96vw] max-w-[1440px] h-[94vh] bg-slate-900 border border-slate-700/80 rounded-2xl shadow-2xl flex flex-col overflow-hidden">
        {/* Top Header */}
        <div className="flex flex-wrap items-center justify-between gap-4 px-6 py-3.5 border-b border-slate-800 bg-slate-950/50">
          <div className="flex items-center gap-4">
            <div className="w-10 h-10 rounded-xl bg-amber-500/15 border border-amber-500/40 flex items-center justify-center">
              <Hammer className="w-5 h-5 text-amber-400" />
            </div>
            <div>
              <h2 className="font-display text-lg sm:text-xl font-bold text-white">
                BlokEvren Mod Stüdyosu
              </h2>
              <p className="text-xs text-slate-400">
                + Ekle ile blok, eşya, alet, 3×3 craft tarifi, ocak tarifi ve /komut oluştur · Toplulukla paylaş
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                setTab('create');
                setEditingLuaMod(null);
                setCreateMode('choose');
              }}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold cursor-pointer ${
                tab === 'create'
                  ? 'bg-amber-600 text-white shadow-lg shadow-amber-900/30'
                  : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
              }`}
            >
              <Hammer className="w-4 h-4" /> Mod Oluştur
            </button>
            <button
              onClick={() => setTab('installed')}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold cursor-pointer ${
                tab === 'installed'
                  ? 'bg-emerald-600 text-white shadow-lg shadow-emerald-900/30'
                  : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
              }`}
            >
              <PackagePlus className="w-4 h-4" /> Yüklü Modlar ({localMods.length})
            </button>
            <button
              onClick={() => setTab('community')}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold cursor-pointer ${
                tab === 'community'
                  ? 'bg-sky-600 text-white shadow-lg shadow-sky-900/30'
                  : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
              }`}
            >
              <Globe className="w-4 h-4" /> Topluluk Modları
            </button>
            <button
              onClick={onClose}
              className="ml-2 p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Feedback Banner */}
        {feedback && (
          <div className="mx-6 mt-3 px-4 py-2 rounded-xl bg-emerald-500/15 border border-emerald-500/40 text-xs text-emerald-300 flex items-center justify-between">
            <span>{feedback}</span>
            <button onClick={() => setFeedback('')} className="text-emerald-200 hover:text-white cursor-pointer">
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* Main Workspace */}
        <div className="flex-1 overflow-y-auto p-5 sm:p-6">
          {tab === 'create' && createMode === 'choose' && (
            <div className="h-full flex flex-col items-center justify-center py-8 px-4">
              <div className="text-center max-w-xl mb-8">
                <h3 className="font-display text-2xl font-bold text-white mb-2">
                  Modunu Nasıl Oluşturmak İstersin?
                </h3>
                <p className="text-xs sm:text-sm text-slate-400">
                  İster <strong className="text-violet-300">CottonLua</strong> ile silahlar, özel fonksiyonlar, 3D modeller ve PNG dokular kodla; istersen{' '}
                  <strong className="text-amber-300">Ekranda Mod Yap</strong> ile görsel olarak hızlıca tasarla.
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 w-full max-w-4xl">
                <button
                  onClick={() => {
                    setEditingLuaMod(null);
                    setCreateMode('lua');
                  }}
                  className="group p-7 rounded-3xl bg-gradient-to-br from-violet-950/70 via-slate-950 to-slate-900 border-2 border-violet-500/40 hover:border-violet-400 text-left transition-all shadow-xl hover:shadow-violet-900/30 cursor-pointer flex flex-col gap-4"
                >
                  <div className="flex items-center justify-between">
                    <div className="w-14 h-14 rounded-2xl bg-violet-500/20 border border-violet-400/40 flex items-center justify-center">
                      <Code2 className="w-7 h-7 text-violet-300" />
                    </div>
                    <span className="px-3 py-1 rounded-full bg-violet-500/20 border border-violet-400/40 text-[11px] font-bold text-violet-200">
                      KENDİ DİLİMİZ · LUA TABANLI
                    </span>
                  </div>
                  <div>
                    <h4 className="font-display text-xl font-bold text-white mb-1.5 group-hover:text-violet-300 transition-colors">
                      CottonLua (Kodlayarak Yap)
                    </h4>
                    <p className="text-xs text-slate-300 leading-relaxed">
                      <code className="text-violet-300">Addthing&#123;&#125;</code>, özel silahlar &amp; mermiler, bağıl koordinatla yapı inşa fonksiyonları, 3D Model Yapıcı, PNG Texture Yapıcı, JSON indirme ve Yayınlanmış ID bağımlılık sistemi!
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-1.5 pt-2">
                    <span className="text-[10px] px-2 py-0.5 rounded bg-slate-900 border border-slate-700 text-sky-300">3D Model Yapıcı</span>
                    <span className="text-[10px] px-2 py-0.5 rounded bg-slate-900 border border-slate-700 text-emerald-300">PNG Texture</span>
                    <span className="text-[10px] px-2 py-0.5 rounded bg-slate-900 border border-slate-700 text-rose-300">Silah &amp; Büyü</span>
                    <span className="text-[10px] px-2 py-0.5 rounded bg-slate-900 border border-slate-700 text-amber-300">API Sistemi</span>
                  </div>
                </button>

                <button
                  onClick={() => setCreateMode('visual')}
                  className="group p-7 rounded-3xl bg-gradient-to-br from-amber-950/50 via-slate-950 to-slate-900 border-2 border-amber-500/40 hover:border-amber-400 text-left transition-all shadow-xl hover:shadow-amber-900/30 cursor-pointer flex flex-col gap-4"
                >
                  <div className="flex items-center justify-between">
                    <div className="w-14 h-14 rounded-2xl bg-amber-500/20 border border-amber-400/40 flex items-center justify-center">
                      <Hammer className="w-7 h-7 text-amber-300" />
                    </div>
                    <span className="px-3 py-1 rounded-full bg-amber-500/20 border border-amber-400/40 text-[11px] font-bold text-amber-200">
                      KODSUZ · GÖRSEL STÜDYO
                    </span>
                  </div>
                  <div>
                    <h4 className="font-display text-xl font-bold text-white mb-1.5 group-hover:text-amber-300 transition-colors">
                      Ekranda Mod Yap
                    </h4>
                    <p className="text-xs text-slate-300 leading-relaxed">
                      + Ekle menüsü ile 6 yüzlü 16×16 piksel blok, eşya/yiyecek, kazma/kılıç, 3×3 çalışma masası tarifi, ocak eritme ve özel sohbet komutlarını görsel editörle oluştur.
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-1.5 pt-2">
                    <span className="text-[10px] px-2 py-0.5 rounded bg-slate-900 border border-slate-700 text-amber-300">6 Yüz Piksel</span>
                    <span className="text-[10px] px-2 py-0.5 rounded bg-slate-900 border border-slate-700 text-emerald-300">3×3 Tarif</span>
                    <span className="text-[10px] px-2 py-0.5 rounded bg-slate-900 border border-slate-700 text-violet-300">/Komut Ekle</span>
                  </div>
                </button>
              </div>
            </div>
          )}

          {tab === 'create' && createMode === 'lua' && (
            <CottonLuaEditorModal
              user={user}
              username={username}
              availableMods={localMods}
              editingMod={editingLuaMod}
              onBackToChoice={() => {
                setEditingLuaMod(null);
                setCreateMode('choose');
              }}
              onSaveMod={async (newMod, publish) => {
                if (publish && user) {
                  await publishModToCloud(user, { ...newMod, isPublic: true }, username);
                }
                onSaveLocalMods([newMod, ...localMods.filter((m) => m.id !== newMod.id)]);
                if (!enabledModIds.includes(newMod.id)) {
                  onToggleMod(newMod.id);
                }
                setFeedback(
                  publish
                    ? `"${newMod.name}" buluta yüklendi! Yayınlanan ID: ${newMod.id}`
                    : `"${newMod.name}" kaydedildi ve aktifleştirildi!`,
                );
              }}
            />
          )}

          {tab === 'create' && createMode === 'visual' && (
            <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 h-full">
              {/* LEFT SIDEBAR: Mod Package Info & Save (3 cols) */}
              <div className="xl:col-span-3 flex flex-col gap-4">
                <button
                  onClick={() => setCreateMode('choose')}
                  className="flex items-center justify-center gap-1.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-slate-200 cursor-pointer"
                >
                  <ArrowLeft className="w-3.5 h-3.5" /> Mod Türü Seçimine Dön
                </button>
                <div className="p-4 rounded-2xl bg-slate-950/90 border border-slate-800 space-y-3">
                  <div className="text-xs font-bold tracking-wider text-amber-400">
                    MOD PAKETİ BİLGİLERİ
                  </div>
                  <div>
                    <label className="block text-xs text-slate-400 mb-1">Mod Adı</label>
                    <input
                      type="text"
                      value={modName}
                      onChange={(e) => setModName(e.target.value)}
                      className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-sm text-white"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-slate-400 mb-1">Açıklama</label>
                    <textarea
                      rows={3}
                      value={modDesc}
                      onChange={(e) => setModDesc(e.target.value)}
                      className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-xs text-white"
                    />
                  </div>
                  <label className="flex items-center gap-2 text-xs text-slate-300 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={modPublic}
                      onChange={(e) => setModPublic(e.target.checked)}
                    />
                    Toplulukta herkese açık yayınla
                  </label>
                </div>

                {/* Summary counters & Save buttons */}
                <div className="p-4 rounded-2xl bg-slate-950/90 border border-slate-800 space-y-3">
                  <div className="text-xs font-bold tracking-wider text-slate-200">
                    PAKET ÖZETİ ({totalEntriesCount} Öğe)
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div className="px-2.5 py-2 rounded-lg bg-slate-900 border border-slate-800 text-slate-300 flex justify-between">
                      <span>Bloklar</span>
                      <span className="font-mono-num text-amber-300 font-bold">{blocks.length}</span>
                    </div>
                    <div className="px-2.5 py-2 rounded-lg bg-slate-900 border border-slate-800 text-slate-300 flex justify-between">
                      <span>Eşyalar</span>
                      <span className="font-mono-num text-rose-300 font-bold">{items.length}</span>
                    </div>
                    <div className="px-2.5 py-2 rounded-lg bg-slate-900 border border-slate-800 text-slate-300 flex justify-between">
                      <span>Aletler</span>
                      <span className="font-mono-num text-sky-300 font-bold">{tools.length}</span>
                    </div>
                    <div className="px-2.5 py-2 rounded-lg bg-slate-900 border border-slate-800 text-slate-300 flex justify-between">
                      <span>Tarifler</span>
                      <span className="font-mono-num text-emerald-300 font-bold">{recipes.length}</span>
                    </div>
                    <div className="col-span-2 px-2.5 py-2 rounded-lg bg-slate-900 border border-slate-800 text-slate-300 flex justify-between">
                      <span>Özel Komutlar (/...)</span>
                      <span className="font-mono-num text-violet-300 font-bold">{commands.length}</span>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 gap-2 pt-2 border-t border-slate-800">
                    <button
                      onClick={() => handleSaveMod(false)}
                      className="flex items-center justify-center gap-2 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-xs font-bold text-white cursor-pointer"
                    >
                      <Check className="w-4 h-4" /> Modu Kaydet & Etkinleştir
                    </button>
                    <button
                      onClick={() => handleSaveMod(true)}
                      className="flex items-center justify-center gap-2 py-2.5 rounded-xl bg-sky-600 hover:bg-sky-500 text-xs font-bold text-white cursor-pointer"
                    >
                      <Share2 className="w-4 h-4" /> Buluta Yükle & Toplulukla Paylaş
                    </button>
                  </div>
                </div>
              </div>

              {/* MAIN STUDIO AREA (9 cols) */}
              <div className="xl:col-span-9 flex flex-col gap-4">
                {activeEditor === null ? (
                  /* DEFAULT VIEW: NO EDITOR OPEN! Show Package Contents + "+ Ekle" Button */
                  <div className="p-6 rounded-2xl bg-slate-950/90 border border-slate-800 flex-1 flex flex-col gap-5">
                    <div className="flex flex-wrap items-center justify-between gap-4 pb-4 border-b border-slate-800">
                      <div>
                        <h3 className="text-base font-bold text-white flex items-center gap-2">
                          <Layers className="w-5 h-5 text-amber-400" />
                          Mod Paketi İçerikleri
                        </h3>
                        <p className="text-xs text-slate-400 mt-0.5">
                          Yeni bir içerik oluşturmak için <strong>Ekle</strong> butonuna tıkla; eklediğin anda ekran kapanır ve paketine eklenir.
                        </p>
                      </div>

                      <div className="relative">
                        <button
                          onClick={() => setShowAddPicker((v) => !v)}
                          className="flex items-center gap-2 px-5 py-3 rounded-xl bg-amber-600 hover:bg-amber-500 text-sm font-bold text-white shadow-lg shadow-amber-900/40 cursor-pointer"
                        >
                          <Plus className="w-5 h-5" /> Ekle
                        </button>
                      </div>
                    </div>

                    {/* Inline Picker Modal/Grid when "+ Ekle" is clicked */}
                    {showAddPicker && (
                      <div className="p-5 rounded-2xl bg-slate-900 border-2 border-amber-500/50 space-y-4 shadow-xl">
                        <div className="flex items-center justify-between">
                          <div>
                            <h4 className="text-sm font-bold text-white">Moda Ne Eklemek İstersin?</h4>
                            <p className="text-xs text-slate-400">
                              Eklemek istediğin öğe türünü seç — editörü açılacaktır.
                            </p>
                          </div>
                          <button
                            onClick={() => setShowAddPicker(false)}
                            className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 cursor-pointer"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                          {ADD_OPTIONS.map((opt) => {
                            const Icon = opt.icon;
                            return (
                              <button
                                key={opt.kind}
                                onClick={() => openEditor(opt.kind)}
                                className={`p-4 rounded-xl border text-left transition-all cursor-pointer flex flex-col gap-2 ${opt.accent}`}
                              >
                                <div className="flex items-center justify-between">
                                  <Icon className="w-5 h-5" />
                                  <span className="text-[10px] font-bold tracking-wider px-2 py-0.5 rounded bg-slate-950/60">
                                    {opt.badge}
                                  </span>
                                </div>
                                <div className="text-sm font-bold text-white">{opt.title}</div>
                                <p className="text-[11px] text-slate-300/90 leading-relaxed">
                                  {opt.subtitle}
                                </p>
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {/* Added Contents Grid */}
                    {totalEntriesCount === 0 ? (
                      <div className="flex-1 flex flex-col items-center justify-center py-14 border border-dashed border-slate-800 rounded-2xl text-center px-6">
                        <PackagePlus className="w-12 h-12 text-slate-600 mb-3" />
                        <h4 className="text-sm font-bold text-slate-200 mb-1">
                          Mod paketin şu an boş
                        </h4>
                        <p className="text-xs text-slate-400 max-w-md mb-5">
                          Sağ üstteki veya aşağıdaki <strong>+ Ekle</strong> butonuna basarak özel bloklar, eşyalar, yiyecekler, 3×3 craft tarifleri, ocak eritmeleri veya özel sohbet komutları ekleyebilirsin.
                        </p>
                        <button
                          onClick={() => setShowAddPicker(true)}
                          className="flex items-center gap-2 px-6 py-3 rounded-xl bg-amber-600 hover:bg-amber-500 text-sm font-bold text-white cursor-pointer"
                        >
                          <Plus className="w-5 h-5" /> İlk İçeriği Ekle
                        </button>
                      </div>
                    ) : (
                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                        {blocks.map((b) => {
                          const thumbUrl = b.customTexture
                            ? pixelsToDataUrl(b.customTexture.split(','), b.color)
                            : null;
                          return (
                            <div
                              key={b.id}
                              className="p-3.5 rounded-xl bg-slate-900 border border-slate-800 flex items-center justify-between gap-3"
                            >
                              <div className="flex items-center gap-3 min-w-0">
                                {thumbUrl ? (
                                  <img
                                    src={thumbUrl}
                                    alt={b.name}
                                    className="w-10 h-10 rounded-lg border border-white/15 pixelated shrink-0"
                                  />
                                ) : (
                                  <span
                                    className="w-10 h-10 rounded-lg border border-white/15 shrink-0"
                                    style={{ backgroundColor: b.color }}
                                  />
                                )}
                                <div className="min-w-0">
                                  <div
                                    className={`text-[10px] font-bold ${
                                      b.isLiquid ? 'text-cyan-400' : 'text-amber-400'
                                    }`}
                                  >
                                    {b.isLiquid ? 'AKIŞKAN SIVI' : 'BLOK'}
                                  </div>
                                  <div className="text-xs font-bold text-white truncate">{b.name}</div>
                                  <div className="text-[10px] text-slate-400">
                                    {b.isLiquid ? (
                                      <>
                                        Yayılma {b.liquidSpread ?? 5} ·{' '}
                                        {b.liquidHarmful ? 'Hasarlı' : 'Güvenli'}
                                        {b.glow ? ` · Işık ${b.lightLevel || 14}` : ''}
                                      </>
                                    ) : (
                                      <>
                                        Sertlik {b.hardness}s
                                        {b.spawnAsOre ? ` · Maden Y:${b.minSpawnY}-${b.maxSpawnY}` : ''}
                                        {b.spawnOnSurface ? ' · Yüzey Doğuşu' : ''}
                                        {b.nonSolid ? ' · Bitki/Geçilebilir' : ''}
                                        {b.craftPattern?.some(Boolean) ? ' · 3×3 Tarif' : ''}
                                      </>
                                    )}
                                  </div>
                                </div>
                              </div>
                              <button
                                onClick={() => setBlocks((p) => p.filter((x) => x.id !== b.id))}
                                className="p-1.5 rounded-lg text-slate-400 hover:text-rose-400 hover:bg-slate-800 cursor-pointer"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </div>
                          );
                        })}

                        {items.map((it) => {
                          const thumbUrl = it.customTexture
                            ? pixelsToDataUrl(it.customTexture.split(','), it.color)
                            : null;
                          return (
                            <div
                              key={it.id}
                              className="p-3.5 rounded-xl bg-slate-900 border border-slate-800 flex items-center justify-between gap-3"
                            >
                              <div className="flex items-center gap-3 min-w-0">
                                {thumbUrl ? (
                                  <img
                                    src={thumbUrl}
                                    alt={it.name}
                                    className="w-10 h-10 rounded-lg border border-white/15 pixelated shrink-0 bg-slate-950"
                                  />
                                ) : (
                                  <span
                                    className="w-10 h-10 rounded-lg border border-white/15 shrink-0"
                                    style={{ backgroundColor: it.color }}
                                  />
                                )}
                                <div className="min-w-0">
                                  <div
                                    className={`text-[10px] font-bold ${
                                      it.itemKind === 'bucket' ? 'text-cyan-400' : 'text-rose-400'
                                    }`}
                                  >
                                    {it.itemKind === 'bucket'
                                      ? 'SIVI KOVASI'
                                      : it.itemKind === 'food'
                                        ? 'YİYECEK'
                                        : it.itemKind === 'gem'
                                          ? 'MÜCEVHER'
                                          : 'EŞYA'}
                                  </div>
                                  <div className="text-xs font-bold text-white truncate">{it.name}</div>
                                  <div className="text-[10px] text-slate-400">
                                    Yığın {it.stackSize}
                                    {it.placesLiquidId ? ' · Sağ tıkla sıvı koyar' : ''}
                                    {it.foodValue ? ` · +${it.foodValue} Açlık` : ''}
                                    {it.craftPattern?.some(Boolean) ? ' · 3×3 Tarif' : ''}
                                  </div>
                                </div>
                              </div>
                              <button
                                onClick={() => setItems((p) => p.filter((x) => x.id !== it.id))}
                                className="p-1.5 rounded-lg text-slate-400 hover:text-rose-400 hover:bg-slate-800 cursor-pointer"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </div>
                          );
                        })}

                        {tools.map((t) => (
                          <div
                            key={t.id}
                            className="p-3.5 rounded-xl bg-slate-900 border border-slate-800 flex items-center justify-between gap-3"
                          >
                            <div className="flex items-center gap-3 min-w-0">
                              <span
                                className="w-10 h-10 rounded-lg border border-white/15 flex items-center justify-center shrink-0"
                                style={{ backgroundColor: t.color }}
                              >
                                <Wrench className="w-5 h-5 text-slate-950" />
                              </span>
                              <div className="min-w-0">
                                <div className="text-[10px] font-bold text-sky-400">ALET</div>
                                <div className="text-xs font-bold text-white truncate">{t.name}</div>
                                <div className="text-[10px] text-slate-400">
                                  {t.miningSpeed}x Hız · Dayanıklılık {t.durability}
                                </div>
                              </div>
                            </div>
                            <button
                              onClick={() => setTools((p) => p.filter((x) => x.id !== t.id))}
                              className="p-1.5 rounded-lg text-slate-400 hover:text-rose-400 hover:bg-slate-800 cursor-pointer"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        ))}

                        {recipes.map((r) => {
                          const outOpt = optionById.get(r.outputId);
                          return (
                            <div
                              key={r.id}
                              className="p-3.5 rounded-xl bg-slate-900 border border-slate-800 flex items-center justify-between gap-3"
                            >
                              <div className="flex items-center gap-3 min-w-0">
                                {r.pattern && r.pattern.some(Boolean) ? (
                                  <div className="grid grid-cols-3 gap-0.5 p-1 rounded bg-slate-950 border border-slate-700 shrink-0">
                                    {r.pattern.map((cid, ci) => (
                                      <div key={ci} className="w-2.5 h-2.5 rounded-[1px] bg-slate-900">
                                        {cid && optionById.get(cid) && (
                                          <img
                                            src={optionById.get(cid)!.iconUrl}
                                            alt={cid}
                                            className="w-full h-full pixelated"
                                          />
                                        )}
                                      </div>
                                    ))}
                                  </div>
                                ) : (
                                  <div className="w-10 h-10 rounded-lg bg-orange-500/15 border border-orange-500/40 flex items-center justify-center shrink-0">
                                    <Flame className="w-5 h-5 text-orange-400" />
                                  </div>
                                )}
                                <div className="min-w-0">
                                  <div className="text-[10px] font-bold text-emerald-400">
                                    {r.requiresFurnace ? 'OCAK ERİTME' : '3×3 CRAFT TARİFİ'}
                                  </div>
                                  <div className="text-xs font-bold text-white truncate">
                                    {r.name} (×{r.outputCount})
                                  </div>
                                  <div className="text-[10px] text-slate-400 truncate">
                                    Çıktı: {outOpt?.name || r.outputId}
                                  </div>
                                </div>
                              </div>
                              <button
                                onClick={() => setRecipes((p) => p.filter((x) => x.id !== r.id))}
                                className="p-1.5 rounded-lg text-slate-400 hover:text-rose-400 hover:bg-slate-800 cursor-pointer"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </div>
                          );
                        })}

                        {commands.map((c) => (
                          <div
                            key={c.id}
                            className="p-3.5 rounded-xl bg-slate-900 border border-slate-800 flex items-center justify-between gap-3"
                          >
                            <div className="flex items-center gap-3 min-w-0">
                              <div className="w-10 h-10 rounded-lg bg-violet-500/15 border border-violet-500/40 flex items-center justify-center shrink-0">
                                <Terminal className="w-5 h-5 text-violet-400" />
                              </div>
                              <div className="min-w-0">
                                <div className="text-[10px] font-bold text-violet-400">KOMUT</div>
                                <div className="text-xs font-bold text-white truncate font-mono">
                                  /{c.command}
                                </div>
                                <div className="text-[10px] text-slate-400 truncate">
                                  {c.description}
                                </div>
                              </div>
                            </div>
                            <button
                              onClick={() => setCommands((p) => p.filter((x) => x.id !== c.id))}
                              className="p-1.5 rounded-lg text-slate-400 hover:text-rose-400 hover:bg-slate-800 cursor-pointer"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ) : activeEditor === 'block' ? (
                  /* FOCUSED EDITOR: CUSTOM BLOCK (6-FACE + 3x3 CRAFT) */
                  <div className="space-y-4">
                    <div className="flex items-center justify-between px-4 py-3 rounded-xl bg-slate-950 border border-slate-800">
                      <div className="flex items-center gap-2 text-sm font-bold text-amber-300">
                        <Sparkles className="w-4 h-4" /> Yeni Özel Blok Oluştur
                      </div>
                      <button
                        onClick={() => setActiveEditor(null)}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-slate-200 cursor-pointer"
                      >
                        <ArrowLeft className="w-3.5 h-3.5" /> Vazgeç / Kapat
                      </button>
                    </div>

                    <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
                      {/* LEFT: 6-Face Pixel Painter & Live 3D Cube */}
                      <div className="lg:col-span-6 p-5 rounded-2xl bg-slate-950/90 border border-slate-800 flex flex-col gap-3.5">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div>
                            <h3 className="text-sm font-bold text-white">16×16 Blok Dokusu (6 Yüz)</h3>
                            <p className="text-[11px] text-slate-400">
                              Sağ, Sol, Ön, Arka, Üst ve Alt yüzleri tek tek veya birlikte boya
                            </p>
                          </div>
                          <div className="flex items-center gap-1.5">
                            <label className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-sky-600 hover:bg-sky-500 text-xs font-medium text-white cursor-pointer">
                              <ImageIcon className="w-3.5 h-3.5" /> PNG
                              <input
                                type="file"
                                accept="image/*"
                                onChange={(e) =>
                                  handleUploadPng16(e, (arr) => {
                                    writePixelsToTargets(arr);
                                    setFeedback(`Görsel 16×16 olarak ${getTargetFaces().length} yüze uygulandı!`);
                                  })
                                }
                                className="hidden"
                              />
                            </label>
                            <button
                              onClick={() => regeneratePatternPixels()}
                              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs font-medium text-amber-300 cursor-pointer"
                            >
                              <RotateCcw className="w-3.5 h-3.5" /> Desenden Üret
                            </button>
                          </div>
                        </div>

                        <div className="grid grid-cols-6 gap-1.5">
                          {CUBE_FACE_META.map((fm) => {
                            const selected = activeFace === fm.key;
                            const isSynced = syncFaces.includes(fm.key);
                            const thumb = pixelsToDataUrl(blkFacePixels[fm.key], blkColor);
                            return (
                              <button
                                key={fm.key}
                                onClick={() => setActiveFace(fm.key)}
                                className={`flex flex-col items-center gap-1 p-1.5 rounded-xl border text-[11px] font-semibold cursor-pointer ${
                                  selected
                                    ? 'bg-amber-600/25 border-amber-400 text-amber-200'
                                    : isSynced
                                      ? 'bg-slate-900 border-emerald-500/40 text-slate-200'
                                      : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-white'
                                }`}
                              >
                                <img src={thumb} alt={fm.label} className="w-6 h-6 rounded border border-white/15 pixelated" />
                                <span>{fm.label}</span>
                              </button>
                            );
                          })}
                        </div>

                        {/* Sync Controls */}
                        <div className="p-2.5 rounded-xl bg-slate-900/80 border border-slate-800 space-y-2">
                          <div className="flex flex-wrap items-center justify-between gap-2 text-[11px]">
                            <span className="flex items-center gap-1 text-emerald-300 font-semibold">
                              <Link2 className="w-3.5 h-3.5" /> Birlikte Boyanacak Yüzler:
                            </span>
                            <div className="flex items-center gap-1">
                              <button
                                onClick={() => setSyncFaces([activeFace])}
                                className="px-2 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 cursor-pointer"
                              >
                                Sadece Bu Yüz
                              </button>
                              <button
                                onClick={() => {
                                  setSyncFaces(['right', 'left', 'front', 'back']);
                                  const src = [...blkFacePixels[activeFace]];
                                  setBlkFacePixels((p) => ({
                                    ...p,
                                    right: [...src],
                                    left: [...src],
                                    front: [...src],
                                    back: [...src],
                                  }));
                                }}
                                className="px-2 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-emerald-300 cursor-pointer"
                              >
                                4 Yanı Eşitle
                              </button>
                              <button
                                onClick={() => {
                                  setSyncFaces([...ALL_CUBE_FACES]);
                                  const src = [...blkFacePixels[activeFace]];
                                  setBlkFacePixels({
                                    right: [...src],
                                    left: [...src],
                                    front: [...src],
                                    back: [...src],
                                    top: [...src],
                                    bottom: [...src],
                                  });
                                }}
                                className="px-2 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-amber-300 cursor-pointer"
                              >
                                6 Yüzü Eşitle
                              </button>
                            </div>
                          </div>
                          <div className="flex flex-wrap gap-1.5">
                            {CUBE_FACE_META.map((fm) => {
                              const checked = syncFaces.includes(fm.key);
                              return (
                                <button
                                  key={fm.key}
                                  onClick={() =>
                                    setSyncFaces((prev) =>
                                      prev.includes(fm.key)
                                        ? prev.length > 1
                                          ? prev.filter((x) => x !== fm.key)
                                          : prev
                                        : [...prev, fm.key],
                                    )
                                  }
                                  className={`px-2 py-0.5 rounded-md text-[10px] font-semibold cursor-pointer border ${
                                    checked
                                      ? 'bg-emerald-600/25 border-emerald-500/60 text-emerald-200'
                                      : 'bg-slate-950 border-slate-800 text-slate-400'
                                  }`}
                                >
                                  {checked ? '✓ ' : ''}
                                  {fm.label}
                                </button>
                              );
                            })}
                          </div>
                        </div>

                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="flex flex-wrap items-center gap-1.5">
                            {(
                              [
                                { id: 'brush', icon: Paintbrush, label: 'Fırça' },
                                { id: 'bucket', icon: PaintBucket, label: 'Doldur' },
                                { id: 'replace', icon: Wand2, label: 'Renk Değiştirici' },
                                { id: 'eyedropper', icon: Pipette, label: 'Seç' },
                                { id: 'eraser', icon: Eraser, label: 'Sil' },
                              ] as const
                            ).map((t) => {
                              const Icon = t.icon;
                              return (
                                <button
                                  key={t.id}
                                  onClick={() => setPaintTool(t.id)}
                                  className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium cursor-pointer ${
                                    paintTool === t.id
                                      ? t.id === 'replace'
                                        ? 'bg-amber-600 text-white'
                                        : 'bg-emerald-600 text-white'
                                      : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                                  }`}
                                >
                                  <Icon className="w-3.5 h-3.5" /> {t.label}
                                </button>
                              );
                            })}
                          </div>
                          <label className="flex items-center gap-2 text-xs text-slate-300 cursor-pointer">
                            <input
                              type="color"
                              value={paintColor}
                              onChange={(e) => setPaintColor(e.target.value)}
                              className="w-7 h-7 rounded cursor-pointer bg-transparent"
                            />
                            Fırça Rengi
                          </label>
                        </div>

                        {paintTool === 'replace' && (
                          <div className="px-3 py-1.5 rounded-xl bg-amber-500/15 border border-amber-500/40 text-[11px] text-amber-200 flex items-center gap-2">
                            <Wand2 className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                            <span>
                              <strong>Renk Değiştirici:</strong> Tıkladığın renkteki tüm pikselleri seçili fırça rengine çevirir.
                            </span>
                          </div>
                        )}

                        <div className="flex justify-center">
                          <div
                            className="grid grid-cols-16 gap-0 w-full max-w-[290px] aspect-square border-2 border-slate-700 rounded-lg overflow-hidden select-none bg-slate-900"
                            onMouseLeave={() => setIsPainting(false)}
                          >
                            {blkFacePixels[activeFace].map((pxColor, idx) => {
                              const bg =
                                pxColor === 'transparent'
                                  ? 'repeating-conic-gradient(#1e293b 0% 25%, #0f172a 0% 50%) 50% / 10px 10px'
                                  : pxColor === 'rgba_glass'
                                    ? blkColor
                                    : pxColor;
                              return (
                                <div
                                  key={idx}
                                  onMouseDown={(e) => {
                                    e.preventDefault();
                                    setIsPainting(true);
                                    applyBlockPaintAt(idx);
                                  }}
                                  onMouseEnter={() => {
                                    if (isPainting && paintTool !== 'bucket' && paintTool !== 'replace') {
                                      applyBlockPaintAt(idx);
                                    }
                                  }}
                                  className="w-full h-full border-[0.5px] border-slate-950/25 cursor-crosshair"
                                  style={{ background: bg, opacity: pxColor === 'rgba_glass' ? 0.5 : 1 }}
                                />
                              );
                            })}
                          </div>
                        </div>

                        <div className="grid grid-cols-12 gap-1.5">
                          {TEXTURE_PALETTE.map((c) => (
                            <button
                              key={c}
                              onClick={() => {
                                setPaintColor(c);
                                if (paintTool === 'eraser' || paintTool === 'eyedropper') setPaintTool('brush');
                              }}
                              className={`h-6 rounded border cursor-pointer ${
                                paintColor === c ? 'border-white scale-110' : 'border-white/15'
                              }`}
                              style={{ backgroundColor: c }}
                            />
                          ))}
                        </div>

                        <LiveCubePreview3D
                          facePixels={blkFacePixels}
                          fallbackColor={blkColor}
                          pattern={blkPattern}
                          transparent={blkTrans}
                          glow={blkGlow}
                          heightClass="h-40"
                        />
                      </div>

                      {/* RIGHT: Block Properties + Optional 3x3 Craft */}
                      <div className="lg:col-span-6 p-5 rounded-2xl bg-slate-950/90 border border-slate-800 flex flex-col gap-4">
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          <div className="sm:col-span-2">
                            <label className="block text-xs text-slate-400 mb-1">Blok Adı</label>
                            <input
                              type="text"
                              value={blkName}
                              onChange={(e) => setBlkName(e.target.value)}
                              placeholder="Örn: Titanyum Cevheri"
                              className="w-full px-3 py-2.5 rounded-xl bg-slate-900 border border-slate-700 text-sm text-white"
                            />
                          </div>
                          <div>
                            <label className="block text-xs text-slate-400 mb-1">Desen Şablonu</label>
                            <select
                              value={blkPattern}
                              onChange={(e) => {
                                const pat = e.target.value as BlockPattern;
                                setBlkPattern(pat);
                                if (pat === 'foliage_cross' || pat === 'bamboo') {
                                  setBlkTrans(true);
                                  setBlkNonSolid(true);
                                } else if (pat === 'lantern') {
                                  setBlkTrans(true);
                                  setBlkGlow(true);
                                  setBlkNonSolid(false);
                                } else if (pat === 'leaves' || pat === 'glass') {
                                  setBlkTrans(true);
                                  setBlkNonSolid(false);
                                } else {
                                  setBlkNonSolid(false);
                                }
                                regeneratePatternPixels(pat, blkColor, blkSecColor);
                              }}
                              className="w-full px-3 py-2.5 rounded-xl bg-slate-900 border border-slate-700 text-xs text-white"
                            >
                              {PATTERN_OPTIONS.map((p) => (
                                <option key={p.value} value={p.value}>{p.label}</option>
                              ))}
                            </select>
                          </div>
                          <div className="flex items-end gap-3">
                            <label className="flex-1 flex items-center gap-2 px-3 py-2 rounded-xl bg-slate-900 border border-slate-700 text-xs text-slate-300 cursor-pointer">
                              <input
                                type="color"
                                value={blkColor}
                                onChange={(e) => {
                                  setBlkColor(e.target.value);
                                  regeneratePatternPixels(blkPattern, e.target.value, blkSecColor);
                                }}
                                className="w-6 h-6 rounded bg-transparent cursor-pointer"
                              />
                              Ana
                            </label>
                            <label className="flex-1 flex items-center gap-2 px-3 py-2 rounded-xl bg-slate-900 border border-slate-700 text-xs text-slate-300 cursor-pointer">
                              <input
                                type="color"
                                value={blkSecColor}
                                onChange={(e) => {
                                  setBlkSecColor(e.target.value);
                                  regeneratePatternPixels(blkPattern, blkColor, e.target.value);
                                }}
                                className="w-6 h-6 rounded bg-transparent cursor-pointer"
                              />
                              Detay
                            </label>
                          </div>
                        </div>

                        <div className="p-4 rounded-xl bg-slate-900/80 border border-slate-800 space-y-3">
                          <div className="text-xs font-bold text-emerald-400">DAYANIKLILIK VE MADENCİLİK</div>
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            <div>
                              <div className="flex justify-between text-xs text-slate-300 mb-1">
                                <span>Sertlik (Süre)</span>
                                <span className="font-mono-num text-emerald-300">{blkHardness.toFixed(1)} sn</span>
                              </div>
                              <input type="range" min={0.2} max={12} step={0.2} value={blkHardness} onChange={(e) => setBlkHardness(Number(e.target.value))} className="w-full" />
                            </div>
                            <div>
                              <div className="flex justify-between text-xs text-slate-300 mb-1">
                                <span>Patlama Direnci</span>
                                <span className="font-mono-num text-amber-300">{blkResistance}</span>
                              </div>
                              <input type="range" min={1} max={100} step={1} value={blkResistance} onChange={(e) => setBlkResistance(Number(e.target.value))} className="w-full" />
                            </div>
                            <div>
                              <label className="block text-xs text-slate-400 mb-1">Gereken Kazma</label>
                              <select value={blkMinTier} onChange={(e) => setBlkMinTier(Number(e.target.value))} className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-700 text-xs text-white">
                                {TOOL_TIER_LABELS.map((t) => (
                                  <option key={t.tier} value={t.tier}>{t.label}</option>
                                ))}
                              </select>
                            </div>
                            <div>
                              <label className="block text-xs text-slate-400 mb-1">Uygun Alet</label>
                              <select value={blkPrefTool} onChange={(e) => setBlkPrefTool(e.target.value as ToolType)} className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-700 text-xs text-white">
                                <option value="pickaxe">Kazma</option>
                                <option value="axe">Balta</option>
                                <option value="shovel">Kürek</option>
                                <option value="none">Herhangi</option>
                              </select>
                            </div>
                          </div>
                          <div className="flex flex-wrap gap-3 text-xs text-slate-200 pt-1">
                            <label className="flex items-center gap-1.5 cursor-pointer">
                              <input type="checkbox" checked={blkGlow} onChange={(e) => setBlkGlow(e.target.checked)} /> Işık Yay ({blkLightLevel})
                            </label>
                            <label className="flex items-center gap-1.5 cursor-pointer">
                              <input type="checkbox" checked={blkTrans} onChange={(e) => setBlkTrans(e.target.checked)} /> Yarı Şeffaf
                            </label>
                            <label className="flex items-center gap-1.5 cursor-pointer" title="Çiçek, ot veya dekor gibi içinden geçilebilir blok">
                              <input type="checkbox" checked={blkNonSolid} onChange={(e) => setBlkNonSolid(e.target.checked)} /> İçinden Geçilebilir
                            </label>
                            <label className="flex items-center gap-1.5 cursor-pointer">
                              <input type="checkbox" checked={blkOreSpawn} onChange={(e) => setBlkOreSpawn(e.target.checked)} /> Yeraltında Maden (Y:{blkMinY}–{blkMaxY})
                            </label>
                            <label className="flex items-center gap-1.5 cursor-pointer">
                              <input type="checkbox" checked={blkSurfaceSpawn} onChange={(e) => setBlkSurfaceSpawn(e.target.checked)} /> Yüzeyde Doğsun
                            </label>
                          </div>
                          {blkGlow && (
                            <input type="range" min={1} max={15} value={blkLightLevel} onChange={(e) => setBlkLightLevel(Number(e.target.value))} className="w-full" />
                          )}
                          {blkOreSpawn && (
                            <div className="grid grid-cols-2 gap-3">
                              <input type="range" min={2} max={80} value={blkMinY} onChange={(e) => setBlkMinY(Number(e.target.value))} className="w-full" />
                              <input type="range" min={4} max={95} value={blkMaxY} onChange={(e) => setBlkMaxY(Number(e.target.value))} className="w-full" />
                            </div>
                          )}
                          {(blkOreSpawn || blkSurfaceSpawn) && (
                            <div className="pt-2 border-t border-slate-800/80 space-y-1.5">
                              <div className="flex items-center justify-between text-[11px] text-slate-300">
                                <span className="flex items-center gap-1 font-semibold text-emerald-300">
                                  <Trees className="w-3.5 h-3.5" /> Doğacağı Biyomlar
                                </span>
                                <span className="text-slate-400">
                                  {blkBiomes.length === 0 ? 'Tüm Biyomlarda' : `${blkBiomes.length} Biyom Seçili`}
                                </span>
                              </div>
                              <div className="flex flex-wrap gap-1">
                                {BIOME_OPTIONS.map((bo) => {
                                  const active = blkBiomes.includes(bo.id);
                                  return (
                                    <button
                                      key={bo.id}
                                      type="button"
                                      onClick={() =>
                                        setBlkBiomes((prev) =>
                                          prev.includes(bo.id)
                                            ? prev.filter((x) => x !== bo.id)
                                            : [...prev, bo.id],
                                        )
                                      }
                                      className={`px-2 py-0.5 rounded-md text-[10px] font-semibold border cursor-pointer transition-colors ${
                                        active
                                          ? 'bg-emerald-600/30 border-emerald-400 text-emerald-200'
                                          : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-white'
                                      }`}
                                    >
                                      {active ? '✓ ' : ''}
                                      {bo.label}
                                    </button>
                                  );
                                })}
                              </div>
                            </div>
                          )}
                        </div>

                        {/* Optional 3x3 Craft Recipe for this block */}
                        <div className="space-y-2">
                          <div className="flex items-center justify-between">
                            <label className="flex items-center gap-2 text-xs font-semibold text-slate-200 cursor-pointer">
                              <input
                                type="checkbox"
                                checked={blkHasCraft}
                                onChange={(e) => setBlkHasCraft(e.target.checked)}
                              />
                              Bu blok için 3×3 Craft Tarifi ekle
                            </label>
                            {blkHasCraft && (
                              <label className="flex items-center gap-2 text-xs text-slate-300">
                                Çıktı Adedi:
                                <input
                                  type="number"
                                  min={1}
                                  max={64}
                                  value={blkOutCount}
                                  onChange={(e) => setBlkOutCount(Number(e.target.value))}
                                  className="w-16 px-2 py-1 rounded bg-slate-900 border border-slate-700 text-xs text-white"
                                />
                              </label>
                            )}
                          </div>
                          {blkHasCraft && (
                            <CraftingGrid3x3Editor
                              pattern={blkCraftPattern}
                              onChange={setBlkCraftPattern}
                              paletteOptions={allPaletteOptions}
                              title="Blok 3×3 Üretim Tarifi"
                            />
                          )}
                        </div>

                        <button
                          onClick={handleAddBlock}
                          className="mt-auto w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-amber-600 hover:bg-amber-500 text-sm font-bold text-white cursor-pointer"
                        >
                          <Plus className="w-5 h-5" /> Bloğu Mod Paketine Ekle ve Kapat
                        </button>
                      </div>
                    </div>
                  </div>
                ) : activeEditor === 'liquid' ? (
                  /* FOCUSED EDITOR: CUSTOM FLOWING LIQUID + BUCKET */
                  <div className="space-y-4">
                    <div className="flex items-center justify-between px-4 py-3 rounded-xl bg-slate-950 border border-slate-800">
                      <div className="flex items-center gap-2 text-sm font-bold text-cyan-300">
                        <Droplets className="w-4 h-4" /> Yeni Akışkan Sıvı + Kova Oluştur
                      </div>
                      <button
                        onClick={() => setActiveEditor(null)}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-slate-200 cursor-pointer"
                      >
                        <ArrowLeft className="w-3.5 h-3.5" /> Vazgeç / Kapat
                      </button>
                    </div>

                    <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
                      {/* Left: 16x16 Liquid Texture Canvas + PNG Upload */}
                      <div className="lg:col-span-5 p-5 rounded-2xl bg-slate-950/90 border border-slate-800 flex flex-col gap-3.5">
                        <div className="flex items-center justify-between gap-2">
                          <div>
                            <h3 className="text-sm font-bold text-white">16×16 Sıvı Dokusu</h3>
                            <p className="text-[11px] text-slate-400">
                              PNG yükle veya renge göre otomatik sıvı dalgası üret
                            </p>
                          </div>
                          <div className="flex items-center gap-1.5">
                            <label className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-sky-600 hover:bg-sky-500 text-xs font-medium text-white cursor-pointer">
                              <ImageIcon className="w-3.5 h-3.5" /> PNG
                              <input
                                type="file"
                                accept="image/*"
                                onChange={(e) => {
                                  handleUploadPng16(e, (arr) => {
                                    setLiqPixels(arr);
                                    setFeedback('Sıvı için özel PNG doku 16×16 olarak yüklendi!');
                                  });
                                }}
                                className="hidden"
                              />
                            </label>
                            <button
                              onClick={() => regenerateLiquidPixels()}
                              className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs font-medium text-cyan-300 cursor-pointer"
                            >
                              <RotateCcw className="w-3.5 h-3.5" /> Desen Üret
                            </button>
                          </div>
                        </div>

                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="flex flex-wrap items-center gap-1.5">
                            {(
                              [
                                { id: 'brush', icon: Paintbrush, label: 'Fırça' },
                                { id: 'bucket', icon: PaintBucket, label: 'Doldur' },
                                { id: 'replace', icon: Wand2, label: 'Renk Değiştirici' },
                                { id: 'eyedropper', icon: Pipette, label: 'Seç' },
                                { id: 'eraser', icon: Eraser, label: 'Sıfırla' },
                              ] as const
                            ).map((t) => {
                              const Icon = t.icon;
                              return (
                                <button
                                  key={t.id}
                                  onClick={() => setLiqPaintTool(t.id)}
                                  className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium cursor-pointer ${
                                    liqPaintTool === t.id
                                      ? t.id === 'replace'
                                        ? 'bg-amber-600 text-white'
                                        : 'bg-cyan-600 text-white'
                                      : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                                  }`}
                                >
                                  <Icon className="w-3.5 h-3.5" /> {t.label}
                                </button>
                              );
                            })}
                          </div>
                          <input
                            type="color"
                            value={liqPaintColor}
                            onChange={(e) => setLiqPaintColor(e.target.value)}
                            className="w-7 h-7 rounded cursor-pointer bg-transparent"
                          />
                        </div>

                        <div className="flex justify-center">
                          <div
                            className="grid grid-cols-16 gap-0 w-full max-w-[290px] aspect-square border-2 border-slate-700 rounded-lg overflow-hidden select-none bg-slate-900"
                            onMouseLeave={() => setIsPainting(false)}
                          >
                            {liqPixels.map((pxColor, idx) => (
                              <div
                                key={idx}
                                onMouseDown={(e) => {
                                  e.preventDefault();
                                  setIsPainting(true);
                                  applyLiqPaintAt(idx);
                                }}
                                onMouseEnter={() => {
                                  if (isPainting && liqPaintTool !== 'bucket' && liqPaintTool !== 'replace') {
                                    applyLiqPaintAt(idx);
                                  }
                                }}
                                className="w-full h-full border-[0.5px] border-slate-950/25 cursor-crosshair"
                                style={{ background: pxColor === 'transparent' ? liqColor : pxColor }}
                              />
                            ))}
                          </div>
                        </div>

                        <div className="grid grid-cols-12 gap-1.5">
                          {TEXTURE_PALETTE.map((c) => (
                            <button
                              key={c}
                              onClick={() => {
                                setLiqPaintColor(c);
                                if (liqPaintTool === 'eraser' || liqPaintTool === 'eyedropper') {
                                  setLiqPaintTool('brush');
                                }
                              }}
                              className={`h-6 rounded border cursor-pointer ${
                                liqPaintColor === c ? 'border-white scale-110' : 'border-white/15'
                              }`}
                              style={{ backgroundColor: c }}
                            />
                          ))}
                        </div>
                      </div>

                      {/* Right: Liquid Settings, Flow Rules & Bucket Craft */}
                      <div className="lg:col-span-7 p-5 rounded-2xl bg-slate-950/90 border border-slate-800 flex flex-col gap-4">
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          <div>
                            <label className="block text-xs text-slate-400 mb-1">Sıvı Adı</label>
                            <input
                              type="text"
                              value={liqName}
                              onChange={(e) => {
                                const val = e.target.value;
                                setLiqName(val);
                                if (!liqBucketName || liqBucketName.endsWith('Kovası')) {
                                  setLiqBucketName(val.trim() ? `${val.trim()} Kovası` : 'Özel Kova');
                                }
                              }}
                              placeholder="Örn: Zehirli Asit"
                              className="w-full px-3 py-2.5 rounded-xl bg-slate-900 border border-slate-700 text-sm text-white"
                            />
                          </div>
                          <div>
                            <label className="block text-xs text-slate-400 mb-1">Otomatik Kova Adı</label>
                            <input
                              type="text"
                              value={liqBucketName}
                              onChange={(e) => setLiqBucketName(e.target.value)}
                              placeholder="Örn: Asit Kovası"
                              className="w-full px-3 py-2.5 rounded-xl bg-slate-900 border border-slate-700 text-sm text-white"
                            />
                          </div>

                          <div className="flex items-center gap-3">
                            <label className="flex-1 flex items-center gap-2 px-3 py-2 rounded-xl bg-slate-900 border border-slate-700 text-xs text-slate-300 cursor-pointer">
                              <input
                                type="color"
                                value={liqColor}
                                onChange={(e) => {
                                  setLiqColor(e.target.value);
                                  regenerateLiquidPixels(liqPattern, e.target.value, liqSecColor);
                                }}
                                className="w-6 h-6 rounded bg-transparent"
                              />
                              Ana Renk
                            </label>
                            <label className="flex-1 flex items-center gap-2 px-3 py-2 rounded-xl bg-slate-900 border border-slate-700 text-xs text-slate-300 cursor-pointer">
                              <input
                                type="color"
                                value={liqSecColor}
                                onChange={(e) => {
                                  setLiqSecColor(e.target.value);
                                  regenerateLiquidPixels(liqPattern, liqColor, e.target.value);
                                }}
                                className="w-6 h-6 rounded bg-transparent"
                              />
                              Dalga / İkincil
                            </label>
                          </div>

                          <div>
                            <label className="block text-xs text-slate-400 mb-1">Doku Şablonu</label>
                            <select
                              value={liqPattern}
                              onChange={(e) => {
                                const pat = e.target.value as BlockPattern;
                                setLiqPattern(pat);
                                regenerateLiquidPixels(pat, liqColor, liqSecColor);
                              }}
                              className="w-full px-3 py-2.5 rounded-xl bg-slate-900 border border-slate-700 text-xs text-white"
                            >
                              <option value="water">Su Dalgası Deseni</option>
                              <option value="lava">Lav / Magma Kabarcığı</option>
                              <option value="glow">Parlak Enerji / İksir</option>
                              <option value="solid">Düz Sıvı Yüzeyi</option>
                            </select>
                          </div>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-3.5 rounded-xl bg-slate-900/80 border border-slate-800">
                          <div>
                            <div className="flex justify-between text-xs text-slate-300 mb-1">
                              <span>Yayılma Mesafesi</span>
                              <span className="font-mono-num text-cyan-300">{liqSpread} Blok</span>
                            </div>
                            <input
                              type="range"
                              min={1}
                              max={7}
                              value={liqSpread}
                              onChange={(e) => setLiqSpread(Number(e.target.value))}
                              className="w-full"
                            />
                          </div>
                          <div>
                            <label className="block text-xs text-slate-400 mb-1">Akış Hızı</label>
                            <select
                              value={liqSpeed}
                              onChange={(e) => setLiqSpeed(e.target.value as 'fast' | 'medium' | 'slow')}
                              className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-700 text-xs text-white"
                            >
                              <option value="fast">Hızlı (Su Gibi Akışkan)</option>
                              <option value="medium">Orta (Yoğun İksir / Yağ)</option>
                              <option value="slow">Yavaş (Lav Gibi Ağır)</option>
                            </select>
                          </div>

                          <div className="sm:col-span-2 flex flex-wrap items-center gap-4 pt-1">
                            <label className="flex items-center gap-2 text-xs text-slate-200 cursor-pointer">
                              <input
                                type="checkbox"
                                checked={liqTransparent}
                                onChange={(e) => setLiqTransparent(e.target.checked)}
                              />
                              Yarı Şeffaf Sıvı
                            </label>
                            <label className="flex items-center gap-2 text-xs text-slate-200 cursor-pointer">
                              <input
                                type="checkbox"
                                checked={liqGlow}
                                onChange={(e) => setLiqGlow(e.target.checked)}
                              />
                              Işık Saçsın ({liqGlow ? `Seviye ${liqLightLevel}` : 'Kapalı'})
                            </label>
                            <label className="flex items-center gap-2 text-xs text-rose-300 cursor-pointer">
                              <input
                                type="checkbox"
                                checked={liqHarmful}
                                onChange={(e) => setLiqHarmful(e.target.checked)}
                              />
                              İçine Girene Hasar Versin (Lav / Asit)
                            </label>
                          </div>

                          {liqGlow && (
                            <div className="sm:col-span-2">
                              <input
                                type="range"
                                min={4}
                                max={15}
                                value={liqLightLevel}
                                onChange={(e) => setLiqLightLevel(Number(e.target.value))}
                                className="w-full"
                              />
                            </div>
                          )}
                        </div>

                        <div className="space-y-2">
                          <div className="flex items-center justify-between">
                            <label className="flex items-center gap-2 text-xs font-semibold text-slate-200 cursor-pointer">
                              <input
                                type="checkbox"
                                checked={liqHasCraft}
                                onChange={(e) => setLiqHasCraft(e.target.checked)}
                              />
                              Sıvı Kovası için 3×3 Craft Tarifi tanımla
                            </label>
                            {liqHasCraft && (
                              <label className="flex items-center gap-2 text-xs text-slate-300">
                                Çıktı:
                                <input
                                  type="number"
                                  min={1}
                                  max={16}
                                  value={liqOutCount}
                                  onChange={(e) => setLiqOutCount(Number(e.target.value))}
                                  className="w-16 px-2 py-1 rounded bg-slate-900 border border-slate-700 text-xs text-white"
                                />
                              </label>
                            )}
                          </div>
                          {liqHasCraft && (
                            <CraftingGrid3x3Editor
                              pattern={liqCraftPattern}
                              onChange={setLiqCraftPattern}
                              paletteOptions={allPaletteOptions}
                              title="Kova 3×3 Üretim Tarifi"
                            />
                          )}
                        </div>

                        <button
                          onClick={handleAddLiquid}
                          className="mt-auto w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-sm font-bold text-white cursor-pointer"
                        >
                          <Plus className="w-5 h-5" /> Sıvıyı ve Kovasını Mod Paketine Ekle ve Kapat
                        </button>
                      </div>
                    </div>
                  </div>
                ) : activeEditor === 'item' ? (
                  /* FOCUSED EDITOR: CUSTOM ITEM / FOOD */
                  <div className="space-y-4">
                    <div className="flex items-center justify-between px-4 py-3 rounded-xl bg-slate-950 border border-slate-800">
                      <div className="flex items-center gap-2 text-sm font-bold text-rose-300">
                        <Apple className="w-4 h-4" /> Yeni Özel Eşya / Yiyecek Oluştur
                      </div>
                      <button
                        onClick={() => setActiveEditor(null)}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-slate-200 cursor-pointer"
                      >
                        <ArrowLeft className="w-3.5 h-3.5" /> Vazgeç / Kapat
                      </button>
                    </div>

                    <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
                      {/* Left: 16x16 Pixel Item Canvas */}
                      <div className="lg:col-span-5 p-5 rounded-2xl bg-slate-950/90 border border-slate-800 flex flex-col gap-3.5">
                        <div className="flex items-center justify-between gap-2">
                          <h3 className="text-sm font-bold text-white">16×16 Eşya Piksel Çizimi</h3>
                          <div className="flex items-center gap-1.5">
                            <label className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-sky-600 hover:bg-sky-500 text-xs font-medium text-white cursor-pointer">
                              <ImageIcon className="w-3.5 h-3.5" /> PNG
                              <input
                                type="file"
                                accept="image/*"
                                onChange={(e) => handleUploadPng16(e, setItemPixels)}
                                className="hidden"
                              />
                            </label>
                            <button
                              onClick={() =>
                                setItemPixels(buildPresetItemPixels(itemKind, itemColor, itemSecColor))
                              }
                              className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs font-medium text-rose-300 cursor-pointer"
                            >
                              <RotateCcw className="w-3.5 h-3.5" /> Şablon
                            </button>
                          </div>
                        </div>

                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="flex flex-wrap items-center gap-1.5">
                            {(
                              [
                                { id: 'brush', icon: Paintbrush, label: 'Fırça' },
                                { id: 'bucket', icon: PaintBucket, label: 'Doldur' },
                                { id: 'replace', icon: Wand2, label: 'Renk Değiştirici' },
                                { id: 'eyedropper', icon: Pipette, label: 'Seç' },
                                { id: 'eraser', icon: Eraser, label: 'Sil' },
                              ] as const
                            ).map((t) => {
                              const Icon = t.icon;
                              return (
                                <button
                                  key={t.id}
                                  onClick={() => setItemPaintTool(t.id)}
                                  className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium cursor-pointer ${
                                    itemPaintTool === t.id
                                      ? t.id === 'replace'
                                        ? 'bg-amber-600 text-white'
                                        : 'bg-rose-600 text-white'
                                      : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                                  }`}
                                >
                                  <Icon className="w-3.5 h-3.5" /> {t.label}
                                </button>
                              );
                            })}
                          </div>
                          <input
                            type="color"
                            value={itemPaintColor}
                            onChange={(e) => setItemPaintColor(e.target.value)}
                            className="w-7 h-7 rounded cursor-pointer bg-transparent"
                          />
                        </div>

                        {itemPaintTool === 'replace' && (
                          <div className="px-3 py-1.5 rounded-xl bg-amber-500/15 border border-amber-500/40 text-[11px] text-amber-200 flex items-center gap-2">
                            <Wand2 className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                            <span>
                              <strong>Renk Değiştirici:</strong> Eşyada tıkladığın renkten tümünü seçili renge çevirir.
                            </span>
                          </div>
                        )}

                        <div className="flex justify-center">
                          <div
                            className="grid grid-cols-16 gap-0 w-full max-w-[290px] aspect-square border-2 border-slate-700 rounded-lg overflow-hidden select-none bg-slate-900"
                            onMouseLeave={() => setIsPainting(false)}
                          >
                            {itemPixels.map((pxColor, idx) => {
                              const bg =
                                pxColor === 'transparent'
                                  ? 'repeating-conic-gradient(#1e293b 0% 25%, #0f172a 0% 50%) 50% / 10px 10px'
                                  : pxColor;
                              return (
                                <div
                                  key={idx}
                                  onMouseDown={(e) => {
                                    e.preventDefault();
                                    setIsPainting(true);
                                    applyItemPaintAt(idx);
                                  }}
                                  onMouseEnter={() => {
                                    if (isPainting && itemPaintTool !== 'bucket' && itemPaintTool !== 'replace') {
                                      applyItemPaintAt(idx);
                                    }
                                  }}
                                  className="w-full h-full border-[0.5px] border-slate-950/25 cursor-crosshair"
                                  style={{ background: bg }}
                                />
                              );
                            })}
                          </div>
                        </div>

                        <div className="grid grid-cols-12 gap-1.5">
                          {TEXTURE_PALETTE.map((c) => (
                            <button
                              key={c}
                              onClick={() => {
                                setItemPaintColor(c);
                                if (itemPaintTool === 'eraser' || itemPaintTool === 'eyedropper') {
                                  setItemPaintTool('brush');
                                }
                              }}
                              className={`h-6 rounded border cursor-pointer ${
                                itemPaintColor === c ? 'border-white scale-110' : 'border-white/15'
                              }`}
                              style={{ backgroundColor: c }}
                            />
                          ))}
                        </div>
                      </div>

                      {/* Right: Item Settings & 3x3 Craft */}
                      <div className="lg:col-span-7 p-5 rounded-2xl bg-slate-950/90 border border-slate-800 flex flex-col gap-4">
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          <div>
                            <label className="block text-xs text-slate-400 mb-1">Eşya Adı</label>
                            <input
                              type="text"
                              value={itemName}
                              onChange={(e) => setItemName(e.target.value)}
                              placeholder="Örn: Zümrüt Çekirdeği"
                              className="w-full px-3 py-2.5 rounded-xl bg-slate-900 border border-slate-700 text-sm text-white"
                            />
                          </div>
                          <div>
                            <label className="block text-xs text-slate-400 mb-1">Eşya Türü</label>
                            <select
                              value={itemKind}
                              onChange={(e) => {
                                const k = e.target.value as 'material' | 'food' | 'gem';
                                setItemKind(k);
                                setItemPixels(buildPresetItemPixels(k, itemColor, itemSecColor));
                              }}
                              className="w-full px-3 py-2.5 rounded-xl bg-slate-900 border border-slate-700 text-sm text-white"
                            >
                              <option value="food">Yiyecek (Can & Açlık Yeniler)</option>
                              <option value="gem">Mücevher / Kristal</option>
                              <option value="material">Külçe / Craft Malzemesi</option>
                            </select>
                          </div>

                          <div className="flex items-center gap-3">
                            <label className="flex-1 flex items-center gap-2 px-3 py-2 rounded-xl bg-slate-900 border border-slate-700 text-xs text-slate-300 cursor-pointer">
                              <input
                                type="color"
                                value={itemColor}
                                onChange={(e) => {
                                  setItemColor(e.target.value);
                                  setItemPixels(buildPresetItemPixels(itemKind, e.target.value, itemSecColor));
                                }}
                                className="w-6 h-6 rounded bg-transparent"
                              />
                              Ana Renk
                            </label>
                            <label className="flex-1 flex items-center gap-2 px-3 py-2 rounded-xl bg-slate-900 border border-slate-700 text-xs text-slate-300 cursor-pointer">
                              <input
                                type="color"
                                value={itemSecColor}
                                onChange={(e) => {
                                  setItemSecColor(e.target.value);
                                  setItemPixels(buildPresetItemPixels(itemKind, itemColor, e.target.value));
                                }}
                                className="w-6 h-6 rounded bg-transparent"
                              />
                              Parlama
                            </label>
                          </div>

                          <div>
                            <label className="block text-xs text-slate-400 mb-1">Maks Yığın (Stack)</label>
                            <select
                              value={itemStackSize}
                              onChange={(e) => setItemStackSize(Number(e.target.value))}
                              className="w-full px-3 py-2.5 rounded-xl bg-slate-900 border border-slate-700 text-xs text-white"
                            >
                              <option value={64}>64 Adet</option>
                              <option value={16}>16 Adet</option>
                              <option value={1}>1 Adet (Tekli)</option>
                            </select>
                          </div>

                          {itemKind === 'food' && (
                            <div className="sm:col-span-2 p-3 rounded-xl bg-slate-900 border border-slate-800">
                              <div className="flex justify-between text-xs text-slate-300 mb-1">
                                <span>Doyuruculuk (Sağ Tıkla Yenir)</span>
                                <span className="font-mono-num text-rose-300">+{itemFoodValue} Açlık</span>
                              </div>
                              <input
                                type="range"
                                min={1}
                                max={20}
                                value={itemFoodValue}
                                onChange={(e) => setItemFoodValue(Number(e.target.value))}
                                className="w-full"
                              />
                            </div>
                          )}
                        </div>

                        <div className="space-y-2">
                          <div className="flex items-center justify-between">
                            <label className="flex items-center gap-2 text-xs font-semibold text-slate-200 cursor-pointer">
                              <input
                                type="checkbox"
                                checked={itemHasCraft}
                                onChange={(e) => setItemHasCraft(e.target.checked)}
                              />
                              Bu eşya için 3×3 Craft Tarifi tanımla
                            </label>
                            {itemHasCraft && (
                              <label className="flex items-center gap-2 text-xs text-slate-300">
                                Çıktı:
                                <input
                                  type="number"
                                  min={1}
                                  max={64}
                                  value={itemOutCount}
                                  onChange={(e) => setItemOutCount(Number(e.target.value))}
                                  className="w-16 px-2 py-1 rounded bg-slate-900 border border-slate-700 text-xs text-white"
                                />
                              </label>
                            )}
                          </div>
                          {itemHasCraft && (
                            <CraftingGrid3x3Editor
                              pattern={itemCraftPattern}
                              onChange={setItemCraftPattern}
                              paletteOptions={allPaletteOptions}
                              title="Eşya 3×3 Üretim Tarifi"
                            />
                          )}
                        </div>

                        <button
                          onClick={handleAddItem}
                          className="mt-auto w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-rose-600 hover:bg-rose-500 text-sm font-bold text-white cursor-pointer"
                        >
                          <Plus className="w-5 h-5" /> Eşyayı Mod Paketine Ekle ve Kapat
                        </button>
                      </div>
                    </div>
                  </div>
                ) : activeEditor === 'tool' ? (
                  /* FOCUSED EDITOR: CUSTOM TOOL + 3x3 CRAFT */
                  <div className="p-6 rounded-2xl bg-slate-950/90 border border-slate-800 space-y-5">
                    <div className="flex items-center justify-between">
                      <div>
                        <h3 className="text-base font-bold text-sky-300 flex items-center gap-2">
                          <Wrench className="w-5 h-5" /> Yeni Özel Alet / Kazma / Silah
                        </h3>
                        <p className="text-xs text-slate-400">
                          Hızını, dayanıklılığını ve 3×3 çalışma masası tarifini ayarla.
                        </p>
                      </div>
                      <button
                        onClick={() => setActiveEditor(null)}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-slate-200 cursor-pointer"
                      >
                        <ArrowLeft className="w-3.5 h-3.5" /> Vazgeç / Kapat
                      </button>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                      <div>
                        <label className="block text-xs text-slate-400 mb-1">Alet Adı</label>
                        <input
                          type="text"
                          value={toolName}
                          onChange={(e) => setToolName(e.target.value)}
                          placeholder="Örn: Plazma Kazması"
                          className="w-full px-3 py-2.5 rounded-xl bg-slate-900 border border-slate-700 text-sm text-white"
                        />
                      </div>
                      <div>
                        <label className="block text-xs text-slate-400 mb-1">Alet Türü</label>
                        <select
                          value={toolType}
                          onChange={(e) => setToolType(e.target.value as ToolType)}
                          className="w-full px-3 py-2.5 rounded-xl bg-slate-900 border border-slate-700 text-sm text-white"
                        >
                          <option value="pickaxe">Kazma</option>
                          <option value="axe">Balta</option>
                          <option value="shovel">Kürek</option>
                          <option value="sword">Kılıç</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-xs text-slate-400 mb-1">Alet Rengi</label>
                        <label className="flex items-center gap-3 px-3 py-2 rounded-xl bg-slate-900 border border-slate-700 text-xs text-slate-200 cursor-pointer">
                          <input
                            type="color"
                            value={toolColor}
                            onChange={(e) => setToolColor(e.target.value)}
                            className="w-7 h-7 rounded bg-transparent cursor-pointer"
                          />
                          {toolColor}
                        </label>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 p-4 rounded-xl bg-slate-900/80 border border-slate-800">
                      <div>
                        <div className="flex justify-between text-xs text-slate-300 mb-1">
                          <span>Kazma Hızı</span>
                          <span className="font-mono-num text-sky-300">{toolSpeed}x</span>
                        </div>
                        <input type="range" min={2} max={30} value={toolSpeed} onChange={(e) => setToolSpeed(Number(e.target.value))} className="w-full" />
                      </div>
                      <div>
                        <div className="flex justify-between text-xs text-slate-300 mb-1">
                          <span>Dayanıklılık</span>
                          <span className="font-mono-num text-emerald-300">{toolDurability}</span>
                        </div>
                        <input type="range" min={60} max={5000} step={20} value={toolDurability} onChange={(e) => setToolDurability(Number(e.target.value))} className="w-full" />
                      </div>
                      <div>
                        <label className="block text-xs text-slate-400 mb-1">Kırma Seviyesi (Tier)</label>
                        <select value={toolTier} onChange={(e) => setToolTier(Number(e.target.value))} className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-700 text-xs text-white">
                          <option value={1}>Seviye 1 (Tahta Dengi)</option>
                          <option value={2}>Seviye 2 (Taş Dengi)</option>
                          <option value={3}>Seviye 3 (Demir Dengi)</option>
                          <option value={4}>Seviye 4 (Elmas Dengi)</option>
                          <option value={5}>Seviye 5 (Netherit / Efsanevi)</option>
                        </select>
                      </div>
                    </div>

                    <CraftingGrid3x3Editor
                      pattern={toolCraftPattern}
                      onChange={setToolCraftPattern}
                      paletteOptions={allPaletteOptions}
                      title="Alet 3×3 Üretim Tarifi"
                    />

                    <button
                      onClick={handleAddTool}
                      className="flex items-center justify-center gap-2 w-full py-3 rounded-xl bg-sky-600 hover:bg-sky-500 text-sm font-bold text-white cursor-pointer"
                    >
                      <Plus className="w-5 h-5" /> Özel Aleti Mod Paketine Ekle ve Kapat
                    </button>
                  </div>
                ) : activeEditor === 'recipe' ? (
                  /* FOCUSED EDITOR: STANDALONE 3x3 CRAFT RECIPE */
                  <div className="p-6 rounded-2xl bg-slate-950/90 border border-slate-800 space-y-5">
                    <div className="flex items-center justify-between">
                      <div>
                        <h3 className="text-base font-bold text-emerald-300 flex items-center gap-2">
                          <Grid3X3 className="w-5 h-5" /> 3×3 Çalışma Masası Tarifi Ekle
                        </h3>
                        <p className="text-xs text-slate-400">
                          3×3 alana koyulacak malzemeleri seç ve üretilecek eşya ile adedi belirle.
                        </p>
                      </div>
                      <button
                        onClick={() => setActiveEditor(null)}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-slate-200 cursor-pointer"
                      >
                        <ArrowLeft className="w-3.5 h-3.5" /> Vazgeç / Kapat
                      </button>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                      <div>
                        <label className="block text-xs text-slate-400 mb-1">Tarif Adı</label>
                        <input
                          type="text"
                          value={recName}
                          onChange={(e) => setRecName(e.target.value)}
                          placeholder="Örn: Elmas Dönüşümü"
                          className="w-full px-3 py-2.5 rounded-xl bg-slate-900 border border-slate-700 text-sm text-white"
                        />
                      </div>
                      <div>
                        <label className="block text-xs text-slate-400 mb-1">Çıktı Eşyası / Bloğu</label>
                        <SearchablePaletteSelect
                          value={recOutputId}
                          onChange={setRecOutputId}
                          options={allPaletteOptions}
                          placeholder="Çıktı bloğu/eşyası ara..."
                        />
                      </div>
                      <div>
                        <label className="block text-xs text-slate-400 mb-1">Üretim Adedi</label>
                        <input
                          type="number"
                          min={1}
                          max={64}
                          value={recOutputCount}
                          onChange={(e) => setRecOutputCount(Number(e.target.value))}
                          className="w-full px-3 py-2.5 rounded-xl bg-slate-900 border border-slate-700 text-sm text-white"
                        />
                      </div>
                    </div>

                    <CraftingGrid3x3Editor
                      pattern={recPattern}
                      onChange={setRecPattern}
                      paletteOptions={allPaletteOptions}
                      title="3×3 Zanaat Alanı (Malzemeleri Slota Koy)"
                    />

                    <button
                      onClick={handleAddCraftingRecipe}
                      className="flex items-center justify-center gap-2 w-full py-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-sm font-bold text-white cursor-pointer"
                    >
                      <Plus className="w-5 h-5" /> 3×3 Tarifi Mod Paketine Ekle ve Kapat
                    </button>
                  </div>
                ) : activeEditor === 'furnace' ? (
                  /* FOCUSED EDITOR: FURNACE SMELTING RECIPE */
                  <div className="p-6 rounded-2xl bg-slate-950/90 border border-slate-800 max-w-3xl space-y-5">
                    <div className="flex items-center justify-between">
                      <div>
                        <h3 className="text-base font-bold text-orange-300 flex items-center gap-2">
                          <Flame className="w-5 h-5" /> Ocak (Fırın) Eritme Tarifi Ekle
                        </h3>
                        <p className="text-xs text-slate-400">
                          Fırına konulan hammaddeyi yeni bir blok veya eşyaya dönüştür.
                        </p>
                      </div>
                      <button
                        onClick={() => setActiveEditor(null)}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-slate-200 cursor-pointer"
                      >
                        <ArrowLeft className="w-3.5 h-3.5" /> Vazgeç / Kapat
                      </button>
                    </div>

                    <div>
                      <label className="block text-xs text-slate-400 mb-1">Tarif Adı</label>
                      <input
                        type="text"
                        value={furName}
                        onChange={(e) => setFurName(e.target.value)}
                        className="w-full px-3 py-2.5 rounded-xl bg-slate-900 border border-slate-700 text-sm text-white"
                      />
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div className="p-4 rounded-xl bg-slate-900 border border-slate-800 space-y-3">
                        <div className="text-xs font-bold text-orange-400">OCAK GİRDİSİ (ERİTİLECEK)</div>
                        <SearchablePaletteSelect
                          value={furInputId}
                          onChange={setFurInputId}
                          options={allPaletteOptions}
                          placeholder="Eritilecek malzeme ara..."
                        />
                        <label className="block text-xs text-slate-400">
                          Girdi Adedi
                          <input
                            type="number"
                            min={1}
                            max={16}
                            value={furInputCount}
                            onChange={(e) => setFurInputCount(Number(e.target.value))}
                            className="mt-1 w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-700 text-xs text-white"
                          />
                        </label>
                      </div>

                      <div className="p-4 rounded-xl bg-slate-900 border border-slate-800 space-y-3">
                        <div className="text-xs font-bold text-emerald-400">OCAK ÇIKTISI (ÜRÜN)</div>
                        <SearchablePaletteSelect
                          value={furOutputId}
                          onChange={setFurOutputId}
                          options={allPaletteOptions}
                          placeholder="Ocak çıktısı ara..."
                        />
                        <label className="block text-xs text-slate-400">
                          Çıktı Adedi
                          <input
                            type="number"
                            min={1}
                            max={64}
                            value={furOutputCount}
                            onChange={(e) => setFurOutputCount(Number(e.target.value))}
                            className="mt-1 w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-700 text-xs text-white"
                          />
                        </label>
                      </div>
                    </div>

                    <button
                      onClick={handleAddFurnaceRecipe}
                      className="flex items-center justify-center gap-2 w-full py-3 rounded-xl bg-orange-600 hover:bg-orange-500 text-sm font-bold text-white cursor-pointer"
                    >
                      <Plus className="w-5 h-5" /> Ocak Tarifini Mod Paketine Ekle ve Kapat
                    </button>
                  </div>
                ) : (
                  /* FOCUSED EDITOR: CUSTOM SLASH COMMAND */
                  <div className="p-6 rounded-2xl bg-slate-950/90 border border-slate-800 max-w-3xl space-y-5">
                    <div className="flex items-center justify-between">
                      <div>
                        <h3 className="text-base font-bold text-violet-300 flex items-center gap-2">
                          <Terminal className="w-5 h-5" /> Özel Sohbet Komutu (/komut) Ekle
                        </h3>
                        <p className="text-xs text-slate-400">
                          Oyuncular sohbetten <code className="text-violet-300">/komutadı</code> yazdığında otomatik çalışır.
                        </p>
                      </div>
                      <button
                        onClick={() => setActiveEditor(null)}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-slate-200 cursor-pointer"
                      >
                        <ArrowLeft className="w-3.5 h-3.5" /> Vazgeç / Kapat
                      </button>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-xs text-slate-400 mb-1">Komut Adı (/ olmadan)</label>
                        <div className="flex items-center rounded-xl bg-slate-900 border border-slate-700 overflow-hidden">
                          <span className="px-3 text-violet-400 font-bold font-mono">/</span>
                          <input
                            type="text"
                            value={cmdTrigger}
                            onChange={(e) => setCmdTrigger(e.target.value)}
                            placeholder="baslangic"
                            className="w-full py-2.5 pr-3 bg-transparent text-sm text-white font-mono focus:outline-none"
                          />
                        </div>
                      </div>
                      <div>
                        <label className="block text-xs text-slate-400 mb-1">Komut Açıklaması</label>
                        <input
                          type="text"
                          value={cmdDesc}
                          onChange={(e) => setCmdDesc(e.target.value)}
                          placeholder="Oyuncuya ne yaptığını anlat"
                          className="w-full px-3 py-2.5 rounded-xl bg-slate-900 border border-slate-700 text-sm text-white"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="block text-xs text-slate-400 mb-1.5">Komut Ne Yapsın?</label>
                      <select
                        value={cmdAction}
                        onChange={(e) => setCmdAction(e.target.value as ModCommandAction)}
                        className="w-full px-3 py-2.5 rounded-xl bg-slate-900 border border-slate-700 text-sm text-white"
                      >
                        <option value="give_item">Envantere Eşya / Blok / Alet Ver</option>
                        <option value="heal">Can ve Açlığı Doldur (+İyileştir)</option>
                        <option value="gamemode">Oyun Modunu Değiştir</option>
                        <option value="time">Dünya Saatini Ayarla</option>
                        <option value="teleport_up">Oyuncuyu Yukarı Işınla (+Y)</option>
                        <option value="broadcast">Sohbete Sistem Duyurusu Gönder</option>
                      </select>
                    </div>

                    <div className="p-4 rounded-xl bg-slate-900 border border-slate-800 space-y-3">
                      {cmdAction === 'give_item' && (
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                          <div className="sm:col-span-2">
                            <label className="block text-xs text-slate-400 mb-1">Verilecek Eşya</label>
                            <SearchablePaletteSelect
                              value={cmdItemId}
                              onChange={setCmdItemId}
                              options={allPaletteOptions}
                              placeholder="Komutla verilecek eşya ara..."
                            />
                          </div>
                          <div>
                            <label className="block text-xs text-slate-400 mb-1">Adet</label>
                            <input
                              type="number"
                              min={1}
                              max={64}
                              value={cmdItemCount}
                              onChange={(e) => setCmdItemCount(Number(e.target.value))}
                              className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-700 text-xs text-white"
                            />
                          </div>
                        </div>
                      )}

                      {cmdAction === 'gamemode' && (
                        <div>
                          <label className="block text-xs text-slate-400 mb-1">Hedef Oyun Modu</label>
                          <select
                            value={cmdGameMode}
                            onChange={(e) => setCmdGameMode(e.target.value as GameMode)}
                            className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-700 text-xs text-white"
                          >
                            <option value="creative">Yaratıcılık Modu</option>
                            <option value="survival">Hayatta Kalma Modu</option>
                          </select>
                        </div>
                      )}

                      {cmdAction === 'time' && (
                        <div>
                          <label className="block text-xs text-slate-400 mb-1">
                            Saat Değeri (0–24000 · Gündüz: 4000, Gece: 18000)
                          </label>
                          <input
                            type="number"
                            min={0}
                            max={24000}
                            step={500}
                            value={cmdTimeVal}
                            onChange={(e) => setCmdTimeVal(Number(e.target.value))}
                            className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-700 text-xs text-white"
                          />
                        </div>
                      )}

                      {cmdAction === 'heal' && (
                        <div>
                          <div className="flex justify-between text-xs text-slate-300 mb-1">
                            <span>Yenilenecek Can & Açlık</span>
                            <span className="font-mono-num text-emerald-300">+{cmdHealAmt}</span>
                          </div>
                          <input
                            type="range"
                            min={2}
                            max={20}
                            value={cmdHealAmt}
                            onChange={(e) => setCmdHealAmt(Number(e.target.value))}
                            className="w-full"
                          />
                        </div>
                      )}

                      {cmdAction === 'teleport_up' && (
                        <div>
                          <div className="flex justify-between text-xs text-slate-300 mb-1">
                            <span>Yukarı Işınlama Yüksekliği</span>
                            <span className="font-mono-num text-sky-300">+{cmdTeleportY} Blok</span>
                          </div>
                          <input
                            type="range"
                            min={5}
                            max={100}
                            step={5}
                            value={cmdTeleportY}
                            onChange={(e) => setCmdTeleportY(Number(e.target.value))}
                            className="w-full"
                          />
                        </div>
                      )}

                      {cmdAction === 'broadcast' && (
                        <div>
                          <label className="block text-xs text-slate-400 mb-1">Yayınlanacak Mesaj</label>
                          <input
                            type="text"
                            value={cmdMsgText}
                            onChange={(e) => setCmdMsgText(e.target.value)}
                            className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-700 text-xs text-white"
                          />
                        </div>
                      )}
                    </div>

                    <button
                      onClick={handleAddCommand}
                      className="flex items-center justify-center gap-2 w-full py-3 rounded-xl bg-violet-600 hover:bg-violet-500 text-sm font-bold text-white cursor-pointer"
                    >
                      <Plus className="w-5 h-5" /> Özel Komutu Mod Paketine Ekle ve Kapat
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}

          {tab === 'installed' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <p className="text-xs text-slate-400">
                  Aktif ettiğin modların özel blokları, eşyaları, 3×3 tarifleri ve /komutları dünyaya anında eklenir.
                </p>
                <label className="flex items-center gap-2 px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-xs font-medium text-slate-200 cursor-pointer">
                  <Upload className="w-3.5 h-3.5" /> JSON Mod İçe Aktar
                  <input type="file" accept=".json" onChange={handleImportJson} className="hidden" />
                </label>
              </div>

              {localMods.length === 0 ? (
                <div className="py-16 text-center border border-dashed border-slate-700 rounded-2xl">
                  <p className="text-sm text-slate-300 mb-3">Henüz yüklü bir modun yok.</p>
                  <button
                    onClick={() => setTab('create')}
                    className="px-5 py-2.5 rounded-xl bg-amber-600 hover:bg-amber-500 text-xs font-semibold text-white cursor-pointer"
                  >
                    Mod Stüdyosunda İlk Modunu Tasarla
                  </button>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {localMods.map((mod) => {
                    const active = enabledModIds.includes(mod.id);
                    const itemLen = mod.items?.length || 0;
                    const recLen = mod.recipes?.length || 0;
                    const cmdLen = mod.commands?.length || 0;
                    return (
                      <div
                        key={mod.id}
                        className={`p-4 rounded-2xl border transition-colors ${
                          active
                            ? 'bg-emerald-950/30 border-emerald-500/50'
                            : 'bg-slate-950/70 border-slate-800'
                        }`}
                      >
                        <div className="flex items-start justify-between gap-2 mb-2">
                          <div className="min-w-0">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <h3 className="font-semibold text-white text-sm">{mod.name}</h3>
                              {mod.isCottonLua && (
                                <span className="px-1.5 py-0.5 rounded bg-violet-500/20 border border-violet-400/40 text-[10px] font-bold text-violet-300">
                                  CottonLua
                                </span>
                              )}
                            </div>
                            <p className="text-xs text-slate-400">
                              {mod.blocks.length} Blok · {itemLen} Eşya · {mod.tools.length} Alet · {recLen} Tarif · {cmdLen} Komut
                            </p>
                            <div className="flex items-center gap-1 mt-1">
                              <span className="text-[10px] font-mono text-sky-300 bg-slate-900 px-1.5 py-0.5 rounded truncate max-w-[180px]">
                                ID: {mod.id}
                              </span>
                              <button
                                onClick={() => {
                                  navigator.clipboard?.writeText(mod.id);
                                  setFeedback(`Mod ID "${mod.id}" kopyalandı!`);
                                }}
                                className="p-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 cursor-pointer"
                                title="Mod ID Kopyala"
                              >
                                <Copy className="w-3 h-3" />
                              </button>
                            </div>
                          </div>
                          <button
                            onClick={() => onToggleMod(mod.id)}
                            className={`px-3 py-1 rounded-lg text-xs font-semibold cursor-pointer shrink-0 ${
                              active
                                ? 'bg-emerald-600 text-white'
                                : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                            }`}
                          >
                            {active ? 'Aktif' : 'Etkinleştir'}
                          </button>
                        </div>
                        <p className="text-xs text-slate-300 mb-3">{mod.description}</p>
                        <div className="flex flex-wrap gap-1.5 mb-3">
                          {mod.blocks.map((b) => (
                            <span
                              key={b.id}
                              className="inline-flex items-center gap-1.5 text-[11px] text-slate-300 bg-slate-800/80 px-2 py-0.5 rounded"
                            >
                              <span className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: b.color }} />
                              {b.name}
                            </span>
                          ))}
                          {(mod.commands || []).map((c) => (
                            <span
                              key={c.id}
                              className="inline-flex items-center text-[11px] font-mono text-violet-300 bg-violet-950/60 border border-violet-500/30 px-2 py-0.5 rounded"
                            >
                              /{c.command}
                            </span>
                          ))}
                        </div>
                        <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-slate-800">
                          {mod.isCottonLua && (
                            <button
                              onClick={() => {
                                setEditingLuaMod(mod);
                                setCreateMode('lua');
                                setTab('create');
                              }}
                              className="flex items-center gap-1 text-xs text-violet-300 hover:text-violet-200 font-semibold cursor-pointer"
                            >
                              <Code2 className="w-3.5 h-3.5" /> Kodda Düzenle
                            </button>
                          )}
                          <button
                            onClick={() => exportModJson(mod)}
                            className="flex items-center gap-1 text-xs text-slate-400 hover:text-white cursor-pointer"
                          >
                            <Download className="w-3.5 h-3.5" /> JSON İndir
                          </button>
                          {user && (mod.authorId === user.uid || mod.authorId === 'local') && (
                            <button
                              onClick={async () => {
                                await publishModToCloud(user, { ...mod, isPublic: true });
                                setFeedback(`"${mod.name}" toplulukla paylaşıldı! ID: ${mod.id}`);
                              }}
                              className="flex items-center gap-1 text-xs text-sky-400 hover:text-sky-300 cursor-pointer"
                            >
                              <Share2 className="w-3.5 h-3.5" /> Paylaş
                            </button>
                          )}
                          <button
                            onClick={() => {
                              onSaveLocalMods(localMods.filter((m) => m.id !== mod.id));
                              if (active) onToggleMod(mod.id);
                            }}
                            className="flex items-center gap-1 text-xs text-rose-400 hover:text-rose-300 cursor-pointer ml-auto"
                          >
                            <Trash2 className="w-3.5 h-3.5" /> Kaldır
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {tab === 'community' && (
            <div className="space-y-6">
              {/* Built-in Official CottonLua APIs (Dependency Mods with Published IDs) */}
              <div className="p-5 rounded-2xl bg-violet-950/20 border border-violet-500/30 space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <h3 className="text-sm font-bold text-violet-200 flex items-center gap-2">
                      <Code2 className="w-4 h-4 text-violet-400" /> Resmi CottonLua API Kütüphanesi (Bağımlılık Modları)
                    </h3>
                    <p className="text-xs text-slate-400 mt-0.5">
                      CottonLua modlarında bağımlılıklar isimle değil <strong>yayınlanmış ID</strong> ile yüklenir:{' '}
                      <code className="text-sky-300">local api = requireMod("api_giresun_sample")</code>
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                  {BUILTIN_COTTON_APIS.map((api) => {
                    const installed = enabledModIds.includes(api.id);
                    const expanded = expandedApiId === api.id;
                    return (
                      <div
                        key={api.id}
                        className="p-4 rounded-xl bg-slate-950/90 border border-slate-800 space-y-2.5"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <div className="flex items-center gap-1.5">
                              <span className="px-1.5 py-0.5 rounded bg-violet-500/20 text-[10px] font-bold text-violet-300">
                                RESMİ API
                              </span>
                              <span className="text-[10px] text-slate-500">v{api.version}</span>
                            </div>
                            <h4 className="text-xs font-bold text-white mt-1 truncate">{api.name}</h4>
                          </div>
                        </div>

                        <div className="flex items-center gap-1.5 bg-slate-900 px-2.5 py-1.5 rounded-lg border border-slate-800">
                          <span className="text-[11px] font-mono text-sky-300 truncate flex-1">
                            ID: {api.id}
                          </span>
                          <button
                            onClick={() => {
                              navigator.clipboard?.writeText(api.id);
                              setFeedback(`API ID "${api.id}" kopyalandı!`);
                            }}
                            className="p-1 rounded bg-slate-800 hover:bg-sky-600 text-slate-300 hover:text-white cursor-pointer"
                            title="Yayınlanmış ID'yi Kopyala"
                          >
                            <Copy className="w-3 h-3" />
                          </button>
                        </div>

                        <p className="text-[11px] text-slate-400 leading-relaxed">{api.description}</p>

                        {expanded && api.luaSource && (
                          <pre className="p-2.5 rounded-lg bg-slate-900 border border-slate-800 text-[10px] font-mono text-emerald-200 overflow-x-auto max-h-44">
                            {api.luaSource}
                          </pre>
                        )}

                        <div className="flex items-center justify-between pt-2 border-t border-slate-800 gap-2">
                          <button
                            onClick={() => handleInstallCommunityMod(api)}
                            className={`flex items-center gap-1 px-3 py-1.5 rounded-lg text-[11px] font-semibold cursor-pointer ${
                              installed
                                ? 'bg-emerald-600/20 border border-emerald-500 text-emerald-300'
                                : 'bg-violet-600 hover:bg-violet-500 text-white'
                            }`}
                          >
                            <Check className="w-3.5 h-3.5" />
                            {installed ? 'Aktif' : 'Etkinleştir'}
                          </button>
                          <button
                            onClick={() => setExpandedApiId(expanded ? null : api.id)}
                            className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-[11px] text-slate-200 cursor-pointer"
                          >
                            <Eye className="w-3.5 h-3.5" /> {expanded ? 'Gizle' : 'Kodu Gör'}
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {!user ? (
                <div className="py-10 text-center border border-dashed border-slate-700 rounded-2xl">
                  <p className="text-sm text-slate-300">
                    Oyuncu modlarını görüntülemek ve indirmek için Google hesabınla giriş yapmalısın.
                  </p>
                </div>
              ) : loadingComm ? (
                <div className="py-12 text-center text-sm text-slate-400">
                  Topluluk modları yükleniyor...
                </div>
              ) : communityMods.length === 0 ? (
                <div className="py-12 text-center border border-dashed border-slate-700 rounded-2xl">
                  <p className="text-sm text-slate-300 mb-3">
                    Henüz toplulukta paylaşılmış bir oyuncu modu yok. İlk modu sen paylaş!
                  </p>
                  <button
                    onClick={() => setTab('create')}
                    className="px-5 py-2.5 rounded-xl bg-sky-600 hover:bg-sky-500 text-xs font-semibold text-white cursor-pointer"
                  >
                    Mod Oluştur &amp; Paylaş
                  </button>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {communityMods.map((mod) => {
                    const installed = enabledModIds.includes(mod.id);
                    const itemLen = mod.items?.length || 0;
                    const recLen = mod.recipes?.length || 0;
                    const cmdLen = mod.commands?.length || 0;
                    return (
                      <div
                        key={mod.id}
                        className="p-4 rounded-2xl bg-slate-950/70 border border-slate-800 space-y-3"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <h3 className="font-semibold text-white text-sm">{mod.name}</h3>
                              {mod.isCottonLua && (
                                <span className="px-1.5 py-0.5 rounded bg-violet-500/20 border border-violet-400/40 text-[10px] font-bold text-violet-300">
                                  CottonLua
                                </span>
                              )}
                            </div>
                            <p className="text-xs text-slate-400">
                              Yapımcı: {mod.authorName} · {mod.blocks.length} Blok · {itemLen} Eşya · {mod.tools.length} Alet · {recLen} Tarif · {cmdLen} Komut
                            </p>
                            <div className="flex items-center gap-1 mt-1">
                              <span className="text-[10px] font-mono text-sky-300 bg-slate-900 px-1.5 py-0.5 rounded truncate max-w-[180px]">
                                ID: {mod.id}
                              </span>
                              <button
                                onClick={() => {
                                  navigator.clipboard?.writeText(mod.id);
                                  setFeedback(`Mod ID "${mod.id}" kopyalandı!`);
                                }}
                                className="p-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 cursor-pointer"
                                title="Mod ID Kopyala"
                              >
                                <Copy className="w-3 h-3" />
                              </button>
                            </div>
                          </div>
                          <button
                            onClick={async () => {
                              await likeCommunityMod(mod.id, mod.likes || 0);
                              setCommunityMods((prev) =>
                                prev.map((m) =>
                                  m.id === mod.id ? { ...m, likes: (m.likes || 0) + 1 } : m,
                                ),
                              );
                            }}
                            className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs text-rose-400 cursor-pointer shrink-0"
                          >
                            <Heart className="w-3.5 h-3.5" /> {mod.likes || 0}
                          </button>
                        </div>
                        <p className="text-xs text-slate-300">{mod.description}</p>
                        <div className="flex flex-wrap gap-1.5">
                          {mod.blocks.map((b) => (
                            <span
                              key={b.id}
                              className="inline-flex items-center gap-1.5 text-[11px] text-slate-300 bg-slate-800/80 px-2 py-0.5 rounded"
                            >
                              <span className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: b.color }} />
                              {b.name}
                            </span>
                          ))}
                          {(mod.commands || []).map((c) => (
                            <span
                              key={c.id}
                              className="inline-flex items-center text-[11px] font-mono text-violet-300 bg-violet-950/60 border border-violet-500/30 px-2 py-0.5 rounded"
                            >
                              /{c.command}
                            </span>
                          ))}
                        </div>
                        <div className="flex items-center justify-between pt-2 border-t border-slate-800">
                          <button
                            onClick={() => handleInstallCommunityMod(mod)}
                            className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-semibold cursor-pointer ${
                              installed
                                ? 'bg-emerald-600/20 border border-emerald-500 text-emerald-300'
                                : 'bg-sky-600 hover:bg-sky-500 text-white'
                            }`}
                          >
                            <Download className="w-3.5 h-3.5" />
                            {installed ? 'Kurulu ve Aktif' : 'İndir & Etkinleştir'}
                          </button>
                          {mod.authorId === user.uid && (
                            <button
                              onClick={async () => {
                                await deleteCommunityMod(mod.id);
                                setCommunityMods((prev) => prev.filter((m) => m.id !== mod.id));
                              }}
                              className="text-xs text-rose-400 hover:text-rose-300 cursor-pointer"
                            >
                              Buluttan Sil
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
