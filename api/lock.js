import { neon } from '@neondatabase/serverless';

// Pessimistic job locking so two people don't edit the same job at once.
// A lock is "stale" (treated as free) if its holder hasn't sent a heartbeat
// recently — this covers crashed tabs / lost connections without requiring
// anyone to manually clean up.
const STALE_MS = 45000;

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const sql = neon(process.env.DATABASE_URL);
  const jobId = req.query.job_id;
  if (!jobId) return res.status(400).json({ error: 'job_id required' });

  try {
    await sql`CREATE TABLE IF NOT EXISTS job_locks (
      job_id TEXT PRIMARY KEY,
      member_id BIGINT,
      member_name TEXT,
      locked_at TIMESTAMPTZ DEFAULT NOW(),
      heartbeat_at TIMESTAMPTZ DEFAULT NOW()
    )`;
  } catch (e) { console.error('Lock init error:', e.message); }

  const isStale = (row) => !row || (Date.now() - new Date(row.heartbeat_at).getTime()) > STALE_MS;

  try {
    if (req.method === 'GET') {
      const rows = await sql`SELECT * FROM job_locks WHERE job_id=${jobId}`;
      const row = rows[0];
      if (isStale(row)) {
        if (row) await sql`DELETE FROM job_locks WHERE job_id=${jobId}`;
        return res.json({ locked: false });
      }
      return res.json({ locked: true, member_id: row.member_id, member_name: row.member_name, locked_at: row.locked_at });
    }

    if (req.method === 'POST') {
      const b = req.body || {};
      const action = b.action || 'acquire';

      if (action === 'release') {
        await sql`DELETE FROM job_locks WHERE job_id=${jobId} AND member_id=${b.member_id}`;
        return res.json({ ok: true });
      }

      if (action === 'force_release') {
        await sql`DELETE FROM job_locks WHERE job_id=${jobId}`;
        return res.json({ ok: true });
      }

      const rows = await sql`SELECT * FROM job_locks WHERE job_id=${jobId}`;
      const row = rows[0];

      if (action === 'heartbeat') {
        if (!row || isStale(row)) return res.json({ locked: false });
        if (String(row.member_id) !== String(b.member_id)) {
          return res.status(409).json({ locked: true, member_id: row.member_id, member_name: row.member_name, locked_at: row.locked_at });
        }
        const updated = await sql`UPDATE job_locks SET heartbeat_at=NOW() WHERE job_id=${jobId} RETURNING *`;
        return res.json({ locked: true, member_id: updated[0].member_id, member_name: updated[0].member_name, locked_at: updated[0].locked_at });
      }

      // action === 'acquire'
      if (!isStale(row) && String(row.member_id) !== String(b.member_id)) {
        return res.status(409).json({ locked: true, member_id: row.member_id, member_name: row.member_name, locked_at: row.locked_at });
      }
      const upserted = await sql`INSERT INTO job_locks (job_id, member_id, member_name, locked_at, heartbeat_at)
        VALUES (${jobId}, ${b.member_id}, ${b.member_name || ''}, NOW(), NOW())
        ON CONFLICT (job_id) DO UPDATE SET member_id=EXCLUDED.member_id, member_name=EXCLUDED.member_name, locked_at=NOW(), heartbeat_at=NOW()
        RETURNING *`;
      return res.json({ locked: true, member_id: upserted[0].member_id, member_name: upserted[0].member_name, locked_at: upserted[0].locked_at });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (e) {
    console.error('Lock API error:', e.message);
    return res.status(500).json({ error: e.message });
  }
}
