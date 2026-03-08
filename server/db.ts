import dotenv from "dotenv";
dotenv.config();
import { Pool, neonConfig } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-serverless';
import ws from "ws";
import * as schema from "@shared/schema";

neonConfig.webSocketConstructor = ws;

if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL must be set. Did you forget to provision a database?",
  );
}

// Optimized pool configuration for better performance
export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 10, // Maximum connections in the pool
  idleTimeoutMillis: 30000, // Close idle connections after 30 seconds
  connectionTimeoutMillis: 10000, // Timeout for new connections
});

export const db = drizzle({ client: pool, schema });

// Warm up the connection pool on startup
pool.connect().then(client => {
  client.release();
  console.log('Database connection pool warmed up');
}).catch(err => {
  console.error('Failed to warm up database pool:', err.message);
});
