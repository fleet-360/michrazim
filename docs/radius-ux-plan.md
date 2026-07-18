# רדיוס — תוכנית יישום טכנית (Radius UX)

מסמך זה ממפה את מסמך המסירה ("רדיוס — תוכנית חוויית משתמש חדשה", 18.7.2026) אל הקוד הקיים,
ומגדיר תוכנית יישום מדורגת. נכתב אחרי מיפוי מלא של הניתוב, מודל הנתונים ושכבת ה‑UI.

> **הגוש הראשון לתקיפה: עמוד בית `/home` + ניתוב.** שאר הגושים מתוארים כאן ברמת מסגרת ויפורטו לפני ביצוע.

---

## 0. מצב קיים — מה שהמיפוי חשף (וסותר חלקית את המסמך)

| הנחה במסמך | המצב בפועל בקוד |
|---|---|
| "אחרי התחברות מנתבים ישר ל‑`/dashboard`" | **לא מדויק.** `src/app/page.tsx` מנתב לפי קוקי `omdan_view` דרך `VIEW_HOME[mode]` (`src/lib/view-mode.ts`). דיפולט = `lean` → **`/quick`**. `full` → `/dashboard`, `custom` → `/custom`. בנוסף, התחברות ישירה (`actions.ts`, google callback) מנתבת ל‑`next` או דיפולט `/dashboard`. יש **שני** דיפולטים שונים. |
| "`/dashboard` הוא המסך עם 8 הלשוניות" | **לא.** `/dashboard` = סקירת תיק (StatCards + רשת פרויקטים). 8 הלשוניות הן ב‑`project-workspace.tsx` תחת `/projects/[id]`. |
| "אין אונבורדינג, אין דגל" | קיים שדה `onboarded: Boolean` ב‑`UserSchema` — אבל נכתב `true` **בהרשמה** (`actions.ts:65`, `google.ts:120`), כלומר סמנטיקה של "נרשם", לא "סיים סיור". צריך שדה נפרד. |
| "אין מנגנון תשלום, `/pricing` = 404" | נכון. אין Stripe/סליקה, אין מודל נקודות/ארנק, `/pricing` ו‑`/account` לא קיימים. שדה greenfield מלא. |
| מתג מצב (מהיר/מלא/Custom) צריך להיבנות | **כבר קיים:** `ViewModeSwitcher` ב‑`view-mode-toggle.tsx`. אבל ב‑`app-shell.tsx:148` הוא מקודד `current="full"` ולא משקף את המצב האמיתי — באג קיים לתקן. |
| רשימת "עבודות אחרונות" צריכה להיבנות | הנתונים והרכיב קיימים: `getProjects()` (`queries.ts:103`) + `ProjectCard`/`VerdictBadge` עם `name/city/plotAreaSqm/units/score/verdict`. נעטוף מחדש, לא נבנה מאפס. |

### עקרונות ארכיטקטורה שנגזרים מהקוד
- **אין middleware/proxy.** כל gate ניתוב הוא per-request בתוך server components/actions. שינוי ניתוב = עריכת `page.tsx` + `actions.ts` + google callback, לא שכבת edge.
- **`getSession()` לא נוגע ב‑DB** — מחזיר claims מה‑JWT (`{id,email,name,title,role}`). כל קריאת יתרה/דגל דורשת `await connectDB(); User.findById(session.id)`. אין היום helper כזה — צריך לבנות.
- **מודל הרשאות "היברידי ציבורי":** `(app)/layout.tsx` לא חוסם — כל אחד גולש, פעולות ששומרות נתונים מאמתות בעצמן. `/home` יוכל לרשת את ה‑AppShell אם ימוקם תחת `(app)`.
- **Tailwind v4, ללא config file.** טוקנים ב‑`globals.css` (HSL + hex Figma). מוסכמות: `cn()`, CVA (`button.tsx`/`badge.tsx`), `bg-card`/`border-border`/`rounded-[var(--radius-lg)]`/`.shadow-pill`, `.tnum` למספרים, `font-display` לכותרות, Radix `Dialog` למודאלים, `sonner` ל‑toast, Phosphor icons ב‑`brand/icons.tsx`, RTL (`dir="rtl"`, `text-right`, logical props).
- **גvolt framer-motion:** MotionValue של opacity שמתחיל ב‑1 בדיוק נקפא — לדחוף ידנית עם `.set()` או להתחיל מתחת ל‑1 (ראה `story-hero.tsx:139`). לכבד `useReducedMotion`.

---

## 1. סדר הגושים (staging)

