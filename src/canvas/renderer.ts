import {
  Station,
  MetroLine,
  Train,
  FloatingText,
  RiverPolygon,
  StationShape
} from '../types/game';
import {
  distance,
  getPerpendicularOffset,
  lerpPoint,
  Point,
  TrackRoutingStyle,
  TrackPolyline,
  generateTrackSegmentPoints,
  buildTrackPolyline,
  samplePolylineAtDistance,
  sampleQuadraticBezier
} from '../utils/geometry';

const textWidthCache = new Map<string, number>();

export interface RenderOptions {
  theme: 'dark' | 'light';
  selectedLineId: string | null;
  dragState: {
    isDragging: boolean;
    fromStationId: string | null;
    currentPos: Point | null;
    targetStationId: string | null;
    lineId: string | null;
  } | null;
  hoveredStationId: string | null;
  selectedStationId?: string | null;
  showStationNames: boolean;
  trackStyle?: TrackRoutingStyle;
}

export function drawShape(
  ctx: CanvasRenderingContext2D,
  shape: StationShape,
  x: number,
  y: number,
  size: number,
  fillColor: string,
  strokeColor?: string,
  lineWidth = 2.5
) {
  ctx.beginPath();
  switch (shape) {
    case 'circle': {
      ctx.arc(x, y, size, 0, Math.PI * 2);
      break;
    }
    case 'triangle': {
      ctx.moveTo(x, y - size * 1.25);
      ctx.lineTo(x + size * 1.1, y + size * 0.75);
      ctx.lineTo(x - size * 1.1, y + size * 0.75);
      ctx.closePath();
      break;
    }
    case 'square': {
      const r = size * 0.95;
      ctx.rect(x - r, y - r, r * 2, r * 2);
      break;
    }
    case 'diamond': {
      ctx.moveTo(x, y - size * 1.35);
      ctx.lineTo(x + size * 1.15, y);
      ctx.lineTo(x, y + size * 1.35);
      ctx.lineTo(x - size * 1.15, y);
      ctx.closePath();
      break;
    }
    case 'star': {
      const spikes = 5;
      const outerRadius = size * 1.35;
      const innerRadius = size * 0.62;
      let rot = (Math.PI / 2) * 3;
      const step = Math.PI / spikes;

      ctx.moveTo(x, y - outerRadius);
      for (let i = 0; i < spikes; i++) {
        let px = x + Math.cos(rot) * outerRadius;
        let py = y + Math.sin(rot) * outerRadius;
        ctx.lineTo(px, py);
        rot += step;

        px = x + Math.cos(rot) * innerRadius;
        py = y + Math.sin(rot) * innerRadius;
        ctx.lineTo(px, py);
        rot += step;
      }
      ctx.closePath();
      break;
    }
    case 'cross': {
      const s = size * 0.95;
      const t = size * 0.38;
      ctx.moveTo(x - t, y - s);
      ctx.lineTo(x + t, y - s);
      ctx.lineTo(x + t, y - t);
      ctx.lineTo(x + s, y - t);
      ctx.lineTo(x + s, y + t);
      ctx.lineTo(x + t, y + t);
      ctx.lineTo(x + t, y + s);
      ctx.lineTo(x - t, y + s);
      ctx.lineTo(x - t, y + t);
      ctx.lineTo(x - s, y + t);
      ctx.lineTo(x - s, y - t);
      ctx.lineTo(x - t, y - t);
      ctx.closePath();
      break;
    }
    case 'pentagon': {
      const sides = 5;
      const angle = (Math.PI * 2) / sides;
      ctx.moveTo(x + size * Math.cos(-Math.PI / 2), y + size * Math.sin(-Math.PI / 2));
      for (let i = 1; i <= sides; i++) {
        ctx.lineTo(
          x + size * Math.cos(-Math.PI / 2 + i * angle),
          y + size * Math.sin(-Math.PI / 2 + i * angle)
        );
      }
      ctx.closePath();
      break;
    }
  }

  ctx.fillStyle = fillColor;
  ctx.fill();

  if (strokeColor) {
    ctx.strokeStyle = strokeColor;
    ctx.lineWidth = lineWidth;
    ctx.stroke();
  }
}

