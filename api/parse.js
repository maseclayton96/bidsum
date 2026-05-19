export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { type, data, filename } = req.body;

  try {
    if (type === 'pdf') {
      // Parse bid PDF via Claude API server-side
      const prompt = `Extract bid information from this proposal PDF and return ONLY a JSON object:
{
  "bidNum": "bid number only e.g. 3100",
  "gcName": "general contractor / customer company name",
  "contactFirst": "contact first name from ATTN field",
  "contactLast": "contact last name from ATTN field",
  "jobName": "project name",
  "value": 7952,
  "date": "YYYY-MM-DD format",
  "notes": "key exclusions in one short sentence"
}
Return ONLY valid JSON, no markdown.`;

      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': process.env.ANTHROPIC_API_KEY,
          'anthropic-version': '2023-06-01'
        },
        body: JSON.stringify({
          model: 'claude-sonnet-4-20250514',
          max_tokens: 500,
          messages: [{
            role: 'user',
            content: [
              { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data } },
              { type: 'text', text: prompt }
            ]
          }]
        })
      });

      const result = await response.json();
      if (!response.ok) throw new Error(result.error?.message || 'Claude API error');
      const text = result.content.map(c => c.text || '').join('').replace(/```json|```/g, '').trim();
      const parsed = JSON.parse(text);
      return res.json({ ok: true, data: parsed });
    }

    if (type === 'signature') {
      // Parse signature block text via Claude
      const prompt = `Extract contact info from this email signature block and return ONLY a JSON object:
{
  "first": "first name",
  "last": "last name",
  "title": "job title",
  "company": "company name",
  "email": "email address",
  "phone": "office/direct phone",
  "cell": "mobile/cell phone",
  "linkedin": "linkedin URL if present"
}
Signature text:
${data}
Return ONLY valid JSON, no markdown.`;

      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': process.env.ANTHROPIC_API_KEY,
          'anthropic-version': '2023-06-01'
        },
        body: JSON.stringify({
          model: 'claude-sonnet-4-20250514',
          max_tokens: 400,
          messages: [{ role: 'user', content: prompt }]
        })
      });

      const result = await response.json();
      if (!response.ok) throw new Error(result.error?.message || 'Claude API error');
      const text = result.content.map(c => c.text || '').join('').replace(/```json|```/g, '').trim();
      const parsed = JSON.parse(text);
      return res.json({ ok: true, data: parsed });
    }

    return res.status(400).json({ error: 'Unknown parse type' });
  } catch (e) {
    console.error('Parse error:', e.message);
    return res.status(500).json({ error: e.message });
  }
}
