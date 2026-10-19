import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {profiles, plan, settings, historicalRates, runBenchmark} from './lib/runner.mjs';

const args = process.argv.slice(2), profile = args.find(x => !x.startsWith('--')) ?? 'serial';
const modelArg = args.find(x => x.startsWith('--model='));
const model = modelArg?.slice(8) ?? 'qwen3.6-35b-a3b';
const allowed = new Set(['--execute', '--help', modelArg].filter(Boolean));
if (args.some(x => x.startsWith('--') && !allowed.has(x))) throw new Error('Unknown option');
if (args.includes('--help')) {
  console.log('node bench.mjs <profile> [--model=model-id] [--execute]\nProfiles: ' + profiles.join(', ') + '\nWithout --execute, prints a plan and makes no network requests. Rates are historical October 2026 assumptions.');
} else {
  const schedule = plan(profile), rate = historicalRates[model];
  if (!rate) throw new Error('Model has no recorded historical rate');
  const files = {};
  for (const name of ['fixtures/cases.json', 'fixtures/prompts.json', 'fixtures/reader.mjs', 'lib/runner.mjs', 'lib/core.mjs', 'lib/salad-api-core.mjs', 'lib/concurrency-core.mjs', 'bench.mjs']) files[name] = createHash('sha256').update(await fs.readFile(new URL(name, import.meta.url))).digest('hex');
  const spec = {profile, model, settings: settings(profile), rate, historicalPriceReference: 'https://docs.salad.com/ai-gateway/reference/pricing', plannedWorkflows: schedule.reduce((n, w) => n + w.jobs.length, 0), waves: schedule.length, files, note: 'Portable rerun, not an original October measurement. Short fixed-fixture waves, not sustained capacity. Rates are historical estimates, not reconciled billing. Failed attempts without usage have unknown charges; usage budget is best effort and concurrent calls may exceed it.'};
  console.log(JSON.stringify(spec, null, 2));
  if (args.includes('--execute')) {
    if (!process.env.SALAD_AI_GATEWAY_API_KEY) throw new Error('Missing SALAD_AI_GATEWAY_API_KEY');
    const run = path.resolve('new-runs', new Date().toISOString().replace(/[:.]/g, '-') + '-' + profile);
    await fs.mkdir(run, {recursive: true});
    await fs.writeFile(path.join(run, 'spec.json'), JSON.stringify(spec, null, 2));
    let chain = Promise.resolve();
    const onEvent = event => chain = chain.then(() => fs.appendFile(path.join(run, 'events.jsonl'), JSON.stringify(event) + '\n'));
    try {
      const result = await runBenchmark({profile, model, apiKey: process.env.SALAD_AI_GATEWAY_API_KEY}, {onEvent});
      for (const [name, hash] of Object.entries(files)) if (createHash('sha256').update(await fs.readFile(new URL(name, import.meta.url))).digest('hex') !== hash) throw new Error('Inputs changed during run');
      await fs.writeFile(path.join(run, 'results.json'), JSON.stringify(result, null, 2));
      console.log(JSON.stringify({run, status: result.status, attempted: result.attempted, summaries: result.summaries}, null, 2));
      if (result.status !== 'completed') process.exitCode = 1;
    } catch (error) {
      await fs.writeFile(path.join(run, 'failure.json'), JSON.stringify({status: 'failed', error: error.message}, null, 2));
      process.exitCode = 1; console.error(error.message);
    }
  }
}
