# רדיוס (Radius) — מערכת חיתום והערכת מכרזים ליזמי נדל״ן

מערכת SaaS בעברית (RTL) להערכת כדאיות מכרזי קרקע ועסקאות נדל״ן בישראל. בלִבּה **מנוע חיתום (Residual Land Value)** עם **סימולציית מונטה-קרלו**, **גילוי עלויות נסתרות**, **הדמיית מסה תלת-ממדית על מפה אמיתית**, ו**אנליסט AI**.

> נבנתה לענות על הכאב העמוק ביותר של יזמים: *איפה הכסף נשרף* — קללת המנצח, היטל השבחה, אגרות, פערי זכויות, וסיכון לו״ז/מימון.

## מה המערכת פותרת

| כאב | הפתרון במערכת |
|-----|----------------|
| **קללת המנצח** — תשלום-יתר במכרז | מד הצעה עם "מחיר רצפה", "הצעה מומלצת" ו"סף קללת מנצח" |
| **עלויות נסתרות** | מחשבון אוטומטי: היטל השבחה, אגרות והיטלי פיתוח לפי עיר, פיתוח רמ״י, מס רכישה, מימון |
| **פער זכויות** | מנוע זכויות: מהזכויות התכנוניות לשטח מכיר בפועל |
| **אי-ודאות** | מונטה-קרלו (אלפי תרחישים) → התפלגות רווח והסתברות הפסד |
| **החלטה** | הכרעת Go/No-Go + ניתוח AI + דוח להדפסה |

## הרצה מהירה

דרושות שלוש פקודות (שלושה טרמינלים), או DB משלכם דרך `MONGODB_URI`.

```bash
npm install
npm run db      # טרמינל 1 — MongoDB מקומי מתמיד (מוריד בינארי בפעם הראשונה)
npm run seed    # פעם אחת — מזריע ערים, עסקאות, מכרזים ו-3 פרויקטים
npm run dev     # טרמינל 2 — http://localhost:3000
```

התחברות דמו: **demo@radius.co.il / radius2026** (ממולא מראש).

### משתני סביבה (`.env.local`)
```
ANTHROPIC_API_KEY=...        # לפיצ'רי ה-AI
MONGODB_URI=mongodb://127.0.0.1:27017/michrazim
AUTH_SECRET=...
NEXT_PUBLIC_MAPBOX_TOKEN=    # ריק = MapLibre חינם; הדביקו token לשדרוג ל-Mapbox
```

## ה-Stack
- **Next.js 16 (App Router) + React 19 + TypeScript**
- **MongoDB + Mongoose** (DB מקומי מתמיד דרך `mongodb-memory-server`)
- **Tailwind v4 + shadcn-style UI + Framer Motion** — RTL, dark+light
- **MapLibre GL / Mapbox** + בסיס CARTO — מפה תלת-ממדית והדמיית מסה
- **Recharts** — התפלגות, tornado, תזרים, מפל עלויות
- **Anthropic SDK** — אנליסט סיכונים, שו״ת, פרסור מכרז, דוח
- **Vitest** (מנוע) + **Playwright** (e2e)

## ארכיטקטורה
```
src/
├─ lib/engine/      מנוע חיתום pure-TS (נבדק) — RLV, מונטה-קרלו, מימון, רגישות
├─ lib/data/        adapters ל-APIs ממשלתיים (data.gov.il, govmap, nadlan) + fallback
├─ lib/ai/          Anthropic — ניתוח, שו״ת, דוח, פרסור מכרז
├─ server/          Mongoose models, queries, server actions, auth (JWT)
├─ app/             דפים (RTL): login, dashboard, projects/[id], wizard, map, report
└─ components/      map (3D), charts, wizard, ai, ui
```

### מקורות נתונים — מה חי ומה seed
- ✅ **מכרזי רמ״י ותכניות** — **חי** מ-data.gov.il: "עלויות פיתוח בבנייה העירונית" (~1,500 פרויקטים, כולל "במכרז") + "מלאי תכנוני למגורים" (~1,100 תכניות). כולל עלויות פיתוח אמיתיות וקישורים ל-land.gov.il. (`src/lib/data/rmi.ts`)
- ✅ **גבולות גוש-חלקה** — **חי** מ-govmap WFS (EPSG:3857 → WGS84), נשלף בצד-לקוח ומשתדרג מ-synth לחלקה אמיתית. (`src/lib/data/govmap.ts`, `/api/parcel`)
- ✅ **אריחי מפה** — CARTO/OSM אמיתיים, ללא token.
- ✅ **AI** — Anthropic API אמיתי (ניתוח, שו״ת, עוזר, פרסור, דוח).
- ⚠️ **עסקאות השוואה** — seed ריאליסטי (nadlan.gov.il חוסם גישה תכנותית; ה-adapter קיים ב-`src/lib/data/nadlan.ts` עם fallback).
- ⚠️ **טבלאות אגרות עירוניות** — מייצגות לפי טווחי חוקי עזר (להחלפה במאגר מעודכן).

