import { neon } from '@neondatabase/serverless';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const sql = neon(process.env.DATABASE_URL);
  const { table, id } = req.query;
  const allowed = ['members','gcs','teams','contacts','bids'];
  if (!allowed.includes(table)) return res.status(400).json({ error: 'Invalid table' });

  try {
    await sql`CREATE TABLE IF NOT EXISTS members (id BIGSERIAL PRIMARY KEY, first TEXT, last TEXT, type TEXT, title TEXT, series TEXT, email TEXT, phone TEXT, created_at TIMESTAMPTZ DEFAULT NOW())`;
    await sql`CREATE TABLE IF NOT EXISTS gcs (id BIGSERIAL PRIMARY KEY, name TEXT, office TEXT, web TEXT, logo TEXT, street TEXT, city TEXT, phone TEXT, member_ids JSONB DEFAULT '[]', created_at TIMESTAMPTZ DEFAULT NOW())`;
    await sql`CREATE TABLE IF NOT EXISTS teams (id BIGSERIAL PRIMARY KEY, gc_id BIGINT, name TEXT)`;
    await sql`CREATE TABLE IF NOT EXISTS contacts (id BIGSERIAL PRIMARY KEY, gc_id BIGINT, first TEXT, last TEXT, role TEXT, team TEXT, email TEXT, phone TEXT, cell TEXT, notes TEXT, linkedin TEXT, photo TEXT, created_at TIMESTAMPTZ DEFAULT NOW())`;
    await sql`CREATE TABLE IF NOT EXISTS bids (id BIGSERIAL PRIMARY KEY, num TEXT, member_id BIGINT, gc_id BIGINT, gc_name TEXT, contact_id BIGINT, contact_name TEXT, job TEXT, value NUMERIC DEFAULT 0, date TEXT, follow_days INT DEFAULT 7, decision TEXT, status TEXT DEFAULT 'Submitted', notes TEXT, pdfs JSONB DEFAULT '[]', created_at TIMESTAMPTZ DEFAULT NOW())`;
    // New columns
    await sql`ALTER TABLE members ADD COLUMN IF NOT EXISTS initials TEXT`;
    await sql`ALTER TABLE members ADD COLUMN IF NOT EXISTS card_bg TEXT`;
    await sql`ALTER TABLE members ADD COLUMN IF NOT EXISTS card_txt TEXT`;
    await sql`ALTER TABLE members ADD COLUMN IF NOT EXISTS card_gradient TEXT`;
    await sql`ALTER TABLE members ADD COLUMN IF NOT EXISTS pin_hash TEXT`;
    await sql`ALTER TABLE members ADD COLUMN IF NOT EXISTS pin_token TEXT`;
    await sql`ALTER TABLE members ADD COLUMN IF NOT EXISTS role TEXT DEFAULT 'employee'`;
    await sql`ALTER TABLE members ADD COLUMN IF NOT EXISTS active BOOLEAN DEFAULT true`;
    await sql`ALTER TABLE members ADD COLUMN IF NOT EXISTS last_login TIMESTAMPTZ`;
    await sql`ALTER TABLE members ADD COLUMN IF NOT EXISTS employee_num TEXT`;
    await sql`ALTER TABLE members ADD COLUMN IF NOT EXISTS company TEXT`;
    await sql`ALTER TABLE bids ADD COLUMN IF NOT EXISTS company TEXT DEFAULT 'ACI'`;
  } catch(e) { console.error('Init error:', e.message); }

  try {
    if (req.method === 'GET') {
      let rows;
      if (table === 'members') rows = await sql`SELECT * FROM members ORDER BY id ASC`;
      else if (table === 'gcs') rows = await sql`SELECT * FROM gcs ORDER BY id ASC`;
      else if (table === 'teams') rows = await sql`SELECT * FROM teams ORDER BY id ASC`;
      else if (table === 'contacts') rows = await sql`SELECT * FROM contacts ORDER BY id ASC`;
      else if (table === 'bids') rows = await sql`SELECT * FROM bids ORDER BY id DESC`;
      return res.json(rows);
    }

    if (req.method === 'POST') {
      const b = req.body; let rows;
      if (table === 'members') rows = await sql`INSERT INTO members (first,last,type,title,series,email,phone,initials,card_bg,card_txt,card_gradient,role,active,employee_num,company) VALUES (${b.first},${b.last},${b.type},${b.title||''},${b.series||''},${b.email||''},${b.phone||''},${b.initials||null},${b.card_bg||null},${b.card_txt||null},${b.card_gradient||null},${b.role||'employee'},${b.active!==false},${b.employee_num||null},${b.company||null}) RETURNING *`;
      else if (table === 'gcs') rows = await sql`INSERT INTO gcs (name,office,web,logo,street,city,phone,member_ids) VALUES (${b.name},${b.office||''},${b.web||''},${b.logo||''},${b.street||''},${b.city||''},${b.phone||''},${JSON.stringify(b.member_ids||[])}) RETURNING *`;
      else if (table === 'teams') rows = await sql`INSERT INTO teams (gc_id,name) VALUES (${b.gc_id},${b.name}) RETURNING *`;
      else if (table === 'contacts') rows = await sql`INSERT INTO contacts (gc_id,first,last,role,team,email,phone,cell,notes,linkedin,photo) VALUES (${b.gc_id},${b.first},${b.last},${b.role||''},${b.team||''},${b.email||''},${b.phone||''},${b.cell||''},${b.notes||''},${b.linkedin||''},${b.photo||''}) RETURNING *`;
      else if (table === 'bids') rows = await sql`INSERT INTO bids (num,member_id,gc_id,gc_name,contact_id,contact_name,job,value,date,follow_days,decision,status,notes,pdfs,company) VALUES (${b.num||''},${b.member_id||null},${b.gc_id||null},${b.gc_name||''},${b.contact_id||null},${b.contact_name||''},${b.job||''},${b.value||0},${b.date||''},${b.follow_days||7},${b.decision||null},${b.status||'Submitted'},${b.notes||''},${JSON.stringify(b.pdfs||[])},${b.company||'ACI'}) RETURNING *`;
      return res.json(rows[0]);
    }

    if (req.method === 'PATCH') {
      const b = req.body; const rid = parseInt(id); let rows;
      if (table === 'members') rows = await sql`UPDATE members SET first=${b.first},last=${b.last},type=${b.type},title=${b.title||''},series=${b.series||''},email=${b.email||''},phone=${b.phone||''},initials=${b.initials||null},card_bg=${b.card_bg||null},card_txt=${b.card_txt||null},card_gradient=${b.card_gradient||null},role=${b.role||'employee'},active=${b.active!==false},pin_hash=${b.pin_hash||null},pin_token=${b.pin_token||null},last_login=${b.last_login||null},employee_num=${b.employee_num||null},company=${b.company||null} WHERE id=${rid} RETURNING *`;
      else if (table === 'gcs') rows = await sql`UPDATE gcs SET name=${b.name},office=${b.office||''},web=${b.web||''},logo=${b.logo||''},street=${b.street||''},city=${b.city||''},phone=${b.phone||''} WHERE id=${rid} RETURNING *`;
      else if (table === 'teams') rows = await sql`UPDATE teams SET name=${b.name} WHERE id=${rid} RETURNING *`;
      else if (table === 'contacts') rows = await sql`UPDATE contacts SET first=${b.first},last=${b.last},role=${b.role||''},team=${b.team||''},email=${b.email||''},phone=${b.phone||''},cell=${b.cell||''},notes=${b.notes||''},linkedin=${b.linkedin||''},photo=${b.photo||''} WHERE id=${rid} RETURNING *`;
      else if (table === 'bids') rows = await sql`UPDATE bids SET num=${b.num||''},member_id=${b.member_id||null},gc_id=${b.gc_id||null},gc_name=${b.gc_name||''},contact_id=${b.contact_id||null},contact_name=${b.contact_name||''},job=${b.job||''},value=${b.value||0},date=${b.date||''},follow_days=${b.follow_days||7},decision=${b.decision||null},status=${b.status||'Submitted'},notes=${b.notes||''},pdfs=${JSON.stringify(b.pdfs||[])},company=${b.company||'ACI'} WHERE id=${rid} RETURNING *`;
      return res.json(rows[0]);
    }

    if (req.method === 'DELETE') {
      const rid = parseInt(id);
      if (table === 'members') await sql`DELETE FROM members WHERE id=${rid}`;
      else if (table === 'gcs') await sql`DELETE FROM gcs WHERE id=${rid}`;
      else if (table === 'teams') await sql`DELETE FROM teams WHERE id=${rid}`;
      else if (table === 'contacts') await sql`DELETE FROM contacts WHERE id=${rid}`;
      else if (table === 'bids') await sql`DELETE FROM bids WHERE id=${rid}`;
      return res.json({ ok: true });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (e) {
    console.error('API error:', e.message);
    return res.status(500).json({ error: e.message });
  }
}
