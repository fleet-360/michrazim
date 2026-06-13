"use client";

import * as React from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import "mapbox-gl/dist/mapbox-gl.css";
import { useTheme } from "next-themes";
import { gl, USE_MAPBOX, mapboxStyle } from "./gl";
import {
  centroid,
  insetRing,
  insetMeters,
  synthRing,
  meterFrame,
  absAreaM2,
  scaleToAreaM2,
  principalAxis,
  orientedRectInside,
  ringBounds,
  ringOrientationDeg,
  FLOOR_H,
  COVERAGE,
  type Ring,
} from "./geo";
import { CheckCircle2 } from "lucide-react";

export interface Comparable {
  lat?: number;
  lng?: number;
  pricePerSqm?: number;
}

export interface ProjectMapProps {
  lat: number;
  lng: number;
  areaSqm: number;
  parcelRing?: Ring;
  gush?: string;
  helka?: string;
  /** Number of floors — drives the massing height & form. */
  floors?: number;
  /** Building-coverage ratio (תכסית) used upstream to derive floors. Sizing the
   *  visual footprint from the same number keeps the massing and floor math
   *  consistent — footprint area = coverageRatio · parcelArea. */
  coverageRatio?: number;
  comparables?: Comparable[];
  className?: string;
  interactive?: boolean;
}

const SETBACK_M = 5; // קו בניין — perpendicular setback from every parcel edge
const TOWER_FROM_PODIUM_M = 3; // extra inset of the tower face from the podium edge
const TOWER_ASPECT = 2.4; // slab slenderness when high-rise & elongated
const ELONGATION_FOR_TOWER = 1.35; // only orient a slab if the lot is this elongated

/* ── architectural palette (both themes) ─────────────────────────────────────
 *  Cool desaturated steel-blue glass tower (reads as curtain-wall, not toy
 *  plastic) against a warm sandstone podium — the material contrast is the
 *  "mature product" cue. A slim brushed-gold parapet replaces the old amber cap.
 *  Works on BOTH the Mapbox and the MapLibre/CARTO raster paths. */
function palette(dark: boolean) {
  return {
    tower: dark ? "#5b6b8c" : "#8aa0c4", // glass curtain-wall
    towerHi: dark ? "#6f80a6" : "#9fb2d2", // slender high-rise variant
    podium: dark ? "#6b6357" : "#cabfab", // warm stone / concrete
    podiumLobby: dark ? "#2f3647" : "#3a4253", // recessed glazed ground floor
    cornice: dark ? "#8a8170" : "#ddd2bd", // proud podium roofline cap
    parapet: dark ? "#caa24a" : "#b88a2e", // brushed-gold crown lip
    roofPlate: dark ? "#262c3a" : "#3a4151", // dark recessed roof inside parapet
    penthouse: dark ? "#4a5266" : "#9aa3b5", // mechanical setback box
    frame: dark ? "#54607a" : "#7a89a8", // structural frame behind the glass
    core: dark ? "#3f4658" : "#8b94a8", // service-core overrun
    reveal: dark ? "#2b3550" : "#5e6c8c", // recessed floor groove (catches shadow)
    proud: dark ? "#7a8cb0" : "#aebdda", // projecting slab face (lighter than glass)
    bay: dark ? "#46506b" : "#6f7ea0", // vertical facade reveal
    balcony: dark ? "#8294b8" : "#a9b8d6", // mid-height amenity band
    parcelFill: dark ? "#5b6b8c" : "#8aa0c4", // tinted to the tower hue
    parcelLine: dark ? "#9fb0d0" : "#5d6f96", // dashed survey line
  };
}

function rasterStyle(dark: boolean): maplibregl.StyleSpecification {
  const variant = dark ? "dark_all" : "light_all";
  return {
    version: 8,
    sources: {
      carto: {
        type: "raster",
        tiles: [
          `https://a.basemaps.cartocdn.com/${variant}/{z}/{x}/{y}@2x.png`,
          `https://b.basemaps.cartocdn.com/${variant}/{z}/{x}/{y}@2x.png`,
          `https://c.basemaps.cartocdn.com/${variant}/{z}/{x}/{y}@2x.png`,
        ],
        tileSize: 256,
        attribution: "© CARTO © OpenStreetMap",
      },
    },
    layers: [{ id: "carto", type: "raster", source: "carto" }],
  };
}

function poly(ring: Ring, props: Record<string, number> = {}): GeoJSON.Feature {
  return { type: "Feature", properties: props, geometry: { type: "Polygon", coordinates: [ring] } };
}

/* ── Mapbox-only feature detection ───────────────────────────────────────────
 *  The `gl` export is typed as MapLibre; Mapbox's environment APIs (setLights,
 *  setLight, setFog) are not on that type. We feature-detect each method and
 *  cast through a narrow shim so TS strict stays happy and nothing crashes when
 *  the method is absent (the MapLibre/CARTO fallback). Everything here is also
 *  gated behind USE_MAPBOX. */
