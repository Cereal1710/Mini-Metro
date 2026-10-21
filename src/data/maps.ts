import { CityMapConfig } from '../types/game';

export const CITY_MAPS: CityMapConfig[] = [
  {
    id: 'hanoi',
    nameVi: 'Hà Nội',
    nameEn: 'Hanoi',
    descriptionVi: 'Mạng lưới qua Sông Hồng và quanh Hồ Tây. Thử thách cầu vượt sông giữa phố cổ và Gia Lâm.',
    descriptionEn: 'Network across the Red River and around West Lake. Bridge challenges connecting Old Quarter and Long Bien.',
    riverPolygons: [
      // Sông Hồng (Winding river - generously scaled)
      {
        points: [
          { x: 100, y: 0 },
          { x: 220, y: 200 },
          { x: 500, y: 380 },
          { x: 820, y: 520 },
          { x: 1150, y: 720 },
          { x: 1380, y: 980 },
          { x: 1440, y: 1200 },
          // river width boundary
          { x: 1540, y: 1200 },
          { x: 1470, y: 940 },
          { x: 1250, y: 670 },
          { x: 910, y: 470 },
          { x: 580, y: 330 },
          { x: 290, y: 160 },
          { x: 160, y: 0 },
        ]
      },
      // Hồ Tây (West Lake water body)
      {
        isWaterBody: true,
        points: [
          { x: 420, y: 120 },
          { x: 580, y: 130 },
          { x: 650, y: 240 },
          { x: 590, y: 340 },
          { x: 470, y: 350 },
          { x: 390, y: 260 },
          { x: 380, y: 170 },
        ]
      }
    ],
    // Initial stations are spaced far apart (~350px-450px)
    initialStations: [
      { id: 'hn-1', shape: 'circle', x: 520, y: 520, name: 'Hoàn Kiếm' },
      { id: 'hn-2', shape: 'triangle', x: 280, y: 560, name: 'Cầu Giấy' },
      { id: 'hn-3', shape: 'square', x: 950, y: 360, name: 'Long Biên' },
    ],
    stationPool: [
      { shape: 'circle', x: 640, y: 660, name: 'Hai Bà Trưng' },
      { shape: 'triangle', x: 340, y: 380, name: 'Tây Hồ' },
      { shape: 'diamond', x: 1100, y: 270, name: 'Gia Lâm' },
      { shape: 'square', x: 440, y: 720, name: 'Đống Đa' },
      { shape: 'cross', x: 740, y: 820, name: 'Hoàng Mai' },
      { shape: 'star', x: 180, y: 740, name: 'Nam Từ Liêm' },
      { shape: 'circle', x: 520, y: 370, name: 'Ba Đình' },
      { shape: 'triangle', x: 1040, y: 580, name: 'Bồ Đề' },
      { shape: 'diamond', x: 1260, y: 800, name: 'Bát Tràng' },
      { shape: 'pentagon', x: 160, y: 490, name: 'Bắc Từ Liêm' },
      { shape: 'square', x: 760, y: 340, name: 'Yên Phụ' },
      { shape: 'circle', x: 360, y: 890, name: 'Thanh Xuân' },
      { shape: 'triangle', x: 860, y: 710, name: 'Vĩnh Tuy' },
      { shape: 'star', x: 660, y: 180, name: 'Nhật Tân' },
      { shape: 'circle', x: 1220, y: 490, name: 'Sài Đồng' },
    ]
  },
  {
    id: 'saigon',
    nameVi: 'TP. Hồ Chí Minh',
    nameEn: 'Ho Chi Minh City',
    descriptionVi: 'Mạng lưới quanh Bán đảo Thủ Thiêm và uốn lượn theo dòng Sông Sài Gòn sôi động.',
    descriptionEn: 'Network embracing Thu Thiem Peninsula and the dynamic loops of Saigon River.',
    riverPolygons: [
      // Sông Sài Gòn generous sweeping loops
      {
        points: [
          { x: 590, y: 0 },
          { x: 650, y: 180 },
          { x: 500, y: 310 },
          { x: 630, y: 490 },
          { x: 910, y: 550 },
          { x: 1010, y: 740 },
          { x: 870, y: 920 },
          { x: 680, y: 990 },
          { x: 710, y: 1200 },
          // other side
          { x: 810, y: 1200 },
          { x: 780, y: 1030 },
          { x: 970, y: 950 },
          { x: 1110, y: 740 },
          { x: 990, y: 480 },
          { x: 710, y: 420 },
          { x: 610, y: 290 },
          { x: 740, y: 170 },
          { x: 670, y: 0 },
        ]
      }
    ],
    // Initial stations with generous spacing
    initialStations: [
      { id: 'sg-1', shape: 'circle', x: 490, y: 650, name: 'Bến Thành' },
      { id: 'sg-2', shape: 'triangle', x: 710, y: 630, name: 'Ba Son' },
      { id: 'sg-3', shape: 'square', x: 960, y: 680, name: 'Thủ Thiêm' },
    ],
    stationPool: [
      { shape: 'diamond', x: 1140, y: 510, name: 'Thảo Điền' },
      { shape: 'circle', x: 360, y: 550, name: 'Phú Nhuận' },
      { shape: 'square', x: 280, y: 720, name: 'Quận 10' },
      { shape: 'triangle', x: 480, y: 850, name: 'Quận 4' },
      { shape: 'star', x: 810, y: 810, name: 'Cầu Ba Son' },
      { shape: 'circle', x: 1170, y: 860, name: 'An Khánh' },
      { shape: 'cross', x: 220, y: 450, name: 'Tân Bình' },
      { shape: 'triangle', x: 430, y: 400, name: 'Bình Thạnh' },
      { shape: 'diamond', x: 640, y: 1060, name: 'Quận 7' },
      { shape: 'square', x: 1280, y: 650, name: 'An Phú' },
      { shape: 'pentagon', x: 940, y: 340, name: 'Bình An' },
      { shape: 'circle', x: 190, y: 650, name: 'Quận 3' },
      { shape: 'star', x: 590, y: 890, name: 'Khánh Hội' },
      { shape: 'triangle', x: 1360, y: 450, name: 'Rạch Chiếc' },
      { shape: 'circle', x: 820, y: 1120, name: 'Phú Mỹ Hưng' },
    ]
  },
  {
    id: 'tokyo',
    nameVi: 'Tokyo',
    nameEn: 'Tokyo',
    descriptionVi: 'Đô thị đông đúc nhất thế giới. Dòng khách khổng lồ qua Shinjuku, Shibuya và Vịnh Tokyo.',
    descriptionEn: 'The world’s busiest metropolis. Huge commuter tides through Shinjuku, Shibuya, and Tokyo Bay.',
    riverPolygons: [
      // Tokyo Bay water body
      {
        isWaterBody: true,
        points: [
          { x: 890, y: 800 },
          { x: 1050, y: 680 },
          { x: 1310, y: 710 },
          { x: 1540, y: 800 },
          { x: 1540, y: 1200 },
          { x: 740, y: 1200 },
          { x: 770, y: 990 },
        ]
      },
      // Sumida River
      {
        points: [
          { x: 960, y: 0 },
          { x: 930, y: 230 },
          { x: 990, y: 430 },
          { x: 1070, y: 650 },
          { x: 1130, y: 630 },
          { x: 1050, y: 410 },
          { x: 1010, y: 220 },
          { x: 1020, y: 0 },
        ]
      }
    ],
    initialStations: [
      { id: 'ty-1', shape: 'circle', x: 400, y: 540, name: 'Shinjuku' },
      { id: 'ty-2', shape: 'triangle', x: 430, y: 730, name: 'Shibuya' },
      { id: 'ty-3', shape: 'square', x: 800, y: 560, name: 'Tokyo Central' },
    ],
    stationPool: [
      { shape: 'circle', x: 710, y: 710, name: 'Ginza' },
      { shape: 'diamond', x: 820, y: 370, name: 'Akihabara' },
      { shape: 'star', x: 790, y: 230, name: 'Ueno' },
      { shape: 'triangle', x: 590, y: 830, name: 'Roppongi' },
      { shape: 'square', x: 1080, y: 320, name: 'Asakusa' },
      { shape: 'circle', x: 590, y: 420, name: 'Ikebukuro' },
      { shape: 'cross', x: 1020, y: 860, name: 'Odaiba' },
      { shape: 'pentagon', x: 660, y: 990, name: 'Shinagawa' },
      { shape: 'diamond', x: 1160, y: 490, name: 'Ryogoku' },
      { shape: 'circle', x: 910, y: 740, name: 'Tsukiji' },
      { shape: 'triangle', x: 1250, y: 800, name: 'Toyosu' },
      { shape: 'square', x: 310, y: 340, name: 'Nakano' },
      { shape: 'star', x: 1200, y: 250, name: 'Oshiage (Skytree)' },
    ]
  }
];

export const LINE_PALETTE = [
  { color: '#EF4444', darkColor: '#B91C1C', textColor: '#FFFFFF', name: 'Tuyến Đỏ / Red Line' },
  { color: '#3B82F6', darkColor: '#1D4ED8', textColor: '#FFFFFF', name: 'Tuyến Lam / Blue Line' },
  { color: '#10B981', darkColor: '#047857', textColor: '#FFFFFF', name: 'Tuyến Lục / Green Line' },
  { color: '#F59E0B', darkColor: '#B45309', textColor: '#FFFFFF', name: 'Tuyến Vàng / Yellow Line' },
  { color: '#8B5CF6', darkColor: '#6D28D9', textColor: '#FFFFFF', name: 'Tuyến Tím / Purple Line' },
  { color: '#EC4899', darkColor: '#BE185D', textColor: '#FFFFFF', name: 'Tuyến Hồng / Pink Line' },
  { color: '#06B6D4', darkColor: '#0E7490', textColor: '#FFFFFF', name: 'Tuyến Lơ / Cyan Line' },
];
