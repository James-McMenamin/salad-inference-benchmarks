import fs from 'node:fs/promises';
import {createReadStream,openSync,closeSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {execFile,spawn} from 'node:child_process';
import {promisify} from 'node:util';
import {setTimeout as sleep} from 'node:timers/promises';
const exec=promisify(execFile),dir=path.dirname(fileURLToPath(import.meta.url)),specFile=path.join(dir,'prepared/spec.json');
const stateFile='<scratch>/work/memoracle-model-comparison.json',lockFile=stateFile+'.lock';
const quietScript='<workspace>/Akashic-test-feedback/scripts/validation-quiet.ps1';
const spec=JSON.parse(await fs.readFile(specFile,'utf8'));
async function save(s){const tmp=stateFile+'.tmp';await fs.mkdir(path.dirname(stateFile),{recursive:true});await fs.writeFile(tmp,JSON.stringify(s,null,2));await fs.rename(tmp,stateFile);}
async function valid(){for(const input of spec.files){const h=createHash('sha256');for await(const b of createReadStream(input.file))h.update(b);if(h.digest('hex')!==input.sha256)throw new Error(`Changed benchmark input: ${input.file}`);}for(const input of spec.runtimeInputs??[]){const s=await fs.stat(input.file);if(s.size!==input.size||s.mtimeMs!==input.mtimeMs)throw new Error(`Runtime changed: ${input.file}`);}}
async function quiet(){try{
 if(spec.settings.admission==='shared-cpu'){
  const r=await exec('powershell.exe',['-NoProfile','-Command',"$m=Get-CimInstance Win32_OperatingSystem; $c=Get-CimInstance Win32_Processor; @{freeKiB=$m.FreePhysicalMemory;cpuPercent=($c|Measure-Object LoadPercentage -Average).Average}|ConvertTo-Json -Compress"],{windowsHide:true,timeout:15000});
  const host=JSON.parse(r.stdout.trim());
  const g=await exec('nvidia-smi',['--query-gpu=utilization.gpu,memory.free','--format=csv,noheader,nounits'],{windowsHide:true,timeout:10000});
  const [util,free]=g.stdout.trim().split(',').map(Number);
  const reasons=[];if(!Number.isFinite(util)||!Number.isFinite(free))reasons.push('GPU state unavailable');
  if(util>=20)reasons.push('GPU utilization >= 20%');if(free<8192)reasons.push('Less than 8 GiB GPU memory free');
  if(!host.freeKiB||host.freeKiB<16*1024*1024)reasons.push('Less than 16 GiB system RAM free');
  return reasons;
 }
 const r=await exec('powershell.exe',['-NoProfile','-ExecutionPolicy','Bypass','-File',quietScript],{windowsHide:true,timeout:30000});
 const reasons=JSON.parse(r.stdout.trim()).reasons;
 const g=await exec('nvidia-smi',['--query-gpu=utilization.gpu','--format=csv,noheader,nounits'],{windowsHide:true,timeout:10000});
 if(g.stdout.trim().split(/\s+/).some(n=>Number(n)>=10))reasons.push('GPU utilization >= 10%');
 return reasons;
}catch(e){return [`Quiet state unavailable: ${e.message}`];}}
if(process.argv.includes('--submit')){
 await valid();let prev;try{prev=JSON.parse(await fs.readFile(stateFile,'utf8'));}catch{}
 if(prev?.specId===spec.id){console.log(`Existing benchmark ${prev.status}`);process.exit(0);}
 if(prev?.status==='running')throw new Error('A comparison is already running; preserve its evidence');
 const state={scope:'memoracle model comparison performance experiment',specId:spec.id,status:'pending',submittedAt:new Date().toISOString(),quietSeconds:spec.settings.admission==='shared-cpu'?0:60,admission:spec.settings.admission??'quiet-host',specFile,previous:prev??null};await save(state);console.log('Submitted one complete three-model comparison');
}else if(process.argv.includes('--watch')){
 let lock;try{lock=await fs.open(lockFile,'wx');}catch(e){if(e.code==='EEXIST'){console.log('Watcher already exists');process.exit(0);}throw e;}
 await lock.writeFile(String(process.pid));let state=JSON.parse(await fs.readFile(stateFile,'utf8'));
 const persist=async()=>{await save(state);if(state.run)await fs.writeFile(path.join(state.run,'receipt.json'),JSON.stringify(state,null,2));};
 try{
  if(state.specId!==spec.id||state.status!=='pending')throw new Error('Request is not pending for this spec');
  let since=null;
  for(const model of spec.models){
   while(true){await valid();const reasons=await quiet();state.waitingReasons=reasons;state.waitingFor=model.id;
    if(reasons.length)since=null;else since??=Date.now();
    await persist();if(since&&Date.now()-since>=state.quietSeconds*1000)break;await sleep(10000);
   }
   state.run??=path.join(dir,'runs',new Date().toISOString().replace(/[:.]/g,'-'));await fs.mkdir(state.run,{recursive:true});
   state.status='running';state.startedAt??=new Date().toISOString();state.results??=[];await persist();
   const out=path.join(state.run,model.id),log=path.join(state.run,model.id+'.log'),fd=openSync(log,'a');
   const code=await new Promise((resolve,reject)=>{const child=spawn(process.execPath,[path.join(dir,'worker.mjs'),specFile,model.id,out],{cwd:spec.root,windowsHide:true,env:{...process.env,GGML_VK_VISIBLE_DEVICES:'0'},stdio:['ignore',fd,fd]});state.workerPid=child.pid;persist().catch(reject);child.once('error',reject);child.once('exit',resolve);});closeSync(fd);
   state.results.push({model:model.id,exitCode:code,output:out,log});await persist();
   if(code!==0)throw new Error(`Worker failed: ${model.id}; retained logs, no automatic retry`);
   await valid();const after=await quiet();if(after.length){state.resourceObservations??=[];state.resourceObservations.push({model:model.id,reasons:after});if(spec.settings.admission!=='shared-cpu'){state.status='disturbed';state.waitingReasons=after;await persist();returnStop();}}
   since=null;
  }
  const summaries=await Promise.all(state.results.map(async r=>JSON.parse(await fs.readFile(path.join(r.output,'summary.json'),'utf8'))));
  await fs.writeFile(path.join(state.run,'comparison.json'),JSON.stringify(summaries,null,2));
  const mb=n=>(n/1024**2).toFixed(0),ms=n=>n===null?'n/a':n.toFixed(0);
  const report=['# MnMOracle model comparison results','','Status: complete automatic measurements; human accuracy review pending.','','Three repetitions of the same 46 development cases per model. Scores are rubric passes, not independently reviewed factual accuracy. All timing uses one active request; source retrieval and the full production pipeline are outside this experiment.','','| Model | Intent | Grounded answers | Game question judge | Intent median ms | Answer median ms | Answer p95 ms | Model load delta MiB | One context delta MiB | Second context delta MiB | Peak delta MiB |','| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |'];
  for(const s of summaries){const score=t=>`${s.tasks[t].passed}/${s.tasks[t].total}`;report.push(`| ${s.model.id} | ${score('intent')} | ${score('grounding')} | ${score('judge')} | ${ms(s.tasks.intent.latencyMs.median)} | ${ms(s.tasks.grounding.latencyMs.median)} | ${ms(s.tasks.grounding.latencyMs.p95)} | ${mb(s.afterModel.used-s.baseline.used)} | ${mb(s.afterContext.used-s.afterModel.used)} | ${mb(s.afterSecondContext.used-s.afterContext.used)} | ${mb(s.incrementalPeakVramBytes)} |`);}
  report.push('','Device memory includes other applications. Compare deltas alongside recorded context state sizes. Review raw answers and errors before recommending a model. Quantization differs: current Qwen Q4_K_M versus official Gemma QAT Q4_0.','');
  if(spec.settings.admission==='shared-cpu')report.push('User authorized running alongside CPU tests without CPU idle admission. Workers use BelowNormal priority and two logical CPUs. Timings are shared-load observations, not isolated maximum-performance measurements. GPU use by the live bot or desktop may also affect timings and device memory.','');
  await fs.writeFile(path.join(state.run,'comparison.md'),report.join('\n'));
  state.status='completed-needs-review';state.finishedAt=new Date().toISOString();await persist();
 }catch(e){if(state.status!=='disturbed')state.status='failed';state.error=e.stack;await persist();process.exitCode=1;}
 finally{await lock.close();await fs.unlink(lockFile);}
}else throw new Error('Use --submit or --watch');
function returnStop(){throw new Error('Host became busy during measurements; evidence is disturbed and cannot certify performance');}
