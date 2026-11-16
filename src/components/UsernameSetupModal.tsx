import { User } from 'firebase/auth';
import { AtSign, CheckCircle2, Loader2, LogOut, Sparkles, X, AlertCircle } from 'lucide-react';
import { useEffect, useState } from 'react';
import {
  checkUsernameAvailability,
  claimUsername,
  normalizeUsernameInput,
  signOutUser,
  validateUsernameFormat,
} from '../services/cloudService';

interface UsernameSetupModalProps {
  user: User;
  currentUsername: string | null;
  onUsernameClaimed: (username: string) => void;
  onClose?: () => void;
}

export function UsernameSetupModal({
  user,
  currentUsername,
  onUsernameClaimed,
  onClose,
}: UsernameSetupModalProps) {
  const isFirstTime = !currentUsername;

  const [rawInput, setRawInput] = useState(() => {
    if (currentUsername) return currentUsername;
    const suggestion = normalizeUsernameInput(
      user.displayName || user.email?.split('@')[0] || '',
    );
    return suggestion.length >= 3 ? suggestion : '';
  });

  const normalized = normalizeUsernameInput(rawInput);
  const formatError = normalized ? validateUsernameFormat(normalized) : 'Bir kullanıcı adı girin.';

  const [checking, setChecking] = useState(false);
  const [availability, setAvailability] = useState<{
    checkedName: string;
    available: boolean;
    error?: string;
  } | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');

  useEffect(() => {
    setSubmitError('');
    if (!normalized || validateUsernameFormat(normalized) !== null) {
      setAvailability(null);
      setChecking(false);
      return;
    }
    if (currentUsername && normalized === currentUsername) {
      setAvailability({ checkedName: normalized, available: true });
      setChecking(false);
      return;
    }

    let cancelled = false;
    setChecking(true);
    const timer = window.setTimeout(async () => {
      try {
        const res = await checkUsernameAvailability(normalized, user.uid);
        if (!cancelled) {
          setAvailability({
            checkedName: res.normalized,
            available: res.available,
            error: res.error,
          });
        }
      } catch {
        if (!cancelled) {
          setAvailability({
            checkedName: normalized,
            available: false,
            error: 'Kullanıcı adı kontrol edilemedi.',
          });
        }
      } finally {
        if (!cancelled) setChecking(false);
      }
    }, 320);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [normalized, user.uid, currentUsername]);

  const isValidAndAvailable =
    !formatError &&
    !checking &&
    availability?.checkedName === normalized &&
    availability.available;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (formatError) {
      setSubmitError(formatError);
      return;
    }
    setSubmitError('');
    setSubmitting(true);
    try {
      const claimed = await claimUsername(user, normalized, currentUsername);
      onUsernameClaimed(claimed);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Kullanıcı adı kaydedilemedi.';
      setSubmitError(msg.startsWith('{') ? 'Yetki veya bağlantı hatası oluştu.' : msg);
    } finally {
      setSubmitting(false);
    }
  };

  const handleSignOut = async () => {
    await signOutUser().catch(() => {});
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/90 p-4">
      <div className="w-full max-w-md bg-slate-900 border border-slate-700/80 rounded-2xl shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-emerald-500/15 border border-emerald-500/40 text-emerald-400">
              <AtSign className="w-5 h-5" />
            </div>
            <div>
              <h2 className="font-display text-lg font-bold text-white">
                {isFirstTime ? 'Kullanıcı Adını Seç' : 'Kullanıcı Adını Düzenle'}
              </h2>
              <p className="text-xs text-slate-400">
                Sunucularda, sohbette ve arkadaş eklemede bu ad görünecek.
              </p>
            </div>
          </div>
          {!isFirstTime && onClose && (
            <button
              onClick={onClose}
              className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 cursor-pointer"
              aria-label="Kapat"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {isFirstTime && (
            <div className="px-3.5 py-2.5 rounded-xl bg-sky-500/10 border border-sky-500/30 text-xs text-sky-200 leading-relaxed">
              Google hesabınla ilk kez bağlandın! Arkadaşların seni bulabilmesi ve sunucularda adının görünmesi için benzersiz bir kullanıcı adı belirle.
            </div>
          )}

          <div className="space-y-1.5">
            <label className="block text-xs font-medium text-slate-300">
              Kullanıcı Adı
            </label>
            <div className="relative flex items-center">
              <span className="absolute left-3.5 text-sm font-mono-num font-bold text-emerald-400">
                @
              </span>
              <input
                type="text"
                maxLength={24}
                autoFocus
                value={rawInput}
                onChange={(e) => setRawInput(e.target.value)}
                placeholder="ornek_oyuncu61"
                className="w-full pl-8 pr-10 py-2.5 rounded-xl bg-slate-950 border border-slate-700 text-sm font-mono-num text-white focus:outline-none focus:border-emerald-500"
              />
              <div className="absolute right-3">
                {checking ? (
                  <Loader2 className="w-4 h-4 text-slate-400 animate-spin" />
                ) : isValidAndAvailable ? (
                  <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                ) : normalized && (formatError || (availability && !availability.available)) ? (
                  <AlertCircle className="w-4 h-4 text-rose-400" />
                ) : null}
              </div>
            </div>

            <div className="flex items-center justify-between text-[11px] text-slate-400 pt-0.5">
              <span>3–20 karakter · küçük harf (a-z), rakam, _</span>
              {normalized && (
                <span className="font-mono-num text-emerald-300">@{normalized}</span>
              )}
            </div>
          </div>

          {/* Availability / Validation Feedback */}
          {formatError && rawInput.trim().length > 0 && (
            <div className="text-xs text-rose-400">{formatError}</div>
          )}
          {!formatError && checking && (
            <div className="text-xs text-slate-400">Kullanılabilirlik kontrol ediliyor...</div>
          )}
          {!formatError && !checking && availability?.checkedName === normalized && (
            <div
              className={`text-xs ${
                availability.available ? 'text-emerald-400' : 'text-rose-400'
              }`}
            >
              {availability.available
                ? currentUsername === normalized
                  ? 'Mevcut kullanıcı adın.'
                  : `@${normalized} kullanılabilir!`
                : availability.error}
            </div>
          )}

          {submitError && (
            <div className="px-3 py-2 rounded-lg bg-rose-500/15 border border-rose-500/40 text-xs text-rose-300">
              {submitError}
            </div>
          )}

          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5 pt-2">
            {isFirstTime ? (
              <button
                type="button"
                onClick={handleSignOut}
                className="flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-medium text-slate-300 cursor-pointer whitespace-nowrap shrink-0"
              >
                <LogOut className="w-3.5 h-3.5" /> Çıkış Yap
              </button>
            ) : (
              onClose && (
                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-medium text-slate-300 cursor-pointer whitespace-nowrap shrink-0"
                >
                  Vazgeç
                </button>
              )
            )}

            <button
              type="submit"
              disabled={submitting || !isValidAndAvailable}
              className="flex-1 flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed text-sm font-semibold text-white cursor-pointer whitespace-nowrap"
            >
              {submitting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" /> Kaydediliyor...
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4" />
                  {isFirstTime ? 'Kullanıcı Adını Onayla' : 'Değişikliği Kaydet'}
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
