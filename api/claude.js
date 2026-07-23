import Anthropic from '@anthropic-ai/sdk';

// Two read-only/assistive Claude features — see index.html for callers:
//   task: 'ask'               — natural-language Q&A over a summary of job data
//   task: 'draft_description' — draft a COR/EWO "description of work" from rough
//                               notes and/or job-site photos
// Both are draft/answer-only: nothing here writes to the jobs database.
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const client = new Anthropic();
  const { task } = req.body || {};

  try {
    if (task === 'ask') {
      const { question, context } = req.body;
      if (!question || !question.trim()) return res.status(400).json({ error: 'question required' });
      const response = await client.messages.create({
        model: 'claude-opus-4-8',
        max_tokens: 2048,
        system: 'You are a read-only assistant embedded in Fieldstack, a job-tracking tool for a commercial painting contractor. ' +
          'Answer the question using ONLY the JOB DATA provided below — never invent job names, numbers, dates, or dollar amounts that are not present in it. ' +
          'If the data does not contain the answer, say so plainly instead of guessing. Be concise. Format dollar amounts as $X,XXX. ' +
          'You cannot make any changes to jobs, CORs, budgets, or any other data — if asked to change something, explain that you can only answer questions here.\n\n' +
          'JOB DATA (JSON):\n' + (context || '[]'),
        messages: [{ role: 'user', content: question }],
      });
      const text = response.content.filter(b => b.type === 'text').map(b => b.text).join('\n');
      return res.json({ text });
    }

    if (task === 'draft_description') {
      const { notes, images } = req.body;
      const hasImages = Array.isArray(images) && images.length > 0;
      if ((!notes || !notes.trim()) && !hasImages) {
        return res.status(400).json({ error: 'notes or images required' });
      }
      const content = [];
      if (hasImages) {
        images.slice(0, 5).forEach(dataUrl => {
          const m = /^data:(image\/[a-zA-Z]+);base64,(.+)$/.exec(dataUrl || '');
          if (m) content.push({ type: 'image', source: { type: 'base64', media_type: m[1], data: m[2] } });
        });
      }
      content.push({
        type: 'text',
        text: notes && notes.trim()
          ? 'Rough notes from the field: ' + notes.trim()
          : 'Write a description of the work shown in these job-site photos.',
      });
      const response = await client.messages.create({
        model: 'claude-opus-4-8',
        max_tokens: 512,
        system: 'You write the "Description of work" text on Change Order Requests (CORs) and Extra Work Orders (EWOs) ' +
          'for a commercial painting contractor. Given rough field notes and/or job-site photos, write a factual, ' +
          'professional description in 2-4 sentences suitable to send to a general contractor. ' +
          'Only describe what is stated in the notes or clearly visible in the photos — never invent quantities, ' +
          'materials, causes, or root-cause explanations that are not given. Do not include pricing or dollar amounts. ' +
          'Return only the description text, with no preamble, heading, or quotation marks.',
        messages: [{ role: 'user', content }],
      });
      const text = response.content.filter(b => b.type === 'text').map(b => b.text).join('\n');
      return res.json({ text });
    }

    return res.status(400).json({ error: 'Unknown task' });
  } catch (e) {
    console.error('Claude API error:', e.message);
    return res.status(500).json({ error: e.message });
  }
}
