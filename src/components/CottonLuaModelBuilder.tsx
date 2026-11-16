import { Box, Check, Copy, Download, Plus, RotateCw, Trash2 } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { CuboidPart, CustomModel3D } from '../types/game';

interface CottonLuaModelBuilderProps {
  models: Record<string, CustomModel3D>;
  onSaveModel: (name: string, model: CustomModel3D) => void;
  onDeleteModel: (name: string) => void;
  onInsertCodeSnippet: (snippet: string) => void;
}

const MODEL_PRESETS: { id: string; label: string; parts: CuboidPart[] }[] = [
  {
    id: 'gun',
    label: 'Plazma Tüfeği',
    parts: [
      { id: 'p1', name: 'Kabza', x: 6, y: 2, z: 7, w: 4, h: 6, d: 3, color: '#1e293b', rotX: 8, rotY: 0, rotZ: 0 },
      { id: 'p2', name: 'Govde', x: 5, y: 7, z: 3, w: 6, h: 4, d: 10, color: '#0f172a', rotX: 0, rotY: 0, rotZ: 0 },
      { id: 'p3', name: 'LazerNamlu', x: 6, y: 8, z: 0, w: 4, h: 2, d: 14, color: '#22d3ee', rotX: 0, rotY: 0, rotZ: 0 },
      { id: 'p4', name: 'Durbun', x: 7, y: 11, z: 6, w: 2, h: 2, d: 5, color: '#f43f5e', rotX: 0, rotY: 0, rotZ: 0 },
    ],
  },
  {
    id: 'sword',
    label: 'Enerji Kılıcı',
    parts: [
      { id: 's1', name: 'Sap', x: 7, y: 1, z: 7, w: 2, h: 4, d: 2, color: '#78350f', rotX: 0, rotY: 0, rotZ: 0 },
      { id: 's2', name: 'Kabza', x: 4, y: 5, z: 6, w: 8, h: 2, d: 4, color: '#facc15', rotX: 0, rotY: 0, rotZ: 0 },
      { id: 's3', name: 'KilicNamlu', x: 6, y: 7, z: 7, w: 4, h: 9, d: 2, color: '#38bdf8', rotX: 0, rotY: 0, rotZ: 0 },
    ],
  },
  {
    id: 'altar',
    label: 'Sunak / Masa',
    parts: [
      { id: 'a1', name: 'Taban', x: 2, y: 0, z: 2, w: 12, h: 2, d: 12, color: '#475569', rotX: 0, rotY: 0, rotZ: 0 },
      { id: 'a2', name: 'Sutun', x: 5, y: 2, z: 5, w: 6, h: 8, d: 6, color: '#64748b', rotX: 0, rotY: 0, rotZ: 0 },
      { id: 'a3', name: 'UstTabla', x: 1, y: 10, z: 1, w: 14, h: 3, d: 14, color: '#94a3b8', rotX: 0, rotY: 0, rotZ: 0 },
      { id: 'a4', name: 'Kristal', x: 6, y: 13, z: 6, w: 4, h: 3, d: 4, color: '#a855f7', rotX: 0, rotY: 45, rotZ: 0 },
    ],
  },
  {
    id: 'crystal',
    label: 'Kristal Kule',
    parts: [
      { id: 'c1', name: 'Kaide', x: 3, y: 0, z: 3, w: 10, h: 3, d: 10, color: '#334155', rotX: 0, rotY: 0, rotZ: 0 },
      { id: 'c2', name: 'AnaKristal', x: 5, y: 3, z: 5, w: 6, h: 11, d: 6, color: '#c084fc', rotX: 0, rotY: 22, rotZ: 0 },
      { id: 'c3', name: 'Yuzuk', x: 4, y: 8, z: 4, w: 8, h: 2, d: 8, color: '#38bdf8', rotX: 12, rotY: 0, rotZ: 12 },
    ],
  },
];

