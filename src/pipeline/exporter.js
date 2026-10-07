// Export agent: builds the ACORD-aligned payload an AMS or carrier system would consume.
const { FIELDS } = require('../fields');

function setPath(obj, path, value) {
  const parts = path.split('.');
  let cur = obj;
  parts.slice(0, -1).forEach((p) => { cur = cur[p] ||= {}; });
  cur[parts.at(-1)] = value;
}

function build(sub, settings) {
  const data = {};
  for (const def of FIELDS) {
    const f = sub.fields[def.key];
    if (!f || !f.value) continue;
    const value = def.type === 'multi' ? f.value.split(/,\s*/) : f.value;
    setPath(data, def.acord, value);
  }
  return {
    standard: 'ACORD 125 aligned (demo schema)',
    destination: settings.outputDestinations[settings.outputDestination].label,
    submission: { id: sub.id, reference: sub.ref, receivedVia: sub.channel, receivedAt: sub.receivedAt, from: sub.from, subject: sub.subject },
    ...data,
    documents: sub.documents.map((d) => ({ name: d.name, type: d.docLabel, ocrEngine: d.ocr?.engine, ocrConfidence: d.ocr?.confidence })),
    review: {
      readiness: sub.readiness,
      verifiedByReviewer: Object.entries(sub.fields).filter(([, f]) => f.status === 'verified').map(([k]) => k),
      openIssues: sub.issues.map((i) => i.message),
    },
  };
}

module.exports = { build };
