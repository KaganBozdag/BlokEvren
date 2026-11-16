import {
  Backpack,
  CloudRain,
  Copy,
  Layers,
  LogOut,
  MessageSquare,
  PackagePlus,
  Palette,
  Pause,
  Play,
  Send,
  Snowflake,
  Sun,
  Trophy,
  Users,
  Volume2,
  VolumeX,
} from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { ACHIEVEMENT_TIER_META } from '../data/achievements';
import { getItemDef } from '../data/blocksAndRecipes';
import { getItemIconUrl } from '../engine/textures';
import { AchievementDef, ChatMessage, GameMode, InventorySlot, WorldLaunchConfig } from '../types/game';
import type { WeatherMode, WeatherType } from './VoxelViewport';

interface GameHUDProps {
  config: WorldLaunchConfig;
  playerUsername?: string | null;
  pendingFriendRequestCount?: number;
  gameMode: GameMode;
  health: number;
  hunger: number;
  slots: (InventorySlot | null)[];
  selectedSlot: number;
  position: { x: number; y: number; z: number; flying: boolean; thirdPerson: boolean };
  timeOfDay: number;
  weather?: { active: WeatherType; mode: WeatherMode; wetness: number };
  targetBlockName: string | null;
  pointerLocked: boolean;
  isModalOpen: boolean;
  isChatOpen: boolean;
  muted: boolean;
  messages: ChatMessage[];
  remotePlayerCount: number;
  achievementToast?: AchievementDef | null;
  achievementCount?: { unlocked: number; total: number };
  onSelectSlot: (idx: number) => void;
  onToggleMute: () => void;
  onCycleWeather?: () => void;
  onOpenInventory: () => void;
  onOpenSkin: () => void;
  onOpenMods: () => void;
  onOpenTexturePacks: () => void;
  onOpenAchievements: () => void;
  onOpenFriends?: () => void;
  onToggleChat: (open: boolean) => void;
  onSendMessageOrCommand: (text: string) => void;
  onResumePlay: () => void;
  onExitToTitle: () => void;
}

