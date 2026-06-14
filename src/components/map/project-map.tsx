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
  toMeters,
  toLngLat,
  absAreaM2,
  principalAxis,
  ringBounds,
  ringOrientationDeg,
  FLOOR_H,
  COVERAGE,
  pickScheme,
  type Tier,
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
  /** Total dwelling units — drives the building TYPOLOGY & COUNT (1 block vs a
   *  cluster of towers), so the massing reflects the real scheme size. */
  units?: number;
  /** Building-coverage ratio (תכסית) used upstream to derive floors. Sizing the
   *  visual footprint from the same number keeps the massing and floor math
   *  consistent — footprint area = coverageRatio · parcelArea. */
  coverageRatio?: number;
  /** Illustrative volume study (no real parcel): lays a clean neutral ground pad
   *  under the massing so it reads as a deliberate study, not a building dropped
   *  on a street. Used for tenders that carry no cadastral coordinates. */
  illustrative?: boolean;
  comparables?: Comparable[];
  className?: string;
  interactive?: boolean;
}

const SETBACK_M = 5; // קו בניין — perpendicular setback from every parcel edge

/* ── architectural palette (both themes) ─────────────────────────────────────
 *  Cool desaturated steel-blue glass tower (reads as curtain-wall, not toy
 *  plastic) against a warm sandstone podium — the material contrast is the
 *  "mature product" cue. A slim brushed-gold parapet replaces the old amber cap.
 *  Works on BOTH the Mapbox and the MapLibre/CARTO raster paths. */
