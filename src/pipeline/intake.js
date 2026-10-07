// Intake agent: turns any channel's input into one submission packet of documents.
const { simpleParser } = require('mailparser');
const storage = require('../storage');

async function addFile(sub, name, buffer, mime) {
  const doc = { id: `d${sub.documents.length + 1}`, name, mime: mime || 'application/octet-stream', size: buffer.length, kind: 'file' };
  doc.path = await storage.save(sub.id, name, buffer);
  sub.documents.push(doc);
  return doc;
}

async function addText(sub, name, text, kind) {
  const doc = { id: `d${sub.documents.length + 1}`, name, mime: 'text/plain', size: Buffer.byteLength(text), kind, text };
  doc.path = await storage.save(sub.id, name, Buffer.from(text));
  sub.documents.push(doc);
  return doc;
}

async function fromFiles(sub, files, note) {
  if (note) await addText(sub, 'note.txt', note, 'note');
  for (const f of files) await addFile(sub, f.originalname, f.buffer, f.mimetype);
}

async function fromEmail(sub, source) {
  const parsed = await simpleParser(source);
  sub.from = parsed.from?.value?.[0] ? [parsed.from.value[0].name, `<${parsed.from.value[0].address}>`].filter(Boolean).join(' ') : parsed.from?.text || null;
  sub.subject = parsed.subject || null;
  const body = parsed.text || (parsed.html ? parsed.html.replace(/<[^>]+>/g, ' ') : '');
  if (body.trim()) await addText(sub, 'email-body.txt', body.trim(), 'email_body');
  for (const att of parsed.attachments || []) {
    await addFile(sub, att.filename || `attachment-${sub.documents.length + 1}`, att.content, att.contentType);
  }
}

module.exports = { fromFiles, fromEmail };