type AnyMap = maplibregl.Map & {
  setLights?: (l: unknown[]) => void;
  setLight?: (l: unknown, o?: unknown) => void;
  setFog?: (f: unknown) => void;
};
function hasFn(map: maplibregl.Map, fn: "setLights" | "setLight" | "setFog"): boolean {
  return typeof (map as unknown as Record<string, unknown>)[fn] === "function";
}

/** Directional sun + ambient sky. AO/flood-light only render once lights exist,
 *  so this MUST run before the extrusion layers are added/restyled. */
function applyLights(map: maplibregl.Map, dark: boolean) {
  if (!USE_MAPBOX) return;
  const mb = map as AnyMap;
  if (hasFn(map, "setLights")) {
    try {
      // direction = [azimuth°, polar°]: azimuth clockwise from north (210 = SW),
      // polar from vertical (30 = mid-afternoon) → strong raking facade shadows.
      mb.setLights!([
        {
          id: "ambient-sky",
          type: "ambient",
          properties: {
            color: dark ? "#9fb4d8" : "#ffffff",
            intensity: dark ? 0.55 : 0.6,
          },
        },
        {
          id: "sun",
          type: "directional",
          properties: {
            color: dark ? "#cdd7f0" : "#fff4e0", // cool moonlight vs warm afternoon sun
            intensity: dark ? 0.45 : 0.8,
            direction: [210, 30],
            "cast-shadows": true,
            "shadow-intensity": dark ? 0.55 : 0.8,
          },
        },
      ]);
      return;
    } catch {
      /* fall through to legacy */
    }
  }
  if (hasFn(map, "setLight")) {
    try {
      // legacy flat shape: position = [radial, azimuthal°, polar-from-up°]
      mb.setLight!(
        {
          anchor: "map",
          color: dark ? "#cdd7f0" : "#fff4e0",
          intensity: dark ? 0.45 : 0.7,
          position: [1.5, 210, 60],
        },
        {},
      );
    } catch {
      /* no-op */
    }
  }
}

/** Atmospheric depth fog tuned per theme. Mapbox-only. */
function applyFog(map: maplibregl.Map, dark: boolean) {
  if (!USE_MAPBOX || !hasFn(map, "setFog")) return;
  const mb = map as AnyMap;
  try {
    mb.setFog!(
      dark
        ? {
            range: [1.5, 12],
            color: "#10131c",
            "high-color": "#1b2740",
            "space-color": "#05070d",
            "horizon-blend": 0.04,
            "star-intensity": 0.25,
          }
        : {
            range: [2, 14],
            color: "#dfe6f2",
            "high-color": "#c4d4ee",
            "space-color": "#eaf1fb",
            "horizon-blend": 0.06,
            "star-intensity": 0.0,
          },
    );
  } catch {
    /* no-op */
  }
}

/** Atmosphere-type sky, sun aligned with the directional light (SW). Mapbox-only. */
function applySky(map: maplibregl.Map, dark: boolean) {
  if (!USE_MAPBOX || map.getLayer("sky")) return;
  try {
    map.addLayer({
      id: "sky",
      // 'sky' is not in MapLibre's layer union; cast for TS on the Mapbox path.
      type: "sky" as unknown as "background",
      paint: {
        "sky-type": "atmosphere",
        // [azimuth°, elevation-above-horizon°] — elevation 60 ≈ polar 30 above.
        "sky-atmosphere-sun": [210, 60],
        "sky-atmosphere-sun-intensity": dark ? 5 : 12,
        "sky-atmosphere-color": dark ? "#1b2740" : "#bcd6ff",
        "sky-atmosphere-halo-color": dark ? "#2a3a5c" : "#ffffff",
      } as unknown as maplibregl.BackgroundLayerSpecification["paint"],
    } as unknown as maplibregl.LayerSpecification);
  } catch {
    /* no-op */
  }
}

/** Height-graded muted palette for surrounding (non-project) buildings. */
function contextColor(dark: boolean): unknown {
  return dark
    ? [
        "interpolate",
        ["linear"],
        ["coalesce", ["get", "height"], 6],
        0,
        "#2b3344",
        20,
        "#333c50",
        60,
        "#3c4762",
      ]
    : [
        "interpolate",
        ["linear"],
        ["coalesce", ["get", "height"], 6],
        0,
        "#d9dde6",
        20,
        "#cfd4df",
        60,
        "#c2c9d8",
      ];
}

/**
 * Extrude surrounding real buildings from the Mapbox classic style's `composite`
 * source (`building` source-layer carries height/min_height). View-bounded by the
 * vector tiler + minzoom, so it stays at 60fps. No-op on the raster fallback,
 * where the CARTO basemap already shows flat footprints under the project.
 */