function palette(dark: boolean) {
  return {
    tower: dark ? "#5b6b8c" : "#8aa0c4", // glass curtain-wall
    towerHi: dark ? "#6f80a6" : "#9fb2d2", // slender high-rise variant
    slabBody: dark ? "#5f6b78" : "#aeb9c6", // mid-rise residential slab (plaster + glazing)
    cottageBody: dark ? "#7a6f5a" : "#d8cdb4", // low garden-apartment / cottage (warm render)
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
    groundPad: dark ? "#0c111c" : "#e9edf4", // neutral plot under an illustrative study
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
      // collapse to 0 height when feature-state `hide` is set — we "demolish" the
      // existing buildings that sit on the project's lot so the massing reads as a
      // cleared development site rather than clipping through real buildings.
      // NOTE: the spec requires `zoom` to be the TOP-LEVEL input to interpolate, so
      // the `hide` case must live INSIDE the interpolate output (not wrap it) — the
      // old wrapping form threw a style error and the layer never got added.
      "fill-extrusion-height": [
        "interpolate",
        ["linear"],
        ["zoom"],
        14.5,
        0,
        15.5,
        ["case", ["boolean", ["feature-state", "hide"], false], 0, ["coalesce", ["get", "height"], 6]],
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

const MAX_FLOOR_BANDS = 28; // hard perf cap on floor-reveal features (total across buildings)

// Building typology (Tier) and the unit→scheme picker now live in ./geo (the light,
// side-effect-free module) so the on-screen rationale can derive the SAME numbers
// without pulling the heavy maplibre bundle. Material/aspect maps stay here.
const TIER_KIND: Record<Tier, number> = { tower: 40, towerHi: 41, slab: 42, block: 43, cottage: 44 };
const TIER_ASPECT: Record<Tier, number> = { cottage: 1.2, block: 1.5, slab: 2.6, tower: 1.15, towerHi: 1.1 };

interface Massing {
  parcel: GeoJSON.Feature;
  podium: GeoJSON.FeatureCollection; // shared podium (towers) or empty placeholder
  shafts: GeoJSON.FeatureCollection; // one extruded body per building (kind = material)
  frame: GeoJSON.FeatureCollection; // (unused now — kept so the layer source stays alive)
  articulation: GeoJSON.FeatureCollection; // floor-line reveals across all buildings
  crown: GeoJSON.FeatureCollection; // parapet + penthouse per building
  core: GeoJSON.FeatureCollection; // (unused now)
  footprintRings: Ring[]; // every building footprint, for ground-contact shadows
  scheme: { n: number; floorsPer: number; tier: Tier }; // for the on-map caption
}

const EMPTY_FC: GeoJSON.FeatureCollection = { type: "FeatureCollection", features: [] };

/** Thin recessed floor-line grooves (and optional proud slab faces) stacked in
 *  Z over the shaft. Bounded by MAX_FLOOR_BANDS; the step thins out tall towers. */
function floorReveals(
  shaftRing: Ring,
  recessRing: Ring,
  proudRing: Ring,
  baseElev: number,
  topElev: number,
  proud: boolean,
  cap = MAX_FLOOR_BANDS,
): GeoJSON.Feature[] {
  const SLAB_REVEAL_H = 0.25;
  const SLAB_PROUD_H = 0.35;
  const span = topElev - baseElev;
  const nFloors = Math.max(1, Math.floor(span / FLOOR_H));
  const step = Math.max(1, Math.ceil(nFloors / cap));
  const out: GeoJSON.Feature[] = [];
  for (let i = step; i < nFloors; i += step) {
    const z = baseElev + i * FLOOR_H;
    if (z > topElev - SLAB_REVEAL_H) break;
    out.push(poly(recessRing, { base: z - SLAB_REVEAL_H, top: z, kind: 0 }));
    if (proud) out.push(poly(proudRing, { base: z, top: z + SLAB_PROUD_H, kind: 1 }));
  }
  return out;
}

const clampI = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, Math.round(x)));

/**
 * Lay out `n` building footprints in a grid inside `container`, aligned to the lot's
 * principal axis, each sized to ~`totalAreaM2/n` (capped to its cell minus a gap).
 */
function gridFootprints(
  container: Ring,
  axisDir: [number, number],
  n: number,
  totalAreaM2: number,
  aspect: number,
  frame: ReturnType<typeof meterFrame>,
): Ring[] {
  const ang = Math.atan2(axisDir[1], axisDir[0]);
  const ca = Math.cos(-ang);
  const sa = Math.sin(-ang);
  const cb = Math.cos(ang);
  const sb = Math.sin(ang);
  const rot = (p: [number, number]): [number, number] => [p[0] * ca - p[1] * sa, p[0] * sa + p[1] * ca];
  const unrot = (p: [number, number]): [number, number] => [p[0] * cb - p[1] * sb, p[0] * sb + p[1] * cb];
  const closed = container.length > 1 && container[0][0] === container[container.length - 1][0] && container[0][1] === container[container.length - 1][1];
  const open = closed ? container.slice(0, -1) : container;
  const P = open.map((p) => rot(toMeters(p, frame)));
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const [x, y] of P) {
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }
  const W = Math.max(maxX - minX, 1);
  const D = Math.max(maxY - minY, 1);
  const cols = clampI(Math.sqrt(n * (W / D)), 1, n);
  const rows = Math.ceil(n / cols);
  const gap = 7;
  const cellW = W / cols;
  const cellD = D / rows;
  const perArea = totalAreaM2 / n;
  const out: Ring[] = [];
  let placed = 0;
  for (let r = 0; r < rows && placed < n; r++) {
    for (let col = 0; col < cols && placed < n; col++) {
      const cx = minX + (col + 0.5) * cellW;
      const cy = minY + (r + 0.5) * cellD;
      let hw = Math.max(2, Math.sqrt(perArea / aspect) / 2); // half-width (across axis)
      let hl = Math.max(2, hw * aspect); // half-length (along axis)
      hl = Math.min(hl, Math.max(2, (cellW - gap) / 2));
      hw = Math.min(hw, Math.max(2, (cellD - gap) / 2));
      const cornersAxis: [number, number][] = [
        [cx - hl, cy - hw],
        [cx + hl, cy - hw],
        [cx + hl, cy + hw],
        [cx - hl, cy + hw],
      ];
      const ring: Ring = cornersAxis.map((p) => toLngLat(unrot(p), frame));
      ring.push(ring[0]);
      out.push(ring);
      placed++;
    }
  }
  return out;
}

