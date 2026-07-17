import { test, expect, type Page } from "@playwright/test";

/** Log in with the seeded demo user (the auth form no longer prefills credentials). */
async function loginDemo(page: Page) {
  await page.goto("/login");
  await expect(page.getByRole("heading", { name: "כניסה / הרשמה" })).toBeVisible();
  await page.locator("#email").fill("demo@radius.co.il");
  await page.locator("#password").fill("radius2026");
  await page.getByRole("button", { name: /כניסה למערכת/ }).click();
  await expect(page).toHaveURL(/\/dashboard/, { timeout: 30_000 });
}

test("login → dashboard → project workspace → 3D map + tabs", async ({ page }) => {
  await loginDemo(page);

  // Dashboard
  await expect(page.getByRole("heading", { name: "לוח בקרה" })).toBeVisible();
  // Live gov-data pill present
  await expect(page.getByText(/נתוני ממשלה/)).toBeVisible();
  // KPI portfolio value
  await expect(page.getByText("שווי שיורי מצרפי (תיק)")).toBeVisible();

  // Open the first project
  await page.getByRole("link", { name: /לניתוח מלא|מגדלי הפארק|מתחם ההתחדשות|מגרש הים/ }).first().click();
  await expect(page).toHaveURL(/\/projects\/[a-f0-9]{24}/);

  // Live bid control bar
  await expect(page.getByText("מחיר ההצעה למכרז")).toBeVisible();
  await expect(page.getByText("שווי קרקע שיורי").first()).toBeVisible();

  // 3D map canvas renders
  await expect(page.locator("canvas.maplibregl-canvas")).toBeVisible({ timeout: 30_000 });

  // Switch to the risk tab and verify a chart renders
  await page.getByRole("tab", { name: /סיכונים/ }).click();
  await expect(page.getByText(/תרחישים/)).toBeVisible();

  // Decision tab shows recommendation
  await page.getByRole("tab", { name: /החלטה/ }).click();
  await expect(page.getByText("סף קללת המנצח").first()).toBeVisible();
});

test("national map renders all markers", async ({ page }) => {
  await loginDemo(page);

  await page.goto("/map");
  await expect(page.getByRole("heading", { name: "מפת מכרזים ופרויקטים" })).toBeVisible();
  await expect(page.locator("canvas.maplibregl-canvas")).toBeVisible({ timeout: 30_000 });
});

test("command palette opens and navigates", async ({ page }) => {
  await loginDemo(page);

  await page.keyboard.press("Control+k");
  await expect(page.getByPlaceholder(/חיפוש פרויקטים/)).toBeVisible();
  await page.getByPlaceholder(/חיפוש פרויקטים/).fill("השוואת");
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/\/compare/);
  await expect(page.getByText("ההזדמנות המומלצת ביותר")).toBeVisible();
});

test("scenario toggle changes the analysis", async ({ page }) => {
  await loginDemo(page);
  await page.getByRole("link", { name: /מגדלי הפארק/ }).first().click();
  await expect(page).toHaveURL(/\/projects\/[a-f0-9]{24}/);

  // optimistic scenario should push verdict to Go
  await page.getByRole("button", { name: "אופטימי", exact: true }).click();
  await expect(page.getByText(/מומלץ — Go/).first()).toBeVisible();
});
