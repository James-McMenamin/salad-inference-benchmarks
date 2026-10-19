export function gradeIntent(c, r) {
  if (!r) return {pass:false,reasons:['unusable reader output']};
  if(c.unclear)return {pass:Boolean(r.unclear),reasons:r.unclear?[]:['guessed ambiguous input']};
  const text=[r.question,...(r.more??[])].join(' ');
  const reasons=[];
  if(r.unclear)reasons.push('unexpected ambiguity');
  if(c.asks&&!c.asks.includes(r.asks))reasons.push(`intent ${r.asks}`);
  for(const p of c.all??[])if(!new RegExp(p,'i').test(text))reasons.push(`missing ${p}`);
  for(const p of c.forbid??[])if(new RegExp(p,'i').test(text))reasons.push(`invented ${p}`);
  if(c.minQuestions&&1+(r.more?.length??0)<c.minQuestions)reasons.push('lost another question');
  return {pass:!reasons.length,reasons};
}
export function gradeAnswer(c,answer,sources) {
  const decline=/the wiki doesn.t say/i.test(answer);
  const citations=[...answer.matchAll(/\[(\d+)\]/g)].map(m=>Number(m[1]));
  const reasons=[];
  if(c.decline){if(!decline)reasons.push('did not decline');}
  else {
    if(decline)reasons.push('declined answerable question');
    for(const fact of c.facts??[])if(!answer.toLowerCase().includes(fact.toLowerCase()))reasons.push(`missing ${fact}`);
    if(!citations.length)reasons.push('no citations');
    for(const page of c.citePages??[])if(!citations.some(n=>sources[n-1]?.page===page))reasons.push(`did not cite ${page}`);
  }
  if(citations.some(n=>n<1||n>sources.length))reasons.push('invalid citation');
  return {pass:!reasons.length,reasons,manualReviewRequired:true};
}
export function stats(values){const v=values.filter(Number.isFinite).sort((a,b)=>a-b);return {n:v.length,median:v.length?v[Math.floor(v.length/2)]:null,p95:v.length?v[Math.min(v.length-1,Math.ceil(v.length*.95)-1)]:null};}
export function parseNvidiaMemory(line){const values=line.trim().split(',').map(s=>Number(s.trim()));if(values.length!==4||values.some(n=>!Number.isFinite(n)||n<0))throw new Error('Invalid NVIDIA memory telemetry');const [total,used,free,utilization]=values;return {total:total*1048576,used:used*1048576,free:free*1048576,utilization};}
