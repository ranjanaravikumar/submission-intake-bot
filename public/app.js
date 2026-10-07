// Intake Desk frontend. Plain JavaScript, no build step.
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const state = { meta: null, settings: null, inbox: [], currentId: null, current: null, docId: null, view: 'original', channel: 'upload', steps: {}, files: [], eml: null };

const ROLE_COPY = {
  carrier: { tagline: 'Incoming submissions, read and checked before underwriting', inbox: 'Incoming submissions', send: 'Send to underwriting', sent: 'Sent to underwriting' },
  agency: { tagline: 'Client applications, cleaned up before they go to carriers', inbox: 'Client submissions', send: 'Send to carrier', sent: 'Sent to carrier' },
  broker: { tagline: 'One clean submission, ready for every market', inbox: 'Submissions to market', send: 'Send to markets', sent: 'Sent to markets' },
  tech: { tagline: 'Submissions arriving from partner systems through the API', inbox: 'API and partner activity', send: 'Send by webhook', sent: 'Sent by webhook' },
};
const STEPS = [
  { id: 'intake', title: 'Intake' }, { id: 'ocr', title: 'Read (OCR)' }, { id: 'classify', title: 'Classify' },
  { id: 'extract', title: 'Extract' }, { id: 'validate', title: 'Validate' }, { id: 'export', title: 'Send' },
];
const STATUS_LABEL = { processing: 'Processing', needs_review: 'Needs review', ready: 'Ready to send', exported: 'Sent', failed: 'Failed' };
const CHANNEL_LABEL = { upload: 'Upload', email: 'Email', api: 'API' };

// ---------- utilities ----------
async function api(path, opts = {}) {
  const res = await fetch(path, opts);
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(body.error || `Request failed (${res.status})`), { body });
  return body;
}
const json = (method, data) => ({ method, headers: { 'content-type': 'application/json' }, body: JSON.stringify(data) });

let toastTimer;
function toast(msg) {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 2600);
}

