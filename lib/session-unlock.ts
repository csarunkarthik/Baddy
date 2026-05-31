import { prisma } from "./prisma";

// Uses a self-creating table so no migration is needed.
let tableReady = false;

async function ensureTable() {
  if (tableReady) return;
  await prisma.$executeRawUnsafe(
    `CREATE TABLE IF NOT EXISTS _session_unlocks (session_id INTEGER PRIMARY KEY)`
  );
  tableReady = true;
}

export async function getAllUnlockedIds(): Promise<Set<number>> {
  await ensureTable();
  const rows = await prisma.$queryRawUnsafe<{ session_id: number }[]>(
    `SELECT session_id FROM _session_unlocks`
  );
  return new Set(rows.map((r) => r.session_id));
}

export async function isForceUnlocked(sessionId: number): Promise<boolean> {
  await ensureTable();
  const rows = await prisma.$queryRawUnsafe<{ exists: boolean }[]>(
    `SELECT EXISTS(SELECT 1 FROM _session_unlocks WHERE session_id = $1) AS exists`,
    sessionId
  );
  return rows[0]?.exists ?? false;
}

export async function setUnlocked(sessionId: number, unlock: boolean): Promise<void> {
  await ensureTable();
  if (unlock) {
    await prisma.$executeRawUnsafe(
      `INSERT INTO _session_unlocks (session_id) VALUES ($1) ON CONFLICT DO NOTHING`,
      sessionId
    );
  } else {
    await prisma.$executeRawUnsafe(
      `DELETE FROM _session_unlocks WHERE session_id = $1`,
      sessionId
    );
  }
}
