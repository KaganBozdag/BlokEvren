import { User } from 'firebase/auth';
import { Check, Cloud, Eraser, FlipHorizontal, PaintBucket, Pipette, Plus, Save, Trash2, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import {
  arrayToGrid,
  gridToArray,
  PRESET_SKINS,
  SKIN_PART_LABELS,
} from '../data/presetSkins';
import { createVoxelCharacterRig, VoxelCharacterRig } from '../engine/playerMesh';
import { deleteSkinFromCloud, saveSkinToCloud } from '../services/cloudService';
import { SkinData, SkinPartKey } from '../types/game';

interface SkinDesignerModalProps {
  user: User | null;
  activeSkin: SkinData;
  savedSkins: SkinData[];
  onClose: () => void;
  onApplySkin: (skin: SkinData) => void;
  onSkinsUpdated: (skins: SkinData[]) => void;
}

const PALETTE = [
  '#f8fafc', '#cbd5e1', '#64748b', '#1e293b', '#0f172a',
  '#e6b89c', '#d19874', '#a46c49', '#6e4326', '#3e2414',
  '#ef4444', '#f97316', '#facc15', '#22c55e', '#10b981',
  '#06b6d4', '#3b82f6', '#6366f1', '#a855f7', '#ec4899',
];

const PARTS: SkinPartKey[] = ['headFront', 'headSide', 'headTop', 'torso', 'arm', 'leg'];

export function SkinDesignerModal({
  user,
  activeSkin,
  savedSkins,
  onClose,
  onApplySkin,
  onSkinsUpdated,
}: SkinDesignerModalProps) {
  const [draft, setDraft] = useState<SkinData>({ ...activeSkin });
  const [selectedPart, setSelectedPart] = useState<SkinPartKey>('headFront');
  const [brushColor, setBrushColor] = useState('#0ea5e9');
  const [tool, setTool] = useState<'brush' | 'bucket' | 'eyedropper' | 'eraser'>('brush');
  const [mirror, setMirror] = useState(false);
  const [isPainting, setIsPainting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [statusMsg, setStatusMsg] = useState('');

  const previewRef = useRef<HTMLDivElement>(null);
  const rigRef = useRef<VoxelCharacterRig | null>(null);
  const rotYRef = useRef(0.35);
  const dragging3dRef = useRef(false);
  const lastMouseXRef = useRef(0);

  // Live 3D Character Preview
  useEffect(() => {
    const container = previewRef.current;
    if (!container) return;

    const isSoftwareGl = (() => {
      const gl = document.createElement('canvas').getContext('webgl2');
      if (!gl) return true;
      const ext = gl.getExtension('WEBGL_debug_renderer_info');
      const param = ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER;
      const gpu = String(gl.getParameter(param));
      gl.getExtension('WEBGL_lose_context')?.loseContext();
      return /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(gpu);
    })();

    const renderer = new THREE.WebGLRenderer({
      antialias: !isSoftwareGl,
      alpha: true,
      powerPreference: 'high-performance',
    });
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.setPixelRatio(isSoftwareGl ? 1 : Math.min(window.devicePixelRatio, 2));
    renderer.setSize(container.clientWidth, container.clientHeight);
    container.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const pmrem = new THREE.PMREMGenerator(renderer);
    scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    pmrem.dispose();

    scene.add(new THREE.HemisphereLight(0xe0f2fe, 0x334155, 1.1));
    const key = new THREE.DirectionalLight(0xfff7ed, 1.4);
    key.position.set(3, 5, 4);
    scene.add(key);

    const camera = new THREE.PerspectiveCamera(
      40,
      container.clientWidth / Math.max(1, container.clientHeight),
      0.1,
      50,
    );
    camera.position.set(0, 1.15, 3.6);
    camera.lookAt(0, 1.0, 0);

    const rig = createVoxelCharacterRig(draft);
    rigRef.current = rig;
    scene.add(rig.group);

    let frameId = 0;
    let disposed = false;
    let last = performance.now();

    function afterDraw(cb: () => void) {
      const gl = renderer.getContext() as WebGL2RenderingContext;
      const sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
      gl.flush();
      const poll = () => {
        if (disposed) return;
        const state = sync && gl.getSyncParameter(sync, gl.SYNC_STATUS);
        if (state === gl.UNSIGNALED) {
          frameId = window.setTimeout(poll, 5);
        } else {
          if (sync) gl.deleteSync(sync);
          frameId = window.setTimeout(cb, 80);
        }
      };
      frameId = window.setTimeout(poll, 5);
    }

    function tick() {
      if (disposed) return;
      const now = performance.now();
      const dt = Math.min((now - last) / 1000, 0.05);
      last = now;
      if (!dragging3dRef.current) {
        rotYRef.current += dt * 0.6;
      }
      rig.group.rotation.y = rotYRef.current;
      rig.animate(dt, 1.2, false);
      renderer.render(scene, camera);
      if (isSoftwareGl) afterDraw(tick);
      else frameId = requestAnimationFrame(tick);
    }
    tick();

    return () => {
      disposed = true;
      cancelAnimationFrame(frameId);
      clearTimeout(frameId);
      rig.dispose();
      rigRef.current = null;
      renderer.dispose();
      if (renderer.domElement.parentNode === container) {
        container.removeChild(renderer.domElement);
      }
    };
  }, []);

  useEffect(() => {
    rigRef.current?.updateSkin(draft);
  }, [draft]);

  const currentPixels = gridToArray(draft[selectedPart]);

  const paintCell = (idx: number, isClick: boolean) => {
    const arr = [...currentPixels];
    const x = idx % 8;
    const y = Math.floor(idx / 8);

    if (tool === 'eyedropper') {
      setBrushColor(arr[idx]);
      setTool('brush');
      return;
    }

    const targetColor = tool === 'eraser' ? '#e6b89c' : brushColor;

    if (tool === 'bucket' && isClick) {
      const oldColor = arr[idx];
      if (oldColor === targetColor) return;
      const queue = [[x, y]];
      const visited = new Set<number>();
      while (queue.length > 0) {
        const [cx, cy] = queue.shift()!;
        const ci = cy * 8 + cx;
        if (cx < 0 || cx >= 8 || cy < 0 || cy >= 8 || visited.has(ci)) continue;
        if (arr[ci] !== oldColor) continue;
        visited.add(ci);
        arr[ci] = targetColor;
        queue.push([cx + 1, cy], [cx - 1, cy], [cx, cy + 1], [cx, cy - 1]);
      }
    } else {
      arr[idx] = targetColor;
      if (mirror) {
        const mx = 7 - x;
        arr[y * 8 + mx] = targetColor;
      }
    }

    setDraft((prev) => ({
      ...prev,
      [selectedPart]: arrayToGrid(arr),
    }));
  };

  const handleSaveAndUse = async () => {
    setSaving(true);
    setStatusMsg('');
    try {
      const skinId =
        draft.id.startsWith('preset_') ? `skin_${Date.now()}` : draft.id;
      const toSave: SkinData = {
        ...draft,
        id: skinId,
        name: draft.name.trim() || 'Özel Skinim',
      };
      if (user) {
        await saveSkinToCloud(user.uid, toSave);
      }
      const nextList = [
        toSave,
        ...savedSkins.filter((s) => s.id !== toSave.id),
      ];
      onSkinsUpdated(nextList);
      onApplySkin(toSave);
      setDraft(toSave);
      setStatusMsg(user ? 'Buluta kaydedildi ve aktif edildi!' : 'Yerel olarak kaydedildi ve aktif edildi!');
    } catch {
      setStatusMsg('Kaydetme sırasında hata oluştu.');
    } finally {
      setSaving(false);
    }
  };

  const handleNewBlank = () => {
    setDraft({
      ...PRESET_SKINS[0],
      id: `skin_${Date.now()}`,
      name: 'Yeni Skin',
    });
  };

  const handleDeleteSkin = async (id: string) => {
    if (user) {
      await deleteSkinFromCloud(user.uid, id);
    }
    onSkinsUpdated(savedSkins.filter((s) => s.id !== id));
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/85 p-4"
      onMouseUp={() => setIsPainting(false)}
    >
      <div className="w-full max-w-5xl max-h-[92vh] bg-slate-900 border border-slate-700/80 rounded-xl shadow-2xl flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800">
          <div>
            <h2 className="font-display text-xl font-bold text-white">
              Karakter Skin Tasarımcısı
            </h2>
            <p className="text-xs text-slate-400">
              8×8 piksel editör ile karakterini boya, canlı 3D önizlemeden kontrol et ve oyunda hemen kullan
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Main Studio Workspace */}
        <div className="flex-1 overflow-y-auto grid grid-cols-1 lg:grid-cols-12 gap-6 p-6">
          {/* Left: 3D Preview & Presets */}
          <div className="lg:col-span-4 flex flex-col gap-4">
            <div
              className="relative h-64 rounded-xl bg-slate-950 border border-slate-800 overflow-hidden cursor-grab active:cursor-grabbing"
              onMouseDown={(e) => {
                dragging3dRef.current = true;
                lastMouseXRef.current = e.clientX;
              }}
              onMouseMove={(e) => {
                if (!dragging3dRef.current) return;
                const dx = e.clientX - lastMouseXRef.current;
                lastMouseXRef.current = e.clientX;
                rotYRef.current += dx * 0.015;
              }}
              onMouseUp={() => {
                dragging3dRef.current = false;
              }}
              onMouseLeave={() => {
                dragging3dRef.current = false;
              }}
            >
              <div ref={previewRef} className="w-full h-full" />
              <div className="absolute bottom-2 left-3 text-[11px] text-slate-400 pointer-events-none">
                Sürükleyerek döndür
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1.5">
                Skin Adı
              </label>
              <input
                type="text"
                maxLength={40}
                value={draft.name}
                onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-700 text-sm text-white focus:outline-none focus:border-emerald-500"
                placeholder="Örn: Ateş Şövalyesi"
              />
            </div>

            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-medium text-slate-400">Hazır Şablonlar</span>
                <button
                  onClick={handleNewBlank}
                  className="flex items-center gap-1 text-xs text-emerald-400 hover:text-emerald-300 cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" /> Yeni Tasarım
                </button>
              </div>
              <div className="grid grid-cols-2 gap-2">
                {PRESET_SKINS.map((preset) => (
                  <button
                    key={preset.id}
                    onClick={() => setDraft({ ...preset })}
                    className={`px-2.5 py-2 rounded-lg text-xs font-medium text-left border transition-colors cursor-pointer truncate ${
                      draft.id === preset.id
                        ? 'bg-emerald-600/20 border-emerald-500 text-emerald-300'
                        : 'bg-slate-800/70 border-slate-700 text-slate-300 hover:bg-slate-800'
                    }`}
                  >
                    {preset.name}
                  </button>
                ))}
              </div>
            </div>

            {savedSkins.length > 0 && (
              <div>
                <div className="flex items-center gap-1.5 text-xs font-medium text-slate-400 mb-2">
                  <Cloud className="w-3.5 h-3.5 text-sky-400" />
                  Kayıtlı Skinlerim ({savedSkins.length})
                </div>
                <div className="space-y-1.5 max-h-32 overflow-y-auto pr-1">
                  {savedSkins.map((sk) => (
                    <div
                      key={sk.id}
                      className="flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-lg bg-slate-800/70 border border-slate-700/70"
                    >
                      <button
                        onClick={() => setDraft({ ...sk })}
                        className="text-xs text-slate-200 hover:text-white truncate flex-1 text-left cursor-pointer"
                      >
                        {sk.name}
                      </button>
                      <button
                        onClick={() => onApplySkin(sk)}
                        className="text-[11px] px-2 py-0.5 rounded bg-emerald-600 hover:bg-emerald-500 text-white cursor-pointer"
                      >
                        Seç
                      </button>
                      <button
                        onClick={() => handleDeleteSkin(sk.id)}
                        className="text-slate-400 hover:text-rose-400 cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Right: Pixel Canvas & Tools */}
          <div className="lg:col-span-8 flex flex-col gap-4">
            {/* Part Tabs */}
            <div className="flex flex-wrap gap-1.5 bg-slate-950 p-1.5 rounded-xl border border-slate-800">
              {PARTS.map((pk) => (
                <button
                  key={pk}
                  onClick={() => setSelectedPart(pk)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer whitespace-nowrap ${
                    selectedPart === pk
                      ? 'bg-emerald-600 text-white'
                      : 'text-slate-400 hover:text-white hover:bg-slate-800'
                  }`}
                >
                  {SKIN_PART_LABELS[pk]}
                </button>
              ))}
            </div>

            {/* Tool Bar */}
            <div className="flex flex-wrap items-center justify-between gap-3 bg-slate-950/70 px-4 py-2.5 rounded-xl border border-slate-800">
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setTool('brush')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium cursor-pointer ${
                    tool === 'brush'
                      ? 'bg-sky-600 text-white'
                      : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                  }`}
                >
                  Fırça
                </button>
                <button
                  onClick={() => setTool('bucket')}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium cursor-pointer ${
                    tool === 'bucket'
                      ? 'bg-sky-600 text-white'
                      : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                  }`}
                >
                  <PaintBucket className="w-3.5 h-3.5" /> Doldur
                </button>
                <button
                  onClick={() => setTool('eyedropper')}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium cursor-pointer ${
                    tool === 'eyedropper'
                      ? 'bg-sky-600 text-white'
                      : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                  }`}
                >
                  <Pipette className="w-3.5 h-3.5" /> Renk Al
                </button>
                <button
                  onClick={() => setTool('eraser')}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium cursor-pointer ${
                    tool === 'eraser'
                      ? 'bg-sky-600 text-white'
                      : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                  }`}
                >
                  <Eraser className="w-3.5 h-3.5" /> Silgi
                </button>
              </div>

              <button
                onClick={() => setMirror((m) => !m)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium cursor-pointer border ${
                  mirror
                    ? 'bg-amber-500/20 border-amber-500 text-amber-300'
                    : 'bg-slate-800 border-slate-700 text-slate-300'
                }`}
              >
                <FlipHorizontal className="w-3.5 h-3.5" /> Ayna Simetri: {mirror ? 'Açık' : 'Kapalı'}
              </button>
            </div>

            {/* 8x8 Grid + Color Palette */}
            <div className="grid grid-cols-1 md:grid-cols-12 gap-6 items-start">
              <div className="md:col-span-7 flex justify-center">
                <div
                  className="grid grid-cols-8 gap-0.5 p-2 bg-slate-950 rounded-xl border border-slate-700 select-none"
                  onMouseLeave={() => setIsPainting(false)}
                >
                  {currentPixels.map((hex, idx) => (
                    <button
                      key={idx}
                      type="button"
                      onMouseDown={() => {
                        setIsPainting(true);
                        paintCell(idx, true);
                      }}
                      onMouseEnter={() => {
                        if (isPainting) paintCell(idx, false);
                      }}
                      style={{ backgroundColor: hex }}
                      className="w-9 h-9 sm:w-10 sm:h-10 border border-white/10 hover:border-white/60 transition-transform active:scale-95 cursor-crosshair"
                    />
                  ))}
                </div>
              </div>

              <div className="md:col-span-5 space-y-4">
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-medium text-slate-400">Renk Paleti</span>
                    <label className="flex items-center gap-2 text-xs text-slate-300 cursor-pointer">
                      <span>Özel:</span>
                      <input
                        type="color"
                        value={brushColor}
                        onChange={(e) => setBrushColor(e.target.value)}
                        className="w-7 h-7 rounded cursor-pointer bg-transparent border-0"
                      />
                    </label>
                  </div>
                  <div className="grid grid-cols-5 gap-2">
                    {PALETTE.map((c) => (
                      <button
                        key={c}
                        type="button"
                        onClick={() => {
                          setBrushColor(c);
                          if (tool === 'eraser' || tool === 'eyedropper') setTool('brush');
                        }}
                        style={{ backgroundColor: c }}
                        className={`h-9 rounded-lg border-2 cursor-pointer transition-transform ${
                          brushColor.toLowerCase() === c.toLowerCase()
                            ? 'border-white scale-105'
                            : 'border-slate-700 hover:scale-105'
                        }`}
                      />
                    ))}
                  </div>
                </div>

                {statusMsg && (
                  <div className="px-3 py-2 rounded-lg bg-emerald-500/15 border border-emerald-500/40 text-xs text-emerald-300">
                    {statusMsg}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-slate-800 bg-slate-950/60">
          <span className="text-xs text-slate-400">
            {user
              ? 'Google hesabınla buluta senkronize edilir.'
              : 'Bulut kaydı için ana menüden giriş yapabilirsin (şimdilik tarayıcıda saklanır).'}
          </span>
          <div className="flex items-center gap-3">
            <button
              onClick={onClose}
              className="px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-sm font-medium text-slate-200 cursor-pointer"
            >
              Kapat
            </button>
            <button
              onClick={handleSaveAndUse}
              disabled={saving}
              className="flex items-center gap-2 px-5 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-60 text-sm font-semibold text-white cursor-pointer"
            >
              {saving ? <Save className="w-4 h-4" /> : <Check className="w-4 h-4" />}
              {saving ? 'Kaydediliyor...' : 'Kaydet ve Skini Kullan'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
