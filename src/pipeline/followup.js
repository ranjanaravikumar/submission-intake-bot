// Follow-up agent: drafts the "we need a few things" email back to the agent.
const { FIELD_MAP } = require('../fields');
const llm = require('./extraction/llm');

function templateDraft(sub, items) {
  const f = (k) => sub.fields[k]?.value;
  const first = (f('producer') || '').split(/\s+/)[0] || 'there';
  const insured = (f('applicant_name') || 'your client').replace(/\.$/, '');
  const lines = items.map((i) => `- ${i}`).join('\n');
  return {
    to: f('agency_email') || sub.from || '',
    subject: `Re: ${sub.subject || `Submission for ${insured}`} - a few items needed`,
    body: `Hi ${first},\n\nThanks for sending the submission for ${insured}. Before we can quote, we need:\n\n${lines}\n\nOnce we have these, it goes straight to underwriting.\n\nThanks,\nSubmissions team`,
  };
}

async function draft(sub) {
  const items = [];
  for (const [key, fld] of Object.entries(sub.fields)) {
    const label = FIELD_MAP[key]?.label || key;
    if (fld.status === 'missing') items.push(`${label} (not included in the application)`);
    if (fld.status === 'invalid') items.push(`${label} (${fld.message.toLowerCase()})`);
    if (fld.status === 'review' && (sub.conflicts || []).some((c) => c.key === key)) items.push(`${label}: ${fld.message}`);
  }
  if (!items.length) items.push('Nothing is missing. This submission is complete.');
  const base = templateDraft(sub, items);
  if (!llm.available()) return { ...base, engine: 'template' };
  try {
    const body = await Promise.race([
      llm.complete(`Rewrite this email from an insurance carrier's submissions team to an agent so it is warm, brief, and specific. Keep every requested item. Return only the email body.\n\n${base.body}`),
      new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), 12000)),
    ]);
    return { ...base, body, engine: 'llm' };
  } catch {
    return { ...base, engine: 'template' };
  }
}

module.exports = { draft };