function addContextBuildings(map: maplibregl.Map, dark: boolean) {
  if (!USE_MAPBOX) return;
  if (map.getLayer("context-buildings")) return;
  if (!map.getSource("composite")) return;

  // Hide the stock building layer(s) so our muted palette owns the cityscape.
  for (const id of ["building", "building-extrusion", "3d-buildings"]) {
    if (map.getLayer(id)) {
      try {
        map.setLayoutProperty(id, "visibility", "none");
      } catch {
        /* no-op */
      }
    }
  }

  map.addLayer({
    id: "context-buildings",
    type: "fill-extrusion",
    source: "composite",
    "source-layer": "building",
    minzoom: 14, // perf: nothing extrudes below the project's working zoom
    filter: ["all", ["==", ["get", "extrude"], "true"], ["==", ["geometry-type"], "Polygon"]],
    paint: {
      "fill-extrusion-color": contextColor(dark) as maplibregl.ExpressionSpecification,
      "fill-extrusion-height": [
        "interpolate",
        ["linear"],
        ["zoom"],
        14.5,
        0,
        15.5,
        ["coalesce", ["get", "height"], 6],
      ] as unknown as maplibregl.ExpressionSpecification,
      "fill-extrusion-base": ["coalesce", ["get", "min_height"], 0] as unknown as maplibregl.ExpressionSpecification,
      "fill-extrusion-opacity": dark ? 0.82 : 0.9,
      "fill-extrusion-vertical-gradient": true,
      // soft contact darkening — only fires with lights set (applyLights ran first)
      "fill-extrusion-ambient-occlusion-intensity": 0.25,
      "fill-extrusion-ambient-occlusion-radius": 3,
    } as unknown as maplibregl.FillExtrusionLayerSpecification["paint"],
    // No beforeId → sits directly above the basemap; project layers (added later
    // in applyParcel) draw on top.
  } as maplibregl.LayerSpecification);
}

/* ── massing geometry ────────────────────────────────────────────────────────
 *  `kind` codes tag every articulation/podium/crown feature so a single
 *  fill-extrusion layer can color material variety via a ["match", …]
 *  expression — keeps the layer count tiny and `setData`-friendly. */

const MAX_FLOOR_BANDS = 28; // hard perf cap on floor-reveal features

interface Massing {
  parcel: GeoJSON.Feature;
  podium: GeoJSON.FeatureCollection; // lobby + stone + cornice (kind 20-22)
  tower: GeoJSON.Feature; // glass shaft
  towerColor: string;
  frame: GeoJSON.Feature; // structural frame inside the glass
  articulation: GeoJSON.FeatureCollection; // floor reveals, bays, balcony (kind 0-3)
  crown: GeoJSON.FeatureCollection; // roof plate + parapet + penthouse (kind 10-13)
  core: GeoJSON.Feature; // service-core overrun (kind 30; flat placeholder when low-rise)
  footprintRing: Ring; // the podium/footprint ring, for the ground-contact shadow
}

type FormTier = "block" | "podium-tower" | "slender";

/** Thin recessed floor-line grooves (and optional proud slab faces) stacked in
 *  Z over the shaft. Bounded by MAX_FLOOR_BANDS; the step thins out tall towers. */
function floorReveals(
  shaftRing: Ring,
  recessRing: Ring,
  proudRing: Ring,
  baseElev: number,
  topElev: number,
  proud: boolean,
): GeoJSON.Feature[] {
  const SLAB_REVEAL_H = 0.25;
  const SLAB_PROUD_H = 0.35;
  const span = topElev - baseElev;
  const nFloors = Math.max(1, Math.floor(span / FLOOR_H));
  const step = Math.max(1, Math.ceil(nFloors / MAX_FLOOR_BANDS));
  const out: GeoJSON.Feature[] = [];
  for (let i = step; i < nFloors; i += step) {
    const z = baseElev + i * FLOOR_H;
    if (z > topElev - SLAB_REVEAL_H) break;
    out.push(poly(recessRing, { base: z - SLAB_REVEAL_H, top: z, kind: 0 }));
    if (proud) out.push(poly(proudRing, { base: z, top: z + SLAB_PROUD_H, kind: 1 }));
  }
  return out;
}

