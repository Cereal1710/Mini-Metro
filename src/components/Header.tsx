import React, { useState, useRef, useEffect } from 'react';
import {
  Play,
  Pause,
  MoreHorizontal,
  Volume2,
  VolumeX,
  Sun,
  Moon,
  HelpCircle,
  ShoppingBag,
  Flame,
  Users,
  DollarSign,
  Train as TrainIcon,
  Globe,
  Compass,
  Check,
  RotateCcw,
  Trophy,
  Spline,
  Route,
  Sparkles,
  Unlock,
  Eye,
  EyeOff,
  User,
  CloudRain,
  CloudLightning,
  Waves,
  AlertTriangle,
  X
} from 'lucide-react';
import { GameMode, CityMapConfig, WeatherState, UrbanIncident } from '../types/game';
import { formatMoney, TrackRoutingStyle } from '../utils/geometry';
import { DAY_NAMES_VI, DAY_NAMES_EN } from '../simulation/metroEngine';
import { UserProfile } from '../services/firebase';

interface HeaderProps {
  cityName: string;
  timeOfDayHours: number;
  currentDayIndex: number;
  weekNumber: number;
  money: number;
  passengersDelivered: number;
  activeTrains: number;
  totalTrains: number;
  gameSpeed: number;
  isRushHour: boolean;
  weather?: WeatherState;
  activeIncident?: UrbanIncident | null;
  gameMode: GameMode;
  theme: 'dark' | 'light';
  isMuted: boolean;
  lang: 'vi' | 'en';
  cityMaps: CityMapConfig[];
  currentCityId: string;
  highScore?: { bestPassengers: number; bestDays: number };
  isSaved?: boolean;
  trackStyle?: TrackRoutingStyle;
  hideStationIcons?: boolean;
  hidePassengerCount?: boolean;
  onSetSpeed: (speed: number) => void;
  onToggleTheme: () => void;
  onToggleMute: () => void;
  onToggleLang: () => void;
  onToggleGameMode: () => void;
  onToggleTrackStyle?: () => void;
  onToggleCreativeToolbar?: () => void;
  onUnlockAllStations?: () => void;
  onToggleHideStationIcons?: () => void;
  onToggleHidePassengerCount?: () => void;
  onResetGame: () => void;
  onOpenTutorial: () => void;
  onOpenShop: () => void;
  onSelectCity: (cityId: string) => void;
  currentUser?: UserProfile | null;
  onOpenStartMenu?: () => void;
  onOpenAuth?: () => void;
  onDismissIncident?: () => void;
  onOpenInspector?: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  cityName,
  timeOfDayHours,
  currentDayIndex,
  weekNumber,
  money,
  passengersDelivered,
  activeTrains,
  totalTrains,
  gameSpeed,
  isRushHour,
  weather,
  activeIncident,
  gameMode,
  theme,
  isMuted,
  lang,
  cityMaps,
  currentCityId,
  highScore,
  isSaved,
  trackStyle = 'curved',
  hideStationIcons = false,
  hidePassengerCount = false,
  onSetSpeed,
  onToggleTheme,
  onToggleMute,
  onToggleLang,
  onToggleGameMode,
  onToggleTrackStyle,
  onToggleCreativeToolbar,
  onUnlockAllStations,
  onToggleHideStationIcons,
  onToggleHidePassengerCount,
  onResetGame,
  onOpenTutorial,
  onOpenShop,
  onSelectCity,
  currentUser,
  onOpenStartMenu,
  onOpenAuth,
  onDismissIncident,
  onOpenInspector
}) => {
  const isDark = theme === 'dark';
  const dayName = lang === 'vi' ? DAY_NAMES_VI[currentDayIndex] : DAY_NAMES_EN[currentDayIndex];

  // 3-dot dropdown menu state
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Close menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setIsMenuOpen(false);
      }
    };
    if (isMenuOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isMenuOpen]);

  // Format 24h clock to HH:MM
  const totalMinutes = Math.floor(timeOfDayHours * 60) % (24 * 60);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  const timeString = `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;

  return (
    <header className={`h-14 px-2 sm:px-4 md:px-6 flex items-center justify-between border-b transition-colors select-none z-30 shrink-0 gap-1.5 sm:gap-3 ${
      isDark ? 'bg-slate-900/95 border-slate-800 text-slate-100 backdrop-blur-md' : 'bg-white/95 border-neutral-200 text-slate-800 backdrop-blur-md'
    }`}>
      {/* Left: Logo & City Dropdown */}
      <div className="flex items-center gap-1.5 sm:gap-3 shrink-0">
        <div className="flex items-center gap-1.5 sm:gap-2.5">
          <div className="w-7 h-7 rounded-lg bg-emerald-600 flex items-center justify-center text-white font-black text-sm shadow-sm shrink-0">
            M
          </div>
          <div className="flex items-center gap-1 sm:gap-2">
            <span className="font-extrabold text-sm tracking-tight hidden lg:inline">
              MINI METRO
            </span>

            {/* City Selector */}
            <select
              value={currentCityId}
              onChange={(e) => onSelectCity(e.target.value)}
              className={`text-xs font-bold cursor-pointer bg-transparent border-0 outline-none p-0 focus:ring-0 max-w-[70px] sm:max-w-none truncate ${
                isDark ? 'text-emerald-400 hover:text-emerald-300' : 'text-emerald-600 hover:text-emerald-700'
              }`}
            >
              {cityMaps.map(m => (
                <option key={m.id} value={m.id} className={isDark ? 'bg-slate-900 text-white' : 'bg-white text-slate-900'}>
                  {lang === 'vi' ? m.nameVi : m.nameEn}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Rush Hour Indicator */}
        {isRushHour && (
          <div className="flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] sm:text-[11px] font-bold bg-amber-500/20 text-amber-400 border border-amber-500/30 animate-pulse shrink-0">
            <Flame className="w-3 h-3 fill-amber-400" />
            <span className="hidden md:inline">{lang === 'vi' ? 'CAO ĐIỂM' : 'RUSH'}</span>
          </div>
        )}

        {/* Weather Indicator */}
        {weather && (
          <div
            className={`hidden sm:flex items-center gap-1 sm:gap-1.5 px-1.5 sm:px-2 py-0.5 rounded-md text-[10px] sm:text-[11px] font-semibold border transition shrink-0 ${
              weather.current === 'flooded'
                ? 'bg-blue-600/20 text-blue-400 border-blue-500/40 animate-pulse'
                : weather.current === 'storm'
                ? 'bg-purple-600/20 text-purple-300 border-purple-500/40 animate-pulse'
                : weather.current === 'rainy'
                ? 'bg-sky-500/15 text-sky-400 border-sky-500/30'
                : isDark
                ? 'bg-slate-800/80 text-amber-300 border-slate-700'
                : 'bg-neutral-100 text-amber-600 border-neutral-300'
            }`}
            title={
              lang === 'vi'
                ? `Thời tiết: ${
                    weather.current === 'sunny'
                      ? 'Nắng ấm, giao thông thuận lợi'
                      : weather.current === 'rainy'
                      ? 'Mưa vừa (+35% khách cần đi metro)'
                      : weather.current === 'storm'
                      ? 'Mưa bão lớn (+35% khách, tiền thưởng vượt bão)'
                      : 'Ngập úng đô thị (tàu giảm tốc độ 45%)'
                  } • ${weather.temperature}°C`
                : `Weather: ${weather.current} • ${weather.temperature}°C`
            }
          >
            {weather.current === 'flooded' ? (
              <Waves className="w-3.5 h-3.5 text-blue-400" />
            ) : weather.current === 'storm' ? (
              <CloudLightning className="w-3.5 h-3.5 text-purple-400" />
            ) : weather.current === 'rainy' ? (
              <CloudRain className="w-3.5 h-3.5 text-sky-400" />
            ) : (
              <Sun className="w-3.5 h-3.5 text-amber-400" />
            )}
            <span className="font-mono font-bold">{weather.temperature}°C</span>
          </div>
        )}

        {/* Active Incident Alert */}
        {activeIncident && (
          <div
            className="hidden md:flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] sm:text-[11px] font-bold bg-rose-500/20 text-rose-400 border border-rose-500/30 shadow-sm animate-pulse shrink-0"
            title={lang === 'vi' ? activeIncident.descriptionVi : activeIncident.descriptionEn}
          >
            <AlertTriangle className="w-3 h-3 text-rose-400" />
            <span className="hidden xl:inline">{lang === 'vi' ? activeIncident.titleVi : activeIncident.titleEn}</span>
            {onDismissIncident && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onDismissIncident();
                }}
                className="ml-1 p-0.5 rounded-full hover:bg-rose-500/40 text-rose-300 hover:text-white transition cursor-pointer flex items-center justify-center"
                title={lang === 'vi' ? 'Đóng / Khắc phục sự cố ngay' : 'Dismiss / resolve incident now'}
              >
                <X className="w-3 h-3" />
              </button>
            )}
          </div>
        )}
      </div>

      {/* Center: Essential Game Stats */}
      <div className="flex items-center gap-2 sm:gap-4 md:gap-8 shrink-0">
        {/* Day & Clock */}
        <div className="text-center">
          <div className="text-[8px] sm:text-[10px] font-semibold tracking-wider uppercase opacity-60">
            <span className="hidden sm:inline">{dayName} • </span>{lang === 'vi' ? `T.${weekNumber}` : `Wk.${weekNumber}`}
          </div>
          <div className="font-mono font-black text-xs sm:text-sm md:text-base leading-none">
            {timeString}
          </div>
        </div>

        {/* Money */}
        <div className="flex items-center gap-1 sm:gap-1.5">
          <div className="w-5 h-5 sm:w-6 sm:h-6 rounded-full bg-emerald-500/15 text-emerald-400 flex items-center justify-center shrink-0">
            <DollarSign className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
          </div>
          <div>
            <div className="text-[8px] sm:text-[9px] font-bold uppercase opacity-50 hidden sm:block">
              {lang === 'vi' ? 'Ngân sách' : 'Budget'}
            </div>
            <div className="font-mono font-bold text-xs sm:text-sm leading-none text-emerald-400">
              {formatMoney(money)}
            </div>
          </div>
        </div>

        {/* Passengers */}
        <div className="flex items-center gap-1 sm:gap-1.5">
          <div className="w-5 h-5 sm:w-6 sm:h-6 rounded-full bg-blue-500/15 text-blue-400 flex items-center justify-center shrink-0">
            <Users className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
          </div>
          <div>
            <div className="text-[8px] sm:text-[9px] font-bold uppercase opacity-50 hidden sm:block">
              {lang === 'vi' ? 'Hành khách' : 'Passengers'}
            </div>
            <div className="font-mono font-bold text-xs sm:text-sm leading-none">
              {passengersDelivered}
            </div>
          </div>
        </div>

        {/* Active Trains */}
        <div className="hidden lg:flex items-center gap-1.5">
          <div className="w-6 h-6 rounded-full bg-purple-500/15 text-purple-400 flex items-center justify-center">
            <TrainIcon className="w-3.5 h-3.5" />
          </div>
          <div>
            <div className="text-[9px] font-bold uppercase opacity-50">
              {lang === 'vi' ? 'Đoàn tàu' : 'Fleet'}
            </div>
            <div className="font-mono font-bold text-xs md:text-sm leading-none">
              {activeTrains} / {totalTrains}
            </div>
          </div>
        </div>
      </div>

      {/* Right: Speed Controls & Minimal 3-Dots Menu */}
      <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
        {/* Speed Controls (Mobile: Play/Pause + Cycler badge | Desktop: full 4 buttons) */}
        <div className={`flex items-center rounded-lg p-0.5 border ${
          isDark ? 'bg-slate-800/80 border-slate-700' : 'bg-neutral-100 border-neutral-300'
        }`}>
          <button
            onClick={() => onSetSpeed(gameSpeed === 0 ? 1 : 0)}
            title={gameSpeed === 0 ? (lang === 'vi' ? 'Tiếp tục' : 'Resume') : (lang === 'vi' ? 'Tạm dừng' : 'Pause')}
            className={`p-1.5 rounded transition cursor-pointer ${
              gameSpeed === 0 ? 'bg-amber-500 text-white font-bold shadow-sm' : 'opacity-70 hover:opacity-100'
            }`}
          >
            {gameSpeed === 0 ? <Play className="w-3 h-3 fill-current" /> : <Pause className="w-3 h-3 fill-current" />}
          </button>

          {/* Mobile Speed Cycle Badge */}
          <button
            onClick={() => {
              const next = gameSpeed === 0 ? 1 : gameSpeed === 1 ? 2 : gameSpeed === 2 ? 3 : 1;
              onSetSpeed(next);
            }}
            className="sm:hidden px-1.5 py-0.5 text-[11px] font-mono font-bold text-emerald-400 cursor-pointer"
            title="Đổi tốc độ game"
          >
            {gameSpeed === 0 ? 'PAUSE' : `${gameSpeed}x`}
          </button>

          {/* Desktop full buttons */}
          <button
            onClick={() => onSetSpeed(1)}
            className={`hidden sm:block px-1.5 py-0.5 text-xs font-mono font-bold rounded transition cursor-pointer ${
              gameSpeed === 1 ? 'bg-emerald-600 text-white shadow-sm' : 'opacity-70 hover:opacity-100'
            }`}
          >
            1x
          </button>
          <button
            onClick={() => onSetSpeed(2)}
            className={`hidden sm:block px-1.5 py-0.5 text-xs font-mono font-bold rounded transition cursor-pointer ${
              gameSpeed === 2 ? 'bg-emerald-600 text-white shadow-sm' : 'opacity-70 hover:opacity-100'
            }`}
          >
            2x
          </button>
          <button
            onClick={() => onSetSpeed(3)}
            className={`hidden sm:block px-1.5 py-0.5 text-xs font-mono font-bold rounded transition cursor-pointer ${
              gameSpeed === 3 ? 'bg-emerald-600 text-white shadow-sm' : 'opacity-70 hover:opacity-100'
            }`}
          >
            3x
          </button>
        </div>

        {/* Track Style Quick Switch Button */}
        {onToggleTrackStyle && (
          <button
            onClick={onToggleTrackStyle}
            title={
              lang === 'vi'
                ? `Kiểu ray: ${
                    trackStyle === 'curved'
                      ? 'Đường cong mượt mà'
                      : trackStyle === 'octolinear'
                      ? 'Đường gấp khúc 45°'
                      : 'Đường thẳng'
                  } (Bấm để đổi)`
                : `Track Style: ${trackStyle} (Click to switch)`
            }
            className={`hidden md:flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold border transition cursor-pointer ${
              isDark
                ? 'bg-slate-800/80 border-slate-700 hover:bg-slate-700 text-slate-300 hover:text-white'
                : 'bg-neutral-100 border-neutral-300 hover:bg-neutral-200 text-slate-700'
            }`}
          >
            {trackStyle === 'curved' ? (
              <Spline className="w-3.5 h-3.5 text-cyan-400" />
            ) : (
              <Route className="w-3.5 h-3.5 text-emerald-500" />
            )}
            <span className="text-[11px] font-medium hidden lg:inline">
              {trackStyle === 'curved'
                ? (lang === 'vi' ? 'Ray cong mượt' : 'Curved')
                : trackStyle === 'octolinear'
                ? (lang === 'vi' ? 'Ray gấp khúc' : 'Octolinear')
                : (lang === 'vi' ? 'Ray thẳng' : 'Straight')}
            </span>
          </button>
        )}

        {/* User Account / Cloud Sync Badge */}
        {onOpenAuth && (
          <button
            onClick={onOpenAuth}
            title={currentUser
              ? `${lang === 'vi' ? 'Tài khoản:' : 'Account:'} ${currentUser.username} (${lang === 'vi' ? 'Đã đồng bộ đám mây' : 'Cloud Synced'})`
              : (lang === 'vi' ? 'Đăng nhập để đồng bộ đám mây' : 'Log in to sync with Cloud')}
            className={`flex items-center gap-1 sm:gap-1.5 p-1.5 sm:px-2.5 sm:py-1 rounded-lg text-xs font-semibold border transition cursor-pointer shrink-0 ${
              currentUser
                ? 'bg-emerald-500/15 border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/25'
                : 'bg-amber-500/15 border-amber-500/30 text-amber-400 hover:bg-amber-500/25'
            }`}
          >
            <User className="w-3.5 h-3.5" />
            <span className="hidden sm:inline font-mono max-w-[70px] truncate">
              {currentUser ? currentUser.username : (lang === 'vi' ? 'Đăng nhập' : 'Login')}
            </span>
            {currentUser ? (
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
            ) : (
              <span className="hidden sm:inline text-[9px] font-mono px-1 rounded bg-amber-500/20 text-amber-300">
                LOCAL
              </span>
            )}
          </button>
        )}

        {/* The 3-Dots (...) Button for Secondary Actions */}
        <div className="relative" ref={menuRef}>
          <button
            onClick={() => setIsMenuOpen(prev => !prev)}
            title={lang === 'vi' ? 'Cài đặt & Tùy chọn khác' : 'More Options'}
            className={`p-2 rounded-lg border transition cursor-pointer flex items-center justify-center shrink-0 ${
              isMenuOpen
                ? 'bg-emerald-600 text-white border-emerald-500 shadow-sm'
                : isDark
                ? 'bg-slate-800/80 border-slate-700 hover:bg-slate-700 text-slate-300 hover:text-white'
                : 'bg-neutral-100 border-neutral-300 hover:bg-neutral-200 text-slate-700'
            }`}
          >
            <MoreHorizontal className="w-4 h-4" />
          </button>

          {/* Dropdown Menu Popover */}
          {isMenuOpen && (
            <div className={`absolute right-0 mt-2 w-64 max-w-[92vw] max-h-[80dvh] overflow-y-auto rounded-xl p-2 border shadow-2xl z-50 animate-in fade-in slide-in-from-top-2 duration-150 ${
              isDark ? 'bg-slate-900 border-slate-800 text-slate-100' : 'bg-white border-neutral-200 text-slate-900'
            }`}>
              {/* Start Menu Portal */}
              {onOpenStartMenu && (
                <button
                  onClick={() => {
                    setIsMenuOpen(false);
                    onOpenStartMenu();
                  }}
                  className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs font-semibold transition cursor-pointer ${
                    isDark ? 'hover:bg-slate-800 text-slate-200' : 'hover:bg-neutral-100 text-slate-800'
                  }`}
                >
                  <div className="flex items-center gap-2.5">
                    <TrainIcon className="w-4 h-4 text-emerald-400" />
                    <span>{lang === 'vi' ? 'Màn hình Menu chính' : 'Start Menu Portal'}</span>
                  </div>
                </button>
              )}

              {/* Shop / Depot */}
              <button
                onClick={() => {
                  setIsMenuOpen(false);
                  onOpenShop();
                }}
                className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs font-semibold transition cursor-pointer ${
                  isDark ? 'hover:bg-slate-800 text-slate-200' : 'hover:bg-neutral-100 text-slate-800'
                }`}
              >
                <div className="flex items-center gap-2.5">
                  <ShoppingBag className="w-4 h-4 text-emerald-400" />
                  <span>{lang === 'vi' ? 'Cửa hàng thiết bị (Shop)' : 'Equipment Shop'}</span>
                </div>
              </button>

              {/* Metro Line Inspector */}
              {onOpenInspector && (
                <button
                  onClick={() => {
                    setIsMenuOpen(false);
                    onOpenInspector();
                  }}
                  className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs font-semibold transition cursor-pointer ${
                    isDark ? 'hover:bg-amber-500/15 text-amber-300' : 'hover:bg-amber-50 text-amber-800'
                  }`}
                >
                  <div className="flex items-center gap-2.5">
                    <span className="text-base leading-none">👮</span>
                    <span className="font-bold">{lang === 'vi' ? 'Thanh tra Tuyến tàu' : 'Metro Line Inspector'}</span>
                  </div>
                  <span className="text-[10px] font-mono font-black px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-400 border border-amber-500/30">
                    +300$/ga
                  </span>
                </button>
              )}

              {/* Sound Toggle */}
              <button
                onClick={onToggleMute}
                className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs font-semibold transition cursor-pointer ${
                  isDark ? 'hover:bg-slate-800 text-slate-200' : 'hover:bg-neutral-100 text-slate-800'
                }`}
              >
                <div className="flex items-center gap-2.5">
                  {isMuted ? <VolumeX className="w-4 h-4 text-red-400" /> : <Volume2 className="w-4 h-4 text-blue-400" />}
                  <span>{lang === 'vi' ? 'Âm thanh' : 'Audio Sound'}</span>
                </div>
                <span className="text-[10px] font-mono opacity-60">
                  {isMuted ? (lang === 'vi' ? 'TẮT' : 'OFF') : (lang === 'vi' ? 'BẬT' : 'ON')}
                </span>
              </button>

              {/* Theme Toggle */}
              <button
                onClick={onToggleTheme}
                className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs font-semibold transition cursor-pointer ${
                  isDark ? 'hover:bg-slate-800 text-slate-200' : 'hover:bg-neutral-100 text-slate-800'
                }`}
              >
                <div className="flex items-center gap-2.5">
                  {isDark ? <Sun className="w-4 h-4 text-amber-400" /> : <Moon className="w-4 h-4 text-purple-400" />}
                  <span>{lang === 'vi' ? 'Giao diện' : 'Appearance'}</span>
                </div>
                <span className="text-[10px] font-mono opacity-60">
                  {isDark ? (lang === 'vi' ? 'Tối' : 'Dark') : (lang === 'vi' ? 'Sáng' : 'Light')}
                </span>
              </button>

              {/* Language Switch */}
              <button
                onClick={onToggleLang}
                className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs font-semibold transition cursor-pointer ${
                  isDark ? 'hover:bg-slate-800 text-slate-200' : 'hover:bg-neutral-100 text-slate-800'
                }`}
              >
                <div className="flex items-center gap-2.5">
                  <Globe className="w-4 h-4 text-cyan-400" />
                  <span>{lang === 'vi' ? 'Ngôn ngữ' : 'Language'}</span>
                </div>
                <span className="text-[10px] font-mono font-bold text-emerald-400">
                  {lang === 'vi' ? 'Tiếng Việt' : 'English'}
                </span>
              </button>

              {/* Switch Game Mode: Standard vs Zen vs Creative vs Rush Hour */}
              <button
                onClick={onToggleGameMode}
                className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs font-semibold transition cursor-pointer ${
                  isDark ? 'hover:bg-slate-800 text-slate-200' : 'hover:bg-neutral-100 text-slate-800'
                }`}
              >
                <div className="flex items-center gap-2.5">
                  <Compass className="w-4 h-4 text-amber-400" />
                  <span>{lang === 'vi' ? 'Chế độ chơi' : 'Game Mode'}</span>
                </div>
                <span className="text-[10px] font-mono font-bold text-amber-400">
                  {gameMode === 'standard'
                    ? (lang === 'vi' ? 'Tiêu chuẩn (2x)' : 'Standard (2x)')
                    : gameMode === 'zen'
                    ? (lang === 'vi' ? 'Thư giãn (Zen)' : 'Zen')
                    : (lang === 'vi' ? 'Cao điểm' : 'Rush Hour')}
                </span>
              </button>

              {/* Creative Toolbar Trigger */}
              {onToggleCreativeToolbar && (
                <button
                  onClick={() => {
                    setIsMenuOpen(false);
                    onToggleCreativeToolbar();
                  }}
                  className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs font-semibold transition cursor-pointer ${
                    isDark ? 'hover:bg-slate-800 text-amber-300' : 'hover:bg-neutral-100 text-amber-600'
                  }`}
                >
                  <div className="flex items-center gap-2.5">
                    <Sparkles className="w-4 h-4 text-amber-400" />
                    <span>{lang === 'vi' ? 'Bộ công cụ Sáng tạo & Địa hình' : 'Creative & Terrain Tools'}</span>
                  </div>
                  <span className="text-[10px] font-mono font-bold px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-400">
                    {lang === 'vi' ? 'Mở' : 'Open'}
                  </span>
                </button>
              )}

              {/* Track Routing Style Switch */}
              {onToggleTrackStyle && (
                <button
                  onClick={onToggleTrackStyle}
                  className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs font-semibold transition cursor-pointer ${
                    isDark ? 'hover:bg-slate-800 text-slate-200' : 'hover:bg-neutral-100 text-slate-800'
                  }`}
                >
                  <div className="flex items-center gap-2.5">
                    {trackStyle === 'curved' ? (
                      <Spline className="w-4 h-4 text-cyan-400" />
                    ) : (
                      <Route className="w-4 h-4 text-emerald-400" />
                    )}
                    <span>{lang === 'vi' ? 'Kiểu đường ray' : 'Track Style'}</span>
                  </div>
                  <span className="text-[10px] font-mono font-bold text-cyan-400">
                    {trackStyle === 'curved'
                      ? (lang === 'vi' ? 'Cong mượt' : 'Curved')
                      : trackStyle === 'octolinear'
                      ? (lang === 'vi' ? 'Gấp khúc 45°' : 'Octolinear')
                      : (lang === 'vi' ? 'Thẳng' : 'Straight')}
                  </span>
                </button>
              )}

              {/* Toggle Hide Station Icons */}
              {onToggleHideStationIcons && (
                <button
                  onClick={onToggleHideStationIcons}
                  className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs font-semibold transition cursor-pointer ${
                    isDark ? 'hover:bg-slate-800 text-slate-200' : 'hover:bg-neutral-100 text-slate-800'
                  }`}
                >
                  <div className="flex items-center gap-2.5">
                    {hideStationIcons ? (
                      <EyeOff className="w-4 h-4 text-rose-400" />
                    ) : (
                      <Eye className="w-4 h-4 text-emerald-400" />
                    )}
                    <span>{lang === 'vi' ? 'Ẩn icon các nhà ga' : 'Hide Station Icons'}</span>
                  </div>
                  <span className={`text-[10px] font-mono font-bold px-1.5 py-0.5 rounded ${
                    hideStationIcons
                      ? 'bg-rose-500/20 text-rose-400 border border-rose-500/30'
                      : 'bg-emerald-500/15 text-emerald-400'
                  }`}>
                    {hideStationIcons
                      ? (lang === 'vi' ? 'ĐANG ẨN' : 'HIDDEN')
                      : (lang === 'vi' ? 'HIỆN' : 'SHOWN')}
                  </span>
                </button>
              )}

              {/* Toggle Hide Passenger Count */}
              {onToggleHidePassengerCount && (
                <button
                  onClick={onToggleHidePassengerCount}
                  className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs font-semibold transition cursor-pointer ${
                    isDark ? 'hover:bg-slate-800 text-slate-200' : 'hover:bg-neutral-100 text-slate-800'
                  }`}
                >
                  <div className="flex items-center gap-2.5">
                    {hidePassengerCount ? (
                      <EyeOff className="w-4 h-4 text-rose-400" />
                    ) : (
                      <Users className="w-4 h-4 text-blue-400" />
                    )}
                    <span>{lang === 'vi' ? 'Ẩn số lượng khách' : 'Hide Passenger Count'}</span>
                  </div>
                  <span className={`text-[10px] font-mono font-bold px-1.5 py-0.5 rounded ${
                    hidePassengerCount
                      ? 'bg-rose-500/20 text-rose-400 border border-rose-500/30'
                      : 'bg-blue-500/15 text-blue-400'
                  }`}>
                    {hidePassengerCount
                      ? (lang === 'vi' ? 'ĐANG ẨN' : 'HIDDEN')
                      : (lang === 'vi' ? 'HIỆN' : 'SHOWN')}
                  </span>
                </button>
              )}

              {/* Unlock All Stations (Pro) */}
              {onUnlockAllStations && (
                <button
                  onClick={() => {
                    setIsMenuOpen(false);
                    onUnlockAllStations();
                  }}
                  className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs font-semibold transition cursor-pointer ${
                    isDark ? 'hover:bg-slate-800 text-amber-300' : 'hover:bg-amber-50 text-amber-700'
                  }`}
                >
                  <div className="flex items-center gap-2.5">
                    <Unlock className="w-4 h-4 text-amber-400" />
                    <span>{lang === 'vi' ? 'Unlock toàn bộ nhà ga (Pro)' : 'Unlock All Stations (Pro)'}</span>
                  </div>
                  <span className="text-[10px] font-mono font-bold px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-400 border border-amber-500/30">
                    PRO
                  </span>
                </button>
              )}

              <div className="my-1 border-t border-slate-800/50" />

              {/* Tutorial / Help */}
              <button
                onClick={() => {
                  setIsMenuOpen(false);
                  onOpenTutorial();
                }}
                className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-semibold transition cursor-pointer ${
                  isDark ? 'hover:bg-slate-800 text-slate-200' : 'hover:bg-neutral-100 text-slate-800'
                }`}
              >
                <HelpCircle className="w-4 h-4 text-emerald-400" />
                <span>{lang === 'vi' ? 'Hướng dẫn cách chơi' : 'How to Play'}</span>
              </button>

              <div className="my-1 border-t border-slate-800/50" />

              {/* Reset City Save */}
              <button
                onClick={() => {
                  setIsMenuOpen(false);
                  onResetGame();
                }}
                className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-semibold text-red-400 hover:bg-red-500/10 transition cursor-pointer"
              >
                <RotateCcw className="w-4 h-4 text-red-400" />
                <span>{lang === 'vi' ? 'Chơi mới (Xóa lưu thành phố này)' : 'Reset & Start New Game'}</span>
              </button>

              {/* High Score & Auto-save status footer */}
              {highScore && highScore.bestPassengers > 0 && (
                <div className={`mt-2 pt-2 border-t px-2 text-[10px] flex items-center justify-between opacity-70 ${
                  isDark ? 'border-slate-800 text-slate-400' : 'border-neutral-200 text-slate-500'
                }`}>
                  <span className="flex items-center gap-1 font-semibold">
                    <Trophy className="w-3 h-3 text-amber-400" />
                    {lang === 'vi' ? `Kỷ lục: ${highScore.bestPassengers} khách` : `Record: ${highScore.bestPassengers} pass.`}
                  </span>
                  <span className="text-emerald-400 flex items-center gap-1">
                    <Check className="w-3 h-3" />
                    {lang === 'vi' ? 'Tự động lưu' : 'Auto-saved'}
                  </span>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </header>
  );
};
