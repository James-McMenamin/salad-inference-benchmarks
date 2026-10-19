export function makeWaves(cases,concurrency,count=32,repeat=0){
 if(!cases.length||!Number.isInteger(concurrency)||concurrency<1||!Number.isInteger(count)||count<1)throw new Error('Invalid workload');
 const jobs=Array.from({length:count},(_,i)=>({case:cases[(i+repeat)%cases.length],request:i}));
 return Array.from({length:Math.ceil(count/concurrency)},(_,i)=>jobs.slice(i*concurrency,(i+1)*concurrency));
}
export function summarizeRequests(rows,wallMs){
 if(!rows.length||rows.some(r=>!Number.isFinite(r.ms)))throw new Error('Missing request measurements');
 const sorted=key=>rows.map(r=>r[key]).filter(Number.isFinite).sort((a,b)=>a-b);
 const quantiles=key=>{const a=sorted(key);return {n:a.length,median:a.length?a[Math.floor(a.length/2)]:null,p95:a.length?a[Math.min(a.length-1,Math.ceil(a.length*.95)-1)]:null,max:a.length?a.at(-1):null};};
 return {requests:rows.length,passed:rows.filter(r=>r.grade?.pass).length,errors:rows.filter(r=>r.error).length,latencyMs:quantiles('ms'),firstAnswerTokenMs:quantiles('firstAnswerTokenMs'),wallMs,requestsPerSecond:rows.length/(wallMs/1000),answerTokensPerSecond:rows.reduce((n,r)=>n+(r.answerOutputTokens??0),0)/(wallMs/1000)};
}
