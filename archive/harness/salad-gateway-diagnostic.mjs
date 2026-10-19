import fs from 'node:fs/promises';
import path from 'node:path';
import {performance} from 'node:perf_hooks';
const base = path.resolve('experiments/model-comparison');
const source = path.join(base, 'runs/salad-api-2026-10-15T22-25-16-854Z/inputs');
const cases = JSON.parse(await fs.readFile(path.join(source, 'cases.json'))).grounding;
const prompts = JSON.parse(await fs.readFile(path.join(source, 'prompts.json')));
const run = path.join(base, 'runs', 'salad-gateway-diagnostic-' + new Date().toISOString().replace(/[:.]/g, '-'));
await fs.mkdir(run, {recursive:true});
console.log(run);
const rows=[];
for (let round=0; round<2; round++) {
  for (const kind of ['minimal','grounded']) {
    const c=cases[0];
    const messages=kind==='minimal' ? [{role:'user',content:'Reply with exactly OK.'}] : [{role:'system',content:prompts.SYSTEM_PROMPT},{role:'user',content:`Question: ${c.line}\n\nSources:\n\n${c.sources.map((s,i)=>`[${i+1}] ${s.page}\n${s.text}`).join('\n\n')}\n\nQuestion: ${c.line}`}];
    const start=performance.now(); let row;
    try {
      const response=await fetch('https://ai.salad.cloud/v1/chat/completions',{method:'POST',headers:{Authorization:'Bearer '+process.env.SALAD_AI_GATEWAY_API_KEY,'Content-Type':'application/json'},body:JSON.stringify({model:'qwen3.6-35b-a3b',messages,temperature:0,max_tokens:kind==='minimal'?16:400,stream:false,chat_template_kwargs:{enable_thinking:false},...(kind==='grounded'?{stop:['\n[']}:{})}),signal:AbortSignal.timeout(60000)});
      const text=await response.text();let body;try{body=JSON.parse(text);}catch{body=text;}
      row={round,kind,status:response.status,ms:performance.now()-start,requestId:response.headers.get('x-request-id'),body};
    } catch(e) {row={round,kind,error:e.message,ms:performance.now()-start};}
    rows.push(row);await fs.writeFile(path.join(run,'results.json'),JSON.stringify(rows,null,2));console.log(JSON.stringify({round,kind,status:row.status,error:row.error,ms:row.ms}));
    if([401,402,403].includes(row.status))process.exit(1);
  }
}
