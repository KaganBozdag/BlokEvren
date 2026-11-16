import { User } from 'firebase/auth';
import {
  ArrowLeft,
  BookOpen,
  Box,
  Check,
  Code2,
  Copy,
  Download,
  Image as ImageIcon,
  Play,
  Share2,
  Sparkles,
  Upload,
} from 'lucide-react';
import { useMemo, useRef, useState } from 'react';
import { BUILTIN_COTTON_APIS } from '../cottonlua/builtinApis';
import { CompiledCottonLuaResult, compileCottonLuaMod } from '../cottonlua/cottonLuaEngine';
import { COTTONLUA_TEMPLATES } from '../cottonlua/cottonLuaRuntime';
import { CustomModel3D, ModDefinition } from '../types/game';
import { CottonLuaModelBuilder } from './CottonLuaModelBuilder';
import { CottonLuaTextureMaker } from './CottonLuaTextureMaker';

interface CottonLuaEditorModalProps {
  user: User | null;
  username?: string | null;
  availableMods: ModDefinition[];
  editingMod?: ModDefinition | null;
  onSaveMod: (mod: ModDefinition, publish: boolean) => Promise<void> | void;
  onBackToChoice: () => void;
}

type StudioSubTab = 'code' | 'model3d' | 'texturePng' | 'docs';

const SNIPPETS: { label: string; code: string }[] = [
  {
    label: '+ Blok',
    code: `\nAddthing{\n  local thingType = block\n  local thingName = "Özel Blok"\n  local thingStyle = normalBlock\n  local thingColor = "#38bdf8"\n  local hardness = 1.5\n  local glow = true\n}\n`,
  },
  {
    label: '+ Silah (Gun)',
    code: `\nAddthing{\n  local thingType = gun\n  local thingName = "Yıldız Tabancası"\n  local thingColor = "#f43f5e"\n  weapon = {\n    weaponKind = "gun",\n    damage = 14,\n    cooldown = 0.2,\n    projectileSpeed = 45,\n    projectileColor = "#fb7185",\n    explosionPower = 1.5\n  },\n  animation = { style = "recoil", speed = 2, amplitude = 0.25, recoil = 0.16 }\n}\n`,
  },
  {
    label: '+ İnşa onPlace',
    code: `\nAddthing{\n  local thingType = block\n  local thingName = "İnşa Çekirdeği"\n  local thingColor = "#f59e0b"\n  onPlace = function(ctx)\n    world.setBlockRel(ctx.x, ctx.y, ctx.z, 0, 1, 0, "glowstone")\n    world.setBlockRel(ctx.x, ctx.y, ctx.z, 1, 1, 0, "oak_planks")\n    world.setBlockRel(ctx.x, ctx.y, ctx.z, -1, 1, 0, "oak_planks")\n    world.spawnParticles(ctx.x, ctx.y + 1, ctx.z, "#fbbf24", 12)\n  end\n}\n`,
  },
  {
    label: '+ /Komut',
    code: `\nAddCommand{\n  name = "hediye",\n  desc = "Özel CottonLua komutu",\n  run = function(ctx)\n    ctx.give("diamond", 5)\n    ctx.say("CottonLua /hediye komutu çalıştı!")\n  end\n}\n`,
  },
  {
    label: '+ Başarım',
    code: `\nAddthing{\n  local thingType = achievement\n  local achievementCode = ilk_basarim\n  local thingName = "İlk CottonLua Başarımı"\n  local description = "Hayatta kalma modunda achievementTake(ilk_basarim) ile açılır."\n  local tier = gold\n  local points = 40\n}\n-- Hook içinde tetiklemek için: achievementTake(ilk_basarim)\n`,
  },
  {
    label: '+ Sıvı & Kova',
    code: `\nAddthing{\n  local thingType = liquid\n  local thingName = "Büyü İksiri"\n  local bucketName = "Büyü İksiri Kovası"\n  local thingColor = "#a855f7"\n  local secondaryColor = "#e879f9"\n  local thingStyle = water\n  -- local thingTexture = mod.texture("SiviDokusu")\n  local transparent = true\n  local glow = true\n  local harmful = false\n  local flowRange = 5\n  local flowSpeed = fast\n}\n`,
  },
  {
    label: '+ 3×3 Tarif',
    code: `\n  recipe = {\n    count = 2,\n    shape = {\n      "AAA",\n      "ABA",\n      "AAA"\n    },\n    keys = { A = "cobblestone", B = "gold_ingot" }\n  }\n`,
  },
];

