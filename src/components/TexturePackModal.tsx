import {
  Check,
  Copy,
  Download,
  Eraser,
  Image as ImageIcon,
  Layers,
  Link2,
  PaintBucket,
  Paintbrush,
  Pipette,
  Plus,
  RotateCcw,
  Search,
  Trash2,
  Upload,
  Wand2,
  X,
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { getPlaceableBlocks } from '../data/blocksAndRecipes';
import { BUILTIN_TEXTURE_PACKS } from '../data/texturePacks';
import {
  ALL_CUBE_FACES,
  CUBE_FACE_META,
  generatePresetPatternPixels,
  getItemIconUrl,
  hashStringSeed,
  resolveOverrideFaceString,
} from '../engine/textures';
import {
  BlockCategory,
  CubeFaceKey,
  ItemDef,
  TexturePackBlockOverride,
  TexturePackDef,
  TexturePackPaletteOverrides,
} from '../types/game';
import { LiveCubePreview3D } from './LiveCubePreview3D';

interface TexturePackModalProps {
  customPacks: TexturePackDef[];
  activePackId: string;
  onSelectPack: (pack: TexturePackDef) => void;
  onSaveCustomPacks: (packs: TexturePackDef[]) => void;
  onClose: () => void;
}

const PALETTE_SWATCHES = [
  '#f8fafc', '#cbd5e1', '#7d838a', '#4c5158', '#1e293b', '#0f172a',
  '#4da83b', '#22c55e', '#10b981', '#06b6d4', '#2563eb', '#6366f1',
  '#ef4444', '#f97316', '#facc15', '#a36b3e', '#79553a', '#ec4899',
];

const GLOBAL_THEME_FIELDS: { key: keyof TexturePackPaletteOverrides; label: string; def: string }[] = [
  { key: 'grassTop', label: 'Çimen Üstü', def: '#4da83b' },
  { key: 'dirt', label: 'Toprak', def: '#79553a' },
  { key: 'stone', label: 'Taş & Cevher Zemin', def: '#7d838a' },
  { key: 'deepslate', label: 'Derin Kayaç (Deepslate)', def: '#3b4252' },
  { key: 'cobblestone', label: 'Kırıktaş', def: '#727880' },
  { key: 'wood', label: 'Ahşap Tahta', def: '#b78952' },
  { key: 'leaves', label: 'Yapraklar', def: '#2e7d32' },
  { key: 'water', label: 'Su Rengi', def: '#2563eb' },
  { key: 'brick', label: 'Tuğla', def: '#b44637' },
  { key: 'sand', label: 'Kum', def: '#e0cf93' },
];

const BLOCK_CATEGORIES: { id: 'all' | BlockCategory; label: string }[] = [
  { id: 'all', label: 'Tümü' },
  { id: 'natural', label: 'Doğal & Bitki' },
  { id: 'wood', label: 'Ağaç & Yaprak' },
  { id: 'ore', label: 'Maden & Cevher' },
  { id: 'building', label: 'İnşaat & Taş' },
  { id: 'glass', label: 'Cam & Işık' },
  { id: 'utility', label: 'Araç & Masa' },
  { id: 'mod', label: 'Modlar' },
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

function defaultFacePixelsForBlock(block: ItemDef, face: CubeFaceKey): string[] {
  const modFaceStr = block.faceTextures?.[face] || block.customTexture;
  if (modFaceStr) {
    const arr = modFaceStr.split(',');
    if (arr.length === 256) return arr;
  }
  return generatePresetPatternPixels(
    block.pattern,
    face === 'top' && block.topColor ? block.topColor : block.color,
    block.secondaryColor || '#475569',
    face,
    hashStringSeed(block.id),
    block.id,
  );
}

/**
 * Deduplicates 6 face pixel strings into minimal unique slots (`textures` + `faceMap`)
 * so identical faces are stored and counted as ONE texture.
 */
function compactFacesToOverride(
  faceMapPixels: Record<CubeFaceKey, string>,
  explicitGroups?: Partial<Record<CubeFaceKey, string>>,
): TexturePackBlockOverride {
  const textures: Record<string, string> = {};
  const faceMap: Partial<Record<CubeFaceKey, string>> = {};
  const valueToSlot = new Map<string, string>();
  let nextSlot = 1;

  for (const face of ALL_CUBE_FACES) {
    const pxStr = faceMapPixels[face];
    const requestedGroup = explicitGroups?.[face];
    // Deduplicate identical pixel data to a single texture entry
    const dedupeKey = requestedGroup ? `${requestedGroup}::${pxStr}` : pxStr;
    // Wait: if two faces have the exact same pixels, collapse them to ONE texture slot!
    let slotId = valueToSlot.get(pxStr) ?? valueToSlot.get(dedupeKey);
    if (!slotId) {
      slotId = `tex_${nextSlot++}`;
      textures[slotId] = pxStr;
      valueToSlot.set(pxStr, slotId);
      valueToSlot.set(dedupeKey, slotId);
    }
    faceMap[face] = slotId;
  }

  return { textures, faceMap };
}

function countUniqueTexturesInOverride(ov: TexturePackBlockOverride): number {
  if (ov.textures && Object.keys(ov.textures).length > 0) {
    return Object.keys(ov.textures).length;
  }
  const unique = new Set<string>();
  for (const face of ALL_CUBE_FACES) {
    const str = resolveOverrideFaceString(ov, face);
    if (str) unique.add(str);
  }
  return Math.max(1, unique.size);
}

function getPackUniqueTextureCount(pack: TexturePackDef): number {
  return Object.values(pack.blockOverrides || {}).reduce(
    (sum, ov) => sum + countUniqueTexturesInOverride(ov),
    0,
  );
}

export function TexturePackModal({
  customPacks,
  activePackId,
  onSelectPack,
  onSaveCustomPacks,
  onClose,
}: TexturePackModalProps) {
  const [tab, setTab] = useState<'library' | 'editor'>('library');
  const [feedback, setFeedback] = useState('');

  // Pack Editor State
  const [editingId, setEditingId] = useState<string | null>(null);
  const [packName, setPackName] = useState('Özel Doku Paketim');
  const [packDesc, setPackDesc] = useState('Kişisel piksel dokuları ve özel renk teması.');
  const [palette, setPalette] = useState<TexturePackPaletteOverrides>({
    contrast: 1.0,
    brightness: 0,
  });
  const [blockOverrides, setBlockOverrides] = useState<Record<string, TexturePackBlockOverride>>({});

  // Per-block 6-face 16x16 pixel editor state inside Texture Pack Editor
  const editableBlocks = useMemo(() => getPlaceableBlocks(), []);
  const [blockCategory, setBlockCategory] = useState<'all' | BlockCategory>('all');
  const [blockSearch, setBlockSearch] = useState('');
  const [selectedBlockId, setSelectedBlockId] = useState('grass');
  const [selectedFace, setSelectedFace] = useState<CubeFaceKey>('front');
  const [paintColor, setPaintColor] = useState('#4da83b');
  const [paintTool, setPaintTool] = useState<'brush' | 'bucket' | 'replace' | 'eyedropper' | 'eraser'>('brush');
  const [isPainting, setIsPainting] = useState(false);

  const filteredEditableBlocks = useMemo(() => {
    const q = blockSearch.trim().toLowerCase();
    return editableBlocks.filter((b) => {
      if (blockCategory !== 'all' && b.category !== blockCategory) return false;
      if (q && !b.name.toLowerCase().includes(q) && !b.id.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [editableBlocks, blockCategory, blockSearch]);

  const selectedBlock = useMemo(
    () => editableBlocks.find((b) => b.id === selectedBlockId) || editableBlocks[0],
    [editableBlocks, selectedBlockId],
  );

  // Resolve all 6 faces for the currently selected block + group badges (D1, D2...)
  const resolvedBlockView = useMemo(() => {
    const ov = blockOverrides[selectedBlockId];
    const facePixels: Record<CubeFaceKey, string[]> = {
      right: [],
      left: [],
      front: [],
      back: [],
      top: [],
      bottom: [],
    };
    const faceSlotLabel: Record<CubeFaceKey, string> = {
      right: 'D1',
      left: 'D1',
      front: 'D1',
      back: 'D1',
      top: 'D1',
      bottom: 'D1',
    };
    const slotKeyToBadge = new Map<string, string>();
    let badgeNum = 1;

    for (const face of ALL_CUBE_FACES) {
      const ovStr = resolveOverrideFaceString(ov, face, selectedBlockId);
      let arr: string[];
      if (ovStr && ovStr.split(',').length === 256) {
        arr = ovStr.split(',');
      } else if (selectedBlock) {
        arr = defaultFacePixelsForBlock(selectedBlock, face);
      } else {
        arr = new Array(256).fill('#7d838a');
      }
      facePixels[face] = arr;

      // Group identical textures under the same single texture badge (D1, D2, ...)
      const explicitSlot = ov?.faceMap?.[face];
      const groupKey = explicitSlot && ov?.textures?.[explicitSlot]
        ? `${explicitSlot}:${arr.join(',')}`
        : arr.join(',');
      let badge = slotKeyToBadge.get(groupKey);
      if (!badge) {
        badge = `D${badgeNum++}`;
        slotKeyToBadge.set(groupKey, badge);
      }
      faceSlotLabel[face] = badge;
    }

    const activeBadge = faceSlotLabel[selectedFace];
    const sharedWithActive = ALL_CUBE_FACES.filter((f) => faceSlotLabel[f] === activeBadge);

    return {
      facePixels,
      faceSlotLabel,
      uniqueCount: slotKeyToBadge.size,
      activeBadge,
      sharedWithActive,
    };
  }, [blockOverrides, selectedBlockId, selectedFace, selectedBlock]);

  const currentFacePixels = resolvedBlockView.facePixels[selectedFace];

  useEffect(() => {
    const stop = () => setIsPainting(false);
    window.addEventListener('mouseup', stop);
    return () => window.removeEventListener('mouseup', stop);
  }, []);

  /**
   * Updates the active face AND all faces sharing the same single texture slot,
   * then stores a deduplicated `textures` + `faceMap` override.
   */
  const updateActiveTexturePixels = (nextPixels: string[]) => {
    const targets = resolvedBlockView.sharedWithActive;
    const faceStrings: Record<CubeFaceKey, string> = {
      right: resolvedBlockView.facePixels.right.join(','),
      left: resolvedBlockView.facePixels.left.join(','),
      front: resolvedBlockView.facePixels.front.join(','),
      back: resolvedBlockView.facePixels.back.join(','),
      top: resolvedBlockView.facePixels.top.join(','),
      bottom: resolvedBlockView.facePixels.bottom.join(','),
    };
    const nextStr = nextPixels.join(',');
    targets.forEach((f) => {
      faceStrings[f] = nextStr;
    });

    const compacted = compactFacesToOverride(faceStrings);
    setBlockOverrides((prev) => ({
      ...prev,
      [selectedBlockId]: compacted,
    }));
  };

  /**
   * Link or unlink a face with the active face's single texture.
   */
  const toggleShareFaceWithActive = (targetFace: CubeFaceKey) => {
    if (targetFace === selectedFace) return;
    const isCurrentlyShared = resolvedBlockView.sharedWithActive.includes(targetFace);
    const faceStrings: Record<CubeFaceKey, string> = {
      right: resolvedBlockView.facePixels.right.join(','),
      left: resolvedBlockView.facePixels.left.join(','),
      front: resolvedBlockView.facePixels.front.join(','),
      back: resolvedBlockView.facePixels.back.join(','),
      top: resolvedBlockView.facePixels.top.join(','),
      bottom: resolvedBlockView.facePixels.bottom.join(','),
    };

    if (isCurrentlyShared) {
      // Unlink: restore target face to its default (or nudge one hidden variance if identical to default so it separates cleanly, or simply tell user if identical)
      if (selectedBlock) {
        const defStr = defaultFacePixelsForBlock(selectedBlock, targetFace).join(',');
        if (defStr !== faceStrings[selectedFace]) {
          faceStrings[targetFace] = defStr;
          setBlockOverrides((prev) => ({
            ...prev,
            [selectedBlockId]: compactFacesToOverride(faceStrings),
          }));
          setFeedback(`${CUBE_FACE_META.find((m) => m.key === targetFace)?.label} yüzü gruptan ayrıldı.`);
          return;
        }
      }
      // Make a tiny 1-pixel subtle tint or switch focus so the user can edit it independently without changing appearance immediately
      setSelectedFace(targetFace);
      setFeedback('Bu yüzü ayırmak için doğrudan üzerine yeni piksel çizebilirsin.');
      return;
    }

    // Link targetFace onto active face's single texture!
    faceStrings[targetFace] = faceStrings[selectedFace];
    setBlockOverrides((prev) => ({
      ...prev,
      [selectedBlockId]: compactFacesToOverride(faceStrings),
    }));
  };

  const applyQuickGrouping = (mode: 'all_one' | 'sides_top_bottom' | 'sides_plus_caps') => {
    const faceStrings: Record<CubeFaceKey, string> = {
      right: resolvedBlockView.facePixels.right.join(','),
      left: resolvedBlockView.facePixels.left.join(','),
      front: resolvedBlockView.facePixels.front.join(','),
      back: resolvedBlockView.facePixels.back.join(','),
      top: resolvedBlockView.facePixels.top.join(','),
      bottom: resolvedBlockView.facePixels.bottom.join(','),
    };
    const activeStr = faceStrings[selectedFace];

    if (mode === 'all_one') {
      ALL_CUBE_FACES.forEach((f) => {
        faceStrings[f] = activeStr;
      });
    } else if (mode === 'sides_top_bottom') {
      const sideSrc = faceStrings.front;
      (['right', 'left', 'front', 'back'] as CubeFaceKey[]).forEach((f) => {
        faceStrings[f] = sideSrc;
      });
    } else {
      const sideSrc = faceStrings.front;
      (['right', 'left', 'front', 'back'] as CubeFaceKey[]).forEach((f) => {
        faceStrings[f] = sideSrc;
      });
      faceStrings.bottom = faceStrings.top;
    }

    setBlockOverrides((prev) => ({
      ...prev,
      [selectedBlockId]: compactFacesToOverride(faceStrings),
    }));
  };

  const applyPaintAt = (idx: number) => {
    if (paintTool === 'eyedropper') {
      const picked = currentFacePixels[idx];
      if (picked && picked !== 'transparent' && picked !== 'rgba_glass') {
        setPaintColor(picked);
        setPaintTool('brush');
      }
      return;
    }
    if (paintTool === 'replace') {
      const target = currentFacePixels[idx];
      if (!target) return;
      const targetNorm = target.toLowerCase();
      const nextNorm = paintColor.toLowerCase();
      if (targetNorm === nextNorm) return;
      let replacedCount = 0;
      const next = currentFacePixels.map((px) => {
        if (px.toLowerCase() === targetNorm) {
          replacedCount++;
          return paintColor;
        }
        return px;
      });
      if (replacedCount > 0) {
        updateActiveTexturePixels(next);
        setFeedback(`Dokudaki aynı renkteki ${replacedCount} piksel seçili renkle değiştirildi!`);
      }
      return;
    }
    if (paintTool === 'bucket') {
      const target = currentFacePixels[idx];
      if (target === paintColor) return;
      const next = [...currentFacePixels];
      const stack = [idx];
      const seen = new Set<number>();
      while (stack.length > 0) {
        const cur = stack.pop()!;
        if (seen.has(cur) || next[cur] !== target) continue;
        seen.add(cur);
        next[cur] = paintColor;
        const x = cur % 16;
        const y = Math.floor(cur / 16);
        if (x > 0) stack.push(cur - 1);
        if (x < 15) stack.push(cur + 1);
        if (y > 0) stack.push(cur - 16);
        if (y < 15) stack.push(cur + 16);
      }
      updateActiveTexturePixels(next);
      return;
    }

    const supportsTransparency = Boolean(
      selectedBlock?.transparent ||
        selectedBlock?.pattern === 'foliage_cross' ||
        selectedBlock?.pattern === 'bamboo' ||
        selectedBlock?.pattern === 'lantern' ||
        selectedBlock?.pattern === 'leaves' ||
        selectedBlock?.pattern === 'torch',
    );
    const next = [...currentFacePixels];
    next[idx] =
      paintTool === 'eraser'
        ? supportsTransparency
          ? 'transparent'
          : selectedBlock?.color || '#7d838a'
        : paintColor;
    updateActiveTexturePixels(next);
  };

  const handleUploadImageForBlock = (e: React.ChangeEvent<HTMLInputElement>) => {
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
            const hex =
              '#' +
              [r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('');
            arr.push(hex);
          }
        }
        updateActiveTexturePixels(arr);
        setFeedback(
          `${selectedBlock?.name || selectedBlockId} (${resolvedBlockView.sharedWithActive.length} paylaşımlı yüz) dokusu 16×16 olarak güncellendi!`,
        );
      };
      img.src = String(reader.result);
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const startCloneToEditor = (pack: TexturePackDef, asEdit = false) => {
    setEditingId(asEdit && !pack.builtIn ? pack.id : null);
    setPackName(asEdit && !pack.builtIn ? pack.name : `${pack.name} (Kopya)`);
    setPackDesc(pack.description);
    setPalette({ ...(pack.palette || { contrast: 1.0, brightness: 0 }) });
    setBlockOverrides(JSON.parse(JSON.stringify(pack.blockOverrides || {})));
    setTab('editor');
  };

  const handleSaveAndApplyPack = () => {
    if (!packName.trim()) {
      setFeedback('Lütfen doku paketine bir ad ver.');
      return;
    }
    const id = editingId || `tpack_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const previewColors: [string, string, string, string] = [
      palette.grassTop || '#4da83b',
      palette.stone || '#7d838a',
      palette.wood || '#b78952',
      palette.water || '#2563eb',
    ];
    const saved: TexturePackDef = {
      id,
      name: packName.trim().slice(0, 48),
      description: packDesc.trim().slice(0, 200),
      author: 'Özel Paket',
      builtIn: false,
      previewColors,
      palette,
      blockOverrides,
    };
    const nextList = [saved, ...customPacks.filter((p) => p.id !== id)];
    onSaveCustomPacks(nextList);
    onSelectPack(saved);
    setFeedback(`"${saved.name}" kaydedildi ve dünyaya uygulandı!`);
    setTab('library');
  };

  const handleExportPackJson = (pack: TexturePackDef) => {
    const blob = new Blob([JSON.stringify(pack, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${pack.name.replace(/\s+/g, '_').toLowerCase()}.blokpack.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleImportPackJson = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(String(reader.result)) as TexturePackDef;
        if (!parsed.name || typeof parsed.blockOverrides !== 'object') {
          setFeedback('Geçersiz doku paketi JSON dosyası.');
          return;
        }
        const imported: TexturePackDef = {
          ...parsed,
          id: `tpack_imp_${Date.now()}`,
          builtIn: false,
          previewColors: parsed.previewColors || ['#4da83b', '#7d838a', '#b78952', '#2563eb'],
        };
        onSaveCustomPacks([imported, ...customPacks]);
        onSelectPack(imported);
        setFeedback(`"${imported.name}" içe aktarıldı ve etkinleştirildi!`);
      } catch {
        setFeedback('JSON doku paketi okunamadı.');
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const allPacks = [...BUILTIN_TEXTURE_PACKS, ...customPacks];
  const overriddenCount = Object.keys(blockOverrides).length;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/90 p-2 sm:p-4">
      <div className="w-[96vw] max-w-[1440px] h-[94vh] bg-slate-900 border border-slate-700/80 rounded-2xl shadow-2xl flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex flex-wrap items-center justify-between gap-4 px-6 py-3.5 border-b border-slate-800 bg-slate-950/50">
          <div className="flex items-center gap-3.5">
            <div className="w-10 h-10 rounded-xl bg-emerald-500/15 border border-emerald-500/40 flex items-center justify-center">
              <Layers className="w-5 h-5 text-emerald-400" />
            </div>
            <div>
              <h2 className="font-display text-lg sm:text-xl font-bold text-white">
                Doku Paketleri (6 Yüzlü Resource Pack Stüdyosu)
              </h2>
              <p className="text-xs text-slate-400">
                Sağ, Sol, Ön, Arka, Üst ve Alt yüzleri ayrı tasarla veya aynı yüzleri tek doku altında birleştir
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setTab('library')}
              className={`px-4 py-2 rounded-xl text-xs font-semibold cursor-pointer ${
                tab === 'library'
                  ? 'bg-emerald-600 text-white'
                  : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
              }`}
            >
              Paket Kütüphanesi ({allPacks.length})
            </button>
            <button
              onClick={() => {
                setEditingId(null);
                setPackName('Yeni Doku Paketim');
                setPackDesc('Özel blok renkleri ve 6 yüzlü 16×16 dokular.');
                setPalette({ contrast: 1.0, brightness: 0 });
                setBlockOverrides({});
                setTab('editor');
              }}
              className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold cursor-pointer ${
                tab === 'editor'
                  ? 'bg-sky-600 text-white'
                  : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
              }`}
            >
              <Plus className="w-4 h-4" /> Yeni Paket Oluştur
            </button>
            <button
              onClick={onClose}
              className="ml-2 p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {feedback && (
          <div className="mx-6 mt-3 px-4 py-2 rounded-xl bg-emerald-500/15 border border-emerald-500/40 text-xs text-emerald-300 flex items-center justify-between">
            <span>{feedback}</span>
            <button onClick={() => setFeedback('')} className="cursor-pointer">
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        <div className="flex-1 overflow-y-auto p-5 sm:p-6">
          {tab === 'library' ? (
            <div className="space-y-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="text-xs text-slate-400">
                  Aynı dokuyu paylaşan yüzler otomatik olarak tek doku olarak sayılır ve bellekte tek kopya saklanır.
                </p>
                <label className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-xs font-semibold text-slate-200 cursor-pointer">
                  <Upload className="w-4 h-4 text-sky-400" /> JSON Doku Paketi İçe Aktar
                  <input type="file" accept=".json" onChange={handleImportPackJson} className="hidden" />
                </label>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {allPacks.map((pack) => {
                  const active = activePackId === pack.id;
                  const ovCount = Object.keys(pack.blockOverrides || {}).length;
                  const uniqueTexCount = getPackUniqueTextureCount(pack);
                  return (
                    <div
                      key={pack.id}
                      className={`p-4 rounded-2xl border flex flex-col justify-between gap-4 transition-colors ${
                        active
                          ? 'bg-emerald-950/35 border-emerald-500'
                          : 'bg-slate-950/75 border-slate-800 hover:border-slate-700'
                      }`}
                    >
                      <div className="space-y-3">
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <h3 className="font-bold text-white text-sm">{pack.name}</h3>
                            <p className="text-[11px] text-slate-400">
                              {pack.builtIn ? 'Resmi Paket' : 'Özel Paket'} · {pack.author}
                              {ovCount > 0 ? ` · ${ovCount} Blok (${uniqueTexCount} Tekil Doku)` : ''}
                            </p>
                          </div>
                          {active && (
                            <span className="px-2 py-0.5 rounded bg-emerald-500/20 border border-emerald-500/50 text-[10px] font-bold text-emerald-300">
                              AKTİF
                            </span>
                          )}
                        </div>

                        <div className="grid grid-cols-4 gap-1.5 h-8 rounded-lg overflow-hidden border border-white/10">
                          {pack.previewColors.map((col, idx) => (
                            <div key={idx} style={{ backgroundColor: col }} />
                          ))}
                        </div>

                        <p className="text-xs text-slate-300 leading-relaxed">{pack.description}</p>
                      </div>

                      <div className="space-y-2 pt-2 border-t border-slate-800/80">
                        <button
                          onClick={() => {
                            onSelectPack(pack);
                            setFeedback(`"${pack.name}" doku paketi etkinleştirildi!`);
                          }}
                          className={`w-full flex items-center justify-center gap-1.5 py-2 rounded-xl text-xs font-bold cursor-pointer ${
                            active
                              ? 'bg-emerald-600 text-white'
                              : 'bg-slate-800 hover:bg-emerald-600 text-slate-200 hover:text-white'
                          }`}
                        >
                          <Check className="w-4 h-4" /> {active ? 'Şu An Kullanılıyor' : 'Paketi Uygula'}
                        </button>

                        <div className="flex items-center justify-between text-xs pt-1">
                          <button
                            onClick={() => startCloneToEditor(pack, !pack.builtIn)}
                            className="flex items-center gap-1 text-sky-400 hover:text-sky-300 cursor-pointer"
                          >
                            <Copy className="w-3.5 h-3.5" /> {pack.builtIn ? 'Kopyala & Düzenle' : 'Düzenle'}
                          </button>

                          <button
                            onClick={() => handleExportPackJson(pack)}
                            className="flex items-center gap-1 text-slate-400 hover:text-white cursor-pointer"
                          >
                            <Download className="w-3.5 h-3.5" /> İndir
                          </button>

                          {!pack.builtIn && (
                            <button
                              onClick={() => {
                                const remaining = customPacks.filter((p) => p.id !== pack.id);
                                onSaveCustomPacks(remaining);
                                if (activePackId === pack.id) {
                                  onSelectPack(BUILTIN_TEXTURE_PACKS[0]);
                                }
                              }}
                              className="flex items-center gap-1 text-rose-400 hover:text-rose-300 cursor-pointer"
                            >
                              <Trash2 className="w-3.5 h-3.5" /> Sil
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : (
            /* TEXTURE PACK STUDIO EDITOR */
            <div className="grid grid-cols-1 xl:grid-cols-12 gap-6">
              {/* LEFT: Global Palette & Contrast Settings (4 cols) */}
              <div className="xl:col-span-4 space-y-4">
                <div className="p-4 rounded-2xl bg-slate-950/90 border border-slate-800 space-y-3">
                  <div className="text-xs font-bold tracking-wider text-emerald-400">
                    1. PAKET BİLGİLERİ & GENEL RENK TEMASI
                  </div>
                  <input
                    type="text"
                    value={packName}
                    onChange={(e) => setPackName(e.target.value)}
                    placeholder="Doku Paketi Adı"
                    className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-slate-700 text-sm text-white"
                  />
                  <textarea
                    rows={2}
                    value={packDesc}
                    onChange={(e) => setPackDesc(e.target.value)}
                    placeholder="Paket açıklaması..."
                    className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-slate-700 text-xs text-white"
                  />

                  <div className="grid grid-cols-2 gap-3 pt-1">
                    <div>
                      <div className="flex justify-between text-xs text-slate-300 mb-1">
                        <span>Kontrast</span>
                        <span className="font-mono-num">{(palette.contrast ?? 1).toFixed(2)}x</span>
                      </div>
                      <input
                        type="range"
                        min={0.65}
                        max={1.45}
                        step={0.05}
                        value={palette.contrast ?? 1}
                        onChange={(e) =>
                          setPalette((p) => ({ ...p, contrast: Number(e.target.value) }))
                        }
                        className="w-full"
                      />
                    </div>
                    <div>
                      <div className="flex justify-between text-xs text-slate-300 mb-1">
                        <span>Parlaklık</span>
                        <span className="font-mono-num">{palette.brightness ?? 0}</span>
                      </div>
                      <input
                        type="range"
                        min={-30}
                        max={30}
                        step={2}
                        value={palette.brightness ?? 0}
                        onChange={(e) =>
                          setPalette((p) => ({ ...p, brightness: Number(e.target.value) }))
                        }
                        className="w-full"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 pt-2">
                    {GLOBAL_THEME_FIELDS.map((f) => {
                      const val = (palette[f.key] as string) || f.def;
                      return (
                        <label
                          key={f.key}
                          className="flex items-center gap-2 p-2 rounded-xl bg-slate-900 border border-slate-800 text-[11px] text-slate-200 cursor-pointer"
                        >
                          <input
                            type="color"
                            value={val}
                            onChange={(e) =>
                              setPalette((p) => ({ ...p, [f.key]: e.target.value }))
                            }
                            className="w-6 h-6 rounded bg-transparent cursor-pointer shrink-0"
                          />
                          <span className="truncate">{f.label}</span>
                        </label>
                      );
                    })}
                  </div>
                </div>

                <div className="p-4 rounded-2xl bg-slate-950/90 border border-slate-800 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-200">
                      ÖZELLEŞTİRİLEN BLOKLAR ({overriddenCount})
                    </span>
                    {overriddenCount > 0 && (
                      <button
                        onClick={() => setBlockOverrides({})}
                        className="text-[11px] text-rose-400 hover:text-rose-300 cursor-pointer"
                      >
                        Tümünü Sıfırla
                      </button>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-1.5 max-h-28 overflow-y-auto">
                    {overriddenCount === 0 ? (
                      <span className="text-xs text-slate-500">
                        Sağdan bir blok seçip 6 yüzünü boyayabilir veya aynı yüzleri tek doku olarak bağlayabilirsin.
                      </span>
                    ) : (
                      Object.entries(blockOverrides).map(([bid, ov]) => {
                        const b = editableBlocks.find((x) => x.id === bid);
                        const uCount = countUniqueTexturesInOverride(ov);
                        return (
                          <button
                            key={bid}
                            onClick={() => setSelectedBlockId(bid)}
                            className="px-2.5 py-1 rounded-lg bg-sky-500/15 border border-sky-500/40 text-[11px] text-sky-300 cursor-pointer"
                          >
                            {b?.name || bid} ({uCount} doku)
                          </button>
                        );
                      })
                    )}
                  </div>

                  <button
                    onClick={handleSaveAndApplyPack}
                    className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-sm font-bold text-white cursor-pointer"
                  >
                    <Check className="w-4 h-4" /> Paketi Kaydet & Dünyaya Uygula
                  </button>
                </div>
              </div>

              {/* RIGHT: Per-Block 6-Face 16x16 Texture Painter & Shared Slot Manager (8 cols) */}
              <div className="xl:col-span-8 p-5 rounded-2xl bg-slate-950/90 border border-slate-800 space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h3 className="text-sm font-bold text-white">
                      2. Blok Dokusu Özelleştirici (Sağ · Sol · Ön · Arka · Üst · Alt)
                    </h3>
                    <p className="text-[11px] text-slate-400">
                      Aynı dokuyu paylaşan yüzler tek doku sayılır — değiştirdiğinde bağlı tüm yüzler birlikte güncellenir
                    </p>
                  </div>

                  <label className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-sky-600 hover:bg-sky-500 text-xs font-semibold text-white cursor-pointer">
                    <ImageIcon className="w-4 h-4" /> PNG / JPG Doku Yükle
                    <input
                      type="file"
                      accept="image/*"
                      onChange={handleUploadImageForBlock}
                      className="hidden"
                    />
                  </label>
                </div>

                {/* Searchable & Categorized Block Browser (100+ Blocks) */}
                <div className="p-3 rounded-xl bg-slate-900/80 border border-slate-800 space-y-2.5">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="relative flex-1 min-w-[200px]">
                      <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                      <input
                        type="text"
                        value={blockSearch}
                        onChange={(e) => setBlockSearch(e.target.value)}
                        placeholder={`Blok ara (${editableBlocks.length} blok mevcut: kiraz, deepslate, bakır, fener...)`}
                        className="w-full pl-8 pr-3 py-1.5 rounded-lg bg-slate-950 border border-slate-700 text-xs text-white focus:outline-none focus:border-emerald-500"
                      />
                    </div>
                    <div className="px-3 py-1.5 rounded-lg bg-emerald-950/50 border border-emerald-500/35 text-xs flex items-center gap-2">
                      <span className="text-slate-300">Seçili:</span>
                      <strong className="text-white">{selectedBlock?.name}</strong>
                      <span className="font-bold text-emerald-300 font-mono-num">
                        · {resolvedBlockView.uniqueCount}/6 Doku
                      </span>
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-1">
                    {BLOCK_CATEGORIES.map((cat) => (
                      <button
                        key={cat.id}
                        type="button"
                        onClick={() => setBlockCategory(cat.id)}
                        className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold cursor-pointer transition-colors ${
                          blockCategory === cat.id
                            ? 'bg-emerald-600 text-white'
                            : 'bg-slate-950 text-slate-400 hover:text-white border border-slate-800'
                        }`}
                      >
                        {cat.label}
                      </button>
                    ))}
                  </div>

                  <div className="grid grid-cols-5 sm:grid-cols-8 md:grid-cols-10 gap-1.5 max-h-36 overflow-y-auto p-1 rounded-lg bg-slate-950/80 border border-slate-800/80">
                    {filteredEditableBlocks.map((b) => {
                      const active = b.id === selectedBlockId;
                      const customized = Boolean(blockOverrides[b.id]);
                      return (
                        <button
                          key={b.id}
                          type="button"
                          onClick={() => setSelectedBlockId(b.id)}
                          title={`${b.name} (${b.id})`}
                          className={`relative p-1.5 rounded-lg border flex flex-col items-center gap-1 cursor-pointer transition-colors ${
                            active
                              ? 'bg-emerald-600/30 border-emerald-400 text-white'
                              : customized
                                ? 'bg-sky-950/40 border-sky-500/45 text-sky-200 hover:border-sky-400'
                                : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-white hover:border-slate-600'
                          }`}
                        >
                          {customized && (
                            <span className="absolute top-1 right-1 w-1.5 h-1.5 rounded-full bg-sky-400" />
                          )}
                          <img
                            src={getItemIconUrl(b.id)}
                            alt={b.name}
                            className="w-7 h-7 pixelated shrink-0"
                          />
                          <span className="text-[9px] leading-tight truncate w-full text-center">
                            {b.name}
                          </span>
                        </button>
                      );
                    })}
                    {filteredEditableBlocks.length === 0 && (
                      <div className="col-span-full py-4 text-center text-xs text-slate-500">
                        Aramanla eşleşen blok bulunamadı.
                      </div>
                    )}
                  </div>
                </div>

                {/* 6 Face Selector Tabs with Mini Thumbnails & Slot Badges */}
                <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
                  {CUBE_FACE_META.map((fm) => {
                    const active = selectedFace === fm.key;
                    const badge = resolvedBlockView.faceSlotLabel[fm.key];
                    const shared = resolvedBlockView.sharedWithActive.includes(fm.key);
                    const thumb = pixelsToDataUrl(
                      resolvedBlockView.facePixels[fm.key],
                      selectedBlock?.color || '#7d838a',
                    );
                    return (
                      <button
                        key={fm.key}
                        onClick={() => setSelectedFace(fm.key)}
                        className={`flex items-center gap-2 p-2 rounded-xl border text-left cursor-pointer transition-colors ${
                          active
                            ? 'bg-emerald-600/25 border-emerald-400 text-white'
                            : shared
                              ? 'bg-slate-900 border-emerald-500/40 text-slate-200'
                              : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-white'
                        }`}
                      >
                        <img
                          src={thumb}
                          alt={fm.label}
                          className="w-7 h-7 rounded border border-white/15 pixelated shrink-0"
                        />
                        <div className="min-w-0">
                          <div className="text-xs font-bold leading-tight">{fm.label}</div>
                          <div className="text-[10px] text-emerald-300 font-mono-num">{badge}</div>
                        </div>
                      </button>
                    );
                  })}
                </div>

                {/* Shared Texture Group Manager ("Tek Doku Sayma") */}
                <div className="p-3 rounded-xl bg-slate-900/80 border border-slate-800 space-y-2">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5 text-xs text-slate-200">
                      <Link2 className="w-4 h-4 text-emerald-400" />
                      <span>
                        <strong className="text-emerald-300">{resolvedBlockView.activeBadge}</strong> tek dokusunu
                        paylaşan yüzler (
                        {resolvedBlockView.sharedWithActive
                          .map((f) => CUBE_FACE_META.find((m) => m.key === f)?.label)
                          .join(', ')}
                        )
                      </span>
                    </div>
                    <div className="flex flex-wrap gap-1.5 text-[11px]">
                      <button
                        onClick={() => applyQuickGrouping('all_one')}
                        className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-emerald-600/30 border border-slate-700 text-emerald-300 cursor-pointer"
                      >
                        6 Yüzü Tek Doku Yap
                      </button>
                      <button
                        onClick={() => applyQuickGrouping('sides_top_bottom')}
                        className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-sky-600/30 border border-slate-700 text-sky-300 cursor-pointer"
                      >
                        4 Yan Tek + Üst + Alt
                      </button>
                      <button
                        onClick={() => applyQuickGrouping('sides_plus_caps')}
                        className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-amber-600/30 border border-slate-700 text-amber-300 cursor-pointer"
                      >
                        4 Yan + (Üst=Alt)
                      </button>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="text-[11px] text-slate-400 mr-1">Bu yüzle eşle / ayır:</span>
                    {CUBE_FACE_META.map((fm) => {
                      const isSelf = fm.key === selectedFace;
                      const isShared = resolvedBlockView.sharedWithActive.includes(fm.key);
                      return (
                        <button
                          key={fm.key}
                          onClick={() => toggleShareFaceWithActive(fm.key)}
                          disabled={isSelf}
                          className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold border transition-colors ${
                            isSelf
                              ? 'bg-emerald-600 text-white border-emerald-400 cursor-default'
                              : isShared
                                ? 'bg-emerald-500/20 border-emerald-500/50 text-emerald-200 hover:bg-rose-500/20 hover:border-rose-400 cursor-pointer'
                                : 'bg-slate-950 border-slate-700 text-slate-400 hover:text-white hover:border-sky-400 cursor-pointer'
                          }`}
                          title={
                            isSelf
                              ? 'Şu an düzenlenen ana yüz'
                              : isShared
                                ? 'Aynı dokuyu paylaşıyor (ayırmak için tıkla)'
                                : 'Bu yüzü seçili tek dokuya bağlamak için tıkla'
                          }
                        >
                          {isShared ? '✓ ' : '+ '}
                          {fm.label}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Drawing Toolbar */}
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-1.5">
                    {(
                      [
                        { id: 'brush', icon: Paintbrush, label: 'Fırça', title: 'Tek tek piksel boya' },
                        { id: 'bucket', icon: PaintBucket, label: 'Doldur', title: 'Bitişik aynı renk alanı doldur' },
                        {
                          id: 'replace',
                          icon: Wand2,
                          label: 'Renk Değiştirici',
                          title: 'Dokudaki tıkladığın renkten tümünü tek seferde seçili renge çevir',
                        },
                        { id: 'eyedropper', icon: Pipette, label: 'Seç', title: 'Tuvalden renk al' },
                        { id: 'eraser', icon: Eraser, label: 'Sil', title: 'Varsayılan zemin rengine döndür' },
                      ] as const
                    ).map((t) => {
                      const Icon = t.icon;
                      return (
                        <button
                          key={t.id}
                          onClick={() => setPaintTool(t.id)}
                          title={t.title}
                          className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium cursor-pointer ${
                            paintTool === t.id
                              ? t.id === 'replace'
                                ? 'bg-amber-600 text-white shadow-sm'
                                : 'bg-emerald-600 text-white'
                              : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                          }`}
                        >
                          <Icon className="w-3.5 h-3.5" /> {t.label}
                        </button>
                      );
                    })}
                    <button
                      onClick={() => {
                        setBlockOverrides((prev) => {
                          const copy = { ...prev };
                          delete copy[selectedBlockId];
                          return copy;
                        });
                        setFeedback(`${selectedBlock?.name || selectedBlockId} varsayılan 6 yüzlü dokusuna döndürüldü.`);
                      }}
                      className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs text-amber-300 cursor-pointer"
                    >
                      <RotateCcw className="w-3.5 h-3.5" /> Bloğu Sıfırla
                    </button>
                  </div>

                  <label className="flex items-center gap-2 text-xs text-slate-300 cursor-pointer">
                    <input
                      type="color"
                      value={paintColor}
                      onChange={(e) => setPaintColor(e.target.value)}
                      className="w-7 h-7 rounded bg-transparent cursor-pointer"
                    />
                    Renk
                  </label>
                </div>

                {paintTool === 'replace' && (
                  <div className="px-3 py-1.5 rounded-xl bg-amber-500/15 border border-amber-500/40 text-[11px] text-amber-200 flex items-center gap-2">
                    <Wand2 className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                    <span>
                      <strong>Renk Değiştirici Aktif:</strong> Dokuda değiştirmek istediğin renge tıkla; o renkteki tüm pikseller anında seçili renge dönüştürülür.
                    </span>
                  </div>
                )}

                {/* 16x16 Grid + Color Swatches + Live 3D 6-Face Preview */}
                <div className="grid grid-cols-1 md:grid-cols-12 gap-5 items-start">
                  <div className="md:col-span-6 flex justify-center">
                    <div
                      className="grid grid-cols-16 gap-0 w-full max-w-[320px] aspect-square border-2 border-slate-700 rounded-lg overflow-hidden select-none bg-slate-900"
                      onMouseLeave={() => setIsPainting(false)}
                    >
                      {currentFacePixels.map((pxColor, idx) => {
                        const bg =
                          pxColor === 'transparent'
                            ? 'repeating-conic-gradient(#1e293b 0% 25%, #0f172a 0% 50%) 50% / 10px 10px'
                            : pxColor === 'rgba_glass'
                              ? selectedBlock?.color || '#bae6fd'
                              : pxColor;
                        return (
                          <div
                            key={idx}
                            onMouseDown={(e) => {
                              e.preventDefault();
                              setIsPainting(true);
                              applyPaintAt(idx);
                            }}
                            onMouseEnter={() => {
                              if (isPainting && paintTool !== 'bucket' && paintTool !== 'replace') {
                                applyPaintAt(idx);
                              }
                            }}
                            className="w-full h-full border-[0.5px] border-slate-950/25 cursor-crosshair"
                            style={{
                              background: bg,
                              opacity: pxColor === 'rgba_glass' ? 0.5 : 1,
                            }}
                          />
                        );
                      })}
                    </div>
                  </div>

                  <div className="md:col-span-6 space-y-3">
                    <div className="text-xs font-semibold text-slate-300">Hızlı Renk Paleti</div>
                    <div className="grid grid-cols-6 gap-1.5">
                      {PALETTE_SWATCHES.map((c) => (
                        <button
                          key={c}
                          onClick={() => {
                            setPaintColor(c);
                            if (paintTool === 'eraser' || paintTool === 'eyedropper') {
                              setPaintTool('brush');
                            }
                          }}
                          className={`h-7 rounded border cursor-pointer ${
                            paintColor === c ? 'border-white scale-110' : 'border-white/15'
                          }`}
                          style={{ backgroundColor: c }}
                        />
                      ))}
                    </div>

                    <div>
                      <div className="text-xs font-semibold text-slate-300 mb-1.5">
                        Canlı 3D Blok Önizleme (6 Yüz · Döndür)
                      </div>
                      <LiveCubePreview3D
                        facePixels={resolvedBlockView.facePixels}
                        fallbackColor={selectedBlock?.color || '#7d838a'}
                        pattern={selectedBlock?.pattern}
                        transparent={Boolean(selectedBlock?.transparent)}
                        glow={Boolean(selectedBlock?.lightLevel)}
                        heightClass="h-44"
                      />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
