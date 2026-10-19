import {test} from 'node:test';
import assert from 'node:assert/strict';
import {computeCost} from './salad-cost.mjs';
test('cost uses elapsed time, not summed overlapping request durations',()=>{
  const r=computeCost({hourlyUsd:0.15,elapsedMs:3_600_000,passed:1000});
  assert.equal(r.computeUsd,0.15);assert.equal(r.usdPerThousandSuccessfulAnswers,0.15);
});
test('failed answers do not reduce the apparent cost per successful answer',()=>{
  assert.equal(computeCost({hourlyUsd:0.15,elapsedMs:3_600_000,passed:500}).usdPerThousandSuccessfulAnswers,0.30);
});
test('zero successful answers has no finite cost per answer',()=>{
  assert.equal(computeCost({hourlyUsd:0.15,elapsedMs:1000,passed:0}).usdPerSuccessfulAnswer,null);
});
test('missing measurements and invalid rates cannot produce cost evidence',()=>{
  for(const args of [{hourlyUsd:0,elapsedMs:1,passed:1},{hourlyUsd:0.15,elapsedMs:0,passed:1},{hourlyUsd:0.15,elapsedMs:1,passed:-1}]) assert.throws(()=>computeCost(args));
});
