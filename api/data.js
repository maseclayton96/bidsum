import { getDb, initDb } from './db.js';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const sql = getDb();
  await initDb();

  const { table, id } = req.query;
  const allowed = ['members','gcs','teams','contacts','bids'];
  if (!allowed.includes(table)) return res.status(400).json({ error: 'Invalid table' });

  try {
    if (req.method === 'GET') {
      let rows;
      if (table === 'bids') rows = await sql`SELECT * FROM bids ORDER BY id DESC`;
      else rows = await sql`SELECT * FROM ${sql(table)} ORDER BY id ASC`;
      return res.json(rows);
    }

    if (req.method === 'POST') {
      const body = req.body;
      if (table === 'members') {
        const rows = await sql`INSERT INTO members (first,last,type,title,series,email,phone) VALUES (${body.first},${body.last},${body.type},${body.title},${body.series},${body.email},${body.phone}) RETURNING *`;
        return res.json(rows[0]);
      }
      if (table === 'gcs') {
        const rows = await sql`INSERT INTO gcs (name,office,web,logo,street,city,phone,member_ids) VALUES (${body.name},${body.office},${body.web},${body.logo},${body.street},${body.city},${body.phone},${JSON.stringify(body.member_ids||[])}) RETURNING *`;
        return res.json(rows[0]);
      }
      if (table === 'teams') {
        const rows = await sql`INSERT INTO teams (gc_id,name) VALUES (${body.gc_id},${body.name}) RETURNING *`;
        return res.json(rows[0]);
      }
      if (table === 'contacts') {
        const rows = await sql`INSERT INTO contacts (gc_id,first,last,role,team,email,phone,cell,notes,linkedin,photo) VALUES (${body.gc_id},${body.first},${body.last},${body.role},${body.team},${body.email},${body.phone},${body.cell},${body.notes},${body.linkedin},${body.photo}) RETURNING *`;
        return res.json(rows[0]);
      }
      if (table === 'bids') {
        const rows = await sql`INSERT INTO bids (num,member_id,gc_id,gc_name,contact_id,contact_name,job,value,date,follow_days,decision,status,notes,pdfs) VALUES (${body.num},${body.member_id},${body.gc_id},${body.gc_name},${body.contact_id},${body.contact_name},${body.job},${body.value},${body.date},${body.follow_days},${body.decision},${body.status},${body.notes},${JSON.stringify(body.pdfs||[])}) RETURNING *`;
        return res.json(rows[0]);
      }
    }

    if (req.method === 'PATCH') {
      const body = req.body;
      if (table === 'members') {
        const rows = await sql`UPDATE members SET first=${body.first},last=${body.last},type=${body.type},title=${body.title},series=${body.series},email=${body.email},phone=${body.phone} WHERE id=${id} RETURNING *`;
        return res.json(rows[0]);
      }
      if (table === 'gcs') {
        const rows = await sql`UPDATE gcs SET name=${body.name},office=${body.office},web=${body.web},logo=${body.logo},street=${body.street},city=${body.city},phone=${body.phone} WHERE id=${id} RETURNING *`;
        return res.json(rows[0]);
      }
      if (table === 'teams') {
        const rows = await sql`UPDATE teams SET name=${body.name} WHERE id=${id} RETURNING *`;
        return res.json(rows[0]);
      }
      if (table === 'contacts') {
        const rows = await sql`UPDATE contacts SET first=${body.first},last=${body.last},role=${body.role},team=${body.team},email=${body.email},phone=${body.phone},cell=${body.cell},notes=${body.notes},linkedin=${body.linkedin},photo=${body.photo} WHERE id=${id} RETURNING *`;
        return res.json(rows[0]);
      }
      if (table === 'bids') {
        const rows = await sql`UPDATE bids SET num=${body.num},member_id=${body.member_id},gc_id=${body.gc_id},gc_name=${body.gc_name},contact_id=${body.contact_id},contact_name=${body.contact_name},job=${body.job},value=${body.value},date=${body.date},follow_days=${body.follow_days},decision=${body.decision},status=${body.status},notes=${body.notes},pdfs=${JSON.stringify(body.pdfs||[])} WHERE id=${id} RETURNING *`;
        return res.json(rows[0]);
      }
    }

    if (req.method === 'DELETE') {
      await sql`DELETE FROM ${sql(table)} WHERE id=${id}`;
      return res.json({ ok: true });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: e.message });
  }
}
