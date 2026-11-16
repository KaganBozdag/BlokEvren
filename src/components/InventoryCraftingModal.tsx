import { Flame, Hammer, Search, Sparkles, X } from 'lucide-react';
import { useMemo, useState } from 'react';
import { getAllItems, getAllRecipes, getItemDef } from '../data/blocksAndRecipes';
import { voxelAudio } from '../engine/audio';
import { getItemIconUrl } from '../engine/textures';
import { BlockCategory, GameMode, InventorySlot, RecipeDef } from '../types/game';

interface InventoryCraftingModalProps {
  gameMode: GameMode;
  slots: (InventorySlot | null)[];
  initialTab?: 'craft' | 'furnace' | 'creative';
  onUpdateSlots: (nextSlots: (InventorySlot | null)[]) => void;
  onGiveItem: (itemId: string, count: number) => void;
  onCraftSuccess?: (recipe: RecipeDef) => void;
  onClose: () => void;
}

const CATEGORIES: { key: 'all' | BlockCategory; label: string }[] = [
  { key: 'all', label: 'Tümü' },
  { key: 'natural', label: 'Doğal' },
  { key: 'building', label: 'İnşaat' },
  { key: 'wood', label: 'Ahşap' },
  { key: 'ore', label: 'Madenler' },
  { key: 'utility', label: 'Araçlar' },
  { key: 'glass', label: 'Cam & Buz' },
  { key: 'tool', label: 'Kazma & Alet' },
  { key: 'material', label: 'Malzeme' },
  { key: 'food', label: 'Yiyecek' },
  { key: 'mob', label: 'Canlı Yumurtaları' },
  { key: 'mod', label: 'Modlar' },
];

function normalizePattern(grid: (string | null)[]): string {
  let minR = 3;
  let maxR = -1;
  let minC = 3;
  let maxC = -1;
  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < 3; c++) {
      if (grid[r * 3 + c]) {
        if (r < minR) minR = r;
        if (r > maxR) maxR = r;
        if (c < minC) minC = c;
        if (c > maxC) maxC = c;
      }
    }
  }
  if (maxR < minR) return '';
  const rows: string[] = [];
  for (let r = minR; r <= maxR; r++) {
    const cols: string[] = [];
    for (let c = minC; c <= maxC; c++) {
      cols.push(grid[r * 3 + c] || '_');
    }
    rows.push(cols.join(','));
  }
  return rows.join('|');
}

