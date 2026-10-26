import React from 'react';
import { AlertOctagon, RotateCcw, Award, Users, Calendar, DollarSign, Shuffle } from 'lucide-react';
import { GameStats } from '../types/game';
import { formatMoney } from '../utils/geometry';

interface GameOverModalProps {
  reason: string | null;
  stats: GameStats;
  theme: 'dark' | 'light';
  lang: 'vi' | 'en';
  onRestart: () => void;
  onSwitchToZen: () => void;
}

export const GameOverModal: React.FC<GameOverModalProps> = ({
  reason,
  stats,
  theme,
  lang,
  onRestart,
  onSwitchToZen
}) => {
  const isDark = theme === 'dark';

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-md flex items-center justify-center p-4 z-50 animate-in fade-in zoom-in-95 duration-200">
      <div className={`w-full max-w-lg max-h-[90dvh] overflow-y-auto rounded-2xl p-5 sm:p-6 md:p-8 border shadow-2xl relative text-center ${
        isDark ? 'bg-neutral-900 border-neutral-800 text-neutral-100' : 'bg-white border-neutral-200 text-neutral-900'
      }`}>
        {/* Red Alert Icon */}
        <div className="w-16 h-16 rounded-2xl bg-red-500/20 text-red-500 flex items-center justify-center mx-auto mb-4 shadow-lg">
          <AlertOctagon className="w-9 h-9" />
        </div>

        <span className="text-xs font-bold tracking-widest text-red-400 uppercase">
          {lang === 'vi' ? 'HỆ THỐNG ĐÃ NGỪNG HOẠT ĐỘNG' : 'NETWORK SHUT DOWN'}
        </span>
        <h2 className="text-2xl font-black mt-1">
          {lang === 'vi' ? 'Mạng Lưới Quá Tải' : 'Overcrowding Gridlock'}
        </h2>
        <p className="text-xs md:text-sm text-red-400/90 mt-2 font-medium">
          {reason || (lang === 'vi' ? 'Nhà ga bị quá tải hành khách quá lâu mà không có giải pháp giải tỏa.' : 'Station remained overcrowded too long without transit relief.')}
        </p>

        {/* Performance Statistics Grid */}
        <div className="grid grid-cols-3 gap-3 my-6">
          {/* Passengers */}
          <div className={`p-3 rounded-xl border ${
            isDark ? 'bg-neutral-800/60 border-neutral-700' : 'bg-neutral-100 border-neutral-200'
          }`}>
            <div className="flex items-center justify-center mb-1 text-blue-400">
              <Users className="w-4 h-4" />
            </div>
            <div className="font-mono font-bold text-lg leading-none">
              {stats.totalPassengersDelivered}
            </div>
            <div className="text-[10px] uppercase font-semibold opacity-60 mt-1">
              {lang === 'vi' ? 'Khách phục vụ' : 'Passengers'}
            </div>
          </div>

          {/* Days */}
          <div className={`p-3 rounded-xl border ${
            isDark ? 'bg-neutral-800/60 border-neutral-700' : 'bg-neutral-100 border-neutral-200'
          }`}>
            <div className="flex items-center justify-center mb-1 text-amber-400">
              <Calendar className="w-4 h-4" />
            </div>
            <div className="font-mono font-bold text-lg leading-none">
              {stats.totalDays}
            </div>
            <div className="text-[10px] uppercase font-semibold opacity-60 mt-1">
              {lang === 'vi' ? 'Ngày vận hành' : 'Days active'}
            </div>
          </div>

          {/* Money Earned */}
          <div className={`p-3 rounded-xl border ${
            isDark ? 'bg-neutral-800/60 border-neutral-700' : 'bg-neutral-100 border-neutral-200'
          }`}>
            <div className="flex items-center justify-center mb-1 text-emerald-400">
              <DollarSign className="w-4 h-4" />
            </div>
            <div className="font-mono font-bold text-lg leading-none text-emerald-500">
              {formatMoney(stats.moneyEarned)}
            </div>
            <div className="text-[10px] uppercase font-semibold opacity-60 mt-1">
              {lang === 'vi' ? 'Tổng doanh thu' : 'Total Revenue'}
            </div>
          </div>
        </div>

        {/* Buttons */}
        <div className="flex flex-col sm:flex-row gap-3">
          <button
            onClick={onRestart}
            className="flex-1 py-3 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-sm shadow transition flex items-center justify-center gap-2 cursor-pointer active:scale-95"
          >
            <RotateCcw className="w-4 h-4" />
            <span>{lang === 'vi' ? 'Chơi lại' : 'Play Again'}</span>
          </button>

          <button
            onClick={onSwitchToZen}
            className={`flex-1 py-3 px-4 rounded-xl font-bold text-sm border transition flex items-center justify-center gap-2 cursor-pointer ${
              isDark ? 'bg-neutral-800 hover:bg-neutral-700 border-neutral-700 text-neutral-200' : 'bg-neutral-100 hover:bg-neutral-200 border-neutral-300 text-neutral-800'
            }`}
          >
            <span>{lang === 'vi' ? 'Chế độ Thư giãn (Không thua)' : 'Switch to Zen Mode'}</span>
          </button>
        </div>
      </div>
    </div>
  );
};
