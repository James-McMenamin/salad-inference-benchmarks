import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';

const root = new URL('../', import.meta.url);
const read = async name => JSON.parse(await fs.readFile(new URL(name, root)));
const manifest = await read('export-manifest.json');
assert.ok(manifest.files.length > 300);
for (const file of manifest.files) {
  const bytes = await fs.readFile(new URL(file.export, root));
  assert.equal(createHash('sha256').update(bytes).digest('hex'), file.exportSha256, file.export);
}
const concurrency = await read('results/salad-api-concurrency-2026-10-15T22-50-02-529Z/review-data.json');
assert.equal(concurrency.summary.reduce((n, r) => n + r.completed, 0), 137);
assert.equal(concurrency.summary.reduce((n, r) => n + r.passed, 0), 134);
const local = (await read('results/concurrency-2026-10-15T21-16-05-155Z/comparison.json')).map(row => row.summary);
assert.equal(local.reduce((n, r) => n + r.requests, 0), 480);
assert.ok(local.every(r => r.errors === 0 && r.passed === 96));
const partial = await read('results/salad-api-concurrency-retry-2026-10-15T23-02-10-591Z/receipt.json');
assert.equal(partial.completed, 48); assert.equal(partial.status, 'failed');
const unavailable = await read('results/salad-api-eight-per-second-immediate-retry-10s-2026-10-16T00-38-30-986Z/receipt.json');
assert.equal(unavailable.completed, 0); assert.equal(unavailable.status, 'failed');

const rules = [
  /(?:gh[pousr]_|github_pat_)[A-Za-z0-9_]{20,}/,
  /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/,
  /\bsk-[A-Za-z0-9_-]{24,}/,
  /\bAKIA[A-Z0-9]{16}\b/,
  /Bearer\s+[A-Za-z0-9_.-]{24,}/,
  /[A-Za-z]:[\\/](?:Users|Ragnarok-Systems|Scratch)[\\/]/i,
  /(?:api[_-]?key|password|secret|token)\s*[=:]\s*["'][A-Za-z0-9_+\/-]{24,}["']/i,
];
let inspected = 0;
async function scan(dir) {
  for (const item of await fs.readdir(dir, {withFileTypes: true})) {
    if (['.git', 'node_modules', 'new-runs'].includes(item.name)) continue;
    const p = path.join(dir, item.name);
    if (item.isDirectory()) await scan(p);
    else {
      assert.ok(!/^(?:\.env|id_rsa|id_ed25519)$/.test(item.name), `Private file: ${p}`);
      if (path.extname(p) === '.pdf') continue;
      const text = await fs.readFile(p, 'utf8');
      for (const rule of rules) assert.ok(!rule.test(text), `Potential private material in ${p}; review locally`);
      inspected++;
    }
  }
}
await scan(fileURLToPath(root));
console.log(`Verified ${manifest.files.length} export hashes, historical totals, partial-run status, and ${inspected} text files for credential/local-path patterns.`);