/**
 * Height- & footprint-responsive massing. Footprints are TRUE metric offsets of
 * the real parcel (קו בניין setback + coverage-sized podium + principal-axis
 * tower), so the building sits believably inside the lot with a real setback gap
 * and the tower runs along the lot's long axis.
 */
function buildMassing(
  ring: Ring,
  floors: number,
  coverageRatio = COVERAGE,
  units = 0,
  orientRad?: number,
): Massing {
  const c = centroid(ring);
  const frame = meterFrame(c[0], c[1]);
  const plotArea = absAreaM2(ring, frame);
  const offset = insetMeters(ring, SETBACK_M, 0.25, frame);
  const offsetArea = absAreaM2(offset, frame);
  // A square synthetic lot has a degenerate principal axis (4-fold symmetry), so
  // PCA can't recover its rotation. When the caller knows the target orientation
  // (the local street-grid angle), use it directly so the blocks line up with the
  // surrounding streets; otherwise fall back to the parcel's own long axis.
  const axis =
    orientRad != null
      ? { dir: [Math.cos(orientRad), Math.sin(orientRad)] as [number, number], angleRad: orientRad, elongation: 1 }
      : principalAxis(ring, frame);

  // unit-driven scheme; fall back to a floor-derived single building when units unknown
  const scheme =
    units > 0
      ? pickScheme(units)
      : {
          n: 1,
          floorsPer: Math.max(2, Math.round(floors)),
          tier: (floors > 22 ? "towerHi" : floors > 8 ? "tower" : "block") as Tier,
          podium: floors > 8,
        };

  const podiumFloors = scheme.podium ? 4 : 0;
  const podiumH = podiumFloors * FLOOR_H;

  // total building footprint = coverage × plot (תכסית), capped by the offset area
  const totalFootprint = Math.min(coverageRatio * plotArea, offsetArea * 0.92);
  // towers cover less ground (they go up); blocks/slabs spread their footprint out
  const layoutArea = scheme.podium ? Math.min(totalFootprint, offsetArea * 0.5) : totalFootprint;
  const container = scheme.podium ? insetMeters(offset, 3, 0.5, frame) : offset;
  const footprints = gridFootprints(container, axis.dir, scheme.n, layoutArea, TIER_ASPECT[scheme.tier], frame);

  // ── shared podium (tower schemes) ──
  const podiumFeatures: GeoJSON.Feature[] = [];
  let footprintRings: Ring[];
  if (scheme.podium && podiumFloors > 0) {
    const lobbyRing = insetMeters(offset, 0.5, 0.6, frame);
    const corniceRing = insetRing(offset, -0.0025);
    podiumFeatures.push(
      poly(lobbyRing, { base: 0, top: 0.4, kind: 20 }),
      poly(offset, { base: 0.4, top: Math.max(podiumH - 0.5, 0.5), kind: 21 }),
      poly(corniceRing, { base: Math.max(podiumH - 0.5, 0.5), top: podiumH + 0.3, kind: 22 }),
    );
    footprintRings = [offset];
  } else {
    podiumFeatures.push(poly(offset, { base: 0, top: 0, kind: 21 })); // flat placeholder keeps the source alive
    footprintRings = footprints;
  }

  // ── per-building shafts + floor reveals + crowns ──
  const shafts: GeoJSON.Feature[] = [];
  const art: GeoJSON.Feature[] = [];
  const crown: GeoJSON.Feature[] = [];
  const bandCap = Math.max(3, Math.floor(MAX_FLOOR_BANDS / Math.max(1, footprints.length)));
  const kind = TIER_KIND[scheme.tier];
  for (const fp of footprints) {
    const top = podiumH + scheme.floorsPer * FLOOR_H;
    shafts.push(poly(fp, { base: podiumH, top, kind }));
    const recess = insetMeters(fp, 0.15, 0.5, frame);
    const proud = insetRing(fp, -0.0015);
    art.push(...floorReveals(fp, recess, proud, podiumH, top, scheme.tier !== "cottage", bandCap));
    const parapet = insetRing(fp, 0.012);
    const roofPlate = insetMeters(fp, 0.9, 0.6, frame);
    crown.push(
      poly(roofPlate, { base: top, top: top + 0.15, kind: 10 }),
      poly(parapet, { base: top, top: top + 0.9, kind: 11 }),
    );
    if (scheme.tier === "tower" || scheme.tier === "towerHi") {
      const sm = absAreaM2(fp, frame);
      const phInset = Math.max(1.5, Math.sqrt(sm) * 0.2);
      crown.push(poly(insetMeters(fp, phInset, 0.5, frame), { base: top + 0.15, top: top + 2.6, kind: 12 }));
    }
  }

  return {
    parcel: poly(ring),
    podium: { type: "FeatureCollection", features: podiumFeatures },
    shafts: { type: "FeatureCollection", features: shafts },
    frame: EMPTY_FC,
    articulation: { type: "FeatureCollection", features: art },
    crown: { type: "FeatureCollection", features: crown },
    core: EMPTY_FC,
    footprintRings,
    scheme: { n: footprints.length, floorsPer: scheme.floorsPer, tier: scheme.tier },
  };
}

