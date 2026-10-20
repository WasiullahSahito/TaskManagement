import dotenv from "dotenv";
import pg from "pg";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

dotenv.config({ path: fileURLToPath(new URL("../../.env", import.meta.url)) });

const { Pool } = pg;
const schemaPath = fileURLToPath(new URL("../schema.sql", import.meta.url));

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

export async function initializeDatabase() {
  const schema = await readFile(schemaPath, "utf8");
  await pool.query(schema);
}

export async function query(text, values) {
  return pool.query(text, values);
}

export async function withTransaction(callback) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await callback(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
