import { User } from 'firebase/auth';
import {
  AtSign,
  Check,
  Copy,
  Edit3,
  Globe,
  LogIn,
  Play,
  RefreshCw,
  UserCheck,
  UserMinus,
  UserPlus,
  Users,
  X,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import {
  acceptFriendRequest,
  listAvailableServers,
  rejectOrCancelFriendRequest,
  removeFriend,
  sendFriendRequest,
} from '../services/cloudService';
import { FriendLink, FriendRequest, ServerInfo } from '../types/game';

interface FriendsModalProps {
  user: User | null;
  username: string | null;
  friends: FriendLink[];
  incomingRequests: FriendRequest[];
  outgoingRequests: FriendRequest[];
  onOpenUsernameSetup: () => void;
  onSignInGoogle: () => void;
  onJoinServer: (server: ServerInfo) => void;
  onClose: () => void;
}

export function FriendsModal({
  user,
  username,
  friends,
  incomingRequests,
  outgoingRequests,
  onOpenUsernameSetup,
  onSignInGoogle,
  onJoinServer,
  onClose,
}: FriendsModalProps) {
  const [tab, setTab] = useState<'friends' | 'requests'>(() =>
    incomingRequests.length > 0 ? 'requests' : 'friends',
  );
  const [targetInput, setTargetInput] = useState('');
  const [sending, setSending] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [confirmRemoveUid, setConfirmRemoveUid] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);
  const [copied, setCopied] = useState(false);
  const [publicServers, setPublicServers] = useState<ServerInfo[]>([]);
  const [serversLoading, setServersLoading] = useState(false);

  const loadServers = async () => {
    if (!user) return;
    setServersLoading(true);
    try {
      const list = await listAvailableServers(user.uid);
      setPublicServers(list);
    } catch {
      // ignore server fetch hiccups in friends panel
    } finally {
      setServersLoading(false);
    }
  };

  useEffect(() => {
    if (user) {
      loadServers();
    }
  }, [user]);

  const handleCopyUsername = () => {
    if (!username) return;
    navigator.clipboard?.writeText(`@${username}`).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };

  const handleSendRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !username) return;
    if (!targetInput.trim()) return;
    setFeedback(null);
    setSending(true);
    try {
      const result = await sendFriendRequest(user.uid, username, targetInput);
      setTargetInput('');
      setFeedback({
        type: 'ok',
        text:
          result === 'accepted_mutual'
            ? 'Karşılıklı istek onaylandı — artık arkadaşsınız!'
            : 'Arkadaşlık isteği gönderildi!',
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'İstek gönderilemedi.';
      setFeedback({
        type: 'err',
        text: msg.startsWith('{') ? 'İstek gönderilirken bağlantı/yetki hatası oluştu.' : msg,
      });
    } finally {
      setSending(false);
    }
  };

  const handleAccept = async (req: FriendRequest) => {
    setBusyId(req.id);
    setFeedback(null);
    try {
      await acceptFriendRequest(req);
      setFeedback({ type: 'ok', text: `@${req.fromUsername} arkadaş listene eklendi!` });
    } catch {
      setFeedback({ type: 'err', text: 'İstek kabul edilemedi.' });
    } finally {
      setBusyId(null);
    }
  };

  const handleRejectOrCancel = async (reqId: string, action: 'reject' | 'cancel') => {
    setBusyId(reqId);
    setFeedback(null);
    try {
      await rejectOrCancelFriendRequest(reqId, action);
    } catch {
      setFeedback({ type: 'err', text: 'İşlem tamamlanamadı.' });
    } finally {
      setBusyId(null);
    }
  };

  const handleRemoveFriend = async (friendUid: string) => {
    if (!user) return;
    setBusyId(friendUid);
    setFeedback(null);
    try {
      await removeFriend(user.uid, friendUid);
      setConfirmRemoveUid(null);
    } catch {
      setFeedback({ type: 'err', text: 'Arkadaş listeden çıkarılamadı.' });
    } finally {
      setBusyId(null);
    }
  };

  const totalRequests = incomingRequests.length + outgoingRequests.length;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/85 p-4">
      <div className="w-full max-w-2xl max-h-[88vh] bg-slate-900 border border-slate-700/80 rounded-2xl shadow-2xl flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-sky-500/15 border border-sky-500/40 text-sky-400">
              <Users className="w-5 h-5" />
            </div>
            <div>
              <h2 className="font-display text-lg font-bold text-white">Arkadaşlar</h2>
              <p className="text-xs text-slate-400">
                Kullanıcı adıyla arkadaş ekle ve açık sunucularına katıl
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 cursor-pointer"
            aria-label="Kapat"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Auth / Username Gates */}
        {!user ? (
          <div className="p-8 text-center space-y-4">
            <div className="w-14 h-14 mx-auto rounded-2xl bg-sky-500/15 border border-sky-500/40 flex items-center justify-center text-sky-400">
              <Users className="w-7 h-7" />
            </div>
            <h3 className="font-display text-lg font-bold text-white">
              Arkadaş Sistemi İçin Google Girişi Gerekir
            </h3>
            <p className="text-sm text-slate-400 max-w-md mx-auto">
              Google hesabınla giriş yaptıktan sonra kendine özel bir kullanıcı adı belirleyip arkadaşlarını ekleyebilirsin.
            </p>
            <button
              onClick={onSignInGoogle}
              className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-sm font-semibold text-white cursor-pointer"
            >
              <LogIn className="w-4 h-4" /> Google ile Giriş Yap
            </button>
          </div>
        ) : !username ? (
          <div className="p-8 text-center space-y-4">
            <div className="w-14 h-14 mx-auto rounded-2xl bg-emerald-500/15 border border-emerald-500/40 flex items-center justify-center text-emerald-400">
              <AtSign className="w-7 h-7" />
            </div>
            <h3 className="font-display text-lg font-bold text-white">
              Önce Kullanıcı Adını Belirle
            </h3>
            <p className="text-sm text-slate-400 max-w-md mx-auto">
              Arkadaşların seni ekleyebilmesi ve sunucularda tanıyabilmesi için hesabına bir kullanıcı adı tanımlamalısın.
            </p>
            <button
              onClick={onOpenUsernameSetup}
              className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-sm font-semibold text-white cursor-pointer"
            >
              <AtSign className="w-4 h-4" /> Kullanıcı Adı Seç
            </button>
          </div>
        ) : (
          <>
            {/* Own Username Strip + Add Friend Input */}
            <div className="px-6 py-4 bg-slate-950/70 border-b border-slate-800 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2 text-xs text-slate-300">
                  <span className="text-slate-400">Senin Kullanıcı Adın:</span>
                  <span className="font-mono-num font-bold text-emerald-400">@{username}</span>
                  <button
                    onClick={handleCopyUsername}
                    className="p-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 cursor-pointer"
                    title="Kullanıcı Adını Kopyala"
                  >
                    {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                  </button>
                </div>
                <button
                  onClick={onOpenUsernameSetup}
                  className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs font-medium text-slate-200 cursor-pointer whitespace-nowrap shrink-0"
                >
                  <Edit3 className="w-3.5 h-3.5 text-sky-400" /> Değiştir
                </button>
              </div>

              <form onSubmit={handleSendRequest} className="flex items-center gap-2">
                <div className="relative flex-1">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs font-mono-num font-bold text-slate-400">
                    @
                  </span>
                  <input
                    type="text"
                    maxLength={24}
                    value={targetInput}
                    onChange={(e) => setTargetInput(e.target.value)}
                    placeholder="Arkadaşının kullanıcı adını yaz..."
                    className="w-full pl-7 pr-3 py-2.5 rounded-xl bg-slate-950 border border-slate-700 text-sm font-mono-num text-white focus:outline-none focus:border-sky-500"
                  />
                </div>
                <button
                  type="submit"
                  disabled={sending || !targetInput.trim()}
                  className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-sky-600 hover:bg-sky-500 disabled:opacity-50 text-xs font-semibold text-white cursor-pointer whitespace-nowrap shrink-0"
                >
                  <UserPlus className="w-4 h-4" />
                  {sending ? 'Gönderiliyor...' : 'Arkadaş Ekle'}
                </button>
              </form>

              {feedback && (
                <div
                  className={`px-3 py-2 rounded-lg text-xs border ${
                    feedback.type === 'ok'
                      ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-300'
                      : 'bg-rose-500/15 border-rose-500/40 text-rose-300'
                  }`}
                >
                  {feedback.text}
                </div>
              )}
            </div>

            {/* Tabs */}
            <div className="flex items-center justify-between px-6 py-3 border-b border-slate-800">
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setTab('friends')}
                  className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-semibold cursor-pointer whitespace-nowrap ${
                    tab === 'friends'
                      ? 'bg-emerald-600 text-white'
                      : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                  }`}
                >
                  <UserCheck className="w-3.5 h-3.5" />
                  Arkadaşlarım ({friends.length})
                </button>
                <button
                  onClick={() => setTab('requests')}
                  className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-semibold cursor-pointer whitespace-nowrap ${
                    tab === 'requests'
                      ? 'bg-sky-600 text-white'
                      : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                  }`}
                >
                  <UserPlus className="w-3.5 h-3.5" />
                  İstekler ({totalRequests})
                </button>
              </div>

              {tab === 'friends' && (
                <button
                  onClick={loadServers}
                  disabled={serversLoading}
                  className="flex items-center gap-1 text-xs text-sky-400 hover:text-sky-300 cursor-pointer whitespace-nowrap"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${serversLoading ? 'animate-spin' : ''}`} />
                  Sunucuları Kontrol Et
                </button>
              )}
            </div>

            {/* List Body */}
            <div className="flex-1 overflow-y-auto p-6 space-y-4">
              {tab === 'friends' ? (
                friends.length === 0 ? (
                  <div className="py-10 text-center text-sm text-slate-400 border border-dashed border-slate-800 rounded-xl">
                    Henüz ekli arkadaşın yok. Yukarıdan arkadaşının <span className="font-mono-num text-slate-200">@kullanıcı_adı</span> bilgisini yazarak istek gönderebilirsin.
                  </div>
                ) : (
                  <div className="space-y-2.5">
                    {friends.map((friend) => {
                      const friendServer = publicServers.find(
                        (s) => s.ownerId === friend.friendUid,
                      );
                      const isConfirming = confirmRemoveUid === friend.friendUid;

                      return (
                        <div
                          key={friend.friendUid}
                          className="flex flex-wrap items-center justify-between gap-3 p-3.5 rounded-xl bg-slate-950 border border-slate-800"
                        >
                          <div className="min-w-0">
                            <div className="font-mono-num text-sm font-bold text-white">
                              @{friend.friendUsername}
                            </div>
                            <div className="text-xs text-slate-400 flex items-center gap-1.5 mt-0.5">
                              {friendServer ? (
                                <>
                                  <Globe className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                                  <span className="text-emerald-300 truncate">
                                    Açık Sunucu: {friendServer.worldName}
                                  </span>
                                </>
                              ) : (
                                <span>Karşılıklı arkadaş</span>
                              )}
                            </div>
                          </div>

                          <div className="flex items-center gap-2 shrink-0">
                            {friendServer && (
                              <button
                                onClick={() => onJoinServer(friendServer)}
                                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-xs font-semibold text-white cursor-pointer whitespace-nowrap"
                              >
                                <Play className="w-3.5 h-3.5" /> Sunucusuna Gir
                              </button>
                            )}

                            {isConfirming ? (
                              <div className="flex items-center gap-1.5">
                                <button
                                  onClick={() => handleRemoveFriend(friend.friendUid)}
                                  disabled={busyId === friend.friendUid}
                                  className="px-2.5 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-500 text-xs font-semibold text-white cursor-pointer whitespace-nowrap"
                                >
                                  Evet, Çıkar
                                </button>
                                <button
                                  onClick={() => setConfirmRemoveUid(null)}
                                  className="px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs text-slate-300 cursor-pointer whitespace-nowrap"
                                >
                                  İptal
                                </button>
                              </div>
                            ) : (
                              <button
                                onClick={() => setConfirmRemoveUid(friend.friendUid)}
                                className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-rose-500/20 hover:text-rose-300 text-xs text-slate-300 cursor-pointer whitespace-nowrap"
                                title="Arkadaşlıktan Çıkar"
                              >
                                <UserMinus className="w-3.5 h-3.5" /> Çıkar
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )
              ) : totalRequests === 0 ? (
                <div className="py-10 text-center text-sm text-slate-400 border border-dashed border-slate-800 rounded-xl">
                  Bekleyen arkadaşlık isteğin bulunmuyor.
                </div>
              ) : (
                <div className="space-y-5">
                  {incomingRequests.length > 0 && (
                    <div className="space-y-2">
                      <h3 className="text-xs font-semibold uppercase tracking-wider text-emerald-400">
                        Gelen İstekler ({incomingRequests.length})
                      </h3>
                      {incomingRequests.map((req) => (
                        <div
                          key={req.id}
                          className="flex items-center justify-between gap-3 p-3.5 rounded-xl bg-slate-950 border border-emerald-500/30"
                        >
                          <div>
                            <div className="font-mono-num text-sm font-bold text-white">
                              @{req.fromUsername}
                            </div>
                            <div className="text-xs text-slate-400">
                              Sana arkadaşlık isteği gönderdi
                            </div>
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            <button
                              onClick={() => handleAccept(req)}
                              disabled={busyId === req.id}
                              className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-xs font-semibold text-white cursor-pointer whitespace-nowrap"
                            >
                              Kabul Et
                            </button>
                            <button
                              onClick={() => handleRejectOrCancel(req.id, 'reject')}
                              disabled={busyId === req.id}
                              className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs text-slate-300 cursor-pointer whitespace-nowrap"
                            >
                              Reddet
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {outgoingRequests.length > 0 && (
                    <div className="space-y-2">
                      <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                        Gönderilen İstekler ({outgoingRequests.length})
                      </h3>
                      {outgoingRequests.map((req) => (
                        <div
                          key={req.id}
                          className="flex items-center justify-between gap-3 p-3.5 rounded-xl bg-slate-950 border border-slate-800"
                        >
                          <div>
                            <div className="font-mono-num text-sm font-bold text-white">
                              @{req.toUsername}
                            </div>
                            <div className="text-xs text-slate-400">Yanıt bekleniyor...</div>
                          </div>
                          <button
                            onClick={() => handleRejectOrCancel(req.id, 'cancel')}
                            disabled={busyId === req.id}
                            className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs text-slate-300 cursor-pointer whitespace-nowrap shrink-0"
                          >
                            İptal Et
                          </button>
                        </div>
                      ))}
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
