import { signInWithPopup, signOut, User } from 'firebase/auth';
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  limit,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch,
} from 'firebase/firestore';
import { sanitizeAchievementState } from '../data/achievements';
import { DEFAULT_SKIN } from '../data/presetSkins';
import { auth, db, googleProvider, handleFirestoreError, OperationType } from '../firebase';
import {
  AchievementProgressState,
  ChatMessage,
  FriendLink,
  FriendRequest,
  GameMode,
  InventorySlot,
  ModDefinition,
  RemotePlayer,
  ServerInfo,
  SkinData,
  WorldType,
} from '../types/game';

export const USERNAME_REGEX = /^[a-z0-9_]{3,20}$/;

export function normalizeUsernameInput(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/^@+/, '')
    .replace(/ğ/g, 'g')
    .replace(/ü/g, 'u')
    .replace(/ş/g, 's')
    .replace(/ı/g, 'i')
    .replace(/ö/g, 'o')
    .replace(/ç/g, 'c')
    .replace(/[^a-z0-9_]/g, '_')
    .replace(/_+/g, '_')
    .slice(0, 20);
}

export function validateUsernameFormat(username: string): string | null {
  if (username.length < 3) return 'Kullanıcı adı en az 3 karakter olmalıdır.';
  if (username.length > 20) return 'Kullanıcı adı en fazla 20 karakter olabilir.';
  if (!USERNAME_REGEX.test(username)) {
    return 'Sadece küçük İngilizce harf (a-z), rakam (0-9) ve alt çizgi (_) kullanabilirsin.';
  }
  return null;
}

export async function signInWithGoogle(): Promise<User> {
  const res = await signInWithPopup(auth, googleProvider);
  await ensureUserProfile(res.user);
  return res.user;
}

export async function signOutUser(): Promise<void> {
  await signOut(auth);
}

export async function ensureUserProfile(user: User) {
  const userPath = `users/${user.uid}`;
  const ref = doc(db, 'users', user.uid);
  try {
    const snap = await getDoc(ref);
    if (!snap.exists()) {
      await setDoc(ref, {
        uid: user.uid,
        displayName: (user.displayName || 'Oyuncu').slice(0, 64),
        activeSkinId: DEFAULT_SKIN.id,
        installedModIds: [],
        unlockedAchievements: {},
        achievementStats: {},
        updatedAt: serverTimestamp(),
      });
    } else {
      const existingData = snap.data();
      const keptName =
        typeof existingData.username === 'string' && existingData.username.length >= 3
          ? existingData.username
          : (user.displayName || 'Oyuncu').slice(0, 64);
      await updateDoc(ref, {
        displayName: keptName,
        updatedAt: serverTimestamp(),
      });
    }

    // Isolated PII storage
    if (user.email) {
      const piiRef = doc(db, 'users', user.uid, 'private', 'info');
      const piiSnap = await getDoc(piiRef);
      if (!piiSnap.exists()) {
        await setDoc(piiRef, {
          uid: user.uid,
          email: user.email.slice(0, 200),
        });
      }
    }
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, userPath);
  }
}

export async function fetchUserProfile(uid: string): Promise<{
  username: string | null;
  displayName: string;
  activeSkinId: string;
  installedModIds: string[];
  achievements: AchievementProgressState;
} | null> {
  const path = `users/${uid}`;
  try {
    const snap = await getDoc(doc(db, 'users', uid));
    if (!snap.exists()) return null;
    const data = snap.data();
    return {
      username: typeof data.username === 'string' && USERNAME_REGEX.test(data.username) ? data.username : null,
      displayName: String(data.username || data.displayName || 'Oyuncu'),
      activeSkinId: String(data.activeSkinId || DEFAULT_SKIN.id),
      installedModIds: Array.isArray(data.installedModIds) ? data.installedModIds : [],
      achievements: sanitizeAchievementState({
        unlocked: data.unlockedAchievements,
        stats: data.achievementStats,
      }),
    };
  } catch (err) {
    handleFirestoreError(err, OperationType.GET, path);
  }
}

export async function checkUsernameAvailability(
  rawUsername: string,
  currentUid?: string,
): Promise<{ available: boolean; normalized: string; error?: string }> {
  const normalized = normalizeUsernameInput(rawUsername);
  const formatErr = validateUsernameFormat(normalized);
  if (formatErr) {
    return { available: false, normalized, error: formatErr };
  }
  const path = `usernames/${normalized}`;
  try {
    const snap = await getDoc(doc(db, 'usernames', normalized));
    if (!snap.exists()) {
      return { available: true, normalized };
    }
    if (currentUid && snap.data().uid === currentUid) {
      return { available: true, normalized };
    }
    return { available: false, normalized, error: 'Bu kullanıcı adı başka bir oyuncu tarafından alınmış.' };
  } catch (err) {
    handleFirestoreError(err, OperationType.GET, path);
  }
}