export function renderScene(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  rivers: RiverPolygon[],
  stations: Station[],
  lines: MetroLine[],
  trains: Train[],
  floatingTexts: FloatingText[],
  options: RenderOptions
) {
  const isDark = options.theme === 'dark';
  
  // Refined transit paper palette
  const bgColor = isDark ? '#0F172A' : '#FAF9F6'; // deep navy slate / warm ivory transit paper
  const waterColor = isDark ? '#1E293B' : '#E0F2FE';
  const waterBorderColor = isDark ? '#334155' : '#BAE6FD';
  const stationFillColor = isDark ? '#FFFFFF' : '#0F172A';
  const stationBorderColor = isDark ? '#090D16' : '#FFFFFF';
  const textColor = isDark ? '#F1F5F9' : '#0F172A';

  ctx.clearRect(0, 0, width, height);

  // Background
  ctx.fillStyle = bgColor;
  ctx.fillRect(0, 0, width, height);

  // Subtle architectural grid dots (single batched path for ultra-fast 60fps performance)
  ctx.fillStyle = isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.05)';
  ctx.beginPath();
  const gridSize = 64;
  for (let x = 32; x < width; x += gridSize) {
    for (let y = 32; y < height; y += gridSize) {
      ctx.rect(x - 1, y - 1, 2, 2);
    }
  }
  ctx.fill();

  // Draw Water / Rivers
  for (const river of rivers) {
    if (river.points.length < 3) continue;
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(river.points[0].x, river.points[0].y);
    for (let i = 1; i < river.points.length; i++) {
      ctx.lineTo(river.points[i].x, river.points[i].y);
    }
    ctx.closePath();
    ctx.fillStyle = waterColor;
    ctx.fill();

    ctx.strokeStyle = waterBorderColor;
    ctx.lineWidth = 2.5;
    ctx.stroke();
    ctx.restore();
  }

  const stationMap = new Map<string, Station>(stations.map(s => [s.id, s]));

  // Build canonical segment-to-lines mapping to separate parallel corridors
  // Maps canonical `${minId}_${maxId}` -> list of line IDs sharing this corridor
  const segmentLinesMap = new Map<string, string[]>();

  lines.forEach(line => {
    if (line.stationIds.length < 2) return;
    const sIds = line.stationIds;
    const segCount = line.isLoop ? sIds.length : sIds.length - 1;
    for (let i = 0; i < segCount; i++) {
      const u = sIds[i];
      const v = (i === sIds.length - 1 && line.isLoop) ? sIds[0] : sIds[i + 1];
      const key = u < v ? `${u}_${v}` : `${v}_${u}`;
      const list = segmentLinesMap.get(key) || [];
      if (!list.includes(line.id)) {
        list.push(line.id);
        segmentLinesMap.set(key, list);
      }
    }
  });

  // Calculate deterministic parallel offset for any line segment
  // Canonical station ordering ensures normal vector is invariant of traversal direction
  const getLineSegmentOffset = (lineId: string, st1: Station, st2: Station): Point => {
    const key = st1.id < st2.id ? `${st1.id}_${st2.id}` : `${st2.id}_${st1.id}`;
    const lineList = segmentLinesMap.get(key);
    if (!lineList || lineList.length <= 1) return { x: 0, y: 0 };

    const total = lineList.length;
    const idx = lineList.indexOf(lineId);
    if (idx === -1) return { x: 0, y: 0 };

    const spacing = 11;
    const offsetDist = (idx - (total - 1) / 2) * spacing;

    const canonicalA = st1.id < st2.id ? st1 : st2;
    const canonicalB = st1.id < st2.id ? st2 : st1;

    return getPerpendicularOffset(canonicalA, canonicalB, offsetDist);
  };

  const trackStyle = options.trackStyle || 'curved';

  // Build full line geometries with smooth curves, octolinear bends, and anti-overlap station bridges
  interface LineTrackGeometry {
    lineId: string;
    segments: {
      polyline: TrackPolyline;
      uId: string;
      vId: string;
    }[];
    renderPolylines: Point[][];
    terminusStart?: Point;
    terminusEnd?: Point;
  }

  const lineGeometries = new Map<string, LineTrackGeometry>();

  lines.forEach(line => {
    if (line.stationIds.length < 2) return;
    const sIds = line.stationIds;
    const totalSegs = line.isLoop ? sIds.length : sIds.length - 1;
    const segments: { polyline: TrackPolyline; uId: string; vId: string }[] = [];
    const renderPolylines: Point[][] = [];

    for (let i = 0; i < totalSegs; i++) {
      const uId = sIds[i];
      const vId = (i === sIds.length - 1 && line.isLoop) ? sIds[0] : sIds[i + 1];
      const s1 = stationMap.get(uId);
      const s2 = stationMap.get(vId);
      if (!s1 || !s2) continue;

      const perp = getLineSegmentOffset(line.id, s1, s2);
      const pA = { x: s1.x + perp.x, y: s1.y + perp.y };
      const pB = { x: s2.x + perp.x, y: s2.y + perp.y };

      // Compute continuous smooth tangents for C1 curvature
      let tangentA: Point | undefined;
      let tangentB: Point | undefined;

      if (trackStyle === 'curved') {
        let prevId: string | null = null;
        if (i > 0) prevId = sIds[i - 1];
        else if (line.isLoop) prevId = sIds[sIds.length - 1];

        if (prevId) {
          const sPrev = stationMap.get(prevId);
          if (sPrev) {
            const dx = s2.x - sPrev.x;
            const dy = s2.y - sPrev.y;
            const len = Math.hypot(dx, dy);
            if (len > 0.001) tangentA = { x: dx / len, y: dy / len };
          }
        }

        let nextId: string | null = null;
        if (i + 1 < sIds.length - 1) nextId = sIds[i + 2];
        else if (line.isLoop) nextId = sIds[(i + 2) % sIds.length];

        if (nextId) {
          const sNext = stationMap.get(nextId);
          if (sNext) {
            const dx = sNext.x - s1.x;
            const dy = sNext.y - s1.y;
            const len = Math.hypot(dx, dy);
            if (len > 0.001) tangentB = { x: dx / len, y: dy / len };
          }
        }
      }

      const segPts = generateTrackSegmentPoints(pA, pB, trackStyle, tangentA, tangentB);
      const poly = buildTrackPolyline(segPts);
      segments.push({ polyline: poly, uId, vId });
      renderPolylines.push(segPts);

      // Smooth bridge curve through station platform between consecutive corridors
      if (segments.length > 1) {
        const prevPolyPts = segments[segments.length - 2].polyline.points;
        const prevEndPt = prevPolyPts[prevPolyPts.length - 1];
        if (distance(prevEndPt, pA) > 0.5) {
          const bridgePts = sampleQuadraticBezier(prevEndPt, { x: s1.x, y: s1.y }, pA, 6);
          renderPolylines.push(bridgePts);
        }
      }
    }

    // Connect loop closure at origin station
    if (line.isLoop && segments.length > 2) {
      const lastPolyPts = segments[segments.length - 1].polyline.points;
      const firstPolyPts = segments[0].polyline.points;
      const lastEndPt = lastPolyPts[lastPolyPts.length - 1];
      const firstStartPt = firstPolyPts[0];
      const s0 = stationMap.get(sIds[0]);
      if (s0 && distance(lastEndPt, firstStartPt) > 0.5) {
        const bridgePts = sampleQuadraticBezier(lastEndPt, { x: s0.x, y: s0.y }, firstStartPt, 6);
        renderPolylines.push(bridgePts);
      }
    }

    let terminusStart: Point | undefined;
    let terminusEnd: Point | undefined;
    if (!line.isLoop && segments.length > 0) {
      const firstPts = segments[0].polyline.points;
      const lastPts = segments[segments.length - 1].polyline.points;
      if (firstPts.length > 0) terminusStart = firstPts[0];
      if (lastPts.length > 0) terminusEnd = lastPts[lastPts.length - 1];
    }

    lineGeometries.set(line.id, {
      lineId: line.id,
      segments,
      renderPolylines,
      terminusStart,
      terminusEnd
    });
  });

  // 1. Draw Metro Track Lines (Underlay Casing + Vibrant Color)
  lines.forEach(line => {
    const geom = lineGeometries.get(line.id);
    if (!geom || geom.renderPolylines.length === 0) return;
    const isSelected = options.selectedLineId === line.id;

    // A. Outer contrast casing (makes lines pop sharply against rivers & background)
    ctx.save();
    ctx.strokeStyle = isDark ? 'rgba(0,0,0,0.5)' : 'rgba(255,255,255,0.85)';
    ctx.lineWidth = isSelected ? 11 : 9;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    for (const pts of geom.renderPolylines) {
      if (pts.length < 2) continue;
      ctx.beginPath();
      ctx.moveTo(pts[0].x, pts[0].y);
      for (let k = 1; k < pts.length; k++) {
        ctx.lineTo(pts[k].x, pts[k].y);
      }
      ctx.stroke();
    }
    ctx.restore();

    // B. Main vibrant transit line
    ctx.save();
    ctx.strokeStyle = line.color;
    ctx.lineWidth = isSelected ? 8 : 6.5;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    if (isSelected) {
      ctx.shadowColor = line.color;
      ctx.shadowBlur = 14;
    }

    for (const pts of geom.renderPolylines) {
      if (pts.length < 2) continue;
      ctx.beginPath();
      ctx.moveTo(pts[0].x, pts[0].y);
      for (let k = 1; k < pts.length; k++) {
        ctx.lineTo(pts[k].x, pts[k].y);
      }
      ctx.stroke();
    }

    // Terminal station stops (clean crossbar terminus if not loop)
    if (geom.terminusStart && geom.terminusEnd) {
      ctx.fillStyle = line.color;
      ctx.beginPath();
      ctx.arc(geom.terminusStart.x, geom.terminusStart.y, 4.5, 0, Math.PI * 2);
      ctx.arc(geom.terminusEnd.x, geom.terminusEnd.y, 4.5, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.restore();
  });

  // 2. Drag Route Creation Preview (Live smooth curve / octolinear guide)
  if (options.dragState && options.dragState.isDragging && options.dragState.fromStationId && options.dragState.currentPos) {
    const fromStation = stationMap.get(options.dragState.fromStationId);
    if (fromStation) {
      const targetStation = options.dragState.targetStationId ? stationMap.get(options.dragState.targetStationId) : null;
      const toPos = targetStation ? { x: targetStation.x, y: targetStation.y } : options.dragState.currentPos;
      const activeLine = lines.find(l => l.id === options.dragState?.lineId);
      const dragColor = activeLine ? activeLine.color : '#3B82F6';

      const previewPts = generateTrackSegmentPoints(fromStation, toPos, trackStyle);

      ctx.save();
      // Outer glow
      ctx.strokeStyle = dragColor;
      ctx.lineWidth = 5.5;
      ctx.setLineDash([10, 6]);
      ctx.beginPath();
      if (previewPts.length > 0) {
        ctx.moveTo(previewPts[0].x, previewPts[0].y);
        for (let k = 1; k < previewPts.length; k++) {
          ctx.lineTo(previewPts[k].x, previewPts[k].y);
        }
      }
      ctx.stroke();
      ctx.setLineDash([]);

      // Magnet handle
      ctx.fillStyle = dragColor;
      ctx.beginPath();
      ctx.arc(toPos.x, toPos.y, targetStation ? 16 : 8, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#FFFFFF';
      ctx.lineWidth = 2.5;
      ctx.stroke();
      ctx.restore();
    }
  }

  // 3. Draw High-End Metro Trains with Realistic Multi-Car Track Following & Articulated Coupling
  const carLength = 30;
  const carWidth = 15;
  const gap = 5;
  const carSpacing = carLength + gap;

  trains.forEach(train => {
    const line = lines.find(l => l.id === train.lineId);
    if (!line || line.stationIds.length < 2) return;

    const geom = lineGeometries.get(train.lineId);
    if (!geom || geom.segments.length === 0) return;

    const totalSegments = geom.segments.length;
    const segIdx = Math.min(train.segmentIndex, totalSegments - 1);
    const currSeg = geom.segments[segIdx];
    const segPoly = currSeg.polyline;
    const segLen = Math.max(1, segPoly.totalLength);

    // Endpoints in travel direction
    // Train progress 0..1 along current segment polyline
    const leadDist = train.direction === 1
      ? train.progress * segLen
      : (1 - train.progress) * segLen;

    const totalCars = 1 + train.carriagesCount;
    interface CarTransform {
      x: number;
      y: number;
      angle: number;
    }
    const carTransforms: CarTransform[] = [];

    // Calculate realistic track position for lead locomotive and every carriage
    for (let c = 0; c < totalCars; c++) {
      const carDistBehindLead = c * carSpacing;
      const targetDist = train.direction === 1
        ? leadDist - carDistBehindLead
        : leadDist + carDistBehindLead;

      if (targetDist >= 0 && targetDist <= segLen) {
        // Car is on the current segment
        const sampled = samplePolylineAtDistance(segPoly, targetDist);
        const angle = train.direction === 1 ? sampled.angle : sampled.angle + Math.PI;
        carTransforms.push({
          x: sampled.x,
          y: sampled.y,
          angle
        });
      } else {
        // Car extends backwards onto previous segment(s) along the line's railway track
        let remDist = targetDist < 0 ? -targetDist : targetDist - segLen;
        let scanSeg = segIdx;
        let found = false;

        for (let step = 0; step < 8; step++) {
          let prevSeg: number;
          if (train.direction === 1) {
            prevSeg = line.isLoop ? (scanSeg - 1 + totalSegments) % totalSegments : scanSeg - 1;
          } else {
            prevSeg = line.isLoop ? (scanSeg + 1) % totalSegments : scanSeg + 1;
          }

          // If at terminus (no previous segment on non-loop line)
          if (prevSeg < 0 || prevSeg >= totalSegments) {
            // Keep carriage safely on the track anchored at terminus
            const clampedDist = train.direction === 1 ? 0 : segLen;
            const sampled = samplePolylineAtDistance(segPoly, clampedDist);
            const angle = train.direction === 1 ? sampled.angle : sampled.angle + Math.PI;
            carTransforms.push({
              x: sampled.x,
              y: sampled.y,
              angle
            });
            found = true;
            break;
          }

          const prevSegPoly = geom.segments[prevSeg].polyline;
          const pLen = Math.max(1, prevSegPoly.totalLength);

          if (remDist <= pLen) {
            const pDist = train.direction === 1 ? pLen - remDist : remDist;
            const sampled = samplePolylineAtDistance(prevSegPoly, pDist);
            const angle = train.direction === 1 ? sampled.angle : sampled.angle + Math.PI;
            carTransforms.push({
              x: sampled.x,
              y: sampled.y,
              angle
            });
            found = true;
            break;
          } else {
            remDist -= pLen;
            scanSeg = prevSeg;
          }
        }

        if (!found) {
          const fallback = samplePolylineAtDistance(segPoly, train.direction === 1 ? 0 : segLen);
          const angle = train.direction === 1 ? fallback.angle : fallback.angle + Math.PI;
          carTransforms.push({
            x: fallback.x,
            y: fallback.y,
            angle
          });
        }
      }
    }

    if (carTransforms.length === 0) return;

    // Draw articulated metallic couplings between adjacent carriages
    for (let c = 1; c < carTransforms.length; c++) {
      const prevCar = carTransforms[c - 1];
      const currCar = carTransforms[c];

      const prevRearX = prevCar.x - Math.cos(prevCar.angle) * (carLength / 2);
      const prevRearY = prevCar.y - Math.sin(prevCar.angle) * (carLength / 2);
      const currFrontX = currCar.x + Math.cos(currCar.angle) * (carLength / 2);
      const currFrontY = currCar.y + Math.sin(currCar.angle) * (carLength / 2);

      ctx.strokeStyle = '#334155';
      ctx.lineWidth = 4;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(prevRearX, prevRearY);
      ctx.lineTo(currFrontX, currFrontY);
      ctx.stroke();

      ctx.strokeStyle = '#0F172A';
      ctx.lineWidth = 1.8;
      ctx.beginPath();
      ctx.moveTo(prevRearX, prevRearY);
      ctx.lineTo(currFrontX, currFrontY);
      ctx.stroke();
    }

    // Draw each car individually oriented and aligned along the track
    carTransforms.forEach((car, c) => {
      ctx.save();
      ctx.translate(car.x, car.y);
      ctx.rotate(car.angle);

      // Car body drop shadow
      ctx.shadowColor = 'rgba(0,0,0,0.3)';
      ctx.shadowBlur = 6;
      ctx.shadowOffsetY = 2;

      // Outer car shell (Pure crisp white with clean metallic border)
      ctx.fillStyle = '#FFFFFF';
      ctx.beginPath();
      ctx.roundRect(-carLength / 2, -carWidth / 2, carLength, carWidth, 4);
      ctx.fill();

      ctx.shadowColor = 'transparent';
      ctx.shadowBlur = 0;

      // Dark rim border
      ctx.strokeStyle = '#1E293B';
      ctx.lineWidth = 1.8;
      ctx.stroke();

      // Bold accent stripe in metro line color
      ctx.fillStyle = line.color;
      ctx.beginPath();
      ctx.roundRect(-carLength / 2 + 3, -carWidth / 2 + 2.5, carLength - 6, 3, 1);
      ctx.fill();

      // Front locomotive cab details
      if (c === 0) {
        // Headlight soft ambient light cone
        const beamGrad = ctx.createRadialGradient(carLength / 2, 0, 4, carLength / 2 + 25, 0, 35);
        beamGrad.addColorStop(0, 'rgba(254, 240, 138, 0.45)');
        beamGrad.addColorStop(1, 'rgba(254, 240, 138, 0)');
        ctx.fillStyle = beamGrad;
        ctx.beginPath();
        ctx.moveTo(carLength / 2, -3);
        ctx.lineTo(carLength / 2 + 35, -16);
        ctx.lineTo(carLength / 2 + 35, 16);
        ctx.lineTo(carLength / 2, 3);
        ctx.closePath();
        ctx.fill();

        // Windshield glass
        ctx.fillStyle = '#0F172A';
        ctx.beginPath();
        ctx.roundRect(carLength / 2 - 6, -4, 4.5, 8, 1.5);
        ctx.fill();

        // Dual luminous headlights
        ctx.fillStyle = '#FEF08A';
        ctx.beginPath();
        ctx.arc(carLength / 2 - 1, -4.5, 1.6, 0, Math.PI * 2);
        ctx.arc(carLength / 2 - 1, 4.5, 1.6, 0, Math.PI * 2);
        ctx.fill();
      }

      // Commuters riding inside carriage
      const passengersPerCar = 4;
      const startPassengerIdx = c * passengersPerCar;
      const endPassengerIdx = Math.min(train.passengers.length, startPassengerIdx + passengersPerCar);

      for (let pIdx = startPassengerIdx; pIdx < endPassengerIdx; pIdx++) {
        const passenger = train.passengers[pIdx];
        const localPIdx = pIdx - startPassengerIdx;
        const px = -carLength / 2 + 6 + localPIdx * 5.8;
        const py = 2.5;
        drawShape(ctx, passenger.targetShape, px, py, 2.3, line.color, '#0F172A', 0.8);
      }

      ctx.restore();
    });
  });

  // 4. Draw Stations with High-Precision Geometry & Dual Overcrowd Progress Gauges
  stations.forEach(station => {
    const isHovered = options.hoveredStationId === station.id;
    const isSelected = options.selectedStationId === station.id;
    const baseRadius = station.isInterchange ? 20 : 15;

    ctx.save();

    // Selected Station beacon / glowing double ring
    if (isSelected) {
      ctx.beginPath();
      ctx.arc(station.x, station.y, baseRadius + 14, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(6, 182, 212, 0.25)';
      ctx.fill();

      ctx.beginPath();
      ctx.arc(station.x, station.y, baseRadius + 10, 0, Math.PI * 2);
      ctx.strokeStyle = '#06B6D4';
      ctx.lineWidth = 3;
      ctx.stroke();
    }

    // Hover halo
    if (isHovered && !isSelected) {
      ctx.beginPath();
      ctx.arc(station.x, station.y, baseRadius + 9, 0, Math.PI * 2);
      ctx.fillStyle = isDark ? 'rgba(255,255,255,0.18)' : 'rgba(0,0,0,0.08)';
      ctx.fill();
    }

    // Interchange Hub double ring & amber star badge
    if (station.isInterchange) {
      ctx.beginPath();
      ctx.arc(station.x, station.y, baseRadius + 7, 0, Math.PI * 2);
      ctx.strokeStyle = '#F59E0B';
      ctx.lineWidth = 3;
      ctx.stroke();

      ctx.fillStyle = 'rgba(245, 158, 11, 0.15)';
      ctx.fill();
    }

    // Dual-Stage Circular Progress Gauges:
    // 1. Early-warning Passenger Occupancy Ring (Visible whenever passengers are waiting)
    const passengerCount = station.passengers.length;
    const maxCap = station.maxCapacity;
    const occupancy = Math.min(1.0, passengerCount / maxCap);
    const gaugeRadius = baseRadius + 6;

    if (passengerCount > 0) {
      // Subtle background ring track
      ctx.beginPath();
      ctx.arc(station.x, station.y, gaugeRadius, 0, Math.PI * 2);
      ctx.strokeStyle = isDark ? 'rgba(255, 255, 255, 0.12)' : 'rgba(0, 0, 0, 0.1)';
      ctx.lineWidth = 3.5;
      ctx.stroke();

      // Progress Arc: 12 o'clock (-Math.PI/2) filling clockwise
      const startAngle = -Math.PI / 2;
      const endAngle = startAngle + Math.PI * 2 * occupancy;

      let arcColor = '#10B981'; // Green: healthy capacity (< 60%)
      if (occupancy >= 0.85) {
        arcColor = '#EF4444'; // Red: near or at capacity (>= 85%)
      } else if (occupancy >= 0.6) {
        arcColor = '#F59E0B'; // Amber: moderate load (60% - 85%)
      }

      ctx.beginPath();
      ctx.arc(station.x, station.y, gaugeRadius, startAngle, endAngle);
      ctx.strokeStyle = arcColor;
      ctx.lineWidth = 3.5;
      ctx.lineCap = 'round';
      ctx.stroke();
    }

    // 2. Critical Overcrowding Countdown Ring (Mini Metro game-over timer)
    if (station.overcrowdedTimer > 0.02 || station.isOvercrowded) {
      const dangerRadius = baseRadius + 11.5;
      const timerProgress = Math.min(1.0, Math.max(0.05, station.overcrowdedTimer));
      const isUrgent = station.overcrowdedTimer > 0.65;

      // Danger track ring
      ctx.beginPath();
      ctx.arc(station.x, station.y, dangerRadius, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(239, 68, 68, 0.25)';
      ctx.lineWidth = 4;
      ctx.stroke();

      // Urgent countdown arc filling to 100%
      ctx.beginPath();
      ctx.arc(
        station.x,
        station.y,
        dangerRadius,
        -Math.PI / 2,
        -Math.PI / 2 + Math.PI * 2 * timerProgress
      );
      ctx.strokeStyle = '#EF4444';
      ctx.lineWidth = 4.5;
      ctx.lineCap = 'round';
      ctx.stroke();

      // Pulsing alert ring when close to failure
      if (isUrgent) {
        const pulse = 1 + Math.sin(Date.now() / 120) * 0.15;
        ctx.beginPath();
        ctx.arc(station.x, station.y, dangerRadius * pulse, 0, Math.PI * 2);
        ctx.strokeStyle = 'rgba(239, 68, 68, 0.6)';
        ctx.lineWidth = 2.5;
        ctx.stroke();
      }

      // Overload Danger Badge above station (shows current load vs max capacity)
      const badgeY = station.y - baseRadius - 14;
      const badgeText = `${passengerCount}/${maxCap}`;

      ctx.font = '800 10px "JetBrains Mono", monospace';
      const badgeW = ctx.measureText(badgeText).width + 10;

      ctx.fillStyle = '#EF4444';
      ctx.beginPath();
      ctx.roundRect(station.x - badgeW / 2, badgeY - 7, badgeW, 14, 7);
      ctx.fill();

      ctx.strokeStyle = '#FFFFFF';
      ctx.lineWidth = 1.2;
      ctx.stroke();

      ctx.fillStyle = '#FFFFFF';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(badgeText, station.x, badgeY);
    }

    // Station Drop Shadow
    ctx.shadowColor = 'rgba(0, 0, 0, 0.35)';
    ctx.shadowBlur = 8;
    ctx.shadowOffsetY = 3;

    // Station Main Geometry
    drawShape(
      ctx,
      station.shape,
      station.x,
      station.y,
      baseRadius,
      stationFillColor,
      stationBorderColor,
      station.isInterchange ? 4.5 : 3.8
    );

    ctx.shadowColor = 'transparent';
    ctx.shadowBlur = 0;

    // Station Name Tag
    if (options.showStationNames) {
      ctx.font = '700 11.5px "Plus Jakarta Sans", sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';

      const name = station.name;
      let textW = textWidthCache.get(name);
      if (textW === undefined) {
        textW = ctx.measureText(name).width + 12;
        textWidthCache.set(name, textW);
      }
      const tagY = station.y + baseRadius + 7;

      // Backdrop pill
      ctx.fillStyle = isDark ? 'rgba(15, 23, 42, 0.88)' : 'rgba(255, 255, 255, 0.94)';
      ctx.beginPath();
      ctx.roundRect(station.x - textW / 2, tagY - 2, textW, 18, 5);
      ctx.fill();

      // Pill border
      ctx.strokeStyle = isDark ? 'rgba(255, 255, 255, 0.15)' : 'rgba(0, 0, 0, 0.1)';
      ctx.lineWidth = 1;
      ctx.stroke();

      ctx.fillStyle = textColor;
      ctx.fillText(name, station.x, tagY);
    }

    // Waiting Passengers
    if (station.passengers.length > 0) {
      const pSize = 4.2;
      const pSpacing = 12;
      const maxCols = 4;
      const startX = station.x + baseRadius + 8;
      const startY = station.y - baseRadius;

      station.passengers.forEach((passenger, pIdx) => {
        const col = pIdx % maxCols;
        const row = Math.floor(pIdx / maxCols);
        const px = startX + col * pSpacing;
        const py = startY + row * pSpacing;

        drawShape(
          ctx,
          passenger.targetShape,
          px,
          py,
          pSize,
          isDark ? '#F8FAFC' : '#0F172A',
          isDark ? '#090D16' : '#FFFFFF',
          1.2
        );
      });
    }

    ctx.restore();
  });

  // 5. Draw Floating Money / Reward Pings
  floatingTexts.forEach(ft => {
    ctx.save();
    ctx.font = '800 14px "JetBrains Mono", monospace';
    ctx.fillStyle = ft.color;
    ctx.globalAlpha = Math.max(0, Math.min(1, ft.life));
    ctx.textAlign = 'center';
    ctx.shadowColor = ft.color;
    ctx.shadowBlur = 8;
    ctx.fillText(ft.text, ft.x, ft.y);
    ctx.restore();
  });
}
