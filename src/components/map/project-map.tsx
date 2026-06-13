"use client";

import * as React from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import "mapbox-gl/dist/mapbox-gl.css";
import { useTheme } from "next-themes";
import { gl, USE_MAPBOX, mapboxStyle } from "./gl";
import { centroid, insetRing, synthRing, type Ring } from "./geo";
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
  comparables?: Comparable[];
  className?: string;
  interactive?: boolean;
}

const FLOOR_H = 3.3; // meters per floor

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

interface Massing {
  podium: GeoJSON.Feature | null;
  tower: GeoJSON.Feature;
  towerColor: string;
  bands: GeoJSON.FeatureCollection;
  crown: GeoJSON.Feature;
}

/** Build a height- & form-responsive massing: low block / mid podium+tower / high slender tower. */
function buildMassing(ring: Ring, floors: number): Massing {
  const f = Math.max(2, Math.round(floors));
  const totalH = f * FLOOR_H;

  let podiumFloors = 0;
  let towerInset = 0.12;
  if (f <= 8) {
    // low-rise: full-footprint block
    podiumFloors = 0;
    towerInset = 0.12;
  } else if (f <= 22) {
    // mid-rise: podium + tower
    podiumFloors = 4;
    towerInset = 0.4;
  } else {
    // high-rise: taller podium + slender tower
    podiumFloors = 5;
    towerInset = 0.52;
  }
  const podiumH = podiumFloors * FLOOR_H;

  const towerRing = insetRing(ring, towerInset);
  const podiumRing = insetRing(ring, 0.1);
  const bandRing = insetRing(ring, Math.max(0, towerInset - 0.02));

  // floor bands every ~4 floors (gives a readable sense of scale)
  const bandStep = 4 * FLOOR_H;
  const bands: GeoJSON.Feature[] = [];
  for (let elev = podiumH + bandStep; elev < totalH - 1; elev += bandStep) {
    bands.push(poly(bandRing, { base: elev, top: elev + 0.7 }));
  }

  const towerColor = f > 22 ? "#7c6cff" : f > 8 ? "#6366f1" : "#5b61e6";

  return {
    podium: podiumFloors > 0 ? poly(podiumRing, { base: 0, top: podiumH }) : null,
    tower: poly(towerRing, { base: podiumH, top: totalH }),
    towerColor,
    bands: { type: "FeatureCollection", features: bands },
    crown: poly(insetRing(towerRing, 0.12), { base: totalH, top: totalH + 1.8 }),
  };
}

export function ProjectMap({
  lat,
  lng,
  areaSqm,
  parcelRing,
  gush,
  helka,
  floors = 12,
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
      const m = buildMassing(ring, floors);
      const set = (id: string, data: GeoJSON.GeoJSON) => {
        const src = map.getSource(id) as maplibregl.GeoJSONSource | undefined;
        if (src) src.setData(data);
      };
      const emptyPodium = m.podium ?? poly(insetRing(ring, 0.1), { base: 0, top: 0 });

      if (!map.getSource("parcel")) {
        map.addSource("parcel", { type: "geojson", data: poly(ring) });
        map.addLayer({ id: "parcel-fill", type: "fill", source: "parcel", paint: { "fill-color": "#6366f1", "fill-opacity": 0.1 } });
        map.addLayer({ id: "parcel-line", type: "line", source: "parcel", paint: { "line-color": "#818cf8", "line-width": 2.4, "line-dasharray": [2, 1.2] } });

        map.addSource("podium", { type: "geojson", data: emptyPodium });
        map.addLayer({ id: "podium-3d", type: "fill-extrusion", source: "podium", paint: { "fill-extrusion-color": "#4338ca", "fill-extrusion-base": ["get", "base"], "fill-extrusion-height": ["get", "top"], "fill-extrusion-opacity": 0.92 } });

        map.addSource("tower", { type: "geojson", data: m.tower });
        map.addLayer({ id: "tower-3d", type: "fill-extrusion", source: "tower", paint: { "fill-extrusion-color": m.towerColor, "fill-extrusion-base": ["get", "base"], "fill-extrusion-height": ["get", "top"], "fill-extrusion-opacity": 0.95, "fill-extrusion-vertical-gradient": true } });

        map.addSource("bands", { type: "geojson", data: m.bands });
        map.addLayer({ id: "bands-3d", type: "fill-extrusion", source: "bands", paint: { "fill-extrusion-color": "#1e1b4b", "fill-extrusion-base": ["get", "base"], "fill-extrusion-height": ["get", "top"], "fill-extrusion-opacity": 0.85 } });

        map.addSource("crown", { type: "geojson", data: m.crown });
        map.addLayer({ id: "crown-3d", type: "fill-extrusion", source: "crown", paint: { "fill-extrusion-color": "#f59e0b", "fill-extrusion-base": ["get", "base"], "fill-extrusion-height": ["get", "top"], "fill-extrusion-opacity": 0.95 } });
      } else {
        set("parcel", poly(ring));
        set("podium", emptyPodium);
        set("tower", m.tower);
        set("bands", m.bands);
        set("crown", m.crown);
        map.setPaintProperty("tower-3d", "fill-extrusion-color", m.towerColor);
      }
      map.easeTo({ center: centroid(ring) as [number, number], duration: 700 });
    },
    [floors],
  );

  React.useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const style: string | maplibregl.StyleSpecification = USE_MAPBOX ? mapboxStyle(dark) : rasterStyle(dark);

    const map = new gl.Map({
      container: containerRef.current,
      style,
      center: [lng, lat],
      zoom: 16.5,
      pitch: 40,
      bearing: -24,
      attributionControl: { compact: true },
      interactive,
    });
    mapRef.current = map;
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
      applyParcel(map, initialRing);
      for (const c of comparables) {
        if (c.lat == null || c.lng == null) continue;
        const el = document.createElement("div");
        el.style.cssText =
          "background:#f59e0b;color:#1c1208;font-size:10px;font-weight:700;padding:2px 6px;border-radius:999px;box-shadow:0 1px 4px rgba(0,0,0,.4);white-space:nowrap;transform:translateY(-4px)";
        el.textContent = c.pricePerSqm ? `${Math.round(c.pricePerSqm / 1000)}K/מ״ר` : "עסקה";
        new gl.Marker({ element: el }).setLngLat([c.lng, c.lat]).addTo(map);
      }
      // cinematic reveal: ease up to a fuller perspective once loaded
      map.easeTo({ pitch: 56, bearing: -18, zoom: 16.7, duration: 2200, essential: true });

      if (gush && helka) {
        fetch(`/api/parcel?gush=${encodeURIComponent(gush)}&helka=${encodeURIComponent(helka)}`)
          .then((r) => r.json())
          .then((d) => {
            const ring = d?.parcel?.ring as Ring | undefined;
            if (ring && ring.length >= 3 && mapRef.current) {
              applyParcel(mapRef.current, ring);
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
