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
  Passenger,
  StationData,
  MetroLineType,
  WeatherType,
  WeatherState,
  UrbanIncident,
  CampaignScenario,
  CampaignState,
  InspectorState
} from '../types/game';
import { CAMPAIGN_SCENARIOS } from '../data/campaignScenarios';
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
  weather: WeatherState;
  activeIncident: UrbanIncident | null;
  campaignState?: CampaignState | null;
  inspectorState: InspectorState;
}

export const DAY_NAMES_VI = ['Thứ Hai', 'Thứ Ba', 'Thứ Tư', 'Thứ Năm', 'Thứ Sáu', 'Thứ Bảy', 'Chủ Nhật'];
export const DAY_NAMES_EN = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

export function getLineSpeedMultiplier(type?: MetroLineType): number {
  switch (type) {
    case 'intercity':
      return 1.20; // +20% faster than metro
    case 'high_speed':
      return 1.80; // +80% faster than metro
    case 'metro':
    default:
      return 1.0; // standard metro speed
  }
}

export class MetroEngine {
  public state: SimulationState;
  public mapConfig: CityMapConfig;
  public stationPool: StationData[];
  public masterStationPool: StationData[];
  public masterInitialStations: StationData[];
  public isUnlimitedMode: boolean = false;
  private nextStationSpawnTime: number = 25; // seconds
  private lastWarningSoundTime: number = 0;
  private passengerIdCounter: number = 1;

  public toggleUnlimitedMode() {
    this.isUnlimitedMode = !this.isUnlimitedMode;
    if (this.isUnlimitedMode) {
      this.state.inventory.availableLines = 99;
      this.state.inventory.unassignedTrains = 99;
      this.state.inventory.carriages = 99;
      this.state.inventory.tunnelTokens = 99;
      this.state.inventory.interchangeTokens = 99;
    }
  }

  public spawnStation() {
    this.spawnNextStation();
  }

