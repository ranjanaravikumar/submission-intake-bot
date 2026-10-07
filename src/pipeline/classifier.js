// Classifier agent. Rules first: ACORD forms print their form number, so text matching is reliable.
const RULES = [
  { type: 'acord_125', test: /ACORD\s*125|COMMERCIAL INSURANCE APPLICATION/i, why: 'Found the ACORD 125 form title' },
  { type: 'acord_126', test: /ACORD\s*126|GENERAL LIABILITY SECTION/i, why: 'Found the ACORD 126 form title' },
  { type: 'acord_127', test: /ACORD\s*127|BUSINESS AUTO SECTION/i, why: 'Found the ACORD 127 form title' },
  { type: 'acord_130', test: /ACORD\s*130|WORKERS COMPENSATION APPLICATION/i, why: 'Found the ACORD 130 form title' },
  { type: 'acord_140', test: /ACORD\s*140|PROPERTY SECTION/i, why: 'Found the ACORD 140 form title' },
  { type: 'loss_run', test: /LOSS RUN|LOSS HISTORY REPORT|CLAIMS? (HISTORY|LISTING)|VALUED AS OF/i, why: 'Looks like a carrier loss run' },
  { type: 'sov', test: /STATEMENT OF VALUES|SCHEDULE OF VALUES/i, why: 'Looks like a statement of values' },
];

function classify(doc, settings) {
  let type = 'other';
  let why = 'No known form or document pattern found';
  if (doc.kind === 'email_body' || doc.kind === 'note') {
    type = 'email_body'; why = doc.kind === 'note' ? 'Note sent with the API request' : 'Body of the submission email';
  } else {
    const hit = RULES.find((r) => r.test.test(doc.ocr?.text || ''));
    if (hit) { type = hit.type; why = hit.why; }
  }
  const conf = settings.supportedDocuments[type];
  return {
    docType: type,
    docLabel: conf ? conf.code : 'Other',
    reason: why,
    supported: Boolean(conf && conf.enabled),
    supportStatus: conf ? conf.status : 'unsupported',
  };
}

module.exports = { classify };
