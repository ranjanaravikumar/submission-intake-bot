// Storage adapter. Local folder for the demo; swap for S3 or Azure Blob in production.
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', 'uploads');

async function save(submissionId, filename, buffer) {
  const dir = path.join(ROOT, submissionId);
  await fs.promises.mkdir(dir, { recursive: true });
  const safe = filename.replace(/[^\w.\- ]+/g, '_');
  const full = path.join(dir, safe);
  await fs.promises.writeFile(full, buffer);
  return full;
}

module.exports = { save, ROOT };
