import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import {spawn} from 'node:child_process';
import {createInterface} from 'node:readline';
import {performance} from 'node:perf_hooks';
import {gradeIntent,gradeAnswer,stats} from './core.mjs';
import {measuredResponse} from './salad-api-core.mjs';
const dir=path.dirname(fileURLToPath(import.meta.url));
const run=path.join(dir,'runs','salad-api-'+new Date().toISOString().replace(/[:.]/g,'-'));
const slot='<scratch>/work/memoracle-model-comparison.json',lock=slot+'.lock';
const prior=JSON.parse(await fs.readFile(slot,'utf8'));
if(prior.status==='running'||prior.status==='pending')throw new Error('Another comparison owns this scope');
let handle;
await fs.mkdir(run,{recursive:true});
const cases=JSON.parse(await fs.readFile(path.join(dir,'prepared/cases.json'),'utf8'));
const prompts=JSON.parse(await fs.readFile(path.join(dir,'prepared/prompts.json'),'utf8'));
const {readQuestion}=await import(pathToFileURL(path.join(dir,'prepared/reader.mjs')));
const models=['qwen3.5-9b','qwen3.6-35b-a3b'];
const rates={'qwen3.5-9b':{input:.07,output:.23},'qwen3.6-35b-a3b':{input:.06,output:.95}};
const files={};for(const name of ['prepared/cases.json','prepared/prompts.json','prepared/reader.mjs','core.mjs','salad-api-core.mjs','salad-api-call.ps1','salad-api-run.mjs'])files[name]=createHash('sha256').update(await fs.readFile(path.join(dir,name))).digest('hex');
const spec={models,rates,rateSource:'https://docs.salad.com/ai-gateway/reference/pricing',files,repeats:3,concurrency:1,temperature:0,thinking:false,thinkingControl:'chat_template_kwargs.enable_thinking=false',cases:Object.fromEntries(Object.entries(cases).filter(([,v])=>Array.isArray(v)).map(([k,v])=>[k,v.length])),baseline:path.join(dir,'runs/2026-10-15T09-41-12-711Z/gemma4-e4b'),note:'Frozen prompt/source benchmark, not full production retrieval. API latency includes transport; Gemma baseline local generation. Historical Gemma baseline reused with case/prompt hashes verified against frozen spec. No retries of billable requests; three repetitions are predeclared independent trials.'};
const original=JSON.parse(await fs.readFile(path.join(dir,'prepared/spec.json'),'utf8'));
const baselineReceipt=JSON.parse(await fs.readFile(path.join(dir,'runs/2026-10-15T09-41-12-711Z/receipt.json'),'utf8'));
if(original.id!==baselineReceipt.specId)throw new Error('Baseline spec identity mismatch');
for(const name of ['cases.json','prompts.json','reader.mjs']){
 const expected=original.files.find(f=>path.basename(f.file)===name);if(!expected||expected.sha256!==files['prepared/'+name])throw new Error('Frozen baseline inputs changed: '+name);
}
handle=await fs.open(lock,'wx');await handle.writeFile(String(process.pid));
await fs.writeFile(path.join(run,'spec.json'),JSON.stringify(spec,null,2));
let state={scope:'memoracle API model comparison',status:'running',startedAt:new Date().toISOString(),run,previous:{status:prior.status,run:prior.run},workerPid:process.pid,models,completed:0,costUsd:0};
async function persist(){await fs.writeFile(path.join(run,'receipt.json'),JSON.stringify(state,null,2));await fs.writeFile(slot,JSON.stringify(state,null,2));}
await persist();console.log(run);
const summaries=[];
try{
 for(const model of models){
  state.model=model;state.modelCompleted=0;await persist();
  const output=path.join(run,model);await fs.mkdir(output);const rows=[],calls=[];
  async function complete(system,user,maxTokens=260,answerMode=false){
   if(state.costUsd>=1)throw new Error('Experiment reached $1 cost guard');
   const body={model,messages:[{role:'system',content:system},{role:'user',content:user}],temperature:0,max_tokens:maxTokens,stream:false,chat_template_kwargs:{enable_thinking:false},...(answerMode?{stop:['\n[']}:{})};
   const start=performance.now();
   const networkStart=performance.now();
   const response=await fetch('https://ai.salad.cloud/v1/chat/completions',{method:'POST',headers:{Authorization:'Bearer '+process.env.SALAD_AI_GATEWAY_API_KEY,'Content-Type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(90000)});
   const text=await response.text();
   const raw=response.ok?{ok:true,ms:performance.now()-networkStart,response:JSON.parse(text)}:{ok:false,status:response.status,body:text,ms:performance.now()-networkStart};
   const ms=performance.now()-start;
   await fs.appendFile(path.join(output,'responses.jsonl'),JSON.stringify({index:calls.length,ms,...raw})+'\n');
   if(!raw.ok)throw new Error(`API ${raw.status??'transport'}: ${raw.body??raw.error}`);
   const r=measuredResponse(raw.response,rates[model]);
   const call={...r,ms,providerRequestMs:raw.ms,model:raw.response.model,responseId:raw.response.id};
   calls.push(call);state.costUsd+=call.costUsd;
   return r.answer;
  }
  async function record(row){rows.push(row);await fs.appendFile(path.join(output,'results.jsonl'),JSON.stringify(row)+'\n');state.completed++;state.modelCompleted++;await persist();console.log(`${model} ${rows.length}/138 ${row.task}/${row.id} ${row.grade.pass?'PASS':'FAIL'} ${Math.round(row.ms)}ms`);}
  for(let rep=0;rep<3;rep++){
   const rotate=a=>[...a.slice(rep),...a.slice(0,rep)];
   for(const c of rotate(cases.intent)){
    const start=performance.now(),index=calls.length;const read=await readQuestion({complete},c.line,{recent:c.recent??[],meanings:c.meanings??[]});
    await record({task:'intent',id:c.id,rep,line:c.line,read,grade:gradeIntent(c,read),ms:performance.now()-start,calls:calls.slice(index)});
   }
   for(const c of rotate(cases.grounding)){
    const start=performance.now(),index=calls.length;const read=await readQuestion({complete},c.line,{recent:c.recent??[]});
    const q=read?.question??c.line,sources=c.sources.map((p,i)=>`[${i+1}] ${p.page}\n${p.text}`).join('\n\n');
    const answer=await complete(prompts.SYSTEM_PROMPT,`Question: ${q}\n\nSources:\n\n${sources}\n\nQuestion: ${q}`,400,true);
    const grade=gradeAnswer(c,answer,c.sources);if(read?.unclear){grade.pass=false;grade.reasons.push('reader blocked as unclear');}
    await record({task:'grounding',id:c.id,rep,line:c.line,read,answer,grade,ms:performance.now()-start,calls:calls.slice(index)});
   }
   for(const c of rotate(cases.judge)){
    const start=performance.now(),index=calls.length,answer=await complete(prompts.JUDGE_PROMPT,`Message: ${c.line}`,4);
    const pass=/^(yes|no)\b/i.test(answer)&&/^yes\b/i.test(answer)===c.yes;
    await record({task:'judge',id:c.line,rep,line:c.line,answer,expected:c.yes,grade:{pass,reasons:pass?[]:['wrong game-question decision']},ms:performance.now()-start,calls:calls.slice(index)});
   }
  }
  const tasks={};for(const task of ['intent','grounding','judge']){const subset=rows.filter(r=>r.task===task),c=subset.flatMap(r=>r.calls);const costUsd=c.reduce((n,r)=>n+r.costUsd,0),passed=subset.filter(r=>r.grade.pass).length;tasks[task]={passed,total:subset.length,latencyMs:stats(subset.map(r=>r.ms)),inputTokens:c.reduce((n,r)=>n+r.inputTokens,0),outputTokens:c.reduce((n,r)=>n+r.outputTokens,0),costUsd,usdPer1000Attempts:costUsd/subset.length*1000,usdPer1000Passes:passed?costUsd/passed*1000:null,truncatedCalls:c.filter(r=>r.finishReason==='length').length,reasoningCalls:c.filter(r=>r.reasoning).length};}
  const summary={model,rate:rates[model],tasks,total:rows.length,calls:calls.length,costUsd:calls.reduce((n,r)=>n+r.costUsd,0),inputTokens:calls.reduce((n,r)=>n+r.inputTokens,0),outputTokens:calls.reduce((n,r)=>n+r.outputTokens,0)};
  await fs.writeFile(path.join(output,'summary.json'),JSON.stringify(summary,null,2));summaries.push(summary);
 }
 await fs.writeFile(path.join(run,'comparison.json'),JSON.stringify(summaries,null,2));state.status='completed-needs-review';state.finishedAt=new Date().toISOString();await persist();
}catch(e){state.status='failed';state.error=e.message;await persist();process.exitCode=1;}
finally{await handle.close();await fs.unlink(lock);}
