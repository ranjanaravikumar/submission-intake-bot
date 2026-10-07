// LLM extractor: reads every supported document together and returns ACORD-aligned fields,
// the text each value came from, and any conflicts between documents.
const Anthropic = require('@anthropic-ai/sdk');
const { FIELDS } = require('../../fields');

const MODEL = process.env.ANTHROPIC_MODEL || 'claude-sonnet-5';
let client = null;
const available = () => Boolean(process.env.ANTHROPIC_API_KEY);
const getClient = () => (client ||= new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY }));

const KEYS = FIELDS.map((f) => f.key);
const catalog = FIELDS.map((f) => `- ${f.key}: ${f.label}${f.options ? ` (one of: ${f.options.join(', ')}${f.type === 'multi' ? '; comma-separate multiple' : ''})` : ''}`).join('\n');

const SYSTEM = `You are the extraction agent in a commercial insurance submission intake system.
You receive OCR text from submission documents (ACORD 125 applications, loss runs, and the agent's email).
Extract values for the field keys listed below.

Rules:
- Only extract values that literally appear in the documents. Never guess or infer. Omit fields you cannot find.
- OCR text puts form labels on one line and the typed values on the line below, in the same column order.
- On checkbox rows, a selected box appears as X, [X], X], XI or similar right before the option name. Empty boxes look like [], [J or nothing.
- Dates as MM/DD/YYYY. Money as digits with $ (e.g. $1,450,000). Keep names and addresses exactly as written.
- source_text is the short snippet the value came from. source_document is the document id.
- confidence is "low" if the OCR text around the value looks garbled or ambiguous.
- If two documents disagree on a value (for example the email and the form), put the form value in fields and also add a conflict.

Field keys:
${catalog}`;

const TOOL = {
  name: 'record_submission',
  description: 'Record the extracted submission fields.',
  input_schema: {
    type: 'object',
    properties: {
      fields: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            key: { type: 'string', enum: KEYS },
            value: { type: 'string' },
            source_document: { type: 'string' },
            source_text: { type: 'string' },
            confidence: { type: 'string', enum: ['high', 'medium', 'low'] },
          },
          required: ['key', 'value', 'source_document', 'source_text', 'confidence'],
        },
      },
      conflicts: {
        type: 'array',
        items: {
          type: 'object',
          properties: { key: { type: 'string', enum: KEYS }, note: { type: 'string' } },
          required: ['key', 'note'],
        },
      },
      summary: { type: 'string', description: 'One plain sentence describing the risk for an underwriter.' },
    },
    required: ['fields', 'conflicts', 'summary'],
  },
};

async function extract(docs) {
  const content = docs.map((d) => `<document id="${d.id}" type="${d.docLabel}" name="${d.name}">\n${d.ocr.text}\n</document>`).join('\n\n');
  const res = await getClient().messages.create({
    model: MODEL,
    max_tokens: 4000,
    system: SYSTEM,
    tools: [TOOL],
    tool_choice: { type: 'tool', name: TOOL.name },
    messages: [{ role: 'user', content }],
  });
  const block = res.content.find((b) => b.type === 'tool_use');
  if (!block) throw new Error('The model did not return structured fields.');
  const fields = {};
  for (const f of block.input.fields || []) {
    if (!f.value || fields[f.key]) continue;
    fields[f.key] = { value: f.value, source: f.source_text, docId: f.source_document, confidence: f.confidence, method: 'llm' };
  }
  return { fields, conflicts: block.input.conflicts || [], summary: block.input.summary || null, engine: `llm (${MODEL})` };
}

async function complete(prompt, maxTokens = 600) {
  const res = await getClient().messages.create({ model: MODEL, max_tokens: maxTokens, messages: [{ role: 'user', content: prompt }] });
  return res.content.filter((b) => b.type === 'text').map((b) => b.text).join('').trim();
}

module.exports = { extract, complete, available, MODEL };
