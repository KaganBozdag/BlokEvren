import { User } from 'firebase/auth';
import { Copy, Globe, KeyRound, LogIn, Play, Plus, RefreshCw, Server, Users, X } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import {
  createFirebaseServer,
  joinServerByCode,
  listAvailableServers,
  signInWithGoogle,
} from '../services/cloudService';
import {
  FriendLink,
  GameMode,
  ModDefinition,
  ServerInfo,
  WorldLaunchConfig,
  WorldType,
} from '../types/game';

interface MultiplayerModalProps {
  user: User | null;
  username?: string | null;
  friends?: FriendLink[];
  localMods: ModDefinition[];
  enabledModIds: string[];
  onOpenUsernameSetup?: () => void;
  onOpenFriends?: () => void;
  onClose: () => void;
  onLaunchWorld: (config: WorldLaunchConfig) => void;
}

export function MultiplayerModal({
  user,
  username,
  friends = [],
  localMods,
  enabledModIds,
  onOpenUsernameSetup,
  onOpenFriends,
  onClose,
  onLaunchWorld,
}: MultiplayerModalProps) {
  const [tab, setTab] = useState<'join' | 'create' | 'list'>('create');
  const [joinCodeInput, setJoinCodeInput] = useState('');
  const [worldName, setWorldName] = useState('Arkadaşlarla BlokEvren');
  const [gameMode, setGameMode] = useState<GameMode>('survival');
  const [worldType, setWorldType] = useState<WorldType>('normal');
  const [isPublic, setIsPublic] = useState(true);
  const [seedInput, setSeedInput] = useState(() => String(Math.floor(1000 + Math.random() * 90000)));
  const [servers, setServers] = useState<ServerInfo[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [createdServer, setCreatedServer] = useState<ServerInfo | null>(null);
  const [copied, setCopied] = useState(false);

  const loadServers = async () => {
    if (!user) return;
    setLoading(true);
    setError('');
    try {
      const list = await listAvailableServers(user.uid);
      setServers(list);
    } catch {
      setError('Sunucu listesi yüklenemedi.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (user && tab === 'list') {
      loadServers();
    }
  }, [user, tab]);

  const handleLogin = async () => {
    setError('');
    setLoading(true);
    try {
      await signInWithGoogle();
    } catch {
      setError('Google ile giriş yapılamadı. Lütfen tekrar deneyin.');
    } finally {
      setLoading(false);
    }
  };

  const friendUidSet = useMemo(() => new Set(friends.map((f) => f.friendUid)), [friends]);

  const sortedServers = useMemo(() => {
    return [...servers].sort((a, b) => {
      const aFriend = a.ownerId === user?.uid ? 2 : friendUidSet.has(a.ownerId) ? 1 : 0;
      const bFriend = b.ownerId === user?.uid ? 2 : friendUidSet.has(b.ownerId) ? 1 : 0;
      return bFriend - aFriend;
    });
  }, [servers, friendUidSet, user]);

  const handleCreateServer = async () => {
    if (!user) return;
    setError('');
    setLoading(true);
    try {
      const numericSeed = parseInt(seedInput, 10) || Math.floor(Math.random() * 99999);
      const srv = await createFirebaseServer(user, {
        worldName: worldName.trim() || 'BlokEvren Sunucusu',
        worldType,
        defaultGameMode: gameMode,
        seed: numericSeed,
        isPublic,
        activeModIds: enabledModIds,
        ownerUsername: username,
      });
      setCreatedServer(srv);
    } catch {
      setError('Sunucu oluşturulurken bir hata oluştu.');
    } finally {
      setLoading(false);
    }
  };

  const handleJoinByCode = async () => {
    if (!user) return;
    const clean = joinCodeInput.trim().toUpperCase();
    if (clean.length !== 6) {
      setError('Lütfen 6 haneli sunucu kodunu girin (Örn: A7K4P9).');
      return;
    }
    setError('');
    setLoading(true);
    try {
      const srv = await joinServerByCode(clean);
      if (!srv) {
        setError('Bu koda ait aktif bir sunucu bulunamadı.');
        return;
      }
      launchServer(srv);
    } catch {
      setError('Sunucuya bağlanılamadı.');
    } finally {
      setLoading(false);
    }
  };

  const launchServer = (srv: ServerInfo) => {
    onLaunchWorld({
      mode: 'server',
      worldName: srv.worldName,
      gameMode: srv.defaultGameMode,
      worldType: srv.worldType,
      seed: srv.seed,
      serverId: srv.id,
      joinCode: srv.joinCode,
      ownerId: srv.ownerId,
      activeModIds: srv.activeModIds || enabledModIds,
      initialTimeOfDay: srv.timeOfDay ?? 4000,
    });
  };

  const copyCode = (code: string) => {
    navigator.clipboard?.writeText(code).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/85 p-4">
      <div className="w-full max-w-3xl max-h-[90vh] bg-slate-900 border border-slate-700/80 rounded-xl shadow-2xl flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800">
          <div>
            <h2 className="font-display text-xl font-bold text-white">
              Firebase Çok Oyunculu Sunucular
            </h2>
            <p className="text-xs text-slate-400">
              Anında bulut sunucu aç, 6 haneli kodu arkadaşlarınla paylaş ve birlikte inşa et
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Mandatory Auth Gate */}
        {!user ? (
          <div className="p-8 text-center space-y-4">
            <div className="w-14 h-14 mx-auto rounded-2xl bg-emerald-500/15 border border-emerald-500/40 flex items-center justify-center text-emerald-400">
              <Server className="w-7 h-7" />
            </div>
            <h3 className="font-display text-lg font-bold text-white">
              Sunucu Açmak ve Katılmak İçin Hesap Girişi Zorunludur
            </h3>
            <p className="text-sm text-slate-400 max-w-md mx-auto">
              Envanterin, özel karakter skinin ve dünya ilerlemen Firebase bulut hesabında güvenle saklanır.
            </p>
            {error && <p className="text-xs text-rose-400">{error}</p>}
            <button
              onClick={handleLogin}
              disabled={loading}
              className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-sm font-semibold text-white cursor-pointer"
            >
              <LogIn className="w-4 h-4" />
              {loading ? 'Bağlanılıyor...' : 'Google Hesabı ile Giriş Yap'}
            </button>
          </div>
        ) : createdServer ? (
          <div className="p-8 text-center space-y-5">
            <div className="text-xs font-semibold text-emerald-400 tracking-wide">
              SUNUCU BULUTTA OLUŞTURULDU
            </div>
            <h3 className="font-display text-2xl font-bold text-white">
              {createdServer.worldName}
            </h3>
            <div className="inline-flex items-center gap-4 px-6 py-4 rounded-2xl bg-slate-950 border border-emerald-500/50">
              <div>
                <div className="text-[11px] text-slate-400 mb-1">Sunucu Katılım Kodu</div>
                <div className="font-mono-num text-3xl font-bold tracking-[0.25em] text-emerald-400">
                  {createdServer.joinCode}
                </div>
              </div>
              <button
                onClick={() => copyCode(createdServer.joinCode)}
                className="p-2.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 cursor-pointer"
                title="Kodu Kopyala"
              >
                <Copy className="w-5 h-5" />
              </button>
            </div>
            {copied && <div className="text-xs text-emerald-400">Kod panoya kopyalandı!</div>}
            <p className="text-xs text-slate-400 max-w-md mx-auto">
              Arkadaşların bu 6 haneli kodu &quot;Kodla Katıl&quot; bölümüne girerek doğrudan dünyana bağlanabilir.
            </p>
            <div className="flex items-center justify-center gap-3 pt-2">
              <button
                onClick={() => setCreatedServer(null)}
                className="px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-sm font-medium text-slate-200 cursor-pointer"
              >
                Geri Dön
              </button>
              <button
                onClick={() => launchServer(createdServer)}
                className="flex items-center gap-2 px-6 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-sm font-semibold text-white cursor-pointer"
              >
                <Play className="w-4 h-4" /> Sunucuya Gir
              </button>
            </div>
          </div>
        ) : (
          <>
            {/* Tabs & Active Server Identity */}
            <div className="flex flex-wrap items-center justify-between gap-2 px-6 pt-4 pb-3 border-b border-slate-800">
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setTab('create')}
                  className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-semibold cursor-pointer whitespace-nowrap ${
                    tab === 'create'
                      ? 'bg-emerald-600 text-white'
                      : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                  }`}
                >
                  <Plus className="w-4 h-4" /> Sunucu Aç (Kod Üret)
                </button>
                <button
                  onClick={() => setTab('join')}
                  className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-semibold cursor-pointer whitespace-nowrap ${
                    tab === 'join'
                      ? 'bg-sky-600 text-white'
                      : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                  }`}
                >
                  <KeyRound className="w-4 h-4" /> Kodla Katıl
                </button>
                <button
                  onClick={() => setTab('list')}
                  className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-semibold cursor-pointer whitespace-nowrap ${
                    tab === 'list'
                      ? 'bg-amber-600 text-white'
                      : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                  }`}
                >
                  <Globe className="w-4 h-4" /> Sunucular
                </button>
              </div>

              <div className="flex items-center gap-2 text-xs">
                {username ? (
                  <span className="text-slate-400">
                    Görünecek Ad:{' '}
                    <strong className="font-mono-num text-emerald-400">@{username}</strong>
                  </span>
                ) : (
                  onOpenUsernameSetup && (
                    <button
                      onClick={onOpenUsernameSetup}
                      className="text-amber-300 hover:text-amber-200 font-semibold cursor-pointer whitespace-nowrap"
                    >
                      Kullanıcı Adı Belirle
                    </button>
                  )
                )}
                {onOpenFriends && (
                  <button
                    onClick={onOpenFriends}
                    className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-sky-300 font-medium cursor-pointer whitespace-nowrap"
                  >
                    <Users className="w-3.5 h-3.5" /> Arkadaşlar
                  </button>
                )}
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-6 space-y-5">
              {error && (
                <div className="px-4 py-2.5 rounded-lg bg-rose-500/15 border border-rose-500/40 text-xs text-rose-300">
                  {error}
                </div>
              )}

              {tab === 'create' && (
                <div className="space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-medium text-slate-400 mb-1.5">
                        Sunucu / Dünya Adı
                      </label>
                      <input
                        type="text"
                        maxLength={60}
                        value={worldName}
                        onChange={(e) => setWorldName(e.target.value)}
                        className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-700 text-sm text-white focus:outline-none focus:border-emerald-500"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-400 mb-1.5">
                        Dünya Tohumu (Seed)
                      </label>
                      <input
                        type="number"
                        value={seedInput}
                        onChange={(e) => setSeedInput(e.target.value)}
                        className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-700 text-sm font-mono-num text-white focus:outline-none focus:border-emerald-500"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-medium text-slate-400 mb-1.5">
                        Varsayılan Oyun Modu
                      </label>
                      <div className="grid grid-cols-2 gap-2">
                        <button
                          type="button"
                          onClick={() => setGameMode('survival')}
                          className={`py-2.5 rounded-xl text-xs font-semibold border cursor-pointer ${
                            gameMode === 'survival'
                              ? 'bg-emerald-600/20 border-emerald-500 text-emerald-300'
                              : 'bg-slate-950 border-slate-800 text-slate-400'
                          }`}
                        >
                          Hayatta Kalma
                        </button>
                        <button
                          type="button"
                          onClick={() => setGameMode('creative')}
                          className={`py-2.5 rounded-xl text-xs font-semibold border cursor-pointer ${
                            gameMode === 'creative'
                              ? 'bg-sky-600/20 border-sky-500 text-sky-300'
                              : 'bg-slate-950 border-slate-800 text-slate-400'
                          }`}
                        >
                          Yaratıcılık
                        </button>
                      </div>
                    </div>

                    <div>
                      <label className="block text-xs font-medium text-slate-400 mb-1.5">
                        Dünya Türü
                      </label>
                      <div className="grid grid-cols-2 gap-2">
                        <button
                          type="button"
                          onClick={() => setWorldType('normal')}
                          className={`py-2.5 rounded-xl text-xs font-semibold border cursor-pointer ${
                            worldType === 'normal'
                              ? 'bg-emerald-600/20 border-emerald-500 text-emerald-300'
                              : 'bg-slate-950 border-slate-800 text-slate-400'
                          }`}
                        >
                          Normal Dünya
                        </button>
                        <button
                          type="button"
                          onClick={() => setWorldType('flat')}
                          className={`py-2.5 rounded-xl text-xs font-semibold border cursor-pointer ${
                            worldType === 'flat'
                              ? 'bg-amber-600/20 border-amber-500 text-amber-300'
                              : 'bg-slate-950 border-slate-800 text-slate-400'
                          }`}
                        >
                          Düz Dünya
                        </button>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center justify-between p-3.5 rounded-xl bg-slate-950 border border-slate-800">
                    <div>
                      <div className="text-xs font-medium text-white">Herkese Açık Sunucu</div>
                      <div className="text-[11px] text-slate-400">
                        Kapalıysa sadece 6 haneli davet kodunu bilenler katılabilir.
                      </div>
                    </div>
                    <input
                      type="checkbox"
                      checked={isPublic}
                      onChange={(e) => setIsPublic(e.target.checked)}
                      className="w-4 h-4 cursor-pointer"
                    />
                  </div>

                  {enabledModIds.length > 0 && (
                    <div className="text-xs text-slate-400">
                      Sunucuda aktif olacak modlar:{' '}
                      <span className="text-emerald-400 font-medium">
                        {localMods
                          .filter((m) => enabledModIds.includes(m.id))
                          .map((m) => m.name)
                          .join(', ') || `${enabledModIds.length} Mod`}
                      </span>
                    </div>
                  )}

                  <button
                    onClick={handleCreateServer}
                    disabled={loading}
                    className="w-full py-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-60 text-sm font-semibold text-white cursor-pointer"
                  >
                    {loading ? 'Sunucu Kuruluyor...' : 'Sunucuyu Aç ve Davet Kodu Al'}
                  </button>
                </div>
              )}

              {tab === 'join' && (
                <div className="py-6 max-w-md mx-auto space-y-4 text-center">
                  <label className="block text-sm font-semibold text-white">
                    6 Haneli Sunucu Kodunu Gir
                  </label>
                  <input
                    type="text"
                    maxLength={6}
                    value={joinCodeInput}
                    onChange={(e) => setJoinCodeInput(e.target.value.toUpperCase())}
                    placeholder="ÖRN: A7K4P9"
                    className="w-full px-4 py-3.5 rounded-xl bg-slate-950 border border-slate-700 text-center font-mono-num text-2xl font-bold tracking-[0.3em] text-sky-400 uppercase focus:outline-none focus:border-sky-500"
                  />
                  <button
                    onClick={handleJoinByCode}
                    disabled={loading}
                    className="w-full py-3 rounded-xl bg-sky-600 hover:bg-sky-500 disabled:opacity-60 text-sm font-semibold text-white cursor-pointer"
                  >
                    {loading ? 'Bağlanılıyor...' : 'Sunucuya Katıl'}
                  </button>
                </div>
              )}

              {tab === 'list' && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-slate-400">
                      Senin sunucuların ve herkese açık dünyalar
                    </span>
                    <button
                      onClick={loadServers}
                      className="flex items-center gap-1 text-xs text-sky-400 hover:text-sky-300 cursor-pointer"
                    >
                      <RefreshCw className="w-3.5 h-3.5" /> Yenile
                    </button>
                  </div>

                  {loading ? (
                    <div className="py-10 text-center text-sm text-slate-400">Yükleniyor...</div>
                  ) : servers.length === 0 ? (
                    <div className="py-10 text-center text-sm text-slate-400 border border-dashed border-slate-800 rounded-xl">
                      Henüz açık sunucu bulunamadı. İlk sunucuyu sen açabilirsin!
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {sortedServers.map((srv) => {
                        const isFriendOwner = friendUidSet.has(srv.ownerId);
                        const isMine = srv.ownerId === user.uid;
                        return (
                        <div
                          key={srv.id}
                          className={`flex items-center justify-between gap-4 p-3.5 rounded-xl bg-slate-950 border ${
                            isFriendOwner ? 'border-emerald-500/40' : 'border-slate-800'
                          }`}
                        >
                          <div className="min-w-0">
                            <div className="font-semibold text-sm text-white truncate">
                              {srv.worldName}
                            </div>
                            <div className="text-xs text-slate-400">
                              {isFriendOwner && (
                                <span className="text-emerald-400 font-semibold">Arkadaşın · </span>
                              )}
                              {isMine && (
                                <span className="text-sky-400 font-semibold">Senin Sunucun · </span>
                              )}
                              Kurucu: @{srv.ownerName} ·{' '}
                              {srv.defaultGameMode === 'creative' ? 'Yaratıcılık' : 'Hayatta Kalma'} ·{' '}
                              {srv.worldType === 'flat' ? 'Düz Dünya' : 'Normal Dünya'}
                            </div>
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            {srv.ownerId === user.uid && (
                              <button
                                onClick={() => copyCode(srv.joinCode)}
                                className="px-2.5 py-1.5 rounded-lg bg-slate-800 text-xs font-mono-num text-emerald-400 cursor-pointer"
                                title="Kodu Kopyala"
                              >
                                {srv.joinCode}
                              </button>
                            )}
                            <button
                              onClick={() => launchServer(srv)}
                              className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-xs font-semibold text-white cursor-pointer"
                            >
                              <Play className="w-3.5 h-3.5" /> Gir
                            </button>
                          </div>
                        </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
