import React, { useState } from 'react';
import {
  Play,
  User,
  AlertTriangle,
  Cloud,
  CheckCircle2,
  Sparkles,
  MapPin,
  Trophy,
  HelpCircle,
  LogOut,
  Train,
  Target,
  Compass,
  ArrowRight,
  ShieldAlert,
  Flame,
  DollarSign
} from 'lucide-react';
import { CityMapConfig } from '../types/game';
import { UserProfile } from '../services/firebase';
import { CAMPAIGN_SCENARIOS } from '../data/campaignScenarios';

interface StartMenuModalProps {
  isOpen: boolean;
  onPlay: () => void;
  onSelectScenario: (scenarioId: string) => void;
  onOpenAuth: () => void;
  onOpenTutorial: () => void;
  currentUser: UserProfile | null;
  onLogout: () => void;
  cityMaps: CityMapConfig[];
  currentCityId: string;
  onSelectCity: (cityId: string) => void;
  highScore: { bestPassengers: number; bestDays: number };
  lang: 'vi' | 'en';
}

export const StartMenuModal: React.FC<StartMenuModalProps> = ({
  isOpen,
  onPlay,
  onSelectScenario,
  onOpenAuth,
  onOpenTutorial,
  currentUser,
  onLogout,
  cityMaps,
  currentCityId,
  onSelectCity,
  highScore,
  lang
}) => {
  const [activeTab, setActiveTab] = useState<'quick' | 'campaign'>('quick');

  if (!isOpen) return null;

  const currentCity = cityMaps.find(c => c.id === currentCityId) || cityMaps[0];
  const cityName = lang === 'vi' ? currentCity.nameVi : currentCity.nameEn;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/85 backdrop-blur-xl animate-in fade-in duration-200 select-none overflow-y-auto">
      <div
        className="w-full max-w-xl bg-slate-900/95 border border-slate-700/80 rounded-3xl shadow-2xl p-6 sm:p-7 text-slate-100 relative overflow-hidden my-auto"
        role="dialog"
      >
        {/* Ambient Glows */}
        <div className="absolute -top-24 -left-24 w-60 h-60 bg-emerald-500/15 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute -bottom-24 -right-24 w-60 h-60 bg-cyan-500/15 rounded-full blur-3xl pointer-events-none" />

        {/* Brand / Title Header */}
        <div className="text-center mb-5 relative">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-semibold mb-2">
            <Train className="w-3.5 h-3.5 text-emerald-400" />
            <span>Mini Metro Simulator • Bản đồ Chi tiết</span>
          </div>

          <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-white flex items-center justify-center gap-2">
            <span>HANOI METRO</span>
            <span className="text-emerald-400 text-lg font-mono font-bold px-2 py-0.5 rounded-lg bg-emerald-500/10 border border-emerald-500/20">
              PRO
            </span>
          </h1>

          <p className="text-xs text-slate-400 mt-1">
            {lang === 'vi'
              ? 'Mô phỏng quy hoạch & vận hành mạng lưới đường sắt đô thị thông minh'
              : 'Urban Transit Network Simulation & Fleet Management'}
          </p>
        </div>

        {/* Mode Switcher Tabs */}
        <div className="flex items-center gap-2 p-1 rounded-2xl bg-slate-950/80 border border-slate-800 mb-5">
          <button
            onClick={() => setActiveTab('quick')}
            className={`flex-1 py-2 px-3 rounded-xl text-xs font-bold transition cursor-pointer flex items-center justify-center gap-2 ${
              activeTab === 'quick'
                ? 'bg-linear-to-r from-emerald-600 to-teal-600 text-white shadow-md'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Compass className="w-4 h-4" />
            <span>{lang === 'vi' ? '1. Vận Hành Tự Do' : '1. Sandbox Transit'}</span>
          </button>

          <button
            onClick={() => setActiveTab('campaign')}
            className={`flex-1 py-2 px-3 rounded-xl text-xs font-bold transition cursor-pointer flex items-center justify-center gap-2 ${
              activeTab === 'campaign'
                ? 'bg-linear-to-r from-amber-600 to-orange-600 text-white shadow-md'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Target className="w-4 h-4" />
            <span>{lang === 'vi' ? '2. Chiến Dịch & Kịch Bản' : '2. Campaign Scenarios'}</span>
            <span className="text-[9px] px-1.5 py-0.2 rounded-full bg-amber-400/20 text-amber-300 font-mono">
              NEW
            </span>
          </button>
        </div>

        {/* TAB 1: QUICK PLAY & FREE NETWORK */}
        {activeTab === 'quick' && (
          <div className="space-y-4 animate-in fade-in duration-150">
            {/* Map & High Score Header */}
            <div className="p-3.5 rounded-2xl bg-slate-950/70 border border-slate-800 flex items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-slate-800 text-amber-400 border border-slate-700 flex items-center justify-center shrink-0">
                  <MapPin className="w-5 h-5 text-amber-400" />
                </div>
                <div>
                  <div className="text-[10px] uppercase tracking-wider text-slate-400 font-bold">
                    {lang === 'vi' ? 'Thành phố đang chọn' : 'Selected Map'}
                  </div>
                  <div className="text-sm font-bold text-white flex items-center gap-2">
                    <span>{cityName}</span>
                    <span className="text-[10px] font-mono text-cyan-400 bg-cyan-500/15 px-1.5 py-0.5 rounded border border-cyan-500/20">
                      {currentCity.worldWidth}x{currentCity.worldHeight}
                    </span>
                  </div>
                </div>
              </div>

              {highScore.bestPassengers > 0 && (
                <div className="text-right shrink-0">
                  <div className="flex items-center gap-1 justify-end text-[10px] text-amber-400 font-bold">
                    <Trophy className="w-3 h-3 text-amber-400" />
                    <span>{lang === 'vi' ? 'Kỷ lục' : 'Record'}</span>
                  </div>
                  <div className="text-xs font-mono font-bold text-white">
                    {highScore.bestPassengers.toLocaleString()} {lang === 'vi' ? 'khách' : 'pax'}
                  </div>
                </div>
              )}
            </div>

            {/* Primary Start / Play Button */}
            <button
              onClick={onPlay}
              className="w-full py-4 px-6 rounded-2xl bg-linear-to-r from-emerald-600 via-teal-600 to-emerald-500 hover:from-emerald-500 hover:to-teal-400 text-white font-black text-sm shadow-xl shadow-emerald-950/50 hover:shadow-emerald-500/20 transition-all cursor-pointer flex items-center justify-center gap-2.5 active:scale-98 group"
            >
              <Play className="w-5 h-5 fill-current transition-transform group-hover:scale-110" />
              <span>{lang === 'vi' ? 'Bắt Đầu Vận Hành Mạng Lưới' : 'Start Transit Network'}</span>
            </button>
          </div>
        )}

        {/* TAB 2: CAMPAIGN SCENARIOS WITH WIN/LOSS CONDITIONS */}
        {activeTab === 'campaign' && (
          <div className="space-y-3 animate-in fade-in duration-150">
            <div className="text-xs text-amber-300/90 flex items-center gap-1.5 font-semibold bg-amber-500/10 p-2.5 rounded-xl border border-amber-500/20">
              <Target className="w-4 h-4 text-amber-400 shrink-0" />
              <span>
                {lang === 'vi'
                  ? 'Chọn kịch bản để bắt đầu thử thách với điều kiện Thắng/Thua cụ thể!'
                  : 'Select a scenario to take on timed objectives with clear win/loss conditions!'}
              </span>
            </div>

            <div className="space-y-2.5 max-h-75 overflow-y-auto pr-1">
              {CAMPAIGN_SCENARIOS.map((sc) => (
                <div
                  key={sc.id}
                  onClick={() => onSelectScenario(sc.id)}
                  className="p-3.5 rounded-2xl bg-slate-950/70 border border-slate-800 hover:border-amber-500/60 transition cursor-pointer group hover:bg-slate-950/90"
                >
                  <div className="flex items-start justify-between gap-3 mb-1.5">
                    <div>
                      <div className="text-xs font-black text-white group-hover:text-amber-400 transition flex items-center gap-1.5">
                        {sc.id === 'typhoon_yagi' && <ShieldAlert className="w-3.5 h-3.5 text-cyan-400" />}
                        {sc.id === 'stadium_rush' && <Flame className="w-3.5 h-3.5 text-orange-400" />}
                        {sc.id === 'budget_master' && <DollarSign className="w-3.5 h-3.5 text-emerald-400" />}
                        <span>{lang === 'vi' ? sc.titleVi : sc.titleEn}</span>
                      </div>
                      <div className="text-[11px] text-amber-400/90 font-medium">
                        {lang === 'vi' ? sc.subtitleVi : sc.subtitleEn}
                      </div>
                    </div>

                    <div className="shrink-0 text-right">
                      <span className="text-[10px] font-mono px-2 py-0.5 rounded-md bg-amber-500/20 text-amber-300 font-bold border border-amber-500/30">
                        {lang === 'vi' ? `Mục tiêu: ${sc.targetPassengers} khách` : `Target: ${sc.targetPassengers} pax`}
                      </span>
                    </div>
                  </div>

                  <p className="text-[11px] text-slate-400 line-clamp-2 leading-relaxed mb-2">
                    {lang === 'vi' ? sc.descriptionVi : sc.descriptionEn}
                  </p>

                  <div className="flex items-center justify-between text-[10px] text-slate-500 pt-1.5 border-t border-slate-800/80">
                    <span>
                      {lang === 'vi' ? `⏱️ Hạn chót: ${sc.timeLimitDays} Ngày` : `⏱️ Limit: ${sc.timeLimitDays} Days`}
                    </span>
                    <span className="text-amber-400 font-bold group-hover:translate-x-1 transition flex items-center gap-1">
                      <span>{lang === 'vi' ? 'Bắt đầu ngay' : 'Start'}</span>
                      <ArrowRight className="w-3 h-3" />
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* User Account Bar & Tutorial Footer */}
        <div className="mt-5 pt-3.5 border-t border-slate-800/80 space-y-3">
          {currentUser ? (
            <div className="flex items-center justify-between text-xs text-slate-400">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                <span className="text-white font-bold">{currentUser.username}</span>
                <span className="text-[10px] font-mono px-1.5 rounded bg-emerald-500/20 text-emerald-400">
                  CLOUD
                </span>
              </div>
              <button
                onClick={onLogout}
                className="text-slate-400 hover:text-rose-400 transition cursor-pointer text-xs"
              >
                {lang === 'vi' ? 'Đăng xuất' : 'Logout'}
              </button>
            </div>
          ) : (
            <div className="flex items-center justify-between text-xs">
              <button
                onClick={onOpenAuth}
                className="text-cyan-400 hover:text-cyan-300 font-bold flex items-center gap-1 transition cursor-pointer"
              >
                <User className="w-3.5 h-3.5" />
                <span>{lang === 'vi' ? 'Đăng nhập / Đăng ký để lưu Cloud' : 'Sign in / Register for Cloud Save'}</span>
              </button>

              <button
                onClick={onOpenTutorial}
                className="text-slate-400 hover:text-white flex items-center gap-1 transition cursor-pointer"
              >
                <HelpCircle className="w-3.5 h-3.5" />
                <span>{lang === 'vi' ? 'Hướng dẫn' : 'How to Play'}</span>
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
