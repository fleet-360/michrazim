"use client";

import * as React from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import "mapbox-gl/dist/mapbox-gl.css";
import { useTheme } from "next-themes";
import { gl, USE_MAPBOX, mapboxStyle } from "./gl";

export interface MapPoint {
  lat: number;
  lng: number;
  label?: string;
  sub?: string;
  color?: string;
  href?: string;
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
        ],
        tileSize: 256,
        attribution: "© CARTO © OpenStreetMap",
      },
    },
    layers: [{ id: "carto", type: "raster", source: "carto" }],
  };
}

/**
 * Spread co-located markers (many tenders share a city centroid) in a phyllotaxis
 * spiral so they don't stack on one point. Buckets by ~110 m, fans out duplicates.
 */
function fanOut(points: MapPoint[]): MapPoint[] {
  const groups = new Map<string, MapPoint[]>();
  for (const p of points) {
    if (p.lat == null || p.lng == null) continue;
    const key = `${p.lat.toFixed(3)},${p.lng.toFixed(3)}`;
    const g = groups.get(key);
    if (g) g.push(p);
    else groups.set(key, [p]);
  }
  const out: MapPoint[] = [];
  const R = 0.0013; // ~140 m base spiral radius
  for (const grp of groups.values()) {
    if (grp.length === 1) {
      out.push(grp[0]);
      continue;
    }
    const cosLat = Math.cos((grp[0].lat * Math.PI) / 180) || 1;
    grp.forEach((p, i) => {
      if (i === 0) return out.push(p);
      const ang = i * 2.399963229; // golden angle
      const rad = R * Math.sqrt(i);
      out.push({ ...p, lat: p.lat + rad * Math.cos(ang), lng: p.lng + (rad * Math.sin(ang)) / cosLat });
    });
  }
  return out;
}

