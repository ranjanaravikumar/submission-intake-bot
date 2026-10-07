require('dotenv').config({ quiet: true });
const path = require('path');
const fs = require('fs');
const express = require('express');
const multer = require('multer');

const store = require('./store');
const queue = require('./queue');
const { settings, update } = require('./settings');
const { FIELDS, SECTIONS } = require('./fields');
const intake = require('./pipeline/intake');
const pipeline = require('./pipeline');
const { validate } = require('./pipeline/validation');
const followup = require('./pipeline/followup');
const exporter = require('./pipeline/exporter');
const { llmAvailable } = require('./pipeline/extraction');

const app = express();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024, files: 10 } });
const SAMPLES = path.join(__dirname, '..', 'samples');

app.use(express.json({ limit: '2mb' }));
app.use(express.static(path.join(__dirname, '..', 'public')));
app.use('/samples', express.static(SAMPLES));
const FONTS = path.join(__dirname, '..', 'node_modules', '@fontsource');
app.use('/fonts/plex-sans', express.static(path.join(FONTS, 'ibm-plex-sans')));
app.use('/fonts/plex-condensed', express.static(path.join(FONTS, 'ibm-plex-sans-condensed')));
app.use('/fonts/plex-mono', express.static(path.join(FONTS, 'ibm-plex-mono')));

// ---------- helpers ----------
function view(sub) {
  // Send the UI everything except the heavy OCR word lists; include only low-confidence words for highlighting.
  return {
    ...sub,
    documents: sub.documents.map(({ path: _p, ocr, ...d }) => ({
      ...d,
      url: `/api/submissions/${sub.id}/documents/${d.id}/file`,
      ocr: ocr && {
        engine: ocr.engine, confidence: ocr.confidence, text: ocr.text, warning: ocr.warning || null,
        lowWords: [...new Set((ocr.lines || []).flatMap((l) => (l.words || []).filter((w) => w.conf < settings.reviewThreshold).map((w) => w.text)))],
      },
    })),
  };
}

function channelEnabled(res, channel) {
  if (!settings.intakeChannels[channel]?.enabled) {
    res.status(403).json({ error: `The ${channel} channel is turned off in Settings.` });
    return false;
  }
  return true;
}

function start(sub) {
  queue.enqueue(() => pipeline.run(sub));
  return sub;
}

// ---------- intake channels ----------
app.post('/api/submissions', upload.array('files'), async (req, res) => {
  if (!channelEnabled(res, 'upload')) return;
  if (!req.files?.length) return res.status(400).json({ error: 'Add at least one file.' });
  const sub = store.create({ channel: 'upload' });
  await intake.fromFiles(sub, req.files, req.body.note);
  res.status(201).json(view(start(sub)));
});

app.post('/api/submissions/email', upload.single('eml'), async (req, res) => {
  if (!channelEnabled(res, 'email')) return;
  const source = req.file?.buffer || req.body.raw;
  if (!source || !String(source).trim()) return res.status(400).json({ error: 'Drop an .eml file or paste the email.' });
  const sub = store.create({ channel: 'email' });
  await intake.fromEmail(sub, source);
  res.status(201).json(view(start(sub)));
});

// Public API channel, as a partner system (AMS, portal, rater) would call it.
app.post('/api/v1/submissions', upload.array('files'), async (req, res) => {
  if (!channelEnabled(res, 'api')) return;
  if (req.get('x-api-key') !== settings.apiKey) return res.status(401).json({ error: 'Invalid or missing x-api-key header.' });
  if (!req.files?.length) return res.status(400).json({ error: 'Send at least one file in the "files" field.' });
  const sub = store.create({ channel: 'api', from: req.body.source || 'API client', subject: req.body.subject, note: req.body.note });
  await intake.fromFiles(sub, req.files, req.body.note);
  start(sub);
  res.status(202).json({ id: sub.id, reference: sub.ref, status: sub.status, status_url: `/api/v1/submissions/${sub.id}` });
});

app.get('/api/v1/submissions/:id', (req, res) => {
  if (req.get('x-api-key') !== settings.apiKey) return res.status(401).json({ error: 'Invalid or missing x-api-key header.' });
  const sub = store.get(req.params.id);
  if (!sub) return res.status(404).json({ error: 'Submission not found.' });
  res.json({ id: sub.id, reference: sub.ref, status: sub.status, readiness: sub.readiness, issues: sub.issues.map((i) => i.message) });
});