> **Mapbox:** המפה רצה על MapLibre/CARTO חינם. טוקן Mapbox מסוג `sk.` (סודי) **אינו** משמש בדפדפן מטעמי אבטחה — לשדרוג ל-Mapbox ספקו טוקן ציבורי (`pk.`) ב-`NEXT_PUBLIC_MAPBOX_TOKEN`.

## בדיקות
```bash
npm run test       # Vitest — 12 בדיקות מנוע (RLV, מונטה-קרלו, מימון, זכויות)
npm run test:e2e   # Playwright — smoke מקצה-לקצה (דורש db+dev רצים)
npm run build      # build פרודקשן מלא
```

## מנוע החישוב (הלב)
`שווי קרקע שיורי = הכנסות − בנייה − עלויות רכות − (אגרות + היטל השבחה + פיתוח) − מימון − שיווק − מס רכישה − רווח יזמי נדרש`

כל קלט הוא **התפלגות**; מונטה-קרלו מייצר התפלגות רווח, הסתברות הפסד, ומחיר הצעה ממושמע. ראו `src/lib/engine/`.

## פריסה לפרודקשן — Docker + GitHub Actions + Caddy
המערכת ארוזה ב-Docker (Next.js `standalone`) ונפרסת ל-VPS אוטומטית בכל push ל-`master`, מאחורי Caddy שמנפיק ומחדש תעודת HTTPS (Let's Encrypt) אוטומטית.

**קבצים רלוונטיים:** `Dockerfile`, `docker-compose.yml`, `Caddyfile`, `.env.example`, `.github/workflows/deploy.yml`.

### הכנת ה-VPS (חד-פעמי)
1. התקינו Docker + Docker Compose plugin על ה-VPS.
2. צרו משתמש פריסה עם מפתח SSH (למשל `deploy`), והוסיפו את המפתח הציבורי ל-`~/.ssh/authorized_keys` שלו.
3. הצביעו רשומת DNS (A/AAAA) של הדומיין שלכם ל-IP של ה-VPS.
4. צרו תיקיית פריסה, למשל `/opt/michrazim`, והעלו לתוכה `.env.example` בשם `.env`, ומלאו ערכים אמיתיים (`ANTHROPIC_API_KEY`, `AUTH_SECRET`, `DOMAIN`, `ACME_EMAIL` וכו'). קובץ ה-`.env` הזה **נשאר על השרת בלבד** ואינו נכנס ל-git.
5. פתחו בפיירוול את הפורטים `22` (SSH), `80` ו-`443` (Caddy).

### סודות ב-GitHub (Settings → Secrets and variables → Actions)
| Secret | תיאור |
|---|---|
| `VPS_HOST` | IP או hostname של ה-VPS |
| `VPS_USER` | משתמש ה-SSH (למשל `deploy`) |
| `VPS_SSH_KEY` | המפתח הפרטי (תואם למפתח שהוספתם ל-`authorized_keys`) |
| `VPS_PORT` | פורט SSH (אופציונלי, ברירת מחדל `22`) |
| `VPS_DEPLOY_PATH` | הנתיב על ה-VPS, למשל `/opt/michrazim` |

אופציונלי — Repository variable `NEXT_PUBLIC_MAPBOX_TOKEN` (טוקן `pk.` ציבורי) אם רוצים Mapbox מוטמע ב-build.

### מה קורה בכל push
1. `.github/workflows/deploy.yml` בונה את ה-Docker image ודוחף אותו ל-GitHub Container Registry (`ghcr.io`).
2. מעלה את `docker-compose.yml` ו-`Caddyfile` המעודכנים ל-VPS.
3. מתחבר ב-SSH, מריץ `docker compose pull && docker compose up -d`. Caddy מנפיק תעודת HTTPS אוטומטית בעלייה הראשונה (ומחדש אותה לבד לפני שהיא פגה).

### פריסה ראשונה / ידנית
```bash
# בתיקיית הפריסה על ה-VPS, לאחר יצירת .env:
docker compose pull
docker compose up -d
```

### הזרעת נתונים (seed) מול פרודקשן
ה-image הריצתי לא כולל את `tsx`/devDependencies. הריצו את הסיד מהמחשב שלכם דרך טאנל SSH למונגו על ה-VPS:
```bash
ssh -L 27017:localhost:27017 -N deploy@VPS_HOST   # בטרמינל נפרד
MONGODB_URI=mongodb://127.0.0.1:27017/michrazim npm run seed
```

## הערת אבטחה
מפתח ה-Anthropic נשמר ב-`.env.local` (ב-`.gitignore`) בלבד. החליפו אותו לפני פריסה ציבורית.

---
*כלי תומך-החלטה — אינו מהווה ייעוץ שמאי, משפטי או פיננסי.*