export function MarkersMap({ points, className, showLabels = true }: { points: MapPoint[]; className?: string; showLabels?: boolean }) {
  const ref = React.useRef<HTMLDivElement>(null);
  const mapRef = React.useRef<maplibregl.Map | null>(null);
  const { resolvedTheme } = useTheme();
  const dark = resolvedTheme !== "light";
  const [scrollHint, setScrollHint] = React.useState(false);
  const [show3d, setShow3d] = React.useState(USE_MAPBOX);

  React.useEffect(() => {
    if (!ref.current || mapRef.current) return;
    const style: string | maplibregl.StyleSpecification = USE_MAPBOX ? mapboxStyle(dark) : rasterStyle(dark);

    const map = new gl.Map({
      container: ref.current,
      style,
      center: [34.95, 31.6],
      zoom: 6.7,
      pitch: USE_MAPBOX ? 45 : 0, // 3D perspective — buildings reveal as you zoom into a city
      attributionControl: { compact: true },
    });
    mapRef.current = map;
    map.addControl(new gl.NavigationControl({ visualizePitch: true }), "top-left");

    map.scrollZoom.disable();
    const container = ref.current;
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

    // theme-aware popup palette (fixes the white-on-white tooltip)
    const pop = dark
      ? { bg: "#1b2230", fg: "#e9eef7", sub: "#9fb0c8", border: "#2c3650", accent: "#8ab4ff" }
      : { bg: "#ffffff", fg: "#0b1220", sub: "#5b6677", border: "#e3e8f0", accent: "#2563eb" };

    map.on("load", () => {
      // ── Mapbox 3D environment: extruded buildings + atmosphere (gated; degrades
      //    cleanly to the flat CARTO raster fallback). Buildings reveal on zoom-in.
      if (USE_MAPBOX) {
        const mb = map as unknown as {
          setFog?: (f: unknown) => void;
          getLayer?: (id: string) => unknown;
          getStyle?: () => { layers?: { id: string; type?: string; layout?: Record<string, unknown> }[] };
        };
        try {
          // insert below the first symbol (label) layer so labels stay on top
          const layers = mb.getStyle?.().layers ?? [];
          const firstSymbol = layers.find((l) => l.type === "symbol")?.id;
          if (!mb.getLayer?.("3d-buildings")) {
            map.addLayer(
              {
                id: "3d-buildings",
                source: "composite",
                "source-layer": "building",
                filter: ["==", "extrude", "true"],
                type: "fill-extrusion",
                minzoom: 13,
                paint: {
                  "fill-extrusion-color": dark ? "#2b3548" : "#dbe2ee",
                  "fill-extrusion-height": ["interpolate", ["linear"], ["zoom"], 13, 0, 15.5, ["get", "height"]],
                  "fill-extrusion-base": ["get", "min_height"],
                  "fill-extrusion-opacity": 0.88,
                  "fill-extrusion-vertical-gradient": true,
                } as unknown as maplibregl.FillExtrusionLayerSpecification["paint"],
              } as maplibregl.LayerSpecification,
              firstSymbol,
            );
          }
          if (!mb.getLayer?.("sky")) {
            map.addLayer({
              id: "sky",
              type: "sky",
              paint: { "sky-type": "atmosphere", "sky-atmosphere-sun-intensity": 6 },
            } as unknown as maplibregl.LayerSpecification);
          }
          mb.setFog?.(
            dark
              ? { range: [2, 14], color: "#0d1018", "high-color": "#1b2740", "horizon-blend": 0.06, "star-intensity": 0.15 }
              : { range: [2, 14], color: "#eef2f8", "high-color": "#cfe0f5", "horizon-blend": 0.06, "star-intensity": 0 },
          );
        } catch {
          /* style without composite/building — skip silently */
        }
      }

      const bounds = new gl.LngLatBounds();
      let valid = 0;
      let firstValid: [number, number] | null = null;
      for (const p of fanOut(points)) {
        if (p.lat == null || p.lng == null) continue;
        if (!firstValid) firstValid = [p.lng, p.lat];
        valid++;
        const el = document.createElement("div");
        el.style.cssText = `cursor:${p.href ? "pointer" : "default"};display:flex;flex-direction:column;align-items:center;`;
        el.innerHTML = `<div style="width:14px;height:14px;border-radius:50%;background:${p.color || "#6366f1"};border:2px solid #fff;box-shadow:0 1px 5px rgba(0,0,0,.5)"></div>`;
        if (p.label && showLabels) {
          const lbl = document.createElement("div");
          lbl.textContent = p.label;
          lbl.style.cssText =
            "margin-top:2px;font-size:10px;font-weight:700;color:#fff;background:rgba(0,0,0,.55);padding:1px 5px;border-radius:6px;white-space:nowrap";
          el.appendChild(lbl);
        }
        if (p.href) el.onclick = () => (window.location.href = p.href!);

        const marker = new gl.Marker({ element: el }).setLngLat([p.lng, p.lat]);
        if (p.label || p.sub) {
          const popup = new gl.Popup({ offset: 16, closeButton: false, className: "radius-popup" })
            .setLngLat([p.lng, p.lat])
            .setHTML(
              `<div style="font-family:inherit;background:${pop.bg};color:${pop.fg};padding:8px 11px;border-radius:9px;` +
                `box-shadow:0 6px 18px rgba(0,0,0,.32);min-width:150px;max-width:240px;border:1px solid ${pop.border}">` +
                `<div style="font-weight:700;font-size:12.5px;line-height:1.3">${p.label ?? ""}</div>` +
                (p.sub ? `<div style="font-size:11px;color:${pop.sub};margin-top:3px">${p.sub}</div>` : "") +
                (p.href ? `<div style="font-size:11px;color:${pop.accent};margin-top:5px;font-weight:600">לחצו לפרטים ←</div>` : "") +
                `</div>`,
            );
          el.addEventListener("mouseenter", () => popup.addTo(map));
          el.addEventListener("mouseleave", () => popup.remove());
        }
        marker.addTo(map);
        bounds.extend([p.lng, p.lat]);
      }
      if (valid > 1) map.fitBounds(bounds, { padding: 70, maxZoom: 13, duration: 600, pitch: USE_MAPBOX ? 45 : 0 });
      else if (valid === 1 && firstValid) map.easeTo({ center: firstValid, zoom: 13, pitch: USE_MAPBOX ? 45 : 0 });
    });

    return () => {
      container.removeEventListener("wheel", onWheel);
      clearTimeout(hintTimer);
      map.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dark]);

  const toggle3d = () => {
    const map = mapRef.current;
    if (!map || !USE_MAPBOX) return;
    const next = !show3d;
    setShow3d(next);
    try {
      const m = map as unknown as { getLayer?: (id: string) => unknown };
      if (m.getLayer?.("3d-buildings")) {
        map.setLayoutProperty("3d-buildings", "visibility", next ? "visible" : "none");
      }
      map.easeTo({ pitch: next ? 45 : 0, duration: 500 });
    } catch {
      /* no-op */
    }
  };

  return (
    <div className={className} style={{ position: "relative", width: "100%", height: "100%", minHeight: 320 }}>
      <div
        ref={ref}
        style={{ width: "100%", height: "100%", minHeight: 320, borderRadius: "var(--radius-lg)", overflow: "hidden" }}
      />
      {USE_MAPBOX && (
        <button
          onClick={toggle3d}
          className={`absolute right-3 top-3 z-20 rounded-full border px-3 py-1.5 text-xs font-semibold backdrop-blur transition-colors ${
            show3d
              ? "border-primary/40 bg-primary/85 text-primary-foreground"
              : "border-border bg-black/55 text-white"
          }`}
        >
          תלת-ממד {show3d ? "פעיל" : "כבוי"}
        </button>
      )}
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

export default MarkersMap;
