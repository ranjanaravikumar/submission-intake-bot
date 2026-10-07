// Extraction agent: LLM when an API key is set, offline layout reader otherwise.
// Afterwards, every value is checked against the OCR word confidences (the hybrid step).
const llm = require('./llm');
const layout = require('./layout');

const tokenize = (s) => String(s).toLowerCase().split(/\s+/).map((t) => t.replace(/[^a-z0-9@]/g, '')).filter((t) => t.length >= 2);

function ocrConfidenceFor(value, doc) {
  const words = (doc?.ocr?.lines || []).flatMap((l) => l.words || []);
  if (!words.length || doc.ocr.engine === 'pdf-text' || doc.ocr.engine === 'plain-text') return null;
  const normWords = words.map((w) => ({ t: tokenize(w.text).join(''), conf: w.conf }));
  const confs = [];
  for (const tok of tokenize(value)) {
    const hit = normWords.find((w) => w.t === tok) || normWords.find((w) => w.t.includes(tok) && tok.length >= 3);
    if (hit) confs.push(hit.conf);
  }
  return confs.length ? Math.min(...confs) : null;
}

async function extract(docs, threshold) {
  let result;
  let fallbackReason = null;
  if (llm.available()) {
    try { result = await llm.extract(docs); } catch (err) { fallbackReason = err.message; }
  }
  if (!result) result = layout.extract(docs, threshold);
  if (fallbackReason) result.fallbackReason = fallbackReason;

  for (const f of Object.values(result.fields)) {
    if (f.ocrConfidence == null) f.ocrConfidence = ocrConfidenceFor(f.value, docs.find((d) => d.id === f.docId));
    if (f.ocrConfidence != null && f.ocrConfidence < threshold) f.confidence = 'low';
  }
  return result;
}

module.exports = { extract, llmAvailable: llm.available };
