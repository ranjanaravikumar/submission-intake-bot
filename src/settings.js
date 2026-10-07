// Per-client configuration. Everything a customer would tune lives here.
// status: 'live' = works in this build, 'beta' = works but limited, 'later' = on the roadmap.
const { FIELDS } = require('./fields');

const settings = {
  role: 'carrier',
  apiKey: 'demo-key',
  intakeChannels: {
    upload: { label: 'File upload', detail: 'Drag and drop PDFs or scans', status: 'live', enabled: true },
    email: { label: 'Email', detail: 'Forwarded .eml files or pasted emails', status: 'live', enabled: true },
    api: { label: 'API', detail: 'POST /api/v1/submissions', status: 'live', enabled: true },
    shared_inbox: { label: 'Shared inbox', detail: 'Watch an Outlook or Gmail mailbox', status: 'later', enabled: false },
    portal: { label: 'Agency portal', detail: 'Agents upload through a branded page', status: 'later', enabled: false },
    chat: { label: 'Slack or Teams', detail: 'Submit by dropping files in a channel', status: 'later', enabled: false },
  },
  supportedDocuments: {
    acord_125: { code: 'ACORD 125', label: 'Commercial insurance application', status: 'live', enabled: true },
    email_body: { code: 'Email', label: 'Submission email body', status: 'live', enabled: true },
    loss_run: { code: 'Loss run', label: 'Carrier claims history', status: 'beta', enabled: true },
    acord_126: { code: 'ACORD 126', label: 'General liability section', status: 'later', enabled: false },
    acord_127: { code: 'ACORD 127', label: 'Business auto section', status: 'later', enabled: false },
    acord_130: { code: 'ACORD 130', label: 'Workers compensation application', status: 'later', enabled: false },
    acord_140: { code: 'ACORD 140', label: 'Property section', status: 'later', enabled: false },
    sov: { code: 'SOV', label: 'Statement of values spreadsheet', status: 'later', enabled: false },
  },
  ocrEngine: 'tesseract',
  ocrEngines: {
    tesseract: { label: 'Tesseract', detail: 'Open source, runs on your own server', status: 'live' },
    textract: { label: 'AWS Textract', detail: 'Form-aware, reads checkboxes and key-value pairs', status: 'later' },
    azure: { label: 'Azure Document Intelligence', detail: 'Form-aware, supports custom trained models', status: 'later' },
  },
  reviewThreshold: 70, // OCR word confidence (0-100) below which a field goes to human review
  requiredFields: FIELDS.filter((f) => f.required).map((f) => f.key),
  outputDestination: 'acord_json',
  outputDestinations: {
    acord_json: { label: 'ACORD-aligned JSON', status: 'live' },
    applied_epic: { label: 'Applied Epic', status: 'later' },
    ams360: { label: 'Vertafore AMS360', status: 'later' },
    hawksoft: { label: 'HawkSoft', status: 'later' },
    acord_xml: { label: 'ACORD XML', status: 'later' },
  },
  appetite: { enabled: false, states: ['OR', 'WA', 'ID', 'CA'], status: 'beta' },
  routing: { enabled: false, status: 'later', rules: ['Oregon and Washington to the Pacific Northwest desk', 'Revenue over $5M to senior underwriter'] },
};

function update(patch) {
  if (patch.role) settings.role = patch.role;
  if (typeof patch.reviewThreshold === 'number') settings.reviewThreshold = Math.max(0, Math.min(100, patch.reviewThreshold));
  if (Array.isArray(patch.requiredFields)) settings.requiredFields = patch.requiredFields.filter((k) => FIELDS.some((f) => f.key === k));
  for (const group of ['intakeChannels', 'supportedDocuments']) {
    for (const [id, v] of Object.entries(patch[group] || {})) {
      const item = settings[group][id];
      if (item && item.status !== 'later' && typeof v.enabled === 'boolean') item.enabled = v.enabled; // roadmap items stay locked
    }
  }
  if (patch.ocrEngine && settings.ocrEngines[patch.ocrEngine]?.status === 'live') settings.ocrEngine = patch.ocrEngine;
  if (patch.outputDestination && settings.outputDestinations[patch.outputDestination]?.status === 'live') settings.outputDestination = patch.outputDestination;
  if (patch.appetite) {
    if (typeof patch.appetite.enabled === 'boolean') settings.appetite.enabled = patch.appetite.enabled;
    if (Array.isArray(patch.appetite.states)) settings.appetite.states = patch.appetite.states.map((s) => String(s).toUpperCase().trim()).filter(Boolean);
  }
  return settings;
}

module.exports = { settings, update };
