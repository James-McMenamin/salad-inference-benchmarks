import fs from 'node:fs/promises';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {performance} from 'node:perf_hooks';
import {createReadStream} from 'node:fs';
import {createHash} from 'node:crypto';
import {execFile,spawn} from 'node:child_process';
import {promisify} from 'node:util';
import {gradeIntent,gradeAnswer,stats,parseNvidiaMemory} from './core.mjs';
const [specFile,modelId,output]=process.argv.slice(2);
const spec=JSON.parse(await fs.readFile(specFile,'utf8')),m=spec.models.find(m=>m.id===modelId),dir=path.dirname(specFile);
if(!m)throw new Error('Unknown model');
process.env.GGML_VK_VISIBLE_DEVICES='0';
const nvidiaArgs=['--id=0','--query-gpu=memory.total,memory.used,memory.free,utilization.gpu','--format=csv,noheader,nounits'];
const vram=async()=>parseNvidiaMemory((await promisify(execFile)('nvidia-smi',nvidiaArgs,{windowsHide:true,timeout:10000})).stdout);
let processResources=null;
if(spec.settings.admission==='shared-cpu'){
 const r=await promisify(execFile)('powershell.exe',['-NoProfile','-Command',`$p=Get-Process -Id ${process.pid}; $p.PriorityClass='BelowNormal'; $p.ProcessorAffinity=[IntPtr]::new([long]${spec.settings.affinityMask}); @{pid=$p.Id;priority=$p.PriorityClass.ToString();affinity=$p.ProcessorAffinity.ToInt64()}|ConvertTo-Json -Compress`],{windowsHide:true});
 processResources=JSON.parse(r.stdout.trim());
}
const digest=createHash('sha256');for await(const chunk of createReadStream(m.file))digest.update(chunk);
if(digest.digest('hex')!==m.sha256)throw new Error('Model changed since preparation');
await fs.mkdir(output,{recursive:true});
const cases=JSON.parse(await fs.readFile(path.join(dir,'cases.json'),'utf8'));
const prompts=JSON.parse(await fs.readFile(path.join(dir,'prompts.json'),'utf8'));
const {readQuestion}=await import(pathToFileURL(path.join(dir,'reader.mjs')));
const {getLlama,LlamaChatSession,Gemma4ChatWrapper}=await import(pathToFileURL(spec.runtime));
const started=performance.now();
const llama=await getLlama({gpu:spec.settings.gpu});
const baseline=await vram();
const loadStart=performance.now();
const model=await llama.loadModel({modelPath:m.file,gpuLayers:'max'});
const afterModel=await vram();
const loadMs=performance.now()-loadStart;
const options={contextSize:spec.settings.contextSize,threads:spec.settings.threads,batchSize:spec.settings.batchSize};
const context=await model.createContext(options),sequence=context.getSequence();
const afterContext=await vram();
const second=await model.createContext(options),afterSecondContext=await vram();
const secondStateBytes=second.stateSize;await second.dispose();
const metadata={model:m,specId:spec.id,gpu:llama.gpu,devices:await llama.getGpuDeviceNames(),visibleVulkanDevices:'0',memoryTelemetry:'nvidia-smi dedicated GPU index 0',architecture:model.architecture,gpuLayers:model.gpuLayers,modelMemoryBytes:model.size,serializedEmptyContextBytes:context.stateSize,serializedEmptySecondContextBytes:secondStateBytes,contextSize:context.contextSize,batchSize:context.batchSize,baseline,afterModel,afterContext,afterSecondContext,loadMs,setupMs:performance.now()-started,ramAfterLoad:process.memoryUsage(),settings:spec.settings,processResources,chatWrapper:null};
if(metadata.devices.length!==1||!metadata.devices[0].includes('3090 Ti'))throw new Error('Benchmark must use only the NVIDIA 3090 Ti');
await fs.writeFile(path.join(output,'metadata.json'),JSON.stringify(metadata,null,2));
let peak=afterContext.used;
const samples=[];
let pendingSample='',telemetryError=null;
const telemetry=spawn('nvidia-smi',[...nvidiaArgs,'--loop-ms=500'],{windowsHide:true,stdio:['ignore','pipe','pipe']});
telemetry.stdout.on('data',chunk=>{pendingSample+=chunk;const lines=pendingSample.split(/\r?\n/);pendingSample=lines.pop();for(const line of lines){if(!line.trim())continue;try{const v=parseNvidiaMemory(line);peak=Math.max(peak,v.used);samples.push({at:Date.now(),...v,rss:process.memoryUsage().rss});}catch(e){telemetryError=e.message;}}});
telemetry.on('error',e=>{telemetryError=e.message;});
const calls=[];
async function complete(system,user,maxTokens=260,answerMode=false){
 await sequence.clearHistory();
 const session=new LlamaChatSession({contextSequence:sequence,systemPrompt:system,...(modelId.startsWith('gemma')?{chatWrapper:new Gemma4ChatWrapper({reasoning:false})}:{})});
 metadata.chatWrapper=session.chatWrapper.wrapperName;
 let first=null;const t=performance.now(),before=sequence.tokenMeter.getState();
 try{
  const answer=await session.prompt(user+(modelId.startsWith('qwen')?' /no_think':''),{temperature:0,seed:42,maxTokens,signal:AbortSignal.timeout(120000),...(answerMode?{customStopTriggers:['\n[']}:{}),budgets:{thoughtTokens:0},onToken:tokens=>{if(tokens.length&&first===null)first=performance.now();}});
  const dt=performance.now()-t,tokens=sequence.tokenMeter.diff(before);
  calls.push({ms:dt,ttftMs:first===null?null:first-t,inputTokens:tokens.usedInputTokens,outputTokens:tokens.usedOutputTokens,tokensPerSecond:tokens.usedOutputTokens/(dt/1000),ram:process.memoryUsage()});
  return answer.replace(/<think>[\s\S]*?<\/think>/g,'').trim();
 }finally{session.dispose({disposeSequence:false});}
}
const results=[];
async function record(row){results.push(row);await fs.appendFile(path.join(output,'results.jsonl'),JSON.stringify(row)+'\n');console.log(`${modelId} ${results.length} ${row.task}/${row.id} ${row.grade.pass?'PASS':'FAIL'} ${Math.round(row.ms)}ms`);}
try{
 await complete('Reply briefly.','Say ready.',12);calls.length=0;
 for(let rep=0;rep<spec.settings.repeats;rep++){
  // Rotate case order across repetitions; all models receive identical orders.
  const rotate=a=>[...a.slice(rep),...a.slice(0,rep)];
  for(const c of rotate(cases.intent)){
   const start=performance.now(),index=calls.length;
   const read=await readQuestion({complete},c.line,{recent:c.recent??[],meanings:c.meanings??[]});
   await record({task:'intent',id:c.id,group:c.group,rep,line:c.line,read,grade:gradeIntent(c,read),ms:performance.now()-start,calls:calls.slice(index)});
  }
  for(const c of rotate(cases.grounding)){
   const start=performance.now(),index=calls.length;
   const read=await readQuestion({complete},c.line,{recent:c.recent??[]});
   const q=read?.question??c.line;
   const sources=c.sources.map((p,i)=>`[${i+1}] ${p.page}\n${p.text}`).join('\n\n');
   const answer=await complete(prompts.SYSTEM_PROMPT,`Question: ${q}\n\nSources:\n\n${sources}\n\nQuestion: ${q}`,400,true);
   const grade=gradeAnswer(c,answer,c.sources);if(read?.unclear){grade.pass=false;grade.reasons.push('reader blocked as unclear');}
   await record({task:'grounding',id:c.id,rep,line:c.line,read,answer,grade,ms:performance.now()-start,calls:calls.slice(index)});
  }
  for(const [i,c] of rotate(cases.judge).entries()){
   const start=performance.now(),index=calls.length,answer=await complete(prompts.JUDGE_PROMPT,`Message: ${c.line}`,4);
   const valid=/^(yes|no)\b/i.test(answer),yes=/^yes\b/i.test(answer),pass=valid&&yes===c.yes;
   await record({task:'judge',id:c.line,rep,line:c.line,answer,expected:c.yes,grade:{pass,reasons:pass?[]:['wrong game-question decision']},ms:performance.now()-start,calls:calls.slice(index)});
  }
 }
 const tasks={};for(const task of ['intent','grounding','judge']){const rows=results.filter(r=>r.task===task);tasks[task]={passed:rows.filter(r=>r.grade.pass).length,total:rows.length,latencyMs:stats(rows.map(r=>r.ms)),ttftMs:stats(rows.flatMap(r=>r.calls.map(c=>c.ttftMs)))};}
 if(telemetryError||!samples.length)throw new Error(`NVIDIA telemetry failed: ${telemetryError??'no samples'}`);
 const summary={...metadata,tasks,total:results.length,peakDeviceVramBytes:peak,incrementalPeakVramBytes:peak-baseline.used,latencyMs:stats(results.map(r=>r.ms)),generationTokensPerSecond:stats(calls.map(c=>c.tokensPerSecond)),note:'Automatic rubric scores require human factual review. NVIDIA dedicated VRAM includes other applications; incremental deltas are reported separately. Single-request benchmark, not concurrent throughput.'};
 await fs.writeFile(path.join(output,'summary.json'),JSON.stringify(summary,null,2));
 await fs.writeFile(path.join(output,'samples.json'),JSON.stringify(samples));
}finally{telemetry.kill();await context.dispose();await model.dispose();}
