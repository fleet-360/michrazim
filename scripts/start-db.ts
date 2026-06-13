/**
 * Starts a persistent local MongoDB for development using a real mongod binary
 * (downloaded & cached by mongodb-memory-server on first run). Data persists in
 * ./.mongo-data so the demo survives restarts. Keep this running in a terminal:
 *
 *     npm run db
 *
 * If you set MONGODB_URI to Atlas / your own mongod, you don't need this.
 */
import { MongoMemoryServer } from "mongodb-memory-server";
import fs from "node:fs";
import path from "node:path";

const PORT = 27017;
const DB_PATH = path.resolve(process.cwd(), ".mongo-data");

async function main() {
  if (!fs.existsSync(DB_PATH)) fs.mkdirSync(DB_PATH, { recursive: true });

  console.log("⏳ מפעיל MongoDB מקומי (ייתכן שתידרש הורדת בינארי בפעם הראשונה)…");
  const server = await MongoMemoryServer.create({
    instance: {
      port: PORT,
      dbPath: DB_PATH,
      storageEngine: "wiredTiger",
    },
  });

  const uri = server.getUri();
  console.log("✅ MongoDB פעיל");
  console.log(`   URI: ${uri}`);
  console.log(`   נתונים נשמרים ב: ${DB_PATH}`);
  console.log("   השאר חלון זה פתוח. הרץ בנפרד: npm run seed ואז npm run dev");

  const shutdown = async () => {
    console.log("\n⏹  עוצר MongoDB…");
    await server.stop({ doCleanup: false, force: false });
    process.exit(0);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);

  // keep alive
  setInterval(() => {}, 1 << 30);
}

main().catch((e) => {
  console.error("❌ נכשל בהפעלת MongoDB:", e);
  process.exit(1);
});