/** Two full-height vertical reveal strips on a slab lot's long facade (bays). */
function facadeBays(
  axisDir: [number, number],
  c: [number, number],
  frame: ReturnType<typeof meterFrame>,
  longSide: number,
  shortSide: number,
  baseElev: number,
  topElev: number,
): GeoJSON.Feature[] {
  const w = 0.4; // reveal width (m)
  const ax = axisDir;
  const pp: [number, number] = [-ax[1], ax[0]];
  const half = shortSide / 2 + 0.05; // span the depth, slightly proud
  const offsets = [-longSide / 6, longSide / 6]; // ~1/3 & 2/3 along the long axis
  const cm = meterToRef(c, frame);
  const feats: GeoJSON.Feature[] = [];
  for (const o of offsets) {
    const cornersM: [number, number][] = (
      [
        [o - w / 2, -half],
        [o + w / 2, -half],
        [o + w / 2, half],
        [o - w / 2, half],
      ] as [number, number][]
    ).map(([u, v]) => [cm[0] + ax[0] * u + pp[0] * v, cm[1] + ax[1] * u + pp[1] * v]);
    const ring: Ring = cornersM.map((m) => refToLngLat(m, frame));
    ring.push(ring[0]);
    feats.push(poly(ring, { base: baseElev, top: topElev, kind: 2 }));
  }
  return feats;
}

// tiny meter<->lnglat helpers bound to a frame (kept local to the facade-bay math)
function meterToRef(p: [number, number], f: ReturnType<typeof meterFrame>): [number, number] {
  return [(p[0] - f.lng0) * f.mPerLng, (p[1] - f.lat0) * 111320];
}
function refToLngLat(p: [number, number], f: ReturnType<typeof meterFrame>): [number, number] {
  return [f.lng0 + p[0] / f.mPerLng, f.lat0 + p[1] / 111320];
}

/**
 * Height- & footprint-responsive massing. Footprints are TRUE metric offsets of
 * the real parcel (קו בניין setback + coverage-sized podium + principal-axis
 * tower), so the building sits believably inside the lot with a real setback gap
 * and the tower runs along the lot's long axis.
 */
