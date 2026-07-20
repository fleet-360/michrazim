/**
 * Round-11 fixture: a realistic multi-page tender booklet PDF (details page +
 * legal boilerplate + contract annex) for the live Sderot tender ב/202/2025.
 * Tests the PDF extraction path with document noise around the key figures.
 */
import { chromium } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

const outDir = path.join("scripts", "qa-loop", "fixtures");
fs.mkdirSync(outDir, { recursive: true });

const page1 = `
<h1>רשות מקרקעי ישראל — מרחב עסקי דרום</h1>
<h2>חוברת מכרז פומבי מס' ב/202/2025</h2>
<p>הזמנה לקבלת הצעות לחכירת 17 מגרשים לבנייה עצמית (בנה ביתך) בשכונת כלניות, שדרות.</p>
<table border="1" cellpadding="6">
<tr><th>מגרש</th><th>שטח (מ"ר)</th><th>עלות קרקע</th><th>הוצאות פיתוח (כולל מע"מ)</th></tr>
<tr><td>42</td><td>468</td><td>0 ש"ח (פטור מלא)</td><td>784,242 ש"ח</td></tr>
</table>
<p>ייעוד: מגורים — יחידת דיור אחת צמודת קרקע למגרש.</p>
<p>המועד האחרון להגשת הצעות: 26/01/2026 בשעה 12:00. ערבות מכרז: 5,000 ש"ח.</p>
`;

const page2 = `
<h2>תנאי המכרז — כללי</h2>
<p>1. ההצעה תוגש באמצעות מערכת המכרזים המקוונת בלבד. הצעה שתוגש בדרך אחרת תיפסל.</p>
<p>2. הזכייה מותנית בעמידה בתנאי הסף: תושבות ישראלית, היעדר זכויות בנכס מקרקעין אחר מטעם התכנית, וחתימה על הצהרת המציע.</p>
<p>3. התשלום יבוצע בתוך 90 יום ממועד אישור ועדת המכרזים. איחור בתשלום יגרור ביטול זכייה וחילוט ערבות.</p>
<p>4. הזוכה יחתום על חוזה חכירה ל-98 שנים עם רשות מקרקעי ישראל בנוסח המצורף כנספח א'.</p>
<p>5. חובת סיום בנייה: 48 חודשים ממועד אישור העסקה. איסור העברת זכויות: 5 שנים מסיום הבנייה.</p>
<p>6. סבסוד הוצאות הפיתוח ופטור מלא ממחיר הקרקע — מכוח החלטת מועצת מקרקעי ישראל לאזורי עדיפות לאומית א'.</p>
`;

const page3 = `
<h2>נספח א' — עיקרי חוזה החכירה</h2>
<p>תקופת החכירה: 98 שנים. דמי היוון: משולמים מראש במלואם.</p>
<p>החוכר יישא בכל האגרות, ההיטלים ותשלומי החובה, לרבות אגרות בנייה והיטלי פיתוח עירוניים ככל שיחולו.</p>
<p>הפרה יסודית תקנה לרשות זכות ביטול וחילוט ערבויות. סמכות שיפוט: בתי המשפט המוסמכים במחוז הדרום.</p>
`;

async function main() {
  const html = `<!doctype html><html dir="rtl" lang="he"><head><meta charset="utf-8">
  <style>
    body{font-family:'Segoe UI',Arial,sans-serif;font-size:14px;line-height:1.8;margin:42px;}
    h1{font-size:20px;} h2{font-size:16px;} table{border-collapse:collapse;margin:12px 0;}
    .pb{page-break-after:always;}
  </style></head><body>
  <div class="pb">${page1}</div>
  <div class="pb">${page2}</div>
  <div>${page3}</div>
  </body></html>`;
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.setContent(html);
  await page.pdf({ path: path.join(outDir, "tender-202-2025-booklet.pdf"), format: "A4" });
  await browser.close();
  console.log("wrote fixtures/tender-202-2025-booklet.pdf");
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