export function GameHUD({
  config,
  playerUsername,
  pendingFriendRequestCount = 0,
  gameMode,
  health,
  hunger,
  slots,
  selectedSlot,
  position,
  timeOfDay,
  weather,
  targetBlockName,
  pointerLocked,
  isModalOpen,
  isChatOpen,
  muted,
  messages,
  remotePlayerCount,
  achievementToast,
  achievementCount,
  onSelectSlot,
  onToggleMute,
  onCycleWeather,
  onOpenInventory,
  onOpenSkin,
  onOpenMods,
  onOpenTexturePacks,
  onOpenAchievements,
  onOpenFriends,
  onToggleChat,
  onSendMessageOrCommand,
  onResumePlay,
  onExitToTitle,
}: GameHUDProps) {
  const [chatInput, setChatInput] = useState('');
  const [copied, setCopied] = useState(false);
  const chatInputRef = useRef<HTMLInputElement>(null);
  const chatScrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isChatOpen) {
      setTimeout(() => chatInputRef.current?.focus(), 20);
    }
  }, [isChatOpen]);

  useEffect(() => {
    if (chatScrollRef.current) {
      chatScrollRef.current.scrollTop = chatScrollRef.current.scrollHeight;
    }
  }, [messages, isChatOpen]);

  const handleChatSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = chatInput.trim();
    if (trimmed) {
      onSendMessageOrCommand(trimmed);
      setChatInput('');
    }
    onToggleChat(false);
  };

  const selectedItem = slots[selectedSlot];
  const selectedDef = selectedItem ? getItemDef(selectedItem.id) : null;
  const isDay = timeOfDay >= 0 && timeOfDay < 12000;

  const copyServerCode = () => {
    if (!config.joinCode) return;
    navigator.clipboard?.writeText(config.joinCode).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };

  return (
    <div className="fixed inset-0 z-20 pointer-events-none select-none">
      {/* Achievement Unlocked Toast */}
      {achievementToast && (
        <div
          className={`fixed top-4 left-1/2 -translate-x-1/2 z-40 flex items-center gap-3 px-4 py-3 rounded-xl bg-slate-900/95 border-2 shadow-2xl pointer-events-none min-w-[280px] max-w-sm ${ACHIEVEMENT_TIER_META[achievementToast.tier].border}`}
        >
          <div
            className={`p-2 rounded-lg shrink-0 ${ACHIEVEMENT_TIER_META[achievementToast.tier].badgeBg} ${ACHIEVEMENT_TIER_META[achievementToast.tier].badgeText}`}
          >
            <Trophy className="w-5 h-5" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-[10px] font-bold uppercase tracking-wider text-amber-400">
              Başarım Kazanıldı! (+{achievementToast.points}p)
            </div>
            <div className="text-sm font-bold text-white truncate">{achievementToast.title}</div>
            <div className="text-[11px] text-slate-300 truncate">{achievementToast.description}</div>
          </div>
        </div>
      )}

      {/* Center Crosshair */}
      {pointerLocked && !isModalOpen && !isChatOpen && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="relative w-5 h-5">
            <div className="absolute left-1/2 top-0 -translate-x-1/2 w-0.5 h-5 bg-white/85" />
            <div className="absolute top-1/2 left-0 -translate-y-1/2 h-0.5 w-5 bg-white/85" />
          </div>
        </div>
      )}

      {/* Top-Left Compact World Info */}
      <div className="absolute top-3 left-3 flex flex-col gap-1.5 pointer-events-auto">
        <div className="px-3 py-2 rounded-lg bg-slate-950/75 border border-white/10 text-xs space-y-0.5">
          <div className="flex items-center gap-2 font-semibold text-white">
            <span>{config.worldName}</span>
            <span className="text-slate-500">·</span>
            <span className={gameMode === 'creative' ? 'text-sky-400' : 'text-emerald-400'}>
              {gameMode === 'creative' ? 'Yaratıcılık' : 'Hayatta Kalma'}
            </span>
          </div>
          <div className="flex items-center gap-2 text-[11px] text-slate-300 font-mono-num">
            <span>
              X:{Math.floor(position.x)} Y:{Math.floor(position.y)} Z:{Math.floor(position.z)}
            </span>
            <span className="text-slate-500">·</span>
            <span>{isDay ? 'Gündüz' : 'Gece'}</span>
            {weather && (
              <>
                <span className="text-slate-500">·</span>
                <button
                  onClick={onCycleWeather}
                  title="Hava durumunu değiştir (Otomatik / Yağmur / Kar / Açık)"
                  className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-slate-800/90 hover:bg-slate-700 text-slate-200 cursor-pointer"
                >
                  {weather.active === 'rain' ? (
                    <CloudRain className="w-3 h-3 text-sky-400" />
                  ) : weather.active === 'snow' ? (
                    <Snowflake className="w-3 h-3 text-cyan-200" />
                  ) : (
                    <Sun className="w-3 h-3 text-amber-300" />
                  )}
                  <span>
                    {weather.active === 'rain'
                      ? 'Yağmur'
                      : weather.active === 'snow'
                        ? 'Kar'
                        : 'Açık'}
                  </span>
                  {weather.wetness > 0.04 && (
                    <span className="text-sky-300">
                      ({Math.round(weather.wetness * 100)}% ıslak)
                    </span>
                  )}
                </button>
              </>
            )}
            {position.flying && (
              <>
                <span className="text-slate-500">·</span>
                <span className="text-sky-300">Uçuş</span>
              </>
            )}
          </div>
          {config.mode === 'server' && config.joinCode && (
            <div className="flex items-center gap-2 pt-0.5 text-[11px]">
              <span className="text-slate-400">Sunucu Kodu:</span>
              <button
                onClick={copyServerCode}
                className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-300 font-mono-num font-bold hover:bg-emerald-500/30 cursor-pointer"
              >
                {config.joinCode}
                <Copy className="w-3 h-3" />
              </button>
              <span className="text-slate-400">· {remotePlayerCount} Oyuncu</span>
              {copied && <span className="text-emerald-400">Kopyalandı!</span>}
            </div>
          )}
        </div>

        {targetBlockName && (
          <div className="self-start px-2.5 py-1 rounded bg-slate-950/70 border border-white/10 text-[11px] text-slate-200">
            Hedef: <span className="font-semibold text-white">{targetBlockName}</span>
          </div>
        )}
      </div>

      {/* Top-Right Compact Utility Buttons */}
      <div className="absolute top-3 right-3 flex items-center gap-1.5 pointer-events-auto">
        <button
          onClick={onToggleMute}
          title={muted ? 'Sesi Aç' : 'Sesi Kapat'}
          className="p-2 rounded-lg bg-slate-950/75 hover:bg-slate-900 border border-white/10 text-slate-200 cursor-pointer"
        >
          {muted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
        </button>
        <button
          onClick={onOpenInventory}
          className="flex items-center gap-1.5 px-2.5 py-2 rounded-lg bg-slate-950/75 hover:bg-slate-900 border border-white/10 text-xs font-medium text-slate-200 cursor-pointer"
        >
          <Backpack className="w-4 h-4 text-emerald-400" />
          <span className="hidden sm:inline">Envanter (E)</span>
        </button>
        <button
          onClick={onOpenMods}
          className="flex items-center gap-1.5 px-2.5 py-2 rounded-lg bg-slate-950/75 hover:bg-slate-900 border border-white/10 text-xs font-medium text-slate-200 cursor-pointer"
        >
          <PackagePlus className="w-4 h-4 text-amber-400" />
          <span className="hidden sm:inline">Modlar</span>
        </button>
        <button
          onClick={onOpenTexturePacks}
          className="flex items-center gap-1.5 px-2.5 py-2 rounded-lg bg-slate-950/75 hover:bg-slate-900 border border-white/10 text-xs font-medium text-slate-200 cursor-pointer"
        >
          <Layers className="w-4 h-4 text-cyan-400" />
          <span className="hidden sm:inline">Doku Paketi</span>
        </button>
        <button
          onClick={onOpenSkin}
          className="flex items-center gap-1.5 px-2.5 py-2 rounded-lg bg-slate-950/75 hover:bg-slate-900 border border-white/10 text-xs font-medium text-slate-200 cursor-pointer"
        >
          <Palette className="w-4 h-4 text-sky-400" />
          <span className="hidden sm:inline">Skin</span>
        </button>
        <button
          onClick={onOpenAchievements}
          title="Hayatta Kalma Başarımları"
          className="flex items-center gap-1.5 px-2.5 py-2 rounded-lg bg-slate-950/75 hover:bg-slate-900 border border-white/10 text-xs font-medium text-amber-300 cursor-pointer"
        >
          <Trophy className="w-4 h-4 text-amber-400" />
          <span className="hidden sm:inline">
            Başarımlar
            {achievementCount ? ` (${achievementCount.unlocked}/${achievementCount.total})` : ''}
          </span>
        </button>
        <button
          onClick={() => onToggleChat(!isChatOpen)}
          className="flex items-center gap-1.5 px-2.5 py-2 rounded-lg bg-slate-950/75 hover:bg-slate-900 border border-white/10 text-xs font-medium text-slate-200 cursor-pointer"
        >
          <MessageSquare className="w-4 h-4 text-slate-300" />
          <span className="hidden sm:inline">Sohbet (T)</span>
        </button>
      </div>

      {/* Chat & Command Box (Bottom-Left) */}
      <div className="absolute bottom-24 left-3 w-80 sm:w-96 flex flex-col gap-2 pointer-events-auto">
        {(isChatOpen || messages.length > 0) && (
          <div
            ref={chatScrollRef}
            className={`max-h-44 overflow-y-auto px-3 py-2 rounded-lg space-y-1 text-xs transition-opacity ${
              isChatOpen
                ? 'bg-slate-950/88 border border-white/15'
                : 'bg-slate-950/45 border border-transparent'
            }`}
          >
            {(isChatOpen ? messages.slice(-30) : messages.slice(-5)).map((msg) => (
              <div key={msg.id} className="leading-relaxed break-words">
                {msg.kind === 'system' ? (
                  <span className="text-amber-300">{msg.text}</span>
                ) : (
                  <>
                    <span className="font-semibold text-emerald-400">{msg.senderName}: </span>
                    <span className="text-slate-100">{msg.text}</span>
                  </>
                )}
              </div>
            ))}
          </div>
        )}

        {isChatOpen && (
          <form onSubmit={handleChatSubmit} className="flex flex-col gap-1.5">
            <div className="flex items-center gap-1.5">
              <input
                ref={chatInputRef}
                type="text"
                maxLength={300}
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Escape') {
                    e.stopPropagation();
                    onToggleChat(false);
                  }
                }}
                placeholder="Mesaj veya komut (/gamemode creative, /yardim)..."
                className="flex-1 px-3 py-2 rounded-lg bg-slate-950/95 border border-emerald-500/60 text-xs text-white focus:outline-none"
              />
              <button
                type="submit"
                className="p-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white cursor-pointer"
              >
                <Send className="w-4 h-4" />
              </button>
            </div>
            <div className="px-2 py-1 rounded bg-slate-950/85 text-[10px] text-slate-400">
              Komutlar: /gamemode creative · /gamemode survival · /time day · /tp x y z · /give elmas 5 · /fly
            </div>
          </form>
        )}
      </div>

      {/* Bottom-Center Survival Bars + Hotbar */}
      <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex flex-col items-center gap-1.5 pointer-events-auto">
        {selectedDef && (
          <div className="px-2.5 py-0.5 rounded bg-slate-950/75 text-xs font-medium text-white">
            {selectedDef.name}
          </div>
        )}

        {gameMode === 'survival' && (
          <div className="w-full flex items-center justify-between px-1 text-xs font-mono-num">
            {/* Health */}
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded bg-slate-950/80 border border-white/10">
              <span className="text-rose-400 font-bold">Can</span>
              <div className="w-24 h-2 rounded-full bg-slate-800 overflow-hidden">
                <div
                  className="h-full bg-rose-500 transition-all"
                  style={{ width: `${Math.max(0, Math.min(100, (health / 20) * 100))}%` }}
                />
              </div>
              <span className="text-slate-200">{Math.ceil(health)}/20</span>
            </div>

            {/* Hunger */}
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded bg-slate-950/80 border border-white/10">
              <span className="text-amber-400 font-bold">Açlık</span>
              <div className="w-24 h-2 rounded-full bg-slate-800 overflow-hidden">
                <div
                  className="h-full bg-amber-500 transition-all"
                  style={{ width: `${Math.max(0, Math.min(100, (hunger / 20) * 100))}%` }}
                />
              </div>
              <span className="text-slate-200">{Math.ceil(hunger)}/20</span>
            </div>
          </div>
        )}

        {/* 9-Slot Hotbar */}
        <div className="flex items-center gap-1 p-1.5 rounded-xl bg-slate-950/85 border border-white/15">
          {slots.slice(0, 9).map((slot, idx) => {
            const def = slot ? getItemDef(slot.id) : null;
            const active = selectedSlot === idx;
            return (
              <button
                key={idx}
                onClick={() => onSelectSlot(idx)}
                className={`relative w-11 h-11 sm:w-12 sm:h-12 rounded-lg border flex items-center justify-center cursor-pointer transition-transform ${
                  active
                    ? 'bg-emerald-500/20 border-emerald-400 scale-105'
                    : 'bg-slate-900/90 border-slate-700/80 hover:border-slate-500'
                }`}
              >
                <span className="absolute top-0.5 left-1 text-[9px] font-mono-num text-slate-400">
                  {idx + 1}
                </span>
                {slot && (
                  <>
                    <img
                      src={getItemIconUrl(slot.id)}
                      alt={def?.name || slot.id}
                      className="w-7 h-7 pixelated"
                    />
                    {(gameMode === 'survival' ? slot.count > 1 : slot.count > 0) && (
                      <span className="absolute bottom-0.5 right-1 text-[10px] font-mono-num font-bold text-white">
                        {gameMode === 'creative' && def?.isBlock ? '∞' : slot.count}
                      </span>
                    )}
                  </>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Pause / Click-to-Lock Overlay */}
      {!pointerLocked && !isModalOpen && !isChatOpen && (
        <div className="fixed inset-0 z-30 flex items-center justify-center bg-slate-950/65 pointer-events-auto">
          <div className="w-full max-w-md p-6 rounded-2xl bg-slate-900 border border-slate-700/80 shadow-2xl space-y-5 text-center">
            <div className="flex items-center justify-center gap-2 text-emerald-400">
              <Pause className="w-5 h-5" />
              <span className="text-xs font-semibold tracking-wider">OYUN DURAKLATILDI</span>
            </div>
            <div>
              <h2 className="font-display text-2xl font-bold text-white">{config.worldName}</h2>
              {playerUsername && (
                <div className="text-xs font-mono-num text-emerald-400 mt-0.5">
                  Oyuncu: @{playerUsername}
                </div>
              )}
              <p className="text-xs text-slate-400 mt-1">
                WASD Hareket · Ctrl/Çift W Koş · Shift Eğil · Sol Tık Kaz · Sağ Tık Koy · E Envanter · T Sohbet · V Kamera
              </p>
            </div>

            {config.mode === 'server' && config.joinCode && (
              <div className="p-3 rounded-xl bg-slate-950 border border-emerald-500/40 flex items-center justify-between">
                <span className="text-xs text-slate-400">Sunucu Davet Kodu</span>
                <button
                  onClick={copyServerCode}
                  className="flex items-center gap-2 font-mono-num text-base font-bold text-emerald-400 cursor-pointer"
                >
                  {config.joinCode} <Copy className="w-4 h-4" />
                </button>
              </div>
            )}

            <div className="space-y-2.5">
              <button
                onClick={onResumePlay}
                className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-sm font-semibold text-white cursor-pointer"
              >
                <Play className="w-4 h-4" /> Oyuna Devam Et
              </button>

              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                <button
                  onClick={onOpenInventory}
                  className="py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-medium text-slate-200 cursor-pointer"
                >
                  Envanter
                </button>
                <button
                  onClick={onOpenSkin}
                  className="py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-medium text-slate-200 cursor-pointer"
                >
                  Skin Tasarla
                </button>
                <button
                  onClick={onOpenTexturePacks}
                  className="py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-medium text-slate-200 cursor-pointer"
                >
                  Doku Paketi
                </button>
                <button
                  onClick={onOpenMods}
                  className="py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-medium text-slate-200 cursor-pointer"
                >
                  Modlar
                </button>
                <button
                  onClick={onOpenAchievements}
                  className="py-2.5 rounded-xl bg-amber-500/15 hover:bg-amber-500/25 border border-amber-500/40 text-xs font-semibold text-amber-300 cursor-pointer"
                >
                  Başarımlar
                </button>
                {onOpenFriends && (
                  <button
                    onClick={onOpenFriends}
                    className="flex items-center justify-center gap-1 py-2.5 rounded-xl bg-sky-500/15 hover:bg-sky-500/25 border border-sky-500/40 text-xs font-semibold text-sky-300 cursor-pointer"
                  >
                    <Users className="w-3.5 h-3.5" />
                    Arkadaşlar{pendingFriendRequestCount > 0 ? ` (${pendingFriendRequestCount})` : ''}
                  </button>
                )}
              </div>

              <button
                onClick={onExitToTitle}
                className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-slate-950 hover:bg-slate-800 border border-slate-700 text-xs font-semibold text-rose-300 cursor-pointer"
              >
                <LogOut className="w-4 h-4" /> Kaydet ve Ana Menüye Dön
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