function buildMassing(ring: Ring, floors: number, coverageRatio = COVERAGE): Massing {
  const f = Math.max(2, Math.round(floors));
  const totalH = f * FLOOR_H;
  const c = centroid(ring);
  const frame = meterFrame(c[0], c[1]);
  const plotArea = absAreaM2(ring, frame);

  // form tier by height
  let tier: FormTier;
  if (f <= 8) tier = "block";
  else if (f <= 22) tier = "podium-tower";
  else tier = "slender";
  const podiumFloors = tier === "block" ? 0 : tier === "podium-tower" ? 4 : 5;
  const podiumH = podiumFloors * FLOOR_H;

  // 1) Setback offset = the building line (true metric, never null via fallback).
  const offset = insetMeters(ring, SETBACK_M, 0.25, frame);
  const offsetArea = absAreaM2(offset, frame);

  // 2) Podium = setback footprint sized to coverage (תכסית), capped by offset area.
  const targetFootprint = Math.min(coverageRatio * plotArea, offsetArea);
  const podiumRing =
    targetFootprint < offsetArea - 1 ? scaleToAreaM2(offset, targetFootprint, frame) : offset;

  // 3) Tower: oriented slab along the principal axis, further inset from podium.
  const axis = principalAxis(ring, frame);
  const towerContainer = insetMeters(podiumRing, TOWER_FROM_PODIUM_M, 0.4, frame);
  const containerArea = absAreaM2(towerContainer, frame);
  const towerFrac = f <= 8 ? 1.0 : f <= 22 ? 0.62 : 0.44; // slimmer with height
  const towerArea = Math.min(absAreaM2(podiumRing, frame) * towerFrac, containerArea);
  const slab = axis.elongation >= ELONGATION_FOR_TOWER;
  const useOriented = f > 8 && slab;
  const shaftRing = useOriented
    ? orientedRectInside(
        towerContainer,
        axis.dir,
        { targetAreaM2: towerArea, aspect: TOWER_ASPECT },
        frame,
      )
    : scaleToAreaM2(towerContainer, towerArea, frame);

  const shaftBase = podiumH;
  const shaftTop = totalH;

  // structural frame just inside the glass (peeks ~0.4m above at the top)
  const frameRing = insetMeters(shaftRing, 0.6, 0.5, frame);

  // ── articulation (floor reveals + slab lot bays + balcony) — bounded ────────
  const recessRing = insetMeters(shaftRing, 0.15, 0.5, frame); // groove (inward)
  const proudRing = insetRing(shaftRing, -0.0015); // projecting slab (slight outward)
  const art: GeoJSON.Feature[] = [];
  art.push(...floorReveals(shaftRing, recessRing, proudRing, shaftBase, shaftTop, tier !== "block"));

  // metrics for slab-lot bay articulation
  const sb = ringBounds(shaftRing);
  const shaftFrame = meterFrame((sb[0] + sb[2]) / 2, (sb[1] + sb[3]) / 2);
  const sm = absAreaM2(shaftRing, shaftFrame);
  // approximate side lengths from the oriented axis for bay placement
  if (useOriented) {
    const longSide = Math.sqrt(sm * TOWER_ASPECT);
    const shortSide = sm / Math.max(longSide, 1);
    const sc = centroid(shaftRing);
    art.push(
      ...facadeBays(axis.dir, sc, frame, longSide, shortSide, shaftBase, shaftTop),
    );
  }
  if (f >= 14) {
    const z = shaftBase + (shaftTop - shaftBase) * 0.45;
    const balconyRing = insetRing(shaftRing, -0.0035); // projects slightly proud
    art.push(poly(balconyRing, { base: z, top: z + 0.8, kind: 3 }));
  }

  // ── podium: recessed glass lobby + stone mass + proud cornice ───────────────
  const podiumFeatures: GeoJSON.Feature[] = [];
  if (podiumFloors > 0) {
    const lobbyRing = insetMeters(podiumRing, 0.5, 0.6, frame); // recessed glazed base
    const corniceRing = insetRing(podiumRing, -0.0025); // proud roofline cap
    podiumFeatures.push(
      poly(lobbyRing, { base: 0, top: 0.4, kind: 20 }), // glass lobby
      poly(podiumRing, { base: 0.4, top: Math.max(podiumH - 0.5, 0.5), kind: 21 }), // stone mass
      poly(corniceRing, { base: Math.max(podiumH - 0.5, 0.5), top: podiumH + 0.3, kind: 22 }), // cornice
    );
  } else {
    // low block: the shaft itself is the building; keep an empty source feature
    podiumFeatures.push(poly(podiumRing, { base: 0, top: 0, kind: 21 }));
  }

  // ── crown: dark recessed roof plate + parapet upstand + mechanical penthouse ─
  const parapetRing = insetRing(shaftRing, 0.012); // ~edge — a parapet, not a centred block
  const roofPlateRing = insetMeters(shaftRing, 0.9, 0.6, frame);
  const phInset = Math.max(1.5, Math.sqrt(sm) * 0.18);
  const penthouseRing = insetMeters(shaftRing, phInset, 0.5, frame);
  const phCapRing = insetMeters(shaftRing, phInset + 0.3, 0.5, frame);
  const crownFeatures: GeoJSON.Feature[] = [
    poly(roofPlateRing, { base: totalH, top: totalH + 0.15, kind: 10 }), // dark recessed roof
    poly(parapetRing, { base: totalH, top: totalH + 0.9, kind: 11 }), // slim parapet lip
  ];
  // no mechanical penthouse on low blocks (looks wrong on a 6-storey)
  if (f > 10) {
    crownFeatures.push(
      poly(penthouseRing, { base: totalH + 0.15, top: totalH + 2.6, kind: 12 }), // mechanical setback
      poly(phCapRing, { base: totalH + 2.6, top: totalH + 3.0, kind: 13 }), // penthouse coping
    );
  }

  // ── service-core overrun (high-rise) — always emit a feature for the source ──
  const coreRing = insetMeters(shaftRing, Math.max(Math.sqrt(sm) * 0.25, 2), 0.4, frame);
  const core =
    tier === "slender"
      ? poly(coreRing, { base: totalH + 1.0, top: totalH + 4.5, kind: 30 })
      : poly(coreRing, { base: 0, top: 0, kind: 30 }); // flat placeholder keeps the source alive

  const towerColor = tier === "slender" ? palette(true).towerHi : palette(true).tower;

  return {
    parcel: poly(ring),
    podium: { type: "FeatureCollection", features: podiumFeatures },
    tower: poly(shaftRing, { base: shaftBase, top: shaftTop }),
    towerColor,
    frame: poly(frameRing, { base: shaftBase, top: shaftTop + 0.4 }),
    articulation: { type: "FeatureCollection", features: art },
    crown: { type: "FeatureCollection", features: crownFeatures },
    core,
    footprintRing: podiumRing,
  };
}

/** Color-by-`kind` match expression builder for the multi-material layers. */
function matchColor(pal: ReturnType<typeof palette>, group: "podium" | "art" | "crown") {
  if (group === "podium") {
    return [
      "match",
      ["get", "kind"],
      20,
      pal.podiumLobby,
      22,
      pal.cornice,
      /* 21 default */ pal.podium,
    ];
  }
  if (group === "art") {
    return ["match", ["get", "kind"], 0, pal.reveal, 1, pal.proud, 2, pal.bay, 3, pal.balcony, pal.reveal];
  }
  // crown
  return [
    "match",
    ["get", "kind"],
    10,
    pal.roofPlate,
    11,
    pal.parapet,
    12,
    pal.penthouse,
    13,
    pal.cornice,
    pal.parapet,
  ];
}

/* ── camera framing ─────────────────────────────────────────────────────────
 *  fitBounds works identically on both libraries and animates pitch+bearing in
 *  one call (cameraForBounds is library-divergent — maplibre 5 drops pitch — so
 *  we don't rely on it for the cross-path reveal). */
