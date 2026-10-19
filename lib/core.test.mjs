import {test} from 'node:test';
import assert from 'node:assert/strict';
import {gradeIntent,gradeAnswer,stats,parseNvidiaMemory} from './core.mjs';
test('an ambiguous input cannot pass as a confident rewrite',()=>assert.equal(gradeIntent({unclear:true},{question:'Ancient Crypt',unclear:''}).pass,false));
test('both separate questions and the correct referent are required',()=>{
  const c={all:['harrow','class'],minQuestions:2};
  assert.equal(gradeIntent(c,{question:'where is Harrow and his class',more:[]}).pass,false);
  assert.equal(gradeIntent(c,{question:'where is Harrow',more:['what class is he']}).pass,true);
});
test('a correct fact with a wrong or missing citation fails',()=>{
  const c={facts:['19','44'],citePages:['Fallen Pass']},s=[{page:'Fallen Pass'},{page:'Glass Flats'}];
  for(const a of ['Levels 19 to 44.','Levels 19 to 44 [2].','Levels 19 to 44 [3].'])assert.equal(gradeAnswer(c,a,s).pass,false);
  assert.equal(gradeAnswer(c,'Levels 19 to 44 [1].',s).pass,true);
});
test('empty answers cannot pass negative cases',()=>assert.equal(gradeAnswer({decline:true},'',[]).pass,false));
test('latency summaries retain sample counts',()=>assert.deepEqual(stats([9,1,5]),{n:3,median:5,p95:9}));
test('VRAM telemetry uses dedicated NVIDIA MiB and rejects unavailable values',()=>{
 assert.deepEqual(parseNvidiaMemory('24564, 8184, 16126, 2'),{total:24564*1048576,used:8184*1048576,free:16126*1048576,utilization:2});
 assert.throws(()=>parseNvidiaMemory('24564, N/A, 16126, 2'));
});
