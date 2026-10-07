// Digital PDFs already contain text, so we read the text layer directly (with positions).
const fs = require('fs');
const pdfParse = require('pdf-parse/lib/pdf-parse.js');

async function extract(filePath) {
  const items = [];
  let pageOffset = 0;
  let pageWidth = 612;
  // Copy into a standalone array: small Node buffers share a memory pool, which confuses pdf.js.
  const buffer = new Uint8Array(await fs.promises.readFile(filePath));
  await pdfParse(buffer, {
    pagerender: async (page) => {
      const viewport = page.getViewport ? page.getViewport(1) : { width: 612, height: 792 };
      pageWidth = viewport.width || 612;
      const content = await page.getTextContent();
      for (const it of content.items) {
        if (!it.str || !it.str.trim()) continue;
        items.push({ str: it.str, x: it.transform[4], y: pageOffset + (viewport.height - it.transform[5]), w: it.width });
      }
      pageOffset += viewport.height || 792;
      return '';
    },
  });

  // Group text items into lines by vertical position, then split into words with approximate x positions.
  items.sort((a, b) => a.y - b.y || a.x - b.x);
  const lines = [];
  for (const it of items) {
    let line = lines.find((l) => Math.abs(l.y - it.y) < 2.5);
    if (!line) { line = { y: it.y, words: [] }; lines.push(line); }
    const charW = it.w / Math.max(1, it.str.length);
    let idx = 0;
    for (const part of it.str.split(/(\s+)/)) {
      if (part.trim()) line.words.push({ text: part, x0: it.x + idx * charW, x1: it.x + (idx + part.length) * charW, conf: 100 });
      idx += part.length;
    }
  }
  lines.sort((a, b) => a.y - b.y);
  for (const l of lines) { l.words.sort((a, b) => a.x0 - b.x0); l.text = l.words.map((w) => w.text).join(' '); }
  const text = lines.map((l) => l.text).join('\n');
  return { engine: 'pdf-text', text, confidence: text.trim().length > 40 ? 100 : 0, lines, pageWidth };
}

module.exports = { extract };
