import mongoose from "mongoose";

// The database name is pinned here, not taken from the connection string. Atlas /
// Vercel-generated SRV strings often omit the path (…mongodb.net/?retryWrites=…),
// which would otherwise silently land us in the default "test" DB. Passing dbName
// to mongoose.connect() forces the right database regardless of the URI's path.
const DB_NAME = process.env.MONGODB_DB || "michrazim";
const MONGODB_URI = process.env.MONGODB_URI || `mongodb://127.0.0.1:27017/${DB_NAME}`;

interface MongooseCache {
  conn: typeof mongoose | null;
  promise: Promise<typeof mongoose> | null;
}

// Cache the connection across hot-reloads in dev and across lambda invocations.
const globalForMongoose = globalThis as unknown as { _mongoose?: MongooseCache };
const cache: MongooseCache = globalForMongoose._mongoose ?? { conn: null, promise: null };
globalForMongoose._mongoose = cache;

export async function connectDB(): Promise<typeof mongoose> {
  if (cache.conn) return cache.conn;
  if (!cache.promise) {
    cache.promise = mongoose.connect(MONGODB_URI, {
      dbName: DB_NAME,
      bufferCommands: false,
      serverSelectionTimeoutMS: 5000,
    });
  }
  try {
    cache.conn = await cache.promise;
  } catch (e) {
    cache.promise = null;
    throw e;
  }
  return cache.conn;
}

export { MONGODB_URI };
