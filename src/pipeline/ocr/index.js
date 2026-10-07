// OCR agent. Every engine returns the same shape:
// { engine, text, confidence, lines: [{ text, words: [{ text, x0, x1, conf }] }], pageWidth }
// To add AWS Textract or Azure, write an adapter that returns this shape and register it below.
const path = require('path');
const tesseract = require('./tesseract');
const pdfText = require('./pdfText');

const imageEngines = {
  tesseract: (file) => tesseract.recognize(file),
  textract: () => { throw new Error('AWS Textract is not configured yet. Add credentials to enable it.'); },
  azure: () => { throw new Error('Azure Document Intelligence is not configured yet. Add credentials to enable it.'); },
};

const IMAGE_EXT = ['.png', '.jpg', '.jpeg', '.tif', '.tiff', '.bmp', '.webp'];

async function runOCR(doc, engine = 'tesseract') {
  const ext = path.extname(doc.name).toLowerCase();
  if (doc.kind === 'email_body' || doc.kind === 'note' || ext === '.txt') {
    const text = doc.text || '';
    return { engine: 'plain-text', text, confidence: 100, lines: text.split('\n').map((t) => ({ text: t, words: [] })), pageWidth: 1 };
  }
  if (ext === '.pdf') {
    const result = await pdfText.extract(doc.path);
    if (result.confidence === 0) {
      result.warning = 'This PDF has no text layer (it is a scan). Upload it as an image, or enable PDF rasterizing (on the roadmap).';
    }
    return result;
  }
  if (IMAGE_EXT.includes(ext)) return imageEngines[engine](doc.path);
  return { engine: 'none', text: '', confidence: 0, lines: [], pageWidth: 1, warning: `Can't read ${ext || 'this'} files yet.` };
}

module.exports = { runOCR };
