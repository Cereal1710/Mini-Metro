import React from 'react';
import { X, Train, Layers, Plus, Star, DollarSign, Check, ShoppingBag, ArrowRight } from 'lucide-react';
import { GameInventory } from '../types/game';
import { formatMoney } from '../utils/geometry';

interface ShopModalProps {
  money: number;
  inventory: GameInventory;
  activeLinesCount: number;
  totalTrainsCount: number;
  theme: 'dark' | 'light';
  lang: 'vi' | 'en';
  onClose: () => void;
  onBuyTrain: () => void;
  onBuyCarriage: () => void;
  onBuyLine: () => void;
  onBuyInterchange: () => void;
}

export const ShopModal: React.FC<ShopModalProps> = ({
  money,
  inventory,
  activeLinesCount,
  totalTrainsCount,
  theme,
  lang,
  onClose,
  onBuyTrain,
  onBuyCarriage,
  onBuyLine,
  onBuyInterchange
}) => {
  const isDark = theme === 'dark';

  const trainCost = 400 + totalTrainsCount * 100;
  const carriageCost = 250;
  const lineCost = 600 + activeLinesCount * 200;
  const interchangeCost = 350;

  const items = [
    {
      titleVi: 'Đoàn Tàu Mới',
      titleEn: 'New Metro Train',
      descVi: 'Bổ sung 1 đoàn tàu vào kho dự phòng để điều phối lên các tuyến bận rộn.',
      descEn: 'Add 1 train to your depot to deploy onto crowded lines.',
      cost: trainCost,
      icon: <Train className="w-5 h-5 text-purple-400" />,
      canBuy: money >= trainCost,
      action: onBuyTrain,
      currentCount: inventory.unassignedTrains,
      countLabelVi: 'Chưa bố trí',
      countLabelEn: 'Depot'
    },
    {
      titleVi: 'Toa Chở Khách Phụ',
      titleEn: 'Carriage Extension',
      descVi: 'Gắn thêm toa vào đoàn tàu hiện có (+4 sức chứa khách mỗi toa).',
      descEn: 'Attach extra carriage to an active train (+4 passenger capacity).',
      cost: carriageCost,
      icon: <Layers className="w-5 h-5 text-blue-400" />,
      canBuy: money >= carriageCost,
      action: onBuyCarriage,
      currentCount: inventory.carriages,
      countLabelVi: 'Có sẵn',
      countLabelEn: 'Available'
    },
    {
      titleVi: 'Hạn Mức Tuyến Đường',
      titleEn: 'New Metro Line Slot',
      descVi: 'Mở khóa thêm 1 tuyến tàu mới trong thành phố (tối đa 7 tuyến).',
      descEn: 'Unlock 1 additional line slot across the city (max 7 lines).',
      cost: lineCost,
      icon: <Plus className="w-5 h-5 text-emerald-400" />,
      canBuy: money >= lineCost && inventory.availableLines < 7,
      action: onBuyLine,
      currentCount: `${activeLinesCount}/${inventory.availableLines}`,
      countLabelVi: 'Đang dùng',
      countLabelEn: 'Active'
    }
  ];

  return (
    <div className="fixed inset-0 bg-black/65 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-in fade-in duration-200">
      <div className={`w-full max-w-xl max-h-[90dvh] overflow-y-auto rounded-2xl p-4 sm:p-6 md:p-7 border shadow-2xl relative ${
        isDark ? 'bg-neutral-900 border-neutral-800 text-neutral-100' : 'bg-white border-neutral-200 text-neutral-900'
      }`}>
        {/* Close Button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-1.5 rounded-lg opacity-60 hover:opacity-100 hover:bg-neutral-500/20 transition"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Header */}
        <div className="flex items-center justify-between mb-6 pb-4 border-b border-neutral-800/40">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-500/10 text-emerald-500 flex items-center justify-center font-bold">
              <ShoppingBag className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold">
                {lang === 'vi' ? 'Cửa Hàng Thiết Bị Giao Thông' : 'Transit Equipment Depot'}
              </h2>
              <p className="text-xs opacity-60">
                {lang === 'vi' ? 'Đầu tư tiền vé vào trang bị để nâng cấp năng lực vận tải' : 'Reinvest passenger fares to expand transport capacity'}
              </p>
            </div>
          </div>

          <div className="text-right">
            <div className="text-[10px] font-semibold uppercase opacity-60">
              {lang === 'vi' ? 'Số dư hiện tại' : 'Current Balance'}
            </div>
            <div className="font-mono font-bold text-lg text-emerald-500">
              {formatMoney(money)}
            </div>
          </div>
        </div>

        {/* Items List */}
        <div className="space-y-3 mb-6">
          {items.map((item, idx) => (
            <div
              key={idx}
              className={`p-3.5 rounded-xl border flex items-center justify-between gap-4 transition ${
                isDark ? 'bg-neutral-800/50 border-neutral-700/80' : 'bg-neutral-50 border-neutral-200'
              }`}
            >
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-xl bg-neutral-700/30">
                  {item.icon}
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-sm font-bold">
                      {lang === 'vi' ? item.titleVi : item.titleEn}
                    </h3>
                    <span className="text-[10px] font-medium px-2 py-0.5 rounded bg-neutral-700/40 opacity-70">
                      {item.countLabelVi}: {item.currentCount}
                    </span>
                  </div>
                  <p className="text-xs opacity-60 mt-0.5 max-w-sm">
                    {lang === 'vi' ? item.descVi : item.descEn}
                  </p>
                </div>
              </div>

              {/* Price & Buy Button */}
              <button
                onClick={item.action}
                disabled={!item.canBuy}
                className={`px-4 py-2 rounded-xl text-xs font-bold transition flex items-center gap-1.5 whitespace-nowrap shadow-sm ${
                  item.canBuy
                    ? 'bg-emerald-600 hover:bg-emerald-500 text-white cursor-pointer active:scale-95'
                    : 'bg-neutral-700/40 text-neutral-400 cursor-not-allowed opacity-50'
                }`}
              >
                <span>{formatMoney(item.cost)}</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
        </div>

        {/* Footer tip */}
        <div className="text-[11px] opacity-60 text-center">
          {lang === 'vi'
            ? 'Mẹo: Giá tàu tăng dần theo quy mô hạm đội; hãy tối ưu hướng tuyến trước khi mua thêm.'
            : 'Tip: Fleet costs increase with size; streamline routes before adding trains.'}
        </div>
      </div>
    </div>
  );
};
