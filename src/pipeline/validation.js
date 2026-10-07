// Validation agent: plain rules, no AI. Normalizes values, flags missing, invalid, and uncertain fields.
const { FIELDS, FIELD_MAP, US_STATES } = require('../fields');

const pad = (n) => String(n).padStart(2, '0');

function parseDate(raw) {
  const s = String(raw).trim();
  let m = s.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$/);
  if (m) {
    const y = m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3]);
    const d = new Date(y, Number(m[1]) - 1, Number(m[2]));
    return isNaN(d) || d.getMonth() !== Number(m[1]) - 1 ? null : d;
  }
  m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  const t = Date.parse(s);
  return isNaN(t) ? null : new Date(t);
}
const fmtDate = (d) => `${pad(d.getMonth() + 1)}/${pad(d.getDate())}/${d.getFullYear()}`;

function parseMoney(raw) {
  const s = String(raw).replace(/[,$\s]/g, '').toUpperCase();
  const m = s.match(/^(\d+(?:\.\d+)?)(K|M|MM)?$/);
  if (!m) return null;
  const mult = { K: 1e3, M: 1e6, MM: 1e6 }[m[2]] || 1;
  return Math.round(Number(m[1]) * mult);
}

function normalize(field, raw) {
  const v = String(raw ?? '').replace(/\s+/g, ' ').trim();
  switch (field.type) {
    case 'state': {
      const s = v.toUpperCase();
      return US_STATES.includes(s) ? { value: s } : { value: v, error: 'Not a valid two-letter state code' };
    }
    case 'zip':
      return /^\d{5}(-\d{4})?$/.test(v) ? { value: v } : { value: v, error: 'ZIP should be 5 digits' };
    case 'fein': {
      const d = v.replace(/\D/g, '');
      return d.length === 9 ? { value: `${d.slice(0, 2)}-${d.slice(2)}` } : { value: v, error: 'FEIN must be 9 digits' };
    }
    case 'phone': {
      let d = v.replace(/\D/g, '');
      if (d.length === 11 && d[0] === '1') d = d.slice(1);
      return d.length === 10 ? { value: `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}` } : { value: v, error: 'Phone should have 10 digits' };
    }
    case 'email': {
      const e = v.replace(/\s+/g, '').toLowerCase();
      return /^[^@]+@[^@]+\.[a-z]{2,}$/.test(e) ? { value: e } : { value: v, error: 'Not a valid email address' };
    }
    case 'int': {
      const n = parseInt(v.replace(/[^\d]/g, ''), 10);
      return Number.isFinite(n) ? { value: String(n) } : { value: v, error: 'Should be a whole number' };
    }
    case 'money': {
      const n = parseMoney(v);
      return n != null ? { value: `$${n.toLocaleString('en-US')}` } : { value: v, error: 'Should be a dollar amount' };
    }
    case 'naics':
      return /^\d{2,6}$/.test(v.replace(/\s/g, '')) ? { value: v.replace(/\s/g, '') } : { value: v, error: 'NAICS codes are 2 to 6 digits' };
    case 'date': {
      const d = parseDate(v);
      if (!d) return { value: v, error: 'Not a valid date' };
      const today = new Date(); today.setHours(0, 0, 0, 0);
      if (field.future && d < today) return { value: fmtDate(d), error: 'Effective date is in the past' };
      return { value: fmtDate(d) };
    }
    case 'choice': {
      const opt = field.options.find((o) => o.toLowerCase() === v.toLowerCase());
      return opt ? { value: opt } : { value: v, error: `Expected one of: ${field.options.join(', ')}` };
    }
    case 'multi': {
      const picked = field.options.filter((o) => v.toLowerCase().includes(o.toLowerCase()));
      return picked.length ? { value: picked.join(', ') } : { value: v, error: `Expected any of: ${field.options.join(', ')}` };
    }
    default:
      return { value: v };
  }
}

function validate(sub, settings) {
  const issues = [];
  const conflictNotes = Object.fromEntries((sub.conflicts || []).map((c) => [c.key, c.note]));

  for (const def of FIELDS) {
    const required = settings.requiredFields.includes(def.key);
    const f = sub.fields[def.key];
    if (!f || !String(f.value ?? '').trim()) {
      sub.fields[def.key] = { ...(f || {}), value: '', status: required ? 'missing' : 'empty', message: required ? 'Not found in any document' : '' };
      continue;
    }
    const { value, error } = normalize(def, f.value);
    f.value = value;
    f.message = '';
    if (error) { f.status = 'invalid'; f.message = error; }
    else if (f.confidence === 'verified') f.status = 'verified';
    else if (conflictNotes[def.key]) { f.status = 'review'; f.message = conflictNotes[def.key]; }
    else if (f.ocrConfidence != null && f.ocrConfidence < settings.reviewThreshold) {
      f.status = 'review'; f.message = `OCR was only ${f.ocrConfidence}% sure. Check it against the document.`;
    } else if (f.confidence === 'low') { f.status = 'review'; f.message = 'The extractor was unsure. Confirm the value.'; }
    else f.status = 'ok';
  }

  // Cross-field checks
  const eff = parseDate(sub.fields.effective_date?.value || '');
  const exp = parseDate(sub.fields.expiration_date?.value || '');
  if (eff && exp && exp <= eff && sub.fields.expiration_date.status !== 'verified') {
    Object.assign(sub.fields.expiration_date, { status: 'invalid', message: 'Expiration must be after the effective date' });
  }

  for (const def of FIELDS) {
    const f = sub.fields[def.key];
    if (f.status === 'missing') issues.push({ key: def.key, severity: 'error', message: `${def.label} is missing` });
    if (f.status === 'invalid') issues.push({ key: def.key, severity: 'error', message: `${def.label}: ${f.message}` });
    if (f.status === 'review') issues.push({ key: def.key, severity: 'warning', message: `${def.label}: ${f.message}` });
  }

  if (settings.appetite.enabled) {
    const st = sub.fields.mailing_state?.value;
    if (st && !settings.appetite.states.includes(st)) {
      issues.push({ key: 'mailing_state', severity: 'warning', message: `Outside appetite: ${st} is not a state we write in` });
    }
  }
  for (const d of sub.documents) {
    if (d.docType && !d.supported) issues.push({ key: null, severity: 'info', message: `${d.name} was classified as ${d.docLabel}, which isn't enabled yet` });
    if (d.ocr?.warning) issues.push({ key: null, severity: 'info', message: `${d.name}: ${d.ocr.warning}` });
  }

  const req = settings.requiredFields;
  const okCount = req.filter((k) => ['ok', 'verified'].includes(sub.fields[k]?.status)).length;
  sub.readiness = req.length ? Math.round((okCount / req.length) * 100) : 100;
  sub.issues = issues;
  const blockers = issues.filter((i) => i.severity === 'error' || (i.severity === 'warning' && i.key && sub.fields[i.key]?.status === 'review'));
  if (sub.status !== 'exported') sub.status = blockers.length ? 'needs_review' : 'ready';
  return { blockers: blockers.length };
}

module.exports = { validate, normalize, FIELD_MAP };
