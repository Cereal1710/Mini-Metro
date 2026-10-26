import React, { useState, useEffect } from 'react';
import {
  Clock,
  ChevronDown,
  ChevronUp,
  CornerDownRight,
  Eye,
  EyeOff,
  TrendingUp,
  Play,
  AlertTriangle
} from 'lucide-react';
import {
  InspectorState,
  Station,
  Train,
  MetroLine,
  GameStats,
  WeatherState,
  UrbanIncident,
  WeatherType
} from '../types/game';
import { PassengerAnalyticsCard } from './PassengerAnalyticsCard';

interface TopLeftMapCardsProps {
  inspectorState?: InspectorState;
  stations: Station[];
  trains: Train[];
  lines: MetroLine[];
  stats?: GameStats;
  currentDayIndex?: number;
  weather?: WeatherState;
  activeIncident?: UrbanIncident | null;
  isRushHour?: boolean;
  money?: number;
  theme: 'dark' | 'light';
  lang: 'vi' | 'en';
  onOpenInspectorModal: () => void;
  onAlightInspectorAtStation: () => void;
  onCancelInspector: () => void;
  onDismissIncident?: () => void;
}

export const TopLeftMapCards: React.FC<TopLeftMapCardsProps> = ({
  inspectorState,
  stations,
  trains,
  lines,
  stats,
  currentDayIndex = 0,
  weather,
  activeIncident,
  isRushHour = false,
  money = 0,
  theme,
  lang,
  onOpenInspectorModal,
  onAlightInspectorAtStation,
  onCancelInspector,
  onDismissIncident
}) => {
  const isDark = theme === 'dark';

  // Vertical Collapse States for each card
  const [isInspectorExpanded, setIsInspectorExpanded] = useState<boolean>(() => {
    try {
      const saved = localStorage.getItem('mini_metro_card_inspector_expanded');
      return saved !== null ? saved === 'true' : true;
    } catch {
      return true;
    }
  });

  const [isAnalyticsExpanded, setIsAnalyticsExpanded] = useState<boolean>(() => {
    try {
      const saved = localStorage.getItem('mini_metro_card_analytics_expanded');
      return saved !== null ? saved === 'true' : false;
    } catch {
      return false;
    }
  });

  const [isWeatherExpanded, setIsWeatherExpanded] = useState<boolean>(() => {
    try {
      const saved = localStorage.getItem('mini_metro_card_weather_expanded');
      return saved !== null ? saved === 'true' : false;
    } catch {
      return false;
    }
  });

  // Global Visibility Toggle for the stack
  const [isStackVisible, setIsStackVisible] = useState<boolean>(true);

  // Sync states to localStorage
  useEffect(() => {
    try {
      localStorage.setItem('mini_metro_card_inspector_expanded', String(isInspectorExpanded));
    } catch {}
  }, [isInspectorExpanded]);

  useEffect(() => {
    try {
      localStorage.setItem('mini_metro_card_analytics_expanded', String(isAnalyticsExpanded));
    } catch {}
  }, [isAnalyticsExpanded]);

  useEffect(() => {
    try {
      localStorage.setItem('mini_metro_card_weather_expanded', String(isWeatherExpanded));
    } catch {}
  }, [isWeatherExpanded]);

  // If inspector is active (patrolling), automatically expand inspector card
  useEffect(() => {
    if (inspectorState?.status === 'patrolling') {
      setIsInspectorExpanded(true);
    }
  }, [inspectorState?.status]);

  // Master Collapse All / Expand All handler
  const allCollapsed = !isInspectorExpanded && !isAnalyticsExpanded && !isWeatherExpanded;
  const toggleCollapseAll = () => {
    if (allCollapsed) {
      setIsInspectorExpanded(true);
      setIsAnalyticsExpanded(true);
      setIsWeatherExpanded(true);
    } else {
      setIsInspectorExpanded(false);
      setIsAnalyticsExpanded(false);
      setIsWeatherExpanded(false);
    }
  };

  // Format time MM:SS
  const formatTime = (secs: number) => {
    const s = Math.max(0, Math.floor(secs));
    const m = Math.floor(s / 60);
    const rem = s % 60;
    return `${m.toString().padStart(2, '0')}:${rem.toString().padStart(2, '0')}`;
  };

  // Station map lookup
  const stationMap = new Map<string, Station>(stations.map(s => [s.id, s]));

  // Inspector State values
  const inspStatus = inspectorState?.status || 'idle';
  const currentStationId = inspectorState?.currentStationId;
  const currentTrainId = inspectorState?.currentTrainId;
  const visitedStationIds = inspectorState?.visitedStationIds || [];
  const plannedStationIds = inspectorState?.plannedStationIds;
  const dwellAtStationTimer = inspectorState?.dwellAtStationTimer || 0;
  const timeRemaining = inspectorState?.timeRemaining || 90;
  const cooldownRemaining = inspectorState?.cooldownRemaining || 0;
  const targetCount = inspectorState?.targetCount || 5;
  const rewardAmount = inspectorState?.rewardAmount || 300 * targetCount;
  const failureReason = inspectorState?.failureReason;

  const currentStation = currentStationId ? stationMap.get(currentStationId) : null;
  const currentTrain = currentTrainId ? trains.find(t => t.id === currentTrainId) : null;
  const currentLine = currentTrain ? lines.find(l => l.id === currentTrain.lineId) : null;
  const endStationId = plannedStationIds && plannedStationIds.length > 0 ? plannedStationIds[plannedStationIds.length - 1] : null;
  const endStation = endStationId ? stationMap.get(endStationId) : null;

  // Weather configuration
  const weatherType = weather?.current || weather?.type || 'sunny';
  const weatherIcons: Record<WeatherType, { icon: string; color: string; labelVi: string; labelEn: string }> = {
    sunny: { icon: '☀️', color: 'text-amber-400', labelVi: 'Nắng ráo', labelEn: 'Sunny' },
    rainy: { icon: '🌧️', color: 'text-sky-400', labelVi: 'Mưa rào (+35% khách)', labelEn: 'Rain (+35% pax)' },
    storm: { icon: '⛈️', color: 'text-indigo-400', labelVi: 'Mưa giông (Tàu giảm tốc)', labelEn: 'Thunderstorm' },
    flooded: { icon: '🌊', color: 'text-cyan-400', labelVi: 'Ngập úng đô thị', labelEn: 'Flooded' }
  };
  const currentWeatherInfo = weatherIcons[weatherType] || weatherIcons.sunny;

  return (
    <div className="absolute top-3 left-3 sm:top-4 sm:left-4 z-30 flex flex-col gap-2 max-w-sm w-[92vw] sm:w-84 pointer-events-none select-none transition-all">
      {/* Top Dock Control Pill: Thu gọn / Mở rộng tất cả & Ẩn hiện dock */}
      <div className="flex items-center justify-between gap-1.5 pointer-events-auto px-2 py-1 rounded-xl bg-slate-900/90 border border-slate-700/80 shadow-md backdrop-blur-md text-[11px] text-slate-300 w-fit">
        <span className="font-bold flex items-center gap-1 text-[10px] uppercase tracking-wider text-amber-400">
          <span>📍</span>
          <span>{lang === 'vi' ? 'Tiện ích Bản đồ' : 'Map HUD'}</span>
        </span>

        <div className="h-3 w-px bg-slate-700 mx-1" />

        {/* Quick Vertical Collapse/Expand All Button */}
        <button
          type="button"
          onClick={toggleCollapseAll}
          className="flex items-center gap-1 px-1.5 py-0.5 rounded-md hover:bg-slate-800 text-slate-300 hover:text-white transition cursor-pointer"
          title={allCollapsed ? (lang === 'vi' ? 'Mở rộng tất cả các thẻ' : 'Expand all cards') : (lang === 'vi' ? 'Thu gọn tất cả thẻ theo chiều dọc' : 'Collapse all cards vertically')}
        >
          {allCollapsed ? <ChevronDown className="w-3 h-3 text-amber-400" /> : <ChevronUp className="w-3 h-3 text-amber-400" />}
          <span className="text-[10px] font-semibold">
            {allCollapsed ? (lang === 'vi' ? 'Mở rộng tất cả' : 'Expand all') : (lang === 'vi' ? 'Thu gọn dọc' : 'Collapse all')}
          </span>
        </button>

        <button
          type="button"
          onClick={() => setIsStackVisible(v => !v)}
          className="p-1 rounded-md hover:bg-slate-800 text-slate-400 hover:text-white transition cursor-pointer ml-0.5"
          title={isStackVisible ? (lang === 'vi' ? 'Tạm ẩn bảng' : 'Hide cards') : (lang === 'vi' ? 'Hiện bảng' : 'Show cards')}
        >
          {isStackVisible ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3 text-emerald-400" />}
        </button>
      </div>

      {/* Cards Stack (Rendered when stack is visible) */}
      {isStackVisible && (
        <div className="flex flex-col gap-2 pointer-events-auto transition-all animate-in fade-in duration-200">
          {/* ========================================================= */}
          {/* CARD 1: THANH TRA TUYẾN TÀU (INSPECTOR CARD)             */}
          {/* ========================================================= */}
          <div
            className={`rounded-2xl border shadow-xl backdrop-blur-md transition-all overflow-hidden ${
              inspStatus === 'patrolling'
                ? isDark
                  ? 'bg-slate-900/95 border-amber-500/60 text-slate-100 shadow-amber-950/30'
                  : 'bg-white/95 border-amber-400 text-slate-900 shadow-xl'
                : inspStatus === 'completed'
                ? isDark
                  ? 'bg-slate-900/95 border-emerald-500/60 text-slate-100 shadow-emerald-950/30'
                  : 'bg-white/95 border-emerald-400 text-slate-900 shadow-xl'
                : inspStatus === 'failed'
                ? isDark
                  ? 'bg-slate-900/95 border-rose-500/60 text-slate-100 shadow-rose-950/30'
                  : 'bg-white/95 border-rose-400 text-slate-900 shadow-xl'
                : isDark
                ? 'bg-slate-900/95 border-slate-700/80 hover:border-amber-500/40 text-slate-100 shadow-lg'
                : 'bg-white/95 border-neutral-300 hover:border-amber-400 text-slate-900 shadow-md'
            }`}
          >
            {/* Header: Click to collapse vertically */}
            <div
              onClick={() => setIsInspectorExpanded(prev => !prev)}
              className="p-2.5 sm:p-3 flex items-center justify-between gap-2 cursor-pointer hover:bg-slate-800/30 transition select-none"
            >
              <div className="flex items-center gap-2 min-w-0">
                <div className={`w-7 h-7 rounded-xl flex items-center justify-center font-bold text-sm shadow-xs shrink-0 ${
                  inspStatus === 'patrolling'
                    ? 'bg-linear-to-tr from-amber-500 to-orange-500 text-white animate-pulse'
                    : inspStatus === 'completed'
                    ? 'bg-emerald-500/20 text-emerald-400'
                    : inspStatus === 'failed'
                    ? 'bg-rose-500/20 text-rose-400'
                    : 'bg-amber-500/15 text-amber-400'
                }`}>
                  {inspStatus === 'completed' ? '🎉' : inspStatus === 'failed' ? '⚠️' : '👮'}
                </div>

                <div className="min-w-0">
                  <div className="text-[10px] font-black uppercase tracking-wider text-amber-500 flex items-center gap-1.5 flex-wrap">
                    <span>
                      {inspStatus === 'patrolling'
                        ? (lang === 'vi' ? 'ĐANG THANH TRA' : 'PATROL IN PROGRESS')
                        : inspStatus === 'completed'
                        ? (lang === 'vi' ? 'HOÀN THÀNH!' : 'PATROL COMPLETE')
                        : inspStatus === 'failed'
                        ? (lang === 'vi' ? 'THẤT BẠI' : 'PATROL FAILED')
                        : (lang === 'vi' ? 'THANH TRA TUYẾN' : 'LINE INSPECTOR')}
                    </span>
                    <span className="px-1.5 py-0.2 rounded-full bg-amber-400 text-slate-950 font-mono text-[9px] font-black shadow-xs">
                      {inspStatus === 'patrolling' ? `+$${rewardAmount.toLocaleString()}` : '+300$/ga'}
                    </span>
                  </div>

                  <div className="text-xs font-bold truncate">
                    {inspStatus === 'patrolling' ? (
                      <span>{visitedStationIds.length}/{targetCount} {lang === 'vi' ? 'ga đã kiểm tra' : 'stations'}</span>
                    ) : inspStatus === 'completed' ? (
                      <span className="text-emerald-400">+{rewardAmount.toLocaleString()}$ {lang === 'vi' ? 'đã cộng tiền' : 'earned'}</span>
                    ) : inspStatus === 'failed' ? (
                      <span className="text-rose-400">{failureReason || (lang === 'vi' ? 'Thất bại' : 'Failed')}</span>
                    ) : cooldownRemaining > 0 ? (
                      <span className="text-rose-400 font-mono flex items-center gap-1">
                        <Clock className="w-3 h-3 animate-spin" /> {lang === 'vi' ? 'Hồi chiêu' : 'Cooldown'} {Math.ceil(cooldownRemaining)}s
                      </span>
                    ) : (
                      <span className="text-emerald-400">{lang === 'vi' ? 'Sẵn sàng tuần tra (Tối thiểu 5 ga)' : 'Ready to deploy (5+ st.)'}</span>
                    )}
                  </div>
                </div>
              </div>

              {/* Time Countdown / Action & Collapse Toggle */}
              <div className="flex items-center gap-1.5 shrink-0">
                {inspStatus === 'patrolling' && (
                  <div className={`px-2 py-0.5 rounded-lg font-mono font-bold text-xs flex items-center gap-1 border ${
                    timeRemaining <= 20
                      ? 'bg-rose-500/20 border-rose-500/40 text-rose-400 animate-pulse'
                      : 'bg-slate-800/80 border-slate-700 text-amber-400'
                  }`}>
                    <Clock className="w-3 h-3" />
                    <span>{formatTime(timeRemaining)}</span>
                  </div>
                )}

                <button
                  type="button"
                  className="p-1 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white transition cursor-pointer"
                  title={isInspectorExpanded ? (lang === 'vi' ? 'Thu gọn thẻ theo chiều dọc' : 'Collapse vertically') : (lang === 'vi' ? 'Mở rộng thẻ' : 'Expand card')}
                >
                  {isInspectorExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {/* Vertical Expanded Content Area */}
            {isInspectorExpanded && (
              <div className="px-3 pb-3 pt-1 space-y-2.5 border-t border-slate-700/50">
                {/* Mode A: IDLE STATE (Ready to Deploy) */}
                {inspStatus === 'idle' && (
                  <div className="space-y-2 pt-1">
                    <p className="text-[11px] text-slate-400 leading-relaxed">
                      {lang === 'vi'
                        ? 'Thanh tra xuất phát từ ga đầu đến ga cuối, chỉ lên các tàu chạy đúng hướng điểm cuối và kiểm tra từng ga.'
                        : 'Inspector travels start to end, alighting at each chosen station and catching next forward train.'}
                    </p>

                    <div className="flex items-center justify-between text-xs pt-1 border-t border-slate-700/40">
                      <div className="text-[10px] text-slate-400 font-mono">
                        <div>{lang === 'vi' ? 'Chi phí:' : 'Cost:'} <strong className="text-rose-400 font-bold">$1,000</strong></div>
                        <div>{lang === 'vi' ? 'Thưởng:' : 'Reward:'} <strong className="text-amber-400 font-bold">300$/ga</strong></div>
                      </div>

                      <button
                        type="button"
                        disabled={cooldownRemaining > 0}
                        onClick={onOpenInspectorModal}
                        className={`px-3 py-1.5 rounded-xl font-black text-xs transition active:scale-95 shadow-md flex items-center gap-1.5 cursor-pointer ${
                          cooldownRemaining > 0
                            ? 'bg-slate-800 text-slate-500 cursor-not-allowed border border-slate-700'
                            : 'bg-amber-400 hover:bg-amber-300 text-slate-950 border border-amber-300 shadow-amber-500/20'
                        }`}
                      >
                        <Play className="w-3.5 h-3.5 fill-current" />
                        <span>{lang === 'vi' ? 'Lập Lộ trình' : 'Plan Route'}</span>
                      </button>
                    </div>
                  </div>
                )}

                {/* Mode B: PATROLLING STATE (Active Patrol HUD) */}
                {inspStatus === 'patrolling' && (
                  <div className="space-y-2.5 pt-1">
                    {/* Itinerary Badges */}
                    <div className="space-y-1">
                      <div className="flex items-center justify-between text-[11px] font-semibold text-slate-400">
                        <span>{lang === 'vi' ? 'Lộ trình ga kiểm tra' : 'Station itinerary'}</span>
                        <span className="font-mono text-emerald-400 font-bold">
                          {Math.min(100, Math.round((visitedStationIds.length / targetCount) * 100))}%
                        </span>
                      </div>

                      <div className="flex flex-wrap gap-1 max-h-24 overflow-y-auto pr-1">
                        {(plannedStationIds || []).map((sId, idx) => {
                          const isVisited = visitedStationIds.includes(sId);
                          const isCurrent = currentStationId === sId;
                          const stName = stationMap.get(sId)?.name || sId;
                          return (
                            <div
                              key={sId || idx}
                              className={`px-2 py-0.5 rounded-lg flex items-center gap-1 text-[10px] font-bold border transition-all ${
                                isVisited
                                  ? 'bg-emerald-500/20 border-emerald-500/50 text-emerald-400'
                                  : isCurrent
                                  ? 'bg-amber-400 border-amber-300 text-slate-950 shadow-md font-black animate-pulse'
                                  : 'bg-slate-800/50 border-slate-700/60 text-slate-400'
                              }`}
                            >
                              <span>{isVisited ? '✓' : `${idx + 1}.`}</span>
                              <span className="max-w-24 truncate">{stName}</span>
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    {/* Current Movement & Platform Dwell Status */}
                    <div className="p-2 rounded-xl bg-slate-800/60 border border-slate-700/60 text-xs space-y-1">
                      {currentTrain ? (
                        <div className="flex items-center justify-between gap-1">
                          <div className="flex items-center gap-2 min-w-0">
                            <span className="text-base animate-pulse">🚆</span>
                            <div className="min-w-0">
                              <span className="text-slate-400 text-[10px] block font-medium">
                                {lang === 'vi' ? 'Trạng thái di chuyển:' : 'Movement status:'}
                              </span>
                              <span className="font-bold text-slate-200 line-clamp-1">
                                {lang === 'vi' ? 'Đang trên tàu ' : 'On train '}{currentLine?.name || ''}
                              </span>
                              <span className="text-[10px] text-amber-400/90 block">
                                {lang === 'vi'
                                  ? `➔ Đi về hướng ${endStation ? `Ga ${endStation.name}` : 'ga cuối'}`
                                  : `➔ Heading to ${endStation ? `Station ${endStation.name}` : 'terminus'}`}
                              </span>
                            </div>
                          </div>

                          {currentTrain.currentStationId && !visitedStationIds.includes(currentTrain.currentStationId) && (
                            <button
                              onClick={onAlightInspectorAtStation}
                              className="shrink-0 px-2 py-1 rounded-lg bg-cyan-500/20 hover:bg-cyan-500/30 text-cyan-300 border border-cyan-500/40 text-[10px] font-bold transition cursor-pointer active:scale-95 flex items-center gap-1"
                              title={lang === 'vi' ? 'Xuống ga để kiểm tra' : 'Alight to inspect station'}
                            >
                              <CornerDownRight className="w-3 h-3" />
                              <span>{lang === 'vi' ? 'Xuống ga' : 'Alight'}</span>
                            </button>
                          )}
                        </div>
                      ) : currentStation ? (
                        <div className="flex items-center gap-2">
                          <span className="text-base">
                            {dwellAtStationTimer > 0 ? '🔍' : '⏳'}
                          </span>
                          <div className="min-w-0">
                            <span className="text-slate-400 text-[10px] block font-medium">
                              {lang === 'vi' ? 'Tại ga:' : 'At station:'} <strong className="text-slate-200">{currentStation.name}</strong>
                            </span>
                            {dwellAtStationTimer > 0 ? (
                              <span className="font-bold text-amber-300 text-[11px] flex items-center gap-1">
                                <span>{lang === 'vi' ? 'Đang kiểm tra sân ga...' : 'Inspecting platform...'}</span>
                                <span className="font-mono text-amber-200">({dwellAtStationTimer.toFixed(1)}s)</span>
                              </span>
                            ) : (
                              <span className="font-bold text-cyan-300 text-[11px]">
                                {lang === 'vi'
                                  ? `Đã xong — Chờ tàu hướng về ${endStation ? `Ga ${endStation.name}` : 'ga cuối'}...`
                                  : `Done — Waiting for train heading to ${endStation ? `Station ${endStation.name}` : 'terminus'}...`}
                              </span>
                            )}
                          </div>
                        </div>
                      ) : (
                        <div className="text-slate-400 text-[11px]">
                          {lang === 'vi' ? 'Đang tuần tra các tuyến tàu...' : 'Patrolling metro lines...'}
                        </div>
                      )}
                    </div>

                    {/* Bottom Actions */}
                    <div className="flex items-center justify-between pt-1 border-t border-slate-700/50">
                      <span className="text-[10px] text-slate-400 font-medium">
                        {lang === 'vi' ? 'Thưởng (300$/ga):' : 'Target (300$/st.):'}{' '}
                        <strong className="text-amber-400 font-mono">
                          +${rewardAmount.toLocaleString()}
                        </strong>
                      </span>

                      <button
                        onClick={onCancelInspector}
                        className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-rose-900/30 text-slate-400 hover:text-rose-300 text-xs font-semibold transition cursor-pointer border border-slate-700/60 active:scale-95"
                      >
                        {lang === 'vi' ? 'Hủy đợt' : 'Cancel'}
                      </button>
                    </div>
                  </div>
                )}

                {/* Mode C: COMPLETED STATE */}
                {inspStatus === 'completed' && (
                  <div className="space-y-1.5 pt-1">
                    <div className="text-[11px] font-bold text-amber-400 font-mono">
                      🎉 +${rewardAmount.toLocaleString()} {lang === 'vi' ? 'Đã cộng vào ngân sách!' : 'Credited to funds!'}
                    </div>
                    <div className="text-[10px] text-slate-400 flex items-center justify-between pt-1 border-t border-slate-700/50">
                      <span>{lang === 'vi' ? 'Đợt tiếp theo sau:' : 'Next patrol in:'}</span>
                      <span className="font-mono font-bold text-slate-200">{Math.ceil(cooldownRemaining)}s</span>
                    </div>
                  </div>
                )}

                {/* Mode D: FAILED STATE */}
                {inspStatus === 'failed' && (
                  <div className="space-y-1.5 pt-1">
                    <div className="text-[11px] text-rose-300">
                      {failureReason || (lang === 'vi' ? 'Hết thời gian tuần tra' : 'Patrol timed out')}
                    </div>
                    <div className="text-[10px] text-slate-400 flex items-center justify-between pt-1 border-t border-slate-700/50">
                      <span>{lang === 'vi' ? 'Hồi chiêu:' : 'Cooldown:'}</span>
                      <span className="font-mono font-bold text-slate-200">{Math.ceil(cooldownRemaining)}s</span>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* ========================================================= */}
          {/* CARD 2: LƯU LƯỢNG HÀNH KHÁCH (LIVE PASSENGER ANALYTICS)  */}
          {/* ========================================================= */}
          <div
            className={`rounded-2xl border shadow-xl backdrop-blur-md transition-all overflow-hidden ${
              isDark
                ? 'bg-slate-900/95 border-slate-700/80 hover:border-emerald-500/40 text-slate-100 shadow-lg'
                : 'bg-white/95 border-neutral-300 hover:border-emerald-400 text-slate-900 shadow-md'
            }`}
          >
            {/* Header: Click to collapse vertically */}
            <div
              onClick={() => setIsAnalyticsExpanded(prev => !prev)}
              className="p-2.5 sm:p-3 flex items-center justify-between gap-2 cursor-pointer hover:bg-slate-800/30 transition select-none"
            >
              <div className="flex items-center gap-2 min-w-0">
                <div className="w-7 h-7 rounded-xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center font-bold text-sm shadow-xs shrink-0">
                  <TrendingUp className="w-4 h-4" />
                </div>
                <div className="min-w-0">
                  <div className="text-[10px] font-black uppercase tracking-wider text-emerald-400 flex items-center gap-1.5">
                    <span>{lang === 'vi' ? 'LƯU LƯỢNG KHÁCH' : 'PASSENGER FLOW'}</span>
                  </div>
                  <div className="text-xs font-bold truncate">
                    +{stats?.todayPassengers ?? 0} {lang === 'vi' ? 'khách hôm nay' : 'pax today'}
                    <span className="opacity-50 text-[10px] font-mono ml-1.5 font-normal">
                      (Tổng: {(stats?.totalPassengersDelivered ?? 0).toLocaleString()})
                    </span>
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-1 shrink-0">
                <span className="px-1.5 py-0.5 rounded-full font-mono text-[9px] font-bold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                  +{stats?.todayPassengers ?? 0}
                </span>
                <button
                  type="button"
                  className="p-1 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white transition cursor-pointer"
                  title={isAnalyticsExpanded ? (lang === 'vi' ? 'Thu gọn thẻ theo chiều dọc' : 'Collapse vertically') : (lang === 'vi' ? 'Mở rộng biểu đồ' : 'Expand chart')}
                >
                  {isAnalyticsExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {/* Vertical Expanded Content Area: Chart and KPIs */}
            {isAnalyticsExpanded && (
              <div className="px-3 pb-3 pt-1 border-t border-slate-700/50">
                <PassengerAnalyticsCard
                  stats={stats}
                  currentDayIndex={currentDayIndex}
                  theme={theme}
                  lang={lang}
                />
              </div>
            )}
          </div>

          {/* ========================================================= */}
          {/* CARD 3: THỜI TIẾT & SỰ CỐ ĐÔ THỊ (WEATHER & CITY STATUS)  */}
          {/* ========================================================= */}
          <div
            className={`rounded-2xl border shadow-xl backdrop-blur-md transition-all overflow-hidden ${
              activeIncident
                ? isDark
                  ? 'bg-slate-900/95 border-amber-500/60 text-slate-100 shadow-amber-950/20'
                  : 'bg-white/95 border-amber-400 text-slate-900 shadow-xl'
                : isDark
                ? 'bg-slate-900/95 border-slate-700/80 hover:border-cyan-500/40 text-slate-100 shadow-lg'
                : 'bg-white/95 border-neutral-300 hover:border-cyan-400 text-slate-900 shadow-md'
            }`}
          >
            {/* Header: Click to collapse vertically */}
            <div
              onClick={() => setIsWeatherExpanded(prev => !prev)}
              className="p-2.5 sm:p-3 flex items-center justify-between gap-2 cursor-pointer hover:bg-slate-800/30 transition select-none"
            >
              <div className="flex items-center gap-2 min-w-0">
                <div className="w-7 h-7 rounded-xl bg-cyan-500/20 text-cyan-400 flex items-center justify-center font-bold text-sm shadow-xs shrink-0">
                  {currentWeatherInfo.icon}
                </div>
                <div className="min-w-0">
                  <div className="text-[10px] font-black uppercase tracking-wider text-cyan-400 flex items-center gap-1.5 flex-wrap">
                    <span>{lang === 'vi' ? 'THỜI TIẾT ĐÔ THỊ' : 'CITY WEATHER'}</span>
                    {isRushHour && (
                      <span className="px-1.5 py-0.2 rounded-full bg-rose-500/20 text-rose-300 font-mono text-[9px] font-bold border border-rose-500/30 animate-pulse">
                        {lang === 'vi' ? 'CAO ĐIỂM' : 'RUSH HOUR'}
                      </span>
                    )}
                  </div>
                  <div className="text-xs font-bold truncate flex items-center gap-1.5">
                    <span>{weather?.temperature || 31}°C</span>
                    <span className="opacity-70">•</span>
                    <span className="truncate">{lang === 'vi' ? currentWeatherInfo.labelVi : currentWeatherInfo.labelEn}</span>
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-1 shrink-0">
                {activeIncident && (
                  <span className="w-2 h-2 rounded-full bg-amber-400 animate-ping" />
                )}
                <button
                  type="button"
                  className="p-1 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white transition cursor-pointer"
                  title={isWeatherExpanded ? (lang === 'vi' ? 'Thu gọn thẻ theo chiều dọc' : 'Collapse vertically') : (lang === 'vi' ? 'Mở rộng chi tiết' : 'Expand details')}
                >
                  {isWeatherExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {/* Vertical Expanded Content Area */}
            {isWeatherExpanded && (
              <div className="px-3 pb-3 pt-1 space-y-2 border-t border-slate-700/50 text-xs">
                {/* Weather description & effects */}
                <div className="p-2 rounded-xl bg-slate-800/50 border border-slate-700/50 text-[11px] text-slate-300 leading-relaxed">
                  {lang === 'vi' ? weather?.descriptionVi || 'Trời nắng ráo' : weather?.descriptionEn || 'Sunny & Clear'}
                  {weatherType === 'rainy' && (
                    <div className="text-sky-300 font-semibold mt-0.5">
                      🌧️ {lang === 'vi' ? 'Mưa đô thị: Hành khách dồn lên tàu đông hơn (+35%)' : 'Rain: Passenger volume increases by +35%'}
                    </div>
                  )}
                  {weatherType === 'storm' && (
                    <div className="text-indigo-300 font-semibold mt-0.5">
                      ⛈️ {lang === 'vi' ? 'Giông bão: Tàu giảm tốc an toàn 20%' : 'Storm: Trains travel 20% slower for safety'}
                    </div>
                  )}
                </div>

                {/* Active Incident Warning if Flooded */}
                {activeIncident && (
                  <div className="p-2.5 rounded-xl bg-amber-500/15 border border-amber-500/30 text-amber-200 text-xs space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="font-bold flex items-center gap-1 text-amber-400">
                        <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                        <span>{lang === 'vi' ? activeIncident.titleVi : activeIncident.titleEn}</span>
                      </span>
                      <span className="font-mono text-[10px] text-amber-300">
                        {Math.ceil(activeIncident.remainingSeconds)}s
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-300">
                      {lang === 'vi' ? activeIncident.descriptionVi : activeIncident.descriptionEn}
                    </p>
                    {onDismissIncident && (
                      <div className="flex justify-end pt-1">
                        <button
                          type="button"
                          onClick={onDismissIncident}
                          className="px-2 py-0.5 rounded-md bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/40 text-[10px] font-bold transition cursor-pointer"
                        >
                          {lang === 'vi' ? 'Khắc phục sự cố' : 'Resolve Incident'}
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
