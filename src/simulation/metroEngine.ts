import {
  Station,
  MetroLine,
  Train,
  FloatingText,
  GameMode,
  GameInventory,
  GameStats,
  CityMapConfig,
  StationShape,
  Passenger
} from '../types/game';
import { distance, segmentCrossesRiver } from '../utils/geometry';
import { findNextTransitStep } from './pathfinding';
import { soundEngine } from '../audio/soundEngine';

export interface SimulationState {
  stations: Station[];
  lines: MetroLine[];
  trains: Train[];
  inventory: GameInventory;
  stats: GameStats;
  money: number;
  timeOfDayHours: number; // e.g. 6.0 to 24.0
  currentDayIndex: number; // 0 = Mon, 6 = Sun
  weekNumber: number;
  gameSpeed: number; // 0 = pause, 1, 2, 3
  isGameOver: boolean;
  gameOverReason: string | null;
  floatingTexts: FloatingText[];
  pendingWeeklyReward: boolean;
  gameMode: GameMode;
  isRushHour: boolean;
}

export const DAY_NAMES_VI = ['Thứ Hai', 'Thứ Ba', 'Thứ Tư', 'Thứ Năm', 'Thứ Sáu', 'Thứ Bảy', 'Chủ Nhật'];
export const DAY_NAMES_EN = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

export class MetroEngine {
  public state: SimulationState;
  public mapConfig: CityMapConfig;
  private stationPool: { shape: StationShape; x: number; y: number; name: string }[];
  private nextStationSpawnTime: number = 25; // seconds
  private lastWarningSoundTime: number = 0;
  private passengerIdCounter: number = 1;

  constructor(mapConfig: CityMapConfig, mode: GameMode = 'standard') {
    this.mapConfig = mapConfig;
    this.stationPool = [...mapConfig.stationPool];

    // Initialize stations
    const initialStations: Station[] = mapConfig.initialStations.map((s, idx) => ({
      id: s.id || `st-${idx + 1}`,
      name: s.name,
      shape: s.shape,
      x: s.x,
      y: s.y,
      passengers: [],
      maxCapacity: 6,
      isInterchange: false,
      overcrowdedTimer: 0,
      isOvercrowded: false,
      spawnTime: 0
    }));

    this.state = {
      stations: initialStations,
      lines: [],
      trains: [],
      inventory: {
        availableLines: 3,
        unassignedTrains: 2,
        carriages: 1,
        interchangeTokens: 1,
        tunnelTokens: 2
      },
      stats: {
        totalPassengersDelivered: 0,
        totalDays: 1,
        totalWeeks: 1,
        moneyEarned: 0,
        peakLinesUsed: 0,
        peakTrainsUsed: 0,
        crowdedWarningsAvoided: 0
      },
      money: 200000,
      timeOfDayHours: 7.0, // starts at 07:00 AM
      currentDayIndex: 0,
      weekNumber: 1,
      gameSpeed: 1,
      isGameOver: false,
      gameOverReason: null,
      floatingTexts: [],
      pendingWeeklyReward: false,
      gameMode: mode,
      isRushHour: false
    };
  }

  public setGameSpeed(speed: number) {
    this.state.gameSpeed = speed;
  }

  public setGameMode(mode: GameMode) {
    this.state.gameMode = mode;
  }

  /**
   * Main simulation step (delta time in seconds)
   */
  public update(dt: number) {
    if (this.state.isGameOver || this.state.gameSpeed === 0 || this.state.pendingWeeklyReward) {
      return;
    }

    const simDt = dt * this.state.gameSpeed;

    // 1. Advance Game Clock
    // 1 real second at 1x = 1 game minute (1/60 hour per second)
    const hoursPerSecond = 1 / 60;
    this.state.timeOfDayHours += hoursPerSecond * simDt;

    // Check Rush Hour
    const h = this.state.timeOfDayHours % 24;
    const isMorningRush = h >= 7.0 && h <= 9.5;
    const isEveningRush = h >= 17.0 && h <= 19.5;
    this.state.isRushHour = isMorningRush || isEveningRush;

    if (this.state.timeOfDayHours >= 24) {
      this.state.timeOfDayHours -= 24;
      this.state.currentDayIndex = (this.state.currentDayIndex + 1) % 7;
      this.state.stats.totalDays++;

      // Operating cost deduction at midnight ($20 per active train, $10 per line)
      const dailyCost = this.state.trains.length * 20 + this.state.lines.length * 10;
      this.state.money = Math.max(0, this.state.money - dailyCost);

      // Sunday midnight: trigger Weekly Upgrade Grant!
      if (this.state.currentDayIndex === 0) {
        this.state.weekNumber++;
        this.state.stats.totalWeeks++;
        this.state.pendingWeeklyReward = true;
        soundEngine.playFanfare();
        return;
      }
    }

    // 2. Station Spawning Progression
    this.nextStationSpawnTime -= simDt;
    if (this.nextStationSpawnTime <= 0 && this.stationPool.length > 0) {
      this.spawnNextStation();
      // Intervals grow slightly as network gets larger
      this.nextStationSpawnTime = 30 + this.state.stations.length * 4;
    }

    // 3. Passenger Spawning at Stations
    this.updatePassengerSpawns(simDt);

    // 4. Train Movement, Boarding & Alighting
    this.updateTrains(simDt);

    // 5. Station Overcrowding checks
    this.updateOvercrowding(simDt);

    // 6. Update floating texts
    this.updateFloatingTexts(simDt);
  }

