// Non-destructive Neon Auth route check. No account creation and no credentials.
const base=process.env.NEON_AUTH_PROBE_URL;
if(!base)throw new Error('NEON_AUTH_PROBE_URL is required');
const url=new URL(base);
if(url.protocol!=='https:'||url.username||url.password||url.search||url.hash)throw Error('Invalid URL');
const checks=[
 {path:'/get-session',method:'GET'},
 {path:'/sign-in/email',method:'POST',body:'{}'},
 {path:'/sign-up/email',method:'POST',body:'{}'}
];
let failed=false;
for(const c of checks){
 const endpoint=base.replace(/\/+$/,'')+c.path;
 try{
  const res=await fetch(endpoint,{method:c.method,headers:{'content-type':'application/json','origin':'https://gavhah-campaign-center.onrender.com'},
   ...(c.body?{body:c.body}:{}),redirect:'error',signal:AbortSignal.timeout(12000)});
  console.log(c.method,c.path,'HTTP',res.status);
  if(res.status===404||res.status>=500)failed=true;
 }catch(e){console.log(c.path,'UNREACHABLE',e?.message||String(e));failed=true;}
}
if(failed)process.exitCode=1;
