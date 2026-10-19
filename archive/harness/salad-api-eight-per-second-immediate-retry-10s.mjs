import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import {performance} from 'node:perf_hooks';
import {gradeAnswer} from './core.mjs';
import {makeWaves, summarizeRequests} from './concurrency-core.mjs';
import {measuredResponse} from './salad-api-core.mjs';

const dir = path.dirname(fileURLToPath(import.meta.url));
const slot = '<scratch>/work/memoracle-model-comparison.json', lock = slot + '.lock';
const prior = JSON.parse(await fs.readFile(slot, 'utf8'));
if (['pending', 'running'].includes(prior.status)) throw new Error('Another comparison owns the shared scope');
if (!process.env.SALAD_AI_GATEWAY_API_KEY) throw new Error('Missing API key');
const source = path.join(dir, 'runs/salad-api-2026-10-15T22-25-16-854Z/inputs');
const cases = JSON.parse(await fs.readFile(path.join(source, 'cases.json'), 'utf8')).grounding;
const prompts = JSON.parse(await fs.readFile(path.join(source, 'prompts.json'), 'utf8'));
const {readQuestion} = await import(pathToFileURL(path.join(source, 'reader.mjs')));
const model = 'qwen3.6-35b-a3b', rate = {input: .06, output: .95}, levels = [24];
const files = {};
for (const file of [fileURLToPath(import.meta.url), ...['core.mjs', 'concurrency-core.mjs', 'salad-api-core.mjs'].map(n => path.join(dir, n)), ...['cases.json', 'prompts.json', 'reader.mjs'].map(n => path.join(source, n))]) {
  files[file] = createHash('sha256').update(await fs.readFile(file)).digest('hex');
}
const spec = {model, rate, rateSource: 'https://docs.salad.com/ai-gateway/reference/pricing', levels, repeats: 1, requestsPerRound: 24, requestsPerLevel: 24, temperature: 0, reasoning: false, readerMaxTokens: 260, answerMaxTokens: 400, files, method: 'Simultaneous waves of independent reader-plus-answer requests. Eight starts at each of offsets 0/1000/2000 ms; up to 24 overlapping workflows. Frozen sources; no retrieval/Discord delivery. Up to three retries per failed API call; Immediate retries from the error handler, zero backoff delay. Unanswered calls retain 10-second timeout. Retry temporary 408/429/5xx, network errors/timeouts, and observed transient HTTP400 model-not-found only. Latency includes retries. Latency includes internet and provider queueing. Report all rubric failures and request errors.'};
spec.id = createHash('sha256').update(JSON.stringify(spec)).digest('hex');
const run = path.join(dir, 'runs', 'salad-api-eight-per-second-immediate-retry-10s-' + new Date().toISOString().replace(/[:.]/g, '-'));
const handle = await fs.open(lock, 'wx');
await handle.writeFile(String(process.pid));
let state = {scope: 'memoracle API concurrency comparison', specId: spec.id, status: 'running', startedAt: new Date().toISOString(), run, workerPid: process.pid, completed: 0, costUsd: 0, previous: {status: prior.status, run: prior.run}};
const buckets = Object.fromEntries(levels.map(n => [n, {rows: [], wallMs: 0, activeCalls: 0, peakActiveCalls: 0, waves: 0}]));
async function persist() {
  await fs.writeFile(path.join(run, 'receipt.json'), JSON.stringify(state, null, 2));
  const tmp = slot + `.${process.pid}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(state, null, 2));
  await fs.rename(tmp, slot);
}
function summary(n) {
  const b = buckets[n], calls = b.rows.flatMap(r => r.calls);
  const stats = summarizeRequests(b.rows, b.wallMs);
  const costUsd = calls.reduce((v, c) => v + c.costUsd, 0);
  return {concurrency: n, ...stats, peakActiveApiCalls: b.peakActiveCalls, calls: calls.length, inputTokens: calls.reduce((v,c) => v + c.inputTokens, 0), outputTokens: calls.reduce((v,c) => v + c.outputTokens, 0), costUsd, usdPer1000Attempts: costUsd / b.rows.length * 1000, usdPer1000Passes: stats.passed ? costUsd / stats.passed * 1000 : null, truncatedCalls: calls.filter(c => c.finishReason === 'length').length, reasoningCalls: calls.filter(c => c.reasoning).length, requestsWithUnknownCharge: b.rows.filter(r => r.error || r.attempts?.length).length, failedApiAttempts: b.rows.reduce((v,r)=>v+(r.attempts?.length??0),0), requestsRetried: b.rows.filter(r=>r.attempts?.some(a=>a.retrying)).length};
}
async function request(c, concurrency, round, requestId, arrival) {
  const calls = [], b = buckets[concurrency];
  const attempts = [];
  async function complete(system, user, maxTokens = 260, answerMode = false) {
    for (let attempt = 0; ; attempt++) {
      try { return await singleCall(system, user, maxTokens, answerMode, attempt); }
      catch (error) {
        const retryable = error.retryable === true || error.name === 'TimeoutError' || error.name === 'TypeError';
        const delayMs = 0;
        attempts.push({kind: answerMode ? 'answer' : 'reader', attempt, error: error.message, status: error.status, retrying: retryable && attempt < 3, delayMs: retryable && attempt < 3 ? delayMs : 0});
        if (!retryable || attempt >= 3) throw error;
        // Retry immediately from the error handler; no backoff timer.
      }
    }
  }
  async function singleCall(system, user, maxTokens, answerMode, attempt) {
    b.activeCalls++; b.peakActiveCalls = Math.max(b.peakActiveCalls, b.activeCalls);
    const started = performance.now();
    try {
      const response = await fetch('https://ai.salad.cloud/v1/chat/completions', {
        method: 'POST', headers: {Authorization: 'Bearer ' + process.env.SALAD_AI_GATEWAY_API_KEY, 'Content-Type': 'application/json'},
        body: JSON.stringify({model, messages: [{role: 'system', content: system}, {role: 'user', content: user}], temperature: 0, max_tokens: maxTokens, stream: false, chat_template_kwargs: {enable_thinking: false}, ...(answerMode ? {stop: ['\n[']} : {})}),
        signal: AbortSignal.timeout(10000),
      });
      const text = await response.text(), ms = performance.now() - started;
      await fs.appendFile(path.join(run, `c${concurrency}`, 'responses.jsonl'), JSON.stringify({requestId, kind: answerMode ? 'answer' : 'reader', status: response.status, retryAfter: response.headers.get('retry-after'), ms, attempt, body: (() => {try{return JSON.parse(text);}catch{return text;}})()}) + '\n');
      if (!response.ok) {
        const retryAfter = response.headers.get('retry-after');
        const retryAfterMs = retryAfter ? (Number.isFinite(Number(retryAfter)) ? Number(retryAfter)*1000 : Math.max(0, Date.parse(retryAfter)-Date.now())) : 0;
        throw Object.assign(new Error(`HTTP ${response.status}`), {status: response.status, retryAfterMs, retryable: [408,429].includes(response.status) || response.status >= 500 || (response.status === 400 && /model.*does not exist/i.test(text))});
      }
      const result = {...measuredResponse(JSON.parse(text), rate), ms, kind: answerMode ? 'answer' : 'reader'};
      calls.push(result);
      state.costUsd += result.costUsd;
      return result.answer;
    } finally { b.activeCalls--; }
  }
  try {
    const read = await readQuestion({complete}, c.line, {recent: c.recent ?? []});
    const question = read?.question ?? c.line;
    const sources = c.sources.map((s, i) => `[${i+1}] ${s.page}\n${s.text}`).join('\n\n');
    const answer = await complete(prompts.SYSTEM_PROMPT, `Question: ${question}\n\nSources:\n\n${sources}\n\nQuestion: ${question}`, 400, true);
    const grade = gradeAnswer(c, answer, c.sources);
    if (read?.unclear) { grade.pass = false; grade.reasons.push('reader blocked as unclear'); }
    return {requestId, caseId: c.id, concurrency, round, line: c.line, read, answer, grade, ms: performance.now() - arrival, calls, attempts, answerOutputTokens: calls.filter(c => c.kind === 'answer').reduce((v,c) => v+c.outputTokens,0)};
  } catch (error) {
    return {requestId, caseId: c.id, concurrency, round, ms: performance.now() - arrival, error: error.message, status: error.status, calls, attempts, grade: {pass: false, reasons: ['request error']}};
  }
}
try {
  await fs.mkdir(run, {recursive: true});
  await fs.writeFile(path.join(run, 'spec.json'), JSON.stringify(spec, null, 2));
  await fs.mkdir(path.join(run, 'inputs'));
  for (const name of ['cases.json', 'prompts.json', 'reader.mjs']) await fs.copyFile(path.join(source, name), path.join(run, 'inputs', name));
  for (const n of levels) await fs.mkdir(path.join(run, `c${n}`));
  await persist(); console.log(run);
  const discovery = await fetch('https://ai.salad.cloud/v1/models', {headers: {Authorization: 'Bearer ' + process.env.SALAD_AI_GATEWAY_API_KEY}, signal: AbortSignal.timeout(30000)});
  if (!discovery.ok) throw new Error(`Model discovery HTTP ${discovery.status}`);
  const models = await discovery.json();
  await fs.writeFile(path.join(run, 'models.json'), JSON.stringify(models, null, 2));
  if (!models.data.some(m => m.id === model)) throw new Error('Requested model unavailable');
  for (let round = 0; round < 1; round++) {
    const order = [...levels.slice(round), ...levels.slice(0, round)];
    for (const concurrency of order) {
      state.concurrency = concurrency; state.round = round; await persist();
      for (const [waveIndex, wave] of makeWaves(cases, concurrency, 24, round).entries()) {
        if (state.costUsd > .95) throw new Error('Experiment reached cost guard');
        const arrival = performance.now();
        const results = await Promise.all(wave.map(async (job, index) => {
          const scheduledOffsetMs = Math.floor(index / 8) * 1000;
          const remaining = arrival + scheduledOffsetMs - performance.now();
          if (remaining > 0) await new Promise(resolve => setTimeout(resolve, remaining));
          const started = performance.now();
          const row = await request(job.case, concurrency, round, `${round}-${job.request}`, started);
          return {...row, scheduledOffsetMs, actualStartOffsetMs: started-arrival};
        }));
        const wallMs = performance.now() - arrival, b = buckets[concurrency];
        b.rows.push(...results); b.wallMs += wallMs; b.waves++;
        await fs.appendFile(path.join(run, `c${concurrency}`, 'waves.jsonl'), JSON.stringify({round, waveIndex, wallMs, results}) + '\n');
        state.completed += results.length;
        await fs.writeFile(path.join(run, `c${concurrency}`, 'summary.json'), JSON.stringify(summary(concurrency), null, 2));
        await persist();
        console.log(`c${concurrency} round ${round+1} wave ${waveIndex+1} ${Math.round(wallMs)}ms ${results.filter(r=>r.grade.pass).length}/${results.length} pass`);
        if (results.some(r => [401, 402, 403, 404].includes(r.status))) throw new Error('Authorization, credit, or model failure; stopping without retries');
      }
    }
  }
  for (const [file, hash] of Object.entries(files)) if (createHash('sha256').update(await fs.readFile(file)).digest('hex') !== hash) throw new Error('Benchmark input changed: ' + file);
  const comparison = levels.map(summary);
  if (comparison.some(s => s.requests !== 24 || s.peakActiveApiCalls > s.concurrency)) throw new Error('Incomplete workload or concurrency not observed');
  await fs.writeFile(path.join(run, 'comparison.json'), JSON.stringify(comparison, null, 2));
  const report = ['# Qwen3.6-35B-A3B Salad API concurrency test', '', 'Eight questions at offsets 0, 1000 and 2000 ms; 24 total, earlier questions may still be running. Each request interprets the messy question and answers from fixed wiki passages. Levels rotate order between rounds. Thinking disabled, temperature zero. Up to three retries per failed API call immediately, without a backoff timer. Latency includes retries.', '', '| Simultaneous requests | Passed | Errors | Median response | p95 response | Requests/sec | USD/1,000 attempts | USD/1,000 passes |', '| --- | --- | --- | --- | --- | --- | --- | --- |'];
  for (const s of comparison) report.push(`| ${s.concurrency} | ${s.passed}/${s.requests} | ${s.errors} | ${(s.latencyMs.median/1000).toFixed(2)} s | ${(s.latencyMs.p95/1000).toFixed(2)} s | ${s.requestsPerSecond.toFixed(2)} | $${s.usdPer1000Attempts.toFixed(3)} | ${s.usdPer1000Passes === null ? 'n/a' : '$'+s.usdPer1000Passes.toFixed(3)} |`);
  report.push('', 'Latency is complete reader-plus-answer response time including network/provider overhead. Throughput divides requests by sum of elapsed wave times, excluding evidence writes. These are repeated short-case bursts, not a sustained-load capacity guarantee. Scores are automatic fact/citation/abstention rubric passes, requiring output review. No streaming TTFT measurement was taken.', '', 'Costs use provider-reported input/output token counts at $0.06/$0.95 per million tokens from https://docs.salad.com/ai-gateway/reference/pricing. They are calculated usage charges, not invoice reconciliation. Failed HTTP requests without usage have unknown charge; no request is silently treated as successful as uncharged. Retry attempts are preserved in wave results and raw responses. Separate production classification/support/background calls are excluded.', '', `Total observed usage-derived cost: $${state.costUsd.toFixed(6)}.`, '');
  await fs.writeFile(path.join(run, 'comparison.md'), report.join('\n'));
  state.status = 'completed-needs-review'; state.finishedAt = new Date().toISOString(); await persist();
} catch (error) {
  state.status = 'failed'; state.error = error.stack;
  await fs.mkdir(run, {recursive: true}); await persist(); process.exitCode = 1;
} finally { await handle.close(); await fs.unlink(lock); }
