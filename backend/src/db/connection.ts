import { Pool } from 'pg';
import dotenv from 'dotenv';

dotenv.config();

// Create connection pool
export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  host: process.env.PGHOST || 'localhost',
  port: parseInt(process.env.PGPORT || '5432', 10),
  user: process.env.PGUSER || 'postgres',
  password: process.env.PGPASSWORD || 'postgres',
  database: process.env.PGDATABASE || 'lg_diagnostic_db',
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});

let isConnected = false;

pool.on('connect', () => {
  isConnected = true;
  console.log('✅ [Postgres] Connected to PostgreSQL Database.');
});

pool.on('error', (err) => {
  console.warn('⚠️ [Postgres] Pool error or connection unavailable:', err.message);
});

export async function testConnection(): Promise<boolean> {
  try {
    const client = await pool.connect();
    const res = await client.query('SELECT NOW()');
    client.release();
    isConnected = true;
    console.log('✅ [Postgres] Active DB connection verified at:', res.rows[0].now);
    return true;
  } catch (err: any) {
    console.log('ℹ️ [Postgres] External DB not reachable (' + err.message + '). Running in hybrid resilient mode.');
    return false;
  }
}
