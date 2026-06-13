import "server-only";
import { ckanHealthcheck } from "@/lib/data/ckan";
import { cbsHealthcheck } from "@/lib/data/cbs";
import { AI_ENABLED } from "@/lib/ai/client";

export interface DataSourceStatus {
  govData: { ok: boolean; datasets: number; example?: string };
  ai: boolean;
  map: boolean;
}

export async function getDataSourceStatus(): Promise<DataSourceStatus> {
  const govData = await ckanHealthcheck().catch(() => ({ ok: false, datasets: 0 }));
  return { govData, ai: AI_ENABLED(), map: true };
}

export type IntegrationState = "live" | "manual" | "representative" | "off";

export interface Integration {
  id: string;
  name: string;
  source: string;
  state: IntegrationState;
  powers: string;
  detail: string;
  url?: string;
}

/** Full, honest inventory of where every piece of data comes from. */
export async function getIntegrations(): Promise<Integration[]> {
  const mapboxPk = (process.env.NEXT_PUBLIC_MAPBOX_TOKEN || "").startsWith("pk.");
  const [ckan, cbs] = await Promise.all([
    ckanHealthcheck().catch(() => ({ ok: false, datasets: 0 })),
    cbsHealthcheck().catch(() => false),
  ]);

  return [
    {
      id: "rmi",
      name: "מכרזי רמ״י ותכניות מגורים",
      source: "data.gov.il (CKAN)",
      state: ckan.ok ? "live" : "off",
      powers: "דף מכרזים, לוח בקרה, מפה ארצית, עלויות פיתוח",
      detail: ckan.ok
        ? "מחובר חי — שני דאטהסטים רשמיים של רמ״י ומשרד הבינוי, מתעדכן אוטומטית."
        : "כרגע לא נגיש.",
      url: "https://data.gov.il",
    },
    {
      id: "parcels",
      name: "גבולות גוש-חלקה (קדסטר)",
      source: "GovMap WFS",
      state: "live",
      powers: "מפת הפרויקט, הדמיית מסה תלת-ממדית",
      detail: "גיאומטריה קדסטרלית אמיתית נשלפת לכל פרויקט (EPSG:3857 → WGS84).",
      url: "https://www.govmap.gov.il",
    },
    {
      id: "deals",
      name: "עסקאות נדל״ן להשוואה",
      source: "nadlan.gov.il (ייבוא ידני)",
      state: "manual",
      powers: "עסקאות שוק, עוגן מחיר מכירה לכל עיר",
      detail:
        "רשות המיסים חוסמת גישה אוטומטית (reCAPTCHA). ייבוא בהדבקה: מעתיקים מהאתר ו-AI מחלץ לעסקאות אמת.",
      url: "https://www.nadlan.gov.il",
    },
    {
      id: "cbs",
      name: "מדד מחירי הדירות",
      source: "הלשכה המרכזית לסטטיסטיקה (CBS)",
      state: cbs ? "live" : "off",
      powers: "איתות מגמת שוק",
      detail: cbs ? "מחובר חי ל-API של למ״ס." : "כרגע לא נגיש.",
      url: "https://www.cbs.gov.il",
    },
    {
      id: "fees",
      name: "אגרות והיטלי פיתוח עירוניים",
      source: "חוקי עזר עירוניים",
      state: "representative",
      powers: "מחשבון העלויות הנסתרות",
      detail:
        "טווחים ריאליים מבוססי חוקי עזר. ניתנים לעריכה ידנית בדף ‘טבלאות אגרות’ (אין API מרכזי).",
      url: "/data/cities",
    },
    {
      id: "ai",
      name: "ניתוח ועוזר AI",
      source: "Anthropic Claude",
      state: AI_ENABLED() ? "live" : "off",
      powers: "אנליסט סיכונים, עוזר חכם, פרסור מכרז, ייבוא עסקאות, דוח",
      detail: AI_ENABLED() ? "מחובר עם מפתח API פעיל." : "חסר מפתח API.",
    },
    {
      id: "map",
      name: "מפות בסיס",
      source: mapboxPk ? "Mapbox" : "MapLibre + CARTO",
      state: "live",
      powers: "כל המפות במערכת",
      detail: mapboxPk
        ? "Mapbox פעיל עם טוקן ציבורי."
        : "MapLibre + CARTO (חינם). הוסיפו טוקן pk. של Mapbox לשדרוג.",
    },
  ];
}