export function CottonLuaModelBuilder({
  models,
  onSaveModel,
  onDeleteModel,
  onInsertCodeSnippet,
}: CottonLuaModelBuilderProps) {
  const [modelName, setModelName] = useState('ozel_model_3d');
  const [parts, setParts] = useState<CuboidPart[]>(MODEL_PRESETS[0].parts);
  const [selectedId, setSelectedId] = useState<string>(MODEL_PRESETS[0].parts[0].id);
  const [statusMsg, setStatusMsg] = useState('');

  const canvasMountRef = useRef<HTMLDivElement>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const modelRootRef = useRef<THREE.Group | null>(null);
  const orbitRef = useRef({ yaw: 0.75, pitch: 0.45, dist: 2.1, dragging: false, lastX: 0, lastY: 0 });
  const partsRef = useRef(parts);
  partsRef.current = parts;
  const selectedIdRef = useRef(selectedId);
  selectedIdRef.current = selectedId;

  useEffect(() => {
    const mount = canvasMountRef.current;
    if (!mount) return;

    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: true,
      preserveDrawingBuffer: true,
    });
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.setSize(320, 260);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    mount.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(42, 320 / 260, 0.1, 30);

    const hemi = new THREE.HemisphereLight(0xf8fafc, 0x334155, 1.15);
    scene.add(hemi);
    const dir = new THREE.DirectionalLight(0xffffff, 1.1);
    dir.position.set(2.5, 4, 3);
    scene.add(dir);

    const grid = new THREE.GridHelper(1.2, 16, 0x38bdf8, 0x334155);
    grid.position.y = -0.5;
    scene.add(grid);

    const boundsGeo = new THREE.EdgesGeometry(new THREE.BoxGeometry(1, 1, 1));
    const boundsMat = new THREE.LineBasicMaterial({ color: 0x475569, transparent: true, opacity: 0.4 });
    const boundsWire = new THREE.LineSegments(boundsGeo, boundsMat);
    scene.add(boundsWire);

    const root = new THREE.Group();
    scene.add(root);
    modelRootRef.current = root;

    const el = renderer.domElement;
    const onDown = (e: MouseEvent) => {
      orbitRef.current.dragging = true;
      orbitRef.current.lastX = e.clientX;
      orbitRef.current.lastY = e.clientY;
    };
    const onMove = (e: MouseEvent) => {
      if (!orbitRef.current.dragging) return;
      const dx = e.clientX - orbitRef.current.lastX;
      const dy = e.clientY - orbitRef.current.lastY;
      orbitRef.current.lastX = e.clientX;
      orbitRef.current.lastY = e.clientY;
      orbitRef.current.yaw -= dx * 0.012;
      orbitRef.current.pitch = THREE.MathUtils.clamp(orbitRef.current.pitch + dy * 0.012, -1.2, 1.3);
    };
    const onUp = () => {
      orbitRef.current.dragging = false;
    };
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      orbitRef.current.dist = THREE.MathUtils.clamp(orbitRef.current.dist + e.deltaY * 0.0015, 1.1, 4.0);
    };

    el.addEventListener('mousedown', onDown);
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    el.addEventListener('wheel', onWheel, { passive: false });

    let frameId = 0;
    const renderLoop = () => {
      const o = orbitRef.current;
      const r = o.dist;
      camera.position.set(
        Math.cos(o.pitch) * Math.sin(o.yaw) * r,
        Math.sin(o.pitch) * r,
        Math.cos(o.pitch) * Math.cos(o.yaw) * r,
      );
      camera.lookAt(0, 0, 0);
      renderer.render(scene, camera);
      frameId = requestAnimationFrame(renderLoop);
    };
    renderLoop();

    return () => {
      cancelAnimationFrame(frameId);
      el.removeEventListener('mousedown', onDown);
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      el.removeEventListener('wheel', onWheel);
      boundsGeo.dispose();
      boundsMat.dispose();
      renderer.dispose();
      if (el.parentNode === mount) mount.removeChild(el);
    };
  }, []);

  // Sync parts to 3D viewport whenever parts or selection changes
  useEffect(() => {
    const root = modelRootRef.current;
    if (!root) return;
    while (root.children.length > 0) {
      const ch = root.children[0] as THREE.Mesh;
      ch.geometry?.dispose();
      if (Array.isArray(ch.material)) ch.material.forEach((m) => m.dispose());
      else ch.material?.dispose();
      root.remove(ch);
    }

    const s = 1 / 16;
    for (const part of parts) {
      const geo = new THREE.BoxGeometry(
        Math.max(0.02, part.w * s),
        Math.max(0.02, part.h * s),
        Math.max(0.02, part.d * s),
      );
      const isSel = part.id === selectedId;
      const mat = new THREE.MeshStandardMaterial({
        color: part.color || '#94a3b8',
        roughness: 0.55,
        metalness: 0.15,
        emissive: isSel ? new THREE.Color('#38bdf8') : new THREE.Color('#000000'),
        emissiveIntensity: isSel ? 0.22 : 0,
      });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(
        (part.x + part.w * 0.5 - 8) * s,
        (part.y + part.h * 0.5 - 8) * s,
        (part.z + part.d * 0.5 - 8) * s,
      );
      mesh.rotation.set(
        THREE.MathUtils.degToRad(part.rotX || 0),
        THREE.MathUtils.degToRad(part.rotY || 0),
        THREE.MathUtils.degToRad(part.rotZ || 0),
        'XYZ',
      );
      root.add(mesh);
    }
  }, [parts, selectedId]);

  const selected = parts.find((p) => p.id === selectedId) || parts[0];

  const updateSelected = (patch: Partial<CuboidPart>) => {
    if (!selected) return;
    setParts((prev) => prev.map((p) => (p.id === selected.id ? { ...p, ...patch } : p)));
  };

  const addPart = () => {
    const id = `part_${Date.now().toString(36)}`;
    const next: CuboidPart = {
      id,
      name: `Parca_${parts.length + 1}`,
      x: 5,
      y: 5,
      z: 5,
      w: 6,
      h: 6,
      d: 6,
      color: '#38bdf8',
      rotX: 0,
      rotY: 0,
      rotZ: 0,
    };
    setParts((prev) => [...prev, next]);
    setSelectedId(id);
  };

  const captureThumbnailPng = (): string | undefined => {
    try {
      const rawCanvas = rendererRef.current?.domElement;
      if (!rawCanvas) return undefined;
      const small = document.createElement('canvas');
      small.width = 48;
      small.height = 48;
      const ctx = small.getContext('2d')!;
      ctx.drawImage(rawCanvas, 0, 0, 48, 48);
      return small.toDataURL('image/png');
    } catch {
      return undefined;
    }
  };

  const handleSave = () => {
    const clean = modelName.trim().slice(0, 36);
    if (!clean || parts.length === 0) return;
    const thumb = captureThumbnailPng();
    onSaveModel(clean, { parts: parts.map((p) => ({ ...p })), thumbnailPng: thumb });
    setStatusMsg(`3D Model "${clean}" + PNG küçük resmi moda kaydedildi!`);
  };

  const handleDownloadThumbnail = () => {
    const thumb = captureThumbnailPng();
    if (!thumb) return;
    const a = document.createElement('a');
    a.href = thumb;
    a.download = `${(modelName || 'model').replace(/\s+/g, '_')}.png`;
    a.click();
  };

  const savedEntries = Object.entries(models);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
      {/* Left: 3D Preview & Presets */}
      <div className="lg:col-span-5 p-5 rounded-2xl bg-slate-950/90 border border-slate-800 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              <Box className="w-4 h-4 text-sky-400" /> 3D Model Yapıcı (0–16 Birim)
            </h3>
            <p className="text-[11px] text-slate-400">Sürükle: Döndür · Kaydır: Yakınlaş</p>
          </div>
          <button
            onClick={() => {
              orbitRef.current.yaw = 0.75;
              orbitRef.current.pitch = 0.45;
              orbitRef.current.dist = 2.1;
            }}
            className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 cursor-pointer"
            title="Kamerayı sıfırla"
          >
            <RotateCw className="w-4 h-4" />
          </button>
        </div>

        <div className="flex justify-center rounded-xl bg-slate-900 border border-slate-800 p-2 overflow-hidden">
          <div ref={canvasMountRef} className="cursor-grab active:cursor-grabbing" />
        </div>

        <div className="flex flex-wrap gap-1.5">
          {MODEL_PRESETS.map((pr) => (
            <button
              key={pr.id}
              onClick={() => {
                setParts(pr.parts.map((p) => ({ ...p })));
                setSelectedId(pr.parts[0].id);
              }}
              className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-[11px] text-slate-200 cursor-pointer"
            >
              {pr.label}
            </button>
          ))}
        </div>

        <div className="space-y-2 pt-2 border-t border-slate-800">
          <label className="block text-xs text-slate-400">Model Adı (Kodda mod.model("...") ile çağrılır)</label>
          <input
            type="text"
            value={modelName}
            onChange={(e) => setModelName(e.target.value)}
            className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-xs text-white"
          />
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={handleSave}
              className="flex items-center justify-center gap-1.5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-xs font-bold text-white cursor-pointer"
            >
              <Plus className="w-4 h-4" /> Modele Kaydet
            </button>
            <button
              onClick={() => {
                handleSave();
                onInsertCodeSnippet(`mod.model("${modelName.trim() || 'ozel_model_3d'}")`);
              }}
              className="flex items-center justify-center gap-1.5 py-2.5 rounded-xl bg-sky-600 hover:bg-sky-500 text-xs font-bold text-white cursor-pointer"
            >
              <Check className="w-4 h-4" /> Kaydet & Koda Ekle
            </button>
          </div>
          <button
            onClick={handleDownloadThumbnail}
            className="w-full flex items-center justify-center gap-1.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-[11px] text-slate-300 cursor-pointer"
          >
            <Download className="w-3.5 h-3.5" /> Model PNG Önizlemesini İndir
          </button>
          {statusMsg && (
            <div className="text-[11px] text-emerald-300 bg-emerald-500/10 border border-emerald-500/30 rounded-lg px-3 py-2">
              {statusMsg}
            </div>
          )}
        </div>
      </div>

      {/* Middle & Right: Parts Inspector + Saved Models */}
      <div className="lg:col-span-7 space-y-4">
        <div className="p-5 rounded-2xl bg-slate-950/90 border border-slate-800 space-y-4">
          <div className="flex items-center justify-between">
            <h4 className="text-sm font-bold text-white">Küp Parçaları ({parts.length})</h4>
            <button
              onClick={addPart}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-500 text-xs font-bold text-white cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" /> Parça Ekle
            </button>
          </div>

          <div className="flex flex-wrap gap-1.5">
            {parts.map((p) => (
              <div
                key={p.id}
                onClick={() => setSelectedId(p.id)}
                className={`flex items-center gap-2 px-2.5 py-1.5 rounded-lg border text-xs cursor-pointer ${
                  p.id === selected?.id
                    ? 'bg-sky-500/20 border-sky-400 text-white'
                    : 'bg-slate-900 border-slate-800 text-slate-300'
                }`}
              >
                <span className="w-3 h-3 rounded-sm" style={{ backgroundColor: p.color }} />
                <span>{p.name}</span>
                {parts.length > 1 && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      const filtered = parts.filter((x) => x.id !== p.id);
                      setParts(filtered);
                      if (selected?.id === p.id) setSelectedId(filtered[0].id);
                    }}
                    className="text-slate-400 hover:text-rose-400 cursor-pointer"
                  >
                    ×
                  </button>
                )}
              </div>
            ))}
          </div>

          {selected && (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 pt-2 border-t border-slate-800 text-xs">
              <div>
                <label className="text-slate-400 block mb-1">Parça Adı</label>
                <input
                  type="text"
                  value={selected.name}
                  onChange={(e) => updateSelected({ name: e.target.value })}
                  className="w-full px-2.5 py-1.5 rounded-lg bg-slate-900 border border-slate-700 text-white"
                />
              </div>
              <div>
                <label className="text-slate-400 block mb-1">Renk</label>
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    value={selected.color}
                    onChange={(e) => updateSelected({ color: e.target.value })}
                    className="w-9 h-8 rounded bg-transparent border border-slate-700 cursor-pointer"
                  />
                  <span className="font-mono text-[11px] text-slate-300">{selected.color}</span>
                </div>
              </div>
              <div className="hidden sm:block" />

              {(
                [
                  ['x', 'Konum X', 0, 15],
                  ['y', 'Konum Y', 0, 15],
                  ['z', 'Konum Z', 0, 15],
                  ['w', 'Genişlik W', 1, 16],
                  ['h', 'Yükseklik H', 1, 16],
                  ['d', 'Derinlik D', 1, 16],
                  ['rotX', 'Dönüş X°', -180, 180],
                  ['rotY', 'Dönüş Y°', -180, 180],
                  ['rotZ', 'Dönüş Z°', -180, 180],
                ] as const
              ).map(([field, label, min, max]) => (
                <div key={field}>
                  <div className="flex justify-between text-slate-400 mb-0.5">
                    <span>{label}</span>
                    <span className="font-mono text-sky-300">{selected[field] ?? 0}</span>
                  </div>
                  <input
                    type="range"
                    min={min}
                    max={max}
                    step={field.startsWith('rot') ? 5 : 0.5}
                    value={selected[field] ?? 0}
                    onChange={(e) => updateSelected({ [field]: Number(e.target.value) })}
                    className="w-full"
                  />
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Saved Models List */}
        <div className="p-5 rounded-2xl bg-slate-950/90 border border-slate-800 space-y-3">
          <h4 className="text-sm font-bold text-white">Moddaki 3D Modeller ({savedEntries.length})</h4>
          {savedEntries.length === 0 ? (
            <p className="text-xs text-slate-400">Henüz kayıtlı 3D model yok.</p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              {savedEntries.map(([name, m]) => (
                <div
                  key={name}
                  className="p-2.5 rounded-xl bg-slate-900 border border-slate-800 flex items-center justify-between gap-2"
                >
                  <div
                    onClick={() => {
                      setModelName(name);
                      setParts(m.parts.map((p) => ({ ...p })));
                      if (m.parts[0]) setSelectedId(m.parts[0].id);
                    }}
                    className="flex items-center gap-2.5 min-w-0 cursor-pointer"
                  >
                    {m.thumbnailPng ? (
                      <img
                        src={m.thumbnailPng}
                        alt={name}
                        className="w-10 h-10 rounded-lg border border-white/15 bg-slate-950 shrink-0"
                      />
                    ) : (
                      <div className="w-10 h-10 rounded-lg bg-slate-800 flex items-center justify-center shrink-0">
                        <Box className="w-5 h-5 text-sky-400" />
                      </div>
                    )}
                    <div className="min-w-0">
                      <div className="text-xs font-bold text-white truncate">{name}</div>
                      <div className="text-[10px] text-slate-400">
                        {m.parts.length} Parça · mod.model("{name}")
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      onClick={() => onInsertCodeSnippet(`mod.model("${name}")`)}
                      className="p-1.5 rounded-lg bg-slate-800 hover:bg-sky-600 text-slate-300 hover:text-white cursor-pointer"
                      title="Koda ekle"
                    >
                      <Copy className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => onDeleteModel(name)}
                      className="p-1.5 rounded-lg bg-slate-800 hover:bg-rose-600 text-slate-300 hover:text-white cursor-pointer"
                      title="Sil"
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
    </div>
  );
}