export function CottonLuaEditorModal({
  user,
  username,
  availableMods,
  editingMod,
  onSaveMod,
  onBackToChoice,
}: CottonLuaEditorModalProps) {
  const [subTab, setSubTab] = useState<StudioSubTab>('code');
  const [modId, setModId] = useState(
    () => editingMod?.id || `cotton_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
  );
  const [modName, setModName] = useState(editingMod?.name || 'Benim CottonLua Modum');
  const [modVersion, setModVersion] = useState(editingMod?.version || '1.0.0');
  const [modDesc, setModDesc] = useState(
    editingMod?.description || 'CottonLua kodlama dili ile geliştirilmiş özel mod paketi.',
  );
  const [isPublic, setIsPublic] = useState(editingMod?.isPublic ?? true);
  const [luaSource, setLuaSource] = useState(
    editingMod?.luaSource || COTTONLUA_TEMPLATES[0].code,
  );
  const [pngTextures, setPngTextures] = useState<Record<string, string>>(
    editingMod?.pngTextures || {},
  );
  const [models3d, setModels3d] = useState<Record<string, CustomModel3D>>(
    editingMod?.models3d || {},
  );
  const [compileResult, setCompileResult] = useState<CompiledCottonLuaResult | null>(null);
  const [selectedApiId, setSelectedApiId] = useState(BUILTIN_COTTON_APIS[0].id);
  const [saving, setSaving] = useState(false);
  const [banner, setBanner] = useState('');

  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const runCompile = (): CompiledCottonLuaResult => {
    const res = compileCottonLuaMod(luaSource, {
      modId,
      modName,
      modVersion,
      modDescription: modDesc,
      pngTextures,
      models3d,
      availableMods: [...BUILTIN_COTTON_APIS, ...availableMods],
    });
    setCompileResult(res);
    if (res.ok && res.modName && res.modName !== 'CottonLua Mod') {
      setModName(res.modName);
    }
    return res;
  };

  const insertSnippet = (snippet: string) => {
    const el = textareaRef.current;
    if (el) {
      const start = el.selectionStart ?? luaSource.length;
      const end = el.selectionEnd ?? luaSource.length;
      const next = luaSource.slice(0, start) + snippet + luaSource.slice(end);
      setLuaSource(next);
      setSubTab('code');
      setTimeout(() => {
        el.focus();
        el.setSelectionRange(start + snippet.length, start + snippet.length);
      }, 30);
    } else {
      setLuaSource((prev) => prev + '\n' + snippet);
      setSubTab('code');
    }
  };

  const buildModPackage = (res: CompiledCottonLuaResult, publish: boolean): ModDefinition => ({
    id: modId,
    name: (res.modName || modName || 'CottonLua Mod').slice(0, 64),
    description: (res.modDescription || modDesc || 'CottonLua modu').slice(0, 300),
    version: (res.modVersion || modVersion || '1.0.0').slice(0, 16),
    authorId: editingMod?.authorId || user?.uid || 'local',
    authorName: editingMod?.authorName || username || user?.displayName || 'CottonLua Yapımcısı',
    isPublic: publish && isPublic,
    likes: editingMod?.likes || 0,
    isCottonLua: true,
    luaSource,
    dependencies: res.dependencies,
    pngTextures,
    models3d,
    blocks: res.blocks,
    items: res.items,
    tools: res.tools,
    recipes: res.recipes,
    commands: res.commands,
    achievements: res.achievements,
  });

  const handleSave = async (publish: boolean) => {
    const res = runCompile();
    if (!res.ok) {
      setBanner('Kodda hata var! Önce konsoldaki CottonLua hatalarını düzelt.');
      setSubTab('code');
      return;
    }
    if (publish && !user) {
      setBanner('Toplulukla paylaşmak için Google hesabınla giriş yapmalısın.');
      return;
    }
    setSaving(true);
    try {
      const pkg = buildModPackage(res, publish);
      await onSaveMod(pkg, publish);
      setBanner(
        publish
          ? `"${pkg.name}" derlendi, aktifleştirildi ve buluta yüklendi! (ID: ${pkg.id})`
          : `"${pkg.name}" derlendi ve oyun içinde aktifleştirildi!`,
      );
    } finally {
      setSaving(false);
    }
  };

  const handleExportJson = () => {
    const res = runCompile();
    const pkg = buildModPackage(res, false);
    const blob = new Blob([JSON.stringify(pkg, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${pkg.name.replace(/\s+/g, '_').toLowerCase()}.cottonlua.json`;
    a.click();
    URL.revokeObjectURL(url);
    setBanner('CottonLua modu (.json) indirildi!');
  };

  const handleImportJson = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(String(reader.result)) as ModDefinition;
        if (parsed.id) setModId(parsed.id);
        if (parsed.name) setModName(parsed.name);
        if (parsed.version) setModVersion(parsed.version);
        if (parsed.description) setModDesc(parsed.description);
        if (parsed.luaSource) setLuaSource(parsed.luaSource);
        if (parsed.pngTextures) setPngTextures(parsed.pngTextures);
        if (parsed.models3d) setModels3d(parsed.models3d);
        setBanner(`"${parsed.name || 'Mod'}" JSON’dan yüklendi!`);
      } catch {
        setBanner('JSON dosyası okunamadı.');
      }
    };
    reader.readAsText(file);
  };

  const selectedApi = useMemo(
    () => BUILTIN_COTTON_APIS.find((a) => a.id === selectedApiId) || BUILTIN_COTTON_APIS[0],
    [selectedApiId],
  );

  return (
    <div className="flex flex-col gap-4 h-full">
      {/* Top Studio Bar */}
      <div className="p-4 rounded-2xl bg-slate-950/90 border border-slate-800 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <button
            onClick={onBackToChoice}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-slate-200 cursor-pointer"
          >
            <ArrowLeft className="w-4 h-4" /> Seçime Dön
          </button>
          <div>
            <div className="flex items-center gap-2">
              <span className="px-2 py-0.5 rounded bg-violet-500/20 border border-violet-500/40 text-[10px] font-bold text-violet-300">
                COTTONLUA IDE
              </span>
              <span className="text-xs font-mono text-slate-400">
                Mod ID: <strong className="text-sky-300">{modId}</strong>
              </span>
              <button
                onClick={() => {
                  navigator.clipboard?.writeText(modId);
                  setBanner(`Mod ID "${modId}" panoya kopyalandı!`);
                }}
                className="p-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 cursor-pointer"
                title="Mod ID Kopyala"
              >
                <Copy className="w-3 h-3" />
              </button>
            </div>
            <div className="flex flex-wrap items-center gap-2 mt-1.5">
              <input
                type="text"
                value={modName}
                onChange={(e) => setModName(e.target.value)}
                placeholder="Mod Adı"
                className="px-2.5 py-1 rounded-lg bg-slate-900 border border-slate-700 text-xs font-semibold text-white w-48"
              />
              <input
                type="text"
                value={modVersion}
                onChange={(e) => setModVersion(e.target.value)}
                placeholder="1.0.0"
                className="px-2.5 py-1 rounded-lg bg-slate-900 border border-slate-700 text-xs text-slate-200 w-20 font-mono"
              />
              <input
                type="text"
                value={modDesc}
                onChange={(e) => setModDesc(e.target.value)}
                placeholder="Kısa açıklama"
                className="px-2.5 py-1 rounded-lg bg-slate-900 border border-slate-700 text-xs text-slate-300 w-64"
              />
              <label className="flex items-center gap-1.5 text-[11px] text-slate-300 cursor-pointer">
                <input
                  type="checkbox"
                  checked={isPublic}
                  onChange={(e) => setIsPublic(e.target.checked)}
                />
                Herkese Açık
              </label>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <label className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs text-slate-200 cursor-pointer">
            <Upload className="w-3.5 h-3.5" /> JSON Yükle
            <input type="file" accept=".json" onChange={handleImportJson} className="hidden" />
          </label>
          <button
            onClick={handleExportJson}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs text-slate-200 cursor-pointer"
          >
            <Download className="w-3.5 h-3.5" /> JSON İndir
          </button>
          <button
            onClick={runCompile}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-amber-600 hover:bg-amber-500 text-xs font-bold text-white cursor-pointer"
          >
            <Play className="w-3.5 h-3.5" /> Derle & Test Et
          </button>
          <button
            disabled={saving}
            onClick={() => handleSave(false)}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-xs font-bold text-white cursor-pointer"
          >
            <Check className="w-3.5 h-3.5" /> Kaydet & Aktif Et
          </button>
          <button
            disabled={saving}
            onClick={() => handleSave(true)}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-sky-600 hover:bg-sky-500 disabled:opacity-50 text-xs font-bold text-white cursor-pointer"
          >
            <Share2 className="w-3.5 h-3.5" /> Bulutta Yayınla
          </button>
        </div>
      </div>

      {banner && (
        <div className="px-4 py-2 rounded-xl bg-sky-500/15 border border-sky-500/40 text-xs text-sky-200 flex justify-between items-center">
          <span>{banner}</span>
          <button onClick={() => setBanner('')} className="text-sky-300 hover:text-white cursor-pointer">
            ×
          </button>
        </div>
      )}

      {/* Sub-tabs */}
      <div className="flex flex-wrap items-center gap-2">
        <button
          onClick={() => setSubTab('code')}
          className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold cursor-pointer ${
            subTab === 'code'
              ? 'bg-violet-600 text-white'
              : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
          }`}
        >
          <Code2 className="w-4 h-4" /> CottonLua Kod Editörü
        </button>
        <button
          onClick={() => setSubTab('model3d')}
          className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold cursor-pointer ${
            subTab === 'model3d'
              ? 'bg-sky-600 text-white'
              : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
          }`}
        >
          <Box className="w-4 h-4" /> 3D Model Yapıcı ({Object.keys(models3d).length})
        </button>
        <button
          onClick={() => setSubTab('texturePng')}
          className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold cursor-pointer ${
            subTab === 'texturePng'
              ? 'bg-emerald-600 text-white'
              : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
          }`}
        >
          <ImageIcon className="w-4 h-4" /> PNG Texture Yapıcı ({Object.keys(pngTextures).length})
        </button>
        <button
          onClick={() => setSubTab('docs')}
          className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold cursor-pointer ${
            subTab === 'docs'
              ? 'bg-amber-600 text-white'
              : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
          }`}
        >
          <BookOpen className="w-4 h-4" /> Dil Haritası & Resmi API’ler
        </button>
      </div>

      {/* Content */}
      {subTab === 'code' && (
        <div className="grid grid-cols-1 xl:grid-cols-12 gap-4 flex-1 min-h-0">
          {/* Code Editor (8 cols) */}
          <div className="xl:col-span-8 p-4 rounded-2xl bg-slate-950 border border-slate-800 flex flex-col gap-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="text-[11px] font-bold text-slate-400 mr-1">Şablonlar:</span>
                {COTTONLUA_TEMPLATES.map((tpl) => (
                  <button
                    key={tpl.id}
                    onClick={() => {
                      setLuaSource(tpl.code);
                      setBanner(`"${tpl.title}" şablonu yüklendi.`);
                    }}
                    className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-violet-600/80 text-[11px] text-slate-200 cursor-pointer"
                  >
                    {tpl.title}
                  </button>
                ))}
              </div>
              <div className="flex flex-wrap gap-1.5">
                {SNIPPETS.map((sn) => (
                  <button
                    key={sn.label}
                    onClick={() => insertSnippet(sn.code)}
                    className="px-2 py-1 rounded-lg bg-slate-900 border border-slate-700 hover:border-amber-400 text-[11px] text-amber-300 cursor-pointer"
                  >
                    {sn.label}
                  </button>
                ))}
              </div>
            </div>

            <textarea
              ref={textareaRef}
              value={luaSource}
              onChange={(e) => setLuaSource(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Tab') {
                  e.preventDefault();
                  const el = e.currentTarget;
                  const s = el.selectionStart;
                  const end = el.selectionEnd;
                  setLuaSource(luaSource.slice(0, s) + '  ' + luaSource.slice(end));
                  setTimeout(() => el.setSelectionRange(s + 2, s + 2), 0);
                }
              }}
              spellCheck={false}
              className="w-full flex-1 min-h-[380px] p-4 rounded-xl bg-slate-900 border border-slate-800 font-mono text-xs leading-relaxed text-emerald-200 focus:outline-none focus:border-violet-500 resize-none"
              placeholder="-- CottonLua kodunu buraya yaz..."
            />
          </div>

          {/* Live Compiler Console (4 cols) */}
          <div className="xl:col-span-4 p-4 rounded-2xl bg-slate-950 border border-slate-800 flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <h4 className="text-xs font-bold tracking-wider text-slate-200 flex items-center gap-1.5">
                <Sparkles className="w-4 h-4 text-amber-400" /> DERLEME KONSOLU
              </h4>
              {compileResult && (
                <span
                  className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                    compileResult.ok
                      ? 'bg-emerald-500/20 text-emerald-300'
                      : 'bg-rose-500/20 text-rose-300'
                  }`}
                >
                  {compileResult.ok ? 'BAŞARILI' : 'HATA'}
                </span>
              )}
            </div>

            {!compileResult ? (
              <div className="p-4 rounded-xl bg-slate-900 border border-slate-800 text-xs text-slate-400">
                Kodunu test etmek ve hangi blok/silah/tarif/komutların üretileceğini görmek için{' '}
                <strong className="text-amber-300">Derle & Test Et</strong> butonuna bas.
              </div>
            ) : (
              <div className="space-y-3 overflow-y-auto max-h-[420px] pr-1 text-xs">
                <div className="grid grid-cols-2 gap-2">
                  <div className="p-2 rounded-lg bg-slate-900 border border-slate-800">
                    Bloklar: <strong className="text-amber-300">{compileResult.blocks.length}</strong>
                  </div>
                  <div className="p-2 rounded-lg bg-slate-900 border border-slate-800">
                    Eşya/Silah: <strong className="text-rose-300">{compileResult.items.length}</strong>
                  </div>
                  <div className="p-2 rounded-lg bg-slate-900 border border-slate-800">
                    Aletler: <strong className="text-sky-300">{compileResult.tools.length}</strong>
                  </div>
                  <div className="p-2 rounded-lg bg-slate-900 border border-slate-800">
                    Tarif/Komut:{' '}
                    <strong className="text-emerald-300">
                      {compileResult.recipes.length}/{compileResult.commands.length}
                    </strong>
                  </div>
                  <div className="p-2 rounded-lg bg-slate-900 border border-slate-800 col-span-2">
                    Başarımlar (Hayatta Kalma):{' '}
                    <strong className="text-yellow-300">{compileResult.achievements.length}</strong>
                  </div>
                </div>

                {compileResult.dependencies.length > 0 && (
                  <div className="p-2.5 rounded-xl bg-violet-950/30 border border-violet-500/30">
                    <div className="text-[10px] font-bold text-violet-300 mb-1">
                      BAĞIMLILIKLAR (ID İLE)
                    </div>
                    <div className="flex flex-wrap gap-1">
                      {compileResult.dependencies.map((d) => (
                        <span
                          key={d}
                          className="px-2 py-0.5 rounded bg-slate-900 font-mono text-[10px] text-violet-200"
                        >
                          {d}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {compileResult.errors.map((err, i) => (
                  <div
                    key={i}
                    className="p-2.5 rounded-xl bg-rose-950/50 border border-rose-500/50 text-rose-200 font-mono text-[11px]"
                  >
                    HATA: {err}
                  </div>
                ))}

                {compileResult.warnings.map((w, i) => (
                  <div
                    key={i}
                    className="p-2.5 rounded-xl bg-amber-950/40 border border-amber-500/40 text-amber-200 text-[11px]"
                  >
                    UYARI: {w}
                  </div>
                ))}

                {compileResult.logs.length > 0 && (
                  <div className="p-2.5 rounded-xl bg-slate-900 border border-slate-800 space-y-1">
                    <div className="text-[10px] font-bold text-slate-400">PRINT ÇIKTILARI</div>
                    {compileResult.logs.map((l, i) => (
                      <div key={i} className="font-mono text-[11px] text-emerald-300">
                        &gt; {l}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {subTab === 'model3d' && (
        <CottonLuaModelBuilder
          models={models3d}
          onSaveModel={(name, model) => setModels3d((prev) => ({ ...prev, [name]: model }))}
          onDeleteModel={(name) =>
            setModels3d((prev) => {
              const next = { ...prev };
              delete next[name];
              return next;
            })
          }
          onInsertCodeSnippet={insertSnippet}
        />
      )}

      {subTab === 'texturePng' && (
        <CottonLuaTextureMaker
          textures={pngTextures}
          onSaveTexture={(name, url) => setPngTextures((prev) => ({ ...prev, [name]: url }))}
          onDeleteTexture={(name) =>
            setPngTextures((prev) => {
              const next = { ...prev };
              delete next[name];
              return next;
            })
          }
          onInsertCodeSnippet={insertSnippet}
        />
      )}

      {subTab === 'docs' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
          <div className="lg:col-span-5 p-4 rounded-2xl bg-slate-950 border border-slate-800 space-y-3">
            <h4 className="text-sm font-bold text-white">Resmi CottonLua API Paketleri</h4>
            <p className="text-xs text-slate-400">
              Bağımlılıklar isimle değil <strong>yayınlanmış ID</strong> ile yüklenir:{' '}
              <code className="text-sky-300">requireMod("api_id")</code>
            </p>
            <div className="space-y-2">
              {BUILTIN_COTTON_APIS.map((api) => (
                <div
                  key={api.id}
                  onClick={() => setSelectedApiId(api.id)}
                  className={`p-3 rounded-xl border cursor-pointer ${
                    selectedApi.id === api.id
                      ? 'bg-sky-500/15 border-sky-400'
                      : 'bg-slate-900 border-slate-800 hover:border-slate-700'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-bold text-white">{api.name}</span>
                    <span className="font-mono text-[10px] px-2 py-0.5 rounded bg-slate-950 text-sky-300">
                      {api.id}
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-400 mt-1">{api.description}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="lg:col-span-7 p-4 rounded-2xl bg-slate-950 border border-slate-800 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <h4 className="text-sm font-bold text-amber-300">{selectedApi.name}</h4>
                <div className="text-[11px] font-mono text-sky-300">
                  Yayınlanmış ID: {selectedApi.id}
                </div>
              </div>
              <button
                onClick={() =>
                  insertSnippet(
                    `\nlocal wantedMods = {"${selectedApi.id}"}\nlocal api = requireMod("${selectedApi.id}")\n`,
                  )
                }
                className="px-3 py-1.5 rounded-lg bg-sky-600 hover:bg-sky-500 text-xs font-bold text-white cursor-pointer"
              >
                requireMod Koda Ekle
              </button>
            </div>
            <pre className="p-4 rounded-xl bg-slate-900 border border-slate-800 text-[11px] font-mono text-emerald-200 overflow-x-auto max-h-[340px]">
              {selectedApi.luaSource}
            </pre>
            <div className="p-3 rounded-xl bg-amber-950/30 border border-amber-500/30 text-[11px] text-amber-100 space-y-1">
              <div className="font-bold text-amber-300">
                Başarım Sistemi (thingType = achievement & achievementTake)
              </div>
              <p className="text-slate-300">
                <code className="text-amber-300">local thingType = achievement</code> ve{' '}
                <code className="text-amber-300">local achievementCode = kodu</code> ile başarım tanımla,
                ardından herhangi bir olayda (<code className="text-emerald-300">onPlace</code>,{' '}
                <code className="text-emerald-300">onUse</code>, <code className="text-emerald-300">onBreak</code>,{' '}
                <code className="text-emerald-300">AddCommand</code>) <code className="text-sky-300">achievementTake(kodu)</code> çağır.
                Yalnızca <strong>Hayatta Kalma</strong> modunda tetiklenir ve Google hesabına kaydedilir.
              </p>
            </div>
            <div className="p-3 rounded-xl bg-cyan-950/30 border border-cyan-500/30 text-[11px] text-cyan-100 space-y-1">
              <div className="font-bold text-cyan-300">
                Akışkan Sıvı &amp; Kova Sistemi (thingType = liquid)
              </div>
              <p className="text-slate-300">
                <code className="text-cyan-300">local thingType = liquid</code> ile özel renk (
                <code className="text-cyan-300">thingColor</code>, <code className="text-cyan-300">secondaryColor</code>)
                ve özel PNG doku (<code className="text-cyan-300">thingTexture = mod.texture("...")</code>) tanımla.
                Otomatik olarak akışkan sıvı bloğu + <strong>Kova eşyası</strong> oluşturulur.{' '}
                <code className="text-emerald-300">flowRange</code>, <code className="text-emerald-300">flowSpeed</code> (fast/medium/slow),{' '}
                <code className="text-emerald-300">harmful</code> ve <code className="text-emerald-300">transparent</code> desteklenir.
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
