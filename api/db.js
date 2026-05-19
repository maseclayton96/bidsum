import { neon } from '@neondatabase/serverless';

export function getDb() {
  return neon(process.env.DATABASE_URL);
}

export async function initDb() {
  const sql = getDb();
  await sql`
    CREATE TABLE IF NOT EXISTS members (
      id BIGSERIAL PRIMARY KEY,
      first TEXT, last TEXT, type TEXT, title TEXT,
      series TEXT, email TEXT, phone TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )`;
  await sql`
    CREATE TABLE IF NOT EXISTS gcs (
      id BIGSERIAL PRIMARY KEY,
      name TEXT, office TEXT, web TEXT, logo TEXT,
      street TEXT, city TEXT, phone TEXT,
      member_ids JSONB DEFAULT '[]',
      created_at TIMESTAMPTZ DEFAULT NOW()
    )`;
  await sql`
    CREATE TABLE IF NOT EXISTS teams (
      id BIGSERIAL PRIMARY KEY,
      gc_id BIGINT REFERENCES gcs(id) ON DELETE CASCADE,
      name TEXT
    )`;
  await sql`
    CREATE TABLE IF NOT EXISTS contacts (
      id BIGSERIAL PRIMARY KEY,
      gc_id BIGINT REFERENCES gcs(id) ON DELETE CASCADE,
      first TEXT, last TEXT, role TEXT, team TEXT,
      email TEXT, phone TEXT, cell TEXT,
      notes TEXT, linkedin TEXT, photo TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )`;
  await sql`
    CREATE TABLE IF NOT EXISTS bids (
      id BIGSERIAL PRIMARY KEY,
      num TEXT, member_id BIGINT REFERENCES members(id),
      gc_id BIGINT REFERENCES gcs(id),
      gc_name TEXT, contact_id BIGINT REFERENCES contacts(id),
      contact_name TEXT, job TEXT, value NUMERIC DEFAULT 0,
      date TEXT, follow_days INT DEFAULT 7,
      decision TEXT, status TEXT DEFAULT 'Submitted',
      notes TEXT, pdfs JSONB DEFAULT '[]',
      created_at TIMESTAMPTZ DEFAULT NOW()
    )`;
}
