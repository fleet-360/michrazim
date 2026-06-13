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

export function MarkersMap({ points, className, showLabels = true }: { points: MapPoint[]; className?: string; showLabels?: boolean }) {
  const ref = React.useRef<HTMLDivElement>(null);
  const mapRef = React.useRef<maplibregl.Map | null>(null);
  const { resolvedTheme } = useTheme();
  const dark = resolvedTheme !== "light";
  const [scrollHint, setScrollHint] = React.useState(false);

  React.useEffect(() => {
    if (!ref.current || mapRef.current) return;
    const style: string | maplibregl.StyleSpecification = USE_MAPBOX ? mapboxStyle(dark) : rasterStyle(dark);

    const map = new gl.Map({
      container: ref.current,
      style,
      center: [34.95, 31.6],
      zoom: 6.7,
      attributionControl: { compact: true },
    });
    mapRef.current = map;
    map.addControl(new gl.NavigationControl({}), "top-left");

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

    map.on("load", () => {
      const bounds = new gl.LngLatBounds();
      let valid = 0;
      let firstValid: [number, number] | null = null;
      for (const p of points) {
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
        const popup = p.sub
          ? new gl.Popup({ offset: 16, closeButton: false }).setHTML(
              `<div style="font-family:sans-serif;font-size:12px"><b>${p.label ?? ""}</b><br/>${p.sub}</div>`,
            )
          : undefined;
        const marker = new gl.Marker({ element: el }).setLngLat([p.lng, p.lat]);
        if (popup) marker.setPopup(popup);
        marker.addTo(map);
        bounds.extend([p.lng, p.lat]);
      }
      if (valid > 1) map.fitBounds(bounds, { padding: 70, maxZoom: 13, duration: 600 });
      else if (valid === 1 && firstValid) map.easeTo({ center: firstValid, zoom: 13 });
    });

    return () => {
      container.removeEventListener("wheel", onWheel);
      clearTimeout(hintTimer);
      map.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dark]);

  return (
    <div className={className} style={{ position: "relative", width: "100%", height: "100%", minHeight: 320 }}>
      <div
        ref={ref}
        style={{ width: "100%", height: "100%", minHeight: 320, borderRadius: "var(--radius-lg)", overflow: "hidden" }}
      />
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