export async function claimUsername(
  user: User,
  rawUsername: string,
  previousUsername?: string | null,
): Promise<string> {
  const normalized = normalizeUsernameInput(rawUsername);
  const formatErr = validateUsernameFormat(normalized);
  if (formatErr) {
    throw new Error(formatErr);
  }

  await ensureUserProfile(user);

  const unamePath = `usernames/${normalized}`;
  let existingSnap;
  try {
    existingSnap = await getDoc(doc(db, 'usernames', normalized));
  } catch (err) {
    handleFirestoreError(err, OperationType.GET, unamePath);
  }

  if (existingSnap.exists() && existingSnap.data().uid !== user.uid) {
    throw new Error('Bu kullanıcı adı başka bir oyuncu tarafından alınmış.');
  }

  if (existingSnap.exists() && existingSnap.data().uid === user.uid) {
    // Already claimed by this user, just make sure user profile reflects it
    try {
      await updateDoc(doc(db, 'users', user.uid), {
        username: normalized,
        displayName: normalized,
        updatedAt: serverTimestamp(),
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `users/${user.uid}`);
    }
    return normalized;
  }

  const batch = writeBatch(db);
  if (previousUsername && previousUsername !== normalized && USERNAME_REGEX.test(previousUsername)) {
    batch.delete(doc(db, 'usernames', previousUsername));
  }
  batch.set(doc(db, 'usernames', normalized), {
    username: normalized,
    uid: user.uid,
    createdAt: serverTimestamp(),
  });
  batch.update(doc(db, 'users', user.uid), {
    username: normalized,
    displayName: normalized,
    updatedAt: serverTimestamp(),
  });

  try {
    await batch.commit();
    return normalized;
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, unamePath);
  }
}

export function subscribeToFriendsAndRequests(
  uid: string,
  callbacks: {
    onFriends: (friends: FriendLink[]) => void;
    onIncomingRequests: (reqs: FriendRequest[]) => void;
    onOutgoingRequests: (reqs: FriendRequest[]) => void;
  },
): () => void {
  const friendsQ = query(
    collection(db, 'users', uid, 'friends'),
    where('ownerUid', '==', uid),
  );
  const unsubFriends = onSnapshot(
    friendsQ,
    (snap) => {
      const list: FriendLink[] = snap.docs
        .map((d) => {
          const data = d.data();
          return {
            ownerUid: String(data.ownerUid || uid),
            friendUid: String(data.friendUid || d.id),
            friendUsername: String(data.friendUsername || 'oyuncu'),
            addedAt: data.addedAt?.toMillis?.() || Date.now(),
          };
        })
        .sort((a, b) => a.friendUsername.localeCompare(b.friendUsername));
      callbacks.onFriends(list);
    },
    (err) => handleFirestoreError(err, OperationType.LIST, `users/${uid}/friends`),
  );

  const incomingQ = query(
    collection(db, 'friendRequests'),
    where('toUid', '==', uid),
  );
  const unsubIncoming = onSnapshot(
    incomingQ,
    (snap) => {
      const reqs: FriendRequest[] = snap.docs
        .map((d) => {
          const data = d.data();
          return {
            id: String(data.id || d.id),
            fromUid: String(data.fromUid),
            fromUsername: String(data.fromUsername),
            toUid: String(data.toUid),
            toUsername: String(data.toUsername),
            status: data.status as FriendRequest['status'],
            createdAt: data.createdAt?.toMillis?.() || Date.now(),
            updatedAt: data.updatedAt?.toMillis?.() || Date.now(),
          };
        })
        .filter((r) => r.status === 'pending')
        .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
      callbacks.onIncomingRequests(reqs);
    },
    (err) => handleFirestoreError(err, OperationType.LIST, 'friendRequests'),
  );

  const outgoingQ = query(
    collection(db, 'friendRequests'),
    where('fromUid', '==', uid),
  );
  const unsubOutgoing = onSnapshot(
    outgoingQ,
    (snap) => {
      const reqs: FriendRequest[] = snap.docs
        .map((d) => {
          const data = d.data();
          return {
            id: String(data.id || d.id),
            fromUid: String(data.fromUid),
            fromUsername: String(data.fromUsername),
            toUid: String(data.toUid),
            toUsername: String(data.toUsername),
            status: data.status as FriendRequest['status'],
            createdAt: data.createdAt?.toMillis?.() || Date.now(),
            updatedAt: data.updatedAt?.toMillis?.() || Date.now(),
          };
        })
        .filter((r) => r.status === 'pending')
        .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
      callbacks.onOutgoingRequests(reqs);
    },
    (err) => handleFirestoreError(err, OperationType.LIST, 'friendRequests'),
  );

  return () => {
    unsubFriends();
    unsubIncoming();
    unsubOutgoing();
  };
}

