import fs from 'node:fs/promises';
import {createReadStream,openSync,closeSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {execFile,spawn} from 'node:child_process';
import {promisify} from 'node:util';
import {setTimeout as sleep} from 'node:timers/promises';
const dir=path.dirname(fileURLToPath(import.meta.url)),exec=promisify(execFile),specFile=path.join(dir,'prepared/concurrency-spec.json');
const slot='<scratch>/work/memoracle-model-comparison.json',lockPath=slot+'.lock';
const hash=async file=>{const h=createHash('sha256');for await(const c of createReadStream(file))h.update(c);return h.digest('hex');};
async function write(state){const tmp=slot+'.tmp';await fs.writeFile(tmp,JSON.stringify(state,null,2));await fs.rename(tmp,slot);if(state.run)await fs.writeFile(path.join(state.run,'receipt.json'),JSON.stringify(state,null,2));}
if(process.argv.includes('--prepare')){
 try{await fs.access(lockPath);throw new Error('Existing model benchmark controller; do not launch a second one');}catch(e){if(e.code!=='ENOENT')throw e;}
 const base=JSON.parse(await fs.readFile(path.join(dir,'prepared/spec.json'),'utf8'));
 const paths=[path.join(dir,'concurrency.mjs'),path.join(dir,'concurrency-worker.mjs'),path.join(dir,'concurrency-core.mjs'),path.join(dir,'core.mjs'),...['reader.mjs','prompts.json','cases.json'].map(n=>path.join(dir,'prepared',n))];
 const files=[];for(const file of paths)files.push({file,sha256:await hash(file)});
 const spec={createdAt:new Date().toISOString(),model:base.models.find(m=>m.id==='gemma4-e4b'),runtime:base.runtime,runtimeInputs:base.runtimeInputs,reader:path.join(dir,'prepared/reader.mjs'),prompts:path.join(dir,'prepared/prompts.json'),cases:path.join(dir,'prepared/cases.json'),files,levels:[1,2,4,8,16],settings:{...base.settings,maxThreads:2,contextSizePerRequest:4096,sharedContext:true,requestsPerRound:32,repeats:3,telemetryMs:200,scope:'E4B concurrency; one model, independent sequences, simultaneous bursts'}};
 const {createdAt,...identity}=spec;spec.id=createHash('sha256').update(JSON.stringify(identity)).digest('hex');await fs.writeFile(specFile,JSON.stringify(spec,null,2));
 let previous=null;try{previous=JSON.parse(await fs.readFile(slot,'utf8'));}catch{}
 if(previous?.specId===spec.id){console.log(`Existing identical concurrency request: ${previous.status}`);process.exit(0);}
 if(['pending','running'].includes(previous?.status))throw new Error('Another model benchmark request is active');
 const state={scope:'memoracle model concurrency performance experiment',status:'pending',specId:spec.id,specFile,admission:'shared-cpu',quietSeconds:0,submittedAt:new Date().toISOString(),previous:previous?{specId:previous.specId,status:previous.status,run:previous.run,review:previous.review}:null};await write(state);console.log(`Prepared full concurrency comparison ${spec.id}`);
}else if(process.argv.includes('--watch')){
 let lock;try{lock=await fs.open(lockPath,'wx');}catch(e){if(e.code==='EEXIST')throw new Error('Controller already exists');throw e;}
 await lock.writeFile(String(process.pid));let state=JSON.parse(await fs.readFile(slot,'utf8'));
 try{
  const spec=JSON.parse(await fs.readFile(specFile,'utf8'));
  if(state.status!=='pending'||state.specId!==spec.id)throw new Error('No matching pending concurrency request');
  const validate=async()=>{for(const f of spec.files)if(await hash(f.file)!==f.sha256)throw new Error(`Changed experiment input ${f.file}`);for(const f of spec.runtimeInputs){const s=await fs.stat(f.file);if(s.size!==f.size||s.mtimeMs!==f.mtimeMs)throw new Error(`Changed runtime ${f.file}`);}};
  state.run=path.join(dir,'runs',`concurrency-${new Date().toISOString().replace(/[:.]/g,'-')}`);await fs.mkdir(state.run,{recursive:true});await fs.copyFile(specFile,path.join(state.run,'spec.json'));state.results=[];await write(state);
  for(const concurrency of spec.levels){
   state.waitingFor=concurrency;
   while(true){
    await validate();
    const g=(await exec('nvidia-smi',['--id=0','--query-gpu=utilization.gpu,memory.free','--format=csv,noheader,nounits'],{windowsHide:true,timeout:10000})).stdout.trim().split(',').map(Number);
    const free=Number((await exec('powershell.exe',['-NoProfile','-Command','(Get-CimInstance Win32_OperatingSystem).FreePhysicalMemory'],{windowsHide:true,timeout:15000})).stdout.trim());
    state.waitingReasons=[];if(g.some(n=>!Number.isFinite(n)))throw new Error('Invalid GPU state');if(g[0]>=20)state.waitingReasons.push('Other GPU activity >=20%');if(g[1]<8192)state.waitingReasons.push('Less than 8 GiB VRAM free');if(!free||free<16*1024*1024)state.waitingReasons.push('Less than 16 GiB RAM free');await write(state);
    if(!state.waitingReasons.length)break;await sleep(10000);
   }
   state.status='running';state.startedAt??=new Date().toISOString();await write(state);
   const out=path.join(state.run,`c${concurrency}`),log=path.join(state.run,`c${concurrency}.log`),fd=openSync(log,'a');
   const code=await new Promise((resolve,reject)=>{const child=spawn(process.execPath,[path.join(dir,'concurrency-worker.mjs'),specFile,String(concurrency),out],{windowsHide:true,cwd:path.resolve(dir,'../..'),env:{...process.env,GGML_VK_VISIBLE_DEVICES:'0'},stdio:['ignore',fd,fd]});state.workerPid=child.pid;write(state).catch(reject);child.once('error',reject);child.once('exit',resolve);});closeSync(fd);
   state.results.push({concurrency,exitCode:code,out,log});await write(state);await validate();
   // Distinct requested levels are separate experiments, never retries of a failed level.
  }
  const rows=[];for(const r of state.results){let summary=null;try{summary=JSON.parse(await fs.readFile(path.join(r.out,'summary.json'),'utf8'));}catch{}rows.push({...r,summary});}
  await fs.writeFile(path.join(state.run,'comparison.json'),JSON.stringify(rows,null,2));
  const text=['# Gemma E4B concurrency results','','Shared-load experiment on RTX 3090 Ti. Two CPU threads, BelowNormal priority, thinking disabled, 4096 tokens per request, 512-token shared batch. One model with independent sequences. Three rounds of the same 32 requests per level. Loading and warmup excluded; full production retrieval/network excluded.','','| Simultaneous requests | Completed | Median latency s | p95 latency s | Median first answer token s | Requests per second | Peak additional VRAM GiB | Peak total GPU VRAM GiB |','| --- | --- | --- | --- | --- | --- | --- | --- |'];
  for(const r of rows){const s=r.summary;if(!s){text.push(`| ${r.concurrency} | FAILED (exit ${r.exitCode}) | - | - | - | - | - | - |`);continue;}text.push(`| ${r.concurrency} | ${s.requests-s.errors}/${s.requests} | ${(s.latencyMs.median/1000).toFixed(3)} | ${(s.latencyMs.p95/1000).toFixed(3)} | ${(s.firstAnswerTokenMs.median/1000).toFixed(3)} | ${s.requestsPerSecond.toFixed(2)} | ${(s.incrementalPeakVramBytes/1024**3).toFixed(2)} | ${(s.peakDeviceVramBytes/1024**3).toFixed(2)} |`);}
  text.push('','All latency includes question reading plus answer generation. First answer token excludes the reader JSON. VRAM is dedicated NVIDIA device telemetry sampled every 200 ms and includes the resident bot and desktop; additional VRAM subtracts each worker baseline. Throughput uses sum of elapsed waves rather than summed overlapping request durations. This is a burst test with no application queue, not production capacity certification. CPU and memory-bandwidth contention remain uncontrolled; no CPU idle gate was used.','');
  await fs.writeFile(path.join(state.run,'comparison.md'),text.join('\n'));
  state.status=rows.every(r=>r.exitCode===0&&r.summary)?'completed-needs-review':'completed-with-failures';state.finishedAt=new Date().toISOString();await write(state);
 }catch(e){state.status='failed';state.error=e.stack;await write(state);process.exitCode=1;}
 finally{await lock.close();await fs.unlink(lockPath);}
}else throw new Error('Use --prepare or --watch');