function ago(iso) {
  const s = (Date.now() - new Date(iso)) / 1000;
  if (s < 45) return 'just now';
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  return new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

function copy(text, msg = 'Copied') {
  navigator.clipboard?.writeText(text).then(() => toast(msg), () => toast('Copy failed. Select the text instead.'));
}

// ---------- role ----------
function applyRole() {
  const copyset = ROLE_COPY[state.settings.role] || ROLE_COPY.carrier;
  $('#role').value = state.settings.role;
  $('#role-tagline').textContent = copyset.tagline;
  $('#inbox-title').textContent = copyset.inbox;
  if (state.current) renderActions();
}

$('#role').addEventListener('change', async (e) => {
  state.settings = await api('/api/settings', json('PUT', { role: e.target.value }));
  applyRole();
});

// ---------- intake channels ----------
function renderChannel() {
  $$('.tab').forEach((t) => {
    const on = state.settings.intakeChannels[t.dataset.channel]?.enabled;
    t.setAttribute('aria-selected', String(t.dataset.channel === state.channel));
    t.classList.toggle('off', !on);
  });
  const enabled = state.settings.intakeChannels[state.channel]?.enabled;
  $$('.pane').forEach((p) => { p.hidden = p.dataset.pane !== state.channel || !enabled; });
  $('#channel-off').hidden = enabled;
}
$$('.tab').forEach((t) => t.addEventListener('click', () => { state.channel = t.dataset.channel; renderChannel(); }));

function wireDrop(label, onFiles) {
  label.addEventListener('dragover', (e) => { e.preventDefault(); label.classList.add('over'); });
  label.addEventListener('dragleave', () => label.classList.remove('over'));
  label.addEventListener('drop', (e) => { e.preventDefault(); label.classList.remove('over'); onFiles([...e.dataTransfer.files]); });
}

function setUploadFiles(files) {
  state.files = files;
  $('#picked-files').innerHTML = files.map((f) => `<li><span>${esc(f.name)}</span><span>${Math.max(1, Math.round(f.size / 1024))} KB</span></li>`).join('');
  $('#send-upload').disabled = !files.length;
}
$('#file-input').addEventListener('change', (e) => setUploadFiles([...e.target.files]));
wireDrop($('#drop-upload'), setUploadFiles);

$('#send-upload').addEventListener('click', async () => {
  const fd = new FormData();
  state.files.forEach((f) => fd.append('files', f));
  try {
    const sub = await api('/api/submissions', { method: 'POST', body: fd });
    setUploadFiles([]); $('#file-input').value = '';
    await afterCreate(sub);
  } catch (err) { toast(err.message); }
});

function setEml(file) { state.eml = file; $('#eml-name').textContent = file ? file.name : 'attachments are pulled out automatically'; }
$('#eml-input').addEventListener('change', (e) => setEml(e.target.files[0]));
wireDrop($('#drop-email'), (files) => setEml(files[0]));

$('#send-email').addEventListener('click', async () => {
  const fd = new FormData();
  if (state.eml) fd.append('eml', state.eml);
  else fd.append('raw', $('#email-raw').value);
  try {
    const sub = await api('/api/submissions/email', { method: 'POST', body: fd });
    setEml(null); $('#eml-input').value = ''; $('#email-raw').value = '';
    await afterCreate(sub);
  } catch (err) { toast(err.message); }
});

function curlText() {
  return `curl -X POST ${location.origin}/api/v1/submissions \\
  -H "x-api-key: ${state.settings.apiKey}" \\
  -F "source=Partner portal" \\
  -F "note=Roofing contractor, GL only" \\
  -F "files=@summit_ridge_acord125.pdf"`;
}
$('#copy-curl').addEventListener('click', () => copy(curlText(), 'Request copied'));
$('#send-api').addEventListener('click', async () => {
  try {
    const blob = await (await fetch('/samples/summit_ridge_acord125.pdf')).blob();
    const fd = new FormData();
    fd.append('source', 'Test client (API)');
    fd.append('subject', 'Summit Ridge Roofing LLC');
    fd.append('note', 'Roofing contractor, GL only. Please quote by Friday.');
    fd.append('files', blob, 'summit_ridge_acord125.pdf');
    const res = await api('/api/v1/submissions', { method: 'POST', body: fd, headers: { 'x-api-key': state.settings.apiKey } });
    toast(`API accepted ${res.reference}`);
    await afterCreate({ id: res.id });
  } catch (err) { toast(err.message); }
});

async function afterCreate(sub) {
  await refreshInbox();
  select(sub.id);
}

// ---------- inbox ----------
async function refreshInbox() {
  state.inbox = await api('/api/submissions');
  $('#inbox-empty').hidden = state.inbox.length > 0;
  $('#inbox').innerHTML = state.inbox.map((s) => `
    <li><button type="button" data-id="${s.id}" aria-current="${s.id === state.currentId}">
      <span class="i-name">${esc(s.name)}</span>
      <span class="chan">${CHANNEL_LABEL[s.channel] || s.channel}</span>
      <span class="i-meta"><span><span class="dot ${s.status}"></span>${STATUS_LABEL[s.status]}</span><span>${s.ref}</span><span>${ago(s.receivedAt)}</span></span>
    </button></li>`).join('');
  $$('#inbox button').forEach((b) => b.addEventListener('click', () => select(b.dataset.id)));
}

// ---------- submission ----------
function select(id) {
  if (state.currentId !== id) { state.docId = null; state.steps = {}; }
  state.currentId = id;
  $$('#inbox button').forEach((b) => b.setAttribute('aria-current', String(b.dataset.id === id)));
  load(true);
}

async function load(force = false) {
  if (!state.currentId) return;
  try {
    state.current = await api(`/api/submissions/${state.currentId}`);
    render(force);
  } catch (err) { toast(err.message); }
}

function render(force) {
  const sub = state.current;
  $('#blank').hidden = true;
  $('#submission').hidden = false;
  const name = sub.fields.applicant_name?.value || sub.subject || sub.documents[0]?.name || sub.ref;
  $('#sub-name').textContent = name;
  const meta = [sub.ref, `via ${CHANNEL_LABEL[sub.channel] || sub.channel}`, sub.from ? `from ${sub.from}` : null, `received ${ago(sub.receivedAt)}`].filter(Boolean);
  $('#sub-meta').innerHTML = meta.map((m) => `<span>${esc(m)}</span>`).join('');
  const st = $('#sub-status');
  st.className = `status ${sub.status}`;
  st.textContent = STATUS_LABEL[sub.status];
  $('#sub-summary').hidden = !sub.summary;
  $('#sub-summary').textContent = sub.summary || '';
  renderPipeline();
  renderDocs();
  const editing = $('#fields').contains(document.activeElement);
  if (force || !editing) renderRecord();
  renderActions();
}

function renderPipeline() {
  const sub = state.current;
  $('#pipeline').innerHTML = STEPS.map((s, i) => {
    const step = sub.steps[s.id];
    let cls = step.state;
    if (s.id === 'export' && step.state !== 'done' && sub.status === 'needs_review') cls = 'waiting';
    if (step.state === 'done' && state.steps[s.id] && state.steps[s.id] !== 'done') cls += ' stamped';
    const num = step.state === 'done' ? '&#10003;' : step.state === 'error' ? '!' : i + 1;
    return `<li class="${cls}"><span class="step-num">${num}</span><span class="step-text"><span class="step-title">${s.title}</span><span class="step-detail" title="${esc(step.detail)}">${esc(step.detail || (step.state === 'pending' ? 'Waiting' : ''))}</span></span></li>`;
  }).join('');
  state.steps = Object.fromEntries(STEPS.map((s) => [s.id, sub.steps[s.id].state]));
}

// ---------- documents ----------
function renderDocs() {
  const sub = state.current;
  if (!sub.documents.find((d) => d.id === state.docId)) {
    state.docId = (sub.documents.find((d) => d.kind === 'file') || sub.documents[0])?.id;
  }
  $('#doc-tabs').innerHTML = sub.documents.map((d) => `
    <button type="button" class="doc-tab" data-doc="${d.id}" aria-selected="${d.id === state.docId}">
      <span class="doc-type ${d.docType && !d.supported ? 'unsupported' : ''}">${esc(d.docLabel || 'Reading')}</span>
      <span class="dname">${esc(d.name)}</span>
    </button>`).join('');
  $$('.doc-tab').forEach((b) => b.addEventListener('click', () => { state.docId = b.dataset.doc; renderDocs(); }));
  $$('.toggle button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.view === state.view)));

  const doc = sub.documents.find((d) => d.id === state.docId);
  const viewer = $('#viewer');
  if (!doc) { viewer.innerHTML = ''; $('#doc-foot').textContent = ''; return; }
  const key = `${doc.id}:${state.view}:${doc.ocr ? 'read' : 'unread'}`;
  if (viewer.dataset.key !== key) {
    viewer.dataset.key = key;
    if (state.view === 'text') {
      if (!doc.ocr) viewer.innerHTML = '<pre>Waiting for the OCR step...</pre>';
      else {
        const low = new Set((doc.ocr.lowWords || []).map((w) => w.trim()).filter(Boolean));
        const html = doc.ocr.text.split(/(\s+)/).map((tok) => (low.has(tok.trim()) && tok.trim() ? `<mark title="Low OCR confidence">${esc(tok)}</mark>` : esc(tok))).join('');
        viewer.innerHTML = `<pre>${html}</pre>`;
      }
    } else if (doc.mime.startsWith('image/')) viewer.innerHTML = `<img src="${doc.url}" alt="${esc(doc.name)}">`;
    else if (doc.mime === 'application/pdf') viewer.innerHTML = `<iframe src="${doc.url}" title="${esc(doc.name)}"></iframe>`;
    else viewer.innerHTML = `<pre>${esc(doc.text || '')}</pre>`;
  }
  const o = doc.ocr;
  let foot = 'Waiting to be read.';
  if (o) {
    foot = o.engine === 'tesseract' ? `Scanned image, read with Tesseract at ${o.confidence}% confidence. Highlighted words in Text read are the ones it was unsure about.`
      : o.engine === 'pdf-text' ? 'Digital PDF, text read directly from the file.'
      : o.engine === 'plain-text' ? 'Plain text, no OCR needed.' : `Read with ${o.engine}.`;
    if (doc.reason) foot += ` Classified as ${doc.docLabel} (${doc.reason.charAt(0).toLowerCase() + doc.reason.slice(1)}).`;
    if (o.warning) foot += ` ${o.warning}`;
  }
  $('#doc-foot').textContent = foot;
}
$$('.toggle button').forEach((b) => b.addEventListener('click', () => { state.view = b.dataset.view; renderDocs(); }));

// ---------- record ----------
function renderRecord() {
  const sub = state.current;
  const { fields: defs, sections } = state.meta;
  const processing = sub.status === 'processing';
  const ex = sub.extraction;
  $('#engine').textContent = ex ? `Extracted by ${ex.engine.startsWith('llm') ? 'LLM' : 'layout reader'}${ex.fallbackReason ? ' (LLM unavailable)' : ''}` : '';

  const req = state.settings.requiredFields;
  if (processing && !Object.keys(sub.fields).length) {
    $('#readiness').innerHTML = '<div class="ready-line"><span>Reading documents...</span></div>';
    $('#issues').innerHTML = '';
    $('#fields').innerHTML = '';
    return;
  }
  const okCount = req.filter((k) => ['ok', 'verified'].includes(sub.fields[k]?.status)).length;
  $('#readiness').innerHTML = `
    <div class="ready-line"><span><strong>${okCount} of ${req.length}</strong> required fields ready</span><span>${sub.readiness}%</span></div>
    <div class="segments">${req.map((k) => `<i class="${sub.fields[k]?.status || ''}" title="${esc(defs.find((d) => d.key === k)?.label)}"></i>`).join('')}</div>`;

  const order = { error: 0, warning: 1, info: 2 };
  const issues = [...sub.issues].sort((a, b) => order[a.severity] - order[b.severity]);
  $('#issues').innerHTML = issues.map((i) => `
    <li><span class="sev ${i.severity}">${i.severity === 'error' ? 'Fix' : i.severity === 'warning' ? 'Check' : 'Note'}</span>
    <span>${esc(i.message)}</span>${i.key ? `<button type="button" data-goto="${i.key}">Show</button>` : ''}</li>`).join('');
  $$('#issues [data-goto]').forEach((b) => b.addEventListener('click', () => focusField(b.dataset.goto)));

  $('#fields').innerHTML = sections.map((sec) => `
    <fieldset class="fsection"><legend>${sec.title}</legend>
    ${defs.filter((d) => d.section === sec.id).map((d) => fieldRow(d, sub)).join('')}
    </fieldset>`).join('');

  $$('#fields input, #fields textarea').forEach((inp) => {
    inp.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); inp.blur(); } });
    inp.addEventListener('change', () => saveField(inp.name, inp.value));
  });
  $$('#fields .confirm').forEach((b) => b.addEventListener('click', () => saveField(b.dataset.key, $(`#f-${b.dataset.key}`).value)));
}

