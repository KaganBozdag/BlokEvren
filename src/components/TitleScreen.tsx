import { User } from 'firebase/auth';
import {
  Edit3,
  Globe,
  Layers,
  LogIn,
  LogOut,
  PackagePlus,
  Palette,
  Play,
  Server,
  Trophy,
  Users,
} from 'lucide-react';
import { useState } from 'react';
import { signInWithGoogle, signOutUser } from '../services/cloudService';
import { GameMode, SkinData, WorldLaunchConfig, WorldType } from '../types/game';
import { TitleBackgroundCanvas } from './TitleBackgroundCanvas';

interface TitleScreenProps {
  user: User | null;
  username: string | null;
  friendCount: number;
  pendingFriendRequestCount: number;
  activeSkin: SkinData;
  enabledModCount: number;
  achievementUnlockedCount: number;
  achievementTotalCount: number;
  textureVersion: number;
  onStartWorld: (config: WorldLaunchConfig) => void;
  onOpenMultiplayer: () => void;
  onOpenFriends: () => void;
  onOpenUsernameSetup: () => void;
  onOpenSkinDesigner: () => void;
  onOpenModWorkshop: () => void;
  onOpenTexturePacks: () => void;
  onOpenAchievements: () => void;
}

export function TitleScreen({
  user,
  username,
  friendCount,
  pendingFriendRequestCount,
  activeSkin,
  enabledModCount,
  achievementUnlockedCount,
  achievementTotalCount,
  textureVersion,
  onStartWorld,
  onOpenMultiplayer,
  onOpenFriends,
  onOpenUsernameSetup,
  onOpenSkinDesigner,
  onOpenModWorkshop,
  onOpenTexturePacks,
  onOpenAchievements,
}: TitleScreenProps) {
  const [worldName, setWorldName] = useState('Yeni Dünyam');
  const [gameMode, setGameMode] = useState<GameMode>('survival');
  const [worldType, setWorldType] = useState<WorldType>('normal');
  const [seedInput, setSeedInput] = useState(() => String(Math.floor(1000 + Math.random() * 90000)));
  const [authLoading, setAuthLoading] = useState(false);

  const handleAuth = async () => {
    setAuthLoading(true);
    try {
      if (user) {
        await signOutUser();
      } else {
        await signInWithGoogle();
      }
    } finally {
      setAuthLoading(false);
    }
  };

  const handleSoloLaunch = (e: React.FormEvent) => {
    e.preventDefault();
    const numericSeed = parseInt(seedInput, 10) || 12345;
    onStartWorld({
      mode: 'solo',
      worldName: worldName.trim() || 'Yeni Dünyam',
      gameMode,
      worldType,
      seed: numericSeed,
      activeModIds: [],
    });
  };

  return (
    <div className="relative w-full h-full overflow-hidden flex flex-col justify-between">
      {/* Live 3D Voxel Landscape Backdrop */}
      <TitleBackgroundCanvas textureVersion={textureVersion} />
      <div className="absolute inset-0 bg-gradient-to-r from-slate-950/90 via-slate-950/65 to-slate-950/25 pointer-events-none" />

      {/* Top Account Strip */}
      <div className="relative z-10 flex items-center justify-between px-6 sm:px-10 pt-5">
        <div className="flex items-center gap-3">
          <svg
            width="36"
            height="36"
            viewBox="0 0 36 36"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            className="shrink-0"
          >
            <polygon points="18,2 33,10 18,18 3,10" fill="#34d399" />
            <polygon points="3,10 18,18 18,34 3,26" fill="#059669" />
            <polygon points="33,10 18,18 18,34 33,26" fill="#047857" />
          </svg>
          <span className="font-display text-2xl font-bold tracking-tight text-white">
            BlokEvren
          </span>
        </div>

        <div className="flex items-center gap-2.5 flex-wrap justify-end">
          <button
            onClick={onOpenFriends}
            className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-slate-900/90 hover:bg-slate-800 border border-sky-500/40 text-xs font-semibold text-sky-300 cursor-pointer whitespace-nowrap shrink-0"
          >
            <Users className="w-4 h-4 shrink-0" />
            <span>Arkadaşlar ({friendCount})</span>
            {pendingFriendRequestCount > 0 && (
              <span className="font-mono-num text-amber-300">
                +{pendingFriendRequestCount} İstek
              </span>
            )}
          </button>

          {user ? (
            <div className="flex items-center gap-2.5 px-3.5 py-1.5 rounded-xl bg-slate-900/90 border border-slate-700/80">
              <div className="text-right">
                {username ? (
                  <>
                    <div className="text-xs font-mono-num font-bold text-white">@{username}</div>
                    <div className="text-[11px] text-emerald-400">Bulut Hesabı Aktif</div>
                  </>
                ) : (
                  <>
                    <div className="text-xs font-semibold text-white">{user.displayName || 'Oyuncu'}</div>
                    <button
                      onClick={onOpenUsernameSetup}
                      className="text-[11px] font-semibold text-amber-300 hover:text-amber-200 cursor-pointer"
                    >
                      Kullanıcı Adı Belirle
                    </button>
                  </>
                )}
              </div>
              <button
                onClick={onOpenUsernameSetup}
                className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 cursor-pointer"
                title="Kullanıcı Adını Düzenle"
              >
                <Edit3 className="w-4 h-4" />
              </button>
              <button
                onClick={handleAuth}
                disabled={authLoading}
                className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 cursor-pointer"
                title="Çıkış Yap"
              >
                <LogOut className="w-4 h-4" />
              </button>
            </div>
          ) : (
            <button
              onClick={handleAuth}
              disabled={authLoading}
              className="flex items-center gap-2 px-4 py-2 rounded-xl bg-slate-900/90 hover:bg-slate-800 border border-emerald-500/50 text-xs font-semibold text-emerald-300 cursor-pointer whitespace-nowrap shrink-0"
            >
              <LogIn className="w-4 h-4 shrink-0" />
              {authLoading ? 'Bağlanılıyor...' : 'Google ile Giriş Yap (Bulut & Sunucu)'}
            </button>
          )}
        </div>
      </div>

      {/* Main Content Split: World Creation + Mode/Tool Launchers */}
      <div className="relative z-10 px-6 sm:px-10 my-auto max-w-2xl space-y-6">
        <div className="space-y-2">
          <h1 className="font-display text-4xl sm:text-5xl font-bold text-white leading-tight text-balance">
            Sınırsız Voxel Evrenini İnşa Et
          </h1>
          <p className="text-sm sm:text-base text-slate-300 max-w-xl">
            Dinamik dünyalarda maden kaz, eşyalar üret, kendi karakter skinini tasarla, modlar geliştir ve Firebase sunucu koduyla arkadaşlarınla oyna.
          </p>
        </div>

        {/* World Creation Form */}
        <form
          onSubmit={handleSoloLaunch}
          className="p-5 rounded-2xl bg-slate-900/92 border border-slate-700/80 space-y-4 shadow-2xl"
        >
          <div className="flex items-center justify-between">
            <h2 className="font-display text-base font-bold text-white flex items-center gap-2">
              <Globe className="w-4 h-4 text-emerald-400" />
              Dünya Oluştur ve Başla
            </h2>
            <span className="text-xs text-slate-400">
              Aktif Skin: <strong className="text-sky-300">{activeSkin.name}</strong>
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="sm:col-span-2">
              <label className="block text-[11px] font-medium text-slate-400 mb-1">
                Dünya Adı
              </label>
              <input
                type="text"
                maxLength={48}
                value={worldName}
                onChange={(e) => setWorldName(e.target.value)}
                className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-700 text-sm text-white focus:outline-none focus:border-emerald-500"
              />
            </div>
            <div>
              <label className="block text-[11px] font-medium text-slate-400 mb-1">
                Tohum (Seed)
              </label>
              <input
                type="number"
                value={seedInput}
                onChange={(e) => setSeedInput(e.target.value)}
                className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-700 text-sm font-mono-num text-white focus:outline-none focus:border-emerald-500"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] font-medium text-slate-400 mb-1">
                Oyun Modu
              </label>
              <div className="grid grid-cols-2 gap-1.5">
                <button
                  type="button"
                  onClick={() => setGameMode('survival')}
                  className={`py-2 px-3 rounded-xl text-xs font-semibold border cursor-pointer transition-colors ${
                    gameMode === 'survival'
                      ? 'bg-emerald-600 border-emerald-500 text-white'
                      : 'bg-slate-950 border-slate-800 text-slate-300 hover:border-slate-600'
                  }`}
                >
                  Hayatta Kalma
                </button>
                <button
                  type="button"
                  onClick={() => setGameMode('creative')}
                  className={`py-2 px-3 rounded-xl text-xs font-semibold border cursor-pointer transition-colors ${
                    gameMode === 'creative'
                      ? 'bg-sky-600 border-sky-500 text-white'
                      : 'bg-slate-950 border-slate-800 text-slate-300 hover:border-slate-600'
                  }`}
                >
                  Yaratıcılık
                </button>
              </div>
            </div>

            <div>
              <label className="block text-[11px] font-medium text-slate-400 mb-1">
                Dünya Türü
              </label>
              <div className="grid grid-cols-2 gap-1.5">
                <button
                  type="button"
                  onClick={() => setWorldType('normal')}
                  className={`py-2 px-3 rounded-xl text-xs font-semibold border cursor-pointer transition-colors ${
                    worldType === 'normal'
                      ? 'bg-emerald-600 border-emerald-500 text-white'
                      : 'bg-slate-950 border-slate-800 text-slate-300 hover:border-slate-600'
                  }`}
                >
                  Normal Dünya
                </button>
                <button
                  type="button"
                  onClick={() => setWorldType('flat')}
                  className={`py-2 px-3 rounded-xl text-xs font-semibold border cursor-pointer transition-colors ${
                    worldType === 'flat'
                      ? 'bg-amber-600 border-amber-500 text-white'
                      : 'bg-slate-950 border-slate-800 text-slate-300 hover:border-slate-600'
                  }`}
                >
                  Düz Dünya
                </button>
              </div>
            </div>
          </div>

          <button
            type="submit"
            className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-sm font-bold text-white cursor-pointer transition-colors"
          >
            <Play className="w-4 h-4" /> Tek Oyunculu Dünyayı Başlat
          </button>
        </form>

        {/* Secondary Feature Launchers */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2.5">
          <button
            onClick={onOpenMultiplayer}
            className="flex items-center justify-center gap-2 py-3 px-3 rounded-xl bg-slate-900/90 hover:bg-slate-800 border border-sky-500/40 text-xs font-semibold text-sky-300 cursor-pointer transition-colors"
          >
            <Server className="w-4 h-4 shrink-0" /> Sunucu Aç / Gir
          </button>
          <button
            onClick={onOpenSkinDesigner}
            className="flex items-center justify-center gap-2 py-3 px-3 rounded-xl bg-slate-900/90 hover:bg-slate-800 border border-slate-700 text-xs font-semibold text-slate-200 cursor-pointer transition-colors"
          >
            <Palette className="w-4 h-4 text-emerald-400 shrink-0" /> Skin Tasarla
          </button>
          <button
            onClick={onOpenTexturePacks}
            className="flex items-center justify-center gap-2 py-3 px-3 rounded-xl bg-slate-900/90 hover:bg-slate-800 border border-slate-700 text-xs font-semibold text-slate-200 cursor-pointer transition-colors"
          >
            <Layers className="w-4 h-4 text-sky-400 shrink-0" /> Doku Paketleri
          </button>
          <button
            onClick={onOpenModWorkshop}
            className="flex items-center justify-center gap-2 py-3 px-3 rounded-xl bg-slate-900/90 hover:bg-slate-800 border border-slate-700 text-xs font-semibold text-slate-200 cursor-pointer transition-colors"
          >
            <PackagePlus className="w-4 h-4 text-amber-400 shrink-0" /> Modlar ({enabledModCount})
          </button>
          <button
            onClick={onOpenAchievements}
            className="col-span-2 sm:col-span-1 flex items-center justify-center gap-2 py-3 px-3 rounded-xl bg-slate-900/90 hover:bg-slate-800 border border-amber-500/40 text-xs font-semibold text-amber-300 cursor-pointer transition-colors"
          >
            <Trophy className="w-4 h-4 text-amber-400 shrink-0" /> Başarımlar ({achievementUnlockedCount}/{achievementTotalCount})
          </button>
        </div>
      </div>

      {/* Single Flat Control-Hint Line */}
      <div className="relative z-10 px-6 sm:px-10 pb-4 text-xs text-slate-400">
        WASD Hareket · Space Zıpla / Çift Space Uç · Sol Tık Kaz · Sağ Tık Blok Koy · E Envanter &amp; Craft · T Sohbet &amp; Komut · V Kamera · Esc Menü
      </div>
    </div>
  );
}