export async function acceptFriendRequest(req: FriendRequest): Promise<void> {
  const path = `friendRequests/${req.id}`;
  const batch = writeBatch(db);
  batch.update(doc(db, 'friendRequests', req.id), {
    status: 'accepted',
    updatedAt: serverTimestamp(),
  });
  batch.set(doc(db, 'users', req.toUid, 'friends', req.fromUid), {
    ownerUid: req.toUid,
    friendUid: req.fromUid,
    friendUsername: req.fromUsername,
    addedAt: serverTimestamp(),
  });
  batch.set(doc(db, 'users', req.fromUid, 'friends', req.toUid), {
    ownerUid: req.fromUid,
    friendUid: req.toUid,
    friendUsername: req.toUsername,
    addedAt: serverTimestamp(),
  });
  try {
    await batch.commit();
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, path);
  }
}

export async function sendFriendRequest(
  fromUid: string,
  fromUsername: string,
  rawTargetUsername: string,
): Promise<'sent' | 'accepted_mutual'> {
  const target = normalizeUsernameInput(rawTargetUsername);
  const formatErr = validateUsernameFormat(target);
  if (formatErr) {
    throw new Error(formatErr);
  }

  let lookupSnap;
  try {
    lookupSnap = await getDoc(doc(db, 'usernames', target));
  } catch (err) {
    handleFirestoreError(err, OperationType.GET, `usernames/${target}`);
  }

  if (!lookupSnap.exists()) {
    throw new Error(`"@${target}" kullanıcı adına sahip bir hesap bulunamadı.`);
  }

  const toUid = String(lookupSnap.data().uid || '');
  if (!toUid) {
    throw new Error('Hedef kullanıcı bilgisi geçersiz.');
  }
  if (toUid === fromUid) {
    throw new Error('Kendini arkadaş olarak ekleyemezsin.');
  }

  // Already friends?
  try {
    const alreadyFriendSnap = await getDoc(doc(db, 'users', fromUid, 'friends', toUid));
    if (alreadyFriendSnap.exists()) {
      throw new Error(`@${target} zaten arkadaş listende!`);
    }
  } catch (err) {
    if (err instanceof Error && err.message.includes('zaten arkadaş listende')) {
      throw err;
    }
    handleFirestoreError(err, OperationType.GET, `users/${fromUid}/friends/${toUid}`);
  }

  // Check if the other user already sent us a pending request -> auto-accept!
  const reverseReqId = `${toUid}_${fromUid}`;
  try {
    const reverseSnap = await getDoc(doc(db, 'friendRequests', reverseReqId));
    if (reverseSnap.exists() && reverseSnap.data().status === 'pending') {
      const rData = reverseSnap.data();
      await acceptFriendRequest({
        id: reverseReqId,
        fromUid: String(rData.fromUid),
        fromUsername: String(rData.fromUsername),
        toUid: String(rData.toUid),
        toUsername: fromUsername,
        status: 'pending',
      });
      return 'accepted_mutual';
    }
  } catch (err) {
    // Only ignore permission/missing errors if doc does not exist; rethrow FirestoreErrorInfo
    if (err instanceof Error && err.message.startsWith('{')) throw err;
  }

  const reqId = `${fromUid}_${toUid}`;
  const reqRef = doc(db, 'friendRequests', reqId);
  try {
    const existingReq = await getDoc(reqRef);
    if (existingReq.exists()) {
      const st = existingReq.data().status;
      if (st === 'pending') {
        throw new Error(`@${target} kullanıcısına zaten bekleyen bir isteğin var.`);
      }
      // Clean up old rejected or unfriended request doc before recreating
      await deleteDoc(reqRef);
    }

    await setDoc(reqRef, {
      id: reqId,
      fromUid,
      fromUsername,
      toUid,
      toUsername: target,
      status: 'pending',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    return 'sent';
  } catch (err) {
    if (err instanceof Error && err.message.includes('bekleyen bir isteğin')) {
      throw err;
    }
    handleFirestoreError(err, OperationType.WRITE, `friendRequests/${reqId}`);
  }
}

export async function rejectOrCancelFriendRequest(
  reqId: string,
  action: 'reject' | 'cancel',
): Promise<void> {
  const path = `friendRequests/${reqId}`;
  try {
    if (action === 'cancel') {
      await deleteDoc(doc(db, 'friendRequests', reqId));
    } else {
      await updateDoc(doc(db, 'friendRequests', reqId), {
        status: 'rejected',
        updatedAt: serverTimestamp(),
      });
    }
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, path);
  }
}

export async function removeFriend(uid: string, friendUid: string): Promise<void> {
  const batch = writeBatch(db);
  batch.delete(doc(db, 'users', uid, 'friends', friendUid));
  batch.delete(doc(db, 'users', friendUid, 'friends', uid));
  try {
    await batch.commit();
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, `users/${uid}/friends/${friendUid}`);
  }

  // Best-effort cleanup of old friendRequests documents so re-adding works cleanly
  await Promise.all([
    deleteDoc(doc(db, 'friendRequests', `${uid}_${friendUid}`)).catch(() => {}),
    deleteDoc(doc(db, 'friendRequests', `${friendUid}_${uid}`)).catch(() => {}),
  ]);
}

