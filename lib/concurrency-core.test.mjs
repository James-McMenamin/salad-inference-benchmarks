import {test} from 'node:test';
import assert from 'node:assert/strict';
import {makeWaves,summarizeRequests} from './concurrency-core.mjs';
test('each concurrency uses the same jobs without dropping or duplicating arrivals',()=>{
 const cases=[{id:'a'},{id:'b'},{id:'c'}];
 const baseline=makeWaves(cases,1).flat();
 for(const concurrency of [2,4,8,16]){
  const waves=makeWaves(cases,concurrency);
  assert.deepEqual(waves.flat(),baseline);
  assert.equal(waves.length,32/concurrency);
  assert.ok(waves.every(w=>w.length===concurrency));
 }
});
test('throughput uses elapsed wave time, not the sum of overlapping response times',()=>{
 const r=summarizeRequests([{ms:100,firstAnswerTokenMs:50,grade:{pass:true},answerOutputTokens:5},{ms:120,firstAnswerTokenMs:60,grade:{pass:false},answerOutputTokens:7}],120);
 assert.equal(r.requestsPerSecond,2/.12);assert.equal(r.answerTokensPerSecond,100);assert.equal(r.passed,1);assert.equal(r.latencyMs.p95,120);
});
test('failed requests remain in totals and cannot count as successful answers',()=>{
 const r=summarizeRequests([{ms:200,error:'OOM',grade:{pass:false}}],200);assert.equal(r.requests,1);assert.equal(r.errors,1);assert.equal(r.passed,0);
});
test('empty workload cannot be a passing test',()=>assert.throws(()=>makeWaves([],16)));
