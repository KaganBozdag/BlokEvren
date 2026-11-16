import { User } from 'firebase/auth';
import { Award, CheckCircle2, Cloud, CloudOff, Lock, ShieldAlert, Trophy, X } from 'lucide-react';
import { useMemo, useState } from 'react';
import {
  ACHIEVEMENT_CATEGORIES,
  ACHIEVEMENT_TIER_META,
} from '../data/achievements';
import { getAllAchievements } from '../data/blocksAndRecipes';
import { AchievementCategory, AchievementProgressState, GameMode } from '../types/game';

interface AchievementsModalProps {
  user: User | null;
  username?: string | null;
  progress: AchievementProgressState;
  currentGameMode?: GameMode;
  onSignInGoogle?: () => void;
  onClose: () => void;
}

export function AchievementsModal({
  user,
  username,
  progress,
  currentGameMode,
  onSignInGoogle,
  onClose,
}: AchievementsModalProps) {
  const [category, setCategory] = useState<'all' | AchievementCategory>('all');
  const [statusFilter, setStatusFilter] = useState<'all' | 'unlocked' | 'locked'>('all');

  const allAchievements = getAllAchievements();

  const summary = useMemo(() => {
    let unlockedCount = 0;
    let totalPoints = 0;
    let earnedPoints = 0;
    for (const ach of allAchievements) {
      totalPoints += ach.points;
      if (progress.unlocked[ach.id]) {
        unlockedCount++;
        earnedPoints += ach.points;
      }
    }
    const percent =
      allAchievements.length > 0 ? Math.round((unlockedCount / allAchievements.length) * 100) : 0;
    return { unlockedCount, totalPoints, earnedPoints, percent };
  }, [progress, allAchievements]);

  const filtered = useMemo(() => {
    return allAchievements.filter((ach) => {
      if (category !== 'all' && ach.category !== category) return false;
      const isUnlocked = Boolean(progress.unlocked[ach.id]);
      if (statusFilter === 'unlocked' && !isUnlocked) return false;
      if (statusFilter === 'locked' && isUnlocked) return false;
      return true;
    });
  }, [category, statusFilter, progress, allAchievements]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/85 p-4">
      <div className="w-full max-w-4xl max-h-[90vh] bg-slate-900 border border-slate-700/80 rounded-2xl shadow-2xl flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-amber-500/15 border border-amber-500/40 text-amber-400">
              <Trophy className="w-5 h-5" />
            </div>
            <div>
              <h2 className="font-display text-lg font-bold text-white">
                Hayatta Kalma Başarımları
              </h2>
              <p className="text-xs text-slate-400">
                Başarımlar yalnızca <strong className="text-emerald-400">Hayatta Kalma</strong> modunda kazanılır ve Google hesabına kaydedilir.
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Summary & Cloud Sync Strip */}
        <div className="px-6 py-4 bg-slate-950/70 border-b border-slate-800 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-4">
              <div>
                <div className="text-xs text-slate-400">Kazanılan Başarım</div>
                <div className="font-mono-num text-xl font-bold text-white">
                  {summary.unlockedCount}{' '}
                  <span className="text-sm text-slate-500">/ {allAchievements.length}</span>
                </div>
              </div>
              <div className="h-8 w-px bg-slate-800" />
              <div>
                <div className="text-xs text-slate-400">Başarım Puanı</div>
                <div className="font-mono-num text-xl font-bold text-amber-400">
                  {summary.earnedPoints} <span className="text-sm text-slate-500">/ {summary.totalPoints}</span>
                </div>
              </div>
            </div>

            {user ? (
              <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-xs text-emerald-300">
                <Cloud className="w-4 h-4 shrink-0" />
                <span>
                  <strong>{username ? `@${username}` : user.displayName || 'Google Hesabı'}</strong> ile buluta senkronize
                </span>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-amber-500/10 border border-amber-500/30 text-xs text-amber-300">
                  <CloudOff className="w-4 h-4 shrink-0" />
                  <span>Yerel kayıt (buluta kaydetmek için giriş yap)</span>
                </div>
                {onSignInGoogle && (
                  <button
                    onClick={onSignInGoogle}
                    className="px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-xs font-semibold text-white cursor-pointer"
                  >
                    Google ile Giriş Yap
                  </button>
                )}
              </div>
            )}
          </div>

          {/* Overall Progress Bar */}
          <div className="space-y-1">
            <div className="flex items-center justify-between text-[11px] text-slate-400">
              <span>Genel İlerleme</span>
              <span className="font-mono-num font-semibold text-emerald-400">%{summary.percent}</span>
            </div>
            <div className="w-full h-2.5 rounded-full bg-slate-800 overflow-hidden">
              <div
                className="h-full bg-emerald-500 transition-all"
                style={{ width: `${summary.percent}%` }}
              />
            </div>
          </div>

          {currentGameMode === 'creative' && (
            <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-sky-950/60 border border-sky-500/40 text-xs text-sky-200">
              <ShieldAlert className="w-4 h-4 text-sky-400 shrink-0" />
              <span>
                Şu an <strong>Yaratıcılık</strong> modundasın. Başarımlar yalnızca <strong>Hayatta Kalma</strong> modunda açılır.
              </span>
            </div>
          )}
        </div>

        {/* Filter Controls */}
        <div className="px-6 py-3 border-b border-slate-800 flex flex-wrap items-center justify-between gap-2 bg-slate-900">
          <div className="flex flex-wrap gap-1.5">
            {ACHIEVEMENT_CATEGORIES.map((c) => (
              <button
                key={c.key}
                onClick={() => setCategory(c.key)}
                className={`px-2.5 py-1 rounded-lg text-xs font-medium cursor-pointer transition-colors ${
                  category === c.key
                    ? 'bg-emerald-600 text-white'
                    : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                }`}
              >
                {c.label}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-1 bg-slate-950 p-1 rounded-lg border border-slate-800">
            {(
              [
                { key: 'all', label: 'Tümü' },
                { key: 'unlocked', label: 'Kazanılanlar' },
                { key: 'locked', label: 'Kilitli' },
              ] as const
            ).map((f) => (
              <button
                key={f.key}
                onClick={() => setStatusFilter(f.key)}
                className={`px-2.5 py-1 rounded text-[11px] font-semibold cursor-pointer ${
                  statusFilter === f.key
                    ? 'bg-slate-800 text-white'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>

        {/* Achievement Cards */}
        <div className="flex-1 overflow-y-auto p-6">
          {filtered.length === 0 ? (
            <div className="text-center py-12 text-sm text-slate-400">
              Bu filtrede gösterilecek başarım bulunamadı.
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {filtered.map((ach) => {
                const unlockedAt = progress.unlocked[ach.id];
                const isUnlocked = Boolean(unlockedAt);
                const currentVal = Math.min(ach.target, progress.stats[ach.statKey] || (isUnlocked ? ach.target : 0));
                const pct = Math.min(100, Math.round((currentVal / ach.target) * 100));
                const tier = ACHIEVEMENT_TIER_META[ach.tier];

                return (
                  <div
                    key={ach.id}
                    className={`p-4 rounded-xl border transition-colors flex flex-col justify-between gap-3 ${
                      isUnlocked
                        ? `bg-slate-950/90 ${tier.border}`
                        : 'bg-slate-950/45 border-slate-800/80 opacity-80'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-start gap-3 min-w-0">
                        <div
                          className={`p-2.5 rounded-xl shrink-0 ${
                            isUnlocked
                              ? `${tier.badgeBg} ${tier.badgeText}`
                              : 'bg-slate-800/80 text-slate-500'
                          }`}
                        >
                          {isUnlocked ? (
                            <Award className="w-5 h-5" />
                          ) : (
                            <Lock className="w-5 h-5" />
                          )}
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <h3 className="text-sm font-bold text-white truncate">
                              {ach.title}
                            </h3>
                            <span
                              className={`px-1.5 py-0.5 rounded text-[10px] font-semibold ${tier.badgeBg} ${tier.badgeText}`}
                            >
                              {tier.label} · +{ach.points}p
                            </span>
                            {ach.modId && (
                              <span className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-violet-500/20 text-violet-300">
                                CottonLua{ach.code ? ` · ${ach.code}` : ''}
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-slate-400 mt-0.5">{ach.description}</p>
                        </div>
                      </div>

                      {isUnlocked && (
                        <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
                      )}
                    </div>

                    <div className="space-y-1">
                      <div className="flex items-center justify-between text-[11px] font-mono-num">
                        <span className={isUnlocked ? 'text-emerald-400 font-semibold' : 'text-slate-400'}>
                          {isUnlocked
                            ? `Kazanıldı · ${new Date(unlockedAt).toLocaleDateString('tr-TR')}`
                            : `${currentVal} / ${ach.target}`}
                        </span>
                        <span className="text-slate-400">%{pct}</span>
                      </div>
                      <div className="w-full h-1.5 rounded-full bg-slate-800 overflow-hidden">
                        <div
                          className={`h-full transition-all ${isUnlocked ? tier.bar : 'bg-slate-500'}`}
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