/** Color-by-`kind` match expression builder for the multi-material layers. */
function matchColor(pal: ReturnType<typeof palette>, group: "podium" | "art" | "crown" | "shaft") {
  if (group === "shaft") {
    return [
      "match",
      ["get", "kind"],
      40,
      pal.tower,
      41,
      pal.towerHi,
      42,
      pal.slabBody,
      43,
      pal.podium,
      44,
      pal.cottageBody,
      pal.tower,
    ];
  }
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
function frameToParcel(
  map: maplibregl.Map,
  ring: Ring,
  animate: boolean,
  duration: number,
  heightM = 0,
  orientRad?: number,
) {
  const [w, s, e, n] = ringBounds(ring);
  // expand the fit-box by ~the building height so tall towers get headroom and the
  // camera zooms out enough to see the whole cluster (not just the bases).
  const padLat = (heightM * 0.85) / 111320;
  const padLng = padLat * 0.4;
  const bounds = new gl.LngLatBounds([w - padLng, s - padLat], [e + padLng, n + padLat * 0.5]);
  // three-quarter view of the long facade: long-axis bearing + 30°. When an explicit
  // orientation is supplied (square lot → PCA degenerate), derive the compass bearing
  // from it; otherwise read the parcel's long axis.
  const longAxisDeg =
    orientRad != null ? ((90 - (orientRad * 180) / Math.PI) % 360 + 360) % 360 : ringOrientationDeg(ring);
  const bearing = (longAxisDeg + 30) % 360;
  map.fitBounds(bounds, {
    padding: { top: 80, bottom: 60, left: 60, right: 60 }, // keep the setback gap visible
    bearing,
    pitch: 56,
    maxZoom: 18,
    duration: animate ? duration : 0,
    essential: true,
    offset: [0, -20], // sit the lot a touch low so the towers have headroom
  } as maplibregl.FitBoundsOptions);
}

/**
 * Smart placement: for an illustrative massing (no real cadastral location), find
 * a nearby spot whose footprint does NOT sit on top of existing buildings, so the
 * study reads as dropped into an open area / within the street block rather than
 * clipping through real buildings. Uses the live map's building features (fast,
 * deterministic) — preferred over a per-render LLM screenshot check for speed and
 * reliability. Returns a possibly-shifted centroid (lng/lat).
 */
function findClearCentroid(map: maplibregl.Map, center: [number, number], stepM: number): [number, number] {
  if (!USE_MAPBOX) return center;
  try {
    const style = (map as unknown as { getStyle?: () => { layers?: { id: string; type?: string; "source-layer"?: string }[] } }).getStyle?.();
    const layers = style?.layers ?? [];
    const buildingLayers = layers
      .filter((l) => l["source-layer"] === "building" && (l.type === "fill-extrusion" || l.type === "fill"))
      .map((l) => l.id);
    buildingLayers.push("context-buildings");
    // only MAJOR roads count as obstacles (minor streets are everywhere)
    const roadLayers = layers
      .filter((l) => l["source-layer"] === "road" && l.type === "line" && /motorway|trunk|primary|secondary/i.test(l.id))
      .map((l) => l.id);
    const present = buildingLayers.filter((id) => map.getLayer(id));
    if (!present.length) return center;

    const dLngM = 1 / (111320 * Math.cos((center[1] * Math.PI) / 180));
    const dLatM = 1 / 111320;
    // score a candidate: 5 footprint samples for buildings (weigh 2×) + 1 road check —
    // kept light (≈6 queries/candidate) so placement stays snappy.
    const offs: [number, number][] = [
      [0, 0],
      [1, 1],
      [-1, 1],
      [1, -1],
      [-1, -1],
    ];
    const score = (c: [number, number]): number => {
      let buildings = 0;
      for (const [i, j] of offs) {
        const px = map.project([c[0] + i * 22 * dLngM, c[1] + j * 22 * dLatM] as maplibregl.LngLatLike);
        if (map.queryRenderedFeatures([px.x, px.y] as maplibregl.PointLike, { layers: present }).length) buildings++;
      }
      let roads = 0;
      if (roadLayers.length) {
        const px = map.project(c as maplibregl.LngLatLike);
        if (map.queryRenderedFeatures([px.x, px.y] as maplibregl.PointLike, { layers: roadLayers }).length) roads = 2;
      }
      return buildings * 2 + roads;
    };

    let best = center;
    let bestScore = score(center);
    if (bestScore === 0) return center; // already clear
    for (let r = 1; r <= 2; r++) {
      for (let a = 0; a < 6; a++) {
        const ang = (a / 6) * 2 * Math.PI + (r % 2) * 0.5; // stagger rings
        const cand: [number, number] = [
          center[0] + Math.cos(ang) * stepM * r * dLngM,
          center[1] + Math.sin(ang) * stepM * r * dLatM,
        ];
        const sc = score(cand);
        if (sc < bestScore) {
          bestScore = sc;
          best = cand;
          if (sc === 0) return best;
        }
      }
    }
    return best;
  } catch {
    return center;
  }
}

/**
 * Dominant street-grid bearing around `center`, in radians (meter-space, CCW from
 * east), or null if no roads are nearby. Real lots line up with their street block,
 * so we read the live road network: bin every nearby road segment's direction into
 * a length-weighted circular mean folded to 90° (a rectangular grid has two
 * perpendicular families), then pick whichever of the two families carries more
 * road length as the long-axis direction. The synthetic lot is rotated to match,
 * so the massing sits ALONG the streets instead of cutting across them.
 */
function dominantGridAngle(map: maplibregl.Map, center: [number, number]): number | null {
  if (!USE_MAPBOX) return null;
  try {
    const style = (map as unknown as { getStyle?: () => { layers?: { id: string; type?: string; "source-layer"?: string }[] } }).getStyle?.();
    const layers = style?.layers ?? [];
    const roadLayers = layers
      .filter((l) => l["source-layer"] === "road" && l.type === "line")
      .map((l) => l.id)
      .filter((id) => map.getLayer(id));
    if (!roadLayers.length) return null;

    const mPerLng = 111320 * Math.cos((center[1] * Math.PI) / 180);
    const R = 200; // sample a ~200 m radius around the lot
    const dLngM = 1 / mPerLng;
    const dLatM = 1 / 111320;
    const p1 = map.project([center[0] - R * dLngM, center[1] - R * dLatM] as maplibregl.LngLatLike);
    const p2 = map.project([center[0] + R * dLngM, center[1] + R * dLatM] as maplibregl.LngLatLike);
    const box: [maplibregl.PointLike, maplibregl.PointLike] = [
      [Math.min(p1.x, p2.x), Math.min(p1.y, p2.y)],
      [Math.max(p1.x, p2.x), Math.max(p1.y, p2.y)],
    ];
    const feats = map.queryRenderedFeatures(box, { layers: roadLayers });
    if (!feats.length) return null;

    // length-weighted 4θ vector sum → robust grid alignment (mod 90°)
    let sx = 0;
    let sy = 0;
    const segs: { ang: number; len: number }[] = [];
    const acc = (coords: number[][]) => {
      for (let i = 0; i < coords.length - 1; i++) {
        const dx = (coords[i + 1][0] - coords[i][0]) * mPerLng;
        const dy = (coords[i + 1][1] - coords[i][1]) * 111320;
        const len = Math.hypot(dx, dy);
        if (len < 4) continue; // skip tiny zig-zag vertices
        const ang = Math.atan2(dy, dx);
        sx += Math.cos(4 * ang) * len;
        sy += Math.sin(4 * ang) * len;
        segs.push({ ang, len });
      }
    };
    for (const f of feats) {
      const g = f.geometry as GeoJSON.Geometry | undefined;
      if (!g) continue;
      if (g.type === "LineString") acc(g.coordinates as number[][]);
      else if (g.type === "MultiLineString") for (const c of g.coordinates as number[][][]) acc(c);
    }
    if (!segs.length || (sx === 0 && sy === 0)) return null;
    const grid = Math.atan2(sy, sx) / 4; // in [-π/4, π/4] — one grid family

    // choose the long-axis family: compare total road length aligned with `grid`
    // vs the perpendicular `grid + 90°` (each road direction folds mod 180°).
    const foldHalfPi = (a: number) => {
      let d = ((a % Math.PI) + Math.PI) % Math.PI; // [0, π)
      if (d > Math.PI / 2) d = Math.PI - d; // [0, π/2]
      return d;
    };
    let lenAlong = 0;
    let lenAcross = 0;
    for (const { ang, len } of segs) {
      if (foldHalfPi(ang - grid) < Math.PI / 4) lenAlong += len;
      else lenAcross += len;
    }
    return lenAlong >= lenAcross ? grid : grid + Math.PI / 2;
  } catch {
    return null;
  }
}

export function ProjectMap({
  lat,
  lng,
  areaSqm,
  parcelRing,
  gush,
  helka,
  floors = 12,
  units = 0,
  coverageRatio = COVERAGE,
  illustrative = false,
  comparables = [],
  className,
  interactive = true,
}: ProjectMapProps) {
  const containerRef = React.useRef<HTMLDivElement>(null);
  const mapRef = React.useRef<maplibregl.Map | null>(null);
  const ringRef = React.useRef<Ring | null>(null);
  const orientRef = React.useRef<number | undefined>(undefined); // street-grid angle of the synthetic lot
  const hiddenRef = React.useRef<Set<string | number>>(new Set()); // demolished context-building ids
  const { resolvedTheme } = useTheme();
  const dark = resolvedTheme !== "light";
  const [parcelLive, setParcelLive] = React.useState(false);
  const [scrollHint, setScrollHint] = React.useState(false);
  const captionScheme = React.useMemo(() => (units > 0 ? pickScheme(units) : null), [units]);

  const initialRing = React.useMemo<Ring>(
    () => (parcelRing && parcelRing.length >= 4 ? parcelRing : synthRing(lat, lng, areaSqm)),
    [parcelRing, lat, lng, areaSqm],
  );

  const applyParcel = React.useCallback(
    (map: maplibregl.Map, ring: Ring, orientRad?: number) => {
      ringRef.current = ring;
      if (orientRad != null) orientRef.current = orientRad;
      const m = buildMassing(ring, floors, coverageRatio, units, orientRef.current);
      const pal = palette(dark);
      const set = (id: string, data: GeoJSON.GeoJSON) => {
        const src = map.getSource(id) as maplibregl.GeoJSONSource | undefined;
        if (src) src.setData(data);
      };

      // ground-contact shadow: a wide soft halo + a tighter dark core under EACH
      // building footprint, so every block reads as grounded in the lot on both paths.
      const shadowData: GeoJSON.FeatureCollection = {
        type: "FeatureCollection",
        features: m.footprintRings.flatMap((fr) => [
          poly(insetRing(fr, -0.18), { soft: 1 }),
          poly(insetRing(fr, -0.04), { soft: 0 }),
        ]),
      };

      // illustrative volume study: a clean neutral plot under the massing that masks
      // the basemap streets, so the building reads as a study rather than dropped on a road.
      const groundPad = insetRing(ring, -0.35); // a clean cleared lot — parcel + a small margin

      if (!map.getSource("parcel")) {
        if (illustrative) {
          map.addSource("ground-pad", { type: "geojson", data: poly(groundPad) });
          map.addLayer({
            id: "ground-pad",
            type: "fill",
            source: "ground-pad",
            paint: { "fill-color": pal.groundPad, "fill-opacity": dark ? 0.9 : 0.94 },
          });
        }
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
        map.addSource("tower", { type: "geojson", data: m.shafts });
        map.addLayer({
          id: "tower-3d",
          type: "fill-extrusion",
          source: "tower",
          layout: towerLayout as unknown as maplibregl.FillExtrusionLayerSpecification["layout"],
          paint: {
            "fill-extrusion-color": matchColor(pal, "shaft") as maplibregl.ExpressionSpecification,
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
        if (illustrative) set("ground-pad", poly(groundPad));
        set("parcel", m.parcel);
        set("ground-shadow", shadowData);
        set("podium", m.podium);
        set("frame", m.frame);
        set("tower", m.shafts);
        set("articulation", m.articulation);
        set("crown", m.crown);
        set("core", m.core);
        // material is data-driven (kind → match) so no per-instance re-tint is needed
      }
    },
    [floors, units, coverageRatio, dark, illustrative],
  );

  // "Demolish" the existing context buildings that sit on the project's lot (feature-state),
  // so the synthetic massing reads as a cleared site instead of clipping real buildings.
  const clearPlot = React.useCallback((map: maplibregl.Map) => {
    if (!USE_MAPBOX || !map.getLayer("context-buildings") || !ringRef.current) return;
    try {
      for (const id of hiddenRef.current) {
        map.setFeatureState({ source: "composite", sourceLayer: "building", id }, { hide: false });
      }
      hiddenRef.current.clear();
      const ring = ringRef.current;
      let w = Infinity, s = Infinity, e = -Infinity, n = -Infinity;
      for (const [lng, lat] of ring) {
        if (lng < w) w = lng;
        if (lng > e) e = lng;
        if (lat < s) s = lat;
        if (lat > n) n = lat;
      }
      // sample a grid over the lot; demolish every building rendered under a sample point
      const N = 5;
      for (let i = 0; i <= N; i++) {
        for (let j = 0; j <= N; j++) {
          const p = map.project([w + ((e - w) * i) / N, s + ((n - s) * j) / N] as maplibregl.LngLatLike);
          const feats = map.queryRenderedFeatures([p.x, p.y] as maplibregl.PointLike, { layers: ["context-buildings"] });
          for (const f of feats) {
            if (f.id == null) continue;
            map.setFeatureState({ source: "composite", sourceLayer: "building", id: f.id }, { hide: true });
            hiddenRef.current.add(f.id);
          }
        }
      }
    } catch {
      /* no-op */
    }
  }, []);

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
      maxPitch: 85, // allow a near-ground-level look
      dragRotate: true, // 360° rotate via right-drag / ctrl-drag
      touchZoomRotate: true, // two-finger rotate + zoom on touch
      pitchWithRotate: true,
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
      // synthetic lots start at a base off-axis angle; once tiles load we re-align
      // them to the real street grid below. Real parcels (gush/helka) keep PCA.
      const synthetic = !(gush && helka) && !(parcelRing && parcelRing.length >= 4);
      applyParcel(map, initialRing, synthetic ? 0.2 : undefined);

      for (const c of comparables) {
        if (c.lat == null || c.lng == null) continue;
        const el = document.createElement("div");
        el.style.cssText =
          "background:#f59e0b;color:#1c1208;font-size:10px;font-weight:700;padding:2px 6px;border-radius:999px;box-shadow:0 1px 4px rgba(0,0,0,.4);white-space:nowrap;transform:translateY(-4px)";
        el.textContent = c.pricePerSqm ? `${Math.round(c.pricePerSqm / 1000)}K/מ״ר` : "עסקה";
        new gl.Marker({ element: el }).setLngLat([c.lng, c.lat]).addTo(map);
      }

      // building height drives how far the camera pulls back (tall clusters need headroom)
      const frameH = (captionScheme?.floorsPer ?? Math.round(floors)) * FLOOR_H;
      // cinematic reveal: fly into a padded, pitched, lot-oriented frame (2.2s)
      frameToParcel(map, ringRef.current ?? initialRing, true, 2200, frameH);

      // Once tiles are ready: (1) ROTATE the synthetic lot to the local street grid,
      // (2) TRANSLATE it off existing buildings, then (3) demolish the buildings that
      // sit on the final lot. Rotate-then-shift makes the cluster sit ALONG the block.
      map.once("idle", () => {
        if (!mapRef.current || !ringRef.current) return;
        if (synthetic && USE_MAPBOX) {
          const c = centroid(ringRef.current);
          // (1) align to the street grid (fall back to the base angle if no roads)
          const grid = dominantGridAngle(map, c);
          const theta = grid ?? 0.2;
          let ring = synthRing(c[1], c[0], areaSqm, theta);
          // (2) shift to a clear spot (avoid major roads / existing buildings)
          const clear = findClearCentroid(map, c, 40);
          const dLng = clear[0] - c[0];
          const dLat = clear[1] - c[1];
          if (Math.abs(dLng) > 1e-7 || Math.abs(dLat) > 1e-7) {
            ring = ring.map(([x, y]) => [x + dLng, y + dLat]) as Ring;
          }
          applyParcel(map, ring, theta);
          frameToParcel(map, ring, true, 700, frameH, theta);
        }
        // demolish on the next idle (after any shift / camera move settles)
        map.once("idle", () => clearPlot(map));
      });

      if (gush && helka) {
        fetch(`/api/parcel?gush=${encodeURIComponent(gush)}&helka=${encodeURIComponent(helka)}`)
          .then((r) => r.json())
          .then((d) => {
            const ring = d?.parcel?.ring as Ring | undefined;
            if (ring && ring.length >= 3 && mapRef.current) {
              orientRef.current = undefined; // real cadastral lot → orient by its own PCA
              applyParcel(mapRef.current, ring);
              frameToParcel(mapRef.current, ring, true, 1200, frameH); // re-frame to the real parcel
              setParcelLive(true);
              mapRef.current.once("idle", () => clearPlot(mapRef.current!));
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

  // live-update massing when the floor count or unit scheme changes — keep the live ring
  React.useEffect(() => {
    const map = mapRef.current;
    if (map && map.isStyleLoaded() && map.getSource("tower") && ringRef.current) {
      applyParcel(map, ringRef.current);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [floors, units]);

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
        {captionScheme && captionScheme.n > 1
          ? `${captionScheme.n} בניינים · ${captionScheme.floorsPer} קומות`
          : `${Math.round(captionScheme?.floorsPer ?? floors)} קומות · ~${Math.round((captionScheme?.floorsPer ?? floors) * FLOOR_H)} מ׳`}
      </div>
      <div
        className={`pointer-events-none absolute inset-0 z-20 grid place-items-center transition-opacity duration-200 ${scrollHint ? "opacity-100" : "opacity-0"}`}
      >
        <div className="rounded-full bg-black/70 px-4 py-2 text-sm font-medium text-white backdrop-blur">
החזיקו Ctrl וגללו לזום · גררו לסיבוב 360° והטיה
        </div>
      </div>
    </div>
  );
}

export default ProjectMap;
