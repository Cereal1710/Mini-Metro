import React, { useEffect, useRef, useState, useCallback } from 'react';
import { Header } from './components/Header';
import { BottomBar } from './components/BottomBar';
import { StationDetailModal } from './components/StationDetailModal';
import { WeeklyModal } from './components/WeeklyModal';
import { ShopModal } from './components/ShopModal';
import { GameOverModal } from './components/GameOverModal';
import { TutorialModal } from './components/TutorialModal';

import { CITY_MAPS, LINE_PALETTE } from './data/maps';
import { MetroEngine } from './simulation/metroEngine';
import { renderScene } from './canvas/renderer';
import { soundEngine } from './audio/soundEngine';
import { Station, MetroLine, GameMode, Train } from './types/game';
import { distance, Point, TrackRoutingStyle } from './utils/geometry';

interface DragState {
  isDragging: boolean;
  fromStationId: string | null;
  currentPos: Point | null;
  targetStationId: string | null;
  lineId: string | null;
}

export interface CanvasViewport {
  rect: { left: number; top: number; width: number; height: number };
  scale: number;
  offsetX: number;
  offsetY: number;
}

// Robust viewport transformation calculation from cached canvas dimensions
export function computeViewport(rect: { left: number; top: number; width: number; height: number }): CanvasViewport {
  const worldWidth = 1480;
  const worldHeight = 1050;
  const padding = 25;

  const availableW = Math.max(100, rect.width - padding * 2);
  const availableH = Math.max(100, rect.height - padding * 2);
  const scale = Math.min(availableW / worldWidth, availableH / worldHeight);

  const offsetX = (rect.width - worldWidth * scale) / 2;
  const offsetY = (rect.height - worldHeight * scale) / 2;

  return { rect, scale, offsetX, offsetY };
}

// Convert screen pixel coordinate directly to simulation world coordinate using cached viewport
function clientToWorld(vp: CanvasViewport, clientX: number, clientY: number): Point {
  const { rect, scale, offsetX, offsetY } = vp;
  return {
    x: (clientX - rect.left - offsetX) / scale,
    y: (clientY - rect.top - offsetY) / scale
  };
}

// Screen-space station picker: checks distance in SCREEN PIXELS (45px radius) using cached viewport
function findStationNearClient(
  engine: MetroEngine,
  vp: CanvasViewport,
  clientX: number,
  clientY: number,
  screenTolerance = 45
): Station | null {
  const { rect, scale, offsetX, offsetY } = vp;
  let closest: Station | null = null;
  let minScreenDist = screenTolerance;

  for (const station of engine.state.stations) {
    const stationScreenX = rect.left + offsetX + station.x * scale;
    const stationScreenY = rect.top + offsetY + station.y * scale;

    const screenDist = Math.hypot(clientX - stationScreenX, clientY - stationScreenY);
    if (screenDist <= minScreenDist) {
      minScreenDist = screenDist;
      closest = station;
    }
  }

  return closest;
}

