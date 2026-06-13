import { config } from "dotenv";
config({ path: ".env.local" });

import bcrypt from "bcryptjs";
import { connectDB } from "../src/server/db";
import {
  Organization,
  User,
  City,
  Comparable,
  TenderListing,
  Project,
  AiInsight,
} from "../src/server/models";
import {
  SEED_CITIES,
  SEED_COMPARABLES,
  SEED_TENDERS,
  SEED_PROJECTS,
  DEMO_USER,
  DEMO_ORG,
} from "../src/server/seed-data";

async function main() {
  console.log("🌱 מתחבר ל-MongoDB ומזריע נתונים…");
  await connectDB();

  await Promise.all([
    Organization.deleteMany({}),
    User.deleteMany({}),
    City.deleteMany({}),
    Comparable.deleteMany({}),
    TenderListing.deleteMany({}),
    Project.deleteMany({}),
    AiInsight.deleteMany({}),
  ]);
  console.log("🧹 ניקיתי קולקציות קיימות");

  const org = await Organization.create(DEMO_ORG);
  const passwordHash = await bcrypt.hash(DEMO_USER.password, 10);
  const user = await User.create({
    email: DEMO_USER.email,
    name: DEMO_USER.name,
    title: DEMO_USER.title,
    role: DEMO_USER.role,
    passwordHash,
    orgId: org._id,
  });
  console.log(`👤 משתמש דמו: ${DEMO_USER.email} / ${DEMO_USER.password}`);

  await City.insertMany(SEED_CITIES);
  console.log(`🏙️  ${SEED_CITIES.length} ערים (אגרות + עוגני מחיר)`);

  // עסקאות, מכרזים ופרויקטים — לא מוזרעים. נתוני אמת בלבד:
  //  • מכרזים: חיים מ-data.gov.il (getLiveTenders)
  //  • עסקאות: מיובאות ע"י המשתמש מ-nadlan (ייבוא AI)
  //  • פרויקטים: נוצרים מ"ייבא מכרז" או מהאשף
  console.log("📊 עסקאות/מכרזים/פרויקטים — לא מוזרעים (נתוני אמת בלבד)");
  void SEED_COMPARABLES;
  void SEED_TENDERS;
  void SEED_PROJECTS;

  console.log("✅ ההזרעה הושלמה");
  process.exit(0);
}

main().catch((e) => {
  console.error("❌ ההזרעה נכשלה:", e);
  process.exit(1);
});
