// Job queue adapter. In-memory and sequential for the demo (one OCR worker).
// In production, swap for Redis + BullMQ so many submissions process in parallel.
const jobs = [];
let running = false;

function enqueue(fn) {
  jobs.push(fn);
  if (!running) drain();
}

async function drain() {
  running = true;
  while (jobs.length) {
    const job = jobs.shift();
    try { await job(); } catch (err) { console.error('Job failed:', err); }
  }
  running = false;
}

module.exports = { enqueue, pending: () => jobs.length };
