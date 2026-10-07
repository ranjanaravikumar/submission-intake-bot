// Offline extractor: reads the form's layout (label line, then value line underneath)
// and assigns values to labels by column position. No API key needed.
const { FIELDS } = require('../../fields');

const norm = (s) => String(s).toUpperCase().replace(/[^A-Z0-9-]/g, '');
const LABELS = FIELDS.filter((f) => f.formLabel)
  .map((f) => ({ field: f, tokens: f.formLabel.split(/\s+/).map(norm).filter(Boolean) }))
  .sort((a, b) => b.tokens.length - a.tokens.length);

function findLabels(line) {
  const words = line.words || [];
  const n = words.map((w) => norm(w.text));
  const found = [];
  let covered = 0;
  for (let i = 0; i < n.length;) {
    const def = LABELS.find((d) => d.tokens.every((t, j) => n[i + j] === t));
    if (def) { found.push({ def, x0: words[i].x0 }); covered += def.tokens.length; i += def.tokens.length; } else i += 1;
  }
  const isLabelLine = found.length > 0 && covered / Math.max(1, n.filter(Boolean).length) >= 0.6;
  return { found, isLabelLine };
}

function confLabel(conf, threshold) {
  if (conf == null) return 'medium';
  if (conf >= 90) return 'high';
  return conf >= threshold ? 'medium' : 'low';
}

function parseChecks(line, options) {
  const upper = line.text.toUpperCase();
  const hits = options
    .map((opt) => ({ opt, idx: upper.search(new RegExp(`${opt.toUpperCase().replace(/\s+/g, '\\s+')}\\b`)) }))
    .filter((h) => h.idx >= 0)
    .sort((a, b) => a.idx - b.idx);
  const selected = [];
  let prevEnd = 0;
  for (const h of hits) {
    const before = upper.slice(prevEnd, h.idx);
    if (/X/.test(before)) {
      const first = norm(h.opt.split(/\s+/)[0]);
      const word = line.words.find((w) => norm(w.text).includes(first));
      selected.push({ opt: h.opt, conf: word ? word.conf : null });
    }
    prevEnd = h.idx + h.opt.length;
  }
  return selected;
}

function extractFromForm(doc, threshold) {
  const lines = (doc.ocr?.lines || []).filter((l) => l.words && l.words.length);
  const tol = (doc.ocr?.pageWidth || 612) * 0.012;
  const out = {};
  for (let k = 0; k < lines.length; k++) {
    const { found, isLabelLine } = findLabels(lines[k]);
    if (!isLabelLine) continue;
    const next = lines[k + 1];
    if (!next || findLabels(next).isLabelLine) continue; // whole row left blank
    found.sort((a, b) => a.x0 - b.x0);
    found.forEach((lab, j) => {
      const f = lab.def.field;
      if (f.options) {
        const sel = parseChecks(next, f.options);
        if (!sel.length) return;
        const conf = Math.min(...sel.map((s) => s.conf ?? 100));
        out[f.key] = {
          value: f.type === 'multi' ? sel.map((s) => s.opt).join(', ') : sel[0].opt,
          source: `${f.formLabel}: ${next.text}`, docId: doc.id, ocrConfidence: conf,
          confidence: confLabel(conf, threshold), method: 'layout',
        };
        return;
      }
      const start = lab.x0 - tol;
      const end = j + 1 < found.length ? found[j + 1].x0 - tol : Infinity;
      const words = next.words.filter((w) => w.x0 >= start && w.x0 < end);
      if (!words.length) return;
      const value = words.map((w) => w.text).join(' ').trim();
      const conf = Math.min(...words.map((w) => w.conf));
      out[f.key] = {
        value, source: `${f.formLabel}: ${value}`, docId: doc.id, ocrConfidence: conf,
        confidence: confLabel(conf, threshold), method: 'layout',
      };
    });
  }
  return out;
}

// Light rules for free-text emails when no LLM is available.
function extractFromEmail(doc) {
  const text = doc.ocr?.text || '';
  const out = {};
  const put = (key, value, source) => { if (value) out[key] = { value, source, docId: doc.id, confidence: 'medium', method: 'rules' }; };
  const eff = text.match(/effective(?:\s+date)?(?:\s+(?:of|on))?\s+(\d{1,2}\/\d{1,2}\/\d{2,4})/i);
  if (eff) put('effective_date', eff[1], eff[0]);
  const lob = [];
  if (/general liability|\bGL\b/i.test(text)) lob.push('General liability');
  if (/\bproperty\b/i.test(text)) lob.push('Property');
  if (/business auto|commercial auto/i.test(text)) lob.push('Business auto');
  if (/workers'? comp/i.test(text)) lob.push('Workers comp');
  if (/umbrella/i.test(text)) lob.push('Umbrella');
  if (lob.length) put('lines_of_business', lob.join(', '), 'Mentioned in email');
  const yrs = text.match(/(\d{1,3})\s+years in business/i);
  if (yrs) put('years_in_business', yrs[1], yrs[0]);
  return out;
}

function extract(docs, threshold) {
  const fields = {};
  // Forms first (most authoritative), then emails fill any gaps.
  for (const d of docs.filter((x) => x.docType !== 'email_body')) Object.assign(fields, extractFromForm(d, threshold));
  for (const d of docs.filter((x) => x.docType === 'email_body')) {
    for (const [k, v] of Object.entries(extractFromEmail(d))) if (!fields[k]) fields[k] = v;
  }
  return { fields, conflicts: [], summary: null, engine: 'layout' };
}

module.exports = { extract };