function fieldRow(def, sub) {
  const f = sub.fields[def.key] || {};
  const status = f.status || '';
  const required = state.settings.requiredFields.includes(def.key);
  const doc = sub.documents.find((d) => d.id === f.docId);
  let mark = '';
  if (status === 'review') mark = `<button type="button" class="confirm" data-key="${def.key}">Confirm</button>`;
  else if (status === 'verified') mark = '<span class="mark">Confirmed</span>';
  else if (status === 'ok') mark = '<span class="mark">&#10003;</span>';
  else if (status === 'missing') mark = '<span class="mark" style="color:var(--red)">Missing</span>';
  else if (status === 'invalid') mark = '<span class="mark" style="color:var(--red)">Check</span>';
  const note = ['review', 'missing', 'invalid'].includes(status) && f.message ? `<span class="note">${esc(f.message)}</span>` : '';
  const src = f.source && f.method !== 'reviewer' ? `<span class="src">From ${esc(doc?.docLabel || 'document')}: "${esc(f.source)}"</span>` : '';
  return `
    <div class="frow ${status}" id="row-${def.key}">
      <label for="f-${def.key}">${esc(def.label)}${required ? '<span class="req">required</span>' : ''}</label>
      ${def.type === 'longtext'
        ? `<textarea id="f-${def.key}" name="${def.key}" rows="2" placeholder="${status === 'missing' ? 'Missing. Add it or request it.' : ''}">${esc(f.value)}</textarea>`
        : `<input id="f-${def.key}" name="${def.key}" value="${esc(f.value)}" placeholder="${status === 'missing' ? 'Missing. Add it or request it.' : ''}">`}
      ${mark}${note}${src}
    </div>`;
}

