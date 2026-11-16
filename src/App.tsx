import { onAuthStateChanged, User } from 'firebase/auth';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AchievementsModal } from './components/AchievementsModal';
import { FriendsModal } from './components/FriendsModal';
import { GameHUD } from './components/GameHUD';
import { InventoryCraftingModal } from './components/InventoryCraftingModal';
import { ModWorkshopModal } from './components/ModWorkshopModal';
import { MultiplayerModal } from './components/MultiplayerModal';
import { SkinDesignerModal } from './components/SkinDesignerModal';
import { TexturePackModal } from './components/TexturePackModal';
import { TitleScreen } from './components/TitleScreen';
import { UsernameSetupModal } from './components/UsernameSetupModal';
import {
  VoxelViewport,
  VoxelViewportHandle,
  WeatherMode,
  WeatherType,
} from './components/VoxelViewport';
import {
  EMPTY_ACHIEVEMENT_STATE,
  evaluateSurvivalAchievementEvent,
  mergeAchievementStates,
  sanitizeAchievementState,
  SurvivalAchievementEvent,
} from './data/achievements';
import {
  applyActiveMods,
  getActiveModAchievements,
  getActiveModCommands,
  getAllAchievements,
  getAllItems,
  getItemDef,
} from './data/blocksAndRecipes';
import { DEFAULT_SKIN, PRESET_SKINS } from './data/presetSkins';
import { applyActiveTexturePack, BUILTIN_TEXTURE_PACKS } from './data/texturePacks';
import { triggerCottonLuaCommand } from './cottonlua/cottonLuaRuntime';
import { voxelAudio } from './engine/audio';
import { auth } from './firebase';
import {
  ensureUserProfile,
  fetchCommunityMods,
  fetchUserProfile,
  fetchUserSkins,
  loadPlayerWorldData,
  pushBlockDelta,
  removePlayerPresence,
  savePlayerWorldData,
  saveUserAchievements,
  saveUserActiveSkin,
  saveUserInstalledMods,
  sendServerMessage,
  signInWithGoogle,
  subscribeToFriendsAndRequests,
  subscribeToServer,
  updatePlayerPresence,
  updateServerTime,
} from './services/cloudService';
import {
  AchievementDef,
  AchievementProgressState,
  BiomeType,
  ChatMessage,
  FriendLink,
  FriendRequest,
  GameMode,
  InventorySlot,
  MobKind,
  ModDefinition,
  RecipeDef,
  RemotePlayer,
  ServerInfo,
  SkinData,
  TexturePackDef,
  WorldLaunchConfig,
} from './types/game';

const LOCAL_SKINS_KEY = 'blokevren_skins_v1';
const LOCAL_ACTIVE_SKIN_KEY = 'blokevren_active_skin_v1';
const LOCAL_MODS_KEY = 'blokevren_mods_v1';
const LOCAL_ENABLED_MODS_KEY = 'blokevren_enabled_mods_v1';
const LOCAL_TPACKS_KEY = 'blokevren_tpacks_v1';
const LOCAL_ACTIVE_TPACK_KEY = 'blokevren_active_tpack_v1';
const LOCAL_ACHIEVEMENTS_PREFIX = 'blokevren_achievements_v1_';

function loadCachedAchievements(keySuffix: string): AchievementProgressState {
  try {
    const raw = localStorage.getItem(`${LOCAL_ACHIEVEMENTS_PREFIX}${keySuffix}`);
    return raw ? sanitizeAchievementState(JSON.parse(raw)) : EMPTY_ACHIEVEMENT_STATE;
  } catch {
    return EMPTY_ACHIEVEMENT_STATE;
  }
}

function persistCachedAchievements(keySuffix: string, state: AchievementProgressState) {
  try {
    localStorage.setItem(`${LOCAL_ACHIEVEMENTS_PREFIX}${keySuffix}`, JSON.stringify(state));
  } catch {
    // ignore storage quota
  }
}

