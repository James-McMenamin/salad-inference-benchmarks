import {test} from 'node:test';
import assert from 'node:assert/strict';
import {measuredResponse} from './salad-api-core.mjs';
const rate={input:.07,output:.23};
const reply=(message,usage={prompt_tokens:2000,completion_tokens:200})=>({choices:[{message,finish_reason:'stop'}],usage});
test('cost uses provider input and output counts',()=>assert.equal(measuredResponse(reply({content:'yes'}),rate).costUsd,.000186));
test('reasoning is retained for cost evidence but never treated as the answer',()=>{
  const r=measuredResponse(reply({content:null,reasoning:'YES'}),rate);assert.equal(r.answer,'');assert.equal(r.reasoning,'YES');assert.equal(r.outputTokens,200);
});
test('missing usage cannot become a free answer',()=>assert.throws(()=>measuredResponse(reply({content:'yes'},{}),rate)));
test('truncation remains visible',()=>{const r=reply({content:'partial'});r.choices[0].finish_reason='length';assert.equal(measuredResponse(r,rate).finishReason,'length');});
