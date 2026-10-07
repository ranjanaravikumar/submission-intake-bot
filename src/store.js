// In-memory submission store. Replace with Postgres or Mongo for persistence.
const crypto = require('crypto');

const submissions = new Map();
let counter = 1040;

const STEP_IDS = ['intake', 'ocr', 'classify', 'extract', 'validate', 'export'];

function create({ channel, from, subject, note }) {
  const id = crypto.randomUUID();
  const sub = {
    id,
    ref: `SUB-${++counter}`,
    channel,
    from: from || null,
    subject: subject || null,
    note: note || null,
    receivedAt: new Date().toISOString(),
    status: 'processing',
    steps: Object.fromEntries(STEP_IDS.map((s) => [s, { state: 'pending', detail: '' }])),
    documents: [],
    fields: {},
    conflicts: [],
    issues: [],
    readiness: 0,
    summary: null,
    extraction: null,
    followup: null,
    exported: null,
    history: [],
  };
  submissions.set(id, sub);
  return sub;
}

const get = (id) => submissions.get(id);
const list = () => [...submissions.values()].sort((a, b) => b.receivedAt.localeCompare(a.receivedAt));

function log(sub, message) {
  sub.history.push({ at: new Date().toISOString(), message });
}

module.exports = { create, get, list, log, STEP_IDS };