  constructor(mapConfig: CityMapConfig, mode: GameMode = 'standard') {
    this.mapConfig = mapConfig;
    this.masterStationPool = [...mapConfig.stationPool];
    this.masterInitialStations = [...mapConfig.initialStations];
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
        crowdedWarningsAvoided: 0,
        todayPassengers: 0,
        dailyHistory: []
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
      isRushHour: false,
      weather: {
        type: 'sunny',
        current: 'sunny',
        temperature: 31,
        rainIntensity: 0,
        descriptionVi: 'Trời nắng ráo',
        descriptionEn: 'Sunny & Clear',
        floodedStationIds: [],
        durationRemaining: 180
      },
      activeIncident: null,
      campaignState: null,
      inspectorState: {
        status: 'idle',
        currentStationId: null,
        currentTrainId: null,
        visitedStationIds: [],
        timeRemaining: 90,
        cooldownRemaining: 0,
        targetCount: 5,
        rewardAmount: 4000
      }
    };
  }

  public setGameSpeed(speed: number) {
    this.state.gameSpeed = speed;
  }

  public setGameMode(mode: GameMode) {
    this.state.gameMode = mode;
  }

  // Creative Time Adjustment: relative delta from baseline [-1h, +2h]
  public timeOffsetHours: number = 0;

  public adjustTimeOfDay(deltaHours: number) {
    const targetOffset = Math.max(-1.0, Math.min(2.0, this.timeOffsetHours + deltaHours));
    const effectiveDelta = targetOffset - this.timeOffsetHours;
    this.timeOffsetHours = targetOffset;

    let nextHours = this.state.timeOfDayHours + effectiveDelta;
    if (nextHours < 0) nextHours += 24;
    if (nextHours >= 24) nextHours -= 24;
    this.state.timeOfDayHours = Number(nextHours.toFixed(3));

    const h = this.state.timeOfDayHours % 24;
    this.state.isRushHour = (h >= 7.0 && h <= 9.5) || (h >= 17.0 && h <= 19.5);
  }

  public setTimeOffset(offset: number) {
    const targetOffset = Math.max(-1.0, Math.min(2.0, offset));
    const effectiveDelta = targetOffset - this.timeOffsetHours;
    this.timeOffsetHours = targetOffset;

    let nextHours = this.state.timeOfDayHours + effectiveDelta;
    if (nextHours < 0) nextHours += 24;
    if (nextHours >= 24) nextHours -= 24;
    this.state.timeOfDayHours = Number(nextHours.toFixed(3));

    const h = this.state.timeOfDayHours % 24;
    this.state.isRushHour = (h >= 7.0 && h <= 9.5) || (h >= 17.0 && h <= 19.5);
  }

  public resetTimeOffset() {
    this.setTimeOffset(0);
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
      const finishedDayIndex = this.state.currentDayIndex;
      const dayNameVi = DAY_NAMES_VI[finishedDayIndex] || `Ngày ${this.state.stats.totalDays}`;
      const dayNameEn = DAY_NAMES_EN[finishedDayIndex] || `Day ${this.state.stats.totalDays}`;

      if (!this.state.stats.dailyHistory) {
        this.state.stats.dailyHistory = [];
      }
      this.state.stats.dailyHistory.push({
        dayIndex: finishedDayIndex,
        dayNameVi,
        dayNameEn,
        passengers: this.state.stats.todayPassengers || 0,
        totalDelivered: this.state.stats.totalPassengersDelivered
      });
      // Keep up to 14 days of history
      if (this.state.stats.dailyHistory.length > 14) {
        this.state.stats.dailyHistory.shift();
      }
      this.state.stats.todayPassengers = 0;

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

    // 4b. Metro Line Inspector Simulation
    this.updateInspector(simDt);

    // 5. Station Overcrowding checks
    this.updateOvercrowding(simDt);

    // 6. Update floating texts
    this.updateFloatingTexts(simDt);

    // 7. Update Weather & Urban Incidents
    this.updateWeather(simDt);

    // 8. Campaign Mode Progression & Win/Loss Evaluation
    if (this.state.gameMode === 'campaign' && this.state.campaignState && !this.state.campaignState.isWon && !this.state.campaignState.isFailed) {
      const cs = this.state.campaignState;
      cs.currentDelivered = this.state.stats.totalPassengersDelivered;
      cs.currentDay = this.state.stats.totalDays;

      const scenario = CAMPAIGN_SCENARIOS.find(s => s.id === cs.scenarioId);
      const targetBudget = cs.scenarioId === 'budget_master' ? 3500 : 0;
      const budgetMet = this.state.money >= targetBudget;

      if (cs.currentDelivered >= cs.targetPassengers && budgetMet) {
        cs.isWon = true;
        let stars = 1;
        if (scenario) {
          if (cs.currentDay <= scenario.starThresholds.threeStarDays) stars = 3;
          else if (cs.currentDay <= scenario.starThresholds.twoStarDays) stars = 2;
        }
        cs.starsEarned = stars;
        soundEngine.playFanfare();
        const worldW = this.mapConfig.worldWidth || 2400;
        const worldH = this.mapConfig.worldHeight || 1700;
        this.addFloatingText(worldW / 2, worldH / 2, '🎉 CHIẾN THẮNG KỊCH BẢN! 🎉', '#10B981');
      } else if (cs.currentDay > cs.timeLimitDays) {
        cs.isFailed = true;
        cs.failReason = 'Hết thời gian quy định của kịch bản';
        soundEngine.playGameOver();
      }
    }
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

    // Spawn rate multiplier: higher during rush hour & during rain/storm/flood (+35%)
    const rushMultiplier = this.state.isRushHour ? 2.6 : 1.0;
    const weatherSpawnMultiplier = (this.state.weather.type === 'rainy' || this.state.weather.type === 'storm' || this.state.weather.type === 'flooded')
      ? 1.35
      : 1.0;
    const spawnMultiplier = rushMultiplier * weatherSpawnMultiplier;

    for (const station of this.state.stations) {
      // Chance per second to spawn a passenger at this station
      const spawnRate = (0.07 + Math.random() * 0.05) * spawnMultiplier;
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
        if (train.dwellingTime <= 0) {
          train.currentStationId = undefined;
        }
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
      // Base train speed reduced to 3/5 of previous speed; adjusted by line type multiplier (metro = 1.0x, intercity = 1.2x, high_speed = 1.8x)
      const baseSpeed = typeof train.speed === 'number' && train.speed > 5 ? train.speed : 75;
      const typeMultiplier = getLineSpeedMultiplier(line.type);
      let weatherSpeedMultiplier = 1.0;
      if (s1.isFlooded || s2.isFlooded) {
        weatherSpeedMultiplier = 0.55; // Flooded track cautious crawl
      } else if (this.state.weather.type === 'storm') {
        weatherSpeedMultiplier = 0.80; // Storm caution
      }
      const speed = baseSpeed * 0.6 * typeMultiplier * weatherSpeedMultiplier;
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
        const baseFare = this.state.isRushHour ? 25 : 18;
        // Standard mode earns 2x ticket revenue bonus
        const modeMultiplier = this.state.gameMode === 'standard' ? 2 : 1;
        const fare = baseFare * modeMultiplier;
        fareEarned += fare;
        this.state.stats.totalPassengersDelivered++;
        this.state.stats.todayPassengers = (this.state.stats.todayPassengers || 0) + 1;
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
      const is2x = this.state.gameMode === 'standard';
      this.addFloatingText(station.x, station.y - 20, is2x ? `+$${fareEarned} (2x)` : `+$${fareEarned}`, '#10B981');
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

    // 3. Metro Line Inspector Logic: Alight at planned stations to inspect, then catch next train
    const insp = this.state.inspectorState;
    if (insp && insp.status === 'patrolling') {
      // Case A: Inspector was waiting at this station -> hop onto next arriving train heading towards end station!
      if (insp.currentStationId === station.id && !insp.currentTrainId) {
        const canBoard = (!insp.dwellAtStationTimer || insp.dwellAtStationTimer <= 0) && train.id !== insp.lastTrainId;
        const endStId = insp.plannedStationIds && insp.plannedStationIds.length > 0
          ? insp.plannedStationIds[insp.plannedStationIds.length - 1]
          : null;
        const isHeadingToEnd = !endStId || this.isTrainHeadingTowardsEnd(train, station.id, endStId, line);

        if (canBoard && (!insp.targetLineId || insp.targetLineId === train.lineId) && isHeadingToEnd) {
          insp.currentTrainId = train.id;
          insp.currentStationId = null;
          insp.lastTrainId = null;
          soundEngine.playInspectorBoard();
          const endSt = endStId ? this.state.stations.find(s => s.id === endStId) : null;
          const endName = endSt ? `Ga ${endSt.name}` : 'ga cuối';
          this.addFloatingText(station.x, station.y - 32, `👮 Lên tàu hướng về ${endName}!`, '#F59E0B');
        }
      }
      // Case B: Inspector is aboard this arriving train -> check if this station is in the planned itinerary!
      else if (insp.currentTrainId === train.id) {
        const isPlanned = !insp.plannedStationIds || insp.plannedStationIds.includes(station.id);
        const isAlreadyInspected = insp.visitedStationIds.includes(station.id);

        // DO NOT ALIGHT AT STATIONS ALREADY INSPECTED! ("ko xuống ga đã được mark là đã kt")
        if (isPlanned && !isAlreadyInspected) {
          insp.visitedStationIds.push(station.id);
          const count = insp.visitedStationIds.length;
          const target = insp.targetCount;

          // Inspector ALIGHTS to inspect this station!
          insp.currentStationId = station.id;
          insp.currentTrainId = null;
          insp.lastTrainId = train.id;
          insp.dwellAtStationTimer = 3.0; // 3 seconds inspecting platform before catching next train

          if (count >= target) {
            insp.status = 'completed';
            insp.cooldownRemaining = 30; // 30s cooldown
            insp.currentTrainId = null;
            this.state.money += insp.rewardAmount;
            this.state.stats.moneyEarned += insp.rewardAmount;
            soundEngine.playInspectorReward();
            this.addFloatingText(
              station.x,
              station.y - 40,
              `🎉 +$${insp.rewardAmount.toLocaleString()} HOÀN THÀNH THANH TRA! (${count}/${target} ga)`,
              '#F59E0B'
            );
          } else {
            soundEngine.playInspectorCheck(count);
            this.addFloatingText(
              station.x,
              station.y - 32,
              `👮 Xuống ga ${station.name} (${count}/${target})! Đang kiểm tra & chờ tàu kế...`,
              '#10B981'
            );
          }
        }
        // If already inspected or not planned: inspector stays on board train heading to destination!
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

  /**
   * Checks whether a train at currentStationId is heading towards endStationId on line.
   * Ensures the inspector only travels in the forward direction from start to end station.
   */
  public isTrainHeadingTowardsEnd(
    train: Train,
    currentStationId: string,
    endStationId: string,
    line: MetroLine
  ): boolean {
    if (!line || line.stationIds.length < 2) return false;
    const sIds = line.stationIds;
    const currIdx = sIds.indexOf(currentStationId);
    const endIdx = sIds.indexOf(endStationId);
    if (currIdx === -1 || endIdx === -1) return false;
    if (currIdx === endIdx) return true;

    // Determine the departing direction of the train from currentStationId
    let depDirection = train.direction;

    if (!line.isLoop) {
      const totalSegments = sIds.length - 1;
      if (currIdx >= totalSegments || train.segmentIndex >= totalSegments) {
        depDirection = -1;
      } else if (currIdx <= 0 || train.segmentIndex < 0) {
        depDirection = 1;
      }

      if (endIdx > currIdx) {
        return depDirection === 1;
      } else {
        return depDirection === -1;
      }
    } else {
      // Loop line
      const total = sIds.length;
      if (depDirection === 1) {
        const forwardDist = (endIdx - currIdx + total) % total;
        const backwardDist = (currIdx - endIdx + total) % total;
        return forwardDist <= backwardDist;
      } else {
        const backwardDist = (currIdx - endIdx + total) % total;
        const forwardDist = (endIdx - currIdx + total) % total;
        return backwardDist <= forwardDist;
      }
    }
  }

  // --- Metro Line Inspector Controller & Loop ---
  public startSelectingInspectorStation(): boolean {
    if (!this.state.inspectorState) {
      this.state.inspectorState = {
        status: 'idle',
        currentStationId: null,
        currentTrainId: null,
        visitedStationIds: [],
        timeRemaining: 90,
        cooldownRemaining: 0,
        targetCount: 5,
        rewardAmount: 2000
      };
    }

    if (this.state.inspectorState.cooldownRemaining > 0) {
      soundEngine.playDisconnect();
      this.addFloatingText(740, 500, `Thanh tra đang hồi chiêu (${Math.ceil(this.state.inspectorState.cooldownRemaining)}s)`, '#EF4444');
      return false;
    }

    if (this.state.stations.length === 0) {
      soundEngine.playDisconnect();
      this.addFloatingText(740, 500, 'Chưa có nhà ga nào trên bản đồ!', '#EF4444');
      return false;
    }

    this.state.inspectorState.status = 'selecting_station';
    soundEngine.playInspectorCheck(1);
    this.addFloatingText(740, 500, '👉 Chọn 1 ga bất kỳ để xuất phát thanh tra', '#F59E0B');
    return true;
  }

  public cancelInspector(): void {
    const insp = this.state.inspectorState;
    if (!insp) return;

    if (insp.status === 'selecting_station') {
      insp.status = 'idle';
      return;
    }

    if (insp.status === 'patrolling') {
      insp.status = 'idle';
      insp.currentTrainId = null;
      insp.currentStationId = null;
      insp.visitedStationIds = [];
      insp.timeRemaining = 90;
      soundEngine.playDisconnect();
      this.addFloatingText(740, 500, 'Đã hủy nhiệm vụ thanh tra tuyến tàu', '#94A3B8');
    }
  }

  public deployInspectorAtStation(stationId: string): boolean {
    const station = this.state.stations.find(s => s.id === stationId);
    if (!station) return false;

    this.state.inspectorState = {
      status: 'patrolling',
      currentStationId: station.id,
      currentTrainId: null,
      visitedStationIds: [station.id],
      timeRemaining: 90,
      cooldownRemaining: 0,
      targetCount: 5,
      rewardAmount: 2000,
      failureReason: undefined
    };

    soundEngine.playInspectorBoard();
    this.addFloatingText(station.x, station.y - 25, '👮 Thanh tra đã vào vị trí: 1/5 ga!', '#F59E0B');
    return true;
  }

  public deployInspectorOnLine(lineId: string, plannedStationIds?: string[] | string): { success: boolean; errorMsg?: string } {
    if (!this.state.inspectorState) {
      this.state.inspectorState = {
        status: 'idle',
        currentStationId: null,
        currentTrainId: null,
        targetLineId: null,
        visitedStationIds: [],
        timeRemaining: 90,
        cooldownRemaining: 0,
        targetCount: 5,
        rewardAmount: 4000
      };
    }

    const DEPLOY_COST = 1000;

    if (this.state.inspectorState.cooldownRemaining > 0) {
      soundEngine.playDisconnect();
      const msg = `Thanh tra đang hồi chiêu (${Math.ceil(this.state.inspectorState.cooldownRemaining)}s)`;
      this.addFloatingText(740, 500, msg, '#EF4444');
      return { success: false, errorMsg: msg };
    }

    if (this.state.money < DEPLOY_COST) {
      soundEngine.playDisconnect();
      const msg = `Không đủ tiền! Bạn cần ít nhất $${DEPLOY_COST.toLocaleString()} để chi trả phí thanh tra.`;
      this.addFloatingText(740, 500, msg, '#EF4444');
      return { success: false, errorMsg: msg };
    }

    const line = this.state.lines.find(l => l.id === lineId);
    if (!line) {
      soundEngine.playDisconnect();
      const msg = 'Không tìm thấy tuyến tàu!';
      this.addFloatingText(740, 500, msg, '#EF4444');
      return { success: false, errorMsg: msg };
    }

    // Determine chosen stations (minimum 5 stations, but can be 5 or more)
    let chosenIds: string[] = [];
    if (Array.isArray(plannedStationIds) && plannedStationIds.length > 0) {
      chosenIds = plannedStationIds.filter(id => line.stationIds.includes(id));
    } else if (typeof plannedStationIds === 'string' && line.stationIds.includes(plannedStationIds)) {
      const startIdx = line.stationIds.indexOf(plannedStationIds);
      chosenIds = [...line.stationIds.slice(startIdx), ...line.stationIds.slice(0, startIdx)];
    } else {
      chosenIds = [...line.stationIds];
    }

    if (chosenIds.length < 5) {
      soundEngine.playDisconnect();
      const msg = `Cần chọn ít nhất 5 ga trên tuyến ${line.name} (đã chọn ${chosenIds.length} ga)!`;
      this.addFloatingText(740, 500, msg, '#EF4444');
      return { success: false, errorMsg: msg };
    }

    const targetCount = chosenIds.length;
    // Formula: 300 x số ga
    const rewardAmount = 300 * targetCount;
    // Time limit: 90s base for 5 stations, +20s per extra station
    const timeRemaining = 90 + Math.max(0, targetCount - 5) * 20;

    // Deduct $1,000 deployment fee
    this.state.money -= DEPLOY_COST;

    const startStId = chosenIds[0];
    const endStId = chosenIds[chosenIds.length - 1];
    const startStation = this.state.stations.find(s => s.id === startStId);
    const endStation = this.state.stations.find(s => s.id === endStId);

    // Inspector starts AT THE FIRST STATION (startStId) on the platform
    // First station is inspected for 3.0s, then inspector only boards trains heading to end station!
    this.state.inspectorState = {
      status: 'patrolling',
      targetLineId: line.id,
      currentStationId: startStId,
      currentTrainId: null,
      visitedStationIds: [startStId],
      plannedStationIds: chosenIds,
      lastTrainId: null,
      dwellAtStationTimer: 3.0,
      timeRemaining,
      cooldownRemaining: 0,
      targetCount,
      rewardAmount,
      failureReason: undefined
    };

    soundEngine.playInspectorBoard();
    const stX = startStation ? startStation.x : 740;
    const stY = startStation ? startStation.y : 500;
    const endName = endStation ? `Ga ${endStation.name}` : 'ga cuối';
    this.addFloatingText(
      stX,
      stY - 25,
      `👮 Xuất phát tại Ga ${startStation?.name || ''} ➔ Hướng về ${endName} (-$1,000)`,
      '#F59E0B'
    );
    return { success: true };
  }

  public alightInspectorAtStation(): boolean {
    const insp = this.state.inspectorState;
    if (!insp || insp.status !== 'patrolling' || !insp.currentTrainId) {
      return false;
    }
    const train = this.state.trains.find(t => t.id === insp.currentTrainId);
    if (train && train.currentStationId) {
      // Do not alight at stations that are already marked as inspected!
      if (insp.visitedStationIds.includes(train.currentStationId)) {
        soundEngine.playDisconnect();
        this.addFloatingText(740, 500, 'Ga này đã được kiểm tra xong rồi!', '#94A3B8');
        return false;
      }
      insp.currentStationId = train.currentStationId;
      insp.currentTrainId = null;
      insp.lastTrainId = train.id;
      insp.dwellAtStationTimer = 3.0;
      if (!insp.visitedStationIds.includes(train.currentStationId)) {
        insp.visitedStationIds.push(train.currentStationId);
      }
      const st = this.state.stations.find(s => s.id === train.currentStationId);
      soundEngine.playInspectorBoard();
      if (st) {
        this.addFloatingText(st.x, st.y - 25, '👮 Đang kiểm tra sân ga...', '#06B6D4');
      }
      return true;
    }
    return false;
  }

  private updateInspector(simDt: number) {
    const insp = this.state.inspectorState;
    if (!insp) return;

    // Cooldown management for completed or failed states
    if (insp.status === 'completed' || insp.status === 'failed') {
      insp.cooldownRemaining = Math.max(0, insp.cooldownRemaining - simDt);
      if (insp.cooldownRemaining <= 0) {
        insp.status = 'idle';
        insp.visitedStationIds = [];
        insp.currentStationId = null;
        insp.currentTrainId = null;
        insp.failureReason = undefined;
      }
      return;
    }

    if (insp.status === 'idle') {
      if (insp.cooldownRemaining > 0) {
        insp.cooldownRemaining = Math.max(0, insp.cooldownRemaining - simDt);
      }
      return;
    }

    if (insp.status !== 'patrolling') return;

    // 0. Dwell timer countdown at station platform
    if (insp.dwellAtStationTimer && insp.dwellAtStationTimer > 0) {
      insp.dwellAtStationTimer -= simDt;
    }

    // 0.1 Reset lastTrainId once that previous train leaves the station
    if (insp.lastTrainId && insp.currentStationId) {
      const prevTrain = this.state.trains.find(t => t.id === insp.lastTrainId);
      if (!prevTrain || prevTrain.currentStationId !== insp.currentStationId) {
        insp.lastTrainId = null;
      }
    }

    // 1. Time Limit Countdown
    insp.timeRemaining -= simDt;
    if (insp.timeRemaining <= 0) {
      insp.status = 'failed';
      insp.failureReason = 'Hết thời gian tuần tra';
      insp.cooldownRemaining = 30; // 30s cooldown
      insp.currentTrainId = null;
      insp.currentStationId = null;
      soundEngine.playInspectorFail();
      this.addFloatingText(740, 500, '❌ Hết thời gian thanh tra!', '#EF4444');
      return;
    }

    // 2. Failure Condition: network overcrowding
    const overcrowdedStation = this.state.stations.find(s => s.isOvercrowded && s.overcrowdedTimer >= 0.85);
    if (overcrowdedStation) {
      insp.status = 'failed';
      insp.failureReason = `Ga "${overcrowdedStation.name}" bị quá tải!`;
      insp.cooldownRemaining = 30; // 30s cooldown
      insp.currentTrainId = null;
      insp.currentStationId = null;
      soundEngine.playInspectorFail();
      this.addFloatingText(overcrowdedStation.x, overcrowdedStation.y - 30, '❌ Nhiệm vụ hủy: Ga bị quá tải!', '#EF4444');
      return;
    }

    // 3. Platform Boarding check: If inspector is waiting on platform and done inspecting platform
    if (insp.currentStationId && !insp.currentTrainId) {
      const canBoard = !insp.dwellAtStationTimer || insp.dwellAtStationTimer <= 0;
      if (canBoard) {
        const waitingStationId = insp.currentStationId;
        const line = this.state.lines.find(l => l.id === (insp.targetLineId || ''));
        const endStId = insp.plannedStationIds && insp.plannedStationIds.length > 0
          ? insp.plannedStationIds[insp.plannedStationIds.length - 1]
          : null;

        const boardingTrain = this.state.trains.find(t => 
          t.currentStationId === waitingStationId && 
          t.dwellingTime > 0 &&
          t.id !== insp.lastTrainId &&
          (!insp.targetLineId || t.lineId === insp.targetLineId) &&
          (!line || !endStId || this.isTrainHeadingTowardsEnd(t, waitingStationId, endStId, line))
        );
        if (boardingTrain) {
          insp.currentTrainId = boardingTrain.id;
          insp.currentStationId = null;
          insp.lastTrainId = null;
          const endSt = endStId ? this.state.stations.find(s => s.id === endStId) : null;
          const endName = endSt ? `Ga ${endSt.name}` : 'ga cuối';
          soundEngine.playInspectorBoard();
          this.addFloatingText(740, 500, `👮 Lên tàu hướng về ${endName}!`, '#F59E0B');
        }
      }
    }

    // 4. In-train health check
    if (insp.currentTrainId) {
      const train = this.state.trains.find(t => t.id === insp.currentTrainId);
      if (!train) {
        insp.status = 'failed';
        insp.failureReason = 'Đoàn tàu thanh tra bị thu hồi';
        insp.cooldownRemaining = 60;
        insp.currentTrainId = null;
        soundEngine.playInspectorFail();
        this.addFloatingText(740, 500, '❌ Đoàn tàu thanh tra bị thu hồi!', '#EF4444');
      }
    }
  }

  // --- Dynamic Weather & Urban Incidents ---
  public clearActiveIncident() {
    this.state.activeIncident = null;
    this.state.stations.forEach(s => {
      s.isFlooded = false;
    });
    if (this.state.weather) {
      this.state.weather.floodedStationIds = [];
    }
  }

  private updateWeather(simDt: number) {
    this.state.weather.durationRemaining -= simDt;
    const worldW = this.mapConfig.worldWidth || 2400;
    const worldH = this.mapConfig.worldHeight || 1700;

    // Check incident timer if active
    if (this.state.activeIncident) {
      this.state.activeIncident.remainingSeconds -= simDt;
      if (this.state.activeIncident.remainingSeconds <= 0) {
        // Incident resolved! Grant bonus reward
        const reward = this.state.activeIncident.rewardEarned || 500;
        this.state.money += reward;
        this.addFloatingText(
          worldW / 2,
          worldH / 2,
          `+$${reward} Khắc phục xong sự cố ngập úng!`,
          '#10B981'
        );
        soundEngine.playCashReward();
        this.clearActiveIncident();
      }
    }

    if (this.state.weather.durationRemaining <= 0) {
      // If previous weather was flooded/storm, give safe clearance reward
      if (this.state.weather.type === 'flooded' || this.state.weather.type === 'storm') {
        const reward = 600;
        this.state.money += reward;
        this.addFloatingText(
          worldW / 2,
          worldH / 2 - 40,
          `+$${reward} Thưởng vượt ngập bão an toàn!`,
          '#06B6D4'
        );
        soundEngine.playCashReward();
      }

      // Clear any previous incident and unflood stations when weather cycle expires
      this.clearActiveIncident();

      // Pick next weather
      const roll = Math.random();
      if (roll < 0.60) {
        this.setWeather('sunny');
      } else if (roll < 0.85) {
        this.setWeather('rainy');
      } else {
        this.setWeather('flooded');
      }
    }
  }

  public setWeather(type: WeatherType) {
    // Clear previous incident and unflood all stations
    this.clearActiveIncident();

    const floodedIds: string[] = [];
    let temp = 31;
    let rainInt = 0;
    let descVi = 'Trời nắng ráo';
    let descEn = 'Sunny & Clear';
    let duration = 180 + Math.random() * 60;
    const worldW = this.mapConfig.worldWidth || 2400;
    const worldH = this.mapConfig.worldHeight || 1700;

    if (type === 'rainy') {
      temp = 26;
      rainInt = 0.55;
      descVi = 'Mưa rào đô thị';
      descEn = 'City Rain';
      duration = 75 + Math.random() * 30;
      this.addFloatingText(
        worldW / 2,
        worldH / 2,
        '🌧️ Mưa rào: Khách dồn lên tàu (+35%)',
        '#38BDF8'
      );
    } else if (type === 'storm') {
      temp = 24;
      rainInt = 0.85;
      descVi = 'Mưa giông sấm sét';
      descEn = 'Thunderstorm';
      duration = 50 + Math.random() * 20;
      this.addFloatingText(
        worldW / 2,
        worldH / 2,
        '⛈️ Giông bão: Tàu giảm tốc an toàn',
        '#818CF8'
      );
    } else if (type === 'flooded') {
      temp = 25;
      rainInt = 1.0;
      descVi = 'Mưa lớn ngập úng';
      descEn = 'Urban Waterlogging';
      duration = 50 + Math.random() * 20;

      if (this.state.stations.length > 0) {
        const shuffled = [...this.state.stations].sort(() => 0.5 - Math.random());
        const floodCount = Math.min(2, Math.max(1, Math.floor(this.state.stations.length / 4)));
        const chosen = shuffled.slice(0, floodCount);
        chosen.forEach(s => {
          s.isFlooded = true;
          floodedIds.push(s.id);
          this.addFloatingText(s.x, s.y - 25, '🌊 Ga ngập nước! Tàu chạy chậm', '#38BDF8');
        });

        this.state.activeIncident = {
          id: `inc-${Date.now()}`,
          titleVi: 'Ngập úng đô thị cục bộ',
          titleEn: 'Urban Flooding Incident',
          descriptionVi: `Ga ${chosen.map(c => c.name).join(', ')} bị ngập. Tàu giảm tốc 40%.`,
          descriptionEn: `Stations ${chosen.map(c => c.name).join(', ')} flooded. Trains cautious speed.`,
          affectedStationIds: floodedIds,
          speedMultiplier: 0.6,
          remainingSeconds: duration,
          rewardEarned: 800
        };
      }
    }

    this.state.weather = {
      type,
      current: type,
      temperature: temp,
      rainIntensity: rainInt,
      descriptionVi: descVi,
      descriptionEn: descEn,
      floodedStationIds: floodedIds,
      durationRemaining: duration
    };
  }

  // Route Management
  public createLine(
    name: string,
    color: string,
    darkColor: string,
    textColor: string,
    type: MetroLineType = 'metro'
  ): MetroLine | null {
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
      isLoop: false,
      type
    };

    this.state.lines.push(newLine);
    soundEngine.playConnect();
    return newLine;
  }

  public updateLineType(lineId: string, type: MetroLineType): boolean {
    const line = this.state.lines.find(l => l.id === lineId);
    if (!line) return false;
    line.type = type;
    soundEngine.playConnect();
    const typeLabel = type === 'high_speed' ? 'High Speed (+80%)' : type === 'intercity' ? 'Intercity (+20%)' : 'Metro (Chuẩn)';
    this.addFloatingText(740, 500, `${line.name} ➔ ${typeLabel}`, '#10B981');
    return true;
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

  public updateLineColor(lineId: string, color: string, darkColor: string, textColor: string): boolean {
    const line = this.state.lines.find(l => l.id === lineId);
    if (!line) return false;
    line.color = color;
    line.darkColor = darkColor;
    line.textColor = textColor;
    soundEngine.playConnect();
    return true;
  }

  public clearAllStations(): void {
    // Return all active trains and carriages to depot
    this.state.inventory.unassignedTrains += this.state.trains.length;
    const totalCars = this.state.trains.reduce((sum, t) => sum + t.carriagesCount, 0);
    this.state.inventory.carriages += totalCars;
    this.state.trains = [];

    // Reset all lines (clear routes)
    for (const line of this.state.lines) {
      line.stationIds = [];
      line.isLoop = false;
    }

    // Clear all stations
    this.state.stations = [];

    // Critical fix: restore stationPool from master configuration so stations can be spawned/unlocked again!
    this.stationPool = [...this.masterStationPool];

    soundEngine.playDisconnect();
    this.addFloatingText(740, 500, 'Đã xóa tất cả nhà ga trên bản đồ', '#EF4444');
  }

  public restoreDefaultStations(): void {
    // Clear lines and return fleet
    this.state.inventory.unassignedTrains += this.state.trains.length;
    const totalCars = this.state.trains.reduce((sum, t) => sum + t.carriagesCount, 0);
    this.state.inventory.carriages += totalCars;
    this.state.trains = [];
    for (const line of this.state.lines) {
      line.stationIds = [];
      line.isLoop = false;
    }

    // Restore initial stations
    this.state.stations = this.masterInitialStations.map((s, idx) => ({
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

    // Reset stationPool
    this.stationPool = [...this.masterStationPool];
    soundEngine.playFanfare();
    this.addFloatingText(740, 500, 'Đã khôi phục các nhà ga ban đầu!', '#10B981');
  }

  public deleteSingleStation(stationId: string): boolean {
    const station = this.state.stations.find(s => s.id === stationId);
    if (!station) return false;

    // Remove station from any line traversing it
    for (const line of [...this.state.lines]) {
      if (line.stationIds.includes(stationId)) {
        this.removeStationFromLine(line.id, stationId);
      }
    }

    this.state.stations = this.state.stations.filter(s => s.id !== stationId);
    soundEngine.playDisconnect();
    this.addFloatingText(station.x, station.y - 20, `Đã xóa ga ${station.name}`, '#EF4444');
    return true;
  }

  public createCustomStation(
    name: string,
    shape: StationShape,
    x: number,
    y: number,
    cost = 1500
  ): { success: boolean; station?: Station; errorMsg?: string } {
    if (this.state.money < cost) {
      soundEngine.playDisconnect();
      return {
        success: false,
        errorMsg: `Cần $${cost.toLocaleString()} để xây nhà ga mới!`
      };
    }

    this.state.money -= cost;
    const newStation: Station = {
      id: `custom-st-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      name: name.trim() || `Ga Mới ${this.state.stations.length + 1}`,
      shape,
      x: Math.round(x),
      y: Math.round(y),
      passengers: [],
      maxCapacity: 6,
      isInterchange: false,
      overcrowdedTimer: 0,
      isOvercrowded: false,
      spawnTime: Date.now()
    };

    this.state.stations.push(newStation);
    soundEngine.playStationSpawn();
    this.addFloatingText(newStation.x, newStation.y - 20, `-$1,500 (+1 Ga ${newStation.name})`, '#10B981');

    return { success: true, station: newStation };
  }

  public changeStationShape(stationId: string, shape: StationShape): boolean {
    const station = this.state.stations.find(s => s.id === stationId);
    if (!station) return false;
    station.shape = shape;
    soundEngine.playConnect();
    this.addFloatingText(station.x, station.y - 20, `Đổi dạng: ${shape}`, '#3B82F6');
    return true;
  }

  public unlockAllStations(): { count: number } {
    const existingNames = new Set(this.state.stations.map(s => s.name));

    // If pool is empty or stations were cleared, recharge from master lists
    const missingStations: StationData[] = [];
    for (const initSt of this.masterInitialStations) {
      if (!existingNames.has(initSt.name)) {
        missingStations.push(initSt);
        existingNames.add(initSt.name);
      }
    }
    for (const poolSt of this.masterStationPool) {
      if (!existingNames.has(poolSt.name)) {
        missingStations.push(poolSt);
        existingNames.add(poolSt.name);
      }
    }

    // Also include whatever was currently in this.stationPool
    for (const p of this.stationPool) {
      if (!existingNames.has(p.name)) {
        missingStations.push(p);
        existingNames.add(p.name);
      }
    }

    if (missingStations.length === 0) {
      soundEngine.playDisconnect();
      this.addFloatingText(740, 500, 'Tất cả các nhà ga đã có mặt trên bản đồ!', '#38BDF8');
      return { count: 0 };
    }

    const count = missingStations.length;
    for (const poolSt of missingStations) {
      const id = poolSt.id || `st-${Date.now()}-${Math.floor(Math.random() * 100000)}`;
      this.state.stations.push({
        id,
        name: poolSt.name,
        shape: poolSt.shape,
        x: poolSt.x,
        y: poolSt.y,
        passengers: [],
        maxCapacity: 6,
        isInterchange: false,
        overcrowdedTimer: 0,
        isOvercrowded: false,
        spawnTime: Date.now()
      });
    }

    this.stationPool = [];
    soundEngine.playFanfare();
    this.addFloatingText(740, 500, `★ Đã mở khóa toàn bộ ${count} nhà ga!`, '#F59E0B');
    return { count };
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

    // If both stations are already in the line, avoid duplicate loop/reversal
    if (sIds.includes(fromId) && sIds.includes(toId)) {
      return targetLine;
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

    // If fromId is in the line (intermediate station), insert toId adjacent to fromId
    const fromIdx = sIds.indexOf(fromId);
    if (fromIdx !== -1 && !sIds.includes(toId)) {
      const prevSt = fromIdx > 0 ? this.state.stations.find(s => s.id === sIds[fromIdx - 1]) : null;
      const nextSt = fromIdx < sIds.length - 1 ? this.state.stations.find(s => s.id === sIds[fromIdx + 1]) : null;
      const targetSt = this.state.stations.find(s => s.id === toId);
      const currSt = this.state.stations.find(s => s.id === fromId);

      if (prevSt && nextSt && targetSt && currSt) {
        const distBefore = Math.hypot(prevSt.x - targetSt.x, prevSt.y - targetSt.y) + Math.hypot(targetSt.x - currSt.x, targetSt.y - currSt.y);
        const distAfter = Math.hypot(currSt.x - targetSt.x, currSt.y - targetSt.y) + Math.hypot(targetSt.x - nextSt.x, targetSt.y - nextSt.y);
        if (distAfter <= distBefore) {
          sIds.splice(fromIdx + 1, 0, toId);
        } else {
          sIds.splice(fromIdx, 0, toId);
        }
      } else {
        sIds.splice(fromIdx + 1, 0, toId);
      }
      soundEngine.playConnect();
      return targetLine;
    }

    // If toId is in the line (intermediate station), insert fromId adjacent to toId
    const toIdx = sIds.indexOf(toId);
    if (toIdx !== -1 && !sIds.includes(fromId)) {
      const prevSt = toIdx > 0 ? this.state.stations.find(s => s.id === sIds[toIdx - 1]) : null;
      const nextSt = toIdx < sIds.length - 1 ? this.state.stations.find(s => s.id === sIds[toIdx + 1]) : null;
      const fromSt = this.state.stations.find(s => s.id === fromId);
      const currSt = this.state.stations.find(s => s.id === toId);

      if (prevSt && nextSt && fromSt && currSt) {
        const distBefore = Math.hypot(prevSt.x - fromSt.x, prevSt.y - fromSt.y) + Math.hypot(fromSt.x - currSt.x, fromSt.y - currSt.y);
        const distAfter = Math.hypot(currSt.x - fromSt.x, currSt.y - fromSt.y) + Math.hypot(fromSt.x - nextSt.x, fromSt.y - nextSt.y);
        if (distAfter <= distBefore) {
          sIds.splice(toIdx + 1, 0, fromId);
        } else {
          sIds.splice(toIdx, 0, fromId);
        }
      } else {
        sIds.splice(toIdx + 1, 0, fromId);
      }
      soundEngine.playConnect();
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
      speed: 45,
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

  public startCampaignScenario(scenarioId: string): boolean {
    const scenario = CAMPAIGN_SCENARIOS.find(s => s.id === scenarioId);
    if (!scenario) return false;

    this.state.gameMode = 'campaign';
    this.state.stats.totalPassengersDelivered = 0;
    this.state.stats.totalDays = 1;
    this.state.stats.todayPassengers = 0;
    this.state.stats.dailyHistory = [];
    this.state.currentDayIndex = 0;
    this.state.timeOfDayHours = 7.0;
    this.state.isGameOver = false;
    this.state.gameOverReason = null;

    // Set scenario budget & fleet
    this.state.money = scenario.initialMoney ?? 1500;
    this.state.inventory = {
      availableLines: scenario.initialLines ?? 3,
      unassignedTrains: scenario.initialTrains ?? 2,
      carriages: scenario.initialCarriages ?? 1,
      interchangeTokens: 1,
      tunnelTokens: 2
    };

    // Restore stations cleanly
    this.restoreDefaultStations();

    // Weather setup
    if (scenario.fixedWeather) {
      this.setWeather(scenario.fixedWeather);
    } else {
      this.setWeather('sunny');
    }

    // Set campaign state
    this.state.campaignState = {
      scenarioId: scenario.id,
      targetPassengers: scenario.targetPassengers,
      currentDelivered: 0,
      timeLimitDays: scenario.timeLimitDays,
      currentDay: 1,
      isWon: false,
      isFailed: false
    };

    soundEngine.playFanfare();
    const worldW = this.mapConfig.worldWidth || 2400;
    const worldH = this.mapConfig.worldHeight || 1700;
    this.addFloatingText(worldW / 2, worldH / 2, `🎯 BẮT ĐẦU: ${scenario.titleVi}`, '#F59E0B');
    return true;
  }

  // --- Persistence & Save System ---

  public serialize(): string {
    return JSON.stringify({
      version: 3,
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
      weather: this.state.weather,
      activeIncident: this.state.activeIncident,
      timestamp: Date.now()
    });
  }

  public restore(savedJson: string): boolean {
    try {
      const data = JSON.parse(savedJson);
      if (!data || !data.cityId || data.cityId !== this.mapConfig.id) {
        return false;
      }

      // If restoring Hanoi from old small version, start fresh with the grand new Hanoi map!
      if (this.mapConfig.id === 'hanoi' && (!data.version || data.version < 3)) {
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
          crowdedWarningsAvoided: data.stats.crowdedWarningsAvoided ?? 0,
          todayPassengers: data.stats.todayPassengers ?? 0,
          dailyHistory: Array.isArray(data.stats.dailyHistory) ? data.stats.dailyHistory : []
        };
      }

      if (Array.isArray(data.stations) && data.stations.length > 0) {
        this.state.stations = data.stations.map((s: Station) => ({
          ...s,
          passengers: Array.isArray(s.passengers) ? s.passengers : [],
          overcrowdedTimer: Math.min(0.5, s.overcrowdedTimer || 0), // avoid spawning directly into instant game over
          isOvercrowded: false,
          isFlooded: !!s.isFlooded
        }));
      }

      if (Array.isArray(data.lines)) {
        this.state.lines = data.lines.map((l: MetroLine) => ({
          ...l,
          type: l.type || 'metro'
        }));
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

      if (data.weather) {
        this.state.weather = {
          ...data.weather,
          current: data.weather.current || data.weather.type || 'sunny',
          type: data.weather.type || 'sunny'
        };
      }

      if (data.activeIncident) {
        if (typeof data.activeIncident.remainingSeconds === 'number' && data.activeIncident.remainingSeconds <= 0) {
          this.clearActiveIncident();
        } else if (this.state.weather.type !== 'flooded') {
          this.clearActiveIncident();
        } else {
          this.state.activeIncident = data.activeIncident;
        }
      } else if (this.state.weather.type !== 'flooded') {
        this.clearActiveIncident();
      }

      if (!this.state.inspectorState) {
        this.state.inspectorState = {
          status: 'idle',
          currentStationId: null,
          currentTrainId: null,
          targetLineId: null,
          visitedStationIds: [],
          timeRemaining: 90,
          cooldownRemaining: 0,
          targetCount: 5,
          rewardAmount: 1500
        };
      } else {
        this.state.inspectorState.rewardAmount = 300 * (this.state.inspectorState.targetCount || 5);
        this.state.inspectorState.targetCount = this.state.inspectorState.targetCount || 5;
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