export default function App() {
  // Game Settings & UI State
  const [lang, setLang] = useState<'vi' | 'en'>(() => {
    return (localStorage.getItem('mini_metro_lang') as 'vi' | 'en') || 'vi';
  });
  const [theme, setTheme] = useState<'dark' | 'light'>('dark');
  const [isMuted, setIsMuted] = useState<boolean>(() => {
    return localStorage.getItem('mini_metro_muted') === 'true';
  });
  const [currentCityId, setCurrentCityId] = useState<string>(() => {
    return localStorage.getItem('mini_metro_last_city') || 'hanoi';
  });
  const [selectedLineId, setSelectedLineId] = useState<string | null>(null);
  const [trackStyle, setTrackStyle] = useState<TrackRoutingStyle>(() => {
    const saved = localStorage.getItem('mini_metro_track_style');
    if (saved === 'octolinear' || saved === 'straight' || saved === 'curved') return saved;
    return 'curved';
  });

  const handleToggleTrackStyle = useCallback(() => {
    setTrackStyle(prev => {
      const next = prev === 'curved' ? 'octolinear' : prev === 'octolinear' ? 'straight' : 'curved';
      localStorage.setItem('mini_metro_track_style', next);
      return next;
    });
  }, []);

  // Active Modals
  const [inspectingStation, setInspectingStation] = useState<Station | null>(null);
  const [isWeeklyModalOpen, setIsWeeklyModalOpen] = useState(false);
  const [isShopModalOpen, setIsShopModalOpen] = useState(false);
  const [isTutorialOpen, setIsTutorialOpen] = useState(false);

  // Engine instance reference & canvas reference
  const engineRef = useRef<MetroEngine | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // Mouse interaction refs (stored in refs to avoid triggering React re-renders on mousemove!)
  const dragStateRef = useRef<DragState>({
    isDragging: false,
    fromStationId: null,
    currentPos: null,
    targetStationId: null,
    lineId: null
  });
  const hoveredStationRef = useRef<string | null>(null);
  const mouseDownRef = useRef<{ clientX: number; clientY: number; time: number; stationId: string | null } | null>(null);
  const lastStationClickRef = useRef<{ stationId: string; time: number } | null>(null);
  const singleClickTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Cached Canvas Viewport Reference (eliminates forced layout reflows in 60fps loop and mouse events)
  const viewportRef = useRef<CanvasViewport>({
    rect: { left: 0, top: 0, width: 1480, height: 1050 },
    scale: 1,
    offsetX: 0,
    offsetY: 0
  });

  // Track canvas size changes without per-frame getBoundingClientRect()
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const updateVp = () => {
      const rect = canvas.getBoundingClientRect();
      viewportRef.current = computeViewport(rect);
    };

    updateVp();

    const ro = new ResizeObserver(() => {
      updateVp();
    });
    ro.observe(canvas);

    window.addEventListener('resize', updateVp, { passive: true });
    window.addEventListener('scroll', updateVp, { passive: true });

    return () => {
      ro.disconnect();
      window.removeEventListener('resize', updateVp);
      window.removeEventListener('scroll', updateVp);
    };
  }, []);

  // UI state updated at low frequency (5Hz) to keep React blazing fast
  const [uiSnapshot, setUiSnapshot] = useState<{
    money: number;
    timeOfDayHours: number;
    currentDayIndex: number;
    weekNumber: number;
    gameSpeed: number;
    isRushHour: boolean;
    gameMode: GameMode;
    passengersDelivered: number;
    trainsCount: number;
    unassignedTrains: number;
    lines: MetroLine[];
    trains: Train[];
    inventory: MetroEngine['state']['inventory'];
    isGameOver: boolean;
    gameOverReason: string | null;
    stats: MetroEngine['state']['stats'];
  } | null>(null);

  // Initialize or Reset Engine (with automatic save restoration)
  const initEngine = useCallback((cityId: string, mode: GameMode = 'standard', forceNewGame = false) => {
    const config = CITY_MAPS.find(m => m.id === cityId) || CITY_MAPS[0];
    let engine: MetroEngine | null = null;

    if (!forceNewGame) {
      engine = MetroEngine.loadFromStorage(cityId, config);
    }

    if (!engine) {
      engine = new MetroEngine(config, mode);
    }

    engineRef.current = engine;
    dragStateRef.current = {
      isDragging: false,
      fromStationId: null,
      currentPos: null,
      targetStationId: null,
      lineId: null
    };
    setSelectedLineId(null);
    setInspectingStation(null);
    setIsWeeklyModalOpen(false);

    setUiSnapshot({
      money: engine.state.money,
      timeOfDayHours: engine.state.timeOfDayHours,
      currentDayIndex: engine.state.currentDayIndex,
      weekNumber: engine.state.weekNumber,
      gameSpeed: engine.state.gameSpeed,
      isRushHour: engine.state.isRushHour,
      gameMode: engine.state.gameMode,
      passengersDelivered: engine.state.stats.totalPassengersDelivered,
      trainsCount: engine.state.trains.length,
      unassignedTrains: engine.state.inventory.unassignedTrains,
      lines: [...engine.state.lines],
      trains: [...engine.state.trains],
      inventory: { ...engine.state.inventory },
      isGameOver: engine.state.isGameOver,
      gameOverReason: engine.state.gameOverReason,
      stats: { ...engine.state.stats }
    });
  }, []);

  // Initialize on mount
  useEffect(() => {
    initEngine(currentCityId);
  }, [currentCityId, initEngine]);

  // Periodic Auto-save & Window close save
  useEffect(() => {
    const interval = setInterval(() => {
      if (engineRef.current && !engineRef.current.state.isGameOver) {
        MetroEngine.saveToStorage(engineRef.current);
      }
    }, 2500);

    const handleBeforeUnload = () => {
      if (engineRef.current && !engineRef.current.state.isGameOver) {
        MetroEngine.saveToStorage(engineRef.current);
      }
    };

    const handleVisibilityChange = () => {
      if (document.hidden && engineRef.current && !engineRef.current.state.isGameOver) {
        MetroEngine.saveToStorage(engineRef.current);
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      clearInterval(interval);
      window.removeEventListener('beforeunload', handleBeforeUnload);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, []);

  // Sync mute setting
  useEffect(() => {
    soundEngine.setMuted(isMuted);
    localStorage.setItem('mini_metro_muted', isMuted ? 'true' : 'false');
  }, [isMuted]);

  // Sync language setting
  useEffect(() => {
    localStorage.setItem('mini_metro_lang', lang);
  }, [lang]);

  // Low-frequency UI sync interval (200ms) - decouples React re-renders from the 60fps canvas loop!
  useEffect(() => {
    const uiInterval = setInterval(() => {
      const engine = engineRef.current;
      if (!engine) return;

      setUiSnapshot({
        money: engine.state.money,
        timeOfDayHours: engine.state.timeOfDayHours,
        currentDayIndex: engine.state.currentDayIndex,
        weekNumber: engine.state.weekNumber,
        gameSpeed: engine.state.gameSpeed,
        isRushHour: engine.state.isRushHour,
        gameMode: engine.state.gameMode,
        passengersDelivered: engine.state.stats.totalPassengersDelivered,
        trainsCount: engine.state.trains.length,
        unassignedTrains: engine.state.inventory.unassignedTrains,
        lines: [...engine.state.lines],
        trains: [...engine.state.trains],
        inventory: { ...engine.state.inventory },
        isGameOver: engine.state.isGameOver,
        gameOverReason: engine.state.gameOverReason,
        stats: { ...engine.state.stats }
      });

      // Check weekly milestone trigger
      if (engine.state.pendingWeeklyReward && !isWeeklyModalOpen) {
        setIsWeeklyModalOpen(true);
      }
    }, 200);

    return () => clearInterval(uiInterval);
  }, [isWeeklyModalOpen]);

  // Reset Game Handler (Clear save and start fresh)
  const handleResetGame = useCallback(() => {
    const engine = engineRef.current;
    const cityName = lang === 'vi' ? engine?.mapConfig.nameVi : engine?.mapConfig.nameEn;
    const confirmMsg = lang === 'vi'
      ? `Bạn có chắc muốn bắt đầu lại thành phố ${cityName}? Tiến trình hiện tại sẽ được làm mới.`
      : `Are you sure you want to reset ${cityName}? Your current progress will start fresh.`;

    if (window.confirm(confirmMsg)) {
      MetroEngine.clearSave(currentCityId);
      initEngine(currentCityId, 'standard', true);
    }
  }, [currentCityId, initEngine, lang]);

  // Main High-Performance 60fps Simulation & Render Loop
  useEffect(() => {
    let animationFrameId: number;
    let lastTime = performance.now();

    const loop = (currentTime: number) => {
      const dt = Math.min(0.1, (currentTime - lastTime) / 1000);
      lastTime = currentTime;

      const engine = engineRef.current;
      const canvas = canvasRef.current;

      if (engine && canvas) {
        // Run simulation update step
        engine.update(dt);

        const ctx = canvas.getContext('2d');
        if (ctx) {
          const dpr = window.devicePixelRatio || 1;
          const vp = viewportRef.current;

          // Auto-adjust canvas internal pixel buffer to match display
          const targetW = Math.round(vp.rect.width * dpr);
          const targetH = Math.round(vp.rect.height * dpr);
          if (targetW > 0 && targetH > 0 && (canvas.width !== targetW || canvas.height !== targetH)) {
            canvas.width = targetW;
            canvas.height = targetH;
          }

          // Clear full canvas buffer cleanly
          ctx.setTransform(1, 0, 0, 1, 0, 0);
          ctx.clearRect(0, 0, canvas.width, canvas.height);

          // Apply DPI + Centering Transform
          ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
          ctx.translate(vp.offsetX, vp.offsetY);
          ctx.scale(vp.scale, vp.scale);

          // Render game scene
          renderScene(
            ctx,
            1480,
            1050,
            engine.mapConfig.riverPolygons,
            engine.state.stations,
            engine.state.lines,
            engine.state.trains,
            engine.state.floatingTexts,
            {
              theme,
              selectedLineId,
              selectedStationId: inspectingStation?.id || null,
              dragState: dragStateRef.current.isDragging ? dragStateRef.current : null,
              hoveredStationId: dragStateRef.current.targetStationId || hoveredStationRef.current,
              showStationNames: true,
              trackStyle
            }
          );
        }
      }

      animationFrameId = requestAnimationFrame(loop);
    };

    animationFrameId = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(animationFrameId);
  }, [theme, selectedLineId, inspectingStation, trackStyle]);

  // Handle pointer down (both mouse and touch)
  const onPointerDown = (clientX: number, clientY: number) => {
    const canvas = canvasRef.current;
    const engine = engineRef.current;
    if (!canvas || !engine) return;

    const vp = viewportRef.current;
    const clickedStation = findStationNearClient(engine, vp, clientX, clientY, 45);

    mouseDownRef.current = {
      clientX,
      clientY,
      time: performance.now(),
      stationId: clickedStation ? clickedStation.id : null
    };

    if (clickedStation) {
      const worldPos = clientToWorld(vp, clientX, clientY);
      dragStateRef.current = {
        isDragging: true,
        fromStationId: clickedStation.id,
        currentPos: worldPos,
        targetStationId: null,
        lineId: selectedLineId
      };
    }
  };

  // Handle pointer move (both mouse and touch)
  const onPointerMove = (clientX: number, clientY: number) => {
    const canvas = canvasRef.current;
    const engine = engineRef.current;
    if (!canvas || !engine) return;

    const vp = viewportRef.current;
    const stationHover = findStationNearClient(engine, vp, clientX, clientY, 45);
    hoveredStationRef.current = stationHover ? stationHover.id : null;

    if (dragStateRef.current.isDragging) {
      const fromId = dragStateRef.current.fromStationId;
      const target = stationHover && stationHover.id !== fromId ? stationHover.id : null;
      dragStateRef.current.currentPos = clientToWorld(vp, clientX, clientY);
      dragStateRef.current.targetStationId = target;
    }
  };

  // Handle pointer up (both mouse and touch)
  const onPointerUp = (clientX: number, clientY: number) => {
    const downInfo = mouseDownRef.current;
    mouseDownRef.current = null;

    const canvas = canvasRef.current;
    const engine = engineRef.current;
    if (!canvas || !engine) return;

    const moveDist = downInfo ? Math.hypot(clientX - downInfo.clientX, clientY - downInfo.clientY) : 0;

    // CASE 1: Pure Click (moved < 14 screen pixels)
    // -> Double click (press 2 times) on station removes/cancels that station from the line!
    // -> Single click inspects/selects station
    // -> NEVER creates a line when just clicking stations!
    if (moveDist < 14) {
      if (downInfo?.stationId) {
        const stationId = downInfo.stationId;
        const now = Date.now();
        const prev = lastStationClickRef.current;

        // Check if this is a double-click / double-tap (within 380ms on the same station)
        if (prev && prev.stationId === stationId && now - prev.time < 380) {
          // Double-click detected! Cancel pending single-click inspect modal
          if (singleClickTimerRef.current) {
            clearTimeout(singleClickTimerRef.current);
            singleClickTimerRef.current = null;
          }
          lastStationClickRef.current = null;

          // Close modal if open
          setInspectingStation(null);

          // Cancel / remove station from route!
          const result = engine.cancelStationFromRoute(stationId, selectedLineId);
          if (result.success) {
            setUiSnapshot(prevSnapshot =>
              prevSnapshot
                ? {
                    ...prevSnapshot,
                    lines: [...engine.state.lines],
                    trains: [...engine.state.trains],
                    inventory: { ...engine.state.inventory }
                  }
                : null
            );
          }
        } else {
          // First click on this station: record and schedule single-click inspect modal
          lastStationClickRef.current = { stationId, time: now };
          if (singleClickTimerRef.current) {
            clearTimeout(singleClickTimerRef.current);
          }
          singleClickTimerRef.current = setTimeout(() => {
            lastStationClickRef.current = null;
            const st = engine.state.stations.find(s => s.id === stationId);
            if (st) {
              setInspectingStation(prevModal => (prevModal?.id === st.id ? null : { ...st }));
            }
          }, 240);
        }
      } else {
        // User clicked empty canvas map -> deselect station and line!
        if (singleClickTimerRef.current) {
          clearTimeout(singleClickTimerRef.current);
          singleClickTimerRef.current = null;
        }
        lastStationClickRef.current = null;
        setInspectingStation(null);
        setSelectedLineId(null);
      }
    }
    // CASE 2: Dragged to connect route (strictly ONLY when dragged >= 14 screen pixels from Station A to Station B)
    else if (dragStateRef.current.isDragging && dragStateRef.current.fromStationId && moveDist >= 14) {
      const fromId = dragStateRef.current.fromStationId;
      const targetStation = dragStateRef.current.targetStationId
        ? engine.state.stations.find(s => s.id === dragStateRef.current.targetStationId)
        : findStationNearClient(engine, viewportRef.current, clientX, clientY, 45);

      if (targetStation && targetStation.id !== fromId) {
        engine.connectStations(
          fromId,
          targetStation.id,
          dragStateRef.current.lineId || selectedLineId
        );
        // Do NOT automatically select the line: keeps user in control of line selection via bottom dock
      }
    }

    // Reset drag state
    dragStateRef.current = {
      isDragging: false,
      fromStationId: null,
      currentPos: null,
      targetStationId: null,
      lineId: null
    };
  };

  // Mouse event wrappers
  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (e.button === 0) onPointerDown(e.clientX, e.clientY);
  };
  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    onPointerMove(e.clientX, e.clientY);
  };
  const handleMouseUp = (e: React.MouseEvent<HTMLCanvasElement>) => {
    onPointerUp(e.clientX, e.clientY);
  };
  const handleDoubleClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    const engine = engineRef.current;
    if (!canvas || !engine) return;

    const clickedStation = findStationNearClient(engine, viewportRef.current, e.clientX, e.clientY, 35);
    if (clickedStation) {
      if (singleClickTimerRef.current) {
        clearTimeout(singleClickTimerRef.current);
        singleClickTimerRef.current = null;
      }
      lastStationClickRef.current = null;
      setInspectingStation(null);

      const result = engine.cancelStationFromRoute(clickedStation.id, selectedLineId);
      if (result.success) {
        setUiSnapshot(prev =>
          prev
            ? {
                ...prev,
                lines: [...engine.state.lines],
                trains: [...engine.state.trains],
                inventory: { ...engine.state.inventory }
              }
            : null
        );
      }
    }
  };

  // Touch event wrappers (supports mobile / tablets / touch laptops)
  const handleTouchStart = (e: React.TouchEvent<HTMLCanvasElement>) => {
    if (e.touches.length > 0) {
      onPointerDown(e.touches[0].clientX, e.touches[0].clientY);
    }
  };
  const handleTouchMove = (e: React.TouchEvent<HTMLCanvasElement>) => {
    if (e.touches.length > 0) {
      onPointerMove(e.touches[0].clientX, e.touches[0].clientY);
    }
  };
  const handleTouchEnd = (e: React.TouchEvent<HTMLCanvasElement>) => {
    if (e.changedTouches.length > 0) {
      onPointerUp(e.changedTouches[0].clientX, e.changedTouches[0].clientY);
    }
  };

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const engine = engineRef.current;
      if (!engine) return;

      if (e.code === 'Space') {
        e.preventDefault();
        engine.setGameSpeed(engine.state.gameSpeed === 0 ? 1 : 0);
      } else if (e.key === '1') {
        engine.setGameSpeed(1);
      } else if (e.key === '2') {
        engine.setGameSpeed(2);
      } else if (e.key === '3') {
        engine.setGameSpeed(3);
      } else if (e.key === 'Escape') {
        // Cancel/deselect station, line and close any open dialogs
        setInspectingStation(null);
        setSelectedLineId(null);
        setIsWeeklyModalOpen(false);
        setIsShopModalOpen(false);
        setIsTutorialOpen(false);
        dragStateRef.current = {
          isDragging: false,
          fromStationId: null,
          currentPos: null,
          targetStationId: null,
          lineId: null
        };
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const engine = engineRef.current;
  const state = uiSnapshot || engine?.state;

  return (
    <div className={`w-screen h-screen flex flex-col overflow-hidden select-none ${
      theme === 'dark' ? 'bg-slate-950 text-slate-100' : 'bg-neutral-100 text-slate-900'
    }`}>
      {/* Top Header Bar */}
      {state && (
        <Header
          cityName={engine?.mapConfig.nameVi || 'Thành phố'}
          timeOfDayHours={state.timeOfDayHours}
          currentDayIndex={state.currentDayIndex}
          weekNumber={state.weekNumber}
          money={state.money}
          passengersDelivered={state.stats.totalPassengersDelivered}
          activeTrains={state.trains.length}
          totalTrains={state.trains.length + state.inventory.unassignedTrains}
          gameSpeed={state.gameSpeed}
          isRushHour={state.isRushHour}
          gameMode={state.gameMode}
          theme={theme}
          isMuted={isMuted}
          lang={lang}
          cityMaps={CITY_MAPS}
          currentCityId={currentCityId}
          highScore={MetroEngine.getHighScore(currentCityId)}
          isSaved={true}
          trackStyle={trackStyle}
          onSetSpeed={(speed) => engine?.setGameSpeed(speed)}
          onToggleTheme={() => setTheme(t => t === 'dark' ? 'light' : 'dark')}
          onToggleMute={() => setIsMuted(m => !m)}
          onToggleLang={() => setLang(l => l === 'vi' ? 'en' : 'vi')}
          onToggleGameMode={() => {
            if (engine) {
              const nextMode = engine.state.gameMode === 'standard' ? 'zen' : 'standard';
              engine.setGameMode(nextMode);
            }
          }}
          onToggleTrackStyle={handleToggleTrackStyle}
          onResetGame={handleResetGame}
          onOpenTutorial={() => setIsTutorialOpen(true)}
          onOpenShop={() => setIsShopModalOpen(true)}
          onSelectCity={(cId) => {
            if (engineRef.current) {
              MetroEngine.saveToStorage(engineRef.current);
            }
            setCurrentCityId(cId);
            initEngine(cId);
          }}
        />
      )}

      {/* Main Game Canvas Viewport */}
      <main className="flex-1 relative overflow-hidden cursor-crosshair">
        <canvas
          ref={canvasRef}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onDoubleClick={handleDoubleClick}
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
          className="w-full h-full block touch-none"
        />

        {/* Quick Selected Line Control Banner */}
        {selectedLineId && state && (() => {
          const activeLine = state.lines.find(l => l.id === selectedLineId);
          if (!activeLine) return null;
          const lineTrains = state.trains.filter(t => t.lineId === activeLine.id);
          const lineCarriages = lineTrains.reduce((sum, t) => sum + t.carriagesCount, 0);
          const maxLineCarriages = lineTrains.length * 2;

          return (
            <div className="absolute bottom-5 left-1/2 -translate-x-1/2 flex items-center gap-2.5 px-4 py-2 rounded-2xl bg-neutral-900/95 border border-neutral-700 shadow-2xl backdrop-blur-md z-30 text-white animate-in slide-in-from-bottom-2">
              <div className="flex items-center gap-2">
                <div
                  className="w-3.5 h-3.5 rounded-full shadow-xs"
                  style={{ backgroundColor: activeLine.color }}
                />
                <span className="font-bold text-xs">{activeLine.name}</span>
                <span className="text-[11px] opacity-70">({activeLine.stationIds.length} {lang === 'vi' ? 'ga' : 'stops'})</span>
              </div>

              <div className="h-4 w-px bg-neutral-700" />

              {/* Quick Stepper for selected line trains */}
              <div className="flex items-center gap-1.5 bg-neutral-800/90 px-2 py-1 rounded-xl border border-neutral-700 text-xs">
                <span className="text-[11px] opacity-80 mr-1">{lang === 'vi' ? 'Tàu:' : 'Trains:'}</span>

                <button
                  disabled={lineTrains.length === 0}
                  onClick={() => engine?.removeTrainFromLine(activeLine.id)}
                  title={lang === 'vi' ? 'Giảm 1 tàu khỏi tuyến (thu hồi về kho)' : 'Recall 1 train from line to depot'}
                  className={`px-2 py-1 rounded-lg font-bold text-xs transition flex items-center gap-1 active:scale-95 ${
                    lineTrains.length > 0
                      ? 'bg-amber-500/25 text-amber-300 hover:bg-amber-500 hover:text-black cursor-pointer shadow-xs'
                      : 'opacity-30 cursor-not-allowed text-neutral-500'
                  }`}
                >
                  <span>- {lang === 'vi' ? 'Giảm tàu' : 'Recall'}</span>
                </button>

                <span className="font-mono font-bold text-xs px-2 text-blue-400">
                  {lineTrains.length}
                </span>

                <button
                  disabled={state.inventory.unassignedTrains <= 0}
                  onClick={() => engine?.deployTrainToLine(activeLine.id)}
                  title={
                    state.inventory.unassignedTrains > 0
                      ? (lang === 'vi' ? `Thêm 1 tàu vào tuyến (Kho còn ${state.inventory.unassignedTrains})` : `Deploy 1 train (${state.inventory.unassignedTrains} in depot)`)
                      : (lang === 'vi' ? 'Kho tạm hết tàu dự phòng' : 'Depot empty')
                  }
                  className={`px-2 py-1 rounded-lg font-bold text-xs transition flex items-center gap-1 active:scale-95 ${
                    state.inventory.unassignedTrains > 0
                      ? 'bg-emerald-500/25 text-emerald-300 hover:bg-emerald-500 hover:text-black cursor-pointer shadow-xs'
                      : 'opacity-30 cursor-not-allowed text-neutral-500'
                  }`}
                >
                  <span>+ {lang === 'vi' ? 'Thêm tàu' : 'Deploy'}</span>
                </button>
              </div>

              {/* Quick Stepper for selected line carriages */}
              <div className="flex items-center gap-1.5 bg-neutral-800/90 px-2 py-1 rounded-xl border border-neutral-700 text-xs">
                <span className="text-[11px] opacity-80 mr-1">{lang === 'vi' ? 'Toa:' : 'Cars:'}</span>

                <button
                  disabled={lineCarriages === 0}
                  onClick={() => engine?.removeCarriageFromLine(activeLine.id)}
                  title={lang === 'vi' ? 'Bỏ 1 toa xe khỏi tàu (thu hồi về kho)' : 'Recall 1 carriage to depot'}
                  className={`px-2 py-1 rounded-lg font-bold text-xs transition flex items-center gap-1 active:scale-95 ${
                    lineCarriages > 0
                      ? 'bg-amber-500/25 text-amber-300 hover:bg-amber-500 hover:text-black cursor-pointer shadow-xs'
                      : 'opacity-30 cursor-not-allowed text-neutral-500'
                  }`}
                >
                  <span>- {lang === 'vi' ? 'Bỏ toa' : 'Detach'}</span>
                </button>

                <span className="font-mono font-bold text-xs px-2 text-indigo-400">
                  {lineCarriages}
                </span>

                <button
                  disabled={state.inventory.carriages <= 0 || lineTrains.length === 0 || lineCarriages >= maxLineCarriages}
                  onClick={() => engine?.addCarriageToLine(activeLine.id)}
                  title={
                    lineTrains.length === 0
                      ? (lang === 'vi' ? 'Cần có tàu chạy trên tuyến trước khi gắn toa' : 'Deploy a train first')
                      : lineCarriages >= maxLineCarriages
                      ? (lang === 'vi' ? 'Các tàu trên tuyến đã gắn tối đa toa (2 toa/tàu)' : 'Max carriages reached')
                      : state.inventory.carriages > 0
                      ? (lang === 'vi' ? `Gắn 1 toa vào tàu (Kho còn ${state.inventory.carriages} toa, tăng sức chứa +4)` : `Attach 1 carriage (${state.inventory.carriages} in depot)`)
                      : (lang === 'vi' ? 'Kho tạm hết toa xe dự phòng' : 'Depot empty')
                  }
                  className={`px-2 py-1 rounded-lg font-bold text-xs transition flex items-center gap-1 active:scale-95 ${
                    state.inventory.carriages > 0 && lineTrains.length > 0 && lineCarriages < maxLineCarriages
                      ? 'bg-indigo-500/25 text-indigo-300 hover:bg-indigo-500 hover:text-black cursor-pointer shadow-xs'
                      : 'opacity-30 cursor-not-allowed text-neutral-500'
                  }`}
                >
                  <span>+ {lang === 'vi' ? 'Gắn toa' : 'Attach'}</span>
                </button>
              </div>

              <div className="h-4 w-px bg-neutral-700" />
              <span className="text-[11px] text-amber-300/90 hidden md:inline">
                {lang === 'vi' ? '💡 Nhấp 2 lần vào ga để hủy khỏi tuyến' : '💡 Double-click station to remove'}
              </span>

              <button
                onClick={() => setSelectedLineId(null)}
                className="text-xs text-neutral-400 hover:text-white px-2 py-1 rounded-lg hover:bg-neutral-800 transition cursor-pointer font-bold"
                title={lang === 'vi' ? 'Bỏ chọn tuyến' : 'Deselect line'}
              >
                ✕ {lang === 'vi' ? 'Bỏ chọn' : 'Deselect'}
              </button>
            </div>
          );
        })()}

        {/* Onboarding Drag Guide Hint */}
        {state && state.lines.length === 0 && (
          <div className="absolute bottom-6 left-1/2 -translate-x-1/2 px-4 py-2.5 rounded-full bg-slate-900/95 text-white border border-slate-700 shadow-2xl text-xs font-semibold flex items-center gap-2 pointer-events-none animate-bounce">
            <span>✨</span>
            <span>
              {lang === 'vi'
                ? 'Kéo chuột từ ga này sang ga khác để nối tuyến metro! (Nhấp 2 lần vào ga để hủy ga nếu chọn nhầm)'
                : 'Drag between stations to build metro line! (Double-click a station to remove it if wrongly picked)'}
            </span>
          </div>
        )}
      </main>

      {/* Bottom Dock Bar */}
      {state && (
        <BottomBar
          lines={state.lines}
          trains={state.trains}
          inventory={state.inventory}
          selectedLineId={selectedLineId}
          theme={theme}
          lang={lang}
          onSelectLine={(lId) => setSelectedLineId(lId)}
          onCreateNewLine={() => {
            const nextIdx = state.lines.length % LINE_PALETTE.length;
            const pal = LINE_PALETTE[nextIdx];
            const created = engine?.createLine(
              `Tuyến 0${state.lines.length + 1}`,
              pal.color,
              pal.darkColor,
              pal.textColor
            );
            if (created) {
              setSelectedLineId(created.id);
            }
          }}
          onDeleteLine={(lId) => {
            engine?.deleteLine(lId);
            if (selectedLineId === lId) setSelectedLineId(null);
          }}
          onDeployTrain={(lId) => engine?.deployTrainToLine(lId)}
          onRemoveTrain={(lId) => engine?.removeTrainFromLine(lId)}
          onAddCarriage={(lId) => engine?.addCarriageToLine(lId)}
          onRemoveCarriage={(lId) => engine?.removeCarriageFromLine(lId)}
          onOpenShop={() => setIsShopModalOpen(true)}
        />
      )}

      {/* Station Detail Modal (Instant Upgrade & Inspect & Remove from Line) */}
      {inspectingStation && (
        <StationDetailModal
          station={inspectingStation}
          lines={state?.lines || []}
          hasInterchangeToken={(state?.inventory.interchangeTokens || 0) > 0}
          theme={theme}
          lang={lang}
          onClose={() => setInspectingStation(null)}
          onUpgradeToInterchange={(sId) => {
            engine?.upgradeStationToInterchange(sId);
            const updated = engine?.state.stations.find(s => s.id === sId);
            if (updated) setInspectingStation({ ...updated });
          }}
          onRemoveStationFromLine={(lineId, stationId) => {
            engine?.removeStationFromLine(lineId, stationId);
            const updated = engine?.state.stations.find(s => s.id === stationId);
            if (updated) setInspectingStation({ ...updated });
          }}
        />
      )}

      {/* Weekly Milestone Grant Modal */}
      {isWeeklyModalOpen && state && (
        <WeeklyModal
          weekNumber={state.weekNumber}
          theme={theme}
          lang={lang}
          onSelectReward={(idx) => {
            if (engine) {
              if (idx === 0) {
                engine.state.inventory.availableLines++;
                engine.state.inventory.unassignedTrains++;
              } else if (idx === 1) {
                engine.state.inventory.unassignedTrains += 2;
                engine.state.inventory.interchangeTokens++;
              } else if (idx === 2) {
                engine.state.inventory.unassignedTrains++;
                engine.state.inventory.carriages++;
                engine.state.money += 400;
              }
              engine.state.pendingWeeklyReward = false;
            }
            setIsWeeklyModalOpen(false);
          }}
        />
      )}

      {/* Equipment Shop Modal */}
      {isShopModalOpen && state && (
        <ShopModal
          money={state.money}
          inventory={state.inventory}
          activeLinesCount={state.lines.length}
          totalTrainsCount={state.trains.length + state.inventory.unassignedTrains}
          theme={theme}
          lang={lang}
          onClose={() => setIsShopModalOpen(false)}
          onBuyTrain={() => engine?.buyTrain()}
          onBuyCarriage={() => engine?.buyCarriage()}
          onBuyLine={() => engine?.buyLine()}
          onBuyInterchange={() => engine?.buyInterchangeUpgrade()}
        />
      )}

      {/* Game Over Screen */}
      {state?.isGameOver && (
        <GameOverModal
          reason={state.gameOverReason}
          stats={state.stats}
          theme={theme}
          lang={lang}
          onRestart={() => {
            MetroEngine.clearSave(currentCityId);
            initEngine(currentCityId, 'standard', true);
          }}
          onSwitchToZen={() => {
            if (engine) {
              engine.setGameMode('zen');
              engine.state.isGameOver = false;
              engine.state.gameOverReason = null;
              engine.state.stations.forEach(s => {
                s.overcrowdedTimer = 0;
              });
            }
          }}
        />
      )}

      {/* How to Play Tutorial Modal */}
      {isTutorialOpen && (
        <TutorialModal
          theme={theme}
          lang={lang}
          onClose={() => setIsTutorialOpen(false)}
        />
      )}
    </div>
  );
}
