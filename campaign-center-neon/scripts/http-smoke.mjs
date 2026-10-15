// No credentials or private user data are sent by this smoke test.
// Run only AFTER a reviewed, explicitly approved staging/manual deployment:
//   CC_BASE_URL=https://... node scripts/http-smoke.mjs
const base=process.env.CC_BASE_URL;
if(!base){console.error('CC_BASE_URL is required');process.exit(1);}
let u;
try{u=new URL(base);}catch{throw Error('Invalid CC_BASE_URL');}
if(u.protocol!=='https:'||u.username||u.password)throw Error('Smoke test requires a trusted HTTPS domain');
const check=async(path,expect,description,method='GET')=>{
 const response=await fetch(new URL(path,u),{
  method,headers:{Accept:'application/json'},
  signal:AbortSignal.timeout(15000),redirect:'error'
 });
 if(!expect.includes(response.status))throw Error(description+': HTTP '+response.status+', expected '+expect.join('/'));
 return response;
};
let failures=0;
async function run(name,fn){
 try{await fn();console.log('PASS '+name);}
 catch(e){failures++;console.error('FAIL '+name+': '+e.message);}
}
await run('Campaign API responds from HTTPS Render service',async()=>{
 const r=await check('/api/health',[200],'health');
 const j=await r.json();
 if(j.status!=='ok'||j.database!=='neon')throw Error('Neon does not report healthy');
});
await run('Neon Auth URL securely configured',async()=>{
 const r=await check('/api/config',[200],'auth config');
 const j=await r.json();
 if(!j.ready||typeof j.neonAuthUrl!=='string'||!j.neonAuthUrl.startsWith('https://'))
  throw Error('Auth or Neon configuration not ready');
});
await run('Unauthenticated organization access blocked',async()=>{
 await check('/api/me',[401,403],'unauthenticated access');
});
await run('Cross-service API cannot be used without service secret',async()=>{
 await check('/api/connect/service/campaigns?gavhahUserId=7',[401,403],'service secret boundary');
});
if(failures){console.error(failures+' release smoke checks failed');process.exitCode=1;}
else console.log('PASS: public HTTP guards; login, multi-user and MAX Connect still require separately authenticated tests.');
