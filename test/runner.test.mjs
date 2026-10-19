import {test} from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {plan, profiles, settings, runBenchmark, retryDelay} from '../lib/runner.mjs';

const count = profile => plan(profile).reduce((n, w) => n + w.jobs.length, 0);
const response = (status, content, usage = {prompt_tokens: 100, completion_tokens: 10}) => new Response(JSON.stringify(status === 200 ? {choices: [{message: {content}, finish_reason: 'stop'}], usage} : {detail: 'service unavailable'}), {status});
const discovery = () => new Response(JSON.stringify({data: [{id: 'qwen3.6-35b-a3b'}]}));
function mock(handler) { return async (url, options) => url.endsWith('/models') ? discovery() : handler(JSON.parse(options.body)); }
const answer = body => response(200, body.max_tokens === 260 ? JSON.stringify({asks: 'what', question: 'what is the level range for Fallen Pass', unclear: ''}) : 'Fallen Pass is for levels 19 to 44 [1].');

test('historical profiles retain every declared workflow and rotating concurrency order', () => {
  assert.equal(count('serial'), 138); assert.equal(count('concurrency'), 384); assert.equal(count('retry16'), 96); assert.equal(count('rate-sweep'), 45);
  for (const n of [4, 8, 12, 16]) assert.equal(count(`burst${n}`), n);
  assert.deepEqual(plan('concurrency').filter(w => w.jobs[0].request === 0).map(w => w.level), [2, 4, 8, 16, 4, 8, 16, 2, 8, 16, 2, 4]);
  for (const p of profiles) assert.ok(count(p) > 0);
});
test('arrival schedules distinguish starts per second from total workflow count', () => {
  for (const rate of [4, 8]) {
    const jobs = plan(`arrival${rate}`)[0].jobs;
    assert.equal(jobs.length, rate * 3);
    assert.deepEqual([...new Set(jobs.map(j => j.offsetMs))], [0, 1000, 2000]);
  }
  assert.equal(plan('stagger16')[0].jobs.at(-1).offsetMs, 937.5);
});
test('retry policies retain original timeout and backoff distinctions', () => {
  assert.deepEqual(settings('arrival4'), {timeoutMs: 90000, maxRetries: 0, backoff: false});
  assert.equal(settings('arrival4-backoff').maxRetries, 3);
  assert.equal(settings('rate-sweep').timeoutMs, 10000);
  assert.equal(retryDelay(0, '5', () => 0), 5000);
  assert.equal(retryDelay(2, '120', () => 0), 60000);
  assert.throws(() => plan('empty'));
});
test('completed burst preserves eight billable calls and separate quality scoring', async () => {
  const events = [], r = await runBenchmark({profile: 'burst4', apiKey: 'test-key'}, {fetchImpl: mock(answer), onEvent: async e => events.push(e)});
  assert.equal(r.attempted, 4); assert.equal(r.status, 'completed');
  assert.equal(r.summaries[0].completed, 4); assert.equal(r.rows.flatMap(r => r.calls).length, 8);
  assert.equal(events.filter(e => e.type === 'response').length, 8);
  assert.ok(!JSON.stringify(events).includes('test-key'));
});
test('failed workflows remain in totals while successful reader usage is retained', async () => {
  const r = await runBenchmark({profile: 'burst4', apiKey: 'test'}, {fetchImpl: mock(body => body.max_tokens === 260 ? answer(body) : response(503))});
  assert.equal(r.attempted, 4); assert.equal(r.summaries[0].completed, 0); assert.equal(r.summaries[0].errors, 4);
  assert.equal(r.summaries[0].completedLatencyMs.n, 0); assert.ok(r.observedCostUsd > 0);
  assert.equal(r.summaries[0].workflowsWithUnreportedAttemptCharges, 4);
});
test('temporary failures retry at most three times per call with immediate policy', async () => {
  let calls = 0;
  const r = await runBenchmark({profile: 'arrival4-immediate', apiKey: 'test'}, {fetchImpl: mock(() => { calls++; return response(503); }), wait: async () => {}});
  assert.equal(r.attempted, 12); assert.equal(calls, 48);
  assert.ok(r.rows.every(r => r.attempts.length === 4 && r.attempts.every(a => a.delayMs === 0)));
});
test('authentication failures stop later waves and missing discovery prevents inference', async () => {
  const r = await runBenchmark({profile: 'concurrency', apiKey: 'test'}, {fetchImpl: mock(() => response(401))});
  assert.equal(r.status, 'stopped-partial'); assert.equal(r.attempted, 2); assert.equal(r.plannedWorkflows, 384);
  let calls = 0;
  await assert.rejects(runBenchmark({profile: 'burst4', apiKey: 'test'}, {fetchImpl: async () => { calls++; return new Response('{"data":[]}'); }}), /unavailable/);
  assert.equal(calls, 1);
});
test('invalid credentials, invalid usage and budget cannot become successful free answers', async () => {
  await assert.rejects(runBenchmark({profile: 'burst4'}), /API_KEY/);
  await assert.rejects(runBenchmark({profile: 'burst4', apiKey: 'test', budgetUsd: 0}), /budget/);
  const r = await runBenchmark({profile: 'burst4', apiKey: 'test'}, {fetchImpl: mock(() => response(200, 'answer', {}))});
  assert.equal(r.summaries[0].completed, 0); assert.equal(r.summaries[0].errors, 4);
});
test('CLI plan requires no credentials and makes no network calls without execute', () => {
  const r = spawnSync(process.execPath, ['bench.mjs', 'concurrency'], {cwd: new URL('../', import.meta.url), encoding: 'utf8', env: {...process.env, SALAD_AI_GATEWAY_API_KEY: ''}});
  assert.equal(r.status, 0, r.stderr);
  assert.equal(JSON.parse(r.stdout).plannedWorkflows, 384);
});
