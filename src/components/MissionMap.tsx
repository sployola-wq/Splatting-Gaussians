import React, { useCallback, useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import {
  Compass,
  Crosshair,
  Home,
  Layers,
  MapPin,
  Pentagon,
  CircleDot,
  Square,
  Sparkles,
  Search,
  Trash2,
  BatteryCharging,
  Navigation,
  Pause,
  Play,
  RotateCcw,
  Check,
  Undo2,
  Plus,
  X,
} from 'lucide-react';
import {
  DrawToolMode,
  LatLng,
  MissionConfig,
  MissionMetrics,
  MissionWaypoint,
} from '../types/mission';
import {
  createCirclePolygon,
  degToRad,
  distanceMeters,
  xyToLatLng,
} from '../utils/missionEngine';
import { INITIAL_MAP_CENTER, INITIAL_MAP_ZOOM } from '../constants/drones';

interface MissionMapProps {
  polygon: LatLng[];
  onChangePolygon: (poly: LatLng[]) => void;
  homePoint: LatLng | null;
  onChangeHomePoint: (pt: LatLng | null) => void;
  waypoints: MissionWaypoint[];
  metrics: MissionMetrics;
  config: MissionConfig;
  drawMode: DrawToolMode;
  onChangeDrawMode: (mode: DrawToolMode) => void;
  onClearAll: () => void;
  isSimulating: boolean;
  onToggleSimulation: (val: boolean) => void;
  flyToTarget: { center: LatLng; zoom?: number; ts: number } | null;
}

const PHASE_COLORS: Record<string, string> = {
  orbit_inner: '#06b6d4', // Cyan
  grid_nadir: '#10b981', // Emerald Green
  grid_cross: '#8b5cf6', // Violet
  orbit_outer: '#f59e0b', // Amber
  anchor: '#ec4899', // Pink
  imported: '#38bdf8', // Sky Blue
};

const PHASE_NAMES: Record<string, string> = {
  orbit_inner: 'Fase 1: Órbita Interna (-75° POI)',
  grid_nadir: 'Fase 2: Grilla Central (-90° Nadir)',
  grid_cross: 'Fase 2B: Grilla Cruzada Oblicua',
  orbit_outer: 'Fase 3: Órbita Externa (-45° Fachadas)',
  anchor: 'Ancla de Estabilización',
  imported: 'Ruta Importada WPML',
};

export const MissionMap: React.FC<MissionMapProps> = ({
  polygon,
  onChangePolygon,
  homePoint,
  onChangeHomePoint,
  waypoints,
  metrics,
  config,
  drawMode,
  onChangeDrawMode,
  onClearAll,
  isSimulating,
  onToggleSimulation,
  flyToTarget,
}) => {
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const canvasRendererRef = useRef<L.Canvas | null>(null);
  const layersGroupRef = useRef<L.LayerGroup | null>(null);
  const vertexMarkersRef = useRef<L.LayerGroup | null>(null);
  const simMarkerRef = useRef<L.Marker | null>(null);
  const simFovPolygonRef = useRef<L.Polygon | null>(null);
  const tempShapeLayerRef = useRef<L.LayerGroup | null>(null);

  const [mapStyle, setMapStyle] = useState<'satellite' | 'osm'>('satellite');
  const tileLayersRef = useRef<{
    esriSat?: L.TileLayer;
    esriLabels?: L.TileLayer;
    osm?: L.TileLayer;
  }>({});

  // Search state
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);

  // Interactive free-polygon draft points (while drawMode === 'polygon')
  const [draftPolygon, setDraftPolygon] = useState<LatLng[]>([]);

  // Interactive rectangle / circle two-click state
  const [shapeAnchor, setShapeAnchor] = useState<LatLng | null>(null);
  const [hoverLatLng, setHoverLatLng] = useState<LatLng | null>(null);

  // Simulation state
  const [simProgressIdx, setSimProgressIdx] = useState<number>(0);
  const [simSpeedMultiplier, setSimSpeedMultiplier] = useState<number>(4);

  // Function to finalize the draft polygon (only when >= 3 points)
  const finishDraftPolygon = useCallback(
    (pointsToCommit?: LatLng[]) => {
      const pts = pointsToCommit ?? draftPolygon;
      if (pts.length >= 3) {
        onChangePolygon(pts);
        setDraftPolygon([]);
        onChangeDrawMode('none');
      }
    },
    [draftPolygon, onChangePolygon, onChangeDrawMode]
  );

  // Insert a new vertex into the existing closed polygon (on its longest edge)
  const handleInsertVertexOnLongestEdge = () => {
    if (polygon.length < 3) return;
    let maxDist = -1;
    let insertIdx = 0;
    let midPoint: LatLng = polygon[0];

    for (let i = 0; i < polygon.length; i++) {
      const a = polygon[i];
      const b = polygon[(i + 1) % polygon.length];
      const d = distanceMeters(a, b);
      if (d > maxDist) {
        maxDist = d;
        insertIdx = i + 1;
        midPoint = {
          lat: Number(((a.lat + b.lat) / 2).toFixed(7)),
          lng: Number(((a.lng + b.lng) / 2).toFixed(7)),
        };
      }
    }

    const updated = [...polygon];
    updated.splice(insertIdx, 0, midPoint);
    onChangePolygon(updated);
  };

  // Generate a clean 100m x 100m base polygon at the exact center of the current map viewport without jumping regions
  const handleCreateBasePolygonAtViewport = () => {
    const map = mapRef.current;
    const centerObj = map ? map.getCenter() : INITIAL_MAP_CENTER;
    const center: LatLng = {
      lat: Number(centerObj.lat.toFixed(7)),
      lng: Number(centerObj.lng.toFixed(7)),
    };

    const halfSideM = 50; // 100m x 100m square
    const nw = xyToLatLng(-halfSideM, halfSideM, center);
    const ne = xyToLatLng(halfSideM, halfSideM, center);
    const se = xyToLatLng(halfSideM, -halfSideM, center);
    const sw = xyToLatLng(-halfSideM, -halfSideM, center);

    setDraftPolygon([]);
    onChangeDrawMode('none');
    onChangePolygon([
      { lat: Number(nw.lat.toFixed(7)), lng: Number(nw.lng.toFixed(7)) },
      { lat: Number(ne.lat.toFixed(7)), lng: Number(ne.lng.toFixed(7)) },
      { lat: Number(se.lat.toFixed(7)), lng: Number(se.lng.toFixed(7)) },
      { lat: Number(sw.lat.toFixed(7)), lng: Number(sw.lng.toFixed(7)) },
    ]);
  };

  // Keyboard shortcuts while drawing polygon (Enter = Finalize, Escape = Cancel, Backspace = Undo last point)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (drawMode === 'polygon') {
        if (e.key === 'Enter' && draftPolygon.length >= 3) {
          e.preventDefault();
          finishDraftPolygon();
        } else if (e.key === 'Escape') {
          e.preventDefault();
          setDraftPolygon([]);
          onChangeDrawMode('none');
        } else if (
          (e.key === 'Backspace' || e.key === 'Delete') &&
          draftPolygon.length > 0 &&
          document.activeElement?.tagName !== 'INPUT'
        ) {
          e.preventDefault();
          setDraftPolygon((prev) => prev.slice(0, -1));
        }
      } else if (drawMode !== 'none' && e.key === 'Escape') {
        setShapeAnchor(null);
        onChangeDrawMode('none');
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [drawMode, draftPolygon, finishDraftPolygon, onChangeDrawMode]);

  // Keep latest state in ref for Leaflet native event listeners
  const stateRef = useRef({
    polygon,
    draftPolygon,
    drawMode,
    shapeAnchor,
    onChangePolygon,
    onChangeHomePoint,
    onChangeDrawMode,
    finishDraftPolygon,
  });

  useEffect(() => {
    stateRef.current = {
      polygon,
      draftPolygon,
      drawMode,
      shapeAnchor,
      onChangePolygon,
      onChangeHomePoint,
      onChangeDrawMode,
      finishDraftPolygon,
    };
  }, [
    polygon,
    draftPolygon,
    drawMode,
    shapeAnchor,
    onChangePolygon,
    onChangeHomePoint,
    onChangeDrawMode,
    finishDraftPolygon,
  ]);

  // Enable/Disable doubleClickZoom depending on whether we are drawing
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (drawMode === 'none') {
      map.doubleClickZoom.enable();
    } else {
      map.doubleClickZoom.disable();
    }
  }, [drawMode]);

  // Reset temporary anchors & draft points when switching draw modes
  useEffect(() => {
    setShapeAnchor(null);
    if (drawMode !== 'polygon') {
      setDraftPolygon([]);
    }
  }, [drawMode]);

  // Initialize Leaflet Map with Canvas Renderer
  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) return;

    const canvasRenderer = L.canvas({ padding: 0.5 });
    canvasRendererRef.current = canvasRenderer;

    const map = L.map(mapContainerRef.current, {
      center: [INITIAL_MAP_CENTER.lat, INITIAL_MAP_CENTER.lng],
      zoom: INITIAL_MAP_ZOOM,
      zoomControl: false,
      preferCanvas: true,
      renderer: canvasRenderer,
    });

    L.control.zoom({ position: 'bottomright' }).addTo(map);

    const esriSat = L.tileLayer(
      'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
      {
        maxZoom: 20,
        attribution:
          'Tiles &copy; Esri &mdash; Source: Esri, Maxar, Earthstar Geographics',
      }
    );

    const esriLabels = L.tileLayer(
      'https://services.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}',
      {
        maxZoom: 20,
        opacity: 0.85,
      }
    );

    const osm = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; OpenStreetMap contributors',
    });

    esriSat.addTo(map);
    esriLabels.addTo(map);

    tileLayersRef.current = { esriSat, esriLabels, osm };
    layersGroupRef.current = L.layerGroup().addTo(map);
    tempShapeLayerRef.current = L.layerGroup().addTo(map);
    vertexMarkersRef.current = L.layerGroup().addTo(map);

    // Map single click handler for interactive drawing tools
    map.on('click', (e: L.LeafletMouseEvent) => {
      const {
        draftPolygon: currDraft,
        drawMode: mode,
        shapeAnchor: anchor,
        onChangePolygon: setPoly,
        onChangeHomePoint: setHome,
        onChangeDrawMode: setMode,
        finishDraftPolygon: commitDraft,
      } = stateRef.current;

      const clicked: LatLng = {
        lat: Number(e.latlng.lat.toFixed(7)),
        lng: Number(e.latlng.lng.toFixed(7)),
      };

      if (mode === 'polygon') {
        // Check if user clicked near the first vertex to close the polygon (when >= 3 vertices exist)
        if (currDraft.length >= 3) {
          const firstPt = currDraft[0];
          const p1Screen = map.latLngToContainerPoint([firstPt.lat, firstPt.lng]);
          const pClickScreen = map.latLngToContainerPoint(e.latlng);
          const pixelDist = p1Screen.distanceTo(pClickScreen);
          if (pixelDist <= 18) {
            commitDraft(currDraft);
            return;
          }
        }

        // Avoid duplicate point on rapid double-click
        if (currDraft.length > 0) {
          const lastPt = currDraft[currDraft.length - 1];
          const lastScreen = map.latLngToContainerPoint([lastPt.lat, lastPt.lng]);
          const clickScreen = map.latLngToContainerPoint(e.latlng);
          if (lastScreen.distanceTo(clickScreen) < 5) {
            return;
          }
        }

        setDraftPolygon((prev) => [...prev, clicked]);
      } else if (mode === 'home') {
        setHome(clicked);
        setMode('none');
      } else if (mode === 'rectangle') {
        if (!anchor) {
          setShapeAnchor(clicked);
        } else {
          const rectPoly: LatLng[] = [
            { lat: anchor.lat, lng: anchor.lng },
            { lat: anchor.lat, lng: clicked.lng },
            { lat: clicked.lat, lng: clicked.lng },
            { lat: clicked.lat, lng: anchor.lng },
          ];
          setPoly(rectPoly);
          setShapeAnchor(null);
          setMode('none');
        }
      } else if (mode === 'circle') {
        if (!anchor) {
          setShapeAnchor(clicked);
        } else {
          const radius = Math.max(15, distanceMeters(anchor, clicked));
          const circlePoly = createCirclePolygon(anchor, radius, 24);
          setPoly(circlePoly);
          setShapeAnchor(null);
          setMode('none');
        }
      }
    });

    // Double click to finish polygon when >= 3 points are drawn
    map.on('dblclick', (e: L.LeafletMouseEvent) => {
      const {
        draftPolygon: currDraft,
        drawMode: mode,
        finishDraftPolygon: commitDraft,
      } = stateRef.current;

      if (mode === 'polygon' && currDraft.length >= 3) {
        L.DomEvent.stopPropagation(e);
        commitDraft(currDraft);
      }
    });

    map.on('mousemove', (e: L.LeafletMouseEvent) => {
      setHoverLatLng({
        lat: Number(e.latlng.lat.toFixed(6)),
        lng: Number(e.latlng.lng.toFixed(6)),
      });
    });

    mapRef.current = map;

    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, []);

  // Switch Base Map Layers
  useEffect(() => {
    const map = mapRef.current;
    const { esriSat, esriLabels, osm } = tileLayersRef.current;
    if (!map || !esriSat || !esriLabels || !osm) return;

    if (mapStyle === 'satellite') {
      if (map.hasLayer(osm)) map.removeLayer(osm);
      if (!map.hasLayer(esriSat)) esriSat.addTo(map);
      if (!map.hasLayer(esriLabels)) esriLabels.addTo(map);
    } else {
      if (map.hasLayer(esriSat)) map.removeLayer(esriSat);
      if (map.hasLayer(esriLabels)) map.removeLayer(esriLabels);
      if (!map.hasLayer(osm)) osm.addTo(map);
    }
  }, [mapStyle]);

  // FlyTo external trigger (e.g., Demo loaded, Search result, Imported KMZ)
  useEffect(() => {
    if (!flyToTarget || !mapRef.current) return;
    mapRef.current.flyTo(
      [flyToTarget.center.lat, flyToTarget.center.lng],
      flyToTarget.zoom ?? 17,
      { duration: 1.1 }
    );
  }, [flyToTarget]);

  // Render Live Preview Layer: Draft Polygon, Rectangle Preview, or Circle Preview
  useEffect(() => {
    const tempGroup = tempShapeLayerRef.current;
    if (!tempGroup) return;
    tempGroup.clearLayers();

    // 1. Live Draft Polygon Preview (while user is adding N points in 'polygon' mode)
    if (drawMode === 'polygon' && draftPolygon.length > 0) {
      const confirmedLatLngs = draftPolygon.map(
        (p) => [p.lat, p.lng] as L.LatLngTuple
      );

      // Solid line connecting already clicked draft vertices
      if (confirmedLatLngs.length >= 2) {
        L.polyline(confirmedLatLngs, {
          color: '#38bdf8',
          weight: 2.5,
        }).addTo(tempGroup);
      }

      // Rubber-band preview line to current mouse cursor + closing preview line to vertex #1
      if (hoverLatLng) {
        const lastPt = draftPolygon[draftPolygon.length - 1];
        L.polyline(
          [
            [lastPt.lat, lastPt.lng],
            [hoverLatLng.lat, hoverLatLng.lng],
          ],
          {
            color: '#38bdf8',
            weight: 2,
            dashArray: '6, 6',
          }
        ).addTo(tempGroup);

        if (draftPolygon.length >= 2) {
          const previewPoly: L.LatLngTuple[] = [
            ...confirmedLatLngs,
            [hoverLatLng.lat, hoverLatLng.lng],
          ];
          L.polygon(previewPoly, {
            color: '#38bdf8',
            weight: 1,
            dashArray: '4, 6',
            fillColor: '#0284c7',
            fillOpacity: 0.14,
          }).addTo(tempGroup);
        }
      }

      // Render Draft Vertex Markers (Vertex #1 is clickable to close when >= 3 points)
      draftPolygon.forEach((pt, idx) => {
        const isFirst = idx === 0;
        const canClose = isFirst && draftPolygon.length >= 3;

        const icon = L.divIcon({
          className: 'draft-vertex-icon',
          html: canClose
            ? `<div class="w-5 h-5 rounded-full bg-emerald-400 border-2 border-slate-950 shadow-lg flex items-center justify-center text-[10px] font-bold text-slate-950 cursor-pointer hover:scale-125 transition-transform" title="Clic en este primer punto para cerrar el polígono">1</div>`
            : `<div class="w-3.5 h-3.5 rounded-full bg-sky-400 border-2 border-slate-950 shadow"></div>`,
          iconSize: canClose ? [20, 20] : [14, 14],
          iconAnchor: canClose ? [10, 10] : [7, 7],
        });

        const m = L.marker([pt.lat, pt.lng], {
          icon,
          interactive: canClose,
        });

        if (canClose) {
          m.on('click', (ev: L.LeafletMouseEvent) => {
            L.DomEvent.stopPropagation(ev);
            finishDraftPolygon(draftPolygon);
          });
        }

        m.addTo(tempGroup);
      });

      return;
    }

    // 2. Live Rectangle / Circle Two-Click Preview
    if (!shapeAnchor || !hoverLatLng) return;

    if (drawMode === 'rectangle') {
      const bounds: L.LatLngTuple[] = [
        [shapeAnchor.lat, shapeAnchor.lng],
        [shapeAnchor.lat, hoverLatLng.lng],
        [hoverLatLng.lat, hoverLatLng.lng],
        [hoverLatLng.lat, shapeAnchor.lng],
      ];
      L.polygon(bounds, {
        color: '#38bdf8',
        weight: 2,
        dashArray: '6, 6',
        fillColor: '#38bdf8',
        fillOpacity: 0.15,
      }).addTo(tempGroup);
    } else if (drawMode === 'circle') {
      const r = Math.max(10, distanceMeters(shapeAnchor, hoverLatLng));
      L.circle([shapeAnchor.lat, shapeAnchor.lng], {
        radius: r,
        color: '#06b6d4',
        weight: 2,
        dashArray: '6, 6',
        fillColor: '#06b6d4',
        fillOpacity: 0.15,
      }).addTo(tempGroup);
    }
  }, [
    drawMode,
    draftPolygon,
    shapeAnchor,
    hoverLatLng,
    finishDraftPolygon,
  ]);

  // Render Finalized Polygon, Midpoint Edge Handles, Waypoints, Orbits, Heading Vectors, Home Point
  useEffect(() => {
    const group = layersGroupRef.current;
    const vertexGroup = vertexMarkersRef.current;
    const renderer = canvasRendererRef.current;
    if (!group || !vertexGroup || !renderer) return;

    group.clearLayers();
    vertexGroup.clearLayers();

    // Hide finalized polygon handles while actively drawing a new draft polygon
    const isDrawingNewPolygon =
      drawMode === 'polygon' && draftPolygon.length > 0;

    // 1. Draw Finalized Polygon Footprint
    if (!isDrawingNewPolygon && polygon.length >= 3) {
      const latlngs = polygon.map((p) => [p.lat, p.lng] as L.LatLngTuple);
      L.polygon(latlngs, {
        renderer,
        color: '#38bdf8',
        weight: 2,
        fillColor: '#0284c7',
        fillOpacity: 0.12,
        dashArray: '4, 4',
      }).addTo(group);
    }

    // 2. Draggable Polygon Vertex Handles + Midpoint Edge Handles (to easily add vertices)
    if (!isDrawingNewPolygon && polygon.length >= 3) {
      // Corner Vertex Handles
      polygon.forEach((pt, idx) => {
        const vertexIcon = L.divIcon({
          className: 'custom-vertex-handle',
          html: `<div class="w-4 h-4 rounded-full bg-sky-400 border-2 border-slate-950 shadow-md cursor-move hover:scale-125 transition-transform flex items-center justify-center text-[9px] font-mono font-bold text-slate-950" title="Vértice #${
            idx + 1
          } (Arrastrar para mover · Clic derecho para eliminar)"></div>`,
          iconSize: [16, 16],
          iconAnchor: [8, 8],
        });

        const marker = L.marker([pt.lat, pt.lng], {
          icon: vertexIcon,
          draggable: true,
        });

        marker.on('drag', (e: L.LeafletEvent) => {
          const m = e.target as L.Marker;
          const pos = m.getLatLng();
          const updated = [...polygon];
          updated[idx] = {
            lat: Number(pos.lat.toFixed(7)),
            lng: Number(pos.lng.toFixed(7)),
          };
          onChangePolygon(updated);
        });

        marker.on('contextmenu', () => {
          if (polygon.length > 3) {
            const updated = polygon.filter((_, i) => i !== idx);
            onChangePolygon(updated);
          }
        });

        marker.addTo(vertexGroup);
      });

      // Midpoint Handles on each edge (Click or drag to insert a new vertex between existing points)
      polygon.forEach((ptA, idx) => {
        const ptB = polygon[(idx + 1) % polygon.length];
        const midLat = Number(((ptA.lat + ptB.lat) / 2).toFixed(7));
        const midLng = Number(((ptA.lng + ptB.lng) / 2).toFixed(7));

        const midIcon = L.divIcon({
          className: 'midpoint-add-vertex-handle',
          html: `<div class="w-3.5 h-3.5 rounded-full bg-slate-900/90 border border-sky-400/80 text-sky-300 flex items-center justify-center text-[10px] font-bold shadow cursor-pointer hover:bg-sky-400 hover:text-slate-950 hover:scale-125 transition-all" title="Clic para insertar un nuevo vértice en esta arista">+</div>`,
          iconSize: [14, 14],
          iconAnchor: [7, 7],
        });

        const midMarker = L.marker([midLat, midLng], {
          icon: midIcon,
        });

        midMarker.on('click', (e: L.LeafletMouseEvent) => {
          L.DomEvent.stopPropagation(e);
          const updated = [...polygon];
          updated.splice(idx + 1, 0, { lat: midLat, lng: midLng });
          onChangePolygon(updated);
        });

        midMarker.addTo(vertexGroup);
      });
    }

    // 3. Draw Centroid POI Marker when using Orbit or Combo 3DGS
    if (
      !isDrawingNewPolygon &&
      metrics.centroid &&
      polygon.length >= 3 &&
      (config.pattern === 'orbit_poi' || config.pattern === 'combo_3dgs')
    ) {
      const poiIcon = L.divIcon({
        className: 'poi-center-icon',
        html: `<div class="flex items-center justify-center w-6 h-6 rounded-full bg-amber-500/20 border border-amber-400 text-amber-300 text-[10px] font-mono font-bold shadow">POI</div>`,
        iconSize: [24, 24],
        iconAnchor: [12, 12],
      });
      L.marker([metrics.centroid.lat, metrics.centroid.lng], {
        icon: poiIcon,
        interactive: false,
      }).addTo(group);
    }

    // 4. Draw Flight Path Segments Colored by Phase
    if (!isDrawingNewPolygon && waypoints.length >= 2) {
      for (let i = 0; i < waypoints.length - 1; i++) {
        const curr = waypoints[i];
        const next = waypoints[i + 1];
        const phaseColor = PHASE_COLORS[curr.phase] || '#38bdf8';

        L.polyline(
          [
            [curr.lat, curr.lng],
            [next.lat, next.lng],
          ],
          {
            renderer,
            color: phaseColor,
            weight: curr.phase === 'grid_nadir' ? 2.8 : 2.4,
            opacity: 0.92,
          }
        ).addTo(group);
      }
    }

    // 5. Draw Transit Line from Home Point to WP#1 and from Last WP to Home + Multi-Battery RTH & Resume Trajectories
    const effectiveHome =
      homePoint || (waypoints.length > 0 ? waypoints[0] : null);

    if (!isDrawingNewPolygon && effectiveHome && waypoints.length > 0) {
      const firstWp = waypoints[0];
      const lastWp = waypoints[waypoints.length - 1];

      if (homePoint) {
        L.polyline(
          [
            [homePoint.lat, homePoint.lng],
            [firstWp.lat, firstWp.lng],
          ],
          {
            renderer,
            color: '#94a3b8',
            weight: 1.5,
            dashArray: '5, 5',
            opacity: 0.75,
          }
        ).addTo(group);

        L.polyline(
          [
            [lastWp.lat, lastWp.lng],
            [homePoint.lat, homePoint.lng],
          ],
          {
            renderer,
            color: '#64748b',
            weight: 1.5,
            dashArray: '3, 6',
            opacity: 0.6,
          }
        ).addTo(group);
      }

      // Draw Multi-Battery RTH Return & Next Battery Resume Dashed Trajectories
      if (config.showRthLines && metrics.batterySegments.length > 1) {
        for (let s = 0; s < metrics.batterySegments.length - 1; s++) {
          const currSeg = metrics.batterySegments[s];
          const nextSeg = metrics.batterySegments[s + 1];

          // Amber/Red Dashed Line: RTH from Cut Waypoint back to Home (H)
          L.polyline(
            [
              [currSeg.endLatLng.lat, currSeg.endLatLng.lng],
              [effectiveHome.lat, effectiveHome.lng],
            ],
            {
              renderer,
              color: '#f97316',
              weight: 2.2,
              dashArray: '6, 6',
              opacity: 0.9,
            }
          ).addTo(group);

          // Cyan/Emerald Dashed Line: Resume Transit from Home (H) to Next Battery Start Waypoint (with overlap)
          L.polyline(
            [
              [effectiveHome.lat, effectiveHome.lng],
              [nextSeg.startLatLng.lat, nextSeg.startLatLng.lng],
            ],
            {
              renderer,
              color: '#22c55e',
              weight: 2.2,
              dashArray: '4, 6',
              opacity: 0.9,
            }
          ).addTo(group);
        }
      }
    }

    // 6. Draw Waypoint Canvas Nodes + Camera Heading Vectors + Battery Swap & Emergency Resume Badges
    if (!isDrawingNewPolygon) {
      waypoints.forEach((wp, idx) => {
        const phaseColor = PHASE_COLORS[wp.phase] || '#38bdf8';
        const isStart = idx === 0;
        const isEnd = idx === waypoints.length - 1;
        const isBatterySwap = metrics.batterySwapWaypointIds.includes(wp.id);
        const isEmergencyResumePoint =
          config.resumeFromWaypointId > 1 &&
          wp.id === config.resumeFromWaypointId;

        // Dim waypoints prior to emergency resume point if user moved the emergency cut slider
        const isSkippedByEmergency =
          config.resumeFromWaypointId > 1 &&
          wp.id < config.resumeFromWaypointId;

        // Draw short camera heading indicator ray (11m length) on canvas
        const headRad = degToRad(wp.heading);
        const rayTip = xyToLatLng(
          11 * Math.sin(headRad),
          11 * Math.cos(headRad),
          wp
        );
        L.polyline(
          [
            [wp.lat, wp.lng],
            [rayTip.lat, rayTip.lng],
          ],
          {
            renderer,
            color: phaseColor,
            weight: 1.4,
            opacity: isSkippedByEmergency ? 0.25 : 0.65,
          }
        ).addTo(group);

        const circle = L.circleMarker([wp.lat, wp.lng], {
          renderer,
          radius:
            isStart || isEnd || isEmergencyResumePoint
              ? 6.8
              : isBatterySwap
              ? 6.5
              : 4.2,
          color: isEmergencyResumePoint
            ? '#10b981'
            : isStart
            ? '#22c55e'
            : isEnd
            ? '#ef4444'
            : isBatterySwap
            ? '#f97316'
            : '#090d16',
          weight:
            isStart || isEnd || isBatterySwap || isEmergencyResumePoint
              ? 2.2
              : 1.2,
          fillColor: isEmergencyResumePoint
            ? '#10b981'
            : isStart
            ? '#22c55e'
            : isEnd
            ? '#ef4444'
            : isBatterySwap
            ? '#f97316'
            : phaseColor,
          fillOpacity: isSkippedByEmergency ? 0.3 : 1,
        });

        circle.bindTooltip(
          `<div class="space-y-0.5">
            <div class="font-bold text-sky-300">WP #${wp.id} ${
            isStart
              ? '(INICIO)'
              : isEnd
              ? '(FIN)'
              : isBatterySwap
              ? '(🔋 CORTE RTH)'
              : ''
          }</div>
            <div>Fase: ${PHASE_NAMES[wp.phase] || wp.phase}</div>
            <div>Alt: ${wp.altitude}m ${
            wp.terrainDeltaM !== 0
              ? `(AGL Δ ${wp.terrainDeltaM > 0 ? '+' : ''}${wp.terrainDeltaM}m)`
              : ''
          } · Vel: ${wp.speed}m/s</div>
            <div>Rumbo (Yaw): ${wp.heading}° · Gimbal: ${wp.gimbalPitch}°</div>
            <div>Acción: ${wp.action} · Bat #${wp.batteryIndex}</div>
          </div>`,
          {
            className: 'wp-tooltip',
            direction: 'top',
            offset: [0, -6],
          }
        );

        circle.addTo(group);

        if (isBatterySwap) {
          const segObj = metrics.batterySegments.find(
            (s) => s.cutWaypointId === wp.id
          );
          const nextBatNum = segObj ? segObj.batteryNumber + 1 : wp.batteryIndex + 1;
          const currBatNum = segObj ? segObj.batteryNumber : wp.batteryIndex;
          const resumeWpLabel =
            segObj?.resumeNextStartWaypointId != null
              ? ` · Retoma WP #${segObj.resumeNextStartWaypointId}`
              : '';

          const batIcon = L.divIcon({
            className: 'battery-swap-badge',
            html: `<div class="px-2 py-0.5 rounded bg-amber-500 text-slate-950 font-mono font-bold text-[10px] shadow-lg border border-amber-200 whitespace-nowrap">🔋 Cambio Bat #${currBatNum} → #${nextBatNum} (WP #${wp.id}${resumeWpLabel})</div>`,
            iconSize: [190, 22],
            iconAnchor: [95, -8],
          });
          L.marker([wp.lat, wp.lng], { icon: batIcon, interactive: false }).addTo(
            group
          );
        }

        if (isEmergencyResumePoint) {
          const resumeIcon = L.divIcon({
            className: 'emergency-resume-badge',
            html: `<div class="px-2 py-0.5 rounded bg-emerald-500 text-slate-950 font-mono font-bold text-[10px] shadow-lg border border-emerald-200 whitespace-nowrap">✂️ Reanudar desde WP #${wp.id}</div>`,
            iconSize: [150, 22],
            iconAnchor: [75, 26],
          });
          L.marker([wp.lat, wp.lng], {
            icon: resumeIcon,
            interactive: false,
          }).addTo(group);
        }
      });
    }

    // 7. Draw Home Point (Pilot Feet / Takeoff Point)
    if (homePoint) {
      const homeIcon = L.divIcon({
        className: 'home-takeoff-marker',
        html: `<div class="flex items-center justify-center w-7 h-7 rounded-full bg-amber-500 text-slate-950 font-mono font-bold text-xs border-2 border-white shadow-lg cursor-move" title="Punto de Despegue / Pies del Piloto (Arrastrar)">H</div>`,
        iconSize: [28, 28],
        iconAnchor: [14, 14],
      });
      const hMarker = L.marker([homePoint.lat, homePoint.lng], {
        icon: homeIcon,
        draggable: true,
      });
      hMarker.on('dragend', (e: L.LeafletEvent) => {
        const pos = (e.target as L.Marker).getLatLng();
        onChangeHomePoint({
          lat: Number(pos.lat.toFixed(7)),
          lng: Number(pos.lng.toFixed(7)),
        });
      });
      hMarker.addTo(vertexGroup);
    }
  }, [
    polygon,
    waypoints,
    homePoint,
    metrics,
    config.pattern,
    config.showRthLines,
    config.resumeFromWaypointId,
    drawMode,
    draftPolygon.length,
    onChangePolygon,
    onChangeHomePoint,
  ]);

  // Flight Simulation Loop
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    if (!isSimulating || waypoints.length === 0) {
      if (simMarkerRef.current) {
        simMarkerRef.current.remove();
        simMarkerRef.current = null;
      }
      if (simFovPolygonRef.current) {
        simFovPolygonRef.current.remove();
        simFovPolygonRef.current = null;
      }
      return;
    }

    let animFrame: number;
    let lastTs = performance.now();
    let floatIdx = simProgressIdx >= waypoints.length - 1 ? 0 : simProgressIdx;

    const stepSimulation = (now: number) => {
      const dtSec = (now - lastTs) / 1000;
      lastTs = now;

      const i = Math.floor(floatIdx);
      const nextI = Math.min(waypoints.length - 1, i + 1);
      const wpA = waypoints[i];
      const wpB = waypoints[nextI];

      const segDist = Math.max(1, distanceMeters(wpA, wpB));
      const droneSpeed = (wpA.speed || 2.5) * simSpeedMultiplier;
      const indexDelta = (droneSpeed * dtSec) / segDist;

      floatIdx += indexDelta;
      if (floatIdx >= waypoints.length - 1) {
        floatIdx = waypoints.length - 1;
        setSimProgressIdx(waypoints.length - 1);
        onToggleSimulation(false);
        return;
      }

      setSimProgressIdx(floatIdx);

      const frac = floatIdx - Math.floor(floatIdx);
      const currLat = wpA.lat + (wpB.lat - wpA.lat) * frac;
      const currLng = wpA.lng + (wpB.lng - wpA.lng) * frac;
      const currHeading = wpA.heading;

      const droneIcon = L.divIcon({
        className: 'sim-drone-icon',
        html: `<div style="transform: rotate(${currHeading}deg);" class="w-8 h-8 flex items-center justify-center">
          <div class="w-6 h-6 rounded-full bg-sky-500 border-2 border-white shadow-lg flex items-center justify-center">
            <div class="w-0 h-0 border-l-[4px] border-l-transparent border-r-[4px] border-r-transparent border-b-[8px] border-b-white -translate-y-0.5"></div>
          </div>
        </div>`,
        iconSize: [32, 32],
        iconAnchor: [16, 16],
      });

      if (!simMarkerRef.current) {
        simMarkerRef.current = L.marker([currLat, currLng], {
          icon: droneIcon,
          zIndexOffset: 1000,
        }).addTo(map);
      } else {
        simMarkerRef.current.setLatLng([currLat, currLng]);
        simMarkerRef.current.setIcon(droneIcon);
      }

      const currCenter = { lat: currLat, lng: currLng };
      const headRad = degToRad(currHeading);
      const lookAhead =
        wpA.altitude *
        Math.tan(degToRad(Math.min(60, 90 - Math.abs(wpA.gimbalPitch))));
      const halfW = Math.max(12, metrics.footprintWidthM * 0.35);
      const coneDist = Math.max(22, lookAhead + metrics.footprintHeightM * 0.35);

      const leftTip = xyToLatLng(
        coneDist * Math.sin(headRad) - halfW * Math.cos(headRad),
        coneDist * Math.cos(headRad) + halfW * Math.sin(headRad),
        currCenter
      );
      const rightTip = xyToLatLng(
        coneDist * Math.sin(headRad) + halfW * Math.cos(headRad),
        coneDist * Math.cos(headRad) - halfW * Math.sin(headRad),
        currCenter
      );

      const coneLatLngs: L.LatLngTuple[] = [
        [currLat, currLng],
        [leftTip.lat, leftTip.lng],
        [rightTip.lat, rightTip.lng],
      ];

      if (!simFovPolygonRef.current) {
        simFovPolygonRef.current = L.polygon(coneLatLngs, {
          color: '#38bdf8',
          weight: 1.5,
          fillColor: '#38bdf8',
          fillOpacity: 0.25,
        }).addTo(map);
      } else {
        simFovPolygonRef.current.setLatLngs(coneLatLngs);
      }

      animFrame = requestAnimationFrame(stepSimulation);
    };

    animFrame = requestAnimationFrame(stepSimulation);
    return () => cancelAnimationFrame(animFrame);
  }, [isSimulating, waypoints, simSpeedMultiplier, metrics, onToggleSimulation, simProgressIdx]);

  // Search Location or Direct Lat,Lng Coordinates
  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    const q = searchQuery.trim();
    if (!q || !mapRef.current) return;
    setSearchError(null);

    const coordMatch = q.match(
      /^(-?\d+(?:\.\d+)?)\s*[,;\s]\s*(-?\d+(?:\.\d+)?)$/
    );
    if (coordMatch) {
      const lat = parseFloat(coordMatch[1]);
      const lng = parseFloat(coordMatch[2]);
      if (lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180) {
        mapRef.current.flyTo([lat, lng], 17, { duration: 1.2 });
        return;
      }
    }

    setIsSearching(true);
    try {
      const res = await fetch(
        `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(
          q
        )}&limit=1`
      );
      const data = await res.json();
      if (Array.isArray(data) && data.length > 0) {
        const lat = parseFloat(data[0].lat);
        const lon = parseFloat(data[0].lon);
        mapRef.current.flyTo([lat, lon], 16, { duration: 1.2 });
      } else {
        setSearchError(
          'Ubicación no encontrada. Prueba "Ciudad, Chile" o "lat, lon".'
        );
      }
    } catch {
      setSearchError('Error de red al buscar ubicación.');
    } finally {
      setIsSearching(false);
    }
  };

  // Locate User via Browser GPS
  const handleMyGps = () => {
    setSearchError(null);
    if (!navigator.geolocation) {
      setSearchError('Geolocalización GPS no soportada en este navegador.');
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const { latitude, longitude } = pos.coords;
        if (mapRef.current) {
          mapRef.current.flyTo([latitude, longitude], 17, { duration: 1.2 });
        }
      },
      () => {
        setSearchError('Permiso GPS denegado o señal no disponible.');
      },
      { enableHighAccuracy: true, timeout: 8000 }
    );
  };

  const formatDuration = (sec: number) => {
    if (sec <= 0) return '0m 00s';
    const m = Math.floor(sec / 60);
    const s = Math.round(sec % 60);
    return `${m}m ${s < 10 ? '0' : ''}${s}s`;
  };

  const activeSimWp =
    waypoints.length > 0
      ? waypoints[Math.min(waypoints.length - 1, Math.floor(simProgressIdx))]
      : null;

  return (
    <div className="relative flex-1 h-full bg-slate-950 overflow-hidden select-none">
      {/* Main Leaflet Canvas Map */}
      <div ref={mapContainerRef} className="w-full h-full z-0" />

      {/* Top Floating Search & Drawing Toolbar */}
      <div className="absolute top-3 left-3 right-3 z-[400] flex flex-wrap items-center justify-between gap-2 pointer-events-none">
        {/* Smart Search + GPS Bar */}
        <form
          onSubmit={handleSearch}
          className="pointer-events-auto flex items-center bg-slate-900/95 backdrop-blur-md border border-slate-700/80 rounded-lg shadow-xl overflow-hidden"
        >
          <div className="pl-2.5 pr-1.5 text-slate-400">
            <Search className="w-3.5 h-3.5" />
          </div>
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Ciudad, dirección o lat, lon..."
            className="w-44 sm:w-56 bg-transparent py-1.5 pr-2 text-xs text-slate-100 placeholder-slate-400 focus:outline-none"
          />
          <button
            type="submit"
            disabled={isSearching}
            className="px-2.5 py-1.5 text-xs font-medium bg-slate-800 hover:bg-slate-700 text-slate-200 border-l border-slate-700/80 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            {isSearching ? '...' : 'Ir'}
          </button>
          <button
            type="button"
            onClick={handleMyGps}
            title="Centrar en mi ubicación GPS actual"
            className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium bg-sky-500/15 hover:bg-sky-500/25 text-sky-300 border-l border-slate-700/80 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <Crosshair className="w-3.5 h-3.5" />
            <span>Mi GPS</span>
          </button>
        </form>

        {/* Interactive Drawing Tools (WaypointMap Style) */}
        <div className="pointer-events-auto flex flex-wrap items-center gap-1 bg-slate-900/95 backdrop-blur-md border border-slate-700/80 p-1 rounded-lg shadow-xl">
          <button
            type="button"
            onClick={() => {
              if (drawMode === 'polygon') {
                if (draftPolygon.length >= 3) {
                  finishDraftPolygon();
                } else {
                  setDraftPolygon([]);
                  onChangeDrawMode('none');
                }
              } else {
                setDraftPolygon([]);
                onChangeDrawMode('polygon');
              }
            }}
            className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded text-xs font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              drawMode === 'polygon'
                ? 'bg-sky-500 text-slate-950 font-semibold shadow-sm'
                : 'text-slate-300 hover:bg-slate-800 hover:text-white'
            }`}
          >
            <Pentagon className="w-3.5 h-3.5" />
            <span>Dibujar Polígono</span>
          </button>

          <button
            type="button"
            onClick={() =>
              onChangeDrawMode(drawMode === 'rectangle' ? 'none' : 'rectangle')
            }
            className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded text-xs font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              drawMode === 'rectangle'
                ? 'bg-sky-500 text-slate-950 font-semibold shadow-sm'
                : 'text-slate-300 hover:bg-slate-800 hover:text-white'
            }`}
          >
            <Square className="w-3.5 h-3.5" />
            <span>Rectángulo</span>
          </button>

          <button
            type="button"
            onClick={() =>
              onChangeDrawMode(drawMode === 'circle' ? 'none' : 'circle')
            }
            className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded text-xs font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              drawMode === 'circle'
                ? 'bg-cyan-500 text-slate-950 font-semibold shadow-sm'
                : 'text-slate-300 hover:bg-slate-800 hover:text-white'
            }`}
          >
            <CircleDot className="w-3.5 h-3.5" />
            <span>Círculo / Órbita POI</span>
          </button>

          <button
            type="button"
            onClick={() =>
              onChangeDrawMode(drawMode === 'home' ? 'none' : 'home')
            }
            className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded text-xs font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              drawMode === 'home'
                ? 'bg-amber-500 text-slate-950 font-semibold shadow-sm'
                : 'text-slate-300 hover:bg-slate-800 hover:text-white'
            }`}
          >
            <Home className="w-3.5 h-3.5 text-amber-400" />
            <span>Despegue (H)</span>
          </button>

          {/* Add Vertex Button when a closed polygon exists */}
          {polygon.length >= 3 && drawMode === 'none' && (
            <button
              type="button"
              onClick={handleInsertVertexOnLongestEdge}
              title="Insertar un nuevo vértice en el polígono actual (también puedes hacer clic en los puntos '+' de cada arista)"
              className="flex items-center gap-1 px-2.5 py-1.5 rounded text-xs font-medium bg-sky-500/15 hover:bg-sky-500/25 text-sky-300 border border-sky-500/30 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Añadir Vértice ({polygon.length})</span>
            </button>
          )}

          <div className="h-4 w-px bg-slate-700/80 mx-0.5" />

          <button
            type="button"
            onClick={handleCreateBasePolygonAtViewport}
            title="Genera un polígono base de 100m × 100m en el centro actual de tu vista de mapa"
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded text-xs font-medium bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-300 border border-emerald-500/30 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>Polígono Base (Vista Actual)</span>
          </button>

          {polygon.length > 0 && (
            <button
              type="button"
              onClick={onClearAll}
              title="Limpiar polígono actual"
              className="flex items-center gap-1 px-2 py-1.5 rounded text-xs font-medium text-rose-400 hover:bg-rose-500/15 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {/* Map Layer Switcher */}
        <div className="pointer-events-auto flex items-center bg-slate-900/95 backdrop-blur-md border border-slate-700/80 p-1 rounded-lg shadow-xl">
          <button
            type="button"
            onClick={() => setMapStyle('satellite')}
            className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded text-xs font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              mapStyle === 'satellite'
                ? 'bg-slate-800 text-sky-300 font-semibold'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Layers className="w-3.5 h-3.5" />
            <span>Satélite</span>
          </button>
          <button
            type="button"
            onClick={() => setMapStyle('osm')}
            className={`px-2.5 py-1.5 rounded text-xs font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              mapStyle === 'osm'
                ? 'bg-slate-800 text-sky-300 font-semibold'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <span>OSM</span>
          </button>
        </div>
      </div>

      {/* Search Error Banner */}
      {searchError && (
        <div className="absolute top-16 left-3 z-[400] bg-rose-950/90 border border-rose-500/50 text-rose-200 px-3 py-1.5 rounded-md text-xs shadow-lg">
          {searchError}
        </div>
      )}

      {/* Interactive Floating Control Bar During Drawing Mode */}
      {drawMode !== 'none' && (
        <div className="absolute top-16 left-1/2 -translate-x-1/2 z-[400] flex flex-wrap items-center gap-2.5 bg-slate-900/95 border border-sky-500/60 text-sky-100 px-4 py-2 rounded-xl text-xs shadow-2xl backdrop-blur-md pointer-events-auto">
          {drawMode === 'polygon' && (
            <>
              <span className="font-medium">
                {draftPolygon.length === 0 &&
                  'Haz clic en el mapa para marcar el Punto #1 del polígono.'}
                {draftPolygon.length > 0 &&
                  draftPolygon.length < 3 &&
                  `Puntos marcados: ${draftPolygon.length}. Sigue haciendo clic para añadir más vértices (mín. 3).`}
                {draftPolygon.length >= 3 &&
                  `Puntos marcados: ${draftPolygon.length}. Sigue añadiendo puntos o cierra el polígono (clic en Punto #1, doble clic o botón Finalizar).`}
              </span>

              {draftPolygon.length > 0 && (
                <button
                  type="button"
                  onClick={() =>
                    setDraftPolygon((prev) => prev.slice(0, -1))
                  }
                  className="flex items-center gap-1 px-2.5 py-1 rounded-md bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                >
                  <Undo2 className="w-3.5 h-3.5" />
                  <span>Deshacer Punto</span>
                </button>
              )}

              {draftPolygon.length >= 3 && (
                <button
                  type="button"
                  onClick={() => finishDraftPolygon()}
                  className="flex items-center gap-1.5 px-3 py-1 rounded-md bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-semibold shadow transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                >
                  <Check className="w-3.5 h-3.5" />
                  <span>Finalizar Polígono (Enter)</span>
                </button>
              )}

              <button
                type="button"
                onClick={() => {
                  setDraftPolygon([]);
                  onChangeDrawMode('none');
                }}
                className="flex items-center gap-1 px-2 py-1 rounded-md text-rose-300 hover:bg-rose-500/20 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
                <span>Cancelar</span>
              </button>
            </>
          )}

          {drawMode === 'rectangle' && (
            <>
              <span className="font-medium">
                {!shapeAnchor
                  ? 'Paso 1/2: Haz clic en la primera esquina del rectángulo.'
                  : 'Paso 2/2: Mueve el cursor y haz clic en la esquina opuesta para generar los 4 vértices.'}
              </span>
              <button
                type="button"
                onClick={() => {
                  setShapeAnchor(null);
                  onChangeDrawMode('none');
                }}
                className="px-2.5 py-1 rounded bg-slate-800 text-slate-300 hover:text-white transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                Cancelar
              </button>
            </>
          )}

          {drawMode === 'circle' && (
            <>
              <span className="font-medium">
                {!shapeAnchor
                  ? 'Paso 1/2: Haz clic en el centro de la órbita / área circular (POI).'
                  : `Paso 2/2: Radio actual ${
                      hoverLatLng
                        ? Math.round(distanceMeters(shapeAnchor, hoverLatLng))
                        : 0
                    } m — Haz clic para confirmar.`}
              </span>
              <button
                type="button"
                onClick={() => {
                  setShapeAnchor(null);
                  onChangeDrawMode('none');
                }}
                className="px-2.5 py-1 rounded bg-slate-800 text-slate-300 hover:text-white transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                Cancelar
              </button>
            </>
          )}

          {drawMode === 'home' && (
            <>
              <span className="font-medium">
                Haz clic en el punto exacto de despegue (Pies del Piloto / Home) para calibrar alturas relativas y RTH.
              </span>
              <button
                type="button"
                onClick={() => onChangeDrawMode('none')}
                className="px-2.5 py-1 rounded bg-slate-800 text-slate-300 hover:text-white transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                Cancelar
              </button>
            </>
          )}
        </div>
      )}

      {/* Clean Empty State Onboarding Banner (when no polygon & not drawing) */}
      {polygon.length === 0 && waypoints.length === 0 && drawMode === 'none' && (
        <div className="absolute top-20 left-1/2 -translate-x-1/2 z-[390] max-w-md w-[92%] bg-slate-900/92 backdrop-blur-md border border-slate-700/80 rounded-xl p-4 shadow-2xl text-center pointer-events-auto">
          <div className="inline-flex items-center justify-center w-9 h-9 rounded-lg bg-sky-500/15 border border-sky-500/30 text-sky-400 mb-2">
            <Compass className="w-5 h-5" />
          </div>
          <h2 className="text-sm font-semibold text-slate-100">
            Lienzo Limpio · Listo para Planificar Misión Air 3S
          </h2>
          <p className="text-xs text-slate-400 mt-1 leading-relaxed">
            Busca tu zona de vuelo arriba, dibuja un polígono libre de N lados, un rectángulo o importa un archivo{' '}
            <span className="text-slate-200 font-mono">.KMZ / .JSON</span>.
          </p>
          <div className="mt-3 flex flex-wrap items-center justify-center gap-2">
            <button
              type="button"
              onClick={() => {
                setDraftPolygon([]);
                onChangeDrawMode('polygon');
              }}
              className="px-3 py-1.5 rounded-md text-xs font-semibold bg-sky-500 hover:bg-sky-400 text-slate-950 transition-colors cursor-pointer"
            >
              ⬠ Dibujar Polígono Libre
            </button>
            <button
              type="button"
              onClick={() => onChangeDrawMode('rectangle')}
              className="px-3 py-1.5 rounded-md text-xs font-medium bg-slate-800 hover:bg-slate-700 text-sky-300 border border-slate-700 transition-colors cursor-pointer"
            >
              ▭ Dibujar Rectángulo
            </button>
            <button
              type="button"
              onClick={handleCreateBasePolygonAtViewport}
              className="px-3 py-1.5 rounded-md text-xs font-medium bg-slate-800 hover:bg-slate-700 text-emerald-300 border border-slate-700 transition-colors cursor-pointer"
            >
              📐 Polígono Base (Vista Actual)
            </button>
          </div>
        </div>
      )}

      {/* Live Flight Simulation Telemetry Panel */}
      {(isSimulating || simProgressIdx > 0) && waypoints.length > 0 && activeSimWp && (
        <div className="absolute bottom-20 left-4 z-[400] w-80 bg-slate-900/95 backdrop-blur-md border border-sky-500/40 rounded-lg p-3 shadow-2xl pointer-events-auto">
          <div className="flex items-center justify-between pb-2 mb-2 border-b border-slate-800">
            <div className="flex items-center gap-2">
              <Navigation className="w-4 h-4 text-sky-400" />
              <span className="text-xs font-semibold text-slate-100">
                Simulador de Vuelo en Vivo
              </span>
            </div>
            <div className="flex items-center gap-1">
              {[2, 4, 10].map((mult) => (
                <button
                  key={mult}
                  type="button"
                  onClick={() => setSimSpeedMultiplier(mult)}
                  className={`px-1.5 py-0.5 rounded text-[10px] font-mono cursor-pointer ${
                    simSpeedMultiplier === mult
                      ? 'bg-sky-500 text-slate-950 font-bold'
                      : 'bg-slate-800 text-slate-400 hover:text-white'
                  }`}
                >
                  {mult}x
                </button>
              ))}
            </div>
          </div>

          <div className="text-[11px] text-sky-300 font-medium mb-2 truncate">
            {PHASE_NAMES[activeSimWp.phase] || activeSimWp.phase}
          </div>

          <div className="grid grid-cols-3 gap-2 text-center bg-slate-950/70 rounded p-2 font-mono text-xs mb-2">
            <div>
              <div className="text-[10px] text-slate-400">Waypoint</div>
              <div className="text-slate-100 font-semibold tabular-nums">
                #{activeSimWp.id}/{waypoints.length}
              </div>
            </div>
            <div>
              <div className="text-[10px] text-slate-400">Rumbo (Yaw)</div>
              <div className="text-amber-300 font-semibold tabular-nums">
                {activeSimWp.heading}°
              </div>
            </div>
            <div>
              <div className="text-[10px] text-slate-400">Gimbal Pitch</div>
              <div className="text-cyan-300 font-semibold tabular-nums">
                {activeSimWp.gimbalPitch}°
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => onToggleSimulation(!isSimulating)}
              className="flex items-center justify-center w-7 h-7 rounded bg-sky-500 hover:bg-sky-400 text-slate-950 cursor-pointer shrink-0"
            >
              {isSimulating ? (
                <Pause className="w-3.5 h-3.5" />
              ) : (
                <Play className="w-3.5 h-3.5" />
              )}
            </button>
            <input
              type="range"
              min={0}
              max={Math.max(0, waypoints.length - 1)}
              step={0.1}
              value={simProgressIdx}
              onChange={(e) => {
                onToggleSimulation(false);
                setSimProgressIdx(parseFloat(e.target.value));
              }}
              className="flex-1 accent-sky-400 h-1.5 bg-slate-800 rounded-lg cursor-pointer"
            />
            <button
              type="button"
              onClick={() => {
                setSimProgressIdx(0);
                onToggleSimulation(true);
              }}
              title="Reiniciar simulación"
              className="p-1.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 cursor-pointer shrink-0"
            >
              <RotateCcw className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}

      {/* Phase Color Legend (Top-Right under Layer Switcher when mission exists) */}
      {waypoints.length > 0 && drawMode === 'none' && (
        <div className="absolute top-16 right-3 z-[390] bg-slate-900/90 backdrop-blur-md border border-slate-800 rounded-lg px-3 py-2 text-[11px] text-slate-300 space-y-1 shadow-lg pointer-events-none">
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-cyan-500 inline-block" />
            <span>Fase 1: Órbita Interna (-75° POI)</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 inline-block" />
            <span>Fase 2: Grilla Central (-90° Nadir)</span>
          </div>
          {config.pattern === 'combo_3dgs' && (
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-amber-500 inline-block" />
              <span>Fase 3: Órbita Externa (-45° POI)</span>
            </div>
          )}
          {config.pattern === 'double_grid_3d' && (
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-violet-500 inline-block" />
              <span>Grilla Cruzada 90° Oblicua</span>
            </div>
          )}
          <div className="pt-1 border-t border-slate-800 text-[10px] text-slate-400">
            Tip: Arrastra vértices o haz clic en <span className="text-sky-300 font-bold">+</span> para añadir lados
          </div>
        </div>
      )}

      {/* Bottom Floating HUD (Live Photogrammetry & Avionics Telemetry) */}
      <div className="absolute bottom-3 left-3 right-14 z-[400] pointer-events-none flex justify-center">
        <div className="pointer-events-auto bg-slate-900/95 backdrop-blur-md border border-slate-700/80 rounded-xl px-4 py-2.5 shadow-2xl flex flex-wrap items-center gap-x-5 gap-y-2 text-xs">
          <div>
            <span className="text-slate-400 block text-[10px]">GSD (Resolución)</span>
            <span className="font-mono font-semibold text-sky-300 tabular-nums">
              {metrics.gsdCmPx.toFixed(2)} cm/px
            </span>
          </div>

          <div className="h-6 w-px bg-slate-800 hidden sm:block" />

          <div>
            <span className="text-slate-400 block text-[10px]">Área Polígono</span>
            <span className="font-mono font-semibold text-slate-100 tabular-nums">
              {metrics.areaHa.toFixed(2)} ha{' '}
              <span className="text-slate-400 font-normal">
                ({Math.round(metrics.areaM2).toLocaleString()} m²)
              </span>
            </span>
          </div>

          <div className="h-6 w-px bg-slate-800 hidden sm:block" />

          <div>
            <span className="text-slate-400 block text-[10px]">Altitud / Vel.</span>
            <span className="font-mono font-semibold text-slate-100 tabular-nums">
              {config.altitude} m · {config.speed.toFixed(1)} m/s
            </span>
          </div>

          <div className="h-6 w-px bg-slate-800 hidden sm:block" />

          <div>
            <span className="text-slate-400 block text-[10px]">Waypoints / Fotos Reales</span>
            <span className="font-mono font-semibold text-emerald-300 tabular-nums">
              {metrics.totalWaypoints} WP · {metrics.estimatedPhotos} Fotos{' '}
              <span className="text-sky-300 font-normal">
                (c/ {metrics.effectiveIntervalSec.toFixed(1)}s)
              </span>
            </span>
          </div>

          <div className="h-6 w-px bg-slate-800 hidden sm:block" />

          <div>
            <span className="text-slate-400 block text-[10px]">💾 Almacenamiento SD</span>
            <span className="font-mono font-semibold text-cyan-300 tabular-nums">
              {metrics.totalStorageMB >= 1024
                ? `${metrics.totalStorageGB.toFixed(2)} GB`
                : `${metrics.totalStorageMB.toFixed(0)} MB`}{' '}
              <span className="text-slate-400 font-normal">
                ({metrics.requiredWriteSpeedMBps.toFixed(1)} MB/s)
              </span>
            </span>
          </div>

          <div className="h-6 w-px bg-slate-800 hidden sm:block" />

          <div>
            <span className="text-slate-400 block text-[10px]">Tiempo / Distancia</span>
            <span className="font-mono font-semibold text-slate-100 tabular-nums">
              {formatDuration(metrics.totalFlightTimeS)} ·{' '}
              {(metrics.totalDistanceM / 1000).toFixed(2)} km
            </span>
          </div>

          <div className="h-6 w-px bg-slate-800 hidden sm:block" />

          <div className="flex items-center gap-1.5">
            <BatteryCharging
              className={`w-4 h-4 ${
                metrics.batteriesRequired > 1 ? 'text-amber-400' : 'text-emerald-400'
              }`}
            />
            <div>
              <span className="text-slate-400 block text-[10px]">Baterías Air 3S</span>
              <span className="font-mono font-semibold text-slate-100 tabular-nums">
                {metrics.batteriesRequired || 1} bat ({metrics.usableBatteryMinutes}m)
              </span>
            </div>
          </div>

          {hoverLatLng && (
            <>
              <div className="h-6 w-px bg-slate-800 hidden xl:block" />
              <div className="hidden xl:flex items-center gap-1 text-[11px] font-mono text-slate-400 tabular-nums">
                <MapPin className="w-3 h-3 text-slate-500" />
                <span>
                  {hoverLatLng.lat.toFixed(5)}, {hoverLatLng.lng.toFixed(5)}
                </span>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};