function focusField(key) {
  const row = $(`#row-${key}`);
  if (!row) return;
  row.scrollIntoView({ behavior: 'smooth', block: 'center' });
  row.classList.remove('flash'); void row.offsetWidth; row.classList.add('flash');
  $('input, textarea', row).focus({ preventScroll: true });
}

async function saveField(key, value) {
  try {
    state.current = await api(`/api/submissions/${state.currentId}/fields/${key}`, json('PATCH', { value }));
    render(true);
    const row = $(`#row-${key}`);
    if (row) { row.classList.add('flash'); }
    refreshInbox();
  } catch (err) { toast(err.message); }
}

// ---------- actions ----------
function renderActions() {
  const sub = state.current;
  const copyset = ROLE_COPY[state.settings.role] || ROLE_COPY.carrier;
  const send = $('#btn-send');
  if (sub.status === 'exported') { send.textContent = copyset.sent; send.disabled = true; }
  else { send.textContent = copyset.send; send.disabled = sub.status !== 'ready'; }
  send.title = sub.status === 'needs_review' ? 'Resolve the flagged items first' : '';
  $('#btn-followup').disabled = sub.status === 'processing';
  $('#btn-json').disabled = sub.status === 'processing';
}

let lastPayload = null;
function showJson(payload, hint) {
  lastPayload = payload;
  $('#json-body').textContent = JSON.stringify(payload, null, 2);
  $('#json-hint').textContent = hint;
  $('#dlg-json').showModal();
}

