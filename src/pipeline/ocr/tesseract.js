// Tesseract engine. Language data ships with the npm package, so it works offline.
const path = require('path');
const { createWorker } = require('tesseract.js');
const eng = require('@tesseract.js-data/eng');

let workerPromise = null;
function getWorker() {
  if (!workerPromise) {
    workerPromise = createWorker('eng', 1, {
      langPath: eng.langPath,
      gzip: true,
      cachePath: path.join(__dirname, '..', '..', '..', '.ocr-cache'),
    });
  }
  return workerPromise;
}

async function recognize(filePath) {
  const worker = await getWorker();
  const { data } = await worker.recognize(filePath, {}, { text: true, blocks: true });
  const lines = [];
  for (const block of data.blocks || []) {
    for (const para of block.paragraphs) {
      for (const line of para.lines) {
        lines.push({
          text: line.text.trim(),
          y: line.bbox.y0,
          words: line.words.map((w) => ({ text: w.text, x0: w.bbox.x0, x1: w.bbox.x1, conf: Math.round(w.confidence) })),
        });
      }
    }
  }
  lines.sort((a, b) => a.y - b.y);
  const width = Math.max(1, ...lines.flatMap((l) => l.words.map((w) => w.x1)));
  return { engine: 'tesseract', text: data.text, confidence: Math.round(data.confidence), lines, pageWidth: width };
}

module.exports = { recognize };
