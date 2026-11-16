import {
  Check,
  Copy,
  Download,
  Eraser,
  FlipHorizontal2,
  PaintBucket,
  Paintbrush,
  Pipette,
  Plus,
  Trash2,
  Upload,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { pixelsToPngDataUrl } from '../cottonlua/builtinApis';

interface CottonLuaTextureMakerProps {
  textures: Record<string, string>;
  onSaveTexture: (name: string, pngDataUrl: string) => void;
  onDeleteTexture: (name: string) => void;
  onInsertCodeSnippet: (snippet: string) => void;
}

const PALETTE = [
  '#f8fafc', '#cbd5e1', '#64748b', '#1e293b', '#0f172a', '#ef4444',
  '#f97316', '#facc15', '#84cc16', '#22c55e', '#10b981', '#06b6d4',
  '#38bdf8', '#2563eb', '#6366f1', '#9333ea', '#ec4899', '#a16207',
  '#78350f', '#451a03',
];

function makeStarterPixels(): string[] {
  const arr = new Array<string>(256).fill('#1e293b');
  for (let y = 0; y < 16; y++) {
    for (let x = 0; x < 16; x++) {
      if (x === 0 || y === 0 || x === 15 || y === 15) arr[y * 16 + x] = '#38bdf8';
      else if ((x + y) % 4 === 0) arr[y * 16 + x] = '#334155';
    }
  }
  return arr;
}

export function CottonLuaTextureMaker({
  textures,
  onSaveTexture,
  onDeleteTexture,
  onInsertCodeSnippet,
}: CottonLuaTextureMakerProps) {
  const [texName, setTexName] = useState('ozel_doku');
  const [pixels, setPixels] = useState<string[]>(makeStarterPixels);
  const [brushColor, setBrushColor] = useState('#38bdf8');
  const [tool, setTool] = useState<'brush' | 'bucket' | 'picker' | 'eraser'>('brush');
  const [mirrorX, setMirrorX] = useState(false);
  const [isDrawing, setIsDrawing] = useState(false);
  const [statusMsg, setStatusMsg] = useState('');

  useEffect(() => {
    const up = () => setIsDrawing(false);
    window.addEventListener('mouseup', up);
    return () => window.removeEventListener('mouseup', up);
  }, []);

  const previewPng = pixelsToPngDataUrl(pixels, 16);

  const paintCell = (idx: number, forceTool?: typeof tool) => {
    const activeTool = forceTool || tool;
    const x = idx % 16;
    const y = Math.floor(idx / 16);
    if (activeTool === 'picker') {
      const picked = pixels[idx];
      if (picked && picked !== 'transparent') {
        setBrushColor(picked);
        setTool('brush');
      }
      return;
    }

    if (activeTool === 'bucket') {
      const target = pixels[idx];
      const replacement = brushColor;
      if (target === replacement) return;
      const next = [...pixels];
      const stack = [[x, y]];
      const visited = new Set<number>();
      while (stack.length > 0) {
        const [cx, cy] = stack.pop()!;
        const cIdx = cy * 16 + cx;
        if (cx < 0 || cx >= 16 || cy < 0 || cy >= 16 || visited.has(cIdx)) continue;
        if (next[cIdx] !== target) continue;
        visited.add(cIdx);
        next[cIdx] = replacement;
        stack.push([cx + 1, cy], [cx - 1, cy], [cx, cy + 1], [cx, cy - 1]);
      }
      setPixels(next);
      return;
    }

    const paintVal = activeTool === 'eraser' ? 'transparent' : brushColor;
    setPixels((prev) => {
      const next = [...prev];
      next[idx] = paintVal;
      if (mirrorX) {
        const mx = 15 - x;
        next[y * 16 + mx] = paintVal;
      }
      return next;
    });
  };

  const handleLoadFromSaved = (name: string, dataUrl: string) => {
    setTexName(name);
    const img = new Image();
    img.onload = () => {
      const c = document.createElement('canvas');
      c.width = 16;
      c.height = 16;
      const ctx = c.getContext('2d')!;
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(img, 0, 0, 16, 16);
      const data = ctx.getImageData(0, 0, 16, 16).data;
      const arr: string[] = [];
      for (let i = 0; i < 256; i++) {
        const a = data[i * 4 + 3];
        if (a < 20) arr.push('transparent');
        else {
          const hex =
            '#' +
            [data[i * 4], data[i * 4 + 1], data[i * 4 + 2]]
              .map((v) => v.toString(16).padStart(2, '0'))
              .join('');
          arr.push(hex);
        }
      }
      setPixels(arr);
      setStatusMsg(`"${name}" düzenleyiciye yüklendi.`);
    };
    img.src = dataUrl;
  };

  const handleUploadPng = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const baseName = file.name.replace(/\.[^.]+$/, '').slice(0, 32) || 'yuklenen_png';
    setTexName(baseName);
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const c = document.createElement('canvas');
        c.width = 16;
        c.height = 16;
        const ctx = c.getContext('2d')!;
        ctx.imageSmoothingEnabled = false;
        ctx.drawImage(img, 0, 0, 16, 16);
        const data = ctx.getImageData(0, 0, 16, 16).data;
        const arr: string[] = [];
        for (let i = 0; i < 256; i++) {
          const a = data[i * 4 + 3];
          if (a < 20) arr.push('transparent');
          else {
            const hex =
              '#' +
              [data[i * 4], data[i * 4 + 1], data[i * 4 + 2]]
                .map((v) => v.toString(16).padStart(2, '0'))
                .join('');
            arr.push(hex);
          }
        }
        setPixels(arr);
        const pngUrl = pixelsToPngDataUrl(arr, 16);
        onSaveTexture(baseName, pngUrl);
        setStatusMsg(`PNG "${baseName}" (16×16) moda kaydedildi!`);
      };
      img.src = String(reader.result);
    };
    reader.readAsDataURL(file);
  };

  const handleSave = () => {
    const clean = texName.trim().slice(0, 36);
    if (!clean) return;
    onSaveTexture(clean, previewPng);
    setStatusMsg(`"${clean}" PNG dokusu moda eklendi! Kodda mod.texture("${clean}") ile kullan.`);
  };

  const downloadPng = (name: string, dataUrl: string) => {
    const a = document.createElement('a');
    a.href = dataUrl;
    a.download = `${name.replace(/\s+/g, '_').toLowerCase()}.png`;
    a.click();
  };

  const entries = Object.entries(textures);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
      {/* Left: 16x16 Pixel Canvas */}
      <div className="lg:col-span-7 p-5 rounded-2xl bg-slate-950/90 border border-slate-800 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="text-sm font-bold text-white">16×16 PNG Texture Yapıcı</h3>
            <p className="text-xs text-slate-400">
              Çizdiğin doku gerçek PNG formatında mod paketine eklenir.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <label className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs text-slate-200 cursor-pointer">
              <Upload className="w-3.5 h-3.5" /> PNG Yükle
              <input type="file" accept="image/png,image/*" onChange={handleUploadPng} className="hidden" />
            </label>
            <button
              onClick={() => downloadPng(texName || 'doku', previewPng)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs text-slate-200 cursor-pointer"
            >
              <Download className="w-3.5 h-3.5" /> .PNG İndir
            </button>
          </div>
        </div>

        {/* Tools */}
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => setTool('brush')}
            className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium cursor-pointer ${
              tool === 'brush' ? 'bg-amber-600 text-white' : 'bg-slate-800 text-slate-300'
            }`}
          >
            <Paintbrush className="w-3.5 h-3.5" /> Fırça
          </button>
          <button
            onClick={() => setTool('bucket')}
            className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium cursor-pointer ${
              tool === 'bucket' ? 'bg-amber-600 text-white' : 'bg-slate-800 text-slate-300'
            }`}
          >
            <PaintBucket className="w-3.5 h-3.5" /> Kova
          </button>
          <button
            onClick={() => setTool('picker')}
            className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium cursor-pointer ${
              tool === 'picker' ? 'bg-amber-600 text-white' : 'bg-slate-800 text-slate-300'
            }`}
          >
            <Pipette className="w-3.5 h-3.5" /> Seç
          </button>
          <button
            onClick={() => setTool('eraser')}
            className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium cursor-pointer ${
              tool === 'eraser' ? 'bg-rose-600 text-white' : 'bg-slate-800 text-slate-300'
            }`}
          >
            <Eraser className="w-3.5 h-3.5" /> Silgi
          </button>
          <button
            onClick={() => setMirrorX((v) => !v)}
            className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium cursor-pointer ${
              mirrorX ? 'bg-sky-600 text-white' : 'bg-slate-800 text-slate-300'
            }`}
          >
            <FlipHorizontal2 className="w-3.5 h-3.5" /> Simetri X
          </button>
          <input
            type="color"
            value={brushColor}
            onChange={(e) => {
              setBrushColor(e.target.value);
              if (tool === 'eraser') setTool('brush');
            }}
            className="w-8 h-8 rounded border border-slate-700 bg-transparent cursor-pointer ml-auto"
          />
        </div>

        {/* Palette */}
        <div className="flex flex-wrap gap-1.5">
          {PALETTE.map((c) => (
            <button
              key={c}
              onClick={() => {
                setBrushColor(c);
                if (tool === 'eraser') setTool('brush');
              }}
              className={`w-6 h-6 rounded border cursor-pointer ${
                brushColor === c ? 'border-white scale-110' : 'border-slate-700'
              }`}
              style={{ backgroundColor: c }}
            />
          ))}
        </div>

        {/* 16x16 Grid */}
        <div className="flex flex-col sm:flex-row items-center gap-5">
          <div
            onMouseLeave={() => setIsDrawing(false)}
            className="grid grid-cols-16 gap-[1px] bg-slate-800 p-1.5 rounded-xl border border-slate-700 select-none w-[304px] h-[304px] shrink-0"
          >
            {pixels.map((col, idx) => (
              <div
                key={idx}
                onMouseDown={(e) => {
                  e.preventDefault();
                  setIsDrawing(true);
                  paintCell(idx);
                }}
                onMouseEnter={() => {
                  if (isDrawing && (tool === 'brush' || tool === 'eraser')) {
                    paintCell(idx);
                  }
                }}
                className="w-full h-full cursor-crosshair"
                style={{
                  backgroundColor: col === 'transparent' ? 'transparent' : col,
                  backgroundImage:
                    col === 'transparent'
                      ? 'linear-gradient(45deg, #1e293b 25%, #0f172a 25%, #0f172a 50%, #1e293b 50%, #1e293b 75%, #0f172a 75%)'
                      : undefined,
                  backgroundSize: '8px 8px',
                }}
              />
            ))}
          </div>

          <div className="flex-1 w-full space-y-3">
            <div className="p-3 rounded-xl bg-slate-900 border border-slate-800 flex items-center gap-3">
              <img
                src={previewPng}
                alt="PNG Önizleme"
                className="w-16 h-16 rounded-lg border border-slate-700 pixelated bg-slate-950"
              />
              <div>
                <div className="text-xs font-bold text-white">Gerçek PNG Çıktısı</div>
                <div className="text-[11px] text-slate-400 font-mono">16×16 RGBA PNG</div>
                <div className="text-[11px] text-emerald-400 mt-0.5">
                  mod.texture("{texName || 'ozel_doku'}")
                </div>
              </div>
            </div>

            <div>
              <label className="block text-xs text-slate-400 mb-1">Doku Adı (PNG Anahtarı)</label>
              <input
                type="text"
                value={texName}
                onChange={(e) => setTexName(e.target.value)}
                placeholder="orn: plazma_cekirdek"
                className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-xs text-white"
              />
            </div>

            <button
              onClick={handleSave}
              className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-xs font-bold text-white cursor-pointer"
            >
              <Plus className="w-4 h-4" /> PNG Dokuyu Moda Kaydet
            </button>

            <button
              onClick={() => {
                handleSave();
                onInsertCodeSnippet(`mod.texture("${texName.trim() || 'ozel_doku'}")`);
              }}
              className="w-full flex items-center justify-center gap-2 py-2 rounded-xl bg-sky-600 hover:bg-sky-500 text-xs font-semibold text-white cursor-pointer"
            >
              <Check className="w-4 h-4" /> Kaydet ve Koda Ekle
            </button>

            {statusMsg && (
              <div className="text-[11px] text-emerald-300 bg-emerald-500/10 border border-emerald-500/30 rounded-lg px-3 py-2">
                {statusMsg}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Right: Saved PNG Textures in Mod */}
      <div className="lg:col-span-5 p-5 rounded-2xl bg-slate-950/90 border border-slate-800 space-y-3">
        <div className="flex items-center justify-between">
          <h4 className="text-sm font-bold text-white">Moddaki PNG Dokular ({entries.length})</h4>
        </div>
        {entries.length === 0 ? (
          <div className="py-12 text-center border border-dashed border-slate-800 rounded-xl text-xs text-slate-400">
            Henüz kaydedilmiş PNG doku yok. Soldan çiz veya PNG yükle!
          </div>
        ) : (
          <div className="space-y-2 max-h-[420px] overflow-y-auto pr-1">
            {entries.map(([name, dataUrl]) => (
              <div
                key={name}
                className="p-2.5 rounded-xl bg-slate-900 border border-slate-800 flex items-center justify-between gap-3"
              >
                <div
                  onClick={() => handleLoadFromSaved(name, dataUrl)}
                  className="flex items-center gap-3 min-w-0 cursor-pointer"
                >
                  <img
                    src={dataUrl}
                    alt={name}
                    className="w-10 h-10 rounded-lg border border-white/15 pixelated shrink-0 bg-slate-950"
                  />
                  <div className="min-w-0">
                    <div className="text-xs font-bold text-white truncate">{name}</div>
                    <div className="text-[10px] text-sky-400 font-mono truncate">
                      mod.texture("{name}")
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <button
                    onClick={() => onInsertCodeSnippet(`mod.texture("${name}")`)}
                    title="Kod editörüne yapıştır"
                    className="p-1.5 rounded-lg bg-slate-800 hover:bg-sky-600 text-slate-300 hover:text-white cursor-pointer"
                  >
                    <Copy className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => downloadPng(name, dataUrl)}
                    title=".png olarak indir"
                    className="p-1.5 rounded-lg bg-slate-800 hover:bg-emerald-600 text-slate-300 hover:text-white cursor-pointer"
                  >
                    <Download className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => onDeleteTexture(name)}
                    title="Sil"
                    className="p-1.5 rounded-lg bg-slate-800 hover:bg-rose-600 text-slate-300 hover:text-white cursor-pointer"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