$('#btn-json').addEventListener('click', async () => {
  const { payload } = await api(`/api/submissions/${state.currentId}/export`, json('POST', {}));
  showJson(payload, `Preview of what ${payload.destination} would receive. Nothing has been sent.`);
});

$('#btn-send').addEventListener('click', async () => {
  try {
    const { payload, submission } = await api(`/api/submissions/${state.currentId}/export`, json('POST', { send: true }));
    state.current = submission;
    render(true);
    refreshInbox();
    toast(`${state.current.ref} sent`);
    showJson(payload, `Sent as ${payload.destination}. In production this goes to the connected AMS or carrier system.`);
  } catch (err) { toast(err.message); }
});

$('#copy-json').addEventListener('click', () => copy($('#json-body').textContent, 'Payload copied'));
$('#download-json').addEventListener('click', () => {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([JSON.stringify(lastPayload, null, 2)], { type: 'application/json' }));
  a.download = `${state.current.ref}-acord.json`;
  a.click();
});

$('#btn-followup').addEventListener('click', async () => {
  const d = await api(`/api/submissions/${state.currentId}/followup`, { method: 'POST' });
  $('#fu-to').value = d.to; $('#fu-subject').value = d.subject; $('#fu-body').value = d.body;
  updateMailto();
  $('#dlg-followup').showModal();
});
function updateMailto() {
  $('#fu-mail').href = `mailto:${encodeURIComponent($('#fu-to').value)}?subject=${encodeURIComponent($('#fu-subject').value)}&body=${encodeURIComponent($('#fu-body').value)}`;
}
['#fu-to', '#fu-subject', '#fu-body'].forEach((s) => $(s).addEventListener('input', updateMailto));
$('#fu-copy').addEventListener('click', () => copy($('#fu-body').value, 'Message copied'));

$$('dialog [data-close]').forEach((b) => b.addEventListener('click', () => b.closest('dialog').close()));

// ---------- settings ----------
function tag(status) { return `<span class="tag ${status}">${status === 'later' ? 'Roadmap' : status === 'beta' ? 'Beta' : 'Live'}</span>`; }

function toggleList(group, items) {
  return Object.entries(items).map(([id, it]) => `
    <label class="set-item ${it.status === 'later' ? 'locked' : ''}">
      <input type="checkbox" data-group="${group}" data-id="${id}" ${it.enabled ? 'checked' : ''} ${it.status === 'later' ? 'disabled' : ''}>
      <span class="t">${esc(it.code ? `${it.code}: ${it.label}` : it.label)}</span>${tag(it.status)}
      <span class="d">${esc(it.detail || '')}</span>
    </label>`).join('');
}

function radioList(name, items, current) {
  return Object.entries(items).map(([id, it]) => `
    <label class="set-item ${it.status === 'later' ? 'locked' : ''}">
      <input type="radio" name="${name}" value="${id}" ${id === current ? 'checked' : ''} ${it.status === 'later' ? 'disabled' : ''}>
      <span class="t">${esc(it.label)}</span>${tag(it.status)}
      <span class="d">${esc(it.detail || '')}</span>
    </label>`).join('');
}

