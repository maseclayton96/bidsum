// api/ewo.js — EWO records endpoint for BidSum
// Deploy this file to: /api/ewo.js in your Vercel project root
// Neon DB table: ewo_records (see CREATE TABLE below)
//
// ── TABLE (run once in Neon SQL editor) ─────────────────────────────────────
// CREATE TABLE IF NOT EXISTS ewo_records (
//   id          SERIAL PRIMARY KEY,
//   job_id      TEXT        NOT NULL,
//   company     TEXT        NOT NULL DEFAULT 'Bonas',
//   ewo_num     TEXT        NOT NULL,
//   date        TEXT,
//   foreman     TEXT,
//   description TEXT,
//   workers     JSONB       DEFAULT '[]',
//   materials   JSONB       DEFAULT '[]',
//   equipment   JSONB       DEFAULT '[]',
//   sundries    TEXT,
//   status      TEXT        NOT NULL DEFAULT 'Pending',
//   gc_super    TEXT,
//   gc_notes    TEXT,
//   created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
//   updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
// );
// CREATE INDEX IF NOT EXISTS idx_ewo_job_id ON ewo_records(job_id);
// ─────────────────────────────────────────────────────────────────────────────

import { neon } from '@neondatabase/serverless';

const sql = neon(process.env.DATABASE_URL);

export default async function handler(req, res) {
  // CORS headers (same-origin in production, permissive for dev)
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    await sql`ALTER TABLE ewo_records ADD COLUMN IF NOT EXISTS photos JSONB DEFAULT '[]'`;
  } catch (e) { console.error('EWO init error:', e.message); }

  try {
    // ── GET: fetch all EWOs for a job ────────────────────────────────────────
    if (req.method === 'GET') {
      const { job_id } = req.query;
      if (!job_id) {
        return res.status(400).json({ error: 'job_id required' });
      }
      const rows = await sql`
        SELECT * FROM ewo_records
        WHERE job_id = ${job_id}
        ORDER BY
          CASE status WHEN 'Pending' THEN 0 WHEN 'Approved' THEN 1 ELSE 2 END,
          ewo_num::int ASC NULLS LAST,
          created_at ASC
      `;
      return res.status(200).json(rows);
    }

    // ── POST: create new EWO ─────────────────────────────────────────────────
    if (req.method === 'POST') {
      const {
        job_id, company = 'Bonas', ewo_num, date, foreman,
        description, workers = [], materials = [], equipment = [],
        sundries = '', status = 'Pending', gc_super = '', gc_notes = '', photos = []
      } = req.body;

      if (!job_id || !ewo_num) {
        return res.status(400).json({ error: 'job_id and ewo_num required' });
      }

      const [row] = await sql`
        INSERT INTO ewo_records
          (job_id, company, ewo_num, date, foreman, description,
           workers, materials, equipment, sundries, status, gc_super, gc_notes, photos)
        VALUES
          (${job_id}, ${company}, ${ewo_num}, ${date || null}, ${foreman || null},
           ${description || null}, ${JSON.stringify(workers)}, ${JSON.stringify(materials)},
           ${JSON.stringify(equipment)}, ${sundries || null}, ${status},
           ${gc_super || null}, ${gc_notes || null}, ${JSON.stringify(photos)})
        RETURNING *
      `;
      return res.status(201).json(row);
    }

    // ── PATCH: update existing EWO ───────────────────────────────────────────
    if (req.method === 'PATCH') {
      const { id } = req.query;
      if (!id) return res.status(400).json({ error: 'id required' });

      const {
        ewo_num, date, foreman, description,
        workers, materials, equipment, sundries,
        status, gc_super, gc_notes, company, photos
      } = req.body;

      const [row] = await sql`
        UPDATE ewo_records SET
          ewo_num     = COALESCE(${ewo_num ?? null},     ewo_num),
          date        = COALESCE(${date ?? null},        date),
          foreman     = COALESCE(${foreman ?? null},     foreman),
          description = COALESCE(${description ?? null}, description),
          workers     = COALESCE(${workers ? JSON.stringify(workers) : null}::jsonb,   workers),
          materials   = COALESCE(${materials ? JSON.stringify(materials) : null}::jsonb, materials),
          equipment   = COALESCE(${equipment ? JSON.stringify(equipment) : null}::jsonb, equipment),
          photos      = COALESCE(${photos ? JSON.stringify(photos) : null}::jsonb, photos),
          sundries    = COALESCE(${sundries ?? null},    sundries),
          status      = COALESCE(${status ?? null},      status),
          gc_super    = COALESCE(${gc_super ?? null},    gc_super),
          gc_notes    = COALESCE(${gc_notes ?? null},    gc_notes),
          company     = COALESCE(${company ?? null},     company),
          updated_at  = NOW()
        WHERE id = ${parseInt(id)}
        RETURNING *
      `;
      if (!row) return res.status(404).json({ error: 'EWO not found' });
      return res.status(200).json(row);
    }

    // ── DELETE: remove an EWO ────────────────────────────────────────────────
    if (req.method === 'DELETE') {
      const { id } = req.query;
      if (!id) return res.status(400).json({ error: 'id required' });

      await sql`DELETE FROM ewo_records WHERE id = ${parseInt(id)}`;
      return res.status(200).json({ deleted: true, id });
    }

    return res.status(405).json({ error: 'Method not allowed' });

  } catch (err) {
    console.error('EWO API error:', err);
    return res.status(500).json({ error: err.message });
  }
}
