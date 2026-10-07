// Orchestrator: runs each agent in order and records step status for the UI.
const { settings } = require('../settings');
const store = require('../store');
const { runOCR } = require('./ocr');
const { classify } = require('./classifier');
const extraction = require('./extraction');
const { validate } = require('./validation');

const MIN_STEP_MS = Number(process.env.MIN_STEP_MS || 500); // keeps the step animation readable in demos
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function step(sub, id, fn) {
  const s = sub.steps[id];
  s.state = 'running'; s.detail = '';
  const t0 = Date.now();
  try {
    const detail = await fn();
    const left = MIN_STEP_MS - (Date.now() - t0);
    if (left > 0) await sleep(left);
    Object.assign(s, { state: 'done', detail: detail || '', ms: Date.now() - t0 });
  } catch (err) {
    Object.assign(s, { state: 'error', detail: err.message, ms: Date.now() - t0 });
    throw err;
  }
}

async function run(sub) {
  try {
    await step(sub, 'intake', async () => {
      const n = sub.documents.length;
      if (!n) throw new Error('No documents or email body received');
      return `${n} document${n > 1 ? 's' : ''} via ${sub.channel}`;
    });

    await step(sub, 'ocr', async () => {
      const scanned = [];
      for (const doc of sub.documents) {
        doc.ocr = await runOCR(doc, settings.ocrEngine);
        if (doc.ocr.engine !== 'plain-text' && doc.ocr.engine !== 'pdf-text') scanned.push(doc.ocr.confidence);
      }
      if (!scanned.length) return 'Read text layer, no scanning needed';
      const avg = Math.round(scanned.reduce((a, b) => a + b, 0) / scanned.length);
      return `${scanned.length} scan${scanned.length > 1 ? 's' : ''} read, ${avg}% confidence`;
    });

    await step(sub, 'classify', async () => {
      for (const doc of sub.documents) Object.assign(doc, classify(doc, settings));
      return sub.documents.map((d) => d.docLabel).join(' + ');
    });

    await step(sub, 'extract', async () => {
      const docs = sub.documents.filter((d) => d.supported && d.ocr?.text?.trim());
      if (!docs.length) throw new Error('No supported documents to extract from');
      const result = await extraction.extract(docs, settings.reviewThreshold);
      sub.fields = result.fields;
      sub.conflicts = result.conflicts;
      sub.summary = result.summary;
      sub.extraction = { engine: result.engine, fallbackReason: result.fallbackReason || null };
      return `${Object.keys(result.fields).length} fields found`;
    });

    let finalStatus;
    await step(sub, 'validate', async () => {
      const { blockers } = validate(sub, settings);
      finalStatus = sub.status;
      sub.status = 'processing'; // stay "processing" until the step is marked done, so the UI keeps polling
      return blockers ? `${blockers} item${blockers > 1 ? 's' : ''} need attention` : 'All checks passed';
    });
    sub.status = finalStatus;

    sub.steps.export.detail = sub.status === 'ready' ? 'Ready to send' : 'Waiting for review';
    store.log(sub, `Processed: ${sub.status === 'ready' ? 'ready to send' : 'needs review'}`);
  } catch (err) {
    sub.status = 'failed';
    store.log(sub, `Failed: ${err.message}`);
  }
}

function revalidateAll() {
  for (const sub of store.list()) {
    if (sub.status === 'processing' || sub.status === 'failed') continue;
    validate(sub, settings);
    if (sub.status !== 'exported') sub.steps.export.detail = sub.status === 'ready' ? 'Ready to send' : 'Waiting for review';
  }
}

module.exports = { run, revalidateAll };