export function InventoryCraftingModal({
  gameMode,
  slots,
  initialTab,
  onUpdateSlots,
  onGiveItem,
  onCraftSuccess,
  onClose,
}: InventoryCraftingModalProps) {
  const [tab, setTab] = useState<'craft' | 'furnace' | 'creative'>(
    initialTab || (gameMode === 'creative' ? 'creative' : 'craft'),
  );
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState<'all' | BlockCategory>('all');
  const [pickedIndex, setPickedIndex] = useState<number | null>(null);
  const [craftGrid, setCraftGrid] = useState<(string | null)[]>(Array(9).fill(null));

  const allItems = getAllItems();
  const allRecipes = getAllRecipes();

  // Count total of each item in inventory
  const inventoryCounts = useMemo(() => {
    const map = new Map<string, number>();
    for (const s of slots) {
      if (s && s.count > 0) {
        map.set(s.id, (map.get(s.id) || 0) + s.count);
      }
    }
    return map;
  }, [slots]);

  const canCraftRecipe = (rec: RecipeDef): boolean => {
    if (gameMode === 'creative') return true;
    return rec.ingredients.every((ing) => (inventoryCounts.get(ing.id) || 0) >= ing.count);
  };

  // Match 3x3 manual grid against recipes (shaped pattern first, then shapeless counts)
  const matchedGridRecipe = useMemo(() => {
    const placedCounts = new Map<string, number>();
    craftGrid.forEach((id) => {
      if (id) placedCounts.set(id, (placedCounts.get(id) || 0) + 1);
    });
    if (placedCounts.size === 0) return null;
    const placedShape = normalizePattern(craftGrid);

    const shapedMatch = allRecipes.find(
      (rec) =>
        !rec.requiresFurnace &&
        rec.pattern &&
        rec.pattern.some(Boolean) &&
        normalizePattern(rec.pattern) === placedShape,
    );
    if (shapedMatch) return shapedMatch;

    return (
      allRecipes.find((rec) => {
        if (rec.requiresFurnace) return false;
        if (rec.pattern && rec.pattern.some(Boolean)) return false;
        if (rec.ingredients.length !== placedCounts.size) return false;
        return rec.ingredients.every((ing) => placedCounts.get(ing.id) === ing.count);
      }) || null
    );
  }, [craftGrid, allRecipes]);

  const executeCraft = (rec: RecipeDef) => {
    if (!canCraftRecipe(rec)) return;
    const next = slots.map((s) => (s ? { ...s } : null));

    if (gameMode === 'survival') {
      for (const ing of rec.ingredients) {
        let remaining = ing.count;
        for (let i = 0; i < next.length && remaining > 0; i++) {
          const sl = next[i];
          if (sl && sl.id === ing.id) {
            const take = Math.min(sl.count, remaining);
            sl.count -= take;
            remaining -= take;
            if (sl.count <= 0) next[i] = null;
          }
        }
      }
    }

    // Add output
    let toAdd = rec.output.count;
    const def = getItemDef(rec.output.id);
    const maxStack = def?.stackSize || 64;
    for (let i = 0; i < next.length && toAdd > 0; i++) {
      const sl = next[i];
      if (sl && sl.id === rec.output.id && sl.count < maxStack) {
        const add = Math.min(maxStack - sl.count, toAdd);
        sl.count += add;
        toAdd -= add;
      }
    }
    for (let i = 0; i < next.length && toAdd > 0; i++) {
      if (!next[i]) {
        const add = Math.min(maxStack, toAdd);
        next[i] = { id: rec.output.id, count: add };
        toAdd -= add;
      }
    }

    voxelAudio.playCraft();
    onUpdateSlots(next);
    onCraftSuccess?.(rec);
  };

  const handleSlotClick = (idx: number) => {
    if (pickedIndex === null) {
      if (slots[idx]) setPickedIndex(idx);
      return;
    }
    if (pickedIndex === idx) {
      setPickedIndex(null);
      return;
    }
    const next = [...slots];
    const from = next[pickedIndex];
    const to = next[idx];
    if (from && to && from.id === to.id) {
      const maxS = getItemDef(from.id)?.stackSize || 64;
      const move = Math.min(maxS - to.count, from.count);
      next[idx] = { id: to.id, count: to.count + move };
      const rem = from.count - move;
      next[pickedIndex] = rem > 0 ? { id: from.id, count: rem } : null;
    } else {
      next[idx] = from;
      next[pickedIndex] = to;
    }
    setPickedIndex(null);
    onUpdateSlots(next);
  };

  const handleGridCellClick = (gIdx: number) => {
    if (pickedIndex !== null && slots[pickedIndex]) {
      const nextGrid = [...craftGrid];
      nextGrid[gIdx] = slots[pickedIndex]!.id;
      setCraftGrid(nextGrid);
      setPickedIndex(null);
    } else if (craftGrid[gIdx]) {
      const nextGrid = [...craftGrid];
      nextGrid[gIdx] = null;
      setCraftGrid(nextGrid);
    }
  };

  const creativeItems = allItems.filter(
    (item) => item.id !== 'bedrock' && !item.hiddenInInventory && !item.liquid,
  );

  const filteredCreative = creativeItems.filter((item) => {
    if (category !== 'all' && item.category !== category) return false;
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      return item.name.toLowerCase().includes(q) || item.id.toLowerCase().includes(q);
    }
    return true;
  });

  const shownRecipes = allRecipes.filter((r) =>
    tab === 'furnace' ? Boolean(r.requiresFurnace) : !r.requiresFurnace,
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/85 p-4">
      <div className="w-full max-w-5xl max-h-[92vh] bg-slate-900 border border-slate-700/80 rounded-xl shadow-2xl flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-3.5 border-b border-slate-800">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setTab('craft')}
              className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-semibold cursor-pointer ${
                tab === 'craft'
                  ? 'bg-emerald-600 text-white'
                  : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
              }`}
            >
              <Hammer className="w-3.5 h-3.5" /> Çalışma Masası
            </button>
            <button
              onClick={() => setTab('furnace')}
              className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-semibold cursor-pointer ${
                tab === 'furnace'
                  ? 'bg-orange-600 text-white'
                  : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
              }`}
            >
              <Flame className="w-3.5 h-3.5" /> Ocak (Eritme)
            </button>
            {gameMode === 'creative' && (
              <button
                onClick={() => setTab('creative')}
                className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-semibold cursor-pointer ${
                  tab === 'creative'
                    ? 'bg-sky-600 text-white'
                    : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                }`}
              >
                <Sparkles className="w-3.5 h-3.5" /> Yaratıcılık Kataloğu ({creativeItems.length})
              </button>
            )}
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {tab === 'creative' && gameMode === 'creative' ? (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center gap-3">
                <div className="relative flex-1 min-w-[200px]">
                  <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Blok, maden veya alet ara..."
                    className="w-full pl-9 pr-3 py-2 rounded-lg bg-slate-950 border border-slate-700 text-sm text-white focus:outline-none focus:border-sky-500"
                  />
                </div>
                <div className="flex flex-wrap gap-1">
                  {CATEGORIES.map((c) => (
                    <button
                      key={c.key}
                      onClick={() => setCategory(c.key)}
                      className={`px-2.5 py-1.5 rounded-lg text-xs font-medium cursor-pointer ${
                        category === c.key
                          ? 'bg-sky-600 text-white'
                          : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                      }`}
                    >
                      {c.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-5 sm:grid-cols-8 md:grid-cols-10 gap-2 max-h-64 overflow-y-auto pr-1">
                {filteredCreative.map((item) => (
                  <button
                    key={item.id}
                    onClick={() => {
                      onGiveItem(item.id, item.stackSize);
                      voxelAudio.playPlace();
                    }}
                    title={item.name}
                    className="flex flex-col items-center gap-1 p-2 rounded-lg bg-slate-950 hover:bg-slate-800 border border-slate-800 hover:border-sky-500/60 transition-colors cursor-pointer"
                  >
                    <img
                      src={getItemIconUrl(item.id)}
                      alt={item.name}
                      className="w-8 h-8 pixelated"
                    />
                    <span className="text-[10px] text-slate-300 truncate w-full text-center">
                      {item.name}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
              {/* Left: 3x3 Crafting Grid */}
              {tab === 'craft' && (
                <div className="lg:col-span-5 p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-4">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-semibold text-white">3×3 Zanaat Izgarası</h3>
                    <button
                      onClick={() => setCraftGrid(Array(9).fill(null))}
                      className="text-xs text-slate-400 hover:text-white cursor-pointer"
                    >
                      Temizle
                    </button>
                  </div>
                  <p className="text-[11px] text-slate-400">
                    Envanterden bir eşyaya tıkla, sonra ızgaraya yerleştir. Veya sağdaki Tarif Kitabından tek tıkla üret!
                  </p>
                  <div className="flex items-center justify-center gap-4 py-2">
                    <div className="grid grid-cols-3 gap-1.5">
                      {craftGrid.map((gId, gi) => (
                        <button
                          key={gi}
                          onClick={() => handleGridCellClick(gi)}
                          className="w-12 h-12 rounded-lg bg-slate-900 border border-slate-700 hover:border-emerald-500 flex items-center justify-center cursor-pointer"
                        >
                          {gId && (
                            <img
                              src={getItemIconUrl(gId)}
                              alt={gId}
                              className="w-8 h-8 pixelated"
                            />
                          )}
                        </button>
                      ))}
                    </div>
                    <span className="text-slate-500 font-bold text-lg">→</span>
                    <button
                      onClick={() => {
                        if (matchedGridRecipe && canCraftRecipe(matchedGridRecipe)) {
                          executeCraft(matchedGridRecipe);
                        }
                      }}
                      disabled={!matchedGridRecipe || !canCraftRecipe(matchedGridRecipe)}
                      className={`w-16 h-16 rounded-xl border-2 flex flex-col items-center justify-center cursor-pointer ${
                        matchedGridRecipe && canCraftRecipe(matchedGridRecipe)
                          ? 'bg-emerald-950/40 border-emerald-500 hover:bg-emerald-900/50'
                          : 'bg-slate-900 border-slate-700 opacity-50'
                      }`}
                    >
                      {matchedGridRecipe && (
                        <>
                          <img
                            src={getItemIconUrl(matchedGridRecipe.output.id)}
                            alt={matchedGridRecipe.name}
                            className="w-9 h-9 pixelated"
                          />
                          <span className="text-[10px] font-mono-num text-emerald-300">
                            ×{matchedGridRecipe.output.count}
                          </span>
                        </>
                      )}
                    </button>
                  </div>
                </div>
              )}

              {/* Recipe Book */}
              <div
                className={`${
                  tab === 'craft' ? 'lg:col-span-7' : 'lg:col-span-12'
                } p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-3`}
              >
                <h3 className="text-sm font-semibold text-white">
                  {tab === 'furnace' ? 'Ocak Eritme Tarifleri' : 'Tarif Kitabı (Tek Tıkla Üret)'}
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-60 overflow-y-auto pr-1">
                  {shownRecipes.map((rec) => {
                    const craftable = canCraftRecipe(rec);
                    return (
                      <button
                        key={rec.id}
                        onClick={() => executeCraft(rec)}
                        disabled={!craftable}
                        className={`flex items-center justify-between gap-2 p-2.5 rounded-lg border text-left transition-colors ${
                          craftable
                            ? 'bg-slate-900 hover:bg-slate-800 border-emerald-500/40 cursor-pointer'
                            : 'bg-slate-900/40 border-slate-800/70 opacity-50 cursor-not-allowed'
                        }`}
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          {rec.pattern && rec.pattern.some(Boolean) && (
                            <div
                              className="grid grid-cols-3 gap-0.5 p-0.5 rounded bg-slate-950 border border-slate-700 shrink-0"
                              title="3×3 Şekilli Tarif"
                            >
                              {rec.pattern.map((cellId, ci) => (
                                <div
                                  key={ci}
                                  className="w-3 h-3 rounded-[2px] bg-slate-900 flex items-center justify-center"
                                >
                                  {cellId && (
                                    <img
                                      src={getItemIconUrl(cellId)}
                                      alt={cellId}
                                      className="w-2.5 h-2.5 pixelated"
                                    />
                                  )}
                                </div>
                              ))}
                            </div>
                          )}
                          <img
                            src={getItemIconUrl(rec.output.id)}
                            alt={rec.name}
                            className="w-8 h-8 pixelated shrink-0"
                          />
                          <div className="min-w-0">
                            <div className="text-xs font-semibold text-white truncate">
                              {rec.name} (×{rec.output.count})
                            </div>
                            <div className="text-[11px] text-slate-400 truncate">
                              {rec.ingredients
                                .map((ing) => `${ing.count}× ${getItemDef(ing.id)?.name || ing.id}`)
                                .join(' + ')}
                            </div>
                          </div>
                        </div>
                        {craftable && (
                          <span className="text-[11px] font-semibold text-emerald-400 shrink-0">
                            Üret
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {/* Inventory Slots (Hotbar + Main Bag) */}
          <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-semibold text-slate-300">
                Envanter & Hızlı Çubuk (Taşımak için iki slota sırayla tıkla)
              </h3>
              {pickedIndex !== null && (
                <span className="text-xs text-amber-400">
                  Taşınıyor: {getItemDef(slots[pickedIndex]?.id || '')?.name}
                </span>
              )}
            </div>

            <div className="grid grid-cols-9 gap-1.5">
              {slots.slice(9, 36).map((slot, i) => {
                const idx = i + 9;
                const def = slot ? getItemDef(slot.id) : null;
                return (
                  <button
                    key={idx}
                    onClick={() => handleSlotClick(idx)}
                    title={def?.name || 'Boş'}
                    className={`relative h-12 rounded-lg border flex items-center justify-center cursor-pointer transition-colors ${
                      pickedIndex === idx
                        ? 'bg-amber-500/20 border-amber-400'
                        : 'bg-slate-900 border-slate-800 hover:border-slate-600'
                    }`}
                  >
                    {slot && (
                      <>
                        <img
                          src={getItemIconUrl(slot.id)}
                          alt={def?.name || slot.id}
                          className="w-7 h-7 pixelated"
                        />
                        {slot.count > 1 && (
                          <span className="absolute bottom-0.5 right-1 text-[10px] font-mono-num font-bold text-white">
                            {slot.count}
                          </span>
                        )}
                      </>
                    )}
                  </button>
                );
              })}
            </div>

            <div className="pt-2 border-t border-slate-800">
              <div className="text-[11px] text-slate-500 mb-1.5">Hızlı Çubuk (1–9)</div>
              <div className="grid grid-cols-9 gap-1.5">
                {slots.slice(0, 9).map((slot, idx) => {
                  const def = slot ? getItemDef(slot.id) : null;
                  return (
                    <button
                      key={idx}
                      onClick={() => handleSlotClick(idx)}
                      title={def?.name || 'Boş'}
                      className={`relative h-12 rounded-lg border flex items-center justify-center cursor-pointer transition-colors ${
                        pickedIndex === idx
                          ? 'bg-amber-500/20 border-amber-400'
                          : 'bg-slate-800/80 border-slate-700 hover:border-emerald-500/60'
                      }`}
                    >
                      <span className="absolute top-0.5 left-1 text-[9px] text-slate-500 font-mono-num">
                        {idx + 1}
                      </span>
                      {slot && (
                        <>
                          <img
                            src={getItemIconUrl(slot.id)}
                            alt={def?.name || slot.id}
                            className="w-7 h-7 pixelated"
                          />
                          {slot.count > 1 && (
                            <span className="absolute bottom-0.5 right-1 text-[10px] font-mono-num font-bold text-white">
                              {slot.count}
                            </span>
                          )}
                        </>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
