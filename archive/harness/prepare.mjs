import fs from 'node:fs/promises';
import {createReadStream,createWriteStream} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {pipeline} from 'node:stream/promises';
import {Readable} from 'node:stream';
import vm from 'node:vm';
const dir=path.dirname(fileURLToPath(import.meta.url)),root=path.resolve(dir,'../..'),lore=path.resolve(root,'../mnm-lore');
const out=path.join(dir,'prepared');await fs.mkdir(out,{recursive:true});
const hash=async file=>{const h=createHash('sha256');for await(const b of createReadStream(file))h.update(b);return h.digest('hex');};
const models=[
 {id:'qwen3-4b',file:path.join(lore,'data/models/llm/Qwen3-4B-Instruct-2507-Q4_K_M.gguf'),sha256:'3605803b982cb64aead44f6c1b2ae36e3acdb41d8e46c8a94c6533bc4c67e597',quant:'Q4_K_M'},
 {id:'gemma4-e2b',repo:'google/gemma-4-E2B-it-qat-q4_0-gguf',revision:'675cff42a74c774d6cb76f76d8eacb49b48c9b93',name:'gemma-4-E2B_q4_0-it.gguf',sha256:'fa401b55b07ee70a54c6dae3903c783a6e65064312529ea57175cb5f8dec6634',quant:'QAT Q4_0'},
 {id:'gemma4-e4b',repo:'google/gemma-4-E4B-it-qat-q4_0-gguf',revision:'4b4a2c1d584be7264f87aac328a1bc739ce81b6c',name:'gemma-4-E4B_q4_0-it.gguf',sha256:'676c35070db6dbe52f93e9c864ee0fba4eddea94b9c875d9cb10daff453fbaee',quant:'QAT Q4_0'}
];
for(const m of models){
 if(m.repo){m.file=path.join(out,m.name);try{await fs.access(m.file);}catch{
  console.log(`Downloading ${m.id} from pinned official revision`);
  const response=await fetch(`https://huggingface.co/${m.repo}/resolve/${m.revision}/${m.name}`,{signal:AbortSignal.timeout(1800000)});
  if(!response.ok)throw new Error(`${m.id}: HTTP ${response.status}`);
  await pipeline(Readable.fromWeb(response.body),createWriteStream(`${m.file}.partial`,{flags:'w'}));
  if(await hash(`${m.file}.partial`)!==m.sha256)throw new Error(`SHA256 mismatch: ${m.id}`);
  await fs.rename(`${m.file}.partial`,m.file);
 }}
 if(await hash(m.file)!==m.sha256)throw new Error(`SHA256 mismatch: ${m.id}`);
 m.bytes=(await fs.stat(m.file)).size;console.log(`Verified ${m.id}: ${m.bytes} bytes`);
}
const reader=await fs.readFile(path.join(root,'src/understand.js'),'utf8');
const teach=await fs.readFile(path.join(root,'src/teach.js'),'utf8');
const parse=teach.slice(teach.indexOf('export function parseJson'),teach.indexOf('/** Plain words to a draft note'));
await fs.writeFile(path.join(out,'reader.mjs'),reader.replace("import { parseJson } from './teach.js';",parse));
const oracle=await fs.readFile(path.join(lore,'src/oracle.js'),'utf8');
const prompts={};for(const name of ['SYSTEM_PROMPT','JUDGE_PROMPT']){
 const match=oracle.match(new RegExp(`export const ${name} = (\\[[\\s\\S]*?\\]\\.join\\('\\\\n'\\));`));
 if(!match)throw new Error(`Cannot extract ${name}`);
 prompts[name]=vm.runInNewContext(match[1],{NOT_FOUND:"The wiki doesn't say."});
}
await fs.writeFile(path.join(out,'prompts.json'),JSON.stringify(prompts,null,2));
const cases=JSON.parse(await fs.readFile(path.join(dir,'cases.json'),'utf8'));
const passages=(await fs.readFile(path.join(lore,'dist/mnm-corpus/passages.jsonl'),'utf8')).trim().split('\n').map(JSON.parse);
for(const c of cases.grounding)c.sources=c.pages.map(page=>{const p=passages.find(p=>p.page===page);if(!p)throw new Error(`Missing ${page}`);return p;});
await fs.writeFile(path.join(out,'cases.json'),JSON.stringify(cases,null,2));
const inputs=[path.join(out,'reader.mjs'),path.join(out,'prompts.json'),path.join(out,'cases.json'),...['worker.mjs','core.mjs','run.mjs'].map(n=>path.join(dir,n))];
const files=[];for(const file of inputs)files.push({file,sha256:await hash(file)});
const runtime=path.join(lore,'node_modules/node-llama-cpp/dist/index.js');
files.push({file:runtime,sha256:await hash(runtime)});
files.push({file:path.join(lore,'node_modules/node-llama-cpp/package.json'),sha256:await hash(path.join(lore,'node_modules/node-llama-cpp/package.json'))});
const runtimeInputs=[];
async function runtimeFiles(dir){for(const e of await fs.readdir(dir,{withFileTypes:true})){const file=path.join(dir,e.name);if(e.isDirectory())await runtimeFiles(file);else if(/\.(js|json|dll|node)$/.test(file)){const s=await fs.stat(file);runtimeInputs.push({file,size:s.size,mtimeMs:s.mtimeMs,sha256:await hash(file)});}}}
await runtimeFiles(path.join(lore,'node_modules/node-llama-cpp/dist'));
await runtimeFiles(path.join(lore,'node_modules/@node-llama-cpp/win-x64-vulkan'));
const shared=process.argv.includes('--shared-cpu');
const spec={createdAt:new Date().toISOString(),models,files,runtimeInputs,runtime,root,settings:{gpu:'vulkan',contextSize:4096,threads:shared?2:4,batchSize:512,repeats:3,temperature:0,seed:42,thoughtTokens:0,...(shared?{admission:'shared-cpu',priority:'BelowNormal',affinityMask:272629760}:{} )},method:'controlled reader, grounded answer, and judge comparison; fixed retrieved passages; not full production pipeline; one active request; automatic rubric plus manual factual review'};
const {createdAt,...identity}=spec;
spec.id=createHash('sha256').update(JSON.stringify(identity)).digest('hex');
await fs.writeFile(path.join(out,'spec.json'),JSON.stringify(spec,null,2));
console.log(`Prepared ${cases.intent.length} intent + ${cases.grounding.length} grounding + ${cases.judge.length} judge cases; three repetitions per model. Spec ${spec.id}`);