function renderSettings() {
  const s = state.settings;
  $('#settings-body').innerHTML = `
    <div class="set-group"><h3>Intake channels</h3><p>Where submissions can come from.</p>${toggleList('intakeChannels', s.intakeChannels)}</div>
    <div class="set-group"><h3>Supported documents</h3><p>What the classifier accepts. Anything else is flagged, never guessed.</p>${toggleList('supportedDocuments', s.supportedDocuments)}</div>
    <div class="set-group"><h3>OCR engine</h3><p>Swap engines without changing anything else in the pipeline.</p>${radioList('ocrEngine', s.ocrEngines, s.ocrEngine)}</div>
    <div class="set-group"><h3>Human review</h3><p>Fields read below this OCR confidence go to a person to confirm.</p>
      <div class="slider"><input type="range" min="0" max="100" step="5" id="set-threshold" value="${s.reviewThreshold}"><strong id="set-threshold-v">${s.reviewThreshold}%</strong></div></div>
    <div class="set-group"><h3>Required fields</h3><p>A submission can't be sent until these are present and valid.</p>
      <div class="req-grid">${state.meta.fields.map((f) => `<label><input type="checkbox" data-req="${f.key}" ${s.requiredFields.includes(f.key) ? 'checked' : ''}>${esc(f.label)}</label>`).join('')}</div></div>
    <div class="set-group"><h3>Appetite</h3><p>Flag submissions outside the states you write in.</p>
      <label class="set-item"><input type="checkbox" id="set-appetite" ${s.appetite.enabled ? 'checked' : ''}><span class="t">Check state appetite</span>${tag(s.appetite.status)}<span class="d">States written</span></label>
      <input type="text" id="set-states" value="${esc(s.appetite.states.join(', '))}" aria-label="States written"></div>
    <div class="set-group"><h3>Output destination</h3><p>Where clean submissions are sent.</p>${radioList('outputDestination', s.outputDestinations, s.outputDestination)}</div>
    <div class="set-group"><h3>Routing rules</h3><p>Send each submission to the right person automatically.</p>
      ${s.routing.rules.map((r) => `<div class="set-item locked"><input type="checkbox" disabled><span class="t">${esc(r)}</span>${tag('later')}</div>`).join('')}</div>`;

  const save = async (patch) => {
    state.settings = await api('/api/settings', json('PUT', patch));
    renderChannel(); applyRole(); refreshInbox(); load(true);
  };
  $$('#settings-body [data-group]').forEach((c) => c.addEventListener('change', () => save({ [c.dataset.group]: { [c.dataset.id]: { enabled: c.checked } } })));
  $$('#settings-body input[type=radio]').forEach((r) => r.addEventListener('change', () => save({ [r.name]: r.value })));
  const th = $('#set-threshold');
  th.addEventListener('input', () => { $('#set-threshold-v').textContent = `${th.value}%`; });
  th.addEventListener('change', () => save({ reviewThreshold: Number(th.value) }));
  $$('#settings-body [data-req]').forEach((c) => c.addEventListener('change', () => save({ requiredFields: $$('#settings-body [data-req]:checked').map((x) => x.dataset.req) })));
  $('#set-appetite').addEventListener('change', (e) => save({ appetite: { enabled: e.target.checked } }));
  $('#set-states').addEventListener('change', (e) => save({ appetite: { states: e.target.value.split(/[,\s]+/) } }));
}

$('#open-settings').addEventListener('click', () => { renderSettings(); $('#dlg-settings').showModal(); });

// ---------- brand ----------
// Uses the official qBotica logo file if present in public/brand/, otherwise shows the name as text.
function loadLogo() {
  const img = $('#brand-logo');
  const sources = ['/brand/qbotica-logo.svg', '/brand/qbotica-logo.png'];
  let i = 0;
  img.addEventListener('load', () => { img.hidden = false; $('#brand-fallback').hidden = true; });
  img.addEventListener('error', () => { i += 1; if (i < sources.length) img.src = sources[i]; });
  img.src = sources[0];
}

// ---------- boot ----------
async function boot() {
  loadLogo();
  [state.meta, state.settings] = await Promise.all([api('/api/meta'), api('/api/settings')]);
  $('#curl').textContent = curlText();
  applyRole();
  renderChannel();
  await refreshInbox();
  setInterval(refreshInbox, 2500);
  setInterval(() => {
    const c = state.current;
    if (c && (c.status === 'processing' || Object.values(c.steps).some((s) => s.state === 'running'))) load();
  }, 700);
}
boot().catch((err) => toast(`Couldn't reach the server: ${err.message}`));
