import fs from 'node:fs/promises';
import {createReadStream} from 'node:fs';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {performance} from 'node:perf_hooks';
import {execFile,spawn} from 'node:child_process';
import {promisify} from 'node:util';
import {gradeAnswer,parseNvidiaMemory} from './core.mjs';
import {makeWaves,summarizeRequests} from './concurrency-core.mjs';
const exec=promisify(execFile),[specFile,n,out]=process.argv.slice(2),concurrency=Number(n);
const spec=JSON.parse(await fs.readFile(specFile,'utf8'));
await fs.mkdir(out,{recursive:true});
const resource=JSON.parse((await exec('powershell.exe',['-NoProfile','-Command',`$p=Get-Process -Id ${process.pid};$p.PriorityClass='BelowNormal';$p.ProcessorAffinity=[IntPtr]::new([long]${spec.settings.affinityMask});@{pid=$p.Id;priority=$p.PriorityClass.ToString();affinity=$p.ProcessorAffinity.ToInt64()}|ConvertTo-Json -Compress`],{windowsHide:true})).stdout);
const digest=createHash('sha256');for await(const chunk of createReadStream(spec.model.file))digest.update(chunk);
if(digest.digest('hex')!==spec.model.sha256)throw new Error('Model checksum changed');
const args=['--id=0','--query-gpu=memory.total,memory.used,memory.free,utilization.gpu','--format=csv,noheader,nounits'];
const memory=async()=>parseNvidiaMemory((await exec('nvidia-smi',args,{windowsHide:true,timeout:10000})).stdout);
const host=async()=>JSON.parse((await exec('powershell.exe',['-NoProfile','-Command',"$m=Get-CimInstance Win32_OperatingSystem;$c=Get-CimInstance Win32_Processor;@{cpuPercent=($c|Measure-Object LoadPercentage -Average).Average;freeRamKiB=$m.FreePhysicalMemory}|ConvertTo-Json -Compress"],{windowsHide:true})).stdout);
const baseline=await memory(),hostBefore=await host();
const {getLlama,LlamaChatSession,Gemma4ChatWrapper}=await import(pathToFileURL(spec.runtime));
const {readQuestion}=await import(pathToFileURL(spec.reader));
const cases=JSON.parse(await fs.readFile(spec.cases,'utf8')).grounding,prompts=JSON.parse(await fs.readFile(spec.prompts,'utf8'));
const llama=await getLlama({gpu:'vulkan',build:'never',maxThreads:2});
const devices=await llama.getGpuDeviceNames();if(devices.length!==1||!devices[0].includes('3090 Ti'))throw new Error(`Unexpected GPU: ${devices}`);
let model,context,telemetry;
let samples=[],pending='',telemetryError=null,phase='setup',round=-1;
try{
 const loadStart=performance.now();model=await llama.loadModel({modelPath:spec.model.file,gpuLayers:'max'});
 const afterModel=await memory(),loadMs=performance.now()-loadStart;
 const allocationStart=performance.now();
 context=await model.createContext({sequences:concurrency,contextSize:4096,batchSize:512,threads:2,failedCreationRemedy:false});
 if(context.contextSize!==4096)throw new Error('Context size changed');
 const allocationMs=performance.now()-allocationStart,afterContexts=await memory();
 const sequences=Array.from({length:concurrency},()=>context.getSequence());
 const metadata={specId:spec.id,concurrency,settings:spec.settings,resource,devices,gpuLayers:model.gpuLayers,modelMemoryBytes:model.size,contextSizePerRequest:context.contextSize,baseline,afterModel,afterContexts,loadMs,allocationMs,hostBefore};
 await fs.writeFile(path.join(out,'metadata.json'),JSON.stringify(metadata,null,2));
 telemetry=spawn('nvidia-smi',[...args,'--loop-ms=200'],{windowsHide:true,stdio:['ignore','pipe','pipe']});
 telemetry.stdout.on('data',chunk=>{pending+=chunk;const lines=pending.split(/\r?\n/);pending=lines.pop();for(const line of lines){if(!line.trim())continue;try{samples.push({at:Date.now(),phase,round,...parseNvidiaMemory(line),rss:process.memoryUsage().rss});}catch(e){telemetryError=e.message;}}});
 telemetry.on('error',e=>{telemetryError=e.message;});
 async function request(c,lane,arrival,requestId){
  const sequence=sequences[lane],calls=[];
  async function complete(system,user,maxTokens=260,answerMode=false){
   await sequence.clearHistory();
   const session=new LlamaChatSession({contextSequence:sequence,systemPrompt:system,chatWrapper:new Gemma4ChatWrapper({reasoning:false})});
   let first=null;const t=performance.now(),before=sequence.tokenMeter.getState();
   try{
    const answer=await session.prompt(user,{temperature:0,seed:42,maxTokens,signal:AbortSignal.timeout(180000),budgets:{thoughtTokens:0},...(answerMode?{customStopTriggers:['\n[']}:{}),onToken:tokens=>{if(tokens.length&&first===null)first=performance.now();}});
    const tokens=sequence.tokenMeter.diff(before);calls.push({kind:answerMode?'answer':'reader',ms:performance.now()-t,firstTokenFromArrivalMs:first===null?null:first-arrival,...tokens});return answer.trim();
   }finally{session.dispose({disposeSequence:false});}
  }
  try{
   const read=await readQuestion({complete},c.line,{recent:c.recent??[]});
   const q=read?.question??c.line,sources=c.sources.map((s,i)=>`[${i+1}] ${s.page}\n${s.text}`).join('\n\n');
   const answer=await complete(prompts.SYSTEM_PROMPT,`Question: ${q}\n\nSources:\n\n${sources}\n\nQuestion: ${q}`,400,true);
   const grade=gradeAnswer(c,answer,c.sources);if(read?.unclear){grade.pass=false;grade.reasons.push('reader blocked as unclear');}
   return {requestId,caseId:c.id,lane,round,line:c.line,read,answer,grade,ms:performance.now()-arrival,firstAnswerTokenMs:calls.find(c=>c.kind==='answer')?.firstTokenFromArrivalMs??null,answerOutputTokens:calls.filter(c=>c.kind==='answer').reduce((n,c)=>n+c.usedOutputTokens,0),calls};
  }catch(e){return {requestId,caseId:c.id,lane,round,line:c.line,ms:performance.now()-arrival,error:e.stack,grade:{pass:false,reasons:['request error']},calls};}
 }
 // One simultaneous warmup on every slot, excluded from recorded workload timing.
 phase='warmup';await Promise.all(sequences.map((_,i)=>request(cases[i%cases.length],i,performance.now(),`warmup-${i}`)));
 const all=[],rounds=[];
 phase='measurement';
 for(round=0;round<3;round++){
  const waves=makeWaves(cases,concurrency,32,round);let elapsed=0;const rows=[];
  for(const [waveIndex,wave] of waves.entries()){
   const arrival=performance.now();
   const completed=await Promise.all(wave.map((job,lane)=>request(job.case,lane,arrival,`${round}-${job.request}`)));
   const waveMs=performance.now()-arrival;elapsed+=waveMs;
   const waveRecord={round,wave:waveIndex,concurrency,waveMs,requests:completed};
   await fs.appendFile(path.join(out,'waves.jsonl'),JSON.stringify(waveRecord)+'\n');rows.push(...completed);all.push(...completed);
   console.log(`concurrency=${concurrency} round=${round+1} wave=${waveIndex+1}/${waves.length} ${waveMs.toFixed(0)}ms ${completed.filter(r=>r.grade.pass).length}/${completed.length} rubric passes`);
   if(completed.some(r=>r.error))throw new Error('Request failed; retaining full wave without retry');
  }
  rounds.push(summarizeRequests(rows,elapsed));
 }
 phase='finished';
 if(telemetryError||!samples.some(s=>s.phase==='measurement'))throw new Error(`Missing NVIDIA telemetry: ${telemetryError??'no measurement samples'}`);
 const measured=samples.filter(s=>s.phase==='measurement'),peak=Math.max(afterContexts.used,...measured.map(s=>s.used));
 const summary={...metadata,...summarizeRequests(all,rounds.reduce((n,r)=>n+r.wallMs,0)),rounds,peakDeviceVramBytes:peak,incrementalPeakVramBytes:peak-baseline.used,afterWorkload:await memory(),hostAfter:await host(),sampleCount:measured.length,peakRssBytes:Math.max(...measured.map(s=>s.rss)),note:'Simultaneous bursts with independent sequences sharing one model and context; no production retrieval or network; shared CPU load and resident production bot. Throughput excludes writes between waves, loading, and warmup. Automatic rubric, not independent factual adjudication.'};
 await fs.writeFile(path.join(out,'summary.json'),JSON.stringify(summary,null,2));
}catch(e){await fs.writeFile(path.join(out,'failure.json'),JSON.stringify({error:e.stack,concurrency,memory:await memory().catch(()=>null)},null,2));throw e;}
finally{telemetry?.kill();await fs.writeFile(path.join(out,'samples.json'),JSON.stringify(samples));await context?.dispose();await model?.dispose();}
