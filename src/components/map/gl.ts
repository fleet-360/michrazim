import maplibregl from "maplibre-gl";
import mapboxgl from "mapbox-gl";

// Use the real Mapbox GL library when a public (pk.) token is provided — it
// natively resolves mapbox:// styles/tiles. Otherwise fall back to MapLibre +
// free CARTO tiles. Both libraries share the API surface we use.
const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;
export const USE_MAPBOX = !!token && token.startsWith("pk.");
export const MAPBOX_TOKEN = token;

if (USE_MAPBOX) {
  (mapboxgl as unknown as { accessToken: string }).accessToken = token!;
}

// Typed as MapLibre for our usage; the Mapbox runtime is API-compatible here.
export const gl: typeof maplibregl = (USE_MAPBOX ? (mapboxgl as unknown) : maplibregl) as typeof maplibregl;

export function mapboxStyle(dark: boolean): string {
  return `mapbox://styles/mapbox/${dark ? "dark-v11" : "light-v11"}`;
}