  private spawnNextStation() {
    if (this.stationPool.length === 0) return;
    const nextData = this.stationPool.shift()!;
    const newStation: Station = {
      id: `st-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      name: nextData.name,
      shape: nextData.shape,
      x: nextData.x,
      y: nextData.y,
      passengers: [],
      maxCapacity: 6,
      isInterchange: false,
      overcrowdedTimer: 0,
      isOvercrowded: false,
      spawnTime: Date.now()
    };

    this.state.stations.push(newStation);
    soundEngine.playStationSpawn();

    this.addFloatingText(newStation.x, newStation.y - 15, `+ Ga ${newStation.name}`, '#10B981');
  }

  private updatePassengerSpawns(simDt: number) {
    // Collect all shapes that currently exist among all stations
    const existingShapes = Array.from(new Set(this.state.stations.map(s => s.shape)));
    if (existingShapes.length < 2) return;

    // Spawn rate multiplier: higher during rush hour
    const rushMultiplier = this.state.isRushHour ? 2.6 : 1.0;

    for (const station of this.state.stations) {
      // Chance per second to spawn a passenger at this station
      const spawnRate = (0.07 + Math.random() * 0.05) * rushMultiplier;
      if (Math.random() < spawnRate * simDt) {
        if (station.passengers.length < station.maxCapacity + 4) {
          // Choose a target shape distinct from current station shape
          const candidateShapes = existingShapes.filter(sh => sh !== station.shape);
          if (candidateShapes.length > 0) {
            // Circle/Triangle/Square have higher weight; Star/Diamond/Pentagon are rarer
            const weights: Record<StationShape, number> = {
              circle: 3,
              triangle: 3,
              square: 2,
              diamond: 1,
              star: 1,
              cross: 1,
              pentagon: 1
            };

            const shapePool: StationShape[] = [];
            candidateShapes.forEach(sh => {
              const w = weights[sh] || 1;
              for (let i = 0; i < w; i++) shapePool.push(sh);
            });

            const targetShape = shapePool[Math.floor(Math.random() * shapePool.length)];
            const passenger: Passenger = {
              id: `p-${this.passengerIdCounter++}`,
              targetShape,
              spawnTime: Date.now(),
              stationId: station.id
            };
            station.passengers.push(passenger);
          }
        }
      }
    }
  }

  private updateTrains(simDt: number) {
    const stationMap = new Map<string, Station>(this.state.stations.map(s => [s.id, s]));

    for (const train of this.state.trains) {
      const line = this.state.lines.find(l => l.id === train.lineId);
      if (!line || line.stationIds.length < 2) continue;

      const sIds = line.stationIds;
      const totalSegments = line.isLoop ? sIds.length : sIds.length - 1;
      if (totalSegments <= 0) continue;

      // If dwelling at station
      if (train.dwellingTime > 0) {
        train.dwellingTime -= simDt;
        continue;
      }

      // Calculate segment length for realistic travel speed
      const segIdx = Math.min(train.segmentIndex, totalSegments - 1);
      const uId = sIds[segIdx];
      const vId = line.isLoop && segIdx === sIds.length - 1 ? sIds[0] : sIds[segIdx + 1];

      const s1 = stationMap.get(uId);
      const s2 = stationMap.get(vId);
      if (!s1 || !s2) continue;

      const segDistance = Math.max(40, distance(s1, s2));
      // Base train moves ~75 pixels per second at 1x
      const speed = train.speed || 75;
      const stepProgress = (speed * simDt) / segDistance;

      train.progress += stepProgress;

      // Reached station!
      if (train.progress >= 1.0) {
        train.progress = 0;

        // Determine which station the train just arrived at
        let arrivedStationId: string;
        if (train.direction === 1) {
          arrivedStationId = vId;
          train.segmentIndex++;
        } else {
          arrivedStationId = uId;
          train.segmentIndex--;
        }

        const arrivedStation = stationMap.get(arrivedStationId);
        if (arrivedStation) {
          this.handleTrainArrivalAtStation(train, arrivedStation, line);
        }

        // Handle terminus turn-around or loop wrapping
        if (line.isLoop) {
          if (train.segmentIndex >= totalSegments) {
            train.segmentIndex = 0;
          } else if (train.segmentIndex < 0) {
            train.segmentIndex = totalSegments - 1;
          }
        } else {
          // Reached end of line -> turn around
          if (train.segmentIndex >= totalSegments) {
            train.segmentIndex = totalSegments - 1;
            train.direction = -1;
          } else if (train.segmentIndex < 0) {
            train.segmentIndex = 0;
            train.direction = 1;
          }
        }
      }
    }
  }

  private handleTrainArrivalAtStation(train: Train, station: Station, line: MetroLine) {
    // Train pauses at station
    train.dwellingTime = 0.8;
    train.currentStationId = station.id;

    let fareEarned = 0;
    let passengersDeliveredHere = 0;

    // Fast transit route cache for this station arrival (avoids duplicate BFS for same destination shape)
    const transitStepCache = new Map<StationShape, ReturnType<typeof findNextTransitStep>>();
    const getNextStep = (shape: StationShape) => {
      if (!transitStepCache.has(shape)) {
        transitStepCache.set(
          shape,
          findNextTransitStep(station.id, shape, this.state.stations, this.state.lines)
        );
      }
      return transitStepCache.get(shape)!;
    };

    // 1. Check Alighting passengers
    const remainingInTrain: Passenger[] = [];
    for (const p of train.passengers) {
      if (p.targetShape === station.shape) {
        // Successful destination reached!
        passengersDeliveredHere++;
        const fare = this.state.isRushHour ? 25 : 18;
        fareEarned += fare;
        this.state.stats.totalPassengersDelivered++;
        this.state.stats.moneyEarned += fare;
      } else {
        // Check if passenger should transfer at this station
        const nextStep = getNextStep(p.targetShape);
        if (nextStep && nextStep.lineId !== line.id) {
          // Passenger alights to transfer to another line here
          station.passengers.push(p);
          soundEngine.playBoard();
        } else {
          remainingInTrain.push(p);
        }
      }
    }

    train.passengers = remainingInTrain;

    if (passengersDeliveredHere > 0) {
      this.state.money += fareEarned;
      soundEngine.playArrive(passengersDeliveredHere);
      this.addFloatingText(station.x, station.y - 20, `+$${fareEarned}`, '#10B981');
    }

    // 2. Boarding passengers at station
    const availableSlots = train.capacity - train.passengers.length;
    if (availableSlots > 0 && station.passengers.length > 0) {
      const remainingAtStation: Passenger[] = [];
      let boardedCount = 0;

      for (const p of station.passengers) {
        if (boardedCount < availableSlots) {
          // Does this train/line lead closer to p.targetShape?
          const nextStep = getNextStep(p.targetShape);
          if (nextStep && nextStep.lineId === line.id) {
            train.passengers.push(p);
            boardedCount++;
            continue;
          }
        }
        remainingAtStation.push(p);
      }

      station.passengers = remainingAtStation;
      if (boardedCount > 0) {
        soundEngine.playBoard();
      }
    }
  }

  private updateOvercrowding(simDt: number) {
    let anyDangerouslyCrowded = false;

    for (const station of this.state.stations) {
      station.isOvercrowded = station.passengers.length >= station.maxCapacity;

      if (station.isOvercrowded) {
        // Timer fills up in ~22 seconds of overcrowding
        station.overcrowdedTimer = Math.min(1.0, station.overcrowdedTimer + simDt / 22);

        if (station.overcrowdedTimer >= 0.7) {
          anyDangerouslyCrowded = true;
        }

        // Standard mode game over
        if (this.state.gameMode === 'standard' && station.overcrowdedTimer >= 1.0) {
          this.triggerGameOver(`Ga "${station.name}" đã bị quá tải hành khách quá lâu!`);
          return;
        }
      } else {
        // Cools down when below capacity
        if (station.overcrowdedTimer > 0) {
          station.overcrowdedTimer = Math.max(0, station.overcrowdedTimer - simDt / 10);
        }
      }
    }

    // Play soft danger heartbeat if any station is > 70% overcrowded
    if (anyDangerouslyCrowded) {
      const now = Date.now();
      if (now - this.lastWarningSoundTime > 1200) {
        soundEngine.playWarning(0.8);
        this.lastWarningSoundTime = now;
      }
    }
  }

  private triggerGameOver(reason: string) {
    this.state.isGameOver = true;
    this.state.gameOverReason = reason;
    soundEngine.playGameOver();
  }

  public addFloatingText(x: number, y: number, text: string, color = '#10B981') {
    this.state.floatingTexts.push({
      id: `ft-${Date.now()}-${Math.random()}`,
      x,
      y,
      text,
      color,
      life: 1.0
    });
  }

  private updateFloatingTexts(simDt: number) {
    this.state.floatingTexts = this.state.floatingTexts
      .map(ft => ({
        ...ft,
        y: ft.y - 18 * simDt,
        life: ft.life - 1.2 * simDt
      }))
      .filter(ft => ft.life > 0);
  }

  // Route Management
  public createLine(name: string, color: string, darkColor: string, textColor: string): MetroLine | null {
    if (this.state.lines.length >= this.state.inventory.availableLines) {
      return null;
    }

    const newLine: MetroLine = {
      id: `line-${Date.now()}`,
      name,
      color,
      darkColor,
      textColor,
      stationIds: [],
      isLoop: false
    };

    this.state.lines.push(newLine);
    soundEngine.playConnect();
    return newLine;
  }

  public deleteLine(lineId: string) {
    // Remove trains on this line and return them to inventory
    const trainsOnLine = this.state.trains.filter(t => t.lineId === lineId);
    this.state.inventory.unassignedTrains += trainsOnLine.length;
    trainsOnLine.forEach(t => {
      this.state.inventory.carriages += t.carriagesCount;
    });

    this.state.trains = this.state.trains.filter(t => t.lineId !== lineId);
    this.state.lines = this.state.lines.filter(l => l.id !== lineId);
    soundEngine.playDisconnect();
  }

  public addStationToLine(lineId: string, stationId: string): boolean {
    const line = this.state.lines.find(l => l.id === lineId);
    if (!line) return false;

    // Check if station is already in line
    const existingIdx = line.stationIds.indexOf(stationId);
    if (existingIdx !== -1) {
      // If it is the first station and line has >= 3 stations, close loop!
      if (existingIdx === 0 && line.stationIds.length >= 3 && !line.isLoop) {
        line.isLoop = true;
        soundEngine.playConnect();
        return true;
      }
      return false;
    }

    line.stationIds.push(stationId);
    soundEngine.playConnect();

    // If this line has at least 2 stations and no train yet, deploy 1 train automatically if available
    const trainsOnLine = this.state.trains.filter(t => t.lineId === lineId);
    if (trainsOnLine.length === 0 && this.state.inventory.unassignedTrains > 0) {
      this.deployTrainToLine(lineId);
    }

    return true;
  }

  /**
   * Intelligently connects two stations:
   * - Extends from line start or end
   * - Closes loops if connecting start & end
   * - Or creates a new line if needed
   */
  public connectStations(fromId: string, toId: string, preferredLineId?: string | null): MetroLine | null {
    if (fromId === toId) return null;

    let targetLine: MetroLine | undefined;

    // 1. If preferredLineId is specified and not a closed loop, prioritize user's selected line!
    // Never hijack with another line when the user has already chosen a line!
    if (preferredLineId) {
      const pref = this.state.lines.find(l => l.id === preferredLineId);
      if (pref && !pref.isLoop) {
        targetLine = pref;
      }
    }

    // 2. Only if no preferred line, check if an existing line already has fromId or toId at either end to extend
    if (!targetLine) {
      targetLine = this.state.lines.find(l => {
        if (l.isLoop || l.stationIds.length === 0) return false;
        const first = l.stationIds[0];
        const last = l.stationIds[l.stationIds.length - 1];
        return first === fromId || last === fromId || first === toId || last === toId;
      });
    }

    // 3. If still no line, create a new line if under limit
    if (!targetLine) {
      if (this.state.lines.length < this.state.inventory.availableLines) {
        const nextIdx = this.state.lines.length;
        const pal = [
          { color: '#EF4444', darkColor: '#B91C1C', textColor: '#FFFFFF' },
          { color: '#3B82F6', darkColor: '#1D4ED8', textColor: '#FFFFFF' },
          { color: '#10B981', darkColor: '#047857', textColor: '#FFFFFF' },
          { color: '#F59E0B', darkColor: '#B45309', textColor: '#FFFFFF' },
          { color: '#8B5CF6', darkColor: '#6D28D9', textColor: '#FFFFFF' },
          { color: '#EC4899', darkColor: '#BE185D', textColor: '#FFFFFF' },
          { color: '#06B6D4', darkColor: '#0E7490', textColor: '#FFFFFF' },
        ][nextIdx % 7];

        targetLine = this.createLine(
          `Tuyến 0${nextIdx + 1}`,
          pal.color,
          pal.darkColor,
          pal.textColor
        ) || undefined;
      }
    }

    // 4. If all lines used, pick the last non-loop line
    if (!targetLine) {
      targetLine = this.state.lines.find(l => !l.isLoop) || this.state.lines[0];
    }

    if (!targetLine) return null;

    const sIds = targetLine.stationIds;

    // If target line is brand new / empty
    if (sIds.length === 0) {
      sIds.push(fromId, toId);
      soundEngine.playConnect();
      if (this.state.inventory.unassignedTrains > 0) {
        this.deployTrainToLine(targetLine.id);
      }
      return targetLine;
    }

    if (sIds.length === 1) {
      if (sIds[0] === fromId) {
        sIds.push(toId);
      } else if (sIds[0] === toId) {
        sIds.push(fromId);
      } else {
        sIds.push(toId);
      }
      soundEngine.playConnect();
      if (this.state.inventory.unassignedTrains > 0) {
        this.deployTrainToLine(targetLine.id);
      }
      return targetLine;
    }

    const first = sIds[0];
    const last = sIds[sIds.length - 1];

    // Check loop closing
    if ((fromId === first && toId === last) || (fromId === last && toId === first)) {
      if (sIds.length >= 3 && !targetLine.isLoop) {
        targetLine.isLoop = true;
        soundEngine.playConnect();
        return targetLine;
      }
    }

    // Extend from end
    if (fromId === last && !sIds.includes(toId)) {
      sIds.push(toId);
      soundEngine.playConnect();
      return targetLine;
    }
    if (toId === last && !sIds.includes(fromId)) {
      sIds.push(fromId);
      soundEngine.playConnect();
      return targetLine;
    }

    // Prepend to start
    if (fromId === first && !sIds.includes(toId)) {
      sIds.unshift(toId);
      soundEngine.playConnect();
      return targetLine;
    }
    if (toId === first && !sIds.includes(fromId)) {
      sIds.unshift(fromId);
      soundEngine.playConnect();
      return targetLine;
    }

    // If both stations are already in line, ignore
    if (sIds.includes(fromId) && sIds.includes(toId)) {
      return targetLine;
    }

    // Fallback: append the unincluded station to the nearest end
    if (!sIds.includes(toId)) {
      sIds.push(toId);
      soundEngine.playConnect();
    } else if (!sIds.includes(fromId)) {
      sIds.unshift(fromId);
      soundEngine.playConnect();
    }

    return targetLine;
  }

  public deployTrainToLine(lineId: string): boolean {
    if (this.state.inventory.unassignedTrains <= 0) return false;

    const line = this.state.lines.find(l => l.id === lineId);
    if (!line || line.stationIds.length < 2) return false;

    this.state.inventory.unassignedTrains--;
    const train: Train = {
      id: `train-${Date.now()}-${Math.random()}`,
      lineId,
      carriagesCount: 0,
      capacity: 6,
      speed: 75,
      segmentIndex: 0,
      progress: 0,
      direction: 1,
      passengers: [],
      dwellingTime: 0
    };

    this.state.trains.push(train);
    soundEngine.playConnect();

    // Floating text notification
    const firstStation = this.state.stations.find(s => s.id === line.stationIds[0]);
    if (firstStation) {
      this.addFloatingText(firstStation.x, firstStation.y - 30, `+1 Tàu (${line.name})`, '#10B981');
    }
    return true;
  }

  /**
   * Recalls 1 train from a specific line back to the depot / inventory
   */
  public removeTrainFromLine(lineId: string): boolean {
    const line = this.state.lines.find(l => l.id === lineId);
    const trainsOnLine = this.state.trains.filter(t => t.lineId === lineId);
    if (trainsOnLine.length === 0) return false;

    // Pick a train on this line (prefer one with fewer passengers)
    trainsOnLine.sort((a, b) => a.passengers.length - b.passengers.length);
    const trainToRemove = trainsOnLine[0];

    // Return passengers aboard to nearest station on the line if any
    const fallbackStationId = trainToRemove.currentStationId || line?.stationIds[0];
    const station = this.state.stations.find(s => s.id === fallbackStationId);
    if (trainToRemove.passengers.length > 0 && station) {
      station.passengers.push(...trainToRemove.passengers);
    }

    // Return train and carriages to inventory
    this.state.inventory.unassignedTrains++;
    this.state.inventory.carriages += trainToRemove.carriagesCount;

    // Remove from trains list
    this.state.trains = this.state.trains.filter(t => t.id !== trainToRemove.id);
    soundEngine.playDisconnect();

    // Floating feedback notification
    if (station) {
      this.addFloatingText(station.x, station.y - 30, `-1 Tàu (${line?.name || ''}) ➔ Đã thu hồi về kho`, '#F59E0B');
    } else {
      this.addFloatingText(740, 500, `-1 Tàu ➔ Đã thu hồi về kho`, '#F59E0B');
    }

    return true;
  }

  /**
   * Removes a station from an active line
   */
  public removeStationFromLine(lineId: string, stationId: string): boolean {
    const line = this.state.lines.find(l => l.id === lineId);
    if (!line || !line.stationIds.includes(stationId)) return false;

    const station = this.state.stations.find(s => s.id === stationId);

    // Remove this station from line
    line.stationIds = line.stationIds.filter(id => id !== stationId);

    if (line.isLoop && line.stationIds.length < 3) {
      line.isLoop = false;
    }

    // Fix trains on this line
    const maxSegment = Math.max(0, line.isLoop ? line.stationIds.length - 1 : line.stationIds.length - 2);
    for (const train of this.state.trains) {
      if (train.lineId === lineId) {
        if (train.segmentIndex > maxSegment) {
          train.segmentIndex = maxSegment;
          train.progress = 0;
        }
      }
    }

    // If line now has less than 2 stations, delete line and return its trains to inventory
    if (line.stationIds.length < 2) {
      const lineName = line.name;
      this.deleteLine(lineId);
      if (station) {
        this.addFloatingText(station.x, station.y - 30, `Đã xóa tuyến ${lineName} (ít hơn 2 ga) ➔ Hoàn tàu về kho`, '#EF4444');
      }
    } else {
      soundEngine.playDisconnect();
      if (station) {
        this.addFloatingText(station.x, station.y - 30, `✖ Đã hủy ga khỏi ${line.name}`, line.color || '#F59E0B');
      }
    }

    return true;
  }

  /**
   * Cancels/removes a station from a route when player accidentally selected it
   * (triggered when double-clicking or pressing 2 times on the station)
   */
  public cancelStationFromRoute(
    stationId: string,
    preferredLineId?: string | null
  ): { success: boolean; lineName?: string; lineColor?: string } {
    const station = this.state.stations.find(s => s.id === stationId);
    if (!station) return { success: false };

    const linesServing = this.state.lines.filter(l => l.stationIds.includes(stationId));
    if (linesServing.length === 0) {
      soundEngine.playDisconnect();
      this.addFloatingText(
        station.x,
        station.y - 25,
        'Ga này chưa nối vào tuyến tàu nào',
        '#94A3B8'
      );
      return { success: false };
    }

    // If preferred line is selected and contains this station, remove from it
    let targetLine = preferredLineId ? linesServing.find(l => l.id === preferredLineId) : undefined;
    // Otherwise remove from the most recent line
    if (!targetLine) {
      targetLine = linesServing[linesServing.length - 1];
    }

    const lineName = targetLine.name;
    const lineColor = targetLine.color;
    const ok = this.removeStationFromLine(targetLine.id, stationId);
    return { success: ok, lineName, lineColor };
  }

  public addCarriageToTrain(trainId: string): boolean {
    if (this.state.inventory.carriages <= 0) return false;
    const train = this.state.trains.find(t => t.id === trainId);
    if (!train || train.carriagesCount >= 2) return false;

    this.state.inventory.carriages--;
    train.carriagesCount++;
    train.capacity += 4;
    soundEngine.playConnect();
    return true;
  }

  public addCarriageToLine(lineId: string): boolean {
    if (this.state.inventory.carriages <= 0) return false;
    const lineTrains = this.state.trains.filter(t => t.lineId === lineId);
    if (lineTrains.length === 0) return false;

    // Attach to train on this line with fewest carriages (< 2)
    const sorted = [...lineTrains].sort((a, b) => a.carriagesCount - b.carriagesCount);
    const train = sorted.find(t => t.carriagesCount < 2);
    if (!train) return false;

    this.state.inventory.carriages--;
    train.carriagesCount++;
    train.capacity += 4;
    soundEngine.playConnect();

    const currStation = this.state.stations.find(s => s.id === train.currentStationId);
    this.addFloatingText(
      currStation ? currStation.x : 740,
      currStation ? currStation.y - 25 : 500,
      '+1 Toa (Sức chứa 10)',
      '#60A5FA'
    );
    return true;
  }

  public removeCarriageFromLine(lineId: string): boolean {
    const lineTrains = this.state.trains.filter(t => t.lineId === lineId);
    if (lineTrains.length === 0) return false;

    // Pick train with most carriages (> 0) to recall
    const sorted = [...lineTrains].sort((a, b) => b.carriagesCount - a.carriagesCount);
    const train = sorted.find(t => t.carriagesCount > 0);
    if (!train) return false;

    train.carriagesCount--;
    train.capacity -= 4;
    this.state.inventory.carriages++;
    soundEngine.playDisconnect();

    const currStation = this.state.stations.find(s => s.id === train.currentStationId);
    this.addFloatingText(
      currStation ? currStation.x : 740,
      currStation ? currStation.y - 25 : 500,
      '-1 Toa về kho',
      '#94A3B8'
    );
    return true;
  }

  public upgradeStationToInterchange(stationId: string): boolean {
    const station = this.state.stations.find(s => s.id === stationId);
    if (!station || station.isInterchange) return false;

    if (this.state.inventory.interchangeTokens > 0) {
      this.state.inventory.interchangeTokens--;
    } else if (this.state.money >= 350) {
      this.state.money -= 350;
    } else {
      return false;
    }

    station.isInterchange = true;
    station.maxCapacity = 14;
    soundEngine.playFanfare();
    this.addFloatingText(station.x, station.y - 25, '★ Ga Trung Chuyển', '#F59E0B');
    return true;
  }

  // Purchases using money
  public buyTrain(): boolean {
    const cost = 400 + this.state.trains.length * 100;
    if (this.state.money < cost) return false;
    this.state.money -= cost;
    this.state.inventory.unassignedTrains++;
    soundEngine.playFanfare();
    return true;
  }

  public buyCarriage(): boolean {
    const cost = 250;
    if (this.state.money < cost) return false;
    this.state.money -= cost;
    this.state.inventory.carriages++;
    soundEngine.playFanfare();
    return true;
  }

  public buyLine(): boolean {
    const cost = 600 + this.state.lines.length * 200;
    if (this.state.money < cost || this.state.inventory.availableLines >= 7) return false;
    this.state.money -= cost;
    this.state.inventory.availableLines++;
    soundEngine.playFanfare();
    return true;
  }

  public buyInterchangeUpgrade(): boolean {
    const cost = 350;
    if (this.state.money < cost) return false;
    this.state.money -= cost;
    this.state.inventory.interchangeTokens++;
    soundEngine.playFanfare();
    return true;
  }

  // --- Persistence & Save System ---

  public serialize(): string {
    return JSON.stringify({
      version: 1,
      cityId: this.mapConfig.id,
      money: this.state.money,
      timeOfDayHours: this.state.timeOfDayHours,
      currentDayIndex: this.state.currentDayIndex,
      weekNumber: this.state.weekNumber,
      gameMode: this.state.gameMode,
      inventory: this.state.inventory,
      stats: this.state.stats,
      stations: this.state.stations,
      lines: this.state.lines,
      trains: this.state.trains,
      stationPool: this.stationPool,
      nextStationSpawnTime: this.nextStationSpawnTime,
      passengerIdCounter: this.passengerIdCounter,
      timestamp: Date.now()
    });
  }

  public restore(savedJson: string): boolean {
    try {
      const data = JSON.parse(savedJson);
      if (!data || !data.cityId || data.cityId !== this.mapConfig.id) {
        return false;
      }

      this.state.money = typeof data.money === 'number' ? data.money : 200000;
      this.state.timeOfDayHours = typeof data.timeOfDayHours === 'number' ? data.timeOfDayHours : 7.0;
      this.state.currentDayIndex = typeof data.currentDayIndex === 'number' ? data.currentDayIndex : 0;
      this.state.weekNumber = typeof data.weekNumber === 'number' ? data.weekNumber : 1;
      this.state.gameMode = data.gameMode || 'standard';

      if (data.inventory) {
        this.state.inventory = {
          availableLines: data.inventory.availableLines ?? 3,
          unassignedTrains: data.inventory.unassignedTrains ?? 2,
          carriages: data.inventory.carriages ?? 1,
          interchangeTokens: data.inventory.interchangeTokens ?? 1,
          tunnelTokens: data.inventory.tunnelTokens ?? 2
        };
      }

      if (data.stats) {
        this.state.stats = {
          totalPassengersDelivered: data.stats.totalPassengersDelivered ?? 0,
          totalDays: data.stats.totalDays ?? 1,
          totalWeeks: data.stats.totalWeeks ?? 1,
          moneyEarned: data.stats.moneyEarned ?? 0,
          peakLinesUsed: data.stats.peakLinesUsed ?? 0,
          peakTrainsUsed: data.stats.peakTrainsUsed ?? 0,
          crowdedWarningsAvoided: data.stats.crowdedWarningsAvoided ?? 0
        };
      }

      if (Array.isArray(data.stations) && data.stations.length > 0) {
        this.state.stations = data.stations.map((s: Station) => ({
          ...s,
          passengers: Array.isArray(s.passengers) ? s.passengers : [],
          overcrowdedTimer: Math.min(0.5, s.overcrowdedTimer || 0), // avoid spawning directly into instant game over
          isOvercrowded: false
        }));
      }

      if (Array.isArray(data.lines)) {
        this.state.lines = data.lines;
      }

      if (Array.isArray(data.trains)) {
        this.state.trains = data.trains.map((t: Train) => ({
          ...t,
          dwellingTime: 0,
          passengers: Array.isArray(t.passengers) ? t.passengers : []
        }));
      }

      if (Array.isArray(data.stationPool)) {
        this.stationPool = data.stationPool;
      }

      if (typeof data.nextStationSpawnTime === 'number') {
        this.nextStationSpawnTime = Math.max(10, data.nextStationSpawnTime);
      }

      if (typeof data.passengerIdCounter === 'number') {
        this.passengerIdCounter = data.passengerIdCounter;
      }

      this.state.isGameOver = false;
      this.state.gameOverReason = null;
      this.state.pendingWeeklyReward = false;

      return true;
    } catch (e) {
      console.error('Failed to restore simulation state', e);
      return false;
    }
  }

  public static saveToStorage(engine: MetroEngine) {
    try {
      const key = `mini_metro_save_${engine.mapConfig.id}`;
      const payload = engine.serialize();
      localStorage.setItem(key, payload);
      localStorage.setItem('mini_metro_last_city', engine.mapConfig.id);

      // Also update high score record
      const cityId = engine.mapConfig.id;
      const curRecord = MetroEngine.getHighScore(cityId);
      const curPassengers = engine.state.stats.totalPassengersDelivered;
      const curDays = engine.state.stats.totalDays;

      if (curPassengers > curRecord.bestPassengers || (curPassengers === curRecord.bestPassengers && curDays > curRecord.bestDays)) {
        localStorage.setItem(`mini_metro_highscore_${cityId}`, JSON.stringify({
          bestPassengers: Math.max(curRecord.bestPassengers, curPassengers),
          bestDays: Math.max(curRecord.bestDays, curDays),
          date: new Date().toLocaleDateString('vi-VN')
        }));
      }
    } catch (e) {
      console.warn('LocalStorage save error', e);
    }
  }

  public static loadFromStorage(cityId: string, mapConfig: CityMapConfig): MetroEngine | null {
    try {
      const key = `mini_metro_save_${cityId}`;
      const raw = localStorage.getItem(key);
      if (!raw) return null;
      const engine = new MetroEngine(mapConfig);
      if (engine.restore(raw)) {
        return engine;
      }
    } catch (e) {
      console.warn('LocalStorage load error', e);
    }
    return null;
  }

  public static clearSave(cityId: string) {
    try {
      localStorage.removeItem(`mini_metro_save_${cityId}`);
    } catch (e) {
      console.warn('LocalStorage clear error', e);
    }
  }

  public static getHighScore(cityId: string): { bestPassengers: number; bestDays: number; date?: string } {
    try {
      const raw = localStorage.getItem(`mini_metro_highscore_${cityId}`);
      if (raw) {
        return JSON.parse(raw);
      }
    } catch {}
    return { bestPassengers: 0, bestDays: 0 };
  }
}

