import fs from 'node:fs/promises';
import {performance} from 'node:perf_hooks';
import {readQuestion} from '../fixtures/reader.mjs';
import {gradeIntent, gradeAnswer, stats} from './core.mjs';
import {measuredResponse} from './salad-api-core.mjs';
import {makeWaves} from './concurrency-core.mjs';

export const fixtures = JSON.parse(await fs.readFile(new URL('../fixtures/cases.json', import.meta.url)));
const prompts = JSON.parse(await fs.readFile(new URL('../fixtures/prompts.json', import.meta.url)));
export const historicalRates = {'qwen3.5-9b': {input: .07, output: .23}, 'qwen3.6-35b-a3b': {input: .06, output: .95}, 'qwen3.6-27b': {input: .29, output: 1.90}};
export const profiles = ['serial', 'concurrency', 'retry16', 'burst4', 'burst8', 'burst12', 'burst16', 'stagger16', 'arrival4', 'arrival8', 'arrival4-backoff', 'arrival4-immediate', 'arrival8-immediate', 'arrival8-10s', 'rate-sweep'];

export function plan(profile) {
  if (!profiles.includes(profile)) throw new Error('Unknown profile');
  const waves = [], add = (level, count, round, perSecond = null, stagger = 0) => {
    for (const jobs of makeWaves(fixtures.grounding, level, count, round)) waves.push({level, round, jobs: jobs.map((j, i) => ({...j, task: 'grounding', offsetMs: perSecond ? Math.floor(i / perSecond) * 1000 : i * stagger}))});
  };
  if (profile === 'serial') {
    for (let round = 0; round < 3; round++) for (const task of ['intent', 'grounding', 'judge']) {
      const a = fixtures[task], rotated = [...a.slice(round), ...a.slice(0, round)];
      for (const [request, c] of rotated.entries()) waves.push({level: 1, round, jobs: [{case: c, request, task, offsetMs: 0}]});
    }
  } else if (profile === 'concurrency') {
    const levels = [2, 4, 8, 16];
    for (let round = 0; round < 3; round++) for (const n of [...levels.slice(round), ...levels.slice(0, round)]) add(n, 32, round);
  } else if (profile === 'retry16') {
    for (let round = 0; round < 3; round++) add(16, 32, round);
  } else if (profile === 'rate-sweep') {
    for (const rate of [1, 2, 4, 8]) add(rate * 3, rate * 3, 0, rate);
  } else if (profile.startsWith('arrival')) {
    const rate = profile.startsWith('arrival4') ? 4 : 8;
    add(rate * 3, rate * 3, 0, rate);
  } else if (profile === 'stagger16') add(16, 16, 0, null, 62.5);
  else { const n = Number(profile.slice(5)); add(n, n, 0); }
  return waves;
}

export function settings(profile) {
  plan(profile);
  return {timeoutMs: ['rate-sweep', 'arrival8-10s'].includes(profile) ? 10000 : 90000,
    maxRetries: /backoff|immediate|10s/.test(profile) || ['retry16', 'rate-sweep'].includes(profile) ? 3 : 0,
    backoff: profile.includes('backoff') || profile === 'retry16'};
}

export function retryDelay(attempt, header, random = Math.random) {
  const n = Number(header), date = Date.parse(header);
  const retryAfter = header ? (Number.isFinite(n) ? n * 1000 : Math.max(0, date - Date.now())) : 0;
  return Math.min(60000, Math.max(2000 * 2 ** attempt + random() * 500, Number.isFinite(retryAfter) ? retryAfter : 0));
}

