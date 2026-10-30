import React, { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import { GameEngine } from './game/Engine';
import type { PlayerState, FloatColor, ChatMessage, ContextActionId, RoomDefinition } from './game/types';
import { getRoomForToday } from './game/rooms';
import { HeaderBar } from './components/HeaderBar';
import { ActionBar } from './components/ActionBar';
import { ChatBar } from './components/ChatBar';
import { ChatLogDrawer } from './components/ChatLogDrawer';
import { GameBoyMobile } from './components/GameBoyMobile';
import { FloatModal } from './components/FloatModal';
import { NameModal } from './components/NameModal';
import { HelpModal } from './components/HelpModal';
import { DialogBox } from './components/DialogBox';
import { SceneBox } from './components/SceneBox';
import { GameMenu } from './components/gameMenu/GameMenu';
import { useGameMenu } from './components/gameMenu/useGameMenu';
import { StoryHud } from './components/StoryHud';
import { FishingHud } from './components/FishingHud';
import { FishBook } from './components/FishBook';
import { drawFishing, isFishing, fishingHold, fishingPress, startFishing, stopFishing, useFishingView } from './game/story/fishingSession';
import { CHECK_IN_NPCS, hasCheckedIn, markCheckedIn } from './game/content/arrivalDoor';
import { isStoryRoom, storyDialog, storyExitBlock, onStoryNode, onStoryRoomEnter, takeStoryTravel, takeStoryFishing, takeStoryPanel, canFishDirect, giveTo, type StoryPanel, type GiftTarget } from './game/story/dalbitPrologue';
import { TradePanel } from './components/TradePanel';
import type { ItemId } from './game/story/items';
import { dialogues } from './game/content/dialogues';
import type { DialogScript } from './game/content/dialogues';
import { LoadingScene } from './components/LoadingScene';
import { RoomTransition } from './components/roomTransition/RoomTransition';
import { pickStory, TRANSITION_STORIES, type TransitionStory } from './components/roomTransition/stories';
import { usePreparedStory } from './components/roomTransition/usePreparedStory';
import { createPresentation } from './components/roomTransition/presentation';
import { GameBoyShutDown } from './components/GameBoyShutDown';
import { music } from './game/audio/music';
import { sound } from './game/audio';
import { preloadBootIntro, showBootOnce } from './boot/bootSound';
import { getStartupPlan, recordActiveSession, type StartupPlan } from './boot/bootSession';
import { attachPlayer, getCloudAddress, recordPendingCatches } from './game/saves/cloud';
import { FISHING_GUIDES, guideScript, withRecordResult } from './game/saves/guideRecord';
import { getPendingCatches } from './game/fishing/freeFish';
import { CafeOrder, type CafeInput } from './components/cafe/CafeOrder';
import type { OrderLine } from './game/cafe/cafeMenu';
import { orderCancelled, orderReadBack } from './game/cafe/cafeBarista';
import { ShopCounter, type ShopInput } from './components/shop/ShopCounter';
import { WalletChip } from './components/shop/WalletChip';
import { ECONOMY_ON } from './game/economy/flags';
import { SHOP_NODE_OPENS, SHOP_NPCS, genScript, minatoScript, shopAfter, type ShopTab, type ShopVisit } from './game/economy/shopTalk';
import type { Vendor } from './game/economy/shopCatalog';
import { DpadAdapter } from './components/gameMenu/menuInput';

/** Context-action IDs that should route through engine.interact(). */
const INTERACT_ACTIONS: ReadonlySet<ContextActionId> = new Set<ContextActionId>(['talk', 'sit', 'stand', 'read', 'fish']);

interface AppProps {
  onOpenIdentity?: () => void;
  identityPaused?: boolean;
  /** ID-01 (c): the verified Player ID (lowercase wallet address) the game saves to; null = guest. */
  playerId?: string | null;
  /** Dev/test only: extra UI drawn on the game screen (e.g. the ?test=fishing chip). */
  devOverlay?: React.ReactNode;
  /** Dev/test only: runs once the engine has started. */
  onEngineReady?: (engine: GameEngine) => void;
}

export const App: React.FC<AppProps> = ({ devOverlay, onEngineReady, onOpenIdentity, identityPaused = false, playerId = null }) => {
  // Player ID saves: load this ID's Fish Book + story (or switch back to guest saves).
  useEffect(() => { void attachPlayer(playerId); }, [playerId]);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const engineRef = useRef<GameEngine | null>(null);

  // Room state stored in React state (runtime room travel)
  const [currentRoom, setCurrentRoom] = useState<RoomDefinition>(() => getRoomForToday());

  // Startup mode:
  // - Long absence (or first open ever): Game Boy is shut down ("PRESS START TO OPEN"),
  //   then BOOM boot animation; authored destinations then show their loading story.
  // - Reopening within 5 to 10 minutes: the destination LoadingScene shows immediately.
  const [startupPlan] = useState<StartupPlan>(() => getStartupPlan());
  const [startupStory] = useState(() => pickStory(TRANSITION_STORIES, currentRoom.roomId));
  const [startupSceneShowing, setStartupSceneShowing] = useState(startupPlan.flow !== 'shutdown');
  const startupPresentation = useRef<ReturnType<typeof createPresentation> | null>(null);
  const travelPresentation = useRef<ReturnType<typeof createPresentation> | null>(null);
  const startupPresented = useCallback(() => startupPresentation.current?.presented(), []);
  const travelPresented = useCallback(() => travelPresentation.current?.presented(), []);

  // =========================================================================
  // BOOT INTRO (src/boot): "SWIMMING POOL / by SAP Co." after Press START.
  // Dev harnesses (devOverlay) and ?autostart skip it; ?boot forces it again.
  // =========================================================================
  const [bootPlan] = useState(() => {
    const params = new URLSearchParams(window.location.search);
    const force = params.has('boot');
    const allowed = !devOverlay && !params.has('autostart');
    const willShow = allowed && (force || startupPlan.flow === 'shutdown');
    return { force, allowed, willShow };
  });
  const bootHostRef = useRef<HTMLDivElement | null>(null);
  const bootPlayingRef = useRef(false);
  const [bootPlaying, setBootPlaying] = useState(false);

  useEffect(() => {
    // Boot intro: room music must not start before the intro ends — not even from an early tap on the loading screen.
    if (bootPlan.willShow) music.holdForBoot(true);
    music.playForRoom(currentRoom.roomId);
    void music.tryAutoPlay();
  }, []);

  const [loading, setLoading] = useState(true);
  const [transitionRoom, setTransitionRoom] = useState<RoomDefinition | null>(null);
  const [transitionVisible, setTransitionVisible] = useState(false);
  const [transitionReady, setTransitionReady] = useState(false);
  const [transitionStory, setTransitionStory] = useState<TransitionStory | null>(null);
  const lastShownStory = useRef<Record<string, string>>(startupStory ? { [startupStory.roomId]: startupStory.id } : {});
  const preparedStory = usePreparedStory(loading || !!transitionRoom, lastShownStory);
  useEffect(() => {
    if (!transitionRoom) { setTransitionVisible(false); return; }
    // Includes the existing 300ms fade; fast loads never flash a loading screen.
    const timer = window.setTimeout(() => setTransitionVisible(true), 420);
    return () => window.clearTimeout(timer);
  }, [transitionRoom]);
  const [loadProgress, setLoadProgress] = useState(0);
  // Authored stories enter automatically after assets + their viewing minimum; legacy screens wait for a tap.
  const [assetsReady, setAssetsReady] = useState(false);
  const [loadingLeaving, setLoadingLeaving] = useState(false);
  const enterGameRef = useRef<(() => void) | null>(null);
  const [playerState, setPlayerState] = useState<PlayerState>('land');
  const [currentAction, setCurrentAction] = useState<string>('idle');
  const [playerName, setPlayerName] = useState<string>(() => {
    return localStorage.getItem('pixel_pool_player_name') || 'Sailor' + Math.floor(Math.random() * 900 + 100);
  });
  const [floatColor, setFloatColor] = useState<FloatColor>(() => {
    return (localStorage.getItem('pixel_pool_float_color') as FloatColor) || 'red';
  });

  const [playerCount, setPlayerCount] = useState(1);
  const [playerCountByRoom, setPlayerCountByRoom] = useState<Record<string, number>>({});
  const [localPlayerId, setLocalPlayerId] = useState<string>('');
  const [chatLog, setChatLog] = useState<ChatMessage[]>([]);
  const [chatLogOpen, setChatLogOpen] = useState(false);

  // Mobile layout state
  const [isMobile, setIsMobile] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    return window.innerWidth < 768;
  });
  const [forceHandheld, setForceHandheld] = useState<boolean | null>(null);

  const effectiveIsMobile = forceHandheld !== null ? forceHandheld : isMobile;

  // Modals
  const [floatModalOpen, setFloatModalOpen] = useState(false);
  const [nameModalOpen, setNameModalOpen] = useState(false);
  const [helpModalOpen, setHelpModalOpen] = useState(false);

  // =========================================================================
  // SCENE BOX STATE
  // =========================================================================
  const [sceneBoxOpen, setSceneBoxOpen] = useState(false);
  const [sceneBoxDpadNudge, setSceneBoxDpadNudge] = useState<{ dx: number; dy: number; timestamp: number } | null>(null);
  const [sceneBoxConfirmTrigger, setSceneBoxConfirmTrigger] = useState<number>(0);

  // =========================================================================
  // IN-SCREEN MENU: START field menu → Bag → item actions (+ Emotes, Options).
  // One state machine, ONE keyboard handler and ONE D-pad adapter live in components/gameMenu/.
  // App only forwards buttons to it and reacts when it opens, closes or hands control over.
  // =========================================================================
  const menu = useGameMenu({
    openFishBook: () => setFishBookOpen(true),
    openNameEditor: () => setNameModalOpen(true),
    openHelp: () => setHelpModalOpen(true),
    triggerEmote: (action) => handleTriggerEmote(action),
    toggleWaterLand: () => engineRef.current?.toggleWaterLand(),
    openChanged: (open) => {
      if (!open) return;
      // Never two overlays at once: opening the menu closes the SELECT postcard box.
      setSceneBoxOpen(false);
      setSceneBoxConfirmTrigger(0);
      setSceneBoxDpadNudge(null);
    },
  }, playerState, isStoryRoom(currentRoom.roomId));

  // Synchronize menuFrozen with engine: local player stops walking, but the world does NOT pause.
  useEffect(() => {
    engineRef.current?.setPause(identityPaused ? 'identity' : loading || menu.isOpen || sceneBoxOpen || bootPlaying ? 'input' : 'none');
  }, [identityPaused, loading, menu.isOpen, sceneBoxOpen, bootPlaying]);

  // =========================================================================
  // DIALOG STATE
  // =========================================================================
  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogNpcId, setDialogNpcId] = useState<string | null>(null);
  const [dialogScript, setDialogScript] = useState<DialogScript | null>(null);
  const [dialogConfirmTrigger, setDialogConfirmTrigger] = useState<number>(0);
  const [dialogDpadNudge, setDialogDpadNudge] = useState<{ dx: number; dy: number; timestamp: number } | null>(null);
  const [dialogSessionId, setDialogSessionId] = useState<number>(0);
  // Fishing at the Dalbit river mouth — plays in the world (game/story/fishingSession.ts)
  const fishingOpen = useFishingView().active;
  // Story windows opened by a dialogue: a buyer's counter or "give something" (game/story/dalbitPrologue.ts)
  const [storyPanel, setStoryPanel] = useState<StoryPanel | null>(null);
  // Café order app: the barista's "Order a drink" opens it when her line closes (components/cafe/CafeOrder.tsx).
  const [cafeOrderOpen, setCafeOrderOpen] = useState(false);
  const cafeOrderPending = useRef(false);
  const cafeInputRef = useRef<((input: CafeInput) => void) | null>(null);
  const cafeDpad = useMemo(() => new DpadAdapter((dir) => cafeInputRef.current?.(dir as CafeInput)), []);
  // Fish shop counter (ECO-01): Gen's "Sell my fish" / "Buy supplies" and Minato's "See the menu" open it
  // when their line closes (components/shop/ShopCounter.tsx, game/economy/shopTalk.ts).
  const [shop, setShop] = useState<{ vendor: Vendor; tab: ShopTab } | null>(null);
  const shopPending = useRef<{ vendor: Vendor; tab: ShopTab } | null>(null);
  const shopInputRef = useRef<((input: ShopInput) => void) | null>(null);
  const shopDpad = useMemo(() => new DpadAdapter((dir) => shopInputRef.current?.(dir as ShopInput)), []);
  /** A counter screen (café order app or fish shop) owns the controls. */
  const counterOpen = cafeOrderOpen || shop !== null;

  /** Open a dialog with the given NPC without moving the player. */
  const openDialog = useCallback((npcId: string, scriptOverride?: DialogScript) => {
    const script = scriptOverride ?? dialogues[npcId];
    if (!script) return;
    const engine = engineRef.current;
    if (!engine) return;

    // Reset triggers on open; ensure other overlays are closed
    menu.close();
    setSceneBoxOpen(false);
    setDialogConfirmTrigger(0);
    setDialogDpadNudge(null);
    setDialogSessionId((s) => s + 1);

    // Freeze movement immediately so player stays put and faces NPC
    engine.setDialogFrozen(true, npcId);
    engine.faceNpcTowardPlayer(npcId);

    setDialogNpcId(npcId);
    setDialogScript(script);
    setDialogOpen(true);
  }, []);

  /** Close the current dialog and play post-dialog wai. */
  const closeDialog = useCallback(() => {
    const engine = engineRef.current;
    const npcId = dialogNpcId;

    setDialogOpen(false);
    setDialogNpcId(null);
    setDialogScript(null);
    setDialogConfirmTrigger(0);
    setDialogDpadNudge(null);

    if (engine) {
      if (npcId) {
        engine.clearNpcPose(npcId);
      }
      engine.setDialogFrozen(false, npcId ?? undefined);
      // A story choice asked to travel (e.g. the yard gate → river mouth)
      const travelTo = takeStoryTravel();
      if (travelTo) void engine.changeRoom(travelTo);
      // A story choice asked to start fishing (pier end → "Cast the line")
      if (takeStoryFishing()) void startFishing(engine);
      // A story choice asked to open a window (sell at Gu's scale, give Mother something)
      const panel = takeStoryPanel();
      if (panel) {
        engine.setDialogFrozen(true, npcId ?? undefined);
        setStoryPanel(panel);
      }
      // The barista said "Here's our menu" → open the order app (the player stays at the counter)
      if (cafeOrderPending.current) {
        cafeOrderPending.current = false;
        engine.setDialogFrozen(true, npcId ?? undefined);
        setCafeOrderOpen(true);
      }
      // Gen / Minato said their line → open the fish shop counter (the player stays at the counter)
      if (shopPending.current) {
        const open = shopPending.current;
        shopPending.current = null;
        engine.setDialogFrozen(true, npcId ?? undefined);
        setShop(open);
      }
    }
  }, [dialogNpcId]);

  /** The fish shop counter closed: the NPC says a line about what you did there. */
  const finishShop = useCallback((visit: ShopVisit) => {
    shopDpad.reset();
    setShop(null);
    openDialog(visit.vendor, shopAfter(visit));
  }, [shopDpad, openDialog]);

  /** The order app closed: the barista reads the order back ("Here you are!") or says "No rush". */
  const finishCafeOrder = useCallback((lines: OrderLine[] | null) => {
    cafeDpad.reset();
    setCafeOrderOpen(false);
    openDialog('barista', lines ? orderReadBack(lines) : orderCancelled());
  }, [cafeDpad, openDialog]);

  const closeStoryPanel = useCallback(() => {
    setStoryPanel(null);
    engineRef.current?.setDialogFrozen(false);
  }, []);

  /** Give window → the person's reaction as a dialogue. */
  const handleGive = useCallback((to: GiftTarget, what: ItemId | 'coins') => {
    setStoryPanel(null);
    openDialog(to, giveTo(to, what));
  }, [openDialog]);

  /** Handle line changes during dialog to update NPC pose. */
  const handleDialogLineChange = useCallback((_lineIndex: number, pose?: string) => {
    const engine = engineRef.current;
    if (!engine || !dialogNpcId) return;
    if (pose && pose !== 'idle') {
      engine.setNpcPose(dialogNpcId, pose);
    } else {
      engine.clearNpcPose(dialogNpcId);
    }
  }, [dialogNpcId]);

  // =========================================================================
  // TRAVEL / ROOM CHANGE
  // =========================================================================
  const handleTravel = useCallback(async (roomId: string) => {
    setSceneBoxOpen(false);
    setSceneBoxConfirmTrigger(0);
    setSceneBoxDpadNudge(null);
    const engine = engineRef.current;
    if (!engine) return;
    await engine.changeRoom(roomId);
  }, []);

  const handleToggleSceneBox = useCallback(() => {
    if (counterOpen || engineRef.current?.isRoomTransitioning()) return; // SELECT waits during travel
    const next = !sceneBoxOpen;
    // SELECT closes the START menu if it is open. Never two overlays at once.
    if (next) menu.close();
    setSceneBoxOpen(next);
    setSceneBoxConfirmTrigger(0);
    setSceneBoxDpadNudge(null);
  }, [sceneBoxOpen, menu, counterOpen]);

  const handleToggleStartMenu = useCallback(() => {
    // START powers on the Game Boy / enters the game when waiting on the start screen.
    if (engineRef.current?.isRoomTransitioning()) return;
    if (enterGameRef.current) {
      enterGameRef.current();
      return;
    }
    // START closes the whole menu system from anywhere, but never opens it over a dialogue,
    // a trade window or the loading screen.
    if (!menu.isOpen && (dialogOpen || storyPanel || loading || counterOpen)) return;
    menu.toggleStart();
  }, [menu, dialogOpen, storyPanel, loading, counterOpen]);

  // =========================================================================
  // ◯ BUTTON / E KEY / O KEY — unified interact handler
  // =========================================================================
  const closeFishing = useCallback(() => stopFishing(), []);

  const handleCircleAction = useCallback(() => {
    if (engineRef.current?.isRoomTransitioning()) return;
    if (enterGameRef.current) {
      enterGameRef.current();
      return;
    }
    // Menu open → ◯ confirms: opens a section, opens item actions, or runs an action
    if (menu.isOpen) {
      menu.press('confirm');
      return;
    }
    // Café order app → ◯ picks / confirms the focused row
    if (cafeOrderOpen) {
      cafeInputRef.current?.('confirm');
      return;
    }
    // Fish shop counter → ◯ picks / buys / sells the focused row
    if (shop) {
      shopInputRef.current?.('confirm');
      return;
    }
    // A story window is open → use its buttons (tap / click)
    if (storyPanel) return;
    // Fishing → ◯ casts / strikes / lifts the net
    if (fishingOpen) {
      fishingPress();
      return;
    }
    // If SceneBox is open → confirm travel on currently selected slot
    if (sceneBoxOpen) {
      setSceneBoxConfirmTrigger(Date.now());
      return;
    }

    // If dialog is open → advance / confirm it
    if (dialogOpen) {
      setDialogConfirmTrigger(Date.now());
      return;
    }

    const engine = engineRef.current;
    if (!engine) return;

    // Check context action
    const ctx = engine.getContextAction();
    if (INTERACT_ACTIONS.has(ctx.id)) {
      engine.interact();
    } else {
      // Fallback: toggleWaterLand
      engine.toggleWaterLand();
    }
  }, [menu, sceneBoxOpen, dialogOpen, fishingOpen, storyPanel, cafeOrderOpen, shop]);

  // =========================================================================
  // ✕ BUTTON — jump / splash, cancel SceneBox, or advances dialog
  // =========================================================================
  const handleCrossAction = useCallback(() => {
    if (engineRef.current?.isRoomTransitioning()) return;
    // Menu open → ✕ goes back exactly one level (item actions → Bag → field menu → game)
    if (menu.isOpen) {
      menu.press('back');
      return;
    }
    // Café order app → ✕ goes back one screen (menu → closes the app)
    if (cafeOrderOpen) {
      cafeInputRef.current?.('back');
      return;
    }
    // Fish shop counter → ✕ leaves the counter
    if (shop) {
      shopInputRef.current?.('back');
      return;
    }
    // A story window is open → ✕ closes it
    if (storyPanel) {
      closeStoryPanel();
      return;
    }
    // Fishing → ✕ stops
    if (fishingOpen) {
      closeFishing();
      return;
    }
    // If SceneBox is open → close it
    if (sceneBoxOpen) {
      setSceneBoxOpen(false);
      setSceneBoxConfirmTrigger(0);
      setSceneBoxDpadNudge(null);
      return;
    }

    const engine = engineRef.current;
    if (!engine) return;

    // If dialog is open → close it immediately (✕ = Bye)
    if (dialogOpen) {
      closeDialog();
      return;
    }

    if (engine.localPlayer.state === 'water') {
      engine.triggerEmote('happy');
    } else {
      engine.triggerEmote('jump');
    }
  }, [menu, sceneBoxOpen, dialogOpen, closeDialog, fishingOpen, closeFishing, storyPanel, closeStoryPanel, cafeOrderOpen, shop]);

  // =========================================================================
  // KEYBOARD: Tab for SceneBox, E and O for ◯, Escape for ✕
  // =========================================================================
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (loading || identityPaused || engineRef.current?.isRoomTransitioning()) return;
      if (bootPlayingRef.current) return; // the boot intro owns the keys (any key skips it)
      if ((e.target as HTMLElement).tagName === 'INPUT' || (e.target as HTMLElement).tagName === 'TEXTAREA') return;
      // While the in-screen menu is open it owns the keyboard (the only menu key handler).
      if (menu.handleKey(e)) return;
      // Fishing: E / O / Space = ◯ (holding lifts the net), Esc / X = stop
      if (fishingOpen) {
        const k = e.key.toLowerCase();
        if (k === 'e' || k === 'o' || k === ' ') {
          e.preventDefault();
          fishingHold(true);
          if (!e.repeat) fishingPress();
        } else if (k === 'escape' || k === 'x') {
          e.preventDefault();
          stopFishing();
        }
        return;
      }

      if (e.key === 'Escape') {
        if (dialogOpen) {
          e.preventDefault();
          closeDialog();
          return;
        }
        if (sceneBoxOpen) {
          e.preventDefault();
          setSceneBoxOpen(false);
          setSceneBoxConfirmTrigger(0);
          setSceneBoxDpadNudge(null);
          return;
        }
      }

      // BAG keyboard hotkey: KeyB ('B' toggles the bag)
      if ((e.code === 'KeyB' || e.key.toLowerCase() === 'b') && !dialogOpen) {
        e.preventDefault();
        menu.open('bag');
        return;
      }

      if (e.key === 'Tab') {
        e.preventDefault();
        if (!e.repeat) {
          handleToggleSceneBox();
        }
        return;
      }

      // START Menu keyboard hotkey: KeyM ('M' for Menu), KeyP, or `
      if (e.code === 'KeyM' || e.code === 'KeyP' || e.code === 'Backquote') {
        e.preventDefault();
        if (!e.repeat) {
          handleToggleStartMenu();
        }
        return;
      }

      const key = e.key.toLowerCase();
      if (key === 'e' || key === 'o') {
        e.preventDefault();
        if (e.repeat) return;
        // DialogBox handles its own keyboard navigation (E/O/Enter/Space)
        if (dialogOpen) return;
        handleCircleAction();
      }
    };
    const up = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase();
      if (k === 'e' || k === 'o' || k === ' ') fishingHold(false);
    };
    window.addEventListener('keydown', handler);
    window.addEventListener('keyup', up);
    return () => {
      window.removeEventListener('keydown', handler);
      window.removeEventListener('keyup', up);
    };
  }, [loading, identityPaused, handleCircleAction, handleToggleSceneBox, handleToggleStartMenu, dialogOpen, sceneBoxOpen, menu, closeDialog, fishingOpen]);

  // =========================================================================
  // ENGINE SETUP
  // =========================================================================

  useEffect(() => {
    const handleResize = () => {
      setIsMobile(window.innerWidth < 768);
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const setCanvasRefCb = useCallback((node: HTMLCanvasElement | null) => {
    canvasRef.current = node;
    if (node && engineRef.current && node !== engineRef.current.getCanvas()) {
      engineRef.current.setCanvas(node);
      engineRef.current.setTouchMoveEnabled(!effectiveIsMobile);
      engineRef.current.setCameraFollow(effectiveIsMobile);
    }
  }, [effectiveIsMobile]);

  useEffect(() => {
    if (engineRef.current) {
      engineRef.current.setTouchMoveEnabled(!effectiveIsMobile);
      engineRef.current.setCameraFollow(effectiveIsMobile);
    }
  }, [effectiveIsMobile]);

  useEffect(() => {
    if (!canvasRef.current) return;

    let cancelled = false;
    let startTimer: number | undefined;
    const startupGate = createPresentation(startupStory?.minimumMs ?? 0);
    startupPresentation.current = startupGate;

    const engine = new GameEngine(canvasRef.current, currentRoom, playerName, floatColor);
    engineRef.current = engine;
    engine.setPause(identityPaused ? 'identity' : 'input');
    setLocalPlayerId(engine.localPlayer.id);
    engine.setTouchMoveEnabled(!effectiveIsMobile);
    engine.setCameraFollow(effectiveIsMobile);
    engine.isAnimationActive = isFishing;
    engine.onDrawLayer = drawFishing; // fishing rod / line / float / reel bar

    engine.onChatMessageReceived = (msg) => {
      setChatLog((prev) => [...prev.slice(-100), msg]);
    };

    engine.onPlayerCountChange = (count) => {
      setPlayerCount(count);
      setPlayerCountByRoom(engine.getPlayerCountByRoom());
    };

    engine.onRoomTransition = (room) => {
      travelPresentation.current?.cancel();
      travelPresentation.current = null;
      if (cancelled) return;
      setTransitionReady(false);
      setTransitionRoom(room);
      const scene = room ? pickStory(TRANSITION_STORIES, room.roomId, lastShownStory.current[room.roomId]) : null;
      setTransitionStory(scene);
      if (scene) {
        lastShownStory.current[scene.roomId] = scene.id;
        const gate = createPresentation(scene.minimumMs ?? 5000);
        travelPresentation.current = gate;
        return gate.finished;
      }
    };
    engine.onRoomAssetsReady = () => { if (!cancelled) setTransitionReady(true); };
    engine.onRoomChanged = (newRoom) => {
      setCurrentRoom(newRoom);
      setPlayerCountByRoom(engine.getPlayerCountByRoom());
      music.playForRoom(newRoom.roomId);
    };

    // Walking into a map exit: the story may say "not yet" (e.g. before breakfast)
    engine.exitGuard = (targetRoom: string) => {
      const from = engine.getRoom().roomId;
      // Arrival Hall: Phu stops first-timers at the glass doors until they've checked in at the counter
      if (from === 'arrival_hall' && !hasCheckedIn() && dialogues.phu) {
        openDialog('phu', { ...dialogues.phu, start: 'block' });
        return false;
      }
      if (!isStoryRoom(from)) return true;
      const block = storyExitBlock(from, targetRoom);
      if (!block) return true;
      openDialog('exit', block);
      return false;
    };

    // onInteract: open dialog when NPC talk is triggered, or start fishing
    engine.onInteract = (targetId: string, actionId?: ContextActionId) => {
      // Direct fishing interaction
      if (actionId === 'fish' || targetId === 'pier_end') {
        if (engine.getRoom().freeFishing) {
          void startFishing(engine, 'free');
          return;
        }
        if (isStoryRoom(engine.getRoom().roomId) && canFishDirect()) {
          void startFishing(engine);
          return;
        }
      }
      // Story rooms (Dalbit): the story picks the dialogue for the current beat
      if (isStoryRoom(engine.getRoom().roomId)) {
        // The pier end: once fishing is unlocked, ◯ starts fishing straight away
        if (targetId === 'pier_end' && canFishDirect()) {
          void startFishing(engine);
          return;
        }
        const script = storyDialog(targetId, actionId);
        if (script) {
          openDialog(targetId, script);
          return;
        }
      }
      // Free Fishing rooms (fun with friends): the pier end starts fishing
      if (engine.getRoom().freeFishing && targetId === 'pier_end') {
        void startFishing(engine, 'free');
        return;
      }
      // Fishing Guides record this Player ID's pending catches (ID-01 c)
      if (actionId === 'talk' && FISHING_GUIDES.has(targetId) && dialogues[targetId]) {
        openDialog(targetId, guideScript(dialogues[targetId], getPendingCatches().length, getCloudAddress() !== null));
        return;
      }
      // Harbour Fish Shop (ECO-01): Gen / Minato talk about today's market and your cooler
      if (actionId === 'talk' && SHOP_NPCS.has(targetId)) {
        openDialog(targetId, targetId === 'gen' ? genScript() : minatoScript());
        return;
      }
      // Arrival Hall: talking to Fah or Tawan = checked in (Phu lets you out after that)
      if (actionId === 'talk' && CHECK_IN_NPCS.has(targetId)) markCheckedIn();
      if (actionId === 'talk' && targetId === 'phu' && dialogues.phu) {
        openDialog('phu', { ...dialogues.phu, start: hasCheckedIn() ? 'greet' : 'greet_new' });
        return;
      }
      if (actionId === 'talk' && dialogues[targetId]) {
        openDialog(targetId);
        return;
      }
      // Things you read that have their own script (e.g. the Arrival Hall board)
      if (actionId === 'read' && dialogues[targetId]) {
        openDialog(targetId);
      }
    };

    // Press START → (shut-down flow) boot intro with its own sound, or (quick reload) the start chime → room music.
    const runBoot = async (host: HTMLDivElement, leaveLoading: () => void) => {
      const willShow = bootPlan.willShow;
      if (willShow) {
        bootPlayingRef.current = true;
        setBootPlaying(true);
        music.holdForBoot(true);
        music.setBootSoundActive(true);
      }
      // The loading scene stays up until the intro's first frame covers it, then goes at once (no blank frame).
      let handedOver = false;
      const handOver = () => {
        if (handedOver || cancelled) return;
        handedOver = true;
        if (!startupStory) {
          setLoading(false);
          setLoadingLeaving(false);
        }
      };
      const watch = new MutationObserver(() => { if (host.querySelector('.boot')) { watch.disconnect(); handOver(); } });
      if (willShow) watch.observe(host, { childList: true });
      // Safety net: the intro is ~5 s. If anything ever hangs, skip it so the game always becomes playable.
      const watchdog = willShow ? window.setTimeout(() => window.dispatchEvent(new Event('boot:skip')), 12000) : undefined;
      let shown = false;
      try {
        const r = await showBootOnce(host, {
          ctx: sound.getContext(),   // the app's shared AudioContext, unlocked by this tap
          dest: null,                // no separate sound-effects volume node in the app: straight to the speakers
          sound: !sound.isMuted(),   // Options → Sound
          force: bootPlan.force || bootPlan.willShow,
        });
        shown = r.shown;
      } catch {
        // the picture failed: carry on into the game
      } finally {
        window.clearTimeout(watchdog);
        watch.disconnect();
        host.querySelectorAll('.boot').forEach((el) => el.remove());
      }
      if (cancelled) return;
      music.setBootSoundActive(false);
      if (!shown) void music.playStartChime(); // every later open: the normal chime
      music.startRoomMusic();                  // either way, then the room music fades in
      bootPlayingRef.current = false;
      setBootPlaying(false);
      if (!handedOver || startupStory) {
        handedOver = true;
        leaveLoading();
      }
    };

    const init = async () => {
      // Preload start chime early so it's ready when the player presses START
      music.preloadStartChime();
      // First open: also warm up the boot intro's two fonts and two sounds while the art downloads
      if (bootPlan.willShow) preloadBootIntro(bootPlan.force);
      setLoadProgress(12);
      // Gentle progress while the art downloads (loadAssets has no per-file callback yet).
      const creep = window.setInterval(() => setLoadProgress((p) => p + (92 - p) * 0.08), 140);
      try {
        await engine.loadAssets();
      } finally {
        window.clearInterval(creep);
      }
      if (cancelled) return; // Don't start a destroyed engine
      setLoadProgress(100);
      // The loading scene now waits for the player (tap / any button / key) — see the effect below.
      let entered = false;
      // The loading scene fades out (0.5 s) — the normal hand-over when there is no boot intro.
      const leaveLoading = () => {
        setLoadingLeaving(true);
        startTimer = window.setTimeout(() => {
          if (cancelled) return;
          setLoading(false);
          setLoadingLeaving(false);
        }, 500);
      };
      enterGameRef.current = () => {
        if (cancelled || entered) return;
        entered = true;
        enterGameRef.current = null;
        const startEngine = () => {
          engine.start();
          setPlayerCountByRoom(engine.getPlayerCountByRoom());
          onEngineReady?.(engine);
        };
        if (!startupStory) startEngine();
        const enterStory = async () => {
          if (startupStory) {
            setStartupSceneShowing(true);
            await startupGate.finished;
            if (cancelled) return;
            startEngine();
          }
          leaveLoading();
        };
        const host = bootHostRef.current;
        if (!bootPlan.allowed || !host || (startupStory && !bootPlan.willShow)) {
          music.holdForBoot(false);
          void music.playStartChime();
          void enterStory();
          return;
        }
        void runBoot(host, () => { void enterStory(); });
      };
      // Dev harnesses and ?autostart skip the wait.
      if (devOverlay || new URLSearchParams(window.location.search).has('autostart')) {
        startupGate.cancel();
        enterGameRef.current();
        return;
      }
      if (startupStory && startupPlan.flow !== 'shutdown') {
        await startupGate.finished;
        if (!cancelled) enterGameRef.current?.();
        return;
      }
      startTimer = window.setTimeout(() => {
        if (!cancelled) setAssetsReady(true);
      }, 300);
    };

    init();

    // Update HUD values only when they change. Room presence is not animation data.
    let syncTimer: number | undefined;
    let lastPresenceSync = 0;
    const syncUi = () => {
      if (cancelled || document.hidden) return;
      setPlayerState(engine.localPlayer.state);
      setCurrentAction(engine.localPlayer.currentAction);
      if (performance.now() - lastPresenceSync >= 1500) {
        lastPresenceSync = performance.now();
        const next = engine.getPlayerCountByRoom();
        setPlayerCountByRoom((prev) => {
          const keys = Object.keys(next);
          return keys.length === Object.keys(prev).length && keys.every((key) => next[key] === prev[key]) ? prev : next;
        });
      }
      syncTimer = window.setTimeout(syncUi, 100);
    };
    const visibilityChanged = () => {
      window.clearTimeout(syncTimer);
      if (document.hidden) fishingHold(false);
      else syncUi();
    };
    document.addEventListener('visibilitychange', visibilityChanged);
    syncUi();

    return () => {
      cancelled = true;
      startupGate.cancel();
      travelPresentation.current?.cancel();
      window.clearTimeout(syncTimer);
      window.clearTimeout(startTimer);
      document.removeEventListener('visibilitychange', visibilityChanged);
      stopFishing();
      engine.destroy();
      engineRef.current = null;
    };
  }, []);

  // While the loading scene waits, the first tap / button / key enters the game.
  // Captured on window so that press is swallowed (it must not also open a menu or jump).
  useEffect(() => {
    if (!loading || !assetsReady || identityPaused) return;
    let swallowUntil = 0;
    const block = (e: Event) => {
      e.stopPropagation();
      if (e.cancelable) e.preventDefault();
    };
    const enter = (e: Event) => {
      if (performance.now() < swallowUntil) return block(e);
      if (!enterGameRef.current) return;
      if (e instanceof KeyboardEvent) {
        if (e.repeat || e.metaKey || e.ctrlKey || e.altKey) return;
        const key = e.key.toLowerCase();
        const code = e.code;
        if (
          code !== 'Space' &&
          code !== 'KeyO' &&
          code !== 'Enter' &&
          code !== 'NumpadEnter' &&
          code !== 'KeyM' &&
          code !== 'KeyP' &&
          key !== ' ' &&
          key !== 'spacebar' &&
          key !== 'o' &&
          key !== 'enter' &&
          key !== 'return' &&
          key !== 'm' &&
          key !== 'p'
        ) {
          return;
        }
      }
      block(e);
      swallowUntil = performance.now() + 600;
      enterGameRef.current();
    };
    const swallow = (e: Event) => {
      if (performance.now() < swallowUntil) block(e);
    };
    const opts = { capture: true, passive: false } as AddEventListenerOptions;
    window.addEventListener('pointerdown', enter, opts);
    window.addEventListener('keydown', enter, opts);
    window.addEventListener('pointerup', swallow, opts);
    window.addEventListener('touchend', swallow, opts);
    window.addEventListener('click', swallow, opts);
    return () => {
      window.removeEventListener('pointerdown', enter, opts);
      window.removeEventListener('keydown', enter, opts);
      window.removeEventListener('pointerup', swallow, opts);
      window.removeEventListener('touchend', swallow, opts);
      window.removeEventListener('click', swallow, opts);
    };
  }, [loading, assetsReady, identityPaused]);

  const handleSelectFloatColor = (color: FloatColor) => {
    setFloatColor(color);
    localStorage.setItem('pixel_pool_float_color', color);
    engineRef.current?.setFloatColor(color);
  };

  // START → Options → Float ring asks for a new colour with this event (see optionRows.ts).
  useEffect(() => {
    const onFloatSet = (e: Event) => {
      const color = (e as CustomEvent<FloatColor>).detail;
      setFloatColor(color);
      localStorage.setItem('pixel_pool_float_color', color);
      engineRef.current?.setFloatColor(color);
    };
    window.addEventListener('float:set', onFloatSet);
    return () => window.removeEventListener('float:set', onFloatSet);
  }, []);

  const handleSaveName = (name: string) => {
    setPlayerName(name);
    localStorage.setItem('pixel_pool_player_name', name);
    engineRef.current?.setPlayerName(name);
  };

  const handleSendMessage = (text: string) => {
    engineRef.current?.sendChat(text);
  };

  const handleTriggerEmote = (action: string) => {
    engineRef.current?.triggerEmote(action);
  };

  // Chat log only shows messages for current room
  const visibleChatLog = useMemo(() => {
    return chatLog.filter((m) => (m.roomId || 'poolside') === currentRoom.roomId);
  }, [chatLog, currentRoom.roomId]);

  // =========================================================================
  // STORY MODE (Dalbit rooms): objective banner, coins / energy, bag
  // =========================================================================
  const storyActive = isStoryRoom(currentRoom.roomId);

  // Story beats that start when you arrive somewhere (e.g. reaching the river mouth)
  useEffect(() => {
    if (isStoryRoom(currentRoom.roomId)) onStoryRoomEnter(currentRoom.roomId);
  }, [currentRoom.roomId]);
  // Free Fishing room: the Fish Book (key B or the chip)
  const freeFishingRoom = !!currentRoom.freeFishing;
  const [fishBookOpen, setFishBookOpen] = useState(false);
  useEffect(() => {
    if (!freeFishingRoom) return;
    const handler = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || dialogOpen || fishingOpen) return;
      if (e.key === 'Escape') {
        setFishBookOpen(false);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [freeFishingRoom, dialogOpen, fishingOpen]);
  useEffect(() => {
    if (fishingOpen || !freeFishingRoom) setFishBookOpen(false);
  }, [fishingOpen, freeFishingRoom]);

  // Close the bag when fishing starts; stop fishing if we leave the story room
  useEffect(() => {
    if (fishingOpen) menu.close();
  }, [fishingOpen]);
  useEffect(() => {
    if (!storyActive && !freeFishingRoom && fishingOpen) closeFishing();
  }, [storyActive, freeFishingRoom, fishingOpen, closeFishing]);

  const fishingElement = (storyActive || freeFishingRoom) ? (
    <>
      <FishingHud compact={effectiveIsMobile} />
      {freeFishingRoom && !fishingOpen && (
        <FishBook open={fishBookOpen} onToggle={() => setFishBookOpen((o) => !o)} compact={effectiveIsMobile} />
      )}
      {devOverlay}
    </>
  ) : devOverlay ?? null;

  const storyHudElement = (storyActive && !dialogOpen && !menu.bagShown) ? (
    <>
      <StoryHud
        bagOpen={menu.bagShown}
        onToggleBag={() => menu.open('bag')}
        compact={effectiveIsMobile}
      />
      {storyPanel && (
        <TradePanel panel={storyPanel} compact={effectiveIsMobile} onClose={closeStoryPanel} onGive={handleGive} />
      )}
    </>
  ) : null;

  // Standalone fish book overlay when opened via START menu outside free-fishing rooms
  const standaloneFishBook = (!freeFishingRoom && fishBookOpen && !fishingOpen) ? (
    <FishBook open={fishBookOpen} onToggle={() => setFishBookOpen(false)} compact={effectiveIsMobile} />
  ) : null;

  // =========================================================================
  // OVERLAY ELEMENTS (DialogBox & SceneBox & StartMenu)
  // =========================================================================
  const dialogBoxElement = (dialogOpen && dialogScript && dialogNpcId) ? (
    <DialogBox
      key={dialogSessionId}
      npcId={dialogNpcId}
      script={dialogScript}
      onLineChange={handleDialogLineChange}
      onNodeEnter={(nodeId) => {
        if (storyActive) onStoryNode(dialogNpcId, nodeId);
        if (dialogNpcId === 'barista' && nodeId === 'order') cafeOrderPending.current = true;
        const shopTab = SHOP_NODE_OPENS[dialogNpcId]?.[nodeId];
        if (shopTab) shopPending.current = { vendor: dialogNpcId as Vendor, tab: shopTab };
        if (FISHING_GUIDES.has(dialogNpcId) && nodeId === 'record') {
          void recordPendingCatches().then((r) => setDialogScript((cur) => (cur ? withRecordResult(cur, r) : cur)));
        }
      }}
      onClose={closeDialog}
      directionNudge={dialogDpadNudge}
      confirmTrigger={dialogConfirmTrigger}
    />
  ) : null;

  const cafeOrderElement = cafeOrderOpen ? (
    <CafeOrder
      compact={effectiveIsMobile}
      inputRef={cafeInputRef}
      onPlace={(lines) => finishCafeOrder(lines)}
      onClose={() => finishCafeOrder(null)}
    />
  ) : null;

  const shopElement = shop ? (
    <ShopCounter
      key={`${shop.vendor}-${shop.tab}`}
      vendor={shop.vendor}
      tab={shop.tab}
      compact={effectiveIsMobile}
      inputRef={shopInputRef}
      onClose={finishShop}
    />
  ) : null;

  // Coins + cooler in the corner at Quiet Bay and the fish shop (money system on only: npm run dev, ?test=shop|free)
  const walletChipElement = (ECONOMY_ON && (currentRoom.roomId === 'lake_pier' || currentRoom.roomId === 'fish_shop')
    && !dialogOpen && !counterOpen && !menu.isOpen && !fishingOpen && !loading) ? (
    <WalletChip compact={effectiveIsMobile} />
  ) : null;

  const sceneBoxElement = sceneBoxOpen ? (
    <SceneBox
      isOpen={sceneBoxOpen}
      currentRoomId={currentRoom.roomId}
      playerCountByRoom={playerCountByRoom}
      onTravel={handleTravel}
      onClose={() => {
        setSceneBoxOpen(false);
        setSceneBoxConfirmTrigger(0);
        setSceneBoxDpadNudge(null);
      }}
      directionNudge={sceneBoxDpadNudge}
      confirmTrigger={sceneBoxConfirmTrigger}
    />
  ) : null;

  const gameMenuElement = (
    <GameMenu
      menu={menu}
      playerName={playerName}
      playerState={playerState}
      compact={effectiveIsMobile}
      isStoryRoom={storyActive}
      hasPlayerId={Boolean(playerId)}
    />
  );

  // Canvas blur class for world focus effect
  const canvasBlurClass = dialogOpen || counterOpen ? 'dialog-world-blur' : 'dialog-world-unblur';

  // Loading scene / shut-down screen lives INSIDE the game screen (Game Boy window / arcade screen).
  const isShutDownScreen = loading && !startupSceneShowing && !bootPlaying;
  const loadingElement = loading ? (
    !startupSceneShowing ? (
      <GameBoyShutDown
        onStart={() => enterGameRef.current?.()}
        isMobile={effectiveIsMobile}
      />
    ) : (
      <LoadingScene
        roomId={currentRoom.roomId}
        roomName={currentRoom.name}
        progress={loadProgress}
        ready={startupStory ? loadProgress === 100 : assetsReady}
        leaving={loadingLeaving}
        onEnter={() => enterGameRef.current?.()}
        isMobile={effectiveIsMobile}
        onEarlyTouch={() => { void music.tryAutoPlay(); }}
        onPresented={startupPresented}
        automatic={Boolean(startupStory)}
        story={startupStory ?? undefined}
      />
    )
  ) : transitionRoom && (transitionVisible || transitionStory) ? (
    <RoomTransition roomName={transitionRoom.name} story={preparedStory?.story.id === transitionStory?.id ? preparedStory : null} fallbackStory={transitionStory} ready={transitionReady} onPresented={travelPresented} />
  ) : null;

  // Track active gameplay session time (quick reload within 5-10 min vs long absence)
  useEffect(() => {
    recordActiveSession();
    const interval = window.setInterval(recordActiveSession, 15000);
    const onVisibility = () => {
      if (!document.hidden) recordActiveSession();
    };
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('beforeunload', recordActiveSession);
    window.addEventListener('pagehide', recordActiveSession);
    return () => {
      window.clearInterval(interval);
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('beforeunload', recordActiveSession);
      window.removeEventListener('pagehide', recordActiveSession);
    };
  }, []);

  // The boot intro's stage: covers the whole game screen (handheld window or arcade screen). Empty and click-through
  // except while the intro's .boot layer is inside it (a tap on that layer skips the intro).
  const bootHostElement = (
    <div ref={bootHostRef} className="absolute inset-0 pointer-events-none [&>.boot]:pointer-events-auto" style={{ zIndex: 60 }} />
  );
  // While the intro plays the game ignores the buttons (◯ / START also skip it: GameBoyMobile dispatches "boot:skip").
  const ignore = () => {};

  return (
    <div className="relative w-screen h-screen bg-slate-950 flex flex-col items-center justify-center overflow-hidden">
      {/* RENDER VIEW: Game Boy Handheld on Mobile vs Desktop Arcade Cabinet */}
      {effectiveIsMobile ? (
        <GameBoyMobile
          canvasRef={setCanvasRefCb}
          playerState={playerState}
          currentAction={currentAction}
          playerName={playerName}
          playerCount={playerCount}
          chatLog={bootPlaying ? [] : visibleChatLog}
          statusLabel={isShutDownScreen ? 'STANDBY' : currentRoom.name}
          hideStatusBadge={dialogOpen || counterOpen || menu.isOpen || isShutDownScreen}
          isPoweredOff={isShutDownScreen}
          status={isShutDownScreen ? 'standby' : loading || transitionRoom ? 'loading' : 'ready'}
          creditScene={fishingOpen ? 'fishing' : 'design'}
          dialogOpen={dialogOpen}
          onDirectionChange={(dx, dy) => {
            if (loading || engineRef.current?.isRoomTransitioning()) {
              // No controller input while travelling.
            } else if (bootPlayingRef.current) {
              // boot intro: no walking, no menus
            } else if (fishingOpen) {
              // no walking while the line is out
            } else if (menu.isOpen) {
              // Menu open: the D-pad drives the menu ONLY (one step per press, repeats while held).
              // The player stops walking; the world does NOT pause, NPCs and other players keep moving.
              menu.feedDpad(dx, dy);
            } else if (sceneBoxOpen) {
              if (Math.abs(dx) > 0.4 || Math.abs(dy) > 0.4) {
                setSceneBoxDpadNudge({ dx, dy, timestamp: Date.now() });
              }
            } else if (cafeOrderOpen) {
              // Order app: one step per press, repeats while held (same feel as the START menu)
              cafeDpad.feed(dx, dy);
            } else if (shop) {
              shopDpad.feed(dx, dy);
            } else if (dialogOpen) {
              if (Math.abs(dy) > 0.4) {
                setDialogDpadNudge({ dx, dy, timestamp: Date.now() });
              }
            } else {
              engineRef.current?.setVirtualDpad(dx, dy);
            }
          }}
          onToggleState={loading || bootPlaying || !!transitionRoom ? ignore : handleCircleAction}
          onCircleHold={loading || bootPlaying || !!transitionRoom ? ignore : fishingHold}
          onActionA={loading || bootPlaying || !!transitionRoom ? ignore : handleCrossAction}
          onTriggerEmote={loading || bootPlaying || !!transitionRoom ? ignore : (action) => { if (!identityPaused && !menu.isOpen && !sceneBoxOpen && !counterOpen) handleTriggerEmote(action); }}
          onSendMessage={handleSendMessage}
          onOpenNameModal={bootPlaying ? ignore : () => setNameModalOpen(true)}
          onToggleSceneBox={loading || bootPlaying || !!transitionRoom ? ignore : handleToggleSceneBox}
          onToggleStartMenu={(loading && startupSceneShowing) || bootPlaying || !!transitionRoom ? ignore : handleToggleStartMenu}
          startMenuOpen={menu.isOpen}
          playerInputBlocked={loading || sceneBoxOpen || dialogOpen || counterOpen || bootPlaying || !!transitionRoom}
          screenOverlay={
            <>
              {loadingElement ?? (
                <>
                  {storyHudElement}
                  {walletChipElement}
                  {fishingElement}
                  {standaloneFishBook}
                  {dialogBoxElement}
                  {cafeOrderElement}
                  {shopElement}
                  {sceneBoxElement}
                  {gameMenuElement}
                </>
              )}
              {bootHostElement}
            </>
          }
        />
      ) : (
        /* Main Game Screen with Retro Arcade Border */
        <div className="relative w-full h-full max-w-[1280px] max-h-[720px] flex items-center justify-center p-1 sm:p-3">
          <div className="relative w-full h-full flex items-center justify-center bg-slate-900 rounded-lg overflow-hidden border-4 border-slate-800 shadow-[0_0_50px_rgba(0,0,0,0.8)]">
            {/* Header UI — hidden while the in-screen menu is open or in shut down state */}
            {!menu.isOpen && !isShutDownScreen && !bootPlaying && (
              <HeaderBar
                roomName={currentRoom.name}
                playerCount={playerCount}
                playerName={playerName}
                floatColor={floatColor}
                onOpenFloatPicker={() => setFloatModalOpen(true)}
                onOpenNameModal={() => setNameModalOpen(true)}
                onOpenHelpModal={() => setHelpModalOpen(true)}
                onToggleChatLog={() => setChatLogOpen(!chatLogOpen)}
                chatLogOpen={chatLogOpen}
                onToggleMobileMode={() => setForceHandheld((prev) => (prev === true ? false : true))}
                isMobileMode={effectiveIsMobile}
              />
            )}

            {/* Canvas Viewport */}
            <canvas
              ref={setCanvasRefCb}
              width={1024}
              height={576}
              className={`w-full h-full object-contain cursor-crosshair ${canvasBlurClass}`}
              style={{
                imageRendering: 'pixelated'
              }}
            />

            {/* Story mode HUD (Dalbit rooms only) */}
            {storyHudElement}

            {walletChipElement}

            {/* Fishing panel (Dalbit river mouth) */}
            {fishingElement}
            {standaloneFishBook}

            {/* Desktop dialog overlay (above canvas, below scanlines) */}
            {dialogBoxElement && (
              <div className="absolute inset-0 z-[5]">
                {dialogBoxElement}
              </div>
            )}

            {/* Desktop café order app (a phone-sized panel over the café) */}
            {cafeOrderElement && (
              <div className="absolute inset-0 z-[30]">
                {cafeOrderElement}
              </div>
            )}

            {/* Desktop fish shop counter */}
            {shopElement && (
              <div className="absolute inset-0 z-[30]">
                {shopElement}
              </div>
            )}

            {/* Desktop SceneBox overlay */}
            {sceneBoxElement && (
              <div className="absolute inset-0 z-[6]">
                {sceneBoxElement}
              </div>
            )}

            {/* Desktop in-screen menu: START field menu, Emotes, Options, Bag */}
            {menu.isOpen && (
              <div className="absolute inset-0 z-[25]">
                {gameMenuElement}
              </div>
            )}

            {/* Action & Emotes Bar + Chat Bar — hidden while a dialogue or story window is open (they covered its text).
                The emote bar also hides while fishing: at Quiet Bay the float lands in the water right under it. */}
            {!dialogOpen && !storyPanel && !counterOpen && !menu.isOpen && !isShutDownScreen && !bootPlaying && (
              <>
                {!fishingOpen && (
                  <ActionBar
                    playerState={playerState}
                    currentAction={currentAction}
                    onTriggerEmote={action => { if (!identityPaused && !menu.isOpen && !sceneBoxOpen) handleTriggerEmote(action); }}
                    onToggleState={() => engineRef.current?.toggleWaterLand()}
                  />
                )}
                <ChatBar onSendMessage={handleSendMessage} />
              </>
            )}

            {/* Chat Log Drawer */}
            <ChatLogDrawer
              isOpen={chatLogOpen}
              onClose={() => setChatLogOpen(false)}
              messages={visibleChatLog}
              currentUserId={localPlayerId}
            />

            {/* Loading scene inside the arcade screen */}
            {loadingElement && <div className="absolute inset-0 z-[40]">{loadingElement}</div>}

            {/* Boot intro stage (first open), above everything on the arcade screen */}
            {bootHostElement}

            {/* CRT scanline effect subtle overlay (hidden during dialog) */}
            {!dialogBoxElement && (
              <div
                className="pointer-events-none absolute inset-0 z-10 opacity-[0.03]"
                style={{
                  backgroundImage: 'repeating-linear-gradient(0deg, #000, #000 1px, transparent 1px, transparent 2px)'
                }}
              />
            )}
          </div>
        </div>
      )}

      {/* Modals */}
      <FloatModal
        isOpen={floatModalOpen}
        onClose={() => setFloatModalOpen(false)}
        currentColor={floatColor}
        onSelectColor={handleSelectFloatColor}
      />

      <NameModal
        isOpen={nameModalOpen}
        onClose={() => setNameModalOpen(false)}
        currentName={playerName}
        onSaveName={handleSaveName}
        onOpenIdentity={onOpenIdentity}
      />

      <HelpModal
        isOpen={helpModalOpen}
        onClose={() => setHelpModalOpen(false)}
      />
    </div>
  );
};

export default App;
