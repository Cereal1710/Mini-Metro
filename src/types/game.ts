export type StationShape = 'circle' | 'triangle' | 'square' | 'star' | 'diamond' | 'cross' | 'pentagon';

export interface Passenger {
  id: string;
  targetShape: StationShape;
  spawnTime: number;
  stationId: string;
}

export interface Station {
  id: string;
  name: string;
  shape: StationShape;
  x: number;
  y: number;
  passengers: Passenger[];
  maxCapacity: number;
  isInterchange: boolean;
  overcrowdedTimer: number; // 0 to 1
  isOvercrowded: boolean;
  spawnTime: number;
  pulseTimer?: number;
}

export interface LineSegment {
  fromId: string;
  toId: string;
  crossesRiver: boolean;
}

export interface MetroLine {
  id: string;
  name: string;
  color: string;
  textColor: string;
  darkColor: string;
  stationIds: string[];
  isLoop: boolean;
}

export interface Train {
  id: string;
  lineId: string;
  carriagesCount: number; // 0, 1, 2
  capacity: number; // base 6 + 4 per carriage
  speed: number; // base speed
  segmentIndex: number;
  progress: number; // 0 to 1
  direction: 1 | -1;
  passengers: Passenger[];
  dwellingTime: number; // seconds at station
  currentStationId?: string;
}

export interface FloatingText {
  id: string;
  x: number;
  y: number;
  text: string;
  color: string;
  life: number; // 1 to 0
}

export interface RiverPolygon {
  points: { x: number; y: number }[];
  isWaterBody?: boolean;
}

export interface CityMapConfig {
  id: string;
  nameVi: string;
  nameEn: string;
  descriptionVi: string;
  descriptionEn: string;
  initialStations: { id?: string; shape: StationShape; x: number; y: number; name: string }[];
  riverPolygons: RiverPolygon[];
  stationPool: { shape: StationShape; x: number; y: number; name: string }[];
}

export type GameMode = 'standard' | 'zen' | 'rush_hour';

export interface GameInventory {
  availableLines: number;
  unassignedTrains: number;
  carriages: number;
  interchangeTokens: number;
  tunnelTokens: number;
}

export interface WeeklyChoiceOption {
  id: string;
  titleVi: string;
  titleEn: string;
  descVi: string;
  descEn: string;
  icon: string;
  apply: (inv: GameInventory) => GameInventory;
}

export interface GameStats {
  totalPassengersDelivered: number;
  totalDays: number;
  totalWeeks: number;
  moneyEarned: number;
  peakLinesUsed: number;
  peakTrainsUsed: number;
  crowdedWarningsAvoided: number;
}