function makeStarterSlots(mode: GameMode): (InventorySlot | null)[] {
  const slots: (InventorySlot | null)[] = Array.from({ length: 36 }, () => null);
  if (mode === 'creative') {
    const starter = [
      'grass',
      'stone',
      'oak_planks',
      'cobblestone',
      'bricks',
      'glass',
      'oak_log',
      'glowstone',
      'diamond_pickaxe',
    ];
    starter.forEach((id, i) => {
      slots[i] = { id, count: 64 };
    });
  } else {
    slots[0] = { id: 'wooden_pickaxe', count: 1 };
    slots[1] = { id: 'wooden_axe', count: 1 };
    slots[2] = { id: 'torch', count: 8 };
    slots[3] = { id: 'apple', count: 4 };
    slots[4] = { id: 'oak_planks', count: 16 };
  }
  return slots;
}

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [username, setUsername] = useState<string | null>(null);
  const [profileLoaded, setProfileLoaded] = useState(false);
  const [friends, setFriends] = useState<FriendLink[]>([]);
  const [incomingFriendRequests, setIncomingFriendRequests] = useState<FriendRequest[]>([]);
  const [outgoingFriendRequests, setOutgoingFriendRequests] = useState<FriendRequest[]>([]);
  const [activeWorld, setActiveWorld] = useState<WorldLaunchConfig | null>(null);

  // Skins
  const [savedSkins, setSavedSkins] = useState<SkinData[]>(() => {
    try {
      const raw = localStorage.getItem(LOCAL_SKINS_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  });
  const [activeSkin, setActiveSkin] = useState<SkinData>(() => {
    try {
      const raw = localStorage.getItem(LOCAL_ACTIVE_SKIN_KEY);
      return raw ? JSON.parse(raw) : DEFAULT_SKIN;
    } catch {
      return DEFAULT_SKIN;
    }
  });

  // Mods
  const [localMods, setLocalMods] = useState<ModDefinition[]>(() => {
    try {
      const raw = localStorage.getItem(LOCAL_MODS_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  });
  const [enabledModIds, setEnabledModIds] = useState<string[]>(() => {
    try {
      const raw = localStorage.getItem(LOCAL_ENABLED_MODS_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  });

  // Texture Packs
  const [customTexturePacks, setCustomTexturePacks] = useState<TexturePackDef[]>(() => {
    try {
      const raw = localStorage.getItem(LOCAL_TPACKS_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  });
  const [activeTexturePackId, setActiveTexturePackId] = useState<string>(() => {
    try {
      return localStorage.getItem(LOCAL_ACTIVE_TPACK_KEY) || BUILTIN_TEXTURE_PACKS[0].id;
    } catch {
      return BUILTIN_TEXTURE_PACKS[0].id;
    }
  });
  const [textureVersion, setTextureVersion] = useState(0);

  // Modals
  const [showMultiplayer, setShowMultiplayer] = useState(false);
  const [showFriends, setShowFriends] = useState(false);
  const [showUsernameModal, setShowUsernameModal] = useState(false);
  const [showSkinDesigner, setShowSkinDesigner] = useState(false);
  const [showModWorkshop, setShowModWorkshop] = useState(false);
  const [showTexturePacks, setShowTexturePacks] = useState(false);
  const [showAchievements, setShowAchievements] = useState(false);
  const [inventoryTab, setInventoryTab] = useState<'craft' | 'furnace' | 'creative' | null>(null);

  // Achievements (Survival-only, synced to Google Account)
  const [achievementState, setAchievementState] = useState<AchievementProgressState>(() =>
    loadCachedAchievements('guest'),
  );
  const achievementStateRef = useRef<AchievementProgressState>(achievementState);
  achievementStateRef.current = achievementState;
  const [achievementToastQueue, setAchievementToastQueue] = useState<AchievementDef[]>([]);
  const achievementSyncTimerRef = useRef<number | null>(null);

  // Active Game State
  const [gameMode, setGameMode] = useState<GameMode>('survival');
  const gameModeRef = useRef<GameMode>(gameMode);
  gameModeRef.current = gameMode;
  const userRef = useRef<User | null>(user);
  userRef.current = user;
  const [health, setHealth] = useState(20);
  const [hunger, setHunger] = useState(20);
  const [slots, setSlots] = useState<(InventorySlot | null)[]>(() => makeStarterSlots('survival'));
  const [selectedSlot, setSelectedSlot] = useState(0);
  const [position, setPosition] = useState({
    x: 0.5,
    y: 52,
    z: 0.5,
    yaw: 0,
    pitch: 0,
    flying: false,
    thirdPerson: false,
  });
  const [initialSpawnPos, setInitialSpawnPos] = useState<{ x: number; y: number; z: number } | undefined>(
    undefined,
  );
  const [timeOfDay, setTimeOfDay] = useState(4000);
  const [weatherState, setWeatherState] = useState<{
    active: WeatherType;
    mode: WeatherMode;
    wetness: number;
  }>({ active: 'clear', mode: 'auto', wetness: 0 });
  const weatherActiveRef = useRef<WeatherType>('clear');
  weatherActiveRef.current = weatherState.active;
  const [targetBlockName, setTargetBlockName] = useState<string | null>(null);
  const [pointerLocked, setPointerLocked] = useState(false);
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [muted, setMuted] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [remotePlayers, setRemotePlayers] = useState<RemotePlayer[]>([]);

  const viewportRef = useRef<VoxelViewportHandle>(null);

  const [modRegistryVersion, setModRegistryVersion] = useState(0);

  // Sync Mods Registry whenever localMods or enabledModIds changes
  useEffect(() => {
    const activeMods = localMods.filter((m) => enabledModIds.includes(m.id));
    applyActiveMods(activeMods);
    setModRegistryVersion((v) => v + 1);
    viewportRef.current?.rebuildAllChunks();
  }, [localMods, enabledModIds]);

  // Sync Active Texture Pack Registry & persist
  useEffect(() => {
    const found =
      customTexturePacks.find((p) => p.id === activeTexturePackId) ||
      BUILTIN_TEXTURE_PACKS.find((p) => p.id === activeTexturePackId) ||
      BUILTIN_TEXTURE_PACKS[0];
    applyActiveTexturePack(found);
    setTextureVersion((v) => v + 1);
    viewportRef.current?.rebuildAllChunks();
    try {
      localStorage.setItem(LOCAL_TPACKS_KEY, JSON.stringify(customTexturePacks));
      localStorage.setItem(LOCAL_ACTIVE_TPACK_KEY, found.id);
    } catch {
      // ignore storage quota
    }
  }, [customTexturePacks, activeTexturePackId]);

  // Persist local skins & mods cache
  useEffect(() => {
    try {
      localStorage.setItem(LOCAL_SKINS_KEY, JSON.stringify(savedSkins));
      localStorage.setItem(LOCAL_ACTIVE_SKIN_KEY, JSON.stringify(activeSkin));
    } catch {
      // ignore storage quota
    }
  }, [savedSkins, activeSkin]);

  useEffect(() => {
    try {
      localStorage.setItem(LOCAL_MODS_KEY, JSON.stringify(localMods));
      localStorage.setItem(LOCAL_ENABLED_MODS_KEY, JSON.stringify(enabledModIds));
    } catch {
      // ignore storage quota
    }
  }, [localMods, enabledModIds]);

  // Firebase Auth State Listener
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (u) => {
      setUser(u);
      if (u) {
        setProfileLoaded(false);
        setUsername(null);
        try {
          await ensureUserProfile(u);
          const [profile, cloudSkins, cloudMods] = await Promise.all([
            fetchUserProfile(u.uid),
            fetchUserSkins(u.uid),
            fetchCommunityMods(u.uid),
          ]);
          const loadedUsername = profile?.username || null;
          setUsername(loadedUsername);
          if (!loadedUsername) {
            setShowUsernameModal(true);
          }
          if (cloudSkins.length > 0) {
            setSavedSkins(cloudSkins);
          }
          if (profile?.activeSkinId) {
            const found =
              cloudSkins.find((s) => s.id === profile.activeSkinId) ||
              PRESET_SKINS.find((s) => s.id === profile.activeSkinId);
            if (found) setActiveSkin(found);
          }
          if (cloudMods.length > 0) {
            setLocalMods((prev) => {
              const map = new Map<string, ModDefinition>();
              prev.forEach((m) => map.set(m.id, m));
              cloudMods.forEach((m) => map.set(m.id, m));
              return Array.from(map.values());
            });
          }
          if (profile?.installedModIds?.length) {
            setEnabledModIds((prev) =>
              Array.from(new Set([...prev, ...profile.installedModIds])),
            );
          }

          // Merge & sync survival achievements with Google account
          const cloudAch = profile?.achievements || EMPTY_ACHIEVEMENT_STATE;
          const uidCachedAch = loadCachedAchievements(u.uid);
          const guestAch = loadCachedAchievements('guest');
          const modAchs = getActiveModAchievements();
          const mergedAch = mergeAchievementStates(
            mergeAchievementStates(cloudAch, uidCachedAch, modAchs),
            guestAch,
            modAchs,
          );
          achievementStateRef.current = mergedAch;
          setAchievementState(mergedAch);
          persistCachedAchievements(u.uid, mergedAch);
          try {
            localStorage.removeItem(`${LOCAL_ACHIEVEMENTS_PREFIX}guest`);
          } catch {
            // ignore
          }
          if (JSON.stringify(mergedAch) !== JSON.stringify(cloudAch)) {
            saveUserAchievements(u.uid, mergedAch).catch(() => {});
          }
        } catch (err) {
          console.error('Cloud sync init error:', err);
        } finally {
          setProfileLoaded(true);
        }
      } else {
        setUsername(null);
        setProfileLoaded(false);
        setShowUsernameModal(false);
        setFriends([]);
        setIncomingFriendRequests([]);
        setOutgoingFriendRequests([]);
        const guestAch = loadCachedAchievements('guest');
        achievementStateRef.current = guestAch;
        setAchievementState(guestAch);
      }
    });
    return () => unsub();
  }, []);

  // Friends & Requests Realtime Subscription
  useEffect(() => {
    if (!user?.uid) return;
    const unsub = subscribeToFriendsAndRequests(user.uid, {
      onFriends: setFriends,
      onIncomingRequests: setIncomingFriendRequests,
      onOutgoingRequests: setOutgoingFriendRequests,
    });
    return () => unsub();
  }, [user?.uid]);

  const playerDisplayName = username || user?.displayName || 'Oyuncu';
  const needsUsernameSetup = Boolean(user && profileLoaded && !username);

  // Auto-advance achievement toast banner
  useEffect(() => {
    if (achievementToastQueue.length === 0) return;
    const timer = window.setTimeout(() => {
      setAchievementToastQueue((prev) => prev.slice(1));
    }, 4200);
    return () => clearTimeout(timer);
  }, [achievementToastQueue]);

  // Flush achievement cloud save on unmount/exit
  const flushAchievementSave = useCallback(async () => {
    if (achievementSyncTimerRef.current !== null) {
      window.clearTimeout(achievementSyncTimerRef.current);
      achievementSyncTimerRef.current = null;
    }
    const u = userRef.current;
    if (u) {
      await saveUserAchievements(u.uid, achievementStateRef.current).catch(() => {});
    }
  }, []);

  const isAnyModalOpen = useMemo(
    () =>
      Boolean(
        showMultiplayer ||
          showFriends ||
          showUsernameModal ||
          needsUsernameSetup ||
          showSkinDesigner ||
          showModWorkshop ||
          showTexturePacks ||
          showAchievements ||
          inventoryTab !== null ||
          isChatOpen ||
          (activeWorld && gameMode === 'survival' && health <= 0),
      ),
    [
      showMultiplayer,
      showFriends,
      showUsernameModal,
      needsUsernameSetup,
      showSkinDesigner,
      showModWorkshop,
      showTexturePacks,
      showAchievements,
      inventoryTab,
      isChatOpen,
      activeWorld,
      gameMode,
      health,
    ],
  );

  // World Launch Handler
  const handleStartWorld = async (config: WorldLaunchConfig) => {
    setShowMultiplayer(false);
    setInventoryTab(null);
    setIsChatOpen(false);

    // If server has mods, ensure they're enabled if present
    if (config.activeModIds?.length) {
      setEnabledModIds((prev) => Array.from(new Set([...prev, ...config.activeModIds])));
    }

    const worldKey = config.mode === 'server' && config.serverId ? config.serverId : `solo_${config.seed}_${config.worldType}`;
    let loadedMode = config.gameMode;
    let loadedHealth = 20;
    let loadedHunger = 20;
    let loadedSlots = makeStarterSlots(config.gameMode);
    let spawnPos: { x: number; y: number; z: number } | undefined = undefined;

    if (user) {
      try {
        const saved = await loadPlayerWorldData(user.uid, worldKey);
        if (saved) {
          loadedMode = saved.gameMode;
          loadedHealth = saved.health > 0 ? saved.health : 20;
          loadedHunger = saved.hunger;
          loadedSlots = saved.slots;
          spawnPos = { x: saved.x, y: saved.y, z: saved.z };
        }
      } catch {
        // use defaults on first join
      }
    }

    setGameMode(loadedMode);
    setHealth(loadedHealth);
    setHunger(loadedHunger);
    setSlots(loadedSlots);
    setInitialSpawnPos(spawnPos);
    setTimeOfDay(config.initialTimeOfDay ?? 4000);
    setMessages([
      {
        id: `sys_${Date.now()}`,
        senderId: 'system',
        senderName: 'Sistem',
        text:
          config.mode === 'server'
            ? `"${config.worldName}" sunucusuna bağlandın! Kod: ${config.joinCode} · Komutlar için /yardim yaz.`
            : `"${config.worldName}" dünyasına hoş geldin! Komutlar için T tuşuna basıp /yardim yazabilirsin.`,
        kind: 'system',
      },
    ]);
    setRemotePlayers([]);
    setActiveWorld(config);

    if (config.mode === 'server' && config.serverId && user) {
      sendServerMessage(
        config.serverId,
        user.uid,
        playerDisplayName,
        `${playerDisplayName} sunucuya katıldı.`,
        'system',
      ).catch(() => {});
    }
  };

  const handleJoinFriendServer = (srv: ServerInfo) => {
    setShowFriends(false);
    handleStartWorld({
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

  // Multiplayer Real-time Subscriptions
  useEffect(() => {
    if (!activeWorld || activeWorld.mode !== 'server' || !activeWorld.serverId || !user) {
      return;
    }
    const serverId = activeWorld.serverId;
    const unsub = subscribeToServer(serverId, {
      onServerUpdate: (srv) => {
        if (Math.abs(srv.timeOfDay - timeOfDay) > 800) {
          viewportRef.current?.setTimeOfDay(srv.timeOfDay);
        }
      },
      onBlocksSnapshot: (deltas) => {
        for (const d of deltas) {
          viewportRef.current?.applyRemoteBlock(d.x, d.y, d.z, d.blockId);
        }
      },
      onPlayersSnapshot: (players) => {
        setRemotePlayers(players);
      },
      onMessagesSnapshot: (msgs) => {
        setMessages((prev) => {
          if (msgs.length > prev.length) {
            voxelAudio.playChat();
          }
          return msgs;
        });
      },
    });

    return () => {
      unsub();
      removePlayerPresence(serverId, user.uid);
    };
  }, [activeWorld, user]);

  // Multiplayer Presence Heartbeat
  const heldItemId = slots[selectedSlot]?.id || 'air';
  useEffect(() => {
    if (!activeWorld || activeWorld.mode !== 'server' || !activeWorld.serverId || !user) {
      return;
    }
    const serverId = activeWorld.serverId;
    const interval = window.setInterval(() => {
      const pos = viewportRef.current?.getPlayerPosition();
      if (!pos) return;
      updatePlayerPresence(serverId, {
        uid: user.uid,
        displayName: playerDisplayName,
        x: pos.x,
        y: pos.y,
        z: pos.z,
        yaw: pos.yaw,
        pitch: pos.pitch,
        gameMode,
        heldItemId,
        skinData: activeSkin,
      }).catch(() => {});
    }, 450);

    return () => clearInterval(interval);
  }, [activeWorld, user, playerDisplayName, gameMode, heldItemId, activeSkin]);

  // Cloud Player Save (periodic & on exit)
  const saveCurrentWorldProgress = useCallback(async () => {
    if (!user || !activeWorld) return;
    const worldKey =
      activeWorld.mode === 'server' && activeWorld.serverId
        ? activeWorld.serverId
        : `solo_${activeWorld.seed}_${activeWorld.worldType}`;
    const pos = viewportRef.current?.getPlayerPosition();
    await savePlayerWorldData(user.uid, worldKey, {
      gameMode,
      health,
      hunger,
      x: pos?.x ?? position.x,
      y: pos?.y ?? position.y,
      z: pos?.z ?? position.z,
      slots,
    }).catch(() => {});
  }, [user, activeWorld, gameMode, health, hunger, slots, position]);

  useEffect(() => {
    if (!activeWorld || !user) return;
    const timer = window.setInterval(() => {
      saveCurrentWorldProgress();
    }, 15000);
    return () => clearInterval(timer);
  }, [activeWorld, user, saveCurrentWorldProgress]);

  // Survival Hunger Tick
  useEffect(() => {
    if (!activeWorld || gameMode !== 'survival' || health <= 0) return;
    const timer = window.setInterval(() => {
      setHunger((h) => {
        if (h <= 0) {
          setHealth((hp) => Math.max(0, hp - 1));
          return 0;
        }
        return Math.max(0, h - 0.5);
      });
    }, 18000);
    return () => clearInterval(timer);
  }, [activeWorld, gameMode, health]);

  // Global Gameplay Keyboard & Wheel Shortcuts
  useEffect(() => {
    if (!activeWorld) return;

    const onKeyDown = (e: KeyboardEvent) => {
      if (isChatOpen) return;

      if (e.code === 'KeyE' && !e.repeat && !showSkinDesigner && !showModWorkshop && !showTexturePacks) {
        e.preventDefault();
        if (inventoryTab !== null) {
          setInventoryTab(null);
          viewportRef.current?.requestLock();
        } else {
          viewportRef.current?.unlockPointer();
          setInventoryTab(gameMode === 'creative' ? 'creative' : 'craft');
        }
      } else if ((e.code === 'KeyT' || e.key === '/') && !e.repeat && !isAnyModalOpen) {
        e.preventDefault();
        viewportRef.current?.unlockPointer();
        setIsChatOpen(true);
      } else if (e.code >= 'Digit1' && e.code <= 'Digit9' && !isAnyModalOpen) {
        const idx = parseInt(e.code.replace('Digit', ''), 10) - 1;
        setSelectedSlot(idx);
      }
    };

    const onWheel = (e: WheelEvent) => {
      if (!pointerLocked || isAnyModalOpen) return;
      setSelectedSlot((prev) => (prev + (e.deltaY > 0 ? 1 : 8)) % 9);
    };

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('wheel', onWheel);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('wheel', onWheel);
    };
  }, [
    activeWorld,
    isChatOpen,
    inventoryTab,
    gameMode,
    isAnyModalOpen,
    pointerLocked,
    showSkinDesigner,
    showModWorkshop,
    showTexturePacks,
  ]);

  // Give Item Helper
  const giveItemToInventory = useCallback((itemId: string, count: number) => {
    const def = getItemDef(itemId);
    if (!def) return;
    setSlots((prev) => {
      const next = prev.map((s) => (s ? { ...s } : null));
      let rem = count;
      const maxS = def.stackSize || 64;
      for (let i = 0; i < next.length && rem > 0; i++) {
        const sl = next[i];
        if (sl && sl.id === itemId && sl.count < maxS) {
          const add = Math.min(maxS - sl.count, rem);
          sl.count += add;
          rem -= add;
        }
      }
      for (let i = 0; i < next.length && rem > 0; i++) {
        if (!next[i]) {
          const add = Math.min(maxS, rem);
          next[i] = { id: itemId, count: add };
          rem -= add;
        }
      }
      return next;
    });
  }, []);

  // Chat & Command Line Execution
  const pushLocalSystemMsg = useCallback((text: string) => {
    setMessages((prev) => [
      ...prev,
      {
        id: `sys_${Date.now()}_${Math.random()}`,
        senderId: 'system',
        senderName: 'Sistem',
        text,
        kind: 'system',
        createdAt: Date.now(),
      },
    ]);
  }, []);

  // Survival-Only Achievement Trigger
  const triggerSurvivalAchievement = useCallback(
    (event: SurvivalAchievementEvent) => {
      if (gameModeRef.current !== 'survival') return;
      const res = evaluateSurvivalAchievementEvent(
        achievementStateRef.current,
        gameModeRef.current,
        event,
        getActiveModAchievements(),
      );
      if (!res.changed) return;

      achievementStateRef.current = res.next;
      setAchievementState(res.next);

      const u = userRef.current;
      persistCachedAchievements(u ? u.uid : 'guest', res.next);

      if (res.newlyUnlocked.length > 0) {
        voxelAudio.playAchievement();
        setAchievementToastQueue((prev) => [...prev, ...res.newlyUnlocked]);
        res.newlyUnlocked.forEach((a) => {
          pushLocalSystemMsg(`Başarım Kazanıldı: ${a.title} (+${a.points}p)`);
        });
        if (u) {
          if (achievementSyncTimerRef.current !== null) {
            window.clearTimeout(achievementSyncTimerRef.current);
            achievementSyncTimerRef.current = null;
          }
          saveUserAchievements(u.uid, res.next).catch(() => {});
        }
      } else if (u) {
        if (achievementSyncTimerRef.current === null) {
          achievementSyncTimerRef.current = window.setTimeout(() => {
            achievementSyncTimerRef.current = null;
            const curUser = userRef.current;
            if (curUser) {
              saveUserAchievements(curUser.uid, achievementStateRef.current).catch(() => {});
            }
          }, 6000);
        }
      }
    },
    [pushLocalSystemMsg],
  );

  const handleCottonLuaAchievement = useCallback(
    (code: string, amount?: number) => {
      triggerSurvivalAchievement({ type: 'custom_achievement', code, amount });
    },
    [triggerSurvivalAchievement],
  );

  // Block Break & Place Handlers
  const handleBlockBreak = useCallback(
    (x: number, y: number, z: number, blockId: string, dropId: string, dropCount: number) => {
      if (gameMode === 'survival') {
        giveItemToInventory(dropId, dropCount);
        triggerSurvivalAchievement({ type: 'block_break', blockId, dropId });
      }
      if (activeWorld?.mode === 'server' && activeWorld.serverId && user) {
        pushBlockDelta(activeWorld.serverId, user.uid, x, y, z, 'air').catch(() => {});
      }
    },
    [gameMode, giveItemToInventory, triggerSurvivalAchievement, activeWorld, user],
  );

  const handleReplaceHeldItem = useCallback(
    (newItemId: string) => {
      if (gameMode !== 'survival') return;
      setSlots((prev) => {
        const next = [...prev];
        const cur = next[selectedSlot];
        if (!cur) return prev;
        if (cur.count <= 1) {
          next[selectedSlot] = { id: newItemId, count: 1 };
        } else {
          next[selectedSlot] = { id: cur.id, count: cur.count - 1 };
          const maxStack = getItemDef(newItemId)?.stackSize || 64;
          const existingIdx = next.findIndex((s) => s && s.id === newItemId && s.count < maxStack);
          if (existingIdx >= 0 && next[existingIdx]) {
            next[existingIdx] = { id: newItemId, count: next[existingIdx]!.count + 1 };
          } else {
            const emptyIdx = next.findIndex((s) => !s);
            if (emptyIdx >= 0) next[emptyIdx] = { id: newItemId, count: 1 };
          }
        }
        return next;
      });
    },
    [gameMode, selectedSlot],
  );

  const handleScoopLiquid = useCallback(
    (x: number, y: number, z: number, _liquidId: string, filledBucketId: string) => {
      if (gameMode === 'survival') {
        handleReplaceHeldItem(filledBucketId);
      }
      if (activeWorld?.mode === 'server' && activeWorld.serverId && user) {
        pushBlockDelta(activeWorld.serverId, user.uid, x, y, z, 'air').catch(() => {});
      }
    },
    [gameMode, handleReplaceHeldItem, activeWorld, user],
  );

  const handleBlockPlace = useCallback(
    (x: number, y: number, z: number, blockId: string): boolean => {
      if (gameMode === 'survival') {
        const cur = slots[selectedSlot];
        const curDef = cur ? getItemDef(cur.id) : undefined;
        const isBucketPlace = curDef?.placesLiquidId === blockId;
        if (!cur || (!isBucketPlace && cur.id !== blockId) || cur.count <= 0) return false;
        if (isBucketPlace) {
          handleReplaceHeldItem('bucket');
        } else {
          setSlots((prev) => {
            const next = [...prev];
            const sl = next[selectedSlot];
            if (sl) {
              next[selectedSlot] = sl.count > 1 ? { id: sl.id, count: sl.count - 1 } : null;
            }
            return next;
          });
        }
        triggerSurvivalAchievement({ type: 'block_place', blockId });
      }
      if (activeWorld?.mode === 'server' && activeWorld.serverId && user) {
        pushBlockDelta(activeWorld.serverId, user.uid, x, y, z, blockId).catch(() => {});
      }
      return true;
    },
    [gameMode, slots, selectedSlot, handleReplaceHeldItem, triggerSurvivalAchievement, activeWorld, user],
  );

  const handleEatFood = useCallback(
    (itemId: string, foodValue: number) => {
      if (gameMode !== 'survival' || hunger >= 20) return;
      setHunger((h) => Math.min(20, h + foodValue));
      setHealth((hp) => Math.min(20, hp + Math.ceil(foodValue * 0.6)));
      setSlots((prev) => {
        const next = [...prev];
        const sl = next[selectedSlot];
        if (sl) {
          next[selectedSlot] = sl.count > 1 ? { id: sl.id, count: sl.count - 1 } : null;
        }
        return next;
      });
      voxelAudio.playCraft();
      triggerSurvivalAchievement({ type: 'eat_food', itemId });
    },
    [gameMode, hunger, selectedSlot, triggerSurvivalAchievement],
  );

  const handleConsumeHeldItem = useCallback(
    (count: number) => {
      if (gameMode !== 'survival' || count <= 0) return;
      setSlots((prev) => {
        const next = [...prev];
        const sl = next[selectedSlot];
        if (sl) {
          next[selectedSlot] = sl.count > count ? { id: sl.id, count: sl.count - count } : null;
        }
        return next;
      });
    },
    [gameMode, selectedSlot],
  );

  const handleMobDrops = useCallback(
    (drops: { id: string; count: number }[]) => {
      if (gameMode !== 'survival') return;
      for (const drop of drops) {
        if (drop.count > 0) {
          giveItemToInventory(drop.id, drop.count);
        }
      }
    },
    [gameMode, giveItemToInventory],
  );

  const handleMobKilled = useCallback(
    (kind: MobKind) => {
      triggerSurvivalAchievement({ type: 'mob_kill', kind });
    },
    [triggerSurvivalAchievement],
  );

  const handleMobBred = useCallback(
    (kind: MobKind) => {
      triggerSurvivalAchievement({ type: 'mob_breed', kind });
    },
    [triggerSurvivalAchievement],
  );

  const handleCraftSuccess = useCallback(
    (recipe: RecipeDef) => {
      triggerSurvivalAchievement({ type: 'craft', recipe });
    },
    [triggerSurvivalAchievement],
  );

  const handlePositionUpdate = useCallback(
    (pos: {
      x: number;
      y: number;
      z: number;
      yaw: number;
      pitch: number;
      flying: boolean;
      thirdPerson: boolean;
      biome?: BiomeType;
    }) => {
      setPosition(pos);
      if (gameModeRef.current === 'survival') {
        triggerSurvivalAchievement({
          type: 'world_tick',
          y: pos.y,
          biome: pos.biome,
          weather: weatherActiveRef.current,
        });
      }
    },
    [triggerSurvivalAchievement],
  );

  const handleSendMessageOrCommand = async (raw: string) => {
    if (raw.startsWith('/')) {
      const parts = raw.slice(1).trim().split(/\s+/);
      const cmd = (parts[0] || '').toLowerCase();
      const arg1 = (parts[1] || '').toLowerCase();

      if (cmd === 'help' || cmd === 'yardim') {
        const modCmds = getActiveModCommands();
        const modPart =
          modCmds.length > 0
            ? ` · Mod Komutları: ${modCmds.map((c) => `/${c.command}`).join(' ')}`
            : '';
        pushLocalSystemMsg(
          `Komutlar: /gamemode creative | survival · /time day | night | sunset · /weather clear | rain | snow | auto · /tp x y z · /give <esya> [adet] · /fly · /clear · /seed · /kod${modPart}`,
        );
      } else if (cmd === 'weather' || cmd === 'hava') {
        let nextMode: WeatherMode | null = null;
        if (arg1 === 'clear' || arg1 === 'acik' || arg1 === 'gunes') nextMode = 'clear';
        else if (arg1 === 'rain' || arg1 === 'yagmur') nextMode = 'rain';
        else if (arg1 === 'snow' || arg1 === 'kar') nextMode = 'snow';
        else if (arg1 === 'auto' || arg1 === 'oto' || arg1 === 'otomatik') nextMode = 'auto';

        if (!nextMode) {
          pushLocalSystemMsg('Kullanım: /weather clear | rain | snow | auto (veya /hava acik | yagmur | kar | oto)');
        } else {
          viewportRef.current?.setWeather(nextMode);
          setWeatherState((prev) => ({
            ...prev,
            mode: nextMode,
            active: nextMode === 'auto' ? prev.active : nextMode,
          }));
          const label =
            nextMode === 'rain'
              ? 'Yağmurlu'
              : nextMode === 'snow'
                ? 'Karlı'
                : nextMode === 'clear'
                  ? 'Açık'
                  : 'Otomatik (Biyoma Göre)';
          pushLocalSystemMsg(`Hava durumu "${label}" olarak ayarlandı.`);
        }
      } else if (cmd === 'gamemode' || cmd === 'gm') {
        if (arg1 === 'creative' || arg1 === 'c' || arg1 === '1' || arg1 === 'yaratici') {
          setGameMode('creative');
          pushLocalSystemMsg('Oyun modu "Yaratıcılık" olarak değiştirildi.');
        } else if (arg1 === 'survival' || arg1 === 's' || arg1 === '0' || arg1 === 'hayatta') {
          setGameMode('survival');
          pushLocalSystemMsg('Oyun modu "Hayatta Kalma" olarak değiştirildi.');
        } else {
          pushLocalSystemMsg('Kullanım: /gamemode creative veya /gamemode survival');
        }
      } else if (cmd === 'time') {
        let t = 4000;
        if (arg1 === 'day' || arg1 === 'gunduz') t = 4000;
        else if (arg1 === 'noon' || arg1 === 'ogle') t = 6000;
        else if (arg1 === 'sunset' || arg1 === 'aksam') t = 11500;
        else if (arg1 === 'night' || arg1 === 'gece') t = 18000;
        else if (!Number.isNaN(Number(arg1))) t = Number(arg1);
        viewportRef.current?.setTimeOfDay(t);
        setTimeOfDay(t);
        if (activeWorld?.mode === 'server' && activeWorld.serverId) {
          updateServerTime(activeWorld.serverId, t).catch(() => {});
        }
        pushLocalSystemMsg(`Dünya saati ${t} olarak ayarlandı.`);
      } else if (cmd === 'tp') {
        const tx = Number(parts[1]);
        const ty = Number(parts[2]);
        const tz = Number(parts[3]);
        if ([tx, ty, tz].some((n) => Number.isNaN(n))) {
          pushLocalSystemMsg('Kullanım: /tp <x> <y> <z>');
        } else {
          viewportRef.current?.teleport(tx, ty, tz);
          pushLocalSystemMsg(`Işınlanıldı: X:${tx} Y:${ty} Z:${tz}`);
        }
      } else if (cmd === 'give') {
        const queryStr = (parts[1] || '').toLowerCase();
        const count = Math.max(1, Math.min(64, Number(parts[2]) || 16));
        const found = getAllItems().find(
          (i) => i.id.toLowerCase() === queryStr || i.name.toLowerCase().includes(queryStr),
        );
        if (!found) {
          pushLocalSystemMsg(`Eşya bulunamadı: "${parts[1]}"`);
        } else {
          giveItemToInventory(found.id, count);
          pushLocalSystemMsg(`${count}× ${found.name} envanterine eklendi.`);
        }
      } else if (cmd === 'fly') {
        const flying = viewportRef.current?.toggleFly();
        pushLocalSystemMsg(flying ? 'Uçuş modu açıldı.' : 'Uçuş modu kapatıldı.');
      } else if (cmd === 'clear') {
        setSlots(Array.from({ length: 36 }, () => null));
        pushLocalSystemMsg('Envanter temizlendi.');
      } else if (cmd === 'seed') {
        pushLocalSystemMsg(`Dünya Tohumu (Seed): ${activeWorld?.seed}`);
      } else if (cmd === 'kod') {
        pushLocalSystemMsg(
          activeWorld?.joinCode
            ? `Sunucu Katılım Kodu: ${activeWorld.joinCode}`
            : 'Şu an tek oyunculu dünyadasın.',
        );
      } else {
        const modCmd = getActiveModCommands().find((c) => c.command === cmd);
        if (modCmd) {
          if (modCmd.actionType === 'give_item' && modCmd.itemId) {
            const cnt = Math.max(1, Math.min(64, modCmd.itemCount || 1));
            const targetDef = getItemDef(modCmd.itemId);
            giveItemToInventory(modCmd.itemId, cnt);
            pushLocalSystemMsg(
              `[Mod /${modCmd.command}] ${cnt}× ${targetDef?.name || modCmd.itemId} envanterine verildi!`,
            );
          } else if (modCmd.actionType === 'gamemode') {
            const gm = modCmd.gameMode || 'creative';
            setGameMode(gm);
            pushLocalSystemMsg(
              `[Mod /${modCmd.command}] Oyun modu "${gm === 'creative' ? 'Yaratıcılık' : 'Hayatta Kalma'}" yapıldı.`,
            );
          } else if (modCmd.actionType === 'time') {
            const tv = Math.max(0, Math.min(24000, modCmd.timeValue ?? 4000));
            viewportRef.current?.setTimeOfDay(tv);
            setTimeOfDay(tv);
            if (activeWorld?.mode === 'server' && activeWorld.serverId) {
              updateServerTime(activeWorld.serverId, tv).catch(() => {});
            }
            pushLocalSystemMsg(`[Mod /${modCmd.command}] Dünya saati ${tv} olarak ayarlandı.`);
          } else if (modCmd.actionType === 'heal') {
            const amt = Math.max(1, Math.min(20, modCmd.healAmount || 20));
            setHealth((hp) => Math.min(20, hp + amt));
            setHunger((hg) => Math.min(20, hg + amt));
            pushLocalSystemMsg(`[Mod /${modCmd.command}] Can ve açlık yenilendi (+${amt}).`);
          } else if (modCmd.actionType === 'teleport_up') {
            const dy = modCmd.teleportY || 25;
            viewportRef.current?.teleport(position.x, position.y + dy, position.z);
            pushLocalSystemMsg(`[Mod /${modCmd.command}] ${dy} blok yukarı ışınlandın!`);
          } else if (modCmd.actionType === 'broadcast') {
            const txt = modCmd.messageText || modCmd.description || 'Mod komutu çalıştı!';
            if (activeWorld?.mode === 'server' && activeWorld.serverId && user) {
              await sendServerMessage(
                activeWorld.serverId,
                user.uid,
                playerDisplayName,
                txt,
                'system',
              );
            } else {
              pushLocalSystemMsg(`[Mod /${modCmd.command}] ${txt}`);
            }
          } else if (modCmd.actionType === 'cottonlua') {
            const ran = triggerCottonLuaCommand(modCmd.command, parts.slice(1));
            if (!ran) {
              pushLocalSystemMsg(`[CottonLua] /${modCmd.command} çalıştırılamadı (dünya hazır değil).`);
            }
          }
        } else {
          pushLocalSystemMsg(`Bilinmeyen komut: /${cmd}. Yardım için /yardim yaz.`);
        }
      }
      return;
    }

    // Standard Chat Message
    if (activeWorld?.mode === 'server' && activeWorld.serverId && user) {
      await sendServerMessage(
        activeWorld.serverId,
        user.uid,
        playerDisplayName,
        raw,
        'chat',
      );
    } else {
      setMessages((prev) => [
        ...prev,
        {
          id: `chat_${Date.now()}`,
          senderId: user?.uid || 'local',
          senderName: username || user?.displayName || 'Sen',
          text: raw,
          kind: 'chat',
          createdAt: Date.now(),
        },
      ]);
      voxelAudio.playChat();
    }
  };

  const handleToggleMod = (modId: string) => {
    setEnabledModIds((prev) => {
      const next = prev.includes(modId) ? prev.filter((id) => id !== modId) : [...prev, modId];
      if (user) {
        saveUserInstalledMods(user.uid, next).catch(() => {});
      }
      return next;
    });
  };

  const handleApplySkin = (skin: SkinData) => {
    setActiveSkin(skin);
    if (user) {
      saveUserActiveSkin(user.uid, skin.id).catch(() => {});
    }
  };

  const handleExitToTitle = async () => {
    await saveCurrentWorldProgress();
    await flushAchievementSave();
    if (activeWorld?.mode === 'server' && activeWorld.serverId && user) {
      await removePlayerPresence(activeWorld.serverId, user.uid);
    }
    setActiveWorld(null);
    setInventoryTab(null);
    setIsChatOpen(false);
  };

  const allKnownAchievements = useMemo(
    () => getAllAchievements(),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [modRegistryVersion],
  );

  const unlockedAchievementCount = useMemo(
    () => allKnownAchievements.filter((a) => Boolean(achievementState.unlocked[a.id])).length,
    [allKnownAchievements, achievementState.unlocked],
  );

  return (
    <div className="w-screen h-screen overflow-hidden bg-slate-950 relative">
      {!activeWorld ? (
        <TitleScreen
          user={user}
          username={username}
          friendCount={friends.length}
          pendingFriendRequestCount={incomingFriendRequests.length}
          activeSkin={activeSkin}
          enabledModCount={enabledModIds.length}
          achievementUnlockedCount={unlockedAchievementCount}
          achievementTotalCount={allKnownAchievements.length}
          textureVersion={textureVersion}
          onStartWorld={handleStartWorld}
          onOpenMultiplayer={() => setShowMultiplayer(true)}
          onOpenFriends={() => setShowFriends(true)}
          onOpenUsernameSetup={() => setShowUsernameModal(true)}
          onOpenSkinDesigner={() => setShowSkinDesigner(true)}
          onOpenModWorkshop={() => setShowModWorkshop(true)}
          onOpenTexturePacks={() => setShowTexturePacks(true)}
          onOpenAchievements={() => setShowAchievements(true)}
        />
      ) : (
        <>
          <VoxelViewport
            ref={viewportRef}
            seed={activeWorld.seed}
            worldType={activeWorld.worldType}
            gameMode={gameMode}
            skin={activeSkin}
            heldItemId={heldItemId}
            initialPosition={initialSpawnPos}
            initialTimeOfDay={activeWorld.initialTimeOfDay}
            remotePlayers={remotePlayers}
            localUid={user?.uid}
            isModalOpen={isAnyModalOpen}
            onPointerLockChange={setPointerLocked}
            onBlockBreak={handleBlockBreak}
            onBlockPlace={handleBlockPlace}
            onScoopLiquid={handleScoopLiquid}
            onInteractBlock={(blk) => {
              setInventoryTab(blk === 'furnace' ? 'furnace' : 'craft');
            }}
            onEatFood={handleEatFood}
            onConsumeHeldItem={handleConsumeHeldItem}
            onMobDrops={handleMobDrops}
            onMobKilled={handleMobKilled}
            onMobBred={handleMobBred}
            onDamagePlayer={(dmg) => setHealth((hp) => Math.max(0, hp - dmg))}
            onHealPlayer={(amt) => {
              setHealth((hp) => Math.min(20, hp + amt));
              setHunger((hg) => Math.min(20, hg + amt));
            }}
            onGiveItem={giveItemToInventory}
            onSetGameMode={setGameMode}
            onSystemMessage={pushLocalSystemMsg}
            onCottonLuaAchievement={handleCottonLuaAchievement}
            onPositionUpdate={handlePositionUpdate}
            onTimeUpdate={setTimeOfDay}
            onWeatherChange={(active, mode, wetness) =>
              setWeatherState({ active, mode, wetness })
            }
            onTargetBlockChange={setTargetBlockName}
          />

          <GameHUD
            config={activeWorld}
            playerUsername={username}
            pendingFriendRequestCount={incomingFriendRequests.length}
            gameMode={gameMode}
            health={health}
            hunger={hunger}
            slots={slots}
            selectedSlot={selectedSlot}
            position={position}
            timeOfDay={timeOfDay}
            weather={weatherState}
            targetBlockName={targetBlockName}
            pointerLocked={pointerLocked}
            isModalOpen={isAnyModalOpen}
            isChatOpen={isChatOpen}
            muted={muted}
            messages={messages}
            remotePlayerCount={remotePlayers.length}
            achievementToast={achievementToastQueue[0] || null}
            achievementCount={{ unlocked: unlockedAchievementCount, total: allKnownAchievements.length }}
            onSelectSlot={setSelectedSlot}
            onToggleMute={() => {
              voxelAudio.muted = !muted;
              setMuted(!muted);
            }}
            onCycleWeather={() => {
              const order: WeatherMode[] = ['auto', 'rain', 'snow', 'clear'];
              const idx = order.indexOf(weatherState.mode);
              const nextMode = order[(idx + 1) % order.length];
              viewportRef.current?.setWeather(nextMode);
              setWeatherState((prev) => ({
                ...prev,
                mode: nextMode,
                active: nextMode === 'auto' ? prev.active : nextMode,
              }));
              const label =
                nextMode === 'rain'
                  ? 'Yağmur'
                  : nextMode === 'snow'
                    ? 'Kar'
                    : nextMode === 'clear'
                      ? 'Açık'
                      : 'Otomatik';
              pushLocalSystemMsg(`Hava durumu: ${label}`);
            }}
            onOpenInventory={() => {
              viewportRef.current?.unlockPointer();
              setInventoryTab(gameMode === 'creative' ? 'creative' : 'craft');
            }}
            onOpenSkin={() => {
              viewportRef.current?.unlockPointer();
              setShowSkinDesigner(true);
            }}
            onOpenMods={() => {
              viewportRef.current?.unlockPointer();
              setShowModWorkshop(true);
            }}
            onOpenTexturePacks={() => {
              viewportRef.current?.unlockPointer();
              setShowTexturePacks(true);
            }}
            onOpenAchievements={() => {
              viewportRef.current?.unlockPointer();
              setShowAchievements(true);
            }}
            onOpenFriends={() => {
              viewportRef.current?.unlockPointer();
              setShowFriends(true);
            }}
            onToggleChat={(open) => {
              setIsChatOpen(open);
              if (open) viewportRef.current?.unlockPointer();
              else viewportRef.current?.requestLock();
            }}
            onSendMessageOrCommand={handleSendMessageOrCommand}
            onResumePlay={() => viewportRef.current?.requestLock()}
            onExitToTitle={handleExitToTitle}
          />

          {/* Survival Death / Respawn Modal */}
          {gameMode === 'survival' && health <= 0 && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-rose-950/75 p-4">
              <div className="p-8 rounded-2xl bg-slate-900 border border-rose-500/50 text-center space-y-4 max-w-sm w-full">
                <h2 className="font-display text-2xl font-bold text-rose-400">Canın Tükendi!</h2>
                <p className="text-sm text-slate-300">
                  Başlangıç noktasına dönerek macerana devam edebilirsin.
                </p>
                <button
                  onClick={() => {
                    setHealth(20);
                    setHunger(20);
                    viewportRef.current?.respawnToSurface();
                    viewportRef.current?.requestLock();
                  }}
                  className="w-full py-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-sm font-semibold text-white cursor-pointer"
                >
                  Yeniden Doğ
                </button>
              </div>
            </div>
          )}
        </>
      )}

      {/* Shared Modals */}
      {showMultiplayer && (
        <MultiplayerModal
          user={user}
          username={username}
          friends={friends}
          localMods={localMods}
          enabledModIds={enabledModIds}
          onOpenUsernameSetup={() => setShowUsernameModal(true)}
          onOpenFriends={() => {
            setShowMultiplayer(false);
            setShowFriends(true);
          }}
          onClose={() => setShowMultiplayer(false)}
          onLaunchWorld={handleStartWorld}
        />
      )}

      {showFriends && (
        <FriendsModal
          user={user}
          username={username}
          friends={friends}
          incomingRequests={incomingFriendRequests}
          outgoingRequests={outgoingFriendRequests}
          onOpenUsernameSetup={() => setShowUsernameModal(true)}
          onSignInGoogle={() => {
            signInWithGoogle().catch(() => {});
          }}
          onJoinServer={handleJoinFriendServer}
          onClose={() => {
            setShowFriends(false);
            if (activeWorld) viewportRef.current?.requestLock();
          }}
        />
      )}

      {user && (needsUsernameSetup || showUsernameModal) && (
        <UsernameSetupModal
          user={user}
          currentUsername={username}
          onUsernameClaimed={(claimed) => {
            setUsername(claimed);
            setShowUsernameModal(false);
          }}
          onClose={
            username
              ? () => {
                  setShowUsernameModal(false);
                }
              : undefined
          }
        />
      )}

      {showSkinDesigner && (
        <SkinDesignerModal
          user={user}
          activeSkin={activeSkin}
          savedSkins={savedSkins}
          onClose={() => setShowSkinDesigner(false)}
          onApplySkin={handleApplySkin}
          onSkinsUpdated={setSavedSkins}
        />
      )}

      {showModWorkshop && (
        <ModWorkshopModal
          user={user}
          username={username}
          localMods={localMods}
          enabledModIds={enabledModIds}
          onToggleMod={handleToggleMod}
          onSaveLocalMods={setLocalMods}
          onClose={() => setShowModWorkshop(false)}
        />
      )}

      {showTexturePacks && (
        <TexturePackModal
          customPacks={customTexturePacks}
          activePackId={activeTexturePackId}
          onSelectPack={(pack) => setActiveTexturePackId(pack.id)}
          onSaveCustomPacks={setCustomTexturePacks}
          onClose={() => setShowTexturePacks(false)}
        />
      )}

      {showAchievements && (
        <AchievementsModal
          user={user}
          username={username}
          progress={achievementState}
          currentGameMode={activeWorld ? gameMode : undefined}
          onSignInGoogle={() => {
            signInWithGoogle().catch(() => {});
          }}
          onClose={() => {
            setShowAchievements(false);
            if (activeWorld) viewportRef.current?.requestLock();
          }}
        />
      )}

      {inventoryTab !== null && (
        <InventoryCraftingModal
          gameMode={gameMode}
          slots={slots}
          initialTab={inventoryTab}
          onUpdateSlots={setSlots}
          onGiveItem={giveItemToInventory}
          onCraftSuccess={handleCraftSuccess}
          onClose={() => {
            setInventoryTab(null);
            viewportRef.current?.requestLock();
          }}
        />
      )}
    </div>
  );
}