export async function runBenchmark({profile, model = 'qwen3.6-35b-a3b', apiKey, rate = historicalRates[model], budgetUsd = .95},
  {fetchImpl = globalThis.fetch, wait = ms => new Promise(r => setTimeout(r, ms)), now = () => performance.now(), onEvent = async () => {}, random = Math.random} = {}) {
  if (!apiKey) throw new Error('Set SALAD_AI_GATEWAY_API_KEY');
  if (!rate || ![rate.input, rate.output].every(x => Number.isFinite(x) && x >= 0)) throw new Error('Invalid explicit token rates');
  if (!Number.isFinite(budgetUsd) || budgetUsd <= 0) throw new Error('Invalid usage budget');
  const schedule = plan(profile), cfg = settings(profile), rows = [], waveTimes = [];
  let observedCostUsd = 0, stopped = false, discovery;
  // Deliberately fixed endpoint: credentials cannot be redirected by a CLI URL.
  const discovered = await fetchImpl('https://ai.salad.cloud/v1/models', {headers: {Authorization: 'Bearer ' + apiKey}, signal: AbortSignal.timeout(30000)});
  discovery = await discovered.json();
  await onEvent({type: 'discovery', status: discovered.status, body: discovery});
  if (!discovered.ok) throw new Error(`Model discovery HTTP ${discovered.status}`);
  if (!discovery.data?.some(m => m.id === model)) throw new Error('Requested model unavailable');
  for (const [waveIndex, wave] of schedule.entries()) {
    const start = now();
    const results = await Promise.all(wave.jobs.map(async (job, lane) => {
      const remaining = start + job.offsetMs - now();
      if (remaining > 0) await wait(remaining);
      // Burst/stagger historical latency starts at wave arrival; arrival-rate
      // profiles start each workflow at its actual scheduled arrival.
      const arrival = profile.startsWith('arrival') || profile === 'rate-sweep' ? now() : start;
      const calls = [], attempts = [], id = `${waveIndex}-${lane}`;
      async function complete(system, user, maxTokens = 260, answerMode = false) {
        for (let attempt = 0; ; attempt++) {
          let status, retryAfter;
          try {
            if (observedCostUsd >= budgetUsd) throw Object.assign(new Error('Usage budget reached'), {terminal: true});
            const body = {model, messages: [{role: 'system', content: system}, {role: 'user', content: user}], temperature: 0, max_tokens: maxTokens, stream: false, chat_template_kwargs: {enable_thinking: false}, ...(answerMode ? {stop: ['\n[']} : {})};
            const t = now(), response = await fetchImpl('https://ai.salad.cloud/v1/chat/completions', {method: 'POST', headers: {Authorization: 'Bearer ' + apiKey, 'Content-Type': 'application/json'}, body: JSON.stringify(body), signal: AbortSignal.timeout(cfg.timeoutMs)});
            status = response.status; retryAfter = response.headers.get('retry-after');
            const raw = await response.text(); let parsed;
            try { parsed = JSON.parse(raw); } catch { parsed = raw; }
            await onEvent({type: 'response', id, kind: answerMode ? 'answer' : 'reader', attempt, status, retryAfter, ms: now() - t, body: parsed});
            if (!response.ok) throw Object.assign(new Error(`HTTP ${status}`), {retryable: [408, 429].includes(status) || status >= 500 || (status === 400 && /model.*does not exist/i.test(raw))});
            const call = {...measuredResponse(parsed, rate), kind: answerMode ? 'answer' : 'reader', ms: now() - t};
            calls.push(call); observedCostUsd += call.costUsd;
            return call.answer;
          } catch (error) {
            const retryable = !error.terminal && (error.retryable || ['TimeoutError', 'TypeError'].includes(error.name));
            const retrying = Boolean(retryable && attempt < cfg.maxRetries);
            const delayMs = retrying && cfg.backoff ? retryDelay(attempt, retryAfter, random) : 0;
            const failed = {kind: answerMode ? 'answer' : 'reader', attempt, status, error: status ? `HTTP ${status}` : error.terminal ? 'Usage budget reached' : error.name, retrying, delayMs};
            attempts.push(failed); await onEvent({type: 'attempt-error', id, ...failed});
            if (!retrying) throw Object.assign(new Error(failed.error), {status});
            if (delayMs) await wait(delayMs);
          }
        }
      }
      try {
        const c = job.case; let read, answer, grade;
        if (job.task === 'judge') {
          answer = await complete(prompts.JUDGE_PROMPT, `Message: ${c.line}`, 4);
          const pass = /^(yes|no)\b/i.test(answer) && /^yes\b/i.test(answer) === c.yes;
          grade = {pass, reasons: pass ? [] : ['wrong game-question decision']};
        } else {
          read = await readQuestion({complete}, c.line, {recent: c.recent ?? [], meanings: job.task === 'intent' ? c.meanings ?? [] : []});
          if (job.task === 'intent') grade = gradeIntent(c, read);
          else {
            const question = read?.question ?? c.line, sources = c.sources.map((s, i) => `[${i + 1}] ${s.page}\n${s.text}`).join('\n\n');
            answer = await complete(prompts.SYSTEM_PROMPT, `Question: ${question}\n\nSources:\n\n${sources}\n\nQuestion: ${question}`, 400, true);
            grade = gradeAnswer(c, answer, c.sources);
            if (read?.unclear) { grade.pass = false; grade.reasons.push('reader blocked as unclear'); }
          }
        }
        return {id, task: job.task, caseId: c.id ?? c.line, round: wave.round, level: wave.level, offsetMs: job.offsetMs, read, answer, grade, calls, attempts, ms: now() - arrival};
      } catch (error) {
        return {id, task: job.task, caseId: job.case.id ?? job.case.line, round: wave.round, level: wave.level, status: error.status, error: error.message, grade: {pass: false, reasons: ['request error']}, calls, attempts, ms: now() - arrival};
      }
    }));
    const wallMs = now() - start; waveTimes.push({level: wave.level, wallMs}); rows.push(...results);
    await onEvent({type: 'wave', waveIndex, wallMs, results});
    if (results.some(r => [401, 402, 403, 404].includes(r.status) || r.error === 'Usage budget reached')) { stopped = true; break; }
  }
  const summaries = [...new Set(rows.map(r => `${r.task}:${r.level}`))].map(group => {
    const [task, level] = group.split(':'), selected = rows.filter(r => r.task === task && r.level === Number(level)), completed = selected.filter(r => !r.error);
    return {task, level: Number(level), attempted: selected.length, completed: completed.length, passed: selected.filter(r => r.grade.pass).length, errors: selected.length - completed.length, allAttemptLatencyMs: stats(selected.map(r => r.ms)), completedLatencyMs: stats(completed.map(r => r.ms)), usageDerivedCostUsd: selected.flatMap(r => r.calls).reduce((n, c) => n + c.costUsd, 0), workflowsWithUnreportedAttemptCharges: selected.filter(r => r.attempts.length).length};
  });
  return {profile, model, settings: cfg, rate, plannedWorkflows: schedule.reduce((n, w) => n + w.jobs.length, 0), attempted: rows.length, status: stopped ? 'stopped-partial' : 'completed', observedCostUsd, summaries, waveTimes, rows};
}