export async function saveUserActiveSkin(uid: string, skinId: string) {
  const path = `users/${uid}`;
  try {
    await updateDoc(doc(db, 'users', uid), {
      activeSkinId: skinId.slice(0, 128),
      updatedAt: serverTimestamp(),
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, path);
  }
}

export async function saveUserInstalledMods(uid: string, modIds: string[]) {
  const path = `users/${uid}`;
  try {
    await updateDoc(doc(db, 'users', uid), {
      installedModIds: modIds.slice(0, 32),
      updatedAt: serverTimestamp(),
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, path);
  }
}

export async function saveUserAchievements(
  uid: string,
  achievements: AchievementProgressState,
) {
  const path = `users/${uid}`;
  const clean = sanitizeAchievementState(achievements);
  const unlockedEntries = Object.entries(clean.unlocked).slice(0, 128);
  const statsEntries = Object.entries(clean.stats).slice(0, 64);
  try {
    await updateDoc(doc(db, 'users', uid), {
      unlockedAchievements: Object.fromEntries(unlockedEntries),
      achievementStats: Object.fromEntries(statsEntries),
      updatedAt: serverTimestamp(),
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, path);
  }
}

// Skins
export async function saveSkinToCloud(uid: string, skin: SkinData) {
  const path = `users/${uid}/skins/${skin.id}`;
  const ref = doc(db, 'users', uid, 'skins', skin.id);
  try {
    const existingSnap = await getDoc(ref);
    if (existingSnap.exists()) {
      await updateDoc(ref, {
        name: skin.name.slice(0, 48) || 'Özel Skin',
        headFront: skin.headFront.slice(0, 600),
        headSide: skin.headSide.slice(0, 600),
        headTop: skin.headTop.slice(0, 600),
        torso: skin.torso.slice(0, 600),
        arm: skin.arm.slice(0, 600),
        leg: skin.leg.slice(0, 600),
        updatedAt: serverTimestamp(),
      });
    } else {
      await setDoc(ref, {
        id: skin.id,
        ownerId: uid,
        name: skin.name.slice(0, 48) || 'Özel Skin',
        headFront: skin.headFront.slice(0, 600),
        headSide: skin.headSide.slice(0, 600),
        headTop: skin.headTop.slice(0, 600),
        torso: skin.torso.slice(0, 600),
        arm: skin.arm.slice(0, 600),
        leg: skin.leg.slice(0, 600),
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, path);
  }
}

export async function fetchUserSkins(uid: string): Promise<SkinData[]> {
  const path = `users/${uid}/skins`;
  try {
    const q = query(collection(db, 'users', uid, 'skins'), where('ownerId', '==', uid));
    const snap = await getDocs(q);
    return snap.docs.map((d) => {
      const data = d.data();
      return {
        id: data.id,
        name: data.name,
        headFront: data.headFront,
        headSide: data.headSide,
        headTop: data.headTop,
        torso: data.torso,
        arm: data.arm,
        leg: data.leg,
      } as SkinData;
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.LIST, path);
  }
}

export async function deleteSkinFromCloud(uid: string, skinId: string) {
  const path = `users/${uid}/skins/${skinId}`;
  try {
    await deleteDoc(doc(db, 'users', uid, 'skins', skinId));
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, path);
  }
}

// Cloud Player Inventory & World Progress
export async function savePlayerWorldData(
  uid: string,
  worldKey: string,
  state: {
    gameMode: GameMode;
    health: number;
    hunger: number;
    x: number;
    y: number;
    z: number;
    slots: (InventorySlot | null)[];
  },
) {
  const safeKey = worldKey.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 128);
  const path = `users/${uid}/playerData/${safeKey}`;
  const ref = doc(db, 'users', uid, 'playerData', safeKey);
  const slotMap: Record<string, { id: string; count: number }> = {};
  state.slots.slice(0, 36).forEach((s, idx) => {
    if (s && s.id && s.count > 0) {
      slotMap[String(idx)] = { id: s.id, count: Math.min(64, Math.max(1, s.count)) };
    }
  });

  try {
    const snap = await getDoc(ref);
    if (snap.exists()) {
      await updateDoc(ref, {
        gameMode: state.gameMode,
        health: Math.max(0, Math.min(20, state.health)),
        hunger: Math.max(0, Math.min(20, state.hunger)),
        x: Math.round(state.x * 100) / 100,
        y: Math.round(state.y * 100) / 100,
        z: Math.round(state.z * 100) / 100,
        slots: slotMap,
        updatedAt: serverTimestamp(),
      });
    } else {
      await setDoc(ref, {
        worldKey: safeKey,
        ownerId: uid,
        gameMode: state.gameMode,
        health: Math.max(0, Math.min(20, state.health)),
        hunger: Math.max(0, Math.min(20, state.hunger)),
        x: Math.round(state.x * 100) / 100,
        y: Math.round(state.y * 100) / 100,
        z: Math.round(state.z * 100) / 100,
        slots: slotMap,
        updatedAt: serverTimestamp(),
      });
    }
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, path);
  }
}

export async function loadPlayerWorldData(
  uid: string,
  worldKey: string,
): Promise<{
  gameMode: GameMode;
  health: number;
  hunger: number;
  x: number;
  y: number;
  z: number;
  slots: (InventorySlot | null)[];
} | null> {
  const safeKey = worldKey.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 128);
  const path = `users/${uid}/playerData/${safeKey}`;
  try {
    const snap = await getDoc(doc(db, 'users', uid, 'playerData', safeKey));
    if (!snap.exists()) return null;
    const data = snap.data();
    const slots: (InventorySlot | null)[] = Array.from({ length: 36 }, () => null);
    if (data.slots && typeof data.slots === 'object') {
      Object.entries(data.slots as Record<string, { id: string; count: number }>).forEach(
        ([k, val]) => {
          const idx = parseInt(k, 10);
          if (!Number.isNaN(idx) && idx >= 0 && idx < 36 && val?.id) {
            slots[idx] = { id: val.id, count: val.count || 1 };
          }
        },
      );
    }
    return {
      gameMode: data.gameMode === 'creative' ? 'creative' : 'survival',
      health: typeof data.health === 'number' ? data.health : 20,
      hunger: typeof data.hunger === 'number' ? data.hunger : 20,
      x: typeof data.x === 'number' ? data.x : 0,
      y: typeof data.y === 'number' ? data.y : 30,
      z: typeof data.z === 'number' ? data.z : 0,
      slots,
    };
  } catch (err) {
    handleFirestoreError(err, OperationType.GET, path);
  }
}

// Servers
function generateJoinCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

export async function createFirebaseServer(
  user: User,
  opts: {
    worldName: string;
    worldType: WorldType;
    defaultGameMode: GameMode;
    seed: number;
    isPublic: boolean;
    activeModIds: string[];
    ownerUsername?: string | null;
  },
): Promise<ServerInfo> {
  const serverId = `srv_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  let joinCode = generateJoinCode();

  // Ensure unique joinCode
  for (let attempt = 0; attempt < 5; attempt++) {
    const codeSnap = await getDoc(doc(db, 'serverCodes', joinCode));
    if (!codeSnap.exists()) break;
    joinCode = generateJoinCode();
  }

  const batch = writeBatch(db);
  const serverRef = doc(db, 'servers', serverId);
  const codeRef = doc(db, 'serverCodes', joinCode);

  const worldName = (opts.worldName || 'BlokEvren Sunucusu').trim().slice(0, 64);
  const ownerName = (opts.ownerUsername || user.displayName || 'Kurucu').trim().slice(0, 64);

  batch.set(serverRef, {
    id: serverId,
    joinCode,
    worldName,
    ownerId: user.uid,
    ownerName,
    worldType: opts.worldType,
    defaultGameMode: opts.defaultGameMode,
    seed: opts.seed,
    isPublic: opts.isPublic,
    timeOfDay: 4000,
    activeModIds: opts.activeModIds.slice(0, 24),
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  batch.set(codeRef, {
    code: joinCode,
    serverId,
    ownerId: user.uid,
    worldName,
    createdAt: serverTimestamp(),
  });

  try {
    await batch.commit();
    return {
      id: serverId,
      joinCode,
      worldName,
      ownerId: user.uid,
      ownerName,
      worldType: opts.worldType,
      defaultGameMode: opts.defaultGameMode,
      seed: opts.seed,
      isPublic: opts.isPublic,
      timeOfDay: 4000,
      activeModIds: opts.activeModIds.slice(0, 24),
    };
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, `servers/${serverId}`);
  }
}

export async function joinServerByCode(rawCode: string): Promise<ServerInfo | null> {
  const code = rawCode.trim().toUpperCase();
  if (!/^[A-Z0-9]{6}$/.test(code)) return null;

  try {
    const codeSnap = await getDoc(doc(db, 'serverCodes', code));
    if (!codeSnap.exists()) return null;
    const serverId = codeSnap.data().serverId as string;
    const srvSnap = await getDoc(doc(db, 'servers', serverId));
    if (!srvSnap.exists()) return null;
    return srvSnap.data() as ServerInfo;
  } catch (err) {
    handleFirestoreError(err, OperationType.GET, `serverCodes/${code}`);
  }
}

export async function listAvailableServers(uid: string): Promise<ServerInfo[]> {
  try {
    const publicQ = query(
      collection(db, 'servers'),
      where('isPublic', '==', true),
      limit(20),
    );
    const myQ = query(
      collection(db, 'servers'),
      where('ownerId', '==', uid),
      limit(20),
    );
    const [pubSnap, mySnap] = await Promise.all([getDocs(publicQ), getDocs(myQ)]);
    const map = new Map<string, ServerInfo>();
    mySnap.docs.forEach((d) => map.set(d.id, d.data() as ServerInfo));
    pubSnap.docs.forEach((d) => map.set(d.id, d.data() as ServerInfo));
    return Array.from(map.values());
  } catch (err) {
    handleFirestoreError(err, OperationType.LIST, 'servers');
  }
}

export function subscribeToServer(
  serverId: string,
  callbacks: {
    onServerUpdate: (info: ServerInfo) => void;
    onBlocksSnapshot: (deltas: { x: number; y: number; z: number; blockId: string }[]) => void;
    onPlayersSnapshot: (players: RemotePlayer[]) => void;
    onMessagesSnapshot: (messages: ChatMessage[]) => void;
  },
): () => void {
  const unsubServer = onSnapshot(
    doc(db, 'servers', serverId),
    (snap) => {
      if (snap.exists()) {
        callbacks.onServerUpdate(snap.data() as ServerInfo);
      }
    },
    (err) => handleFirestoreError(err, OperationType.GET, `servers/${serverId}`),
  );

  const blocksQ = query(
    collection(db, 'servers', serverId, 'blocks'),
    where('serverId', '==', serverId),
  );
  const unsubBlocks = onSnapshot(
    blocksQ,
    (snap) => {
      const deltas = snap.docs.map((d) => {
        const data = d.data();
        return {
          x: Number(data.x),
          y: Number(data.y),
          z: Number(data.z),
          blockId: String(data.blockId),
        };
      });
      callbacks.onBlocksSnapshot(deltas);
    },
    (err) => handleFirestoreError(err, OperationType.LIST, `servers/${serverId}/blocks`),
  );

  const playersQ = query(
    collection(db, 'servers', serverId, 'players'),
    where('serverId', '==', serverId),
  );
  const unsubPlayers = onSnapshot(
    playersQ,
    (snap) => {
      const players: RemotePlayer[] = snap.docs.map((d) => {
        const data = d.data();
        return {
          uid: data.uid,
          displayName: data.displayName,
          x: data.x,
          y: data.y,
          z: data.z,
          yaw: data.yaw,
          pitch: data.pitch,
          gameMode: data.gameMode,
          heldItemId: data.heldItemId,
          skinData: data.skinData,
        };
      });
      callbacks.onPlayersSnapshot(players);
    },
    (err) => handleFirestoreError(err, OperationType.LIST, `servers/${serverId}/players`),
  );

  const msgsQ = query(
    collection(db, 'servers', serverId, 'messages'),
    where('serverId', '==', serverId),
    limit(100),
  );
  const unsubMessages = onSnapshot(
    msgsQ,
    (snap) => {
      const msgs: ChatMessage[] = snap.docs
        .map((d) => {
          const data = d.data();
          return {
            id: d.id,
            senderId: data.senderId,
            senderName: data.senderName,
            text: data.text,
            kind: data.kind,
            createdAt: data.createdAt?.toMillis?.() || Date.now(),
          };
        })
        .sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
      callbacks.onMessagesSnapshot(msgs);
    },
    (err) => handleFirestoreError(err, OperationType.LIST, `servers/${serverId}/messages`),
  );

  return () => {
    unsubServer();
    unsubBlocks();
    unsubPlayers();
    unsubMessages();
  };
}

export async function pushBlockDelta(
  serverId: string,
  uid: string,
  x: number,
  y: number,
  z: number,
  blockId: string,
) {
  const key = `${x}_${y}_${z}`;
  const path = `servers/${serverId}/blocks/${key}`;
  const ref = doc(db, 'servers', serverId, 'blocks', key);
  try {
    const snap = await getDoc(ref);
    if (snap.exists()) {
      await updateDoc(ref, {
        blockId: blockId.slice(0, 64),
        updatedBy: uid,
        updatedAt: serverTimestamp(),
      });
    } else {
      await setDoc(ref, {
        serverId,
        x,
        y,
        z,
        blockId: blockId.slice(0, 64),
        updatedBy: uid,
        updatedAt: serverTimestamp(),
      });
    }
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, path);
  }
}

export async function updatePlayerPresence(
  serverId: string,
  player: RemotePlayer,
) {
  const path = `servers/${serverId}/players/${player.uid}`;
  const ref = doc(db, 'servers', serverId, 'players', player.uid);
  const payload = {
    uid: player.uid,
    serverId,
    displayName: player.displayName.slice(0, 64) || 'Oyuncu',
    x: Math.round(player.x * 100) / 100,
    y: Math.round(player.y * 100) / 100,
    z: Math.round(player.z * 100) / 100,
    yaw: Math.round(player.yaw * 1000) / 1000,
    pitch: Math.round(player.pitch * 1000) / 1000,
    gameMode: player.gameMode,
    heldItemId: (player.heldItemId || 'air').slice(0, 64),
    skinData: {
      id: player.skinData.id,
      name: player.skinData.name,
      headFront: player.skinData.headFront.slice(0, 600),
      headSide: player.skinData.headSide.slice(0, 600),
      headTop: player.skinData.headTop.slice(0, 600),
      torso: player.skinData.torso.slice(0, 600),
      arm: player.skinData.arm.slice(0, 600),
      leg: player.skinData.leg.slice(0, 600),
    },
    updatedAt: serverTimestamp(),
  };

  try {
    const snap = await getDoc(ref);
    if (snap.exists()) {
      await updateDoc(ref, {
        displayName: payload.displayName,
        x: payload.x,
        y: payload.y,
        z: payload.z,
        yaw: payload.yaw,
        pitch: payload.pitch,
        gameMode: payload.gameMode,
        heldItemId: payload.heldItemId,
        skinData: payload.skinData,
        updatedAt: serverTimestamp(),
      });
    } else {
      await setDoc(ref, payload);
    }
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, path);
  }
}

export async function removePlayerPresence(serverId: string, uid: string) {
  const path = `servers/${serverId}/players/${uid}`;
  try {
    await deleteDoc(doc(db, 'servers', serverId, 'players', uid));
  } catch {
    // Ignore cleanup errors on disconnect
  }
}

export async function sendServerMessage(
  serverId: string,
  uid: string,
  senderName: string,
  text: string,
  kind: 'chat' | 'system' | 'command' = 'chat',
) {
  const msgId = `msg_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const path = `servers/${serverId}/messages/${msgId}`;
  try {
    await setDoc(doc(db, 'servers', serverId, 'messages', msgId), {
      serverId,
      senderId: uid,
      senderName: senderName.slice(0, 64) || 'Oyuncu',
      text: text.slice(0, 400),
      kind,
      createdAt: serverTimestamp(),
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, path);
  }
}

export async function updateServerTime(serverId: string, timeOfDay: number) {
  const path = `servers/${serverId}`;
  try {
    await updateDoc(doc(db, 'servers', serverId), {
      timeOfDay: Math.max(0, Math.min(24000, Math.round(timeOfDay))),
      updatedAt: serverTimestamp(),
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, path);
  }
}

// Community Mods
function stripUndefined<T>(obj: T): T {
  return JSON.parse(JSON.stringify(obj)) as T;
}

export async function publishModToCloud(
  user: User,
  mod: ModDefinition,
  authorUsername?: string | null,
) {
  const path = `mods/${mod.id}`;
  const ref = doc(db, 'mods', mod.id);
  const resolvedAuthorName = (
    authorUsername ||
    mod.authorName ||
    user.displayName ||
    'Mod Yapımcısı'
  ).slice(0, 64);
  const safeBlocks = stripUndefined((mod.blocks || []).slice(0, 24));
  const safeItems = stripUndefined((mod.items || []).slice(0, 24));
  const safeTools = stripUndefined((mod.tools || []).slice(0, 12));
  const safeRecipes = stripUndefined((mod.recipes || []).slice(0, 32));
  const safeCommands = stripUndefined((mod.commands || []).slice(0, 16));
  const safeAchievements = stripUndefined((mod.achievements || []).slice(0, 24));
  const cottonFields: Record<string, unknown> = {};
  if (mod.isCottonLua) {
    cottonFields.isCottonLua = true;
    cottonFields.luaSource = (mod.luaSource || '').slice(0, 45000);
    cottonFields.dependencies = (mod.dependencies || []).slice(0, 16);
  }
  if (mod.isApi) cottonFields.isApi = true;
  if (mod.pngTextures && Object.keys(mod.pngTextures).length > 0) {
    cottonFields.pngTextures = stripUndefined(
      Object.fromEntries(Object.entries(mod.pngTextures).slice(0, 24)),
    );
  }
  if (mod.models3d && Object.keys(mod.models3d).length > 0) {
    cottonFields.models3d = stripUndefined(
      Object.fromEntries(Object.entries(mod.models3d).slice(0, 16)),
    );
  }
  if (mod.assets && Object.keys(mod.assets).length > 0) {
    cottonFields.assets = stripUndefined(
      Object.fromEntries(Object.entries(mod.assets).slice(0, 24)),
    );
  }

  try {
    const snap = await getDoc(ref);
    if (snap.exists()) {
      await updateDoc(ref, {
        authorName: resolvedAuthorName,
        name: mod.name.slice(0, 64),
        description: mod.description.slice(0, 300),
        version: mod.version.slice(0, 16),
        isPublic: mod.isPublic,
        blocks: safeBlocks,
        items: safeItems,
        tools: safeTools,
        recipes: safeRecipes,
        commands: safeCommands,
        achievements: safeAchievements,
        ...cottonFields,
        updatedAt: serverTimestamp(),
      });
    } else {
      await setDoc(ref, {
        id: mod.id,
        authorId: user.uid,
        authorName: resolvedAuthorName,
        name: mod.name.slice(0, 64),
        description: mod.description.slice(0, 300),
        version: mod.version.slice(0, 16) || '1.0.0',
        isPublic: mod.isPublic,
        likes: 0,
        blocks: safeBlocks,
        items: safeItems,
        tools: safeTools,
        recipes: safeRecipes,
        commands: safeCommands,
        achievements: safeAchievements,
        ...cottonFields,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, path);
  }
}

export async function fetchCommunityMods(uid?: string): Promise<ModDefinition[]> {
  try {
    const pubQ = query(collection(db, 'mods'), where('isPublic', '==', true), limit(30));
    const pubSnap = await getDocs(pubQ);
    const map = new Map<string, ModDefinition>();
    pubSnap.docs.forEach((d) => map.set(d.id, d.data() as ModDefinition));

    if (uid) {
      const myQ = query(collection(db, 'mods'), where('authorId', '==', uid), limit(30));
      const mySnap = await getDocs(myQ);
      mySnap.docs.forEach((d) => map.set(d.id, d.data() as ModDefinition));
    }
    return Array.from(map.values());
  } catch (err) {
    handleFirestoreError(err, OperationType.LIST, 'mods');
  }
}

export async function likeCommunityMod(modId: string, currentLikes: number) {
  const path = `mods/${modId}`;
  try {
    await updateDoc(doc(db, 'mods', modId), {
      likes: currentLikes + 1,
      updatedAt: serverTimestamp(),
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, path);
  }
}

export async function deleteCommunityMod(modId: string) {
  const path = `mods/${modId}`;
  try {
    await deleteDoc(doc(db, 'mods', modId));
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, path);
  }
}