// One-click demo samples, each through a different channel.
app.post('/api/samples/:name', async (req, res) => {
  const read = (f) => fs.promises.readFile(path.join(SAMPLES, f));
  let sub;
  if (req.params.name === 'email-scan') {
    sub = store.create({ channel: 'email' });
    await intake.fromEmail(sub, await read('harborview_submission.eml'));
  } else if (req.params.name === 'upload-pdf') {
    sub = store.create({ channel: 'upload' });
    await intake.fromFiles(sub, [{ originalname: 'pinecrest_acord125.pdf', buffer: await read('pinecrest_acord125.pdf'), mimetype: 'application/pdf' }]);
  } else if (req.params.name === 'api-pdf') {
    const note = 'Roofing contractor, GL only. Please quote by Friday.';
    sub = store.create({ channel: 'api', from: 'Rater integration (API)', subject: 'Summit Ridge Roofing LLC', note });
    await intake.fromFiles(sub, [{ originalname: 'summit_ridge_acord125.pdf', buffer: await read('summit_ridge_acord125.pdf'), mimetype: 'application/pdf' }], note);
  } else {
    return res.status(404).json({ error: 'Unknown sample.' });
  }
  res.status(201).json(view(start(sub)));
});

// ---------- submissions ----------
app.get('/api/submissions', (req, res) => {
  res.json(store.list().map((s) => ({
    id: s.id, ref: s.ref, channel: s.channel, status: s.status, readiness: s.readiness, receivedAt: s.receivedAt,
    name: s.fields.applicant_name?.value || s.subject || s.documents[0]?.name || 'New submission',
    issues: s.issues.filter((i) => i.severity !== 'info').length,
  })));
});

app.get('/api/submissions/:id', (req, res) => {
  const sub = store.get(req.params.id);
  sub ? res.json(view(sub)) : res.status(404).json({ error: 'Submission not found.' });
});

app.get('/api/submissions/:id/documents/:docId/file', (req, res) => {
  const doc = store.get(req.params.id)?.documents.find((d) => d.id === req.params.docId);
  if (!doc) return res.status(404).end();
  res.type(doc.mime).sendFile(doc.path);
});

// Human review: edit or confirm a field.
app.patch('/api/submissions/:id/fields/:key', (req, res) => {
  const sub = store.get(req.params.id);
  if (!sub) return res.status(404).json({ error: 'Submission not found.' });
  if (!FIELDS.some((f) => f.key === req.params.key)) return res.status(400).json({ error: 'Unknown field.' });
  const prev = sub.fields[req.params.key] || {};
  sub.fields[req.params.key] = { ...prev, value: String(req.body.value ?? prev.value ?? ''), confidence: 'verified', method: 'reviewer', source: prev.source || 'Entered by reviewer' };
  sub.conflicts = (sub.conflicts || []).filter((c) => c.key !== req.params.key);
  store.log(sub, `Reviewer confirmed ${req.params.key}`);
  validate(sub, settings);
  sub.steps.export.detail = sub.status === 'ready' ? 'Ready to send' : 'Waiting for review';
  res.json(view(sub));
});

app.post('/api/submissions/:id/followup', async (req, res) => {
  const sub = store.get(req.params.id);
  if (!sub) return res.status(404).json({ error: 'Submission not found.' });
  sub.followup = await followup.draft(sub);
  store.log(sub, 'Drafted follow-up email');
  res.json(sub.followup);
});

app.post('/api/submissions/:id/export', (req, res) => {
  const sub = store.get(req.params.id);
  if (!sub) return res.status(404).json({ error: 'Submission not found.' });
  const payload = exporter.build(sub, settings);
  if (req.body.send) {
    if (sub.status !== 'ready' && sub.status !== 'exported') return res.status(409).json({ error: 'Resolve the flagged items before sending.', payload });
    sub.status = 'exported';
    sub.exported = { at: new Date().toISOString(), destination: payload.destination };
    Object.assign(sub.steps.export, { state: 'done', detail: `Sent to ${payload.destination}` });
    store.log(sub, `Exported to ${payload.destination}`);
  }
  res.json({ payload, submission: view(sub) });
});

// ---------- settings ----------
app.get('/api/meta', (req, res) => res.json({ fields: FIELDS, sections: SECTIONS, llm: llmAvailable() }));
app.get('/api/settings', (req, res) => res.json(settings));
app.put('/api/settings', (req, res) => {
  update(req.body || {});
  pipeline.revalidateAll();
  res.json(settings);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Submission Intake Bot running at http://localhost:${PORT}`);
  console.log(llmAvailable() ? 'LLM extraction: on' : 'LLM extraction: off (no ANTHROPIC_API_KEY). Using the offline layout extractor.');
});