function frameToParcel(map: maplibregl.Map, ring: Ring, animate: boolean, duration: number) {
  const [w, s, e, n] = ringBounds(ring);
  const bounds = new gl.LngLatBounds([w, s], [e, n]);
  // three-quarter view of the long facade: long-axis bearing + 30°
  const bearing = (ringOrientationDeg(ring) + 30) % 360;
  map.fitBounds(bounds, {
    padding: { top: 90, bottom: 70, left: 70, right: 70 }, // keep the setback gap visible
    bearing,
    pitch: 58,
    maxZoom: 18,
    duration: animate ? duration : 0,
    essential: true,
    offset: [0, -28], // sit the lot a touch low so the tower has headroom
  } as maplibregl.FitBoundsOptions);
}

export function ProjectMap({
  lat,
  lng,
  areaSqm,
  parcelRing,
  gush,
  helka,
  floors = 12,
  coverageRatio = COVERAGE,
  comparables = [],
  className,
  interactive = true,
}: ProjectMapProps) {
  const containerRef = React.useRef<HTMLDivElement>(null);
  const mapRef = React.useRef<maplibregl.Map | null>(null);
  const ringRef = React.useRef<Ring | null>(null);
  const { resolvedTheme } = useTheme();
  const dark = resolvedTheme !== "light";
  const [parcelLive, setParcelLive] = React.useState(false);
  const [scrollHint, setScrollHint] = React.useState(false);

  const initialRing = React.useMemo<Ring>(
    () => (parcelRing && parcelRing.length >= 4 ? parcelRing : synthRing(lat, lng, areaSqm)),
    [parcelRing, lat, lng, areaSqm],
  );

  const applyParcel = React.useCallback(
    (map: maplibregl.Map, ring: Ring) => {
      ringRef.current = ring;
      const m = buildMassing(ring, floors, coverageRatio);
      const pal = palette(dark);
      const set = (id: string, data: GeoJSON.GeoJSON) => {
        const src = map.getSource(id) as maplibregl.GeoJSONSource | undefined;
        if (src) src.setData(data);
      };

      // ground-contact shadow: a wide soft halo + a tighter dark core under the
      // building, so the massing reads as grounded in the lot on BOTH paths.
      const shadowHalo = insetRing(m.footprintRing, -0.18); // expand outward ~18%
      const shadowCore = insetRing(m.footprintRing, -0.04);
      const shadowData: GeoJSON.FeatureCollection = {
        type: "FeatureCollection",
        features: [poly(shadowHalo, { soft: 1 }), poly(shadowCore, { soft: 0 })],
      };

      if (!map.getSource("parcel")) {
        // parcel fill (tinted to the tower hue) + soft glow underlay + dashed line
        map.addSource("parcel", { type: "geojson", data: m.parcel });
        map.addLayer({
          id: "parcel-fill",
          type: "fill",
          source: "parcel",
          paint: { "fill-color": pal.parcelFill, "fill-opacity": dark ? 0.1 : 0.12 },
        });
        map.addLayer({
          id: "parcel-glow",
          type: "line",
          source: "parcel",
          paint: {
            "line-color": pal.parcelLine,
            "line-width": 10,
            "line-blur": 12,
            "line-opacity": dark ? 0.5 : 0.3,
          },
        });
        map.addLayer({
          id: "parcel-line",
          type: "line",
          source: "parcel",
          paint: {
            "line-color": pal.parcelLine,
            "line-width": 2.4,
            "line-dasharray": [2, 1.2],
          },
        });

        // ground-contact shadow (above the parcel, below the extrusions)
        map.addSource("ground-shadow", { type: "geojson", data: shadowData });
        map.addLayer({
          id: "ground-shadow",
          type: "fill",
          source: "ground-shadow",
          paint: {
            "fill-color": "#000000",
            "fill-opacity": [
              "match",
              ["get", "soft"],
              1,
              dark ? 0.16 : 0.12,
              /* core */ dark ? 0.3 : 0.22,
            ],
          },
        });

        // ── extrusion layers, back-to-front: podium → frame → tower → art → crown → core
        // NOTE: edge-radius is a LAYOUT property (@experimental); AO/flood-light
        // are PAINT. Keeping them in the right block avoids style-spec warnings.
        const aoPodium = USE_MAPBOX
          ? {
              "fill-extrusion-ambient-occlusion-intensity": 0.5,
              "fill-extrusion-ambient-occlusion-radius": 4.0,
              "fill-extrusion-ambient-occlusion-ground-radius": 5.5, // contact shadow on the lot
              "fill-extrusion-ambient-occlusion-ground-attenuation": 0.7,
              "fill-extrusion-flood-light-color": "#ffd9a8",
              "fill-extrusion-flood-light-intensity": dark ? 0.25 : 0.0,
              "fill-extrusion-flood-light-ground-radius": 6,
            }
          : {};
        const podiumLayout = USE_MAPBOX ? { "fill-extrusion-edge-radius": 0.25 } : {};
        map.addSource("podium", { type: "geojson", data: m.podium });
        map.addLayer({
          id: "podium-3d",
          type: "fill-extrusion",
          source: "podium",
          layout: podiumLayout as unknown as maplibregl.FillExtrusionLayerSpecification["layout"],
          paint: {
            "fill-extrusion-color": matchColor(pal, "podium") as maplibregl.ExpressionSpecification,
            "fill-extrusion-base": ["get", "base"],
            "fill-extrusion-height": ["get", "top"],
            "fill-extrusion-opacity": 0.97,
            "fill-extrusion-vertical-gradient": true,
            ...aoPodium,
          } as unknown as maplibregl.FillExtrusionLayerSpecification["paint"],
        });

        map.addSource("frame", { type: "geojson", data: m.frame });
        map.addLayer({
          id: "frame-3d",
          type: "fill-extrusion",
          source: "frame",
          paint: {
            "fill-extrusion-color": pal.frame,
            "fill-extrusion-base": ["get", "base"],
            "fill-extrusion-height": ["get", "top"],
            "fill-extrusion-opacity": 1,
          },
        });

        const aoTower = USE_MAPBOX
          ? {
              "fill-extrusion-ambient-occlusion-intensity": 0.45,
              "fill-extrusion-ambient-occlusion-radius": 3.5,
              "fill-extrusion-ambient-occlusion-wall-radius": 3.0,
              "fill-extrusion-flood-light-color": "#bcd2ff",
              "fill-extrusion-flood-light-intensity": dark ? 0.35 : 0.0,
              "fill-extrusion-flood-light-wall-radius": 12,
              "fill-extrusion-flood-light-ground-radius": 8,
              "fill-extrusion-rounded-roof": true, // subtle roof bevel (PAINT property)
            }
          : {};
        // edge-radius is the only LAYOUT-block fill-extrusion prop (@experimental).
        const towerLayout = USE_MAPBOX ? { "fill-extrusion-edge-radius": 0.4 } : {};
        map.addSource("tower", { type: "geojson", data: m.tower });
        map.addLayer({
          id: "tower-3d",
          type: "fill-extrusion",
          source: "tower",
          layout: towerLayout as unknown as maplibregl.FillExtrusionLayerSpecification["layout"],
          paint: {
            "fill-extrusion-color": pal.tower,
            "fill-extrusion-base": ["get", "base"],
            "fill-extrusion-height": ["get", "top"],
            "fill-extrusion-opacity": 1.0,
            "fill-extrusion-vertical-gradient": true, // darker at base, lighter at top
            ...aoTower,
          } as unknown as maplibregl.FillExtrusionLayerSpecification["paint"],
        });

        map.addSource("articulation", { type: "geojson", data: m.articulation });
        map.addLayer({
          id: "art-3d",
          type: "fill-extrusion",
          source: "articulation",
          paint: {
            "fill-extrusion-color": matchColor(pal, "art") as maplibregl.ExpressionSpecification,
            "fill-extrusion-base": ["get", "base"],
            "fill-extrusion-height": ["get", "top"],
            "fill-extrusion-opacity": 1,
          },
        });

        const crownExtra = USE_MAPBOX
          ? {
              // faint gold glow on the parapet/metal at night
              "fill-extrusion-emissive-strength": dark ? 0.3 : 0.0,
            }
          : {};
        map.addSource("crown", { type: "geojson", data: m.crown });
        map.addLayer({
          id: "crown-3d",
          type: "fill-extrusion",
          source: "crown",
          paint: {
            "fill-extrusion-color": matchColor(pal, "crown") as maplibregl.ExpressionSpecification,
            "fill-extrusion-base": ["get", "base"],
            "fill-extrusion-height": ["get", "top"],
            "fill-extrusion-opacity": 1,
            ...crownExtra,
          } as unknown as maplibregl.FillExtrusionLayerSpecification["paint"],
        });

        map.addSource("core", { type: "geojson", data: m.core });
        map.addLayer({
          id: "core-3d",
          type: "fill-extrusion",
          source: "core",
          paint: {
            "fill-extrusion-color": pal.core,
            "fill-extrusion-base": ["get", "base"],
            "fill-extrusion-height": ["get", "top"],
            "fill-extrusion-opacity": 1,
          },
        });
      } else {
        set("parcel", m.parcel);
        set("ground-shadow", shadowData);
        set("podium", m.podium);
        set("frame", m.frame);
        set("tower", m.tower);
        set("articulation", m.articulation);
        set("crown", m.crown);
        set("core", m.core);
        // re-tint the tower in case the tier changed (block/podium/slender hue)
        map.setPaintProperty("tower-3d", "fill-extrusion-color", m.towerColor);
      }
    },
    [floors, coverageRatio, dark],
  );

  React.useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const style: string | maplibregl.StyleSpecification = USE_MAPBOX
      ? mapboxStyle(dark)
      : rasterStyle(dark);

    const map = new gl.Map({
      container: containerRef.current,
      style,
      center: [lng, lat],
      zoom: 15.2, // start slightly out; the reveal flies into the framed parcel
      pitch: 30,
      bearing: 0,
      // Disable the default attribution control and add a compact one explicitly:
      // mapbox-gl types the map option as `attributionControl?: boolean` and ignores
      // a `{ compact }` object (rendering non-compact), while maplibre accepts the
      // object. Adding the control with { compact: true } gives a compact pill on
      // BOTH paths — both libraries expose AttributionControl with that option.
      attributionControl: false,
      interactive,
    });
    mapRef.current = map;
    map.addControl(new gl.AttributionControl({ compact: true }));
    map.addControl(new gl.NavigationControl({ visualizePitch: true }), "top-left");

    // Cooperative scroll: page scrolls freely; Ctrl/⌘ + wheel zooms the map.
    map.scrollZoom.disable();
    const container = containerRef.current;
    let hintTimer: ReturnType<typeof setTimeout>;
    const onWheel = (e: WheelEvent) => {
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        const p = map.unproject([e.offsetX, e.offsetY]);
        map.easeTo({ zoom: map.getZoom() - e.deltaY * 0.0026, around: p, duration: 60 });
      } else {
        setScrollHint(true);
        clearTimeout(hintTimer);
        hintTimer = setTimeout(() => setScrollHint(false), 1300);
      }
    };
    container.addEventListener("wheel", onWheel, { passive: false });

    map.on("load", () => {
      // Order matters: lights → fog → sky → context buildings → project massing,
      // so the AO/flood-light on the extrusions have lights to react to.
      applyLights(map, dark);
      applyFog(map, dark);
      applySky(map, dark);
      addContextBuildings(map, dark);
      applyParcel(map, initialRing);

      for (const c of comparables) {
        if (c.lat == null || c.lng == null) continue;
        const el = document.createElement("div");
        el.style.cssText =
          "background:#f59e0b;color:#1c1208;font-size:10px;font-weight:700;padding:2px 6px;border-radius:999px;box-shadow:0 1px 4px rgba(0,0,0,.4);white-space:nowrap;transform:translateY(-4px)";
        el.textContent = c.pricePerSqm ? `${Math.round(c.pricePerSqm / 1000)}K/מ״ר` : "עסקה";
        new gl.Marker({ element: el }).setLngLat([c.lng, c.lat]).addTo(map);
      }

      // cinematic reveal: fly into a padded, pitched, lot-oriented frame (2.2s)
      frameToParcel(map, ringRef.current ?? initialRing, true, 2200);

      if (gush && helka) {
        fetch(`/api/parcel?gush=${encodeURIComponent(gush)}&helka=${encodeURIComponent(helka)}`)
          .then((r) => r.json())
          .then((d) => {
            const ring = d?.parcel?.ring as Ring | undefined;
            if (ring && ring.length >= 3 && mapRef.current) {
              applyParcel(mapRef.current, ring);
              frameToParcel(mapRef.current, ring, true, 1200); // re-frame to the real parcel
              setParcelLive(true);
            }
          })
          .catch(() => {});
      }
    });

    return () => {
      container.removeEventListener("wheel", onWheel);
      clearTimeout(hintTimer);
      map.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dark]);

  // live-update massing when the floor count changes — keep the current (live) ring
  React.useEffect(() => {
    const map = mapRef.current;
    if (map && map.isStyleLoaded() && map.getSource("tower") && ringRef.current) {
      applyParcel(map, ringRef.current);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [floors]);

  return (
    <div className={className} style={{ position: "relative", width: "100%", height: "100%", minHeight: 320 }}>
      <div ref={containerRef} style={{ width: "100%", height: "100%", borderRadius: "var(--radius-lg)", overflow: "hidden" }} />
      {parcelLive && (
        <div className="absolute bottom-3 right-3 z-10 flex items-center gap-1.5 rounded-full bg-success/90 px-2.5 py-1 text-xs font-medium text-white shadow-lg backdrop-blur">
          <CheckCircle2 className="size-3.5" />
          חלקה אמיתית · govmap
        </div>
      )}
      <div className="pointer-events-none absolute bottom-3 left-3 z-10 rounded-full bg-black/55 px-2.5 py-1 text-xs font-semibold text-white backdrop-blur">
        {Math.round(floors)} קומות · ~{Math.round(floors * FLOOR_H)} מ׳
      </div>
      <div
        className={`pointer-events-none absolute inset-0 z-20 grid place-items-center transition-opacity duration-200 ${scrollHint ? "opacity-100" : "opacity-0"}`}
      >
        <div className="rounded-full bg-black/70 px-4 py-2 text-sm font-medium text-white backdrop-blur">
          החזיקו Ctrl וגללו כדי להתקרב
        </div>
      </div>
    </div>
  );
}

export default ProjectMap;
