import { neon } from '@neondatabase/serverless';
import crypto from 'crypto';

const MAX_ATTEMPTS = 5;
const LOCKOUT_MINUTES = 15;

function hashPin(pin, salt) {
  return crypto.createHash('sha256').update(salt + ':' + pin).digest('hex');
}
function legacyHashPin(pin) {
  // Matches the old client-side scheme (static salt) so existing PINs keep working
  // through this endpoint; they get upgraded to a real per-user salt on first success.
  return crypto.createHash('sha256').update('bidsum-salt-' + pin).digest('hex');
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const sql = neon(process.env.DATABASE_URL);
  const { action } = req.query;
  const b = req.body || {};

  try {
    await sql`ALTER TABLE members ADD COLUMN IF NOT EXISTS pin_salt TEXT`;
    await sql`ALTER TABLE members ADD COLUMN IF NOT EXISTS pin_fail_count INT DEFAULT 0`;
    await sql`ALTER TABLE members ADD COLUMN IF NOT EXISTS pin_locked_until TIMESTAMPTZ`;
  } catch (e) { console.error('Auth init error:', e.message); }

  try {
    // Set a brand-new PIN (first-time setup, or after a manager reset)
    if (action === 'set-pin') {
      const { memberId, pin } = b;
      if (!memberId || !pin || String(pin).length < 4) return res.status(400).json({ error: 'Invalid request' });
      const salt = crypto.randomBytes(16).toString('hex');
      const hash = hashPin(String(pin), salt);
      const token = crypto.randomUUID();
      await sql`UPDATE members SET pin_hash=${hash}, pin_salt=${salt}, pin_token=${token}, pin_fail_count=0, pin_locked_until=NULL, last_login=NOW() WHERE id=${memberId}`;
      return res.json({ ok: true, token });
    }

    // Verify a PIN at login
    if (action === 'verify-pin') {
      const { memberId, pin } = b;
      if (!memberId || !pin) return res.status(400).json({ error: 'Invalid request' });
      const rows = await sql`SELECT pin_hash, pin_salt, pin_fail_count, pin_locked_until FROM members WHERE id=${memberId} AND active IS NOT FALSE`;
      const m = rows[0];
      if (!m) return res.status(404).json({ ok: false, error: 'Account not found' });

      if (m.pin_locked_until && new Date(m.pin_locked_until) > new Date()) {
        const mins = Math.ceil((new Date(m.pin_locked_until) - new Date()) / 60000);
        return res.status(423).json({ ok: false, locked: true, error: `Too many attempts. Try again in ${mins} minute${mins === 1 ? '' : 's'}.` });
      }

      const salted = m.pin_salt ? hashPin(String(pin), m.pin_salt) : null;
      const legacy = !m.pin_salt ? legacyHashPin(String(pin)) : null;
      const matches = (m.pin_salt && salted === m.pin_hash) || (!m.pin_salt && legacy === m.pin_hash);

      if (!matches) {
        const failCount = (m.pin_fail_count || 0) + 1;
        if (failCount >= MAX_ATTEMPTS) {
          const lockUntil = new Date(Date.now() + LOCKOUT_MINUTES * 60000).toISOString();
          await sql`UPDATE members SET pin_fail_count=${failCount}, pin_locked_until=${lockUntil} WHERE id=${memberId}`;
          return res.status(423).json({ ok: false, locked: true, error: `Too many attempts. Try again in ${LOCKOUT_MINUTES} minutes.` });
        }
        await sql`UPDATE members SET pin_fail_count=${failCount} WHERE id=${memberId}`;
        return res.status(401).json({ ok: false, error: 'Incorrect PIN.', attemptsLeft: MAX_ATTEMPTS - failCount });
      }

      const token = crypto.randomUUID();
      if (!m.pin_salt) {
        // Upgrade legacy unsalted hash to a real per-user salt now that we know the PIN
        const newSalt = crypto.randomBytes(16).toString('hex');
        const newHash = hashPin(String(pin), newSalt);
        await sql`UPDATE members SET pin_hash=${newHash}, pin_salt=${newSalt}, pin_token=${token}, pin_fail_count=0, pin_locked_until=NULL, last_login=NOW() WHERE id=${memberId}`;
      } else {
        await sql`UPDATE members SET pin_token=${token}, pin_fail_count=0, pin_locked_until=NULL, last_login=NOW() WHERE id=${memberId}`;
      }
      return res.json({ ok: true, token });
    }

    // Validate a "remember me" token server-side (never expose pin_token to the client)
    if (action === 'verify-token') {
      const { memberId, token } = b;
      if (!memberId || !token) return res.status(400).json({ error: 'Invalid request' });
      const rows = await sql`SELECT pin_token FROM members WHERE id=${memberId} AND active IS NOT FALSE`;
      const m = rows[0];
      if (m && m.pin_token && m.pin_token === token) return res.json({ ok: true });
      return res.status(401).json({ ok: false });
    }

    // Manager action: clear a lockout without needing a developer
    if (action === 'reset-lockout') {
      const { memberId } = b;
      if (!memberId) return res.status(400).json({ error: 'Invalid request' });
      await sql`UPDATE members SET pin_fail_count=0, pin_locked_until=NULL WHERE id=${memberId}`;
      return res.json({ ok: true });
    }

    // Manager action: fully reset a member's PIN (also clears any lockout) so they set a new one at next login
    if (action === 'admin-reset-pin') {
      const { memberId } = b;
      if (!memberId) return res.status(400).json({ error: 'Invalid request' });
      await sql`UPDATE members SET pin_hash=NULL, pin_salt=NULL, pin_token=NULL, pin_fail_count=0, pin_locked_until=NULL WHERE id=${memberId}`;
      return res.json({ ok: true });
    }

    return res.status(400).json({ error: 'Unknown action' });
  } catch (e) {
    console.error('Auth API error:', e.message);
    return res.status(500).json({ error: e.message });
  }
}
