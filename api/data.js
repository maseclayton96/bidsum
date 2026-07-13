import { neon } from '@neondatabase/serverless';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const sql = neon(process.env.DATABASE_URL);
  const { table, id } = req.query;

  if (table === 'dbsize') {
    if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
    try {
      const rows = await sql`SELECT pg_database_size(current_database()) AS bytes`;
      return res.json({ bytes: parseInt(rows[0].bytes, 10) });
    } catch (e) {
      console.error('dbsize error:', e.message);
      return res.status(500).json({ error: e.message });
    }
  }

  const allowed = ['members','gcs','teams','contacts','bids','settings','jobs'];
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
    await sql`CREATE TABLE IF NOT EXISTS app_settings (key TEXT PRIMARY KEY, value JSONB, updated_at TIMESTAMPTZ DEFAULT NOW())`;
    await sql`CREATE TABLE IF NOT EXISTS jobs (
      id TEXT PRIMARY KEY,
      bid_id BIGINT,
      num TEXT,
      name TEXT,
      company TEXT,
      status TEXT DEFAULT 'Active',
      value NUMERIC DEFAULT 0,
      gc_id BIGINT,
      gc_name TEXT,
      contact_id BIGINT,
      contact_name TEXT,
      pm_id BIGINT,
      super_id BIGINT,
      foreman_id BIGINT,
      coord_id BIGINT,
      address TEXT,
      city TEXT,
      zip TEXT,
      start_date TEXT,
      end_date TEXT,
      closed_date TEXT,
      notes TEXT,
      class_code TEXT,
      prelim_closed BOOLEAN DEFAULT false,
      plans_highlighted BOOLEAN DEFAULT false,
      costs JSONB DEFAULT '[]',
      change_orders JSONB DEFAULT '[]',
      cors JSONB DEFAULT '[]',
      sov JSONB DEFAULT '[]',
      sov_months JSONB DEFAULT '[]',
      cor_rates JSONB DEFAULT '{}',
      budget JSONB DEFAULT '{}',
      gc_team JSONB DEFAULT '[]',
      documents JSONB DEFAULT '[]',
      doc_folders JSONB DEFAULT '[]',
      proposal JSONB DEFAULT '{}',
      specifiers JSONB DEFAULT '[]',
      status_paint JSONB DEFAULT '[]',
      status_wc JSONB DEFAULT '[]',
      submittal_paint JSONB DEFAULT '[]',
      submittal_wc JSONB DEFAULT '[]',
      payroll_imports JSONB DEFAULT '[]',
      schedule_pdf TEXT,
      schedule_pdf_name TEXT,
      schedule_pdf_date TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )`;
    // Multi-page tab columns — added via ALTER since the jobs table already exists
    // in production; CREATE TABLE IF NOT EXISTS alone won't add columns to it.
    await sql`ALTER TABLE jobs ADD COLUMN IF NOT EXISTS breakdown_pages JSONB DEFAULT '[]'`;
    await sql`ALTER TABLE jobs ADD COLUMN IF NOT EXISTS alternate_pages JSONB DEFAULT '[]'`;
    await sql`ALTER TABLE jobs ADD COLUMN IF NOT EXISTS field_budget_pages JSONB DEFAULT '[]'`;
    await sql`ALTER TABLE jobs ADD COLUMN IF NOT EXISTS cor_log_pages JSONB DEFAULT '[]'`;
    await sql`ALTER TABLE jobs ADD COLUMN IF NOT EXISTS submittal_pages JSONB DEFAULT '[]'`;
    await sql`ALTER TABLE jobs ADD COLUMN IF NOT EXISTS status_pages JSONB DEFAULT '[]'`;
    await sql`ALTER TABLE jobs ADD COLUMN IF NOT EXISTS tab_custom JSONB DEFAULT '{}'`;
  } catch(e) { console.error('Init error:', e.message); }

  try {
    if (req.method === 'GET') {
      let rows;
      if (table === 'members') rows = await sql`SELECT id,first,last,type,title,series,email,phone,initials,card_bg,card_txt,card_gradient,role,active,last_login,employee_num,company,created_at,(pin_hash IS NOT NULL) AS has_pin FROM members ORDER BY id ASC`;
      else if (table === 'gcs') rows = await sql`SELECT * FROM gcs ORDER BY id ASC`;
      else if (table === 'teams') rows = await sql`SELECT * FROM teams ORDER BY id ASC`;
      else if (table === 'contacts') rows = await sql`SELECT * FROM contacts ORDER BY id ASC`;
      else if (table === 'bids') rows = await sql`SELECT * FROM bids ORDER BY id DESC`;
      else if (table === 'settings') {
        rows = req.query.key
          ? await sql`SELECT * FROM app_settings WHERE key=${req.query.key}`
          : await sql`SELECT * FROM app_settings ORDER BY key ASC`;
      }
      else if (table === 'jobs') rows = await sql`SELECT * FROM jobs ORDER BY created_at ASC`;
      return res.json(rows);
    }

    if (req.method === 'POST') {
      const b = req.body; let rows;
      if (table === 'members') rows = await sql`INSERT INTO members (first,last,type,title,series,email,phone,initials,card_bg,card_txt,card_gradient,role,active,employee_num,company) VALUES (${b.first},${b.last},${b.type},${b.title||''},${b.series||''},${b.email||''},${b.phone||''},${b.initials||null},${b.card_bg||null},${b.card_txt||null},${b.card_gradient||null},${b.role||'employee'},${b.active!==false},${b.employee_num||null},${b.company||null}) RETURNING *`;
      else if (table === 'gcs') rows = await sql`INSERT INTO gcs (name,office,web,logo,street,city,phone,member_ids) VALUES (${b.name},${b.office||''},${b.web||''},${b.logo||''},${b.street||''},${b.city||''},${b.phone||''},${JSON.stringify(b.member_ids||[])}) RETURNING *`;
      else if (table === 'teams') rows = await sql`INSERT INTO teams (gc_id,name) VALUES (${b.gc_id},${b.name}) RETURNING *`;
      else if (table === 'contacts') rows = await sql`INSERT INTO contacts (gc_id,first,last,role,team,email,phone,cell,notes,linkedin,photo) VALUES (${b.gc_id},${b.first},${b.last},${b.role||''},${b.team||''},${b.email||''},${b.phone||''},${b.cell||''},${b.notes||''},${b.linkedin||''},${b.photo||''}) RETURNING *`;
      else if (table === 'bids') rows = await sql`INSERT INTO bids (num,member_id,gc_id,gc_name,contact_id,contact_name,job,value,date,follow_days,decision,status,notes,pdfs,company) VALUES (${b.num||''},${b.member_id||null},${b.gc_id||null},${b.gc_name||''},${b.contact_id||null},${b.contact_name||''},${b.job||''},${b.value||0},${b.date||''},${b.follow_days||7},${b.decision||null},${b.status||'Submitted'},${b.notes||''},${JSON.stringify(b.pdfs||[])},${b.company||'ACI'}) RETURNING *`;
      else if (table === 'settings') rows = await sql`INSERT INTO app_settings (key,value) VALUES (${b.key},${JSON.stringify(b.value)}) ON CONFLICT (key) DO UPDATE SET value=EXCLUDED.value, updated_at=NOW() RETURNING *`;
      else if (table === 'jobs') rows = await sql`INSERT INTO jobs (
          id,bid_id,num,name,company,status,value,gc_id,gc_name,contact_id,contact_name,pm_id,super_id,foreman_id,coord_id,
          address,city,zip,start_date,end_date,closed_date,notes,class_code,prelim_closed,plans_highlighted,
          costs,change_orders,cors,sov,sov_months,cor_rates,budget,gc_team,documents,doc_folders,proposal,specifiers,
          status_paint,status_wc,submittal_paint,submittal_wc,payroll_imports,schedule_pdf,schedule_pdf_name,schedule_pdf_date,
          breakdown_pages,alternate_pages,field_budget_pages,cor_log_pages,submittal_pages,status_pages,tab_custom
        ) VALUES (
          ${b.id},${b.bid_id||null},${b.num||''},${b.name||''},${b.company||'Bonas'},${b.status||'Active'},${b.value||0},
          ${b.gc_id||null},${b.gc_name||''},${b.contact_id||null},${b.contact_name||''},${b.pm_id||null},${b.super_id||null},${b.foreman_id||null},${b.coord_id||null},
          ${b.address||''},${b.city||''},${b.zip||''},${b.start_date||''},${b.end_date||''},${b.closed_date||''},${b.notes||''},${b.class_code||''},${b.prelim_closed||false},${b.plans_highlighted||false},
          ${JSON.stringify(b.costs||[])},${JSON.stringify(b.change_orders||[])},${JSON.stringify(b.cors||[])},${JSON.stringify(b.sov||[])},${JSON.stringify(b.sov_months||[])},${JSON.stringify(b.cor_rates||{})},${JSON.stringify(b.budget||{})},${JSON.stringify(b.gc_team||[])},${JSON.stringify(b.documents||[])},${JSON.stringify(b.doc_folders||[])},${JSON.stringify(b.proposal||{})},${JSON.stringify(b.specifiers||[])},
          ${JSON.stringify(b.status_paint||[])},${JSON.stringify(b.status_wc||[])},${JSON.stringify(b.submittal_paint||[])},${JSON.stringify(b.submittal_wc||[])},${JSON.stringify(b.payroll_imports||[])},${b.schedule_pdf||null},${b.schedule_pdf_name||null},${b.schedule_pdf_date||null},
          ${JSON.stringify(b.breakdown_pages||[])},${JSON.stringify(b.alternate_pages||[])},${JSON.stringify(b.field_budget_pages||[])},${JSON.stringify(b.cor_log_pages||[])},${JSON.stringify(b.submittal_pages||[])},${JSON.stringify(b.status_pages||[])},${JSON.stringify(b.tab_custom||{})}
        )
        ON CONFLICT (id) DO UPDATE SET
          bid_id=EXCLUDED.bid_id,num=EXCLUDED.num,name=EXCLUDED.name,company=EXCLUDED.company,status=EXCLUDED.status,value=EXCLUDED.value,
          gc_id=EXCLUDED.gc_id,gc_name=EXCLUDED.gc_name,contact_id=EXCLUDED.contact_id,contact_name=EXCLUDED.contact_name,pm_id=EXCLUDED.pm_id,super_id=EXCLUDED.super_id,foreman_id=EXCLUDED.foreman_id,coord_id=EXCLUDED.coord_id,
          address=EXCLUDED.address,city=EXCLUDED.city,zip=EXCLUDED.zip,start_date=EXCLUDED.start_date,end_date=EXCLUDED.end_date,closed_date=EXCLUDED.closed_date,notes=EXCLUDED.notes,class_code=EXCLUDED.class_code,prelim_closed=EXCLUDED.prelim_closed,plans_highlighted=EXCLUDED.plans_highlighted,
          costs=EXCLUDED.costs,change_orders=EXCLUDED.change_orders,cors=EXCLUDED.cors,sov=EXCLUDED.sov,sov_months=EXCLUDED.sov_months,cor_rates=EXCLUDED.cor_rates,budget=EXCLUDED.budget,gc_team=EXCLUDED.gc_team,documents=EXCLUDED.documents,doc_folders=EXCLUDED.doc_folders,proposal=EXCLUDED.proposal,specifiers=EXCLUDED.specifiers,
          status_paint=EXCLUDED.status_paint,status_wc=EXCLUDED.status_wc,submittal_paint=EXCLUDED.submittal_paint,submittal_wc=EXCLUDED.submittal_wc,payroll_imports=EXCLUDED.payroll_imports,schedule_pdf=EXCLUDED.schedule_pdf,schedule_pdf_name=EXCLUDED.schedule_pdf_name,schedule_pdf_date=EXCLUDED.schedule_pdf_date,
          breakdown_pages=EXCLUDED.breakdown_pages,alternate_pages=EXCLUDED.alternate_pages,field_budget_pages=EXCLUDED.field_budget_pages,cor_log_pages=EXCLUDED.cor_log_pages,submittal_pages=EXCLUDED.submittal_pages,status_pages=EXCLUDED.status_pages,tab_custom=EXCLUDED.tab_custom,
          updated_at=NOW()
        RETURNING *`;
      return res.json(rows[0]);
    }

    if (req.method === 'PATCH') {
      const b = req.body; const rid = table==='jobs' ? id : parseInt(id); let rows;
      if (table === 'members') rows = await sql`UPDATE members SET first=${b.first},last=${b.last},type=${b.type},title=${b.title||''},series=${b.series||''},email=${b.email||''},phone=${b.phone||''},initials=${b.initials||null},card_bg=${b.card_bg||null},card_txt=${b.card_txt||null},card_gradient=${b.card_gradient||null},role=${b.role||'employee'},active=${b.active!==false},employee_num=${b.employee_num||null},company=${b.company||null} WHERE id=${rid} RETURNING id,first,last,type,title,series,email,phone,initials,card_bg,card_txt,card_gradient,role,active,last_login,employee_num,company,(pin_hash IS NOT NULL) AS has_pin`;
      else if (table === 'gcs') rows = await sql`UPDATE gcs SET name=${b.name},office=${b.office||''},web=${b.web||''},logo=${b.logo||''},street=${b.street||''},city=${b.city||''},phone=${b.phone||''} WHERE id=${rid} RETURNING *`;
      else if (table === 'teams') rows = await sql`UPDATE teams SET name=${b.name} WHERE id=${rid} RETURNING *`;
      else if (table === 'contacts') rows = await sql`UPDATE contacts SET first=${b.first},last=${b.last},role=${b.role||''},team=${b.team||''},email=${b.email||''},phone=${b.phone||''},cell=${b.cell||''},notes=${b.notes||''},linkedin=${b.linkedin||''},photo=${b.photo||''} WHERE id=${rid} RETURNING *`;
      else if (table === 'bids') rows = await sql`UPDATE bids SET num=${b.num||''},member_id=${b.member_id||null},gc_id=${b.gc_id||null},gc_name=${b.gc_name||''},contact_id=${b.contact_id||null},contact_name=${b.contact_name||''},job=${b.job||''},value=${b.value||0},date=${b.date||''},follow_days=${b.follow_days||7},decision=${b.decision||null},status=${b.status||'Submitted'},notes=${b.notes||''},pdfs=${JSON.stringify(b.pdfs||[])},company=${b.company||'ACI'} WHERE id=${rid} RETURNING *`;
      else if (table === 'jobs') rows = await sql`UPDATE jobs SET
          bid_id=${b.bid_id||null},num=${b.num||''},name=${b.name||''},company=${b.company||'Bonas'},status=${b.status||'Active'},value=${b.value||0},
          gc_id=${b.gc_id||null},gc_name=${b.gc_name||''},contact_id=${b.contact_id||null},contact_name=${b.contact_name||''},pm_id=${b.pm_id||null},super_id=${b.super_id||null},foreman_id=${b.foreman_id||null},coord_id=${b.coord_id||null},
          address=${b.address||''},city=${b.city||''},zip=${b.zip||''},start_date=${b.start_date||''},end_date=${b.end_date||''},closed_date=${b.closed_date||''},notes=${b.notes||''},class_code=${b.class_code||''},prelim_closed=${b.prelim_closed||false},plans_highlighted=${b.plans_highlighted||false},
          costs=${JSON.stringify(b.costs||[])},change_orders=${JSON.stringify(b.change_orders||[])},cors=${JSON.stringify(b.cors||[])},sov=${JSON.stringify(b.sov||[])},sov_months=${JSON.stringify(b.sov_months||[])},cor_rates=${JSON.stringify(b.cor_rates||{})},budget=${JSON.stringify(b.budget||{})},gc_team=${JSON.stringify(b.gc_team||[])},documents=${JSON.stringify(b.documents||[])},doc_folders=${JSON.stringify(b.doc_folders||[])},proposal=${JSON.stringify(b.proposal||{})},specifiers=${JSON.stringify(b.specifiers||[])},
          status_paint=${JSON.stringify(b.status_paint||[])},status_wc=${JSON.stringify(b.status_wc||[])},submittal_paint=${JSON.stringify(b.submittal_paint||[])},submittal_wc=${JSON.stringify(b.submittal_wc||[])},payroll_imports=${JSON.stringify(b.payroll_imports||[])},schedule_pdf=${b.schedule_pdf||null},schedule_pdf_name=${b.schedule_pdf_name||null},schedule_pdf_date=${b.schedule_pdf_date||null},
          breakdown_pages=${JSON.stringify(b.breakdown_pages||[])},alternate_pages=${JSON.stringify(b.alternate_pages||[])},field_budget_pages=${JSON.stringify(b.field_budget_pages||[])},cor_log_pages=${JSON.stringify(b.cor_log_pages||[])},submittal_pages=${JSON.stringify(b.submittal_pages||[])},status_pages=${JSON.stringify(b.status_pages||[])},tab_custom=${JSON.stringify(b.tab_custom||{})},
          updated_at=NOW()
        WHERE id=${rid} RETURNING *`;
      return res.json(rows[0]);
    }

    if (req.method === 'DELETE') {
      const rid = table==='jobs' ? id : parseInt(id);
      if (table === 'members') await sql`DELETE FROM members WHERE id=${rid}`;
      else if (table === 'gcs') await sql`DELETE FROM gcs WHERE id=${rid}`;
      else if (table === 'teams') await sql`DELETE FROM teams WHERE id=${rid}`;
      else if (table === 'contacts') await sql`DELETE FROM contacts WHERE id=${rid}`;
      else if (table === 'bids') await sql`DELETE FROM bids WHERE id=${rid}`;
      else if (table === 'jobs') await sql`DELETE FROM jobs WHERE id=${rid}`;
      return res.json({ ok: true });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (e) {
    console.error('API error:', e.message);
    return res.status(500).json({ error: e.message });
  }
}