1. **גוש 1 — עמוד בית `/home` + ניתוב** ← מפורט מלא כאן, נבנה ראשון.
2. **גוש 2 — כלכלת נקודות** (מודל נתונים, `/api/points/charge` אטומי, `PointsChip`/`CostBadge`/`ChargeConfirmModal`/`TopUpModal`). תלוי ב‑1 (הצ'יפ יושב בסרגל של `/home`).
3. **גוש 3 — אונבורדינג + סיור** (`OnboardingTour` בן 5 שלבים, דגל `onboarding_completed` בשרת, אייקון עזרה). תלוי ב‑1 (הסיור מאיר אלמנטים ב‑`/home`) ובחלקו ב‑2 (שלב "נקודות").
4. **גוש 4 — `/pricing` + `/account`** (עמוד תמחור ציבורי, עמוד חשבון עם היסטוריית תנועות). תלוי ב‑2.
5. **גוש 5 — landing ציבורי** (שני CTA + שורת הסבר על שני המסלולים, שימור ה‑hero). עצמאי, אפשר במקביל.
6. **גוש 6 — assets ואנליטיקס** (סרטון הקלטת‑מסך, אייקונים, איור empty-state, אירועי מדידה). לרוחב.

> החיוב בפועל (הורדת נקודות) חייב לרוץ בשרת בזמן ההרצה. פרטי כרטיס — רק דרך ספק סליקה מתארח, בלי שדות כרטיס במערכת. (נאכף בגוש 2/4.)

---

## 2. גוש 1 — עמוד בית `/home` + ניתוב (מפורט)

### 2.1 יעד
משתמש מחובר שנכנס ל‑`/` מגיע ל‑`/home` חדש (במקום `/quick`/`/dashboard`), רואה שני כרטיסי מסלול שווי‑משקל (מהיר / Custom), קישורים משניים, ורשימת עבודות אחרונות. הדאשבורד המלא נשאר נגיש דרך מתג המצב וקישור משני.

### 2.2 החלטת ניתוב — הגישה המומלצת
מוסיפים מצב תצוגה רביעי **`home`** למערכת הקיימת, במקום לעקוף אותה. זה מנצל את התשתית (`VIEW_HOME`, `ViewModeSwitcher`, קוקי `omdan_view`) ומשאיר עקביות.

**קבצים לשינוי:**

1. `src/lib/view-mode.ts`
   - להוסיף `"home"` ל‑type המצב ול‑`VIEW_HOME`: `home: "/home"`.
   - לשנות את מצב הדיפולט מ‑`"lean"` ל‑`"home"` (שורה ~23) — כך משתמש בלי קוקי נוחת ב‑`/home`.
   - החלטה פתוחה: להשאיר `lean/full/custom` כמצבים לחיצים או ש‑`home` הוא רק "נחיתה". המלצה: `home` הוא נחיתה בלבד; מתג המצב נשאר תלת‑מצבי (מהיר/מלא/Custom) והלוגו/קישור מוביל ל‑`/home`.

2. `src/server/actions.ts` — `safeNext()` (שורה 36): לשנות דיפולט מ‑`/dashboard` ל‑`/home` (חל על login + register).

3. `src/app/api/auth/google/callback/route.ts` — `safeNext()` (שורה ~12): דיפולט ל‑`/home`.

4. `src/app/(auth)/login/page.tsx:18` — דיפולט `next` ל‑`/home`.

5. `src/components/auth/auth-form.tsx:94,122` — hidden `next` inputs: דיפולט ל‑`/home`.

6. `src/app/page.tsx` — כבר מנתב דרך `VIEW_HOME[mode]`; אחרי שינוי הדיפולט ב‑(1) יעבוד אוטומטית. לוודא ש‑`getViewMode()` מחזיר `home` כשאין קוקי.

> הערה: שני מסלולי הדיפולט (root redirect לפי קוקי, ו‑post-login `safeNext`) צריכים שניהם להצביע על `/home` כדי להתנהג עקבי.

### 2.3 מבנה הקבצים החדשים
```
src/app/(app)/home/page.tsx           ← Server Component; טוען session + getProjects(); מרנדר <HomeHub>
src/components/home/home-hub.tsx       ← לב העמוד (client): כותרת, 2×PathCard, קישורים משניים, RecentWorks
src/components/home/path-card.tsx      ← PathCard (וריאציית quick|custom): אייקון, טקסט, CostBadge, כפתור
src/components/home/recent-works.tsx   ← רשימה קומפקטית; עוטף ProjectCardData (או גרסה מצומצמת)
```
- למקם תחת `(app)` כדי לרשת את `AppShell` (סרגל, מתג מצב, theme). אם רוצים סרגל עליון מינימלי שונה מה‑AppShell המלא — לשקול group layout ייעודי; **המלצה לגוש 1: לרשת AppShell** ולדחות סרגל ייעודי.
- להוסיף `/home` ל‑`NAV` ב‑`app-shell.tsx:22` (או להפוך את הלוגו לקישור ל‑`/home`).

### 2.4 `HomeHub` — תוכן (מהמיקרו‑קופי במסמך)
- כותרת: **"מה ננתח היום?"** (`font-display`). תת‑כותרת: "בחרו מסלול — כל השאר נפתח מכאן. אין צורך ללמוד את המערכת מראש."
- שני `PathCard` ב‑grid שווה משקל (`grid md:grid-cols-2 gap-6`, אותו גובה/הבלטה):
  - **מהיר:** "מדביקים חוברת מכרז ומקבלים אומדן כלכלי מלא תוך חצי דקה." · `CostBadge`=1 · כפתור → `/quick`.
  - **Custom:** תג משנה "הכי מדויק לחברה שלכם" · "מעלים את האקסל של החברה יחד עם מסמכי המכרז — ורדיוס ממלא את התבנית שלכם עם ציטוט מקור לכל שדה." · `CostBadge`=10 · כפתור → `/custom/new`.
- שורת קישורים משניים (מוקטנים/מעומעמים): עיון ב‑3,482 מכרזי רמ"י → `/tenders`; דאשבורד מלא → `/dashboard`; מפת מכרזים → `/map`.
- `RecentWorks`: כל שורה = שם, שטח (מ"ר), יח"ד, score, `VerdictBadge` (Go/No‑Go). מקור: `getProjects()`; אם 0 — empty-state (`empty-state.tsx`, איור מגוש 6).

> ב‑גוש 1 `CostBadge` יכול להיות רכיב תצוגה סטטי ("1 נקודה"/"10 נקודות") בלי לוגיקת חיוב — הלוגיקה מגיעה בגוש 2. לבנות אותו כבר בצורה שתקבל `cost` ו‑`balance` כ‑props כדי לא לשכתב.

### 2.5 בדיקות קבלה לגוש 1
- משתמש מחובר בלי קוקי `omdan_view` → `/` מפנה ל‑`/home`.
- login/register/google → נוחתים ב‑`/home` (כשאין `next` תקף).
- `next` תקף (למשל `/tenders/xxx`) עדיין מכובד — לא נשבר ה‑open-redirect guard.
- מתג המצב עובד ומשקף מצב אמיתי (תיקון ה‑`current="full"` הקשיח ב‑`app-shell.tsx:148`).
- שני הכרטיסים באותו משקל ויזואלי; כפתורים מובילים ל‑`/quick` ו‑`/custom/new`.
- RTL תקין; מצב dark ו‑light; empty-state כשאין פרויקטים.
- אימות end-to-end דרך preview (dev server) + screenshot, לא בדיקה ידנית.

---

## 3. גוש 2 — כלכלת נקודות (מסגרת)

**מודל נתונים** (`src/server/models.ts`):
- `UserSchema`: `points_balance: { type: Number, default: 3 }` (3 מתנת הרשמה) + `onboarding_completed: { type: Boolean, default: false }` (נפרד מ‑`onboarded` הקיים).
- מודל חדש `PointTransaction` (בסגנון `models-custom.ts`): `userId(ref) + delta + reason + refId + timestamps`.

**API** (App Router route handlers — כמו הקיימים תחת `src/app/api/…`):
- `GET /api/me` → `{ balance, onboarding_completed, ... }` (דורש `connectDB(); User.findById(session.id)`).
- `POST /api/points/charge` → חיוב **אטומי בשרת** (`findOneAndUpdate` עם תנאי `points_balance >= cost`), כותב `PointTransaction`, דוחה אם אין מספיק. **לעולם לא בצד לקוח.**
- `GET /api/points/packs`, `POST /api/points/purchase` (עובר לספק סליקה מתארח).
- החיוב חייב לרוץ **בזמן הרצת הניתוח** בתוך ה‑server action/route הרלוונטי (`custom-actions.ts` — `analyzeExcelAction`/`extractEvidenceAction`, `enrich/run/route.ts`, המרת מכרז→פרויקט).

**עלויות:** מהיר=1 (ראשון חינם, כמו היום), חיתום מלא=5, Custom=10. פעולות נלוות (שאלה ל‑AI, כיול, ייצוא)=0.

**רכיבים:** `PointsChip` (סרגל + כפתור "טען", מונפש עם `useSpring` כמו `animated-number.tsx`), `CostBadge` (CVA variants), `ChargeConfirmModal` + `TopUpModal` (Radix `Dialog`, תבנית `delete-project.tsx`: controlled + `Loader2` + `toast`). מיקרו‑קופי מוכן במסמך.

**זרימה:** לחיצה על "התחילו ניתוח" → בדיקת יתרה → אם מספיק: `ChargeConfirmModal` → חיוב+הרצה → toast יתרה. אם לא: `TopUpModal` → רכישה → חזרה אוטומטית לפעולה. יתרה נמוכה → כפתור הופך ל‑"טענו נקודות כדי להמשיך".

---

## 4. גוש 3 — אונבורדינג + סיור (מסגרת)

- `OnboardingTour` — 5 שלבים, spotlight + טולטיפ לא‑חוסם (סגנון Google Sheets/Anthropic), מונה "1 מתוך 5", "הבא"/"דלג". שלב 1 במרכז עם סרטון 16:9 (~340px, autoplay muted loop, קליק=קול+הגדלה).
- שלבים: (1) ברוכים הבאים+סרטון (2) כרטיס מהיר (3) כרטיס Custom (4) צ'יפ נקודות (5) מתג "מלא".
- הפעלה בכניסה ראשונה כאשר `onboarding_completed === false`; "דלג"/סיום → `POST /api/onboarding/complete` שומר `true` **בשרת** (לא localStorage — עקביות בין מכשירים). אייקון "עזרה" (?) בסרגל להפעלה מחדש.
- `FeatureCallout` (לעתיד): נקודה פועמת "חדש" + פופאובר "הבנתי", רכיב יחיד לפי מפתח.
- אנימציה: `Reveal` + `useReducedMotion` + workaround ה‑opacity.

---

## 5. גוש 4 — `/pricing` + `/account` (מסגרת)
- `/pricing` (ציבורי, מתקן את ה‑404): 3 חבילות (מתנסה/מקצועי‑משתלם/משרד) + Enterprise + הסבר נקודות. מחירי מסגרת מהמסמך (לכיול אחרי פיילוט).
- `/account`: יתרה, היסטוריית תנועות (`PointTransaction`), חבילות. תחת `(app)`.

## 6. גוש 5 — landing ציבורי (מסגרת)
- שימור ה‑`StoryHero` הקולנועי; החלפת ה‑CTA היחיד בשניים ("ניתוח מהיר — חינם" / "ניתוח Custom") + שורת הסבר על שני המסלולים. הווידג'ט `QuickCalculator` ב‑`#try` נשאר.

## 7. גוש 6 — assets + אנליטיקס (לרוחב)
- **Assets:** סרטון אונבורדינג (~25ש', **הקלטת מסך של המוצר האמיתי**, לא generative), 2 אייקוני מסלול, איור empty-state, אייקון נקודה (כוכב), hero חדש ל‑landing.
- **אנליטיקס:** `home_path_selected(quick|custom)`, שלבי/סיום/דילוג סיור, חיוב נקודות, פתיחת/רכישת חבילה, `low_balance_blocked`.

---

## 8. החלטות שהוכרעו (18.7.2026)
1. **מצב `home`:** ✅ **נחיתה בלבד** — `home` הוא יעד הנחיתה והדיפולט, מתג המצב נשאר תלת‑מצבי (מהיר/מלא/Custom) ולא מדגיש כפתור כשנמצאים ב‑`/home`. *(מיושם בגוש 1.)*
2. **דגל אונבורדינג:** ✅ **שדה חדש נפרד** `onboarding_completed` — לא להעמיס על `onboarded` הקיים (שמסמן "נרשם"). *(ליישום בגוש 3.)*
3. **מיקום `/home`:** ✅ לרשת את `AppShell` המלא — `src/app/(app)/home/page.tsx`. *(מיושם בגוש 1.)*

### נותרו פתוחות (לגושים הבאים)
- **שם המטבע:** "נקודות" (ברירת מחדל במסמך) / "קרדיטים" / "כוכבים". *(גוש 2.)*
- שם/סכומי חבילות — מסגרת בלבד, לכיול אחרי פיילוט. *(גוש 4.)*

---

## 9. סטטוס גוש 1 — הושלם ואומת (18.7.2026)
**ניתוב:** `view-mode.ts` (מצב `home` + דיפולט), `actions.ts`+google callback+`login/page.tsx` (`safeNext`→`/home`).
**Shell:** `app-shell.tsx` (nav "בית" + `IconHome`, לוגו→`/home`, `viewMode` prop אמיתי במקום `current="full"` הקשיח), `(app)/layout.tsx` (מזרים `getViewMode()`), `view-mode-toggle.tsx` (מקבל `home`).
**רכיבים חדשים:** `(app)/home/page.tsx`, `home/home-hub.tsx`, `home/path-card.tsx`, `home/recent-works.tsx`, `common/cost-badge.tsx` (בנוי לקבל `cost`+`balance` לגוש 2), אייקונים `IconHome`/`IconPoints`.
**אימות:** `tsc --noEmit` נקי; `/home` נטען (HTTP 200), שני הכרטיסים, קישורים משניים, empty-state, RTL, dark mode (bg-card נפתר לטוקן הכהה), אפס שגיאות קונסולה.
